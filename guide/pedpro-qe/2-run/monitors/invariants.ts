// ============================================================
// Production Invariant Monitor — คู่มือ L4.3.1
//
// ⭐ ทำไมตัวนี้คุ้มที่สุด:
//    เทสทุกตัวใน L1-L3 ตรวจ "เคสที่มีคนคิดถึง"
//    invariant monitor ตรวจ "ข้อมูลจริงทั้งหมด ทุก 10 นาที ตลอดไป"
//
//    มันคือ oracle ตัวเดียวที่ไม่ต้องมีใครเดาว่าจะเกิดอะไรขึ้น
//
// ⚠️  query ทั้งตาราง — ถ้า users เยอะมากให้เพิ่ม index บน ledger.user_id ก่อน
// ============================================================

// ADAPT: เปลี่ยน import นี้เป็น db client จริงของโปรเจกต์
//   เช่น: import { db } from "~/server/utils/db"
//        import { prisma as db } from "~/server/utils/prisma"
declare const db: {
  query: (sql: string, params?: unknown[]) => Promise<any[]>
}

export type Violation = { id: string; detail: string }

export type Invariant = {
  id: string
  description: string
  severity: "critical" | "high" | "medium"
  /** คืนรายการที่ละเมิด — array ว่าง = ผ่าน */
  check: () => Promise<Violation[]>
}

export const INVARIANTS: Invariant[] = [
  {
    id: "INV-1",
    description: "ยอดคงเหลือของทุกบัญชีต้องเท่ากับผลรวม ledger",
    severity: "critical",
    check: async () => {
      // ⭐ ตรวจทุกบัญชี ไม่ใช่สุ่ม — นี่คือความต่างจาก sampling
      const rows = await db.query(`
        SELECT u.id,
               u.balance,
               COALESCE(SUM(l.amount), 0) AS ledger_sum
        FROM users u
        LEFT JOIN ledger l ON l.user_id = u.id
        GROUP BY u.id, u.balance
        HAVING u.balance <> COALESCE(SUM(l.amount), 0)
      `)
      return rows.map((r: any) => ({
        id: r.id,
        detail: `balance=${r.balance} ledger_sum=${r.ledger_sum} diff=${r.balance - r.ledger_sum}`,
      }))
    },
  },

  {
    id: "INV-2",
    description: "ไม่มีบัญชีที่ยอดติดลบ",
    severity: "critical",
    check: async () => {
      const rows = await db.query(`SELECT id, balance FROM users WHERE balance < 0`)
      return rows.map((r: any) => ({ id: r.id, detail: `balance=${r.balance}` }))
    },
  },

  {
    id: "INV-3",
    description: "ไม่มี transaction ที่ค้างสถานะกลางทางเกิน 30 นาที",
    severity: "high",
    check: async () => {
      // ADAPT: ชื่อ status ตาม state machine จริง
      const rows = await db.query(`
        SELECT id, status, created_at
        FROM transactions
        WHERE status IN ('PENDING', 'REVIEWING', 'APPROVED')
          AND created_at < NOW() - INTERVAL '30 minutes'
      `)
      return rows.map((r: any) => ({
        id: r.id,
        detail: `status=${r.status} since=${r.created_at}`,
      }))
    },
  },

  {
    id: "INV-4",
    description: "ทุก mutation มี audit log ที่มี DoAdmin/DoIp",
    severity: "high",
    check: async () => {
      // ⭐ จับ Cloud Run CPU throttling — งาน background หลัง res.json() ไม่เสร็จ
      const rows = await db.query(`
        SELECT t.id
        FROM transactions t
        LEFT JOIN audit_logs a ON a.ref_id = t.id
        WHERE t.created_at > NOW() - INTERVAL '1 hour'
          AND (a.id IS NULL OR a.do_ip IS NULL OR a.do_ip = '')
      `)
      return rows.map((r: any) => ({ id: r.id, detail: "ไม่มี audit log หรือ DoIp ว่าง" }))
    },
  },

  {
    id: "INV-5",
    description: "ไม่มีผู้ใช้ที่อายุต่ำกว่าเกณฑ์ผ่าน KYC",
    severity: "critical",
    check: async () => {
      // ADAPT: เกณฑ์อายุตามกฎหมายที่ใช้จริง
      const rows = await db.query(`
        SELECT id, birth_date
        FROM users
        WHERE kyc_status = 'approved'
          AND birth_date > NOW() - INTERVAL '20 years'
      `)
      return rows.map((r: any) => ({ id: r.id, detail: `birth_date=${r.birth_date}` }))
    },
  },
]

// ============================================================
// Runner
// ============================================================

export type InvariantResult = {
  id: string
  ok: boolean
  count?: number
  sample?: Violation[]
  ms?: number
  error?: string
}

export async function runInvariants(
  alert: (a: { severity: string; title: string; body: string }) => Promise<void>
): Promise<InvariantResult[]> {
  const results: InvariantResult[] = []

  for (const inv of INVARIANTS) {
    const started = Date.now()
    try {
      const violations = await inv.check()

      results.push({
        id: inv.id,
        ok: violations.length === 0,
        count: violations.length,
        // ⭐ ไม่ส่งทั้งหมด กัน log ระเบิดถ้าละเมิดเป็นพัน
        sample: violations.slice(0, 5),
        ms: Date.now() - started,
      })

      if (violations.length > 0) {
        await alert({
          severity: inv.severity,
          title: `INVARIANT ละเมิด: ${inv.id}`,
          body:
            `${inv.description}\n` +
            `พบ ${violations.length} รายการ\n\n` +
            violations.slice(0, 3).map((v) => `  ${v.id}: ${v.detail}`).join("\n"),
        })
      }
    } catch (err) {
      // ⭐ fail-closed: ตรวจไม่ได้ = ถือว่าไม่ผ่าน ต้องแจ้งเตือน
      //    ถ้าเงียบไว้ คุณจะมี monitor ที่ไม่ monitor อะไรเลยและไม่รู้ตัว
      results.push({ id: inv.id, ok: false, error: String(err) })
      await alert({
        severity: "high",
        title: `INVARIANT ตรวจไม่ได้: ${inv.id}`,
        body: String(err),
      })
    }
  }

  return results
}
