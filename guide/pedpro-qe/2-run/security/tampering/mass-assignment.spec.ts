// ============================================================
// Mass Assignment & Parameter Tampering — คู่มือ L3.4D
//
// ⭐ actor ที่อันตรายที่สุดคือ "ผู้ใช้ที่ลงทะเบียนแล้ว"
//    เขามี token ที่ถูกต้อง เห็นทุก API call ผ่าน DevTools
//    และมีแรงจูงใจทางการเงินโดยตรง
//
//    เทสชุดนี้คือ authenticated user พยายามทำสิ่งที่ไม่ควรทำ
// ============================================================

import { describe, it, expect, afterAll } from "vitest"
import {
  api, createUser, getBalance, getUserRaw, getLatestAuditLog, cleanup,
} from "../helpers"

afterAll(cleanup)

// field ที่ client ไม่ควรกำหนดได้เด็ดขาด
const PRIVILEGED_FIELDS: Record<string, unknown> = {
  balance: 999_999,
  isVerified: true,
  verified: true,
  role: "admin",
  status: "active",
  DoAdmin: 1,                 // ⭐ สำคัญที่สุดสำหรับสแตกนี้
  createdAt: "2000-01-01T00:00:00Z",
  bonusUsedThisMonth: false,
  vipLevel: 99,
  kycStatus: "approved",
  id: "00000000-0000-0000-0000-000000000001",
  userId: "someone-else",
}

