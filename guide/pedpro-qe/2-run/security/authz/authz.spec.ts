// ============================================================
// Authz Gate — คู่มือ L3.4B
//
// GATE 1 (completeness) : ทุก endpoint ต้องมี spec — ไม่มี = CI แดง
// GATE 2 (enforcement)  : รันจริงทุก endpoint x ทุก actor
//
// ⭐ GATE 1 คือส่วนที่มีมูลค่าสูงสุด
//    มันเปลี่ยน security จาก "จำได้ก็ทำ" เป็น "ลืมไม่ได้ทางกลไก"
//    endpoint ใหม่ที่ agent เขียน จะถูกบล็อกจนกว่าจะมีคนตัดสินใจเรื่องสิทธิ์
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { AUTHZ_MATRIX } from "./matrix"
import { ALL_ACTORS, type Actor, type TestContext } from "./types"
import {
  enumerateApiRoutes,
  enumerateRuntimeRoutes,
  findHiddenRoutes,
  ROUTE_EXEMPT,
} from "./routes"
import { buildTestContext, buildTokens, callApi, cleanupContext } from "./context"

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? ""
const SKIP_RUNTIME = process.env.SKIP_RUNTIME_ROUTES === "1"

// ============================================================
// GATE 1 — Completeness  (ไม่ต้องต่อ DB รันเร็ว)
// ============================================================
describe("authz matrix completeness", () => {

  it("ทุก API route มี authz spec", () => {
    const routes = enumerateApiRoutes()
    const specced = new Set(AUTHZ_MATRIX.map((s) => s.id))
    const missing = routes.filter((r) => !specced.has(r) && !ROUTE_EXEMPT[r])

    expect(
      missing,
      `\n⭐ endpoint ที่ยังไม่มี authz spec (${missing.length} ตัว):\n` +
        missing.map((m) => `   - ${m}`).join("\n") +
        `\n\nเพิ่มใน security/authz/matrix.ts ก่อน merge\n` +
        `ถ้าจงใจไม่ต้องมี ให้ใส่ใน ROUTE_EXEMPT พร้อมเหตุผล\n`
    ).toEqual([])
  })

  it("ไม่มี spec ที่อ้างถึง route ที่ถูกลบไปแล้ว", () => {
    const routes = new Set(enumerateApiRoutes())
    const orphans = AUTHZ_MATRIX.map((s) => s.id).filter((id) => !routes.has(id))

    expect(
      orphans,
      `spec ที่ route หายไปแล้ว (spec เน่า):\n${orphans.map((o) => `   - ${o}`).join("\n")}`
    ).toEqual([])
  })

  it("ทุก spec ระบุครบทุก actor", () => {
    const incomplete: string[] = []

    for (const spec of AUTHZ_MATRIX) {
      for (const actor of ALL_ACTORS) {
        const hasRule = spec.rules[actor] !== undefined
        const hasSkip = spec.skipActors?.[actor] !== undefined
        if (!hasRule && !hasSkip) incomplete.push(`${spec.id} -> ${actor}`)
      }
    }

    expect(
      incomplete,
      `ขาด rule (ห้ามมี default — ต้องระบุทุกช่อง):\n` +
        incomplete.map((i) => `   - ${i}`).join("\n")
    ).toEqual([])
  })

  it("ทุก skipActors มีเหตุผลที่ไม่ว่าง", () => {
    const bad: string[] = []
    for (const spec of AUTHZ_MATRIX) {
      for (const [actor, reason] of Object.entries(spec.skipActors ?? {})) {
        if (!reason || String(reason).trim().length < 10)
          bad.push(`${spec.id} -> ${actor}: "${reason}"`)
      }
    }
    expect(bad, `skip ที่ไม่มีเหตุผลชัดเจน:\n${bad.join("\n")}`).toEqual([])
  })

  // ⭐ ปิด blind spot: route ที่มีอยู่จริงแต่ไม่ได้มาจากไฟล์
  it.skipIf(SKIP_RUNTIME || !INTERNAL_TOKEN)(
    "route จาก filesystem ตรงกับที่ server ลงทะเบียนจริง",
    async () => {
      const fromFs = enumerateApiRoutes()
      const fromRuntime = await enumerateRuntimeRoutes({
        baseUrl: BASE,
        token: INTERNAL_TOKEN,
      })
      const hidden = findHiddenRoutes(fromFs, fromRuntime)

      expect(
        hidden,
        `\n⭐ route ที่มีอยู่จริงแต่หลุดจาก authz gate:\n` +
          hidden.map((h) => `   - ${h}`).join("\n") +
          `\n\nพวกนี้ลงทะเบียนแบบ dynamic หรือมาจาก middleware\n` +
          `filesystem enumeration มองไม่เห็น -> ต้องเพิ่มใน matrix เอง\n`
      ).toEqual([])
    }
  )
})

