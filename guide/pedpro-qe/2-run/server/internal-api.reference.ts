// ============================================================
// Internal Seed & Query API
//
// ⭐ นี่คือไฟล์ที่ทำให้เทสทั้ง 24 ไฟล์ใน kit รันได้
//    ถ้าไม่มีตัวนี้ security spec ทุกตัวจะ throw ที่ helpers.ts
//
// ⚠️  ความปลอดภัย — อ่านก่อนใช้:
//    1. endpoint พวกนี้สร้าง user และแก้ balance ได้โดยตรง
//    2. ต้องปิดสนิทใน production ด้วย 2 ชั้น:
//       - env guard (NODE_ENV / ALLOW_INTERNAL_API)
//       - token ที่ยาวและหมุนได้
//    3. ห้าม deploy ไฟล์นี้ขึ้น production revision เด็ดขาด
//       -> ใส่ใน .gcloudignore หรือแยก build target
//
// ADAPT: ทุกฟังก์ชันต้องต่อกับ ORM/query builder จริง
// ============================================================

// ─────────────────────────────────────────────────────────
// server/utils/internal-guard.ts
// ─────────────────────────────────────────────────────────
export function requireInternal(event: any) {
  // ⭐ ชั้นที่ 1 — env guard (fail-closed)
  const allowed =
    process.env.ALLOW_INTERNAL_API === "1" &&
    process.env.NODE_ENV !== "production"

  if (!allowed) {
    // ตอบ 404 ไม่ใช่ 403 — ไม่บอกว่า endpoint นี้มีอยู่
    throw createError({ statusCode: 404, statusMessage: "Not Found" })
  }

  // ⭐ ชั้นที่ 2 — token ที่ต้องยาวพอ
  const expected = process.env.INTERNAL_TOKEN ?? ""
  if (expected.length < 32) {
    throw createError({
      statusCode: 500,
      statusMessage: "INTERNAL_TOKEN สั้นเกินไป (ต้อง >= 32 ตัว)",
    })
  }

  const given = getHeader(event, "x-internal-token") ?? ""

  // ⭐ timing-safe comparison
  const a = Buffer.from(given.padEnd(expected.length, "\0"))
  const b = Buffer.from(expected)
  const ok = a.length === b.length && timingSafeEqual(a, b)

  if (!ok) throw createError({ statusCode: 401, statusMessage: "Unauthorized" })
}

// ─────────────────────────────────────────────────────────
// server/api/internal/_routes.get.ts
// ⭐ ปิด blind spot ของ filesystem enumeration (คู่มือ L3.4B)
// ─────────────────────────────────────────────────────────
export const routesHandler = defineEventHandler((event: any) => {
  requireInternal(event)

  // ADAPT: Nitro เก็บ route table ไว้ที่นี่ ตรวจ version ของคุณ
  const nitro = useNitroApp() as any
  const routes: { method: string; path: string }[] = []

  for (const r of nitro.h3App?.stack ?? []) {
    if (!r.route) continue
    routes.push({
      method: (r.method ?? "GET").toUpperCase(),
      path: r.route.replace(/\/\*\*$/, "/*"),
    })
  }

  return routes.sort((x, y) => `${x.method} ${x.path}`.localeCompare(`${y.method} ${y.path}`))
})

// ─────────────────────────────────────────────────────────
// server/api/internal/seed/user.post.ts
// ─────────────────────────────────────────────────────────
export const seedUserHandler = defineEventHandler(async (event: any) => {
  requireInternal(event)
  const body = await readBody(event)

  // ⭐ บังคับ prefix — ทำให้ cleanup ลบได้แม่นยำ
  if (!body.username?.startsWith("sec-") && !body.username?.startsWith("authz-")) {
    throw createError({
      statusCode: 400,
      statusMessage: "username ต้องขึ้นต้นด้วย prefix ของ test namespace",
    })
  }

  const user = await db.users.create({
    username: body.username,
    displayName: body.displayName ?? body.username,
    phone: body.phone ?? randomThaiPhone(),
    balance: body.balance ?? 0,
    verified: body.verified ?? true,
    status: body.status ?? "active",
    role: body.role ?? "user",
    kycStatus: body.kycStatus ?? "none",
    bonusUsedThisMonth: body.bonusUsedThisMonth ?? false,
    vipLevel: body.vipLevel ?? 0,
    isTestData: true,                  // ⭐ ธงสำหรับ sweep job
  })

  // ⭐ ถ้าตั้ง balance ต้องสร้าง ledger entry คู่กัน
  //    ไม่งั้น invariant INV-1 จะละเมิดทันทีที่ seed
  if (body.balance) {
    await db.ledger.create({
      userId: user.id,
      amount: body.balance,
      type: "seed",
      refId: `SEED-${user.id}`,
    })
  }

  const token = await issueToken(user.id, { expiresIn: "1h" })

  return { Result: 1, Data: { ...user, token } }
})

