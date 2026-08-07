#!/usr/bin/env node
import { readFileSync } from "node:fs"
const pick = (d) => {
  const v = d.metrics.http_req_duration.values
  return { rps: d.metrics.http_reqs.values.rate, p50: v.med, p95: v["p(95)"], p99: v["p(99)"], max: v.max }
}
const o = pick(JSON.parse(readFileSync("reports/open.json", "utf8")))
const c = pick(JSON.parse(readFileSync("reports/closed.json", "utf8")))
console.log("\n| metric | OPEN (ความจริง) | CLOSED (ที่คนมักวัด) | ต่างกัน |")
console.log("|---|---|---|---|")
for (const k of ["rps","p50","p95","p99","max"]) {
  const diff = ((o[k] - c[k]) / c[k]) * 100
  console.log(`| ${k} | ${o[k].toFixed(1)} | ${c[k].toFixed(1)} | ${diff>0?"+":""}${diff.toFixed(1)}% |`)
}
const om = ((o.p95 - c.p95) / c.p95) * 100
console.log(`\n⭐ Coordinated omission ที่ p95 = ${om.toFixed(1)}%`)
console.log(om > 30 ? "→ ตัวเลข closed-model โกหกอย่างมีนัยสำคัญ ห้ามใช้ตัดสินใจ capacity"
  : om > 10 ? "→ มี omission พอสมควร ใช้ open model เมื่อจะสรุป capacity"
  : "→ ระบบยังห่างจากจุดอิ่มตัว ทั้งสองโมเดลให้ผลใกล้กัน")
