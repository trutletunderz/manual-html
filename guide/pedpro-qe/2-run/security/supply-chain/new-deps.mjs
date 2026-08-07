#!/usr/bin/env node
// ============================================================
// ตรวจ dependency ใหม่ใน PR — คู่มือ L3.4J
// ============================================================
import { execSync } from "node:child_process"

const BASE = process.env.BASE_SHA ?? "origin/main"

let diff = ""
try { diff = execSync(`git diff ${BASE}...HEAD -- package.json`, { encoding: "utf8" }) }
catch { console.log("✅ ไม่มี diff ของ package.json"); process.exit(0) }

const added = [...diff.matchAll(/^\+\s*"([^"]+)":\s*"([^"]+)"/gm)]
  .map((m) => ({ name: m[1], version: m[2] }))
  .filter((d) => !d.name.startsWith("//") && !["name","version","description"].includes(d.name))

if (!added.length) { console.log("✅ ไม่มี dependency ใหม่"); process.exit(0) }

// ADAPT: เติมชื่อ package ที่ใช้บ่อยเพื่อตรวจ typosquatting
const POPULAR = ["react","vue","lodash","axios","express","typescript","vite","nuxt","zod","dayjs"]
const levenshtein = (a, b) => {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) m[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i-1][j]+1, m[i][j-1]+1, m[i-1][j-1] + (a[i-1] !== b[j-1] ? 1 : 0))
  return m[a.length][b.length]
}
const isSimilarToPopular = (n) => POPULAR.some((p) => p !== n && levenshtein(p, n) <= 2)

console.log(`\n⚠️  dependency ใหม่ ${added.length} ตัว:\n`)
let risky = 0

for (const dep of added) {
  let meta = {}, weekly = 0
  try { meta = JSON.parse(execSync(`npm view ${dep.name} --json`, { encoding: "utf8", stdio: ["ignore","pipe","ignore"] })) } catch {}
  try { weekly = JSON.parse(execSync(`curl -s https://api.npmjs.org/downloads/point/last-week/${dep.name}`, { encoding: "utf8" })).downloads ?? 0 } catch {}

  const created = meta.time?.created
  const ageDays = created ? (Date.now() - new Date(created).getTime()) / 864e5 : 0

  const flags = []
  if (ageDays && ageDays < 90) flags.push(`⚠️ package ใหม่ (${ageDays.toFixed(0)} วัน)`)
  if (weekly < 1000) flags.push(`⚠️ download ต่ำ (${weekly}/สัปดาห์)`)
  if (!meta.repository) flags.push("⚠️ ไม่มี repository")
  if (meta.scripts?.postinstall || meta.scripts?.install) flags.push("🔴 มี install script")
  if (isSimilarToPopular(dep.name)) flags.push("🔴 ชื่อคล้าย package ดัง — typosquatting?")

  console.log(`  ${dep.name}@${dep.version}`)
  console.log(`    อายุ ${ageDays.toFixed(0)} วัน | ${weekly.toLocaleString()} dl/wk | ${meta.license ?? "ไม่มี license"}`)
  flags.forEach((f) => console.log(`    ${f}`))
  if (flags.some((f) => f.startsWith("🔴"))) risky++
  console.log()
}

if (risky) {
  console.error(`❌ dependency เสี่ยงสูง ${risky} ตัว — ต้องมี "DEP-APPROVED: <ชื่อ>" ใน commit message`)
  const msgs = execSync(`git log ${BASE}..HEAD --format=%B`, { encoding: "utf8" })
  const approved = [...msgs.matchAll(/DEP-APPROVED:\s*(\S+)/g)].map((m) => m[1])
  const unapproved = added.filter((d) => !approved.includes(d.name))
  if (unapproved.length) { console.error(`   ยังไม่อนุมัติ: ${unapproved.map(d=>d.name).join(", ")}`); process.exit(1) }
}
console.log("✅ ผ่าน")