// ─────────────────────────────────────────────────────────
// server/api/internal/seed/users.post.ts  (batch)
// ─────────────────────────────────────────────────────────
export const seedUsersHandler = defineEventHandler(async (event: any) => {
  requireInternal(event)
  const { count, prefix, balance = 0, verified = true } = await readBody(event)

  if (count > 500) {
    throw createError({ statusCode: 400, statusMessage: "count เกิน 500" })
  }

  // ⭐ batch insert — ห้ามยิงทีละคน 200 ครั้ง
  const rows = Array.from({ length: count }, (_, i) => ({
    username: `${prefix}-b${i}`,
    displayName: `${prefix}-b${i}`,
    phone: randomThaiPhone(),
    balance, verified, status: "active", role: "user",
    isTestData: true,
  }))

  const users = await db.users.createMany(rows)

  if (balance) {
    await db.ledger.createMany(
      users.map((u: any) => ({
        userId: u.id, amount: balance, type: "seed", refId: `SEED-${u.id}`,
      }))
    )
  }

  const withTokens = await Promise.all(
    users.map(async (u: any) => ({ ...u, token: await issueToken(u.id, { expiresIn: "1h" }) }))
  )

  return { Result: 1, Data: withTokens }
})

// ─────────────────────────────────────────────────────────
// server/api/internal/seed/expired-token.post.ts
// ⭐ ต้องออก token ที่หมดอายุแล้วจริงๆ ไม่ใช่ token ปลอม
// ─────────────────────────────────────────────────────────
export const seedExpiredTokenHandler = defineEventHandler(async (event: any) => {
  requireInternal(event)
  const { userId } = await readBody(event)

  // ออก token ที่ exp อยู่ในอดีต
  const token = await issueToken(userId, { expiresIn: "-1h" })

  return { Result: 1, Data: { token } }
})

// ─────────────────────────────────────────────────────────
// server/api/internal/seed/withdrawal.post.ts
// ─────────────────────────────────────────────────────────
export const seedWithdrawalHandler = defineEventHandler(async (event: any) => {
  requireInternal(event)
  const body = await readBody(event)

  let userId = body.userId
  if (!userId) {
    const u = await db.users.create({
      username: `${body.prefix}-wd${Date.now()}`,
      balance: body.amount * 2,
      verified: true, status: "active", isTestData: true,
    })
    await db.ledger.create({
      userId: u.id, amount: body.amount * 2, type: "seed", refId: `SEED-${u.id}`,
    })
    userId = u.id
  }

  const wd = await db.withdrawals.create({
    userId,
    amount: body.amount,
    status: body.status ?? "PENDING",
    isTestData: true,
  })

  return { Result: 1, Data: wd }
})

// ─────────────────────────────────────────────────────────
// server/api/internal/seed/promo-code.post.ts
// ─────────────────────────────────────────────────────────
export const seedPromoHandler = defineEventHandler(async (event: any) => {
  requireInternal(event)
  const { code, limit } = await readBody(event)

  const promo = await db.promoCodes.create({
    code, limit, used: 0,
    expiresAt: new Date(Date.now() + 86_400_000),
    isTestData: true,
  })

  return { Result: 1, Data: promo }
})

// ─────────────────────────────────────────────────────────
// server/api/internal/seed/transactions.post.ts  (volume test)
// ─────────────────────────────────────────────────────────
export const seedTransactionsHandler = defineEventHandler(async (event: any) => {
  requireInternal(event)
  const { userId, count, startDate, endDate } = await readBody(event)

  if (count > 1000) {
    throw createError({ statusCode: 400, statusMessage: "count เกิน 1000 ต่อครั้ง" })
  }

  const start = new Date(startDate).getTime()
  const span = new Date(endDate).getTime() - start

  // ⭐ กระจายวันที่ — สำคัญสำหรับเทส index บน created_at
  const rows = Array.from({ length: count }, () => ({
    userId,
    amount: Math.floor(Math.random() * 5000) + 100,
    type: Math.random() > 0.5 ? "deposit" : "withdraw",
    status: "completed",
    createdAt: new Date(start + Math.random() * span),
    isTestData: true,
  }))

  await db.transactions.createMany(rows)
  return { Result: 1, Data: { inserted: count } }
})

