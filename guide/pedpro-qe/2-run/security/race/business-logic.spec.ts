// ============================================================
// Business Logic Race Conditions — คู่มือ L3.4C
//
// ⭐ ถ้าเทสชุดนี้แดงแม้ตัวเดียว หยุดทุกอย่างแล้วแก้ก่อน
//    นี่คือช่องโหว่ที่แปลงเป็นเงินได้โดยตรง
//    และผู้ใช้ที่ค้นพบจะไม่แจ้งคุณ เขาจะใช้มัน
//
// ⚠️  หมายเหตุเชิงเทคนิคที่สำคัญที่สุด:
//    ถ้าเทสผ่านบน single instance แต่ production รัน Cloud Run หลาย instance
//    -> ต้องเทสบน environment ที่มีหลาย instance จริง
//    เพราะ lock ระดับ process ไม่พอ ต้องเป็น DB-level lock
//    (SELECT ... FOR UPDATE) หรือ optimistic locking
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  raceTest,
  expectExactlyOneSuccess,
  expectIdempotent,
  installRaceDispatcher,
} from "./harness"

// ADAPT: helper เหล่านี้ต้องต่อกับ seed API และ DB จริง
import {
  createUser, createUsers, createWithdrawal, createPromoCode,
  getBalance, getLedgerSum, getLedgerEntries, getWithdrawal,
  countUsersByPhone, adminTokens, api, sign, cleanup,
} from "../helpers"

const CONCURRENCY = Number(process.env.RACE_CONCURRENCY ?? 10)
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? ""

beforeAll(() => {
  if (!INTERNAL_TOKEN) throw new Error("INTERNAL_TOKEN ไม่ได้ตั้ง — fail-closed")
  installRaceDispatcher()
})

afterAll(cleanup)

