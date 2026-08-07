// ============================================================
// endpoint ที่ Cloud Scheduler เรียกทุก 10 นาที
// คู่มือ L4.3.1
//
// gcloud scheduler jobs create http invariant-monitor \
//   --schedule="*/10 * * * *" \
//   --uri="https://<service>/internal/monitors/run" \
//   --headers="X-Internal-Token=<token>"
// ============================================================

import { runInvariants } from "./invariants"

// ADAPT: เปลี่ยนเป็น notifier จริง (Telegram / Slack)
async function alertTelegram(a: { severity: string; title: string; body: string }) {
  const icon = a.severity === "critical" ? "🔴" : a.severity === "high" ? "🟠" : "🟡"
  await fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.TG_CHAT_ID,
      text: `${icon} ${a.title}\n\n${a.body}`,
    }),
  })
}

export default defineEventHandler(async (event) => {
  // ADAPT: การตรวจ token ตามระบบจริง
  const token = getHeader(event, "x-internal-token")
  if (token !== process.env.INTERNAL_TOKEN) {
    throw createError({ statusCode: 401, message: "unauthorized" })
  }

  const started = Date.now()
  const results = await runInvariants(alertTelegram)

  const failed = results.filter((r) => !r.ok)

  // ⭐ บันทึกทุกครั้ง ไม่ใช่เฉพาะตอนพัง — ต้องใช้ทำ control chart (L5.13)
  await recordMetric("invariant_run", {
    ts: Date.now(),
    durationMs: Date.now() - started,
    total: results.length,
    failed: failed.length,
    results,
  })

  return { ok: failed.length === 0, results }
})

// ADAPT
declare function defineEventHandler(h: any): any
declare function getHeader(e: any, k: string): string | undefined
declare function createError(o: any): Error
declare function recordMetric(name: string, data: unknown): Promise<void>
