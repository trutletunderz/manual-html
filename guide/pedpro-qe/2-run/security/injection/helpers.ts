// ============================================================
// Playwright helper สำหรับ XSS suite
//
// ⭐ แยกจาก security/helpers.ts เพราะตัวนั้นใช้ fetch
//    ส่วนตัวนี้ต้องทำงานกับ browser context ของ Playwright
//
// ADAPT: ทุกฟังก์ชันต้องต่อกับ API จริง
// ============================================================

import type { Page } from "@playwright/test"
import { api, createUser, type SeedUser } from "../helpers"

let testUser: SeedUser | null = null

/** สร้าง user สำหรับ XSS test ครั้งเดียวแล้วใช้ซ้ำ */
async function ensureUser(): Promise<SeedUser> {
  if (!testUser) testUser = await createUser({ verified: true, balance: 1000 })
  return testUser
}

/** login โดยยัด token เข้า storage ตรงๆ — เร็วกว่าเดิน UI */
export async function loginAsTestUser(page: Page) {
  const user = await ensureUser()
  await page.addInitScript((token: string) => {
    // ADAPT: key ที่ frontend ใช้เก็บ token
    localStorage.setItem("auth_token", token)
  }, user.token)
}

// ── setter: ตั้งค่าผ่าน API แล้วไปโผล่ที่หน้าเว็บ ──────────

export async function setDisplayName(value: string) {
  const u = await ensureUser()
  await api.put("/api/profile", { displayName: value }, u.token)
}

export async function setWithdrawNote(value: string) {
  const u = await ensureUser()
  await api.post("/api/withdraw/draft", { note: value }, u.token)
}

export async function setBankAccountName(value: string) {
  const u = await ensureUser()
  await api.put("/api/bank-account", { accountName: value }, u.token)
}

export async function setSupportMessage(value: string) {
  const u = await ensureUser()
  await api.post("/api/support/message", { message: value }, u.token)
}

export async function setProfileWebsite(value: string) {
  const u = await ensureUser()
  await api.put("/api/profile", { website: value }, u.token)
}
