// ============================================================
// Authz Matrix — schema  (คู่มือ L3.4B)
//
// ⭐ บทเรียนสำคัญ: ห้ามมี default
//    `expectedMatrix[x]?.[actor] ?? 403` คือ fail-open ที่ปลอมตัวเป็น fail-closed
//    -> endpoint ที่ลืมใส่ spec จะผ่านเทสโดยอัตโนมัติ
// ============================================================

export type Actor =
  | "anonymous"
  | "owner"
  | "otherUser"
  | "expiredToken"
  | "malformedToken"
  | "bannedUser"
  | "unverifiedUser"
  | "admin"

export const ALL_ACTORS: Actor[] = [
  "anonymous", "owner", "otherUser", "expiredToken",
  "malformedToken", "bannedUser", "unverifiedUser", "admin",
]

export type Expectation = {
  status: number | number[]
  /** field ที่ห้ามหลุดใน response เมื่อถูกปฏิเสธ */
  mustNotLeak?: string[]
  /** resource ที่มี/ไม่มี ต้องตอบเหมือนกัน (กัน enumeration) */
  noEnumeration?: boolean
}

export type TestContext = {
  ownerToken: string
  otherUserTxnId: string
  otherUserWithdrawalId: string
  [k: string]: unknown
}

export type EndpointSpec = {
  /** ต้องตรงกับที่ enumerateApiRoutes() คืนมาเป๊ะ */
  id: string
  method: string
  buildPath: (ctx: TestContext) => string
  buildBody?: (ctx: TestContext) => unknown
  /** ⭐ ต้องระบุครบทุก actor — ไม่มี default */
  rules: Record<Actor, Expectation>
  /** ถ้าจงใจข้าม actor บางตัว ต้องระบุเหตุผล */
  skipActors?: Partial<Record<Actor, string>>
}

// ── preset ที่ใช้บ่อย ────────────────────────────────────
export const DENY: Expectation = {
  status: [401, 403],
  mustNotLeak: ["amount", "balance", "idCard", "phone"],
}

export const NOT_FOUND_OR_DENY: Expectation = {
  status: [403, 404],
  noEnumeration: true,
  mustNotLeak: ["amount", "balance"],
}

export const OK: Expectation = { status: 200 }
export const UNAUTHORIZED: Expectation = { status: 401 }
