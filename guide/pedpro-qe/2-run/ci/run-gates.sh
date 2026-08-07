#!/usr/bin/env bash
# ============================================================
# Gate chain — ตัวที่ gate-drill.sh เรียก
# เรียงตาม signal-per-second (คู่มือ L2.11)
#
# ADAPT: แก้คำสั่งทุกบรรทัดให้ตรงกับโปรเจกต์จริง
# ============================================================
set -uo pipefail

FAILED=""
run() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "  ✓ $name"
  else
    echo "  ✗ $name"
    FAILED="${FAILED}${name} "
  fi
}

# กลุ่ม A — static (เร็วที่สุด จับได้เยอะที่สุดต่อวินาที)
run "tsc"        pnpm vue-tsc --noEmit
run "eslint"     pnpm eslint .

# กลุ่ม B — test
run "unit"        pnpm vitest run test/unit
run "integration" pnpm vitest run test/integration

# กลุ่ม C — fail-closed check ⭐
if [ ! -f reports/vitest.json ]; then
  echo "  ✗ GATE FAIL: ไม่พบ reports/vitest.json — ถือว่าเทสไม่ได้รัน"
  FAILED="${FAILED}fail-closed "
else
  COUNT=$(jq '.numTotalTests // 0' reports/vitest.json)
  MIN=${MIN_EXPECTED_TESTS:-1}
  if [ "$COUNT" -lt "$MIN" ]; then
    echo "  ✗ GATE FAIL: รันแค่ $COUNT เทส (คาด >= $MIN)"
    FAILED="${FAILED}test-count "
  else
    echo "  ✓ test count ($COUNT)"
  fi
fi

# กลุ่ม D — security
run "authz"   pnpm vitest run security/authz
run "race"    pnpm vitest run security/race

# กลุ่ม E — file-scope guard (ถ้ามี BASE_SHA)
if [ -n "${BASE_SHA:-}" ]; then
  run "file-scope" ./ci/s6-file-scope-guard.sh
fi

if [ -n "$FAILED" ]; then
  echo ""
  echo "GATE FAIL: $FAILED"
  exit 1
fi
echo ""
echo "gate ผ่านทั้งหมด"
