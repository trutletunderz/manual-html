// ============================================================
// Shared test helpers — ใช้ร่วมกันทุก spec ใน security/
//
// ADAPT: ทุกฟังก์ชันต้องต่อกับ internal seed API จริง
//        ถ้ายังไม่มี ให้สร้าง server/api/internal/seed/* ก่อน
//
// ⭐ หลักการที่ฝังอยู่:
//    1. unique namespace ต่อ worker -> รันขนานได้ (L2.8)
//    2. fail-closed -> ไม่มี token = throw ไม่ใช่ข้ามเทส
//    3. helper ห้ามกลืน error -> ระบบพังต้องทำให้เทสแดง (L5.2)
// ============================================================

import { Agent, setGlobalDispatcher } from "undici"
import { createHmac } from "node:crypto"

// ── config ───────────────────────────────────────────────
export const BASE = process.env.BASE_URL ?? "http://localhost:3000"
export const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? ""
export const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? ""

if (!INTERNAL_TOKEN) {
  throw new Error(
    "INTERNAL_TOKEN ไม่ได้ตั้ง — fail-closed\n" +
    "  เทส security ทั้งหมดต้องใช้ seed API"
  )
}

/** unique ต่อ worker กันชนกันตอนรันขนาน */
export const NS = `sec-w${process.env.VITEST_WORKER_ID ?? 0}-${Date.now().toString(36)}`

// keep-alive agent — จำเป็นสำหรับ race test (L3.4C)
setGlobalDispatcher(new Agent({ connections: 64, pipelining: 0, keepAliveTimeout: 60_000 }))

// ============================================================
// HTTP client
// ============================================================

export type ApiResponse<T = any> = {
  status: number
  body: T
  headers: Record<string, string>
}

async function request<T = any>(
  method: string,
  path: string,
  body?: unknown,
  token?: string | null,
  extra?: { signature?: string; headers?: Record<string, string> }
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extra?.headers ?? {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (extra?.signature) headers["X-Signature"] = extra.signature

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  let parsed: any = null
  try {
    parsed = await res.json()
  } catch {
    parsed = null   // response ที่ไม่ใช่ JSON — ปล่อยให้เทสตัดสินเอง
  }

  return {
    status: res.status,
    body: parsed,
    headers: Object.fromEntries(res.headers.entries()),
  }
}

export const api = {
  get: <T = any>(p: string, token?: string | null, e?: any) =>
    request<T>("GET", p, undefined, token, e),
  post: <T = any>(p: string, b?: unknown, token?: string | null, e?: any) =>
    request<T>("POST", p, b, token, e),
  put: <T = any>(p: string, b?: unknown, token?: string | null, e?: any) =>
    request<T>("PUT", p, b, token, e),
  patch: <T = any>(p: string, b?: unknown, token?: string | null, e?: any) =>
    request<T>("PATCH", p, b, token, e),
  delete: <T = any>(p: string, token?: string | null, e?: any) =>
    request<T>("DELETE", p, undefined, token, e),
}

// ============================================================
// Seed API — สร้างข้อมูลสำหรับเทส
// ============================================================

async function seed<T = any>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api/internal/seed/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": INTERNAL_TOKEN,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    // ⭐ ห้ามกลืน — seed พังต้องทำให้เทสแดงทันที
    const text = await res.text().catch(() => "")
    throw new Error(`seed ${path} ล้มเหลว: HTTP ${res.status}\n${text.slice(0, 300)}`)
  }

  const json = await res.json()
  return json.Data ?? json
}

export type SeedUser = {
  id: string
  token: string
  phone: string
  balance: number
}

export async function createUser(opts: {
  balance?: number
  verified?: boolean
  status?: "active" | "banned" | "suspended"
  role?: "user" | "admin"
  isVerified?: boolean
  bonusUsedThisMonth?: boolean
  idCard?: string
  phone?: string
  vipLevel?: number
} = {}): Promise<SeedUser> {
  return seed<SeedUser>("user", {
    username: `${NS}-u${Math.random().toString(36).slice(2, 8)}`,
    balance: opts.balance ?? 0,
    verified: opts.verified ?? opts.isVerified ?? true,
    status: opts.status ?? "active",
    role: opts.role ?? "user",
    ...opts,
  })
}