describe("Business logic race conditions", () => {

  // ────────────────────────────────────────────────────────
  // 1. ถอนเงินพร้อมกัน — เคสคลาสสิกที่สุด
  // ────────────────────────────────────────────────────────
  it("ถอนเงินพร้อมกันด้วยยอด = balance -> สำเร็จครั้งเดียว", async () => {
    const user = await createUser({ balance: 1000, verified: true })

    const r = await expectExactlyOneSuccess({
      what: "ถอนเงินพร้อมกัน",
      concurrency: CONCURRENCY,
      prewarm: () => api.get("/api/health", user.token),
      action: () =>
        api.post("/api/withdraw", { amount: 1000, DoAdmin: 0, DoIp: "10.0.0.1" }, user.token),
      isSuccess: (res: any) => res.body?.Result === 1,
    })

    // ⭐ invariant ต้องยังจริงหลังจบ (L1.11 MR6)
    expect(await getBalance(user.id), "ยอดคงเหลือหลังถอน").toBe(0)
    expect(await getLedgerSum(user.id), "ledger ต้องตรงกับ balance").toBe(0)

    // เก็บไว้ดูว่าการทดสอบ valid แค่ไหน
    console.log(`  dispatch spread = ${r.dispatchSpreadMs.toFixed(1)}ms`)
  }, 60_000)

  // ────────────────────────────────────────────────────────
  // 2. รับโบนัสพร้อมกัน
  // ────────────────────────────────────────────────────────
  it("รับโบนัสพร้อมกัน -> ได้ครั้งเดียว", async () => {
    const user = await createUser({
      balance: 5000, verified: true, bonusUsedThisMonth: false,
    })

    await expectExactlyOneSuccess({
      what: "รับโบนัสพร้อมกัน",
      concurrency: CONCURRENCY,
      prewarm: () => api.get("/api/health", user.token),
      action: () => api.post("/api/promotions/claim", { code: "FIRST10" }, user.token),
      isSuccess: (res: any) => res.body?.Result === 1,
    })

    expect(await getLedgerSum(user.id)).toBe(await getBalance(user.id))
  }, 60_000)

  // ────────────────────────────────────────────────────────
  // 3. webhook ซ้ำ — เคสที่เคยทำให้เกิด incident จริง
  //    (คู่มือ: postmortem 2026-07-25-double-payout)
  // ────────────────────────────────────────────────────────
  it("webhook เงินเข้าตัวเดียวกันมาพร้อมกัน -> ledger 1 แถว", async () => {
    const user = await createUser({ balance: 0, verified: true })
    const payload = {
      txnId: `TXN-RACE-${Date.now()}`,
      userId: user.id,
      amount: 500,
      status: "success",
      timestamp: Date.now(),
    }

    await expectIdempotent({
      what: "webhook เงินเข้า",
      concurrency: CONCURRENCY,
      prewarm: () => api.get("/api/health", null),
      action: () =>
        api.post("/api/webhooks/gateway", payload, null, { signature: sign(payload) }),
      isSuccess: (res: any) => res.status === 200,
      countEffects: async () => (await getLedgerEntries(payload.txnId)).length,
    })

    expect(await getBalance(user.id), "ยอดต้องเพิ่มครั้งเดียว").toBe(500)
  }, 60_000)

  // ────────────────────────────────────────────────────────
  // 4. admin สองคนอนุมัติพร้อมกัน
  // ────────────────────────────────────────────────────────
  it("admin หลายคนอนุมัติคำขอถอนเดียวกันพร้อมกัน -> จ่ายครั้งเดียว", async () => {
    const wd = await createWithdrawal({ amount: 2000, status: "REVIEWING" })

    await expectExactlyOneSuccess({
      what: "admin approve พร้อมกัน",
      concurrency: 5,
      prewarm: (i) => api.get("/api/health", adminTokens[i % adminTokens.length]),
      action: (i) =>
        api.post(
          `/api/admin/withdrawals/${wd.id}/approve`,
          {},
          adminTokens[i % adminTokens.length]
        ),
      isSuccess: (res: any) => res.body?.Result === 1,
    })

    expect((await getWithdrawal(wd.id)).status).toBe("APPROVED")
    // ⭐ ต้องมี ledger entry เดียว ไม่ใช่ 5
    expect((await getLedgerEntries(wd.id)).length).toBe(1)
  }, 60_000)

  // ────────────────────────────────────────────────────────
  // 5. สมัครสมาชิกเบอร์เดียวกันพร้อมกัน
  // ────────────────────────────────────────────────────────
  it("สมัครสมาชิกด้วยเบอร์เดียวกันพร้อมกัน -> บัญชีเดียว", async () => {
    const phone = `08${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`

    await expectExactlyOneSuccess({
      what: "สมัครสมาชิกเบอร์ซ้ำ",
      concurrency: CONCURRENCY,
      prewarm: () => api.get("/api/health", null),
      action: () => api.post("/api/register", { phone, otp: "000000" }, null),
      isSuccess: (res: any) => res.body?.Result === 1,
    })

    expect(await countUsersByPhone(phone), "ต้องมีบัญชีเดียว").toBe(1)
  }, 60_000)

  // ────────────────────────────────────────────────────────
  // 6. โค้ดโปรที่จำกัดสิทธิ์ — ยิงเกินจำนวนสิทธิ์ 2 เท่า
  // ────────────────────────────────────────────────────────
  it("โค้ดโปรจำกัด 100 สิทธิ์ -> ไม่เกิน 100 แม้ยิงพร้อมกัน 200", async () => {
    const LIMIT = 100
    const ATTEMPTS = 200

    const code = await createPromoCode({ limit: LIMIT })
    const users = await createUsers(ATTEMPTS)

    const r = await raceTest({
      concurrency: ATTEMPTS,
      maxSpreadMs: 50,      // ⭐ ผ่อนเกณฑ์เพราะ concurrency สูงมาก
      prewarm: (i) => api.get("/api/health", users[i].token),
      action: (i) =>
        api.post("/api/promotions/redeem", { code: code.code }, users[i].token),
      isSuccess: (res: any) => res.body?.Result === 1,
    })

    expect(
      r.successes.length,
      `แจกไป ${r.successes.length} สิทธิ์ จากที่มี ${LIMIT} ` +
      `(spread ${r.dispatchSpreadMs.toFixed(1)}ms)`
    ).toBeLessThanOrEqual(LIMIT)

    // ⭐ ต้องไม่แจกน้อยเกินไปด้วย — over-locking ก็เป็นบั๊ก
    expect(
      r.successes.length,
      `แจกได้แค่ ${r.successes.length} จาก ${LIMIT} — lock แรงเกินไป`
    ).toBeGreaterThan(LIMIT * 0.8)
  }, 120_000)
})

// ============================================================
// เทสว่า harness เองทำงานถูก (meta-test)
//
// ⭐ gate ที่ไม่เคยถูกทดสอบ = ไม่รู้ว่าเป็น gate หรือของประดับ
//    harness ก็เหมือนกัน
// ============================================================
describe("harness self-check", () => {
  it("throw เมื่อ dispatch spread เกินเกณฑ์ (ไม่มี prewarm)", async () => {
    await expect(
      raceTest({
        concurrency: 20,
        maxSpreadMs: 0.0001,          // ตั้งต่ำมากเพื่อบังคับให้ throw
        prewarm: undefined,
        action: async () => ({ ok: true }),
        isSuccess: () => true,
      })
    ).rejects.toThrow(/ไม่ valid/)
  })

  it("นับ success ถูกต้องเมื่อสำเร็จบางส่วน", async () => {
    let n = 0
    const r = await raceTest({
      concurrency: 10,
      action: async () => ({ ok: n++ < 3 }),
      isSuccess: (x: { ok: boolean }) => x.ok,
    })
    expect(r.successes.length).toBe(3)
  })
})
