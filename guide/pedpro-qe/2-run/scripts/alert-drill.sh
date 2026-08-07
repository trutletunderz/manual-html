#!/usr/bin/env bash
# ============================================================
# Alert Drill — คู่มือ L3.9
#
# ⭐ alert ที่ไม่เคยถูกทดสอบ = ไม่รู้ว่ามันดังจริงมั้ย
#    และคุณจะรู้จากลูกค้าที่โกรธแทน
#
# ความถี่: เดือนละครั้ง
# ============================================================
set -uo pipefail

BASE="${BASE_URL:?ต้องตั้ง BASE_URL}"
TOKEN="${INTERNAL_TOKEN:?ต้องตั้ง INTERNAL_TOKEN}"
TARGET_MIN="${TARGET_MINUTES:-5}"

echo "════════════════════════════════════════════"
echo " Alert Drill — $(date -Iseconds)"
echo "════════════════════════════════════════════"
echo ""
echo " ⚠️  drill นี้จะทำให้ error rate พุ่งชั่วคราว"
read -p " ยืนยันว่าอยู่ใน staging ไม่ใช่ production? (yes) " ok
[ "$ok" = "yes" ] || exit 1

START=$(date +%s)

# ── 1. ยิง 5xx จำนวนมากในเวลาสั้น ──
echo ""
echo " [1/3] ยิง error 50 ครั้ง ..."
for i in $(seq 1 50); do
  curl -s -o /dev/null -H "X-Internal-Token: $TOKEN" \
    "$BASE/api/internal/_force-error?drill=1" &
done
wait
echo "       ยิงเสร็จ $(date +%T)"

# ── 2. ทำให้ invariant ละเมิดชั่วคราว ──
echo ""
echo " [2/3] ทำให้ INV-1 ละเมิด (จะ revert อัตโนมัติใน 60 วินาที) ..."
curl -s -X POST -H "X-Internal-Token: $TOKEN" \
  "$BASE/api/internal/_break-invariant?inv=INV-1&autoRevertSec=60" \
  -o /dev/null && echo "       ทำให้ละเมิดแล้ว" || echo "       ⚠️ endpoint นี้ยังไม่มี — ข้าม"

# ── 3. จับเวลา ──
echo ""
echo " [3/3] รอ alert ..."
echo ""
echo "════════════════════════════════════════════"
echo " ⭐ จับเวลาเอง — เป้า < ${TARGET_MIN} นาที"
echo "════════════════════════════════════════════"
echo ""
echo " เริ่มยิงเมื่อ: $(date -d @$START +%T 2>/dev/null || date -r $START +%T)"
echo ""
read -p " กด Enter เมื่อ alert เข้า (หรือ Ctrl-C ถ้าไม่เข้าเลย): "

ELAPSED=$(( $(date +%s) - START ))
MIN=$(( ELAPSED / 60 ))

echo ""
echo " alert เข้าหลัง ${ELAPSED}s (${MIN} นาที)"
echo ""
echo " ⭐ บันทึกลง docs/drill-log.md:"
echo "    | $(date +%F) | 5xx + INV-1 | ใช่ | ${ELAPSED}s | $([ $MIN -lt $TARGET_MIN ] && echo ใช่ || echo ไม่) |"
echo ""
[ "$MIN" -lt "$TARGET_MIN" ] || echo " ❌ ช้าเกินเป้า — ทบทวน alert threshold และ notification channel"