export async function createUsers(n: number): Promise<SeedUser[]> {
  // batch เพื่อไม่ให้ยิงทีละคน n ครั้ง
  return seed<SeedUser[]>("users", {
    count: n,
    prefix: NS,
    balance: 1000,
    verified: true,
  })
}

export async function createWithdrawal(opts: {
  amount: number
  status?: string
  userId?: string
}) {
  return seed<{ id: string; userId: string; status: string }>("withdrawal", {
    prefix: NS,
    ...opts,
  })
}

export async function createPromoCode(opts: { limit: number; code?: string }) {
  return seed<{ code: string; limit: number }>("promo-code", {
    code: opts.code ?? `${NS}-PROMO`.toUpperCase(),
    limit: opts.limit,
  })
}

// ============================================================
// Query — อ่านสถานะจริงจาก DB ผ่าน internal API
// ============================================================

async function query<T = any>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api/internal/${path}`, {
    headers: { "X-Internal-Token": INTERNAL_TOKEN },
  })
  if (!res.ok) throw new Error(`query ${path} ล้มเหลว: HTTP ${res.status}`)
  const json = await res.json()
  return json.Data ?? json
}

export const getBalance = (userId: string) =>
  query<number>(`accounting/${userId}/balance`)

export const getLedgerSum = (userId: string) =>
  query<number>(`accounting/${userId}/ledger-sum`)

export const getLedgerEntries = (refId: string) =>
  query<Array<{ id: string; amount: number }>>(`ledger?refId=${encodeURIComponent(refId)}`)

export const getWithdrawal = (id: string) =>
  query<{ id: string; status: string; amount: number }>(`withdrawals/${id}`)

export const countUsersByPhone = (phone: string) =>
  query<number>(`users/count?phone=${encodeURIComponent(phone)}`)

export const getUserRaw = (userId: string) =>
  query<Record<string, unknown>>(`users/${userId}/raw`)

export const getLatestAuditLog = (userId: string) =>
  query<{ DoAdmin: number; DoIp: string; action: string; traceId: string }>(
    `audit/${userId}/latest`
  )

export const getAuditCount = (runId: string) =>
  query<number>(`audit/count?runId=${encodeURIComponent(runId)}`)

// ============================================================
// Admin tokens — ใช้ในเทส race ของ approve
// ============================================================

let _adminTokens: string[] | null = null

export async function getAdminTokens(n = 3): Promise<string[]> {
  if (_adminTokens) return _adminTokens
  const admins = await Promise.all(
    Array.from({ length: n }, () => createUser({ role: "admin", verified: true }))
  )
  _adminTokens = admins.map((a) => a.token)
  return _adminTokens
}

/** proxy ที่ resolve ตอนใช้จริง — ให้ spec เขียน adminTokens[i] ได้เลย */
export const adminTokens: string[] = new Proxy([] as string[], {
  get(_t, prop) {
    if (!_adminTokens) {
      throw new Error(
        "adminTokens ยังไม่ถูก init — เรียก await getAdminTokens() ใน beforeAll ก่อน"
      )
    }
    return (_adminTokens as any)[prop]
  },
})

// ============================================================
// Webhook signing — เขียนแยกจาก production โดยตั้งใจ
// ============================================================

export function sign(payload: unknown): string {
  if (!WEBHOOK_SECRET) throw new Error("WEBHOOK_SECRET ไม่ได้ตั้ง")
  return createHmac("sha256", WEBHOOK_SECRET).update(JSON.stringify(payload)).digest("hex")
}

// ============================================================
// Cleanup
// ============================================================

export async function cleanup() {
  const res = await fetch(
    `${BASE}/api/internal/seed/cleanup?prefix=${encodeURIComponent(NS)}`,
    { method: "DELETE", headers: { "X-Internal-Token": INTERNAL_TOKEN } }
  ).catch(() => null)

  if (!res?.ok) {
    // cleanup ล้มเหลวไม่ควรทำให้เทสแดง — sweep job ตามเก็บอยู่แล้ว
    console.warn(`cleanup namespace ${NS} ล้มเหลว — sweep job จะเก็บให้`)
  }
  _adminTokens = null
}
