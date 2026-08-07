#!/usr/bin/env node
// Load Test Validity — คู่มือ L3.2.8
// ⭐ load test ที่ไม่ valid แย่กว่าไม่ทำเลย เพราะสร้างความมั่นใจปลอม
import { readFileSync, existsSync } from "node:fs"

const P = "reports/k6-summary.json"
if (!existsSync(P)) { console.error(`❌ ไม่พบ ${P}`); process.exit(1) }
const d = JSON.parse(readFileSync(P, "utf8"))
const warn = [], fail = []

const countTag = (tag) => Object.entries(d.metrics)
  .filter(([k]) => k.startsWith("http_req_duration") && k.includes(tag))
  .reduce((s, [, m]) => s + (m.values?.count ?? 0), 0)

// V1: warm-up ถูกตัดจริงมั้ย
if (!Object.keys(d.metrics).some((k) => k.includes("phase:steady")))
  fail.push("V1: ไม่มี metric ที่ tag phase=steady — warm-up ไม่ถูกตัด")

// ⭐ V1b: สัดส่วน warmup ต้องสมเหตุสมผล (กันบั๊ก phase() แบบ VU-scope)
const w = countTag("phase:warmup"), s = countTag("phase:steady")
if (w + s > 0) {
  const WS = Number(process.env.WARMUP_SECONDS ?? 60)
  const TS = d.state.testRunDurationMs / 1000
  const expected = WS / TS, actual = w / (w + s)
  if (Math.abs(actual - expected) > 0.1)
    fail.push(`V1b: warmup ratio ${(actual*100).toFixed(1)}% ควรเป็น ${(expected*100).toFixed(1)}% -> phase tagging ผิด`)
}

// V4: generator เป็นคอขวดมั้ย
const dropped = d.metrics.dropped_iterations?.values?.count ?? 0
if (dropped > 0) fail.push(`V4: dropped_iterations = ${dropped} — generator ยิงไม่ทัน latency ต่ำกว่าจริง`)

// V9: error rate ต่ำพอที่จะเชื่อ latency มั้ย
const err = d.metrics.http_req_failed?.values?.rate ?? 0
if (err > 0.01) fail.push(`V9: error rate ${(err*100).toFixed(2)}% > 1% — latency ที่วัดได้คือของ error path`)

// V2: data variety
const b = d.metrics.infra_response_bytes?.values
if (b && b.max === b.min) warn.push("V2: response size เท่ากันทุก request — น่าจะยิง record เดิมซ้ำ cache ปิดบังปัญหา")

// V3: think time
const it = d.metrics.iteration_duration?.values?.avg ?? 0
if (it < 500) warn.push(`V3: iteration เฉลี่ย ${it.toFixed(0)}ms — ไม่มี think time`)

// V6: monitoring ฝั่ง SUT
if (!existsSync("reports/sut-metrics.json"))
  warn.push("V6: ไม่มี metric จากฝั่ง SUT — รู้แค่ 'ช้า' ไม่รู้ว่า 'ช้าที่ไหน'")

warn.forEach((x) => console.warn(`⚠️  ${x}`))
fail.forEach((x) => console.error(`❌ ${x}`))

if (fail.length) { console.error("\n❌ VALIDITY FAIL — ผลนี้เชื่อไม่ได้ อย่าเอาไปตัดสินใจ"); process.exit(1) }
console.log("✅ VALIDITY PASS")
