// ============================================================
// Global test setup — คู่มือ L2.2, L2.9, L1.11
// ============================================================
import { beforeEach, afterEach, expect, vi } from "vitest"
import { setupServer } from "msw/node"

// ⭐ MSW fail-closed — request ที่ไม่มี handler = เทสแดง
//    ถ้าใช้ "warn" หรือ "bypass" เทสจะยิงเน็ตจริงโดยคุณไม่รู้ตัว
export const server = setupServer()

server.listen({ onUnhandledRequest: "error" })

beforeEach(() => {
  // ⭐ I = Independent — ล้าง state ทุกอย่างก่อนทุกเทส
  vi.clearAllMocks()
  vi.useRealTimers()
  localStorage?.clear?.()
  sessionStorage?.clear?.()
})

afterEach(() => {
  server.resetHandlers()
  vi.restoreAllMocks()
})

// ============================================================
// ⭐ Financial invariant — คู่มือ L1.11 MR6
//    ใส่ไว้ที่นี่ทำให้ทุกเทสที่แตะเงินถูกตรวจอัตโนมัติ
//    โดยไม่ต้องจำว่าต้องเขียน assertion เอง
// ============================================================
declare global {
  // eslint-disable-next-line no-var
  var __financialTest: string | undefined
}

afterEach(async () => {
  const userId = globalThis.__financialTest
  if (!userId) return

  const { getBalance, getLedgerSum } = await import("../../security/helpers")
  const [balance, sum] = await Promise.all([getBalance(userId), getLedgerSum(userId)])

  expect(
    sum,
    `⭐ INVARIANT ละเมิด: balance=${balance} แต่ sum(ledger)=${sum}\n` +
      "   ข้อมูลการเงินเพี้ยนหลังเทสนี้"
  ).toBe(balance)

  globalThis.__financialTest = undefined
})

/** เรียกในเทสที่แตะเงิน -> invariant จะถูกตรวจอัตโนมัติหลังเทสจบ */
export function trackFinancial(userId: string) {
  globalThis.__financialTest = userId
}
