// ============================================================
// Webhook Signature Verification — คู่มือ L3.4G
//
// ⭐ webhook คือ entry point ที่ไม่มี user session ให้ตรวจ
//    ถ้าใครยิง webhook ปลอมได้ = เขาสร้างเงินในระบบคุณได้โดยตรง
//
// เทสชุดนี้ควรเป็น required gate ตั้งแต่วันแรกที่มี webhook
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { createHmac, timingSafeEqual } from "node:crypto"

// ADAPT: helper ที่ต้องต่อกับ seed API จริง
import { createUser, getBalance, getLedgerEntries, api, cleanup } from "../helpers"

const SECRET = process.env.WEBHOOK_SECRET ?? ""
// ADAPT: path ของ handler จริง (ใช้ตอน static check)
const HANDLER_PATH = process.env.WEBHOOK_HANDLER ?? "server/api/webhooks/gateway.post.ts"
const REPLAY_WINDOW_MS = 5 * 60_000

beforeAll(() => {
  if (!SECRET) throw new Error("WEBHOOK_SECRET ไม่ได้ตั้ง — fail-closed")
})
afterAll(cleanup)

/** ต้องคำนวณแบบเดียวกับ backend — แต่เขียนแยก ไม่ import จาก production */
function sign(payload: unknown): string {
  return createHmac("sha256", SECRET).update(JSON.stringify(payload)).digest("hex")
}