// ─────────────────────────────────────────────────────────
// server/api/internal/seed/cleanup.delete.ts
// ─────────────────────────────────────────────────────────
export const cleanupHandler = defineEventHandler(async (event: any) => {
  requireInternal(event)
  const prefix = getQuery(event).prefix as string

  if (!prefix || prefix.length < 5) {
    throw createError({ statusCode: 400, statusMessage: "prefix สั้นเกินไป — อันตราย" })
  }

  // ⭐ ลบเฉพาะที่มีธง isTestData และตรง prefix — สองเงื่อนไข
  const users = await db.users.findMany({
    where: { username: { startsWith: prefix }, isTestData: true },
    select: { id: true },
  })
  const ids = users.map((u: any) => u.id)

  if (ids.length) {
    await db.ledger.deleteMany({ where: { userId: { in: ids } } })
    await db.transactions.deleteMany({ where: { userId: { in: ids } } })
    await db.withdrawals.deleteMany({ where: { userId: { in: ids } } })
    await db.auditLogs.deleteMany({ where: { userId: { in: ids } } })
    await db.users.deleteMany({ where: { id: { in: ids } } })
  }

  return { Result: 1, Data: { deleted: ids.length } }
})

// ─────────────────────────────────────────────────────────
// server/api/internal/accounting/[userId]/balance.get.ts
// และ query endpoint อื่นๆ
// ─────────────────────────────────────────────────────────
export const balanceHandler = defineEventHandler(async (event: any) => {
  requireInternal(event)
  const { userId } = getRouterParams(event)
  const u = await db.users.findUnique({ where: { id: userId }, select: { balance: true } })
  return { Result: 1, Data: u?.balance ?? null }
})

export const ledgerSumHandler = defineEventHandler(async (event: any) => {
  requireInternal(event)
  const { userId } = getRouterParams(event)
  const rows = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE user_id = $1`,
    [userId]
  )
  return { Result: 1, Data: Number(rows[0].s) }
})

export const ledgerEntriesHandler = defineEventHandler(async (event: any) => {
  requireInternal(event)
  const refId = getQuery(event).refId as string
  const rows = await db.ledger.findMany({ where: { refId } })
  return { Result: 1, Data: rows }
})

export const userRawHandler = defineEventHandler(async (event: any) => {
  requireInternal(event)
  const { userId } = getRouterParams(event)
  // ⭐ คืนทุก field รวมที่ปกติไม่ส่งออก — ใช้ตรวจ mass assignment
  const u = await db.users.findUnique({ where: { id: userId } })
  return { Result: 1, Data: u }
})

export const auditLatestHandler = defineEventHandler(async (event: any) => {
  requireInternal(event)
  const { userId } = getRouterParams(event)
  const log = await db.auditLogs.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })
  return { Result: 1, Data: log }
})

// ─────────────────────────────────────────────────────────
// server/api/internal/sort-test.post.ts
// ⭐ ใช้ตรวจว่า collation ของ DB ตรงกับ localeCompare (คู่มือ L3.7.2)
// ─────────────────────────────────────────────────────────
export const sortTestHandler = defineEventHandler(async (event: any) => {
  requireInternal(event)
  const { names } = await readBody(event)

  // ADAPT: collation name ตาม DB จริง
  //   Postgres: "th-TH-x-icu" หรือ "th_TH.utf8"
  //   MySQL:    utf8mb4_thai_520_w2
  const rows = await db.query(
    `SELECT n FROM unnest($1::text[]) AS n ORDER BY n COLLATE "th-TH-x-icu"`,
    [names]
  )

  return { Result: 1, Data: rows.map((r: any) => r.n) }
})

// ─────────────────────────────────────────────────────────
// server/api/internal/monitors/run.get.ts
// ─────────────────────────────────────────────────────────
export const monitorsRunHandler = defineEventHandler(async (event: any) => {
  requireInternal(event)
  const { runInvariants } = await import("~/monitors/invariants")
  const results = await runInvariants(alertTelegram)
  return { Result: 1, Data: results }
})

// ============================================================
// ADAPT: declare เหล่านี้มาจาก Nuxt/Nitro auto-import
// ============================================================
declare function defineEventHandler(h: any): any
declare function createError(o: any): Error
declare function getHeader(e: any, k: string): string | undefined
declare function getQuery(e: any): Record<string, unknown>
declare function getRouterParams(e: any): Record<string, string>
declare function readBody(e: any): Promise<any>
declare function useNitroApp(): unknown
declare const db: any
declare const timingSafeEqual: (a: Buffer, b: Buffer) => boolean
declare function issueToken(userId: string, opts: { expiresIn: string }): Promise<string>
declare function randomThaiPhone(): string
declare function alertTelegram(a: any): Promise<void>
