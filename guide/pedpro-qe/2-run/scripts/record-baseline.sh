#!/usr/bin/env bash
# ============================================================
# บันทึกค่า baseline ที่วัดอัตโนมัติได้
#
# ⭐ รันก่อนแก้อะไรทั้งสิ้น
#    ถ้าไม่มีค่า "ก่อน" คุณจะพิสูจน์ไม่ได้ว่าสิ่งที่ทำมีผล
#
# ใช้: ./scripts/record-baseline.sh
# ============================================================
set -uo pipefail

OUT="reports/baseline-$(date +%Y%m%d).json"
mkdir -p reports

SRC="${SRC_GLOB:-.}"
TEST_CMD="${TEST_CMD:-pnpm vitest run}"

echo "════════════════════════════════════════════"
echo " บันทึก baseline — $(date -Iseconds)"
echo "════════════════════════════════════════════"
echo ""

cnt() {
  grep -rnE "$1" --include='*.ts' --include='*.tsx' --include='*.vue' \
    --include='*.css' "$SRC" 2>/dev/null | grep -v node_modules | wc -l | tr -d ' '
}

echo "  [1/5] นับ anti-pattern ..."
WAIT=$(cnt 'waitForTimeout|await sleep\(')
ONLY=$(cnt '\bit\.only|\bdescribe\.only|\btest\.only')
SKIP=$(cnt '\.skip\(')
DEFINED=$(cnt 'toBeDefined\(\)')
TRUTHY=$(cnt 'toBeTruthy\(\)')
VHTML=$(cnt 'v-html')
BREAKALL=$(cnt 'break-all')
VH=$(cnt '100vh')
SWALLOW=$(cnt 'catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)')

echo "  [2/5] นับไฟล์เทส ..."
SPEC_FILES=$(git ls-files '*.spec.ts' '*.test.ts' 2>/dev/null | wc -l | tr -d ' ')

echo "  [3/5] รันเทสเก็บเวลา ..."
START=$(date +%s%3N 2>/dev/null || date +%s000)
$TEST_CMD > /tmp/baseline-test.log 2>&1
TEST_EXIT=$?
END=$(date +%s%3N 2>/dev/null || date +%s000)
DURATION=$((END - START))

REPORT="${VITEST_REPORT:-reports/vitest.json}"
if [ -f "$REPORT" ]; then
  TOTAL=$(jq '.numTotalTests // 0' "$REPORT")
  PASSED=$(jq '.numPassedTests // 0' "$REPORT")
  SLOW=$(jq '[.testResults[].assertionResults[] | select((.duration // 0) > 200)] | length' "$REPORT")
else
  TOTAL=0; PASSED=0; SLOW=0
fi

echo "  [4/5] รัน shuffle 3 seed ..."
SHUFFLE_FAIL=0
for s in 1 2 3; do
  $TEST_CMD --sequence.shuffle --sequence.seed=$s > /dev/null 2>&1 || SHUFFLE_FAIL=$((SHUFFLE_FAIL+1))
done

echo "  [5/5] นับ knowledge ..."
if [ -f pipeline-skill/fault-attacks.yaml ]; then
  RULES=$(grep -c '^- id:' pipeline-skill/fault-attacks.yaml || echo 0)
  AUTOMATED=$(grep -c 'automatedBy: [^n]' pipeline-skill/fault-attacks.yaml || echo 0)
  RATIO=$(awk "BEGIN {printf \"%.2f\", $RULES ? $AUTOMATED/$RULES : 0}")
else
  RULES=0; AUTOMATED=0; RATIO=0
fi

cat > "$OUT" <<JSON
{
  "recordedAt": "$(date -Iseconds)",
  "commit": "$(git rev-parse HEAD 2>/dev/null || echo unknown)",
  "branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)",

  "suite": {
    "specFiles": $SPEC_FILES,
    "totalTests": $TOTAL,
    "passedTests": $PASSED,
    "durationMs": $DURATION,
    "slowTests": $SLOW,
    "shuffleFailures": $SHUFFLE_FAIL,
    "exitCode": $TEST_EXIT
  },

  "antiPatterns": {
    "waitForTimeout": $WAIT,
    "focusedTests": $ONLY,
    "skippedTests": $SKIP,
    "toBeDefined": $DEFINED,
    "toBeTruthy": $TRUTHY,
    "vHtml": $VHTML,
    "breakAll": $BREAKALL,
    "vh100": $VH,
    "swallowedCatch": $SWALLOW
  },

  "knowledge": {
    "totalRules": $RULES,
    "automated": $AUTOMATED,
    "consolidationRatio": $RATIO
  },

  "_manual": {
    "_comment": "ช่องเหล่านี้ต้องรันด้วยมือแล้วเติมเอง",
    "gateDrillTotal": null,
    "gateDrillCaught": null,
    "authzEndpointsTotal": null,
    "authzEndpointsSpecced": null,
    "invariantViolations": null,
    "approvalDrillPassRate": null,
    "blindApproveRate": null,
    "coordinatedOmissionPct": null
  }
}
JSON

echo ""
echo "════════════════════════════════════════════"
echo " ผลลัพธ์"
echo "════════════════════════════════════════════"
printf "  ไฟล์เทส              %s\n" "$SPEC_FILES"
printf "  เทสทั้งหมด            %s (ผ่าน %s)\n" "$TOTAL" "$PASSED"
printf "  เวลารวม              %s ms\n" "$DURATION"
printf "  เทส > 200ms          %s\n" "$SLOW"
printf "  shuffle พัง          %s/3 seed" "$SHUFFLE_FAIL"
[ "$SHUFFLE_FAIL" -gt 0 ] && echo "   ⭐ มีเทสพึ่งลำดับการรัน" || echo "   ✓"
echo ""
printf "  waitForTimeout       %s\n" "$WAIT"
printf "  .only                %s\n" "$ONLY"
printf "  toBeDefined()        %s\n" "$DEFINED"
printf "  toBeTruthy()         %s\n" "$TRUTHY"
printf "  catch ที่กลืน error   %s\n" "$SWALLOW"
echo ""
printf "  consolidation ratio  %s%%\n" "$(awk "BEGIN {printf \"%.0f\", $RATIO*100}")"
echo ""
echo "  บันทึกที่ $OUT"
echo ""
echo "  ⭐ ขั้นต่อไป — ช่องที่ต้องรันด้วยมือ:"
echo "     ./drills/make-drills.sh && ./scripts/gate-drill.sh"
echo "     pnpm test:authz:complete"
echo "     curl -H \"X-Internal-Token: \$T\" \$BASE/api/internal/monitors/run"