function basePayload(userId: string) {
  return {
    txnId: `TXN-SIG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    amount: 500,
    status: "success",
    timestamp: Date.now(),
  }
}

describe("Webhook signature verification", () => {

  it("ไม่มี signature -> ปฏิเสธ", async () => {
    const user = await createUser({ balance: 0 })
    const p = basePayload(user.id)

    const res = await api.post("/api/webhooks/gateway", p, null)

    expect(res.status, "⭐ ยิง webhook ปลอมได้ = สร้างเงินได้").toBe(401)
    expect(await getBalance(user.id), "ยอดต้องไม่เปลี่ยน").toBe(0)
  })

  it("signature ผิด -> ปฏิเสธ", async () => {
    const user = await createUser({ balance: 0 })
    const p = basePayload(user.id)

    const res = await api.post("/api/webhooks/gateway", p, null, { signature: "deadbeef" })

    expect(res.status).toBe(401)
    expect(await getBalance(user.id)).toBe(0)
  })

  it("signature ของ payload อื่น -> ปฏิเสธ", async () => {
    const user = await createUser({ balance: 0 })
    const p1 = basePayload(user.id)
    const p2 = { ...basePayload(user.id), amount: 999 }

    // ใช้ signature ที่ถูกต้องของ p1 กับ payload p2
    const res = await api.post("/api/webhooks/gateway", p2, null, { signature: sign(p1) })

    expect(res.status).toBe(401)
    expect(await getBalance(user.id)).toBe(0)
  })

  it("แก้ amount แล้วใช้ signature เดิม -> ปฏิเสธ", async () => {
    const user = await createUser({ balance: 0 })
    const p = basePayload(user.id)
    const sig = sign(p)

    const res = await api.post(
      "/api/webhooks/gateway",
      { ...p, amount: 999_999 },
      null,
      { signature: sig }
    )

    expect(res.status, "⭐ แก้จำนวนเงินได้โดย signature ยังผ่าน").toBe(401)
    expect(await getBalance(user.id)).toBe(0)
  })

  it("replay เก่าเกินหน้าต่างเวลา -> ปฏิเสธ", async () => {
    const user = await createUser({ balance: 0 })
    const old = {
      ...basePayload(user.id),
      timestamp: Date.now() - (REPLAY_WINDOW_MS + 60_000),
    }

    const res = await api.post("/api/webhooks/gateway", old, null, { signature: sign(old) })

    expect(res.status, "⭐ replay attack — จับ payload เก่ามายิงซ้ำได้").toBe(401)
    expect(await getBalance(user.id)).toBe(0)
  })

  it("signature ถูกต้องและอยู่ในหน้าต่างเวลา -> ผ่าน", async () => {
    const user = await createUser({ balance: 0 })
    const p = basePayload(user.id)

    const res = await api.post("/api/webhooks/gateway", p, null, { signature: sign(p) })

    expect(res.status, "webhook ที่ถูกต้องต้องผ่าน (ไม่งั้นเทสข้างบนไม่มีความหมาย)").toBe(200)
    expect(await getBalance(user.id)).toBe(500)
    expect(await getLedgerEntries(p.txnId)).toHaveLength(1)
  })

  it("ยิง payload เดิมซ้ำ (idempotency) -> ledger ไม่เพิ่ม", async () => {
    const user = await createUser({ balance: 0 })
    const p = basePayload(user.id)
    const sig = sign(p)

    await api.post("/api/webhooks/gateway", p, null, { signature: sig })
    await api.post("/api/webhooks/gateway", p, null, { signature: sig })
    await api.post("/api/webhooks/gateway", p, null, { signature: sig })

    expect(await getLedgerEntries(p.txnId), "⭐ webhook ซ้ำสร้าง ledger หลายแถว")
      .toHaveLength(1)
    expect(await getBalance(user.id)).toBe(500)
  })

  // ────────────────────────────────────────────────────────
  // Static check — ตรวจโค้ดตรงๆ เพราะ behavior test จับไม่ได้
  // ────────────────────────────────────────────────────────
  it("handler ใช้ timingSafeEqual ไม่ใช่ ===", () => {
    if (!existsSync(HANDLER_PATH)) {
      throw new Error(
        `ไม่พบ ${HANDLER_PATH} — ตั้ง WEBHOOK_HANDLER ให้ถูก (fail-closed)`
      )
    }

    const src = readFileSync(HANDLER_PATH, "utf8")

    expect(
      src,
      "⭐ ต้องใช้ crypto.timingSafeEqual\n" +
        "  การเทียบ signature ด้วย === รั่วข้อมูลทีละ byte ผ่าน timing\n" +
        "  ผู้โจมตีเดา signature ได้ในเวลาที่เป็นเชิงเส้นแทนที่จะเป็นเอกซ์โพเนนเชียล"
    ).toMatch(/timingSafeEqual/)

    // ⭐ ตรวจว่าไม่มีการเทียบ signature ด้วย === หลงเหลือ
    const naiveCompare = /\b(signature|sig|hmac)\b\s*[!=]==/i.test(src)
    expect(naiveCompare, `พบการเทียบ signature ด้วย === ใน ${HANDLER_PATH}`).toBe(false)
  })

  it("handler ตรวจ timestamp (กัน replay)", () => {
    const src = readFileSync(HANDLER_PATH, "utf8")
    expect(
      src,
      "handler ต้องอ้างถึง timestamp เพื่อกัน replay"
    ).toMatch(/timestamp|Date\.now\(\)/)
  })
})

// ============================================================
// เทสว่า timingSafeEqual ถูกใช้ถูกวิธี
// ⭐ timingSafeEqual throw ถ้าความยาวไม่เท่ากัน
//    ถ้าไม่ handle จะกลายเป็น 500 แทน 401 -> ยังรั่วข้อมูลผ่าน status
// ============================================================
describe("timing-safe comparison ถูกใช้ถูกวิธี", () => {
  it("signature ที่ความยาวไม่เท่ากัน -> 401 ไม่ใช่ 500", async () => {
    const user = await createUser({ balance: 0 })
    const p = basePayload(user.id)

    for (const badSig of ["a", "ab".repeat(10), "f".repeat(200)]) {
      const res = await api.post("/api/webhooks/gateway", p, null, { signature: badSig })
      expect(
        res.status,
        `signature ยาว ${badSig.length} -> ได้ ${res.status}\n` +
          "  ⭐ 500 แปลว่า timingSafeEqual throw แล้วไม่ได้ catch\n" +
          "     ผู้โจมตีแยกได้ว่า signature ยาวถูกหรือผิดจาก status code"
      ).toBe(401)
    }
  })
})
