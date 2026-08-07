#!/usr/bin/env bash
# ============================================================
# Gate Drill — คู่มือ L2.16
#
# ⭐ gate ที่ไม่เคยถูกทดสอบ = ไม่รู้ว่าเป็น gate หรือเป็นของประดับ
#
# หลักการ: จงใจใส่ defect ที่รู้จัก แล้วดูว่า gate จับได้มั้ย
#          = mutation testing ในระดับ pipeline
#
# ⚠️  ต้องรันบน branch ทิ้งเท่านั้น — สคริปต์นี้แก้ไฟล์จริงแล้ว revert
# ============================================================
set -uo pipefail

# ── ตรวจความปลอดภัยก่อนเริ่ม ────────────────────────────
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  echo "❌ ห้ามรันบน $BRANCH — สร้าง branch ทิ้งก่อน:" >&2
  echo "     git checkout -b drill/$(date +%Y%m%d)" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "❌ working tree ไม่สะอาด — commit หรือ stash ก่อน" >&2
  git status --short >&2
  exit 1
fi

DRILL_DIR="${DRILL_DIR:-drills/generated}"
[ -d "$DRILL_DIR" ] || { echo "❌ ไม่พบ $DRILL_DIR — รัน ./drills/make-drills.sh ก่อน" >&2; exit 1; }

REPORT="reports/gate-drill-$(date +%Y%m%d).md"
mkdir -p reports

TOTAL=0
CAUGHT=0
MISSED=()

{
  echo "# Gate Drill — $(date -Iseconds)"
  echo ""
  echo "| # | drill | gate ที่ควรจับ | ผล |"
  echo "|---|---|---|---|"
} > "$REPORT"

echo ""
echo "════════════════════════════════════════════"
echo " Gate Drill — branch: $BRANCH"
echo "════════════════════════════════════════════"
echo ""

for patch in "$DRILL_DIR"/*.patch; do
  [ -f "$patch" ] || continue
  TOTAL=$((TOTAL + 1))

  NAME=$(basename "$patch" .patch)
  # อ่าน metadata จากบรรทัดแรกของ patch (# EXPECT: <gate name>)
  EXPECT=$(head -3 "$patch" | grep -oP '(?<=# EXPECT: ).*' || echo "unknown")

  printf "  [%2d] %-28s " "$TOTAL" "$NAME"

  if ! git apply --check "$patch" 2>/dev/null; then
    printf "⊘ apply ไม่ได้ (โค้ดเปลี่ยนไปแล้ว)\n"
    echo "| $TOTAL | $NAME | $EXPECT | ⊘ ต้องอัปเดต patch |" >> "$REPORT"
    continue
  fi

  git apply "$patch"

  # ADAPT: gate chain จริงของโปรเจกต์
  if ./ci/run-gates.sh > "/tmp/drill-$NAME.log" 2>&1; then
    # gate เขียว = defect หลุด = gate ไม่ทำงาน
    printf "❌ HOLE — ผ่าน gate ทั้งที่ควรถูกจับ\n"
    MISSED+=("$NAME (ควรถูกจับโดย: $EXPECT)")
    echo "| $TOTAL | $NAME | $EXPECT | ❌ **หลุด** |" >> "$REPORT"
  else
    FAILED_GATE=$(grep -oE 'GATE FAIL:.*|FAIL .*' "/tmp/drill-$NAME.log" | head -1 || echo "?")
    printf "✅ จับได้\n"
    CAUGHT=$((CAUGHT + 1))
    echo "| $TOTAL | $NAME | $EXPECT | ✅ จับได้ |" >> "$REPORT"
  fi

  git checkout -- . 2>/dev/null || true
  git clean -fd --quiet 2>/dev/null || true
done

# ─────────────────────────────────────────────────────────
{
  echo ""
  echo "## สรุป"
  echo ""
  echo "- drill ทั้งหมด: **$TOTAL**"
  echo "- จับได้: **$CAUGHT**"
  echo "- หลุด: **$((TOTAL - CAUGHT))**"
  echo ""
} >> "$REPORT"

echo ""
echo "════════════════════════════════════════════"
echo " จับได้ $CAUGHT/$TOTAL"
echo "════════════════════════════════════════════"

if [ ${#MISSED[@]} -gt 0 ]; then
  echo ""
  echo "⭐ gate ที่เป็นของปลอม:"
  echo "" >> "$REPORT"
  echo "### gate ที่ต้องแก้" >> "$REPORT"
  echo "" >> "$REPORT"
  for m in "${MISSED[@]}"; do
    echo "   - $m"
    echo "- $m" >> "$REPORT"
  done
  echo ""
  echo "   ⭐ แก้ gate พวกนี้ก่อนสร้าง gate ใหม่"
  echo "      การสร้าง gate บนฐานที่ไม่รู้ว่า gate เก่าทำงานมั้ย"
  echo "      = สร้างความมั่นใจปลอมทับความมั่นใจปลอม"
  echo ""
  echo "รายงาน: $REPORT"
  exit 1
fi

echo ""
echo " ✅ gate ทุกตัวทำงานจริง"
echo " รายงาน: $REPORT"
