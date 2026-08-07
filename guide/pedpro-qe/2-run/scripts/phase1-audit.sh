#!/usr/bin/env bash
# ============================================================
# Phase 1 Audit — วัดของที่มีอยู่ก่อนสร้างอะไรใหม่
#
# ⭐ อย่าสร้าง gate ใหม่บนฐานที่ไม่รู้ว่า gate เก่าทำงานมั้ย
#
# ใช้: ./scripts/phase1-audit.sh
# เวลา: ~10 นาที (ส่วนใหญ่เป็นการรัน suite 3 รอบ)
# ============================================================
set -uo pipefail   # ไม่ใช้ -e เพราะต้องการรันทุกส่วนแม้บางส่วนพัง

REPORT="reports/phase1-audit.md"
mkdir -p reports

# ADAPT: คำสั่งรันเทสของโปรเจกต์จริง
TEST_CMD="${TEST_CMD:-pnpm vitest run}"
SRC_GLOB="${SRC_GLOB:-.}"

{
  echo "# Phase 1 Audit — $(date -Iseconds)"
  echo ""
  echo "commit: \`$(git rev-parse --short HEAD 2>/dev/null || echo unknown)\`"
  echo ""
} > "$REPORT"

section() { echo ""; echo "── $1 ──"; echo "" >> "$REPORT"; echo "## $1" >> "$REPORT"; echo "" >> "$REPORT"; }
note()    { echo "$1"; echo "$1" >> "$REPORT"; }

# ─────────────────────────────────────────────────────────
# 1. Order independence — รัน shuffle 3 seed
#    คู่มือ L2.2 (Independent)
# ─────────────────────────────────────────────────────────
section "1. Order independence (shuffle 3 seed)"

SHUFFLE_FAILS=0
for seed in 1 2 3; do
  echo "   รัน seed=$seed ..."
  if $TEST_CMD --sequence.shuffle --sequence.seed=$seed > "/tmp/shuffle-$seed.log" 2>&1; then
    note "- seed $seed: ผ่าน"
  else
    SHUFFLE_FAILS=$((SHUFFLE_FAILS + 1))
    FAILED_NAMES=$(grep -oE '(FAIL|×) .*' "/tmp/shuffle-$seed.log" | head -5)
    note "- seed $seed: **พัง**"
    echo '```' >> "$REPORT"
    echo "$FAILED_NAMES" >> "$REPORT"
    echo '```' >> "$REPORT"
  fi
done

if [ "$SHUFFLE_FAILS" -gt 0 ]; then
  note ""
  note "⭐ **มีเทสที่พึ่งลำดับการรัน** — นี่คือหนี้ทางเทคนิคที่คุณไม่รู้ว่ามี"
  note "   แก้: reset Pinia ใน beforeEach, ล้าง mock, ใช้ unique namespace"
else
  note ""
  note "✅ order independent ทั้ง 3 seed"
fi

# ─────────────────────────────────────────────────────────
# 2. Grep audit — anti-pattern ที่ยังเหลืออยู่
#    คู่มือ L2.2, L2.6, L2.15
# ─────────────────────────────────────────────────────────
section "2. Grep audit (anti-pattern ที่เหลืออยู่)"

count_pattern() {
  local label="$1" pattern="$2"
  local n
  n=$(grep -rnE "$pattern" --include='*.ts' --include='*.tsx' --include='*.vue' \
        "$SRC_GLOB" 2>/dev/null | grep -v node_modules | wc -l | tr -d ' ')
  printf "   %-34s %s\n" "$label" "$n"
  echo "| $label | $n |" >> "$REPORT"
}

echo "| pattern | จำนวน |" >> "$REPORT"
echo "|---|---|" >> "$REPORT"

count_pattern "waitForTimeout / sleep"      'waitForTimeout|await sleep\('
count_pattern "it.only / describe.only"     '\.(it|describe|test)\.only|\bit\.only|\bdescribe\.only'
count_pattern "it.skip / describe.skip"     '\.skip\('
count_pattern "toBeDefined()"               'toBeDefined\(\)'
count_pattern "toBeTruthy()"                'toBeTruthy\(\)'
count_pattern "v-html (ไม่ sanitize)"        'v-html'
count_pattern "word-break: break-all"       'break-all'
count_pattern "100vh (ควรใช้ 100dvh)"        '100vh'
count_pattern "catch(() => {})"             'catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)'

note ""
note "⭐ ตั้ง ratchet: ตัวเลขพวกนี้ห้ามเพิ่มขึ้นจากวันนี้"

# ─────────────────────────────────────────────────────────
# 3. Fail-closed check — ถ้า report หายไป gate แดงมั้ย
#    คู่มือ L2.11
# ─────────────────────────────────────────────────────────
section "3. Fail-closed check"

# ADAPT: path ของ report ที่ gate อ่าน
REPORT_PATH="${VITEST_REPORT:-reports/vitest.json}"

if [ -f "$REPORT_PATH" ]; then
  mv "$REPORT_PATH" "$REPORT_PATH.bak"
  echo "   ซ่อน $REPORT_PATH แล้วรัน gate ..."

  # ADAPT: คำสั่ง gate จริง
  if ./ci/run-gates.sh > /dev/null 2>&1; then
    note "❌ **gate เขียวทั้งที่ไม่มี report** — นี่คือ gate ปลอม"
    note "   แก้: เพิ่ม \`[ -f \$REPORT ] || exit 1\` ในสคริปต์ gate"
  else
    note "✅ gate แดงเมื่อไม่มี report (fail-closed ถูกต้อง)"
  fi

  mv "$REPORT_PATH.bak" "$REPORT_PATH"
else
  note "⚠️  ไม่พบ $REPORT_PATH — ตั้ง reporter json ใน vitest.config ก่อน"
fi

# ─────────────────────────────────────────────────────────
# 4. Timing — เทสที่ช้าเกินเกณฑ์
#    คู่มือ L2.2 (Fast)
# ─────────────────────────────────────────────────────────
section "4. Timing (เทสที่ช้าที่สุด)"

if [ -f "$REPORT_PATH" ]; then
  echo "| เทส | ms |" >> "$REPORT"
  echo "|---|---|" >> "$REPORT"
  jq -r '
    [.testResults[].assertionResults[]
     | {name: .fullName, ms: (.duration // 0)}]
    | sort_by(-.ms) | .[:10][]
    | "| \(.name) | \(.ms) |"
  ' "$REPORT_PATH" 2>/dev/null | tee -a "$REPORT" | sed 's/^/   /'

  SLOW=$(jq '[.testResults[].assertionResults[] | select((.duration // 0) > 200)] | length' \
    "$REPORT_PATH" 2>/dev/null || echo 0)
  note ""
  note "เทสที่เกิน 200ms: **$SLOW ตัว**"
  [ "$SLOW" -eq 0 ] || note "⭐ 3% ของเทสมักกินเวลา 60% ของ suite — วัดก่อนแก้"
else
  note "⚠️  ข้าม (ไม่มี report)"
fi

# ─────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
echo " เสร็จแล้ว — รายงานอยู่ที่ $REPORT"
echo "════════════════════════════════════════════"
echo ""
echo " ขั้นต่อไป: ./scripts/gate-drill.sh"
echo " (ทดสอบว่า gate ที่มีอยู่เป็นของจริงกี่ตัว)"
