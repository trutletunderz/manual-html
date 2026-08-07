// ============================================================
// Test context — สร้าง actor ทั้ง 8 ตัวและ resource ที่ต้องใช้
//
// ADAPT: ทุกฟังก์ชันในไฟล์นี้ต้องต่อกับ internal seed API จริง
// ============================================================

import type { Actor, TestContext } from "./types"

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? ""

if (!INTERNAL_TOKEN) {
  throw new Error("INTERNAL_TOKEN ไม่ได้ตั้ง — fail-closed")
}

// unique namespace ต่อ worker (คู่มือ L2.8)
const NS = `authz-w${process.env.VITEST_WORKER_ID ?? 0}-${Date.now()}`

async function seed(path: string, body: unknown) {
  const res = await fetch(`${BASE}/api/internal/seed/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": INTERNAL_TOKEN,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`seed ${path} ล้มเหลว: HTTP ${res.status}`)
  return res.json()
}

export async function buildTestContext(): Promise<TestContext> {
  // ── ผู้ใช้หลัก (owner) ──
  const owner = await seed("user", {
    username: `${NS}-owner`, verified: true, balance: 10_000, status: "active",
  })

  // ── ผู้ใช้อื่นที่มี resource ให้ owner พยายามแตะ ──
  const other = await seed("user", {
    username: `${NS}-other`, verified: true, balance: 10_000, status: "active",
  })
  const otherTxn = await seed("transaction", { userId: other.Data.id, amount: 500 })
  const otherWd = await seed("withdrawal", {
    userId: other.Data.id, amount: 1000, status: "PENDING",
  })

  // ── actor พิเศษ ──
  const banned = await seed("user", {
    username: `${NS}-banned`, verified: true, balance: 5_000, status: "banned",
  })
  const unverified = await seed("user", {
    username: `${NS}-unverified`, verified: false, balance: 0, status: "active",
  })
  const admin = await seed("user", {
    username: `${NS}-admin`, verified: true, role: "admin", status: "active",
  })

  return {
    ownerToken: owner.Data.token,
    otherUserTxnId: otherTxn.Data.id,
    otherUserWithdrawalId: otherWd.Data.id,
    _ids: {
      owner: owner.Data.id, other: other.Data.id,
      banned: banned.Data.id, unverified: unverified.Data.id, admin: admin.Data.id,
    },
    _tokens: {
      owner: owner.Data.token,
      other: other.Data.token,
      banned: banned.Data.token,
      unverified: unverified.Data.token,
      admin: admin.Data.token,
    },
  } as TestContext
}

export async function buildTokens(ctx: TestContext): Promise<Record<Actor, string | null>> {
  const t = (ctx as any)._tokens

  // ⭐ token หมดอายุ — ต้องขอจาก seed API ที่ออก token อายุติดลบได้
  const expired = await seed("expired-token", { userId: (ctx as any)._ids.owner })

  return {
    anonymous: null,
    owner: t.owner,
    otherUser: t.other,
    expiredToken: expired.Data.token,
    // token รูปแบบผิด — ไม่ใช่ JWT
    malformedToken: "not-a-valid-token-at-all",
    bannedUser: t.banned,
    unverifiedUser: t.unverified,
    admin: t.admin,
  }
}

// ── HTTP client ที่ authz.spec ใช้ ────────────────────────
export type ApiResponse = {
  status: number
  body: unknown
  headers: Record<string, string>
}

export async function callApi(opts: {
  method: string
  path: string
  body?: unknown
  token: string | null
}): Promise<ApiResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`

  const res = await fetch(`${BASE}${opts.path}`, {
    method: opts.method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })

  let body: unknown = null
  try { body = await res.json() } catch { body = null }

  return {
    status: res.status,
    body,
    headers: Object.fromEntries(res.headers.entries()),
  }
}

/** ลบข้อมูลที่สร้างไว้ — เรียกใน afterAll (หรือปล่อยให้ sweep job ลบ) */
export async function cleanupContext() {
  await fetch(`${BASE}/api/internal/seed/cleanup?prefix=${NS}`, {
    method: "DELETE",
    headers: { "X-Internal-Token": INTERNAL_TOKEN },
  }).catch(() => {
    // cleanup ล้มเหลวไม่ควรทำให้เทสแดง — มี sweep job ตามเก็บอยู่แล้ว
    console.warn(`cleanup ${NS} ล้มเหลว — sweep job จะเก็บให้`)
  })
}
