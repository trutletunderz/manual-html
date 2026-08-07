#!/usr/bin/env bash
# ============================================================
# Emergency Deploy — คู่มือ L4.8
#
# ⭐ นี่คือข้อยกเว้นเดียวของ "ไม่มี gate ที่ข้ามได้"
#    gate ที่ข้ามไม่ได้จะยังรันอยู่ — เพราะมันคือกลุ่มที่
#    ป้องกันไม่ให้ hotfix สร้างปัญหาใหม่
# ============================================================
set -euo pipefail

[ -n "${EMERGENCY_REASON:-}" ] || { echo "❌ ต้องระบุ EMERGENCY_REASON" >&2; exit 1; }
[ -n "${INCIDENT_ID:-}" ]     || { echo "❌ ต้องมี INCIDENT_ID (สร้าง ticket ก่อน)" >&2; exit 1; }

echo "════════════════════════════════════════════"
echo " ⚠️  EMERGENCY DEPLOY"
echo "════════════════════════════════════════════"
echo "  เหตุผล:   $EMERGENCY_REASON"
echo "  incident: $INCIDENT_ID"
echo "  commit:   $(git rev-parse --short HEAD)"
echo ""
echo "  ลำดับหยุดเลือด (ควรลองตามลำดับก่อนมาถึงข้อ 4):"
echo "    1. Feature flag off        (~10 วินาที · ไม่เพิ่มความเสี่ยง)"
echo "    2. Rate limit ที่ edge      (~1 นาที · ไม่เพิ่มความเสี่ยง)"
echo "    3. Traffic shift revision เก่า (~1 นาที · ไม่เพิ่มความเสี่ยง)"
echo "    4. Hotfix ข้าม gate         (~15 นาที · 🔴 เพิ่มความเสี่ยงใหม่)"
echo ""
read -p "  ยืนยันว่าลองข้อ 1-3 แล้วไม่ได้ผล? (yes) " ok
[ "$ok" = "yes" ] || { echo "  -> กลับไปลองข้อ 1-3 ก่อน"; exit 1; }

echo ""
echo "  รัน gate ที่ข้ามไม่ได้ ..."

fail() { echo "  ❌ $1 — หยุด ไม่ deploy" >&2; exit 1; }

echo "    [1/5] tsc ..."
pnpm vue-tsc --noEmit || fail "tsc"

echo "    [2/5] unit test ของไฟล์ที่แก้ ..."
pnpm vitest run --changed || fail "unit test"

echo "    [3/5] authz enforcement ..."
pnpm vitest run security/authz || fail "authz"

echo "    [4/5] race condition ..."
pnpm vitest run security/race || fail "race"

echo "    [5/5] invariant check ..."
curl -sf -H "X-Internal-Token: ${INTERNAL_TOKEN:?}" \
  "${BASE_URL:?}/api/internal/monitors/run" > /dev/null || fail "invariant"

# ── บันทึก audit trail ──
mkdir -p docs
cat >> docs/emergency-log.md <<LOG

## $(date -Iseconds) · $INCIDENT_ID
- **เหตุผล:** $EMERGENCY_REASON
- **commit:** \`$(git rev-parse HEAD)\`
- **gate ที่ข้าม:** e2e, visual, a11y, load, LLM reviewer, mutation
- **gate ที่รัน:** tsc, unit(changed), authz, race, invariant
- **ผู้อนุมัติ:** $(git config user.name 2>/dev/null || echo unknown)
- **TODO:**
  - [ ] postmortem ภายใน 24 ชม.
  - [ ] เทสที่จับเหตุการณ์นี้ ภายใน 48 ชม. (ต้องแดงก่อนแก้)
  - [ ] รัน gate ที่ข้ามย้อนหลัง ภายใน 7 วัน
  - [ ] อัปเดต fault-attacks.yaml
LOG

echo ""
echo "  deploy ..."
# ADAPT: คำสั่ง deploy จริง
gcloud run deploy "${CLOUD_RUN_SERVICE:?}" --source . \
  --region "${CLOUD_RUN_REGION:-asia-southeast1}" --quiet

echo ""
echo "════════════════════════════════════════════"
echo " ✅ deployed"
echo "════════════════════════════════════════════"
echo " ⭐ TODO ถูกบันทึกใน docs/emergency-log.md แล้ว"
echo "    postmortem ภายใน 24 ชม. เป็นข้อบังคับ ไม่ใช่ทางเลือก"
