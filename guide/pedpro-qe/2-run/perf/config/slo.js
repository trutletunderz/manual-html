// ============================================================
// SLO — คู่มือ L3.1, L3.2.6
//
// ⭐ ไฟล์เดียวที่นิยาม "ดีพอ" ของทั้งระบบ
//
// ⚠️ ตัวเลขทั้งหมดเป็นค่าตั้งต้น ต้องแทนด้วยตัวเลขที่มีที่มา
//    ที่มาที่ป้องกันตัวเองได้มี 3 ทาง:
//      1. baseline ปัจจุบัน + เป้าปรับปรุง  ← แนะนำ
//      2. คู่แข่ง
//      3. เกณฑ์อุตสาหกรรม (เช่น Core Web Vitals)
//
//    ตัวเลขที่พิมพ์ลงไปเพราะมันดูสวย จะถูกเมินภายใน 2 sprint
// ============================================================

export const SLO = {
  // ADAPT: วัด baseline ก่อนแล้วตั้งเป้าจากของจริง
  deposit:  { p95: 800,  p99: 2000, errorRate: 0.005 },
  withdraw: { p95: 1000, p99: 2500, errorRate: 0.005 },
  history:  { p95: 600,  p99: 1500, errorRate: 0.01 },
  login:    { p95: 1200, p99: 3000, errorRate: 0.01 },
  balance:  { p95: 400,  p99: 1000, errorRate: 0.005 },
}

export const GLOBAL = {
  businessErrorRate: 0.01,
  ledgerMismatch: 0,        // ⭐ ไม่มี budget — ห้ามผ่อนเด็ดขาด
  auditMissing: 0,          // ⭐ ไม่มี budget
  checkPassRate: 0.99,
  coldStartRate: 0.02,
}

// ── Journey SLO (คู่มือ L4.4.3) ────────────────────────
// ⭐ ตั้งที่ journey ไม่ใช่ที่ endpoint
//    เพราะสิ่งที่ผู้ใช้แคร์คือ "ฝากเงินสำเร็จมั้ย"
//    ไม่ใช่ "/api/balance ตอบ 200 มั้ย"
//
//    5 ขั้น × 99.5% = 97.5% -> ผู้ใช้ 1 ใน 40 เจอปัญหา
//    ถ้าอยากได้ journey 99.5% แต่ละขั้นต้อง 99.9%
export const JOURNEY_SLO = {
  deposit:  { target: 0.995, windowDays: 28, steps: 5 },
  withdraw: { target: 0.995, windowDays: 28, steps: 6 },
  register: { target: 0.990, windowDays: 28, steps: 4 },
}

// ── Error budget (event-based — ห้ามปนกับ time-based) ──
export const BUDGET = {
  model: "event",           // ⭐ เลือกอันเดียวแล้วอยู่กับมัน
  windowDays: 28,           // 4 สัปดาห์พอดี
}

// burn rate threshold คำนวณจากหน้าต่างจริง (คู่มือ L4.4.2)
//   Page   = 0.02 / (1/(28*24))  = 13.44
//   Ticket = 0.05 / (6/(28*24))  = 5.60
//   Trend  = 0.10 / (72/(28*24)) = 0.93
export const BURN_RATE = {
  page:   { budgetFraction: 0.02, hours: 1,  threshold: 13.44 },
  ticket: { budgetFraction: 0.05, hours: 6,  threshold: 5.60 },
  trend:  { budgetFraction: 0.10, hours: 72, threshold: 0.93 },
}

// ── แปลง SLO เป็น k6 threshold อัตโนมัติ ────────────────
export function buildThresholds(endpoints = Object.keys(SLO)) {
  const t = {
    biz_error_rate:      [`rate<${GLOBAL.businessErrorRate}`],
    biz_ledger_mismatch: [`count==${GLOBAL.ledgerMismatch}`],
    biz_audit_missing:   [`count==${GLOBAL.auditMissing}`],
    checks:              [`rate>${GLOBAL.checkPassRate}`],
    infra_cold_start:    [`rate<${GLOBAL.coldStartRate}`],
    http_req_failed: [
      { threshold: "rate<0.01", abortOnFail: true, delayAbortEval: "30s" },
    ],
  }

  for (const ep of endpoints) {
    const s = SLO[ep]
    if (!s) throw new Error(`ไม่มี SLO ของ ${ep} — fail-closed`)
    // ⭐ ตัด warm-up: ใช้ tag phase=steady เท่านั้น
    t[`http_req_duration{endpoint:${ep},phase:steady}`] = [
      `p(95)<${s.p95}`,
      `p(99)<${s.p99}`,
    ]
    t[`biz_error_rate{endpoint:${ep}}`] = [`rate<${s.errorRate}`]
  }
  return t
}
