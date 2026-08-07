#!/usr/bin/env bash
# ============================================================
# Flake Detection — คู่มือ L2.7
#
# ⭐ วัด flake ที่ "attempt แรก" ไม่ใช่ผลสุดท้าย
#    ถ้ามี retry 2 ครั้ง p=5% จะเขียว 97.5% โดยไม่แก้อะไรเลย
#
# ความถี่: nightly
# ============================================================
set -uo pipefail

RUNS="${FLAKE_RUNS:-10}"
TEST_CMD="${TEST_CMD:-pnpm vitest run}"
OUT="reports/flake-$(date +%Y%m%d).json"
mkdir -p reports /tmp/flake

echo "════════════════════════════════════════════"
echo " Flake Detection — รัน $RUNS รอบ"
echo "════════════════════════════════════════════"

for i in $(seq 1 "$RUNS"); do
  printf "  รอบ %2d/%s ... " "$i" "$RUNS"
  # ⭐ retry=0 — ต้องวัดที่ attempt แรก
  $TEST_CMD --retry=0 --reporter=json --outputFile="/tmp/flake/run-$i.json" > /dev/null 2>&1
  if [ -f "/tmp/flake/run-$i.json" ]; then
    F=$(jq '.numFailedTests // 0' "/tmp/flake/run-$i.json")
    echo "พัง $F ตัว"
  else
    echo "ไม่มี report"
  fi
done

node - <<'NODE'
import { readFileSync, writeFileSync, existsSync } from "node:fs"

const RUNS = Number(process.env.FLAKE_RUNS ?? 10)
const runs = []
for (let i = 1; i <= RUNS; i++) {
  const p = `/tmp/flake/run-${i}.json`
  if (existsSync(p)) runs.push(JSON.parse(readFileSync(p, "utf8")))
}

const results = new Map()
for (const run of runs)
  for (const file of run.testResults ?? [])
    for (const t of file.assertionResults ?? []) {
      const key = t.fullName
      if (!results.has(key)) results.set(key, { pass: 0, fail: 0 })
      results.get(key)[t.status === "passed" ? "pass" : "fail"]++
    }

const flaky = [...results.entries()]
  .filter(([, r]) => r.pass > 0 && r.fail > 0)
  .map(([name, r]) => ({ name, failRate: r.fail / (r.pass + r.fail) }))
  .sort((a, b) => b.failRate - a.failRate)

// ⭐ correlation index — retry ช่วยได้มั้ย
const failedRuns = runs.filter((r) => (r.numFailedTests ?? 0) > 0)
const multiFail = failedRuns.filter((r) => (r.numFailedTests ?? 0) > 1)
const correlation = failedRuns.length ? multiFail.length / failedRuns.length : 0

const total = results.size
const buildGreen = runs.filter((r) => (r.numFailedTests ?? 0) === 0).length / (runs.length || 1)

console.log("")
console.log("════════════════════════════════════════════")
console.log(` เทสทั้งหมด        ${total}`)
console.log(` เทสที่ flaky       ${flaky.length}  (${((flaky.length/total)*100).toFixed(2)}%)`)
console.log(` build เขียว        ${(buildGreen*100).toFixed(0)}%  (${runs.length} รอบ)`)
console.log(` correlation index  ${correlation.toFixed(2)}`)
console.log("════════════════════════════════════════════")

if (correlation > 0.4)
  console.log(" ⭐ correlation สูง — flake มาจากสาเหตุร่วม (env/resource)")
else if (flaky.length)
  console.log(" flake เป็นอิสระต่อกัน — retry ช่วยได้ แต่ยังต้องแก้")

if (flaky.length) {
  console.log("\n Top 10 flaky:")
  flaky.slice(0, 10).forEach((f) =>
    console.log(`   ${(f.failRate*100).toFixed(0).padStart(3)}%  ${f.name}`))
}

writeFileSync(process.env.OUT ?? "reports/flake.json", JSON.stringify({
  recordedAt: new Date().toISOString(),
  runs: runs.length, totalTests: total,
  flakyCount: flaky.length,
  flakeRate: total ? flaky.length / total : 0,
  buildGreenRate: buildGreen,
  correlationIndex: correlation,
  flaky,
}, null, 2))

// ⭐ เป้า < 0.1% — ที่ n=200 แค่ p=0.5% ก็ทำให้ build 63% แดงโดยไม่มีบั๊ก
process.exit(total && flaky.length / total > 0.001 ? 1 : 0)
NODE
