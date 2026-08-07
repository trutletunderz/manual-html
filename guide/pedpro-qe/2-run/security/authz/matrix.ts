// ============================================================
// Authz Matrix — คู่มือ L3.4B
//
// ⭐ กฎเดียวที่ห้ามละเมิด: ทุก endpoint ต้องระบุครบทุก actor
//    ไม่มี default · ไม่มี fallback · ถ้าไม่รู้ให้ถามก่อน merge
//
// วิธีเติม: รัน `pnpm vitest run security/authz -t completeness`
//           มันจะบอกว่าขาด endpoint ไหนบ้าง แล้วเติมทีละตัว
// ============================================================

import type { EndpointSpec } from "./types"
import { DENY, NOT_FOUND_OR_DENY, OK, UNAUTHORIZED } from "./types"

export const AUTHZ_MATRIX: EndpointSpec[] = [

  // ────────────────────────────────────────────────────────
  // อ่านข้อมูลของคนอื่น -> ต้องถูกปฏิเสธและไม่รั่วว่ามีอยู่จริง
  // ────────────────────────────────────────────────────────
  {
    id: "GET /api/transactions/:id",
    method: "GET",
    buildPath: (c) => `/api/transactions/${c.otherUserTxnId}`,
    rules: {
      anonymous: UNAUTHORIZED,
      // ⭐ owner ขอ txn ของคนอื่น = ต้องถูกปฏิเสธ (IDOR)
      owner: NOT_FOUND_OR_DENY,
      otherUser: NOT_FOUND_OR_DENY,
      expiredToken: UNAUTHORIZED,
      malformedToken: UNAUTHORIZED,
      bannedUser: DENY,
      unverifiedUser: NOT_FOUND_OR_DENY,
      admin: OK,
    },
  },

  {
    id: "POST /api/withdrawals/:id/cancel",
    method: "POST",
    buildPath: (c) => `/api/withdrawals/${c.otherUserWithdrawalId}/cancel`,
    rules: {
      anonymous: UNAUTHORIZED,
      owner: NOT_FOUND_OR_DENY,
      otherUser: NOT_FOUND_OR_DENY,
      expiredToken: UNAUTHORIZED,
      malformedToken: UNAUTHORIZED,
      bannedUser: DENY,
      unverifiedUser: NOT_FOUND_OR_DENY,
      admin: OK,
    },
  },

  // ────────────────────────────────────────────────────────
  // การกระทำกับบัญชีตัวเอง -> ทุกคนทำได้ ยกเว้นบัญชีที่ถูกระงับ
  // ────────────────────────────────────────────────────────
  {
    id: "POST /api/deposit",
    method: "POST",
    buildPath: () => "/api/deposit",
    buildBody: () => ({ amount: 500, DoAdmin: 0, DoIp: "10.0.0.1" }),
    rules: {
      anonymous: UNAUTHORIZED,
      owner: OK,
      otherUser: OK,                    // ฝากเงินตัวเองได้ทุกคน
      expiredToken: UNAUTHORIZED,
      malformedToken: UNAUTHORIZED,
      bannedUser: DENY,                 // ⭐ บัญชีถูกระงับต้องฝากไม่ได้
      unverifiedUser: OK,               // ADAPT: ตาม spec จริง
      admin: OK,
    },
  },

  {
    id: "POST /api/withdraw",
    method: "POST",
    buildPath: () => "/api/withdraw",
    buildBody: () => ({ amount: 100, DoAdmin: 0, DoIp: "10.0.0.1" }),
    rules: {
      anonymous: UNAUTHORIZED,
      owner: OK,
      otherUser: OK,
      expiredToken: UNAUTHORIZED,
      malformedToken: UNAUTHORIZED,
      bannedUser: DENY,
      // ⭐ ถอนเงินต้อง verify แล้วเท่านั้น (ต่างจากฝาก)
      unverifiedUser: DENY,
      admin: OK,
    },
  },

  // ────────────────────────────────────────────────────────
  // admin เท่านั้น
  // ────────────────────────────────────────────────────────
  {
    id: "GET /api/admin/users",
    method: "GET",
    buildPath: () => "/api/admin/users",
    rules: {
      anonymous: UNAUTHORIZED,
      owner: DENY,
      otherUser: DENY,
      expiredToken: UNAUTHORIZED,
      malformedToken: UNAUTHORIZED,
      bannedUser: DENY,
      unverifiedUser: DENY,
      admin: OK,
    },
  },

  {
    id: "POST /api/admin/withdrawals/:id/approve",
    method: "POST",
    buildPath: (c) => `/api/admin/withdrawals/${c.otherUserWithdrawalId}/approve`,
    rules: {
      anonymous: UNAUTHORIZED,
      owner: DENY,
      otherUser: DENY,
      expiredToken: UNAUTHORIZED,
      malformedToken: UNAUTHORIZED,
      bannedUser: DENY,
      unverifiedUser: DENY,
      admin: OK,
    },
  },

  // ────────────────────────────────────────────────────────
  // webhook — ไม่มี user session เลย ต้องพึ่ง signature
  // ────────────────────────────────────────────────────────
  {
    id: "POST /api/webhooks/gateway",
    method: "POST",
    buildPath: () => "/api/webhooks/gateway",
    buildBody: () => ({ txnId: "TXN-AUTHZ-TEST", amount: 500, status: "success" }),
    rules: {
      // ⭐ ทุก actor ต้องถูกปฏิเสธเท่ากันหมด เพราะไม่มี signature
      //    (การทดสอบ signature ที่ถูกต้องอยู่ที่ security/webhook/)
      anonymous: UNAUTHORIZED,
      owner: UNAUTHORIZED,
      otherUser: UNAUTHORIZED,
      expiredToken: UNAUTHORIZED,
      malformedToken: UNAUTHORIZED,
      bannedUser: UNAUTHORIZED,
      unverifiedUser: UNAUTHORIZED,
      admin: UNAUTHORIZED,
    },
    skipActors: {},
  },

  // ADAPT: เติม endpoint ที่เหลือจนกว่า completeness gate จะเขียว
]
