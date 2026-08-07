#!/usr/bin/env node
// Perf Gate — fail-closed (คู่มือ L3.2.7)
import { readFileSync, existsSync } from "node:fs"
import { SLO } from "../config/slo.js"

const S = "reports/k6-summary.json"
const B = process.env.BASELINE ?? "perf/analyze/baseline/load.json"
const TOL = Number(process.env.PERF_TOLERANCE ?? 0.15)
const die = (m) => { console.error(`\n❌ PERF GATE FAIL: ${m}\n`); process.exit(1) }

if (!existsSync(S)) die(`ไม่พบ ${S} — ถือว่า load test ไม่ได้รัน`)
const d = JSON.parse(readFileSync(S, "utf8"))

const total = d.metrics?.http_reqs?.values?.count ?? 0
const MIN = Number(process.env.MIN_REQS ?? 1000)
if (total < MIN) die(`มี request แค่ ${total} (< ${MIN}) — สคริปต์น่าจะพังตั้งแต่ต้น`)

const failed = []
for (const [name, m] of Object.entries(d.metrics)) {
  if (!m.thresholds) continue
  for (const [expr, r] of Object.entries(m.thresholds))
    if (!(r.ok !== undefined ? r.ok : !r.fails)) failed.push(`${name} → ${expr}`)
}

const mm = d.metrics.biz_ledger_mismatch?.values?.count ?? 0
if (mm > 0) die(`⭐ LEDGER MISMATCH ${mm} ครั้ง — ข้อมูลการเงินเพี้ยนภายใต้โหลด`)
const am = d.metrics.biz_audit_missing?.values?.count ?? 0
if (am > 0) die(`audit log หาย ${am} รายการ — น่าจะเป็น Cloud Run CPU throttling`)

const regressions = []
if (existsSync(B)) {
  const base = JSON.parse(readFileSync(B, "utf8"))
  for (const ep of Object.keys(SLO)) {
    const k = `http_req_duration{endpoint:${ep},phase:steady}`
    const now = d.metrics[k]?.values?.["p(95)"], then = base.metrics?.[k]?.values?.["p(95)"]
    if (now == null || then == null) continue
    const delta = (now - then) / then
    if (delta > TOL) regressions.push(`${ep}: p95 ${then.toFixed(0)} → ${now.toFixed(0)}ms (+${(delta*100).toFixed(1)}%)`)
  }
} else console.warn(`⚠️  ไม่มี baseline ที่ ${B} — ข้ามการตรวจ regression`)

if (failed.length || regressions.length) {
  if (failed.length) { console.error("\n❌ SLO ที่ไม่ผ่าน:"); failed.forEach(f => console.error(`   - ${f}`)) }
  if (regressions.length) { console.error(`\n❌ Regression > ${TOL*100}%:`); regressions.forEach(r => console.error(`   - ${r}`)) }
  process.exit(1)
}
console.log(`✅ PERF GATE PASS — ${total} requests`)
