#!/usr/bin/env bash
# ============================================================
# สร้าง drill patch 10 ตัว — คู่มือ L2.16
#
# วิธีทำงาน: แก้ไฟล์จริง → git diff เก็บเป็น patch → revert
#
# ⚠️  ต้องรันบน branch ทิ้ง และ working tree ต้องสะอาด
# ============================================================
set -uo pipefail

BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCH" != "main" ] && [ "$BRANCH" != "master" ] || {
  echo "❌ ห้ามรันบน $BRANCH" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || {
  echo "❌ working tree ไม่สะอาด" >&2; exit 1; }

OUT="drills/generated"
mkdir -p "$OUT"
rm -f "$OUT"/*.patch

# ── ADAPT: ตั้งค่าให้ตรงกับโปรเจกต์จริง ──────────────────
SPEC_FILE="${SPEC_FILE:-$(git ls-files '*.spec.ts' | head -1)}"
VALIDATOR="${VALIDATOR:-$(git ls-files 'utils/**/validate*.ts' 'utils/**/*amount*.ts' | head -1)}"
CONFIG_FILE="${CONFIG_FILE:-vitest.config.ts}"
E2E_FILE="${E2E_FILE:-$(git ls-files 'e2e/*.spec.ts' | head -1)}"

[ -n "$SPEC_FILE" ] || { echo "❌ หาไฟล์ .spec.ts ไม่เจอ — ตั้ง SPEC_FILE เอง" >&2; exit 1; }

echo "ใช้ไฟล์เป้าหมาย:"
echo "  SPEC_FILE   = $SPEC_FILE"
echo "  VALIDATOR   = ${VALIDATOR:-(ไม่พบ — ข้าม D3)}"
echo "  CONFIG_FILE = $CONFIG_FILE"
echo ""

# helper: สร้าง patch จากการแก้ไฟล์
make_patch() {
  local name="$1" expect="$2" ; shift 2
  # รันคำสั่งแก้ไฟล์ที่ส่งมา
  "$@" || { echo "  ⊘ $name — ข้าม (แก้ไฟล์ไม่ได้)"; git checkout -- . ; return; }

  if [ -z "$(git status --porcelain)" ]; then
    echo "  ⊘ $name — ข้าม (ไม่มีอะไรเปลี่ยน)"
    return
  fi

  {
    echo "# DRILL: $name"
    echo "# EXPECT: $expect"
    echo "#"
    git diff
  } > "$OUT/$name.patch"

  git checkout -- .
  echo "  ✅ $name"
}

echo "กำลังสร้าง drill:"

# ── D1: it.only หลุดเข้า main ────────────────────────────
make_patch "d1-it-only" "ESLint no-focused-tests" \
  bash -c "sed -i '0,/\bit(/s//it.only(/' '$SPEC_FILE'"

# ── D2: ลบ expect ออกจากเทส ──────────────────────────────
make_patch "d2-no-assertion" "ESLint expect-expect" \
  bash -c "sed -i '0,/expect(/s/expect(/void (/' '$SPEC_FILE'"

# ── D3: off-by-one ที่ขอบ (BVA) ⭐ ───────────────────────
if [ -n "${VALIDATOR:-}" ]; then
  make_patch "d3-off-by-one" "unit test (BVA)" \
    bash -c "sed -i '0,/>=/s/>=/>/' '$VALIDATOR'"
fi

# ── D4: ลบ report ที่ gate อ่าน (fail-closed) ────────────
cat > "$OUT/d4-missing-report.patch" <<'PATCH'
# DRILL: d4-missing-report
# EXPECT: fail-closed check ใน gate script
#
# หมายเหตุ: drill นี้ไม่ใช่ patch — ต้องทำด้วยมือ
#   mv reports/vitest.json /tmp/ && ./ci/run-gates.sh
#   ถ้าเขียว = gate ปลอม
PATCH
echo "  ✅ d4-missing-report (manual)"

# ── D5: เพิ่ม timeout ────────────────────────────────────
make_patch "d5-timeout-bump" "file-scope guard (ห้ามเพิ่ม timeout)" \
  bash -c "printf '\n// drill\nconst DRILL_TIMEOUT = 60000\n' >> '$SPEC_FILE'"

# ── D6: waitForTimeout ใน E2E ────────────────────────────
if [ -n "${E2E_FILE:-}" ]; then
  make_patch "d6-wait-timeout" "grep gate (ห้าม waitForTimeout)" \
    bash -c "printf '\n// drill\n// await page.waitForTimeout(3000)\n' | sed 's|// await|await|' >> '$E2E_FILE'"
fi

# ── D7: ลบไฟล์เทส 1 ไฟล์ ────────────────────────────────
SPEC_COUNT=$(git ls-files '*.spec.ts' | wc -l | tr -d ' ')
if [ "$SPEC_COUNT" -gt 1 ]; then
  VICTIM=$(git ls-files '*.spec.ts' | tail -1)
  make_patch "d7-delete-test" "test count >= baseline" \
    bash -c "git rm -q --cached '$VICTIM' && rm '$VICTIM'"
fi

# ── D8: assertion ที่ไม่มีความหมาย ───────────────────────
make_patch "d8-weak-assertion" "S7 review / mutation" \
  bash -c "sed -i '0,/expect(\(.*\))\.toBe(/s//expect(\1).toBeDefined() \&\& expect(\1).toBe(/' '$SPEC_FILE' 2>/dev/null || sed -i '0,/toBe(/s/toBe(/toBeDefined() || toBe(/' '$SPEC_FILE'"

# ── D9: unhandled fetch (MSW strict) ─────────────────────
cat > "$OUT/d9-unhandled-fetch.patch" <<'PATCH'
# DRILL: d9-unhandled-fetch
# EXPECT: MSW onUnhandledRequest: "error"
#
# หมายเหตุ: ต้องทำด้วยมือ — เพิ่มบรรทัดนี้ในโค้ดที่เทสเรียก
#   await fetch("/api/does-not-exist-drill")
# ถ้าเทสยังเขียว = MSW ไม่ได้ตั้ง strict
PATCH
echo "  ✅ d9-unhandled-fetch (manual)"

# ── D10: unit test ที่ช้าเกินเกณฑ์ ──────────────────────
make_patch "d10-slow-test" "timing gate (unit > 200ms)" \
  bash -c "printf '\nit(\"drill: slow\", async () => { await new Promise(r => setTimeout(r, 500)); expect(1).toBe(1) })\n' >> '$SPEC_FILE'"

echo ""
echo "════════════════════════════════════════════"
echo " สร้าง drill $(ls -1 "$OUT"/*.patch 2>/dev/null | wc -l | tr -d ' ') ตัวใน $OUT"
echo "════════════════════════════════════════════"
echo ""
echo " ⭐ ตรวจ patch ด้วยตาก่อนรัน — บางตัวอาจ apply ไม่ได้"
echo "    ถ้า apply ไม่ได้ ให้แก้ไฟล์เป้าหมายใน ADAPT ด้านบน"
echo ""
echo " ขั้นต่อไป: ./scripts/gate-drill.sh"