describe("Mass assignment protection", () => {

  it.each(Object.entries(PRIVILEGED_FIELDS))(
    "PUT /api/profile ไม่ยอมให้ client กำหนด %s",
    async (field, value) => {
      const user = await createUser({
        balance: 100, verified: false, role: "user", status: "active",
      })
      const before = await getUserRaw(user.id)

      const res = await api.put(
        "/api/profile",
        { displayName: "ชื่อใหม่", [field]: value },
        user.token
      )

      // request อาจสำเร็จหรือถูกปฏิเสธก็ได้ — แต่ field ต้องไม่เปลี่ยน
      const after = await getUserRaw(user.id)

      if (res.body?.Result === 1) {
        expect(after.displayName, "field ที่อนุญาตต้องอัปเดตได้").toBe("ชื่อใหม่")
      }

      expect(
        after[field],
        `⭐ client แก้ "${field}" ได้!\n` +
          `  ก่อน: ${JSON.stringify(before[field])}\n` +
          `  หลัง: ${JSON.stringify(after[field])}\n` +
          `  -> backend รับ field จาก body ตรงๆ ต้องใช้ allowlist`
      ).toEqual(before[field])
    }
  )

  // ────────────────────────────────────────────────────────
  // DoAdmin / DoIp — เฉพาะสแตกนี้
  // ────────────────────────────────────────────────────────
  it("⭐ backend ไม่เชื่อ DoAdmin จาก client", async () => {
    const user = await createUser({ role: "user", balance: 1000, verified: true })

    await api.post(
      "/api/deposit",
      { amount: 500, DoAdmin: 1, DoIp: "1.2.3.4" },
      user.token
    )

    const log = await getLatestAuditLog(user.id)

    expect(
      log.DoAdmin,
      "backend เชื่อ DoAdmin จาก client -> privilege escalation ผ่าน audit log"
    ).toBe(0)

    expect(
      log.DoIp,
      "DoIp ต้องมาจาก header/socket ไม่ใช่ body — ไม่งั้นปลอม IP ใน audit trail ได้"
    ).not.toBe("1.2.3.4")

    expect(log.DoIp, "DoIp ต้องไม่ว่าง").toBeTruthy()
  })

  // ────────────────────────────────────────────────────────
  // Parameter tampering — ค่าที่ไม่ควรรับ
  // ────────────────────────────────────────────────────────
  it("จำนวนเงินติดลบไม่เพิ่มยอด", async () => {
    const user = await createUser({ balance: 1000, verified: true })

    const res = await api.post(
      "/api/withdraw",
      { amount: -500, DoAdmin: 0, DoIp: "10.0.0.1" },
      user.token
    )

    expect(res.body?.Result, "ถอนติดลบต้องถูกปฏิเสธ").toBe(0)
    expect(await getBalance(user.id), "ยอดต้องไม่เปลี่ยน").toBe(1000)
  })

  it("จำนวนเงินเกิน MAX_SAFE_INTEGER ไม่ทำให้ระบบพัง", async () => {
    const user = await createUser({ balance: 1000, verified: true })

    const res = await api.post(
      "/api/deposit",
      { amount: Number.MAX_SAFE_INTEGER + 1, DoAdmin: 0, DoIp: "10.0.0.1" },
      user.token
    )

    expect(res.status, "ต้องไม่ 5xx").toBeLessThan(500)
    expect(res.body?.Result).toBe(0)
    expect(await getBalance(user.id)).toBe(1000)
  })

  it("ราคา/อัตราโบนัสที่ส่งจาก client ถูกเมิน", async () => {
    const user = await createUser({ balance: 0, verified: true })

    await api.post(
      "/api/deposit",
      {
        amount: 100,
        bonusRate: 10.0,          // 1000%
        bonusAmount: 999_999,
        discount: 0,
        DoAdmin: 0,
        DoIp: "10.0.0.1",
      },
      user.token
    )

    const balance = await getBalance(user.id)
    expect(
      balance,
      `client กำหนดโบนัสเองได้ — ได้ยอด ${balance} จากฝาก 100`
    ).toBeLessThanOrEqual(100 * 1.1)   // ADAPT: อัตราโบนัสสูงสุดตามจริง
  })

  it("array/object ซ้อนก็ต้องถูกกรอง", async () => {
    const user = await createUser({ balance: 100, role: "user" })

    await api.put(
      "/api/profile",
      {
        displayName: "x",
        meta: { balance: 999_999, role: "admin" },
        profile: { nested: { balance: 999_999 } },
      },
      user.token
    )

    const after = await getUserRaw(user.id)
    expect(await getBalance(user.id)).toBe(100)
    expect(after.role).toBe("user")
  })

  it("⭐ prototype pollution ผ่าน __proto__ / constructor", async () => {
    const user = await createUser({ balance: 100, role: "user" })

    // ส่งเป็น raw string เพราะ JSON.stringify จะกิน __proto__ ทิ้ง
    const raw = JSON.stringify({ displayName: "x" }).replace(
      "}",
      ',"__proto__":{"role":"admin"},"constructor":{"prototype":{"role":"admin"}}}'
    )

    const res = await fetch(`${process.env.BASE_URL}/api/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.token}`,
      },
      body: raw,
    })

    expect(res.status, "ต้องไม่ 5xx").toBeLessThan(500)

    const after = await getUserRaw(user.id)
    expect(after.role, "⭐ prototype pollution สำเร็จ").toBe("user")
    expect(({} as any).role, "global prototype ถูกแก้").toBeUndefined()
  })
})

// ============================================================
// ID tampering — เปลี่ยน id ใน body ให้ชี้ไปหาคนอื่น
// ============================================================
describe("ID tampering", () => {
  it("ส่ง userId ของคนอื่นใน body ไม่มีผล", async () => {
    const victim = await createUser({ balance: 5000, verified: true })
    const attacker = await createUser({ balance: 0, verified: true })

    await api.post(
      "/api/withdraw",
      { amount: 1000, userId: victim.id, DoAdmin: 0, DoIp: "10.0.0.1" },
      attacker.token
    )

    expect(
      await getBalance(victim.id),
      "⭐ ถอนเงินจากบัญชีคนอื่นได้โดยใส่ userId ใน body"
    ).toBe(5000)
  })

  it("ส่ง accountId ของคนอื่นตอนอัปเดตบัญชีธนาคารไม่มีผล", async () => {
    const victim = await createUser({ verified: true })
    const attacker = await createUser({ verified: true })

    const before = await getUserRaw(victim.id)

    await api.put(
      "/api/bank-account",
      { userId: victim.id, accountNumber: "9999999999", bankCode: "XXX" },
      attacker.token
    )

    const after = await getUserRaw(victim.id)
    expect(after.bankAccountNumber, "⭐ แก้บัญชีธนาคารของคนอื่นได้").toEqual(
      before.bankAccountNumber
    )
  })
})