// ============================================================
// GATE 2 — Enforcement  (ต้องมี environment ที่ต่อ DB ได้)
// ============================================================
describe.skipIf(!INTERNAL_TOKEN)("authz enforcement", () => {
  let ctx: TestContext
  let tokens: Record<Actor, string | null>

  beforeAll(async () => {
    ctx = await buildTestContext()
    tokens = await buildTokens(ctx)
  }, 60_000)

  afterAll(async () => {
    await cleanupContext()
  })

  for (const spec of AUTHZ_MATRIX) {
    describe(spec.id, () => {

      for (const actor of ALL_ACTORS) {
        const skipReason = spec.skipActors?.[actor]

        it.skipIf(!!skipReason)(`${actor}`, async () => {
          const rule = spec.rules[actor]

          // ⭐ ไม่มี default — ถ้าไม่มี rule ต้องพัง ไม่ใช่เดา
          if (!rule) {
            throw new Error(
              `ไม่มี rule สำหรับ ${spec.id} x ${actor}\n` +
              `(completeness gate ควรจับได้ก่อนถึงจุดนี้)`
            )
          }

          const res = await callApi({
            method: spec.method,
            path: spec.buildPath(ctx),
            body: spec.buildBody?.(ctx),
            token: tokens[actor],
          })

          const allowed = Array.isArray(rule.status) ? rule.status : [rule.status]

          expect(
            allowed,
            `${spec.id} x ${actor}\n` +
              `  ได้ ${res.status} (คาด ${allowed.join(" หรือ ")})\n` +
              `  body: ${JSON.stringify(res.body).slice(0, 300)}`
          ).toContain(res.status)

          // ⭐ response ที่ถูกปฏิเสธห้ามหลุดข้อมูล
          if (rule.mustNotLeak && res.status >= 400) {
            const text = JSON.stringify(res.body)
            for (const field of rule.mustNotLeak) {
              expect(
                text,
                `error response ของ ${spec.id} x ${actor} หลุด field "${field}"`
              ).not.toContain(`"${field}"`)
            }
          }
        })
      }

      // ⭐ enumeration check — resource ที่มี/ไม่มี ต้องตอบเหมือนกัน
      const needsEnumCheck = Object.values(spec.rules).some((r) => r.noEnumeration)

      it.skipIf(!needsEnumCheck)("ไม่รั่วข้อมูลผ่าน status code", async () => {
        const NONEXISTENT = "00000000-0000-0000-0000-000000000000"

        const existing = await callApi({
          method: spec.method,
          path: spec.buildPath(ctx),
          body: spec.buildBody?.(ctx),
          token: tokens.otherUser,
        })

        const nonExisting = await callApi({
          method: spec.method,
          path: spec.buildPath({
            ...ctx,
            otherUserTxnId: NONEXISTENT,
            otherUserWithdrawalId: NONEXISTENT,
          }),
          body: spec.buildBody?.(ctx),
          token: tokens.otherUser,
        })

        expect(
          existing.status,
          `${spec.id}\n` +
            `  resource ที่มีอยู่ตอบ ${existing.status}\n` +
            `  resource ที่ไม่มีตอบ ${nonExisting.status}\n` +
            `  -> ผู้โจมตีเดาได้ว่า resource ไหนมีอยู่จริง`
        ).toBe(nonExisting.status)
      })
    })
  }
})
