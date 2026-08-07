// ============================================================
// Race Condition Harness — คู่มือ L3.4C
//
// ⭐ Promise.all ธรรมดาไม่พอ:
//    barrier ทำให้ทุก task ผ่านจุดเดียวกัน
//    แต่ task แรกที่ยิงต้องจ่ายค่า TCP handshake + TLS
//    ในขณะที่ตัวหลังใช้ connection ที่เปิดแล้ว
//    -> request ไม่ถึงเซิร์ฟเวอร์พร้อมกันจริง อาจห่างกัน 50-200ms
//    -> race test ที่ผ่านโดยไม่ได้พิสูจน์อะไร
//
// วิธีแก้: pre-warm connection ก่อน + วัด dispatch spread + throw ถ้าเกิน
// ============================================================

import { Agent, setGlobalDispatcher } from "undici"

// ⭐ ต้องใช้ agent ที่มี keep-alive และ connections >= concurrency
export const raceAgent = new Agent({
  connections: 64,
  pipelining: 0,          // ห้าม pipeline — จะทำให้ request เรียงคิว
  keepAliveTimeout: 60_000,
})

/** เรียกครั้งเดียวตอน setup ของ test suite */
export function installRaceDispatcher() {
  setGlobalDispatcher(raceAgent)
}

// ── barrier ──────────────────────────────────────────────
export function createBarrier(n: number) {
  let arrived = 0
  let release!: () => void
  const gate = new Promise<void>((r) => { release = r })
  return {
    async wait() {
      if (++arrived >= n) release()
      await gate
    },
  }
}

// ── ผลลัพธ์ ──────────────────────────────────────────────
export type RaceResult<T> = {
  results: PromiseSettledResult<T>[]
  successes: T[]
  failures: unknown[]
  durationMs: number
  /** ⭐ ตัวชี้วัดว่าการทดสอบนี้ valid มั้ย */
  dispatchSpreadMs: number
}

export type RaceOptions<T> = {
  concurrency: number
  /** การกระทำที่ต้องการให้ชนกัน */
  action: (i: number) => Promise<T>
  /** ตัดสินว่าผลลัพธ์นับเป็นสำเร็จมั้ย */
  isSuccess: (r: T) => boolean
  /**
   * ⭐ request ที่ไม่มีผลข้างเคียง ใช้เปิด connection ล่วงหน้า
   *    เช่น () => api.get("/api/health")
   */
  prewarm?: (i: number) => Promise<unknown>
  /** เกินกี่ ms ถือว่าไม่ valid (default 20) */
  maxSpreadMs?: number
}

export async function raceTest<T>(opts: RaceOptions<T>): Promise<RaceResult<T>> {
  const maxSpread = opts.maxSpreadMs ?? 20

  // ── 1. เปิด connection ให้ครบก่อน ──────────────────────
  if (opts.prewarm) {
    await Promise.all(
      Array.from({ length: opts.concurrency }, (_, i) => opts.prewarm!(i))
    )
  }

  const barrier = createBarrier(opts.concurrency)
  const dispatchTimes: number[] = []
  const t0 = performance.now()

  // ── 2. ยิงพร้อมกันหลังผ่าน barrier ─────────────────────
  const results = await Promise.allSettled(
    Array.from({ length: opts.concurrency }, async (_, i) => {
      await barrier.wait()
      dispatchTimes.push(performance.now() - t0)
      return opts.action(i)
    })
  )

  // ── 3. ตรวจว่าการทดสอบนี้ valid มั้ย ⭐ ────────────────
  const spread = Math.max(...dispatchTimes) - Math.min(...dispatchTimes)
  if (spread > maxSpread) {
    throw new Error(
      `race test ไม่ valid: dispatch ห่างกัน ${spread.toFixed(1)}ms ` +
      `(เกณฑ์ ${maxSpread}ms)\n` +
      `  -> เพิ่ม prewarm หรือตรวจว่าใช้ agent ที่มี keep-alive แล้ว\n` +
      `  -> ถ้าไม่แก้ เทสนี้จะผ่านโดยไม่ได้พิสูจน์อะไร`
    )
  }

  const successes = results
    .filter((r): r is PromiseFulfilledResult<T> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter(opts.isSuccess)

  return {
    results,
    successes,
    failures: results
      .filter((r) => r.status === "rejected")
      .map((r) => (r as PromiseRejectedResult).reason),
    durationMs: performance.now() - t0,
    dispatchSpreadMs: spread,
  }
}

// ============================================================
// ตัวช่วยสำหรับเคสที่พบบ่อย
// ============================================================

/**
 * เคสมาตรฐาน: การกระทำที่ควรสำเร็จได้ครั้งเดียวเท่านั้น
 * ใช้กับ: ถอนเงิน · รับโบนัส · redeem โค้ด · approve
 */
export async function expectExactlyOneSuccess<T>(
  opts: RaceOptions<T> & { what: string }
) {
  const r = await raceTest(opts)
  if (r.successes.length !== 1) {
    throw new Error(
      `${opts.what}: สำเร็จ ${r.successes.length} ครั้ง จาก ${opts.concurrency} ` +
      `(ควรเป็น 1)\n` +
      `  dispatch spread = ${r.dispatchSpreadMs.toFixed(1)}ms\n` +
      `  -> ช่องโหว่นี้แปลงเป็นเงินได้โดยตรง`
    )
  }
  return r
}

/**
 * เคส idempotency: ยิงซ้ำแล้วต้องไม่เกิดผลซ้ำ
 * ใช้กับ: webhook · callback ของ gateway
 */
export async function expectIdempotent<T>(
  opts: RaceOptions<T> & {
    what: string
    /** นับจำนวนผลข้างเคียงที่เกิดขึ้นจริง (เช่น จำนวน ledger entry) */
    countEffects: () => Promise<number>
  }
) {
  const before = await opts.countEffects()
  const r = await raceTest(opts)
  const after = await opts.countEffects()
  const delta = after - before

  if (delta !== 1) {
    throw new Error(
      `${opts.what}: ยิง ${opts.concurrency} ครั้งพร้อมกัน เกิดผลข้างเคียง ${delta} ครั้ง ` +
      `(ควรเป็น 1)\n` +
      `  dispatch spread = ${r.dispatchSpreadMs.toFixed(1)}ms`
    )
  }
  return r
}
