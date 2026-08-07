#!/usr/bin/env node
// ============================================================
// Knowledge GC — คู่มือ L4.9
//
// ปัญหาที่แก้: fault-attacks.yaml โตขึ้นทุกครั้งที่มีบั๊ก
//   → กลายเป็นไฟล์ 400 บรรทัดที่ agent ต้องอ่านทุกครั้ง
//   → context กว้างจนไม่มีอะไรโดดเด่น
//   → หลายข้ออ้างถึงโค้ดที่ถูกลบไปแล้ว
//
// ⭐ เป้าหมายไม่ใช่สะสมความรู้
//    แต่คือแปลงความรู้เป็นข้อจำกัดเชิงโครงสร้าง
//
// ใช้: node scripts/knowledge-gc.mjs [--write]
// ความถี่: ไตรมาสละครั้ง
// ============================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { parse, stringify } from "yaml"   // pnpm add -D yaml

const SRC = process.env.FAULT_ATTACKS ?? "pipeline-skill/fault-attacks.yaml"
const OUT = process.env.FAULT_ATTACKS_MD ?? "pipeline-skill/fault-attacks-active.md"
const WRITE = process.argv.includes("--write")

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

if (!existsSync(SRC)) {
  console.error(`ไม่พบ ${SRC}`)
  process.exit(1)
}

const doc = parse(readFileSync(SRC, "utf8"))
const rules = doc.rules ?? []
const now = Date.now()
const changes = []

for (const r of rules) {
  const before = r.status

  // ── 1. มี automated gate ครอบแล้ว -> RETIRED ────────────
  //    ⭐ ความรู้ที่กลายเป็น gate ไม่ต้องให้ agent อ่านอีก
  if (r.automatedBy) {
    if (existsSync(r.automatedBy)) {
      r.status = "RETIRED"
      r.retiredReason = `ครอบด้วย ${r.automatedBy}`
    } else {
      r.status = "NEEDS_REVIEW"
      r.reviewReason = `automatedBy ชี้ไปที่ไฟล์ที่ไม่มีอยู่: ${r.automatedBy}`
    }
  }

  // ── 2. ไม่เคยจับอะไรได้ใน 1 ปี -> DORMANT ───────────────
  else if (r.status === "ACTIVE") {
    const ref = r.lastTriggered ?? r.added
    if (ref && now - new Date(ref).getTime() > YEAR_MS) {
      r.status = "DORMANT"
      r.dormantSince = new Date().toISOString().slice(0, 10)
    }
  }

  // ── 3. อ้างถึงโค้ดที่ไม่มีแล้ว -> NEEDS_REVIEW ──────────
  if (r.codeRef && !existsSync(r.codeRef)) {
    r.status = "NEEDS_REVIEW"
    r.reviewReason = `codeRef ไม่มีอยู่: ${r.codeRef}`
  }

  if (r.status !== before) changes.push({ id: r.id, from: before, to: r.status })
}

// ── สรุป ────────────────────────────────────────────────
const by = (s) => rules.filter((r) => r.status === s)
const active = by("ACTIVE")
const dormant = by("DORMANT")
const retired = by("RETIRED")
const review = by("NEEDS_REVIEW")

console.log("")
console.log("════════════════════════════════════════════")
console.log(" Knowledge GC")
console.log("════════════════════════════════════════════")
console.log("")
console.log(`  ACTIVE        ${String(active.length).padStart(3)}   (agent อ่าน)`)
console.log(`  DORMANT       ${String(dormant.length).padStart(3)}   (พักไว้)`)
console.log(`  RETIRED       ${String(retired.length).padStart(3)}   (มี gate ครอบแล้ว)`)
console.log(`  NEEDS_REVIEW  ${String(review.length).padStart(3)}   (ต้องมีคนตัดสิน)`)
console.log(`  ─────────────────`)
console.log(`  รวม           ${String(rules.length).padStart(3)}`)

if (changes.length) {
  console.log("")
  console.log("  การเปลี่ยนสถานะ:")
  for (const c of changes) console.log(`    ${c.id}: ${c.from} -> ${c.to}`)
}

// ── ⭐ consolidation ratio ──────────────────────────────
const consolidated = rules.filter((r) => r.automatedBy).length / (rules.length || 1)
console.log("")
console.log(`  ⭐ consolidation ratio = ${(consolidated * 100).toFixed(0)}%`)
console.log(
  consolidated < 0.5
    ? "     ความรู้ส่วนใหญ่ยังอยู่ในรูปคำแนะนำ ไม่ใช่ gate\n" +
      "     → คำแนะนำจะถูกเมินเมื่อไฟล์โตขึ้น · gate ทำงานตลอดไป"
    : "     ความรู้ส่วนใหญ่ถูกแปลงเป็น gate แล้ว"
)

if (review.length) {
  console.log("")
  console.log("  ⚠️  ต้องตัดสินด้วยมือ:")
  for (const r of review) console.log(`     ${r.id}: ${r.reviewReason}`)
}

// ── render markdown ที่ agent อ่าน ──────────────────────
const byScope = {}
for (const r of active) {
  for (const s of r.scope ?? ["other"]) {
    ;(byScope[s] ??= []).push(r)
  }
}

const md = [
  "# Fault Attacks (ACTIVE)",
  "",
  `generate จาก ${SRC} เมื่อ ${new Date().toISOString().slice(0, 10)}`,
  `ห้ามแก้ไฟล์นี้โดยตรง — แก้ที่ YAML แล้วรัน knowledge-gc.mjs`,
  "",
  "> ต้องพิจารณาทุกข้อที่ scope ตรงกับงานที่กำลังทำ",
  "",
]

for (const [scope, rs] of Object.entries(byScope).sort()) {
  md.push(`## scope: ${scope}`, "")
  for (const r of rs) {
    md.push(`- [ ] **${r.id}** ${String(r.rule).trim().replace(/\s+/g, " ")}`)
  }
  md.push("")
}

if (WRITE) {
  doc.meta = { ...(doc.meta ?? {}), lastGc: new Date().toISOString().slice(0, 10) }
  writeFileSync(SRC, stringify(doc, { lineWidth: 100 }))
  writeFileSync(OUT, md.join("\n"))
  console.log("")
  console.log(`  ✅ เขียน ${SRC} และ ${OUT} แล้ว`)
} else {
  console.log("")
  console.log("  (dry run — ใส่ --write เพื่อบันทึก)")
}
console.log("")
