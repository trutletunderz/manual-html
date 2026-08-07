#!/usr/bin/env bash
# ============================================================
# Rollback Drill — คู่มือ L3.8.1
#
# คำถาม: ถ้า revision ใหม่พังตอนตี 3 คุณ rollback ภายในกี่นาที
#        และคุณเคย "ทดสอบ" การ rollback นั้นจริงๆ หรือแค่เชื่อว่าทำได้?
#
# ความถี่: เดือนละครั้ง · เวลา: ~10 นาที
# ============================================================
set -euo pipefail

# ADAPT
SERVICE="${CLOUD_RUN_SERVICE:?ต้องตั้ง CLOUD_RUN_SERVICE}"
REGION="${CLOUD_RUN_REGION:-asia-southeast1}"
SMOKE_CMD="${SMOKE_CMD:-pnpm exec playwright test --grep @smoke}"
TARGET_SECONDS="${TARGET_SECONDS:-300}"

START=$(date +%s)
echo "════════════════════════════════════════════"
echo " Rollback Drill — $(date -Iseconds)"
echo "════════════════════════════════════════════"

# 1. หา revision ปัจจุบันและตัวก่อนหน้า
CURRENT=$(gcloud run services describe "$SERVICE" --region "$REGION" \
  --format='value(status.traffic[0].revisionName)')
PREVIOUS=$(gcloud run revisions list --service "$SERVICE" --region "$REGION" \
  --format='value(metadata.name)' --sort-by='~metadata.creationTimestamp' | sed -n '2p')

echo "  current  = $CURRENT"
echo "  previous = $PREVIOUS"
[ -n "$PREVIOUS" ] || { echo "❌ ไม่มี revision ก่อนหน้า — rollback ไม่ได้!"; exit 1; }

# 2. rollback
echo ""
echo "  [1/4] ย้าย traffic ไป $PREVIOUS ..."
gcloud run services update-traffic "$SERVICE" --region "$REGION" \
  --to-revisions="$PREVIOUS=100" --quiet

# 3. ยืนยันว่า traffic ไปถูกที่จริง
echo "  [2/4] ยืนยัน traffic ..."
sleep 5
ACTIVE=$(gcloud run services describe "$SERVICE" --region "$REGION" \
  --format='value(status.traffic[0].revisionName)')
[ "$ACTIVE" = "$PREVIOUS" ] || { echo "❌ traffic ยังไม่ย้าย (ได้ $ACTIVE)"; exit 1; }

# 4. smoke test — ⭐ rollback ที่ไม่ได้ทดสอบ = ไม่รู้ว่าใช้ได้
echo "  [3/4] smoke test ..."
$SMOKE_CMD || { echo "❌ smoke พังหลัง rollback — revision เก่าใช้ไม่ได้แล้ว"; exit 1; }

# 5. กลับมา revision เดิม
echo "  [4/4] กลับไป $CURRENT ..."
gcloud run services update-traffic "$SERVICE" --region "$REGION" \
  --to-revisions="$CURRENT=100" --quiet

ELAPSED=$(( $(date +%s) - START ))
echo ""
echo "════════════════════════════════════════════"
echo " เสร็จใน ${ELAPSED}s (เป้า < ${TARGET_SECONDS}s)"
echo "════════════════════════════════════════════"
echo ""
echo " ⭐ บันทึกลง docs/drill-log.md:"
echo "    | $(date +%F) | ${ELAPSED}s | $([ $ELAPSED -lt $TARGET_SECONDS ] && echo ใช่ || echo ไม่) | <สิ่งที่ค้นพบ> |"
echo ""
echo " สิ่งที่ drill นี้มักค้นพบ:"
echo "   - DB migration ที่ย้อนกลับไม่ได้"
echo "   - revision เก่าถูกลบเพราะ retention สั้น"
echo "   - env var เปลี่ยนไปแล้ว revision เก่าใช้ไม่ได้"
echo "   - ไม่รู้คำสั่งจริง ต้องหาใน Google 10 นาที  <- เหตุผลหลักที่ต้อง drill"

[ "$ELAPSED" -lt "$TARGET_SECONDS" ] || { echo ""; echo "❌ เกินเป้า — ต้องปรับปรุงกระบวนการ"; exit 1; }
