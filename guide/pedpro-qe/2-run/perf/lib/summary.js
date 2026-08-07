import { SLO, GLOBAL } from "../config/slo.js"

const fmt = (n, d = 0) => (n == null ? "—" : Number(n).toFixed(d))
const ok = (a, l) => (a == null ? "❓" : a < l ? "✅" : "❌")

export function handleSummary(data) {
  const L = []
  L.push("# k6 Report", "")
  L.push(`- run: \`${__ENV.RUN_ID || "local"}\``)
  L.push(`- target: \`${__ENV.BASE_URL}\``)
  L.push(`- duration: ${fmt(data.state.testRunDurationMs / 1000, 1)}s`)
  L.push(`- iterations: ${data.metrics.iterations?.values.count ?? 0}`, "")

  L.push("## SLO (เฉพาะ phase=steady)", "")
  L.push("| endpoint | p95 | limit | | p99 | limit | | biz err |")
  L.push("|---|---|---|---|---|---|---|---|")
  for (const [ep, s] of Object.entries(SLO)) {
    const m = data.metrics[`http_req_duration{endpoint:${ep},phase:steady}`]?.values
    const e = data.metrics[`biz_error_rate{endpoint:${ep}}`]?.values?.rate
    L.push(`| ${ep} | ${fmt(m?.["p(95)"])} | ${s.p95} | ${ok(m?.["p(95)"], s.p95)} ` +
           `| ${fmt(m?.["p(99)"])} | ${s.p99} | ${ok(m?.["p(99)"], s.p99)} ` +
           `| ${fmt((e ?? 0) * 100, 2)}% |`)
  }

  L.push("", "## Invariants", "")
  const mm = data.metrics.biz_ledger_mismatch?.values?.count ?? 0
  const am = data.metrics.biz_audit_missing?.values?.count ?? 0
  const cs = data.metrics.infra_cold_start?.values?.rate ?? 0
  L.push(`- ledger mismatch: **${mm}** ${mm === 0 ? "✅" : "❌ ข้อมูลเพี้ยน!"}`)
  L.push(`- audit หาย: **${am}** ${am === 0 ? "✅" : "❌ CPU ถูกตัดก่อนงานเสร็จ"}`)
  L.push(`- cold start: ${fmt(cs * 100, 2)}% ${ok(cs, GLOBAL.coldStartRate)}`)

  // Little's Law — ⭐ ใช้ mean ไม่ใช่ p95
  const rps = data.metrics.http_reqs?.values?.rate ?? 0
  const mean = data.metrics.http_req_duration?.values?.avg ?? 0
  const n = (rps * mean) / 1000
  L.push("", "## Capacity (Little's Law)", "")
  L.push(`- λ = ${fmt(rps, 1)} req/s · W = ${fmt(mean)} ms (mean)`)
  L.push(`- **N = λ × W = ${fmt(n, 1)}** request พร้อมกัน`)
  L.push(`- burst headroom (N + 3√N) ≈ ${fmt(n + 3 * Math.sqrt(Math.max(n, 0)), 1)}`)

  const md = L.join("\n")
  return {
    "reports/k6-summary.json": JSON.stringify(data, null, 2),
    "reports/k6-summary.md": md,
    stdout: md + "\n",
  }
}
