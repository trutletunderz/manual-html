#!/usr/bin/env bash
# ============================================================
# S6 File-Scope Guard  —  คู่มือ L2.14
#
# ปิด agent failure mode 4 ตัวพร้อมกัน:
#   #1 แก้เทสแทนแก้โค้ด
#   #2 ลบเทสที่แดง
#   #5 snapshot abuse
#   #6 เพิ่ม timeout เมื่อ flaky
#
# ใช้: BASE_SHA=<sha> HEAD_SHA=<sha> ./ci/s6-file-scope-guard.sh
# ============================================================
set -euo pipefail

BASE_SHA="${BASE_SHA:?ต้องระบุ BASE_SHA}"
HEAD_SHA="${HEAD_SHA:-HEAD}"

# ADAPT: ถ้าใช้นามสกุลอื่น เช่น .test.tsx ให้เพิ่มใน pattern
TEST_PATTERN='\.(spec|test)\.(ts|tsx|js|jsx)$'

# ADAPT: stage ที่รัน guard นี้ — S4 = implementation stage
STAGE="${PIPELINE_STAGE:-S4}"

fail() { echo "❌ GATE FAIL: $*" >&2; exit 1; }
ok()   { echo "✅ $*"; }

CHANGED=$(git diff --name-only "$BASE_SHA".."$HEAD_SHA")

if [ -z "$CHANGED" ]; then
  ok "ไม่มีไฟล์เปลี่ยน — ข้าม"
  exit 0
fi

# ─────────────────────────────────────────────────────────
# 1. implementation stage ห้ามแตะไฟล์เทส
#    ⭐ นี่คือ maker/checker split ในระดับไฟล์
# ─────────────────────────────────────────────────────────
if [ "$STAGE" = "S4" ] || [ "$STAGE" = "S5" ]; then
  TOUCHED_TESTS=$(echo "$CHANGED" | grep -E "$TEST_PATTERN" || true)
  if [ -n "$TOUCHED_TESTS" ]; then
    echo "ไฟล์เทสที่ถูกแก้ใน stage $STAGE:" >&2
    echo "$TOUCHED_TESTS" | sed 's/^/    /' >&2
    fail "stage $STAGE แก้ไฟล์เทสไม่ได้ — ถ้าเทสผิดต้องกลับไปแก้ที่ S3"
  fi
  ok "S4/S5 ไม่ได้แตะไฟล์เทส"
fi

# ─────────────────────────────────────────────────────────
# 2. ห้ามลดจำนวนไฟล์เทส (เว้นแต่มี RISK-ACCEPT)
#    ⭐ การลบเทส = การรับความเสี่ยงกลับมา ต้องมีคนเซ็นรับ
# ─────────────────────────────────────────────────────────
BASE_COUNT=$(git ls-tree -r "$BASE_SHA" --name-only | grep -cE "$TEST_PATTERN" || echo 0)
HEAD_COUNT=$(git ls-tree -r "$HEAD_SHA" --name-only | grep -cE "$TEST_PATTERN" || echo 0)

if [ "$HEAD_COUNT" -lt "$BASE_COUNT" ]; then
  DELETED=$((BASE_COUNT - HEAD_COUNT))
  if git log "$BASE_SHA".."$HEAD_SHA" --format=%B | grep -q "RISK-ACCEPT:"; then
    ok "ลบไฟล์เทส $DELETED ไฟล์ แต่มี RISK-ACCEPT ใน commit message"
  else
    echo "ไฟล์เทสลดลง $DELETED ไฟล์ ($BASE_COUNT → $HEAD_COUNT)" >&2
    fail "ลบไฟล์เทสต้องมี 'RISK-ACCEPT: <risk item ที่หมดคนคุ้มครอง>' ใน commit message"
  fi
else
  ok "จำนวนไฟล์เทสไม่ลดลง ($BASE_COUNT → $HEAD_COUNT)"
fi

# ─────────────────────────────────────────────────────────
# 3. ห้ามเพิ่ม timeout
#    ⭐ flaky ต้องแก้ root cause ไม่ใช่ยืดเวลารอ
# ─────────────────────────────────────────────────────────
TIMEOUT_ADDED=$(git diff "$BASE_SHA".."$HEAD_SHA" -- '*.ts' '*.tsx' '*.js' \
  | grep -E '^\+.*(timeout|waitForTimeout|setTimeout)[^a-zA-Z].*[0-9]{4,}' || true)

if [ -n "$TIMEOUT_ADDED" ]; then
  echo "บรรทัดที่เพิ่ม timeout:" >&2
  echo "$TIMEOUT_ADDED" | head -10 | sed 's/^/    /' >&2
  fail "เพิ่ม timeout ≥ 1000ms — ต้องหา root cause แทน (คู่มือ L2.7)"
fi
ok "ไม่มีการเพิ่ม timeout"

# ─────────────────────────────────────────────────────────
# 4. ห้าม snapshot ถูก update แบบยกชุด
# ─────────────────────────────────────────────────────────
SNAP_CHANGED=$(echo "$CHANGED" | grep -cE '\.snap$' || echo 0)
if [ "$SNAP_CHANGED" -gt 3 ]; then
  if ! git log "$BASE_SHA".."$HEAD_SHA" --format=%B | grep -q "SNAPSHOT-REVIEWED:"; then
    fail "แก้ snapshot $SNAP_CHANGED ไฟล์ — ต้องมี 'SNAPSHOT-REVIEWED:' พร้อมเหตุผล"
  fi
fi
ok "snapshot อยู่ในเกณฑ์ ($SNAP_CHANGED ไฟล์)"

# ─────────────────────────────────────────────────────────
# 5. red-proof ต้องมีอยู่จริงถ้ามีเทสใหม่
#    ⭐ เทสที่ไม่เคยแดง = ไม่มีหลักฐานว่ามันจับอะไรได้
# ─────────────────────────────────────────────────────────
NEW_TESTS=$(git diff --name-only --diff-filter=A "$BASE_SHA".."$HEAD_SHA" \
  | grep -E "$TEST_PATTERN" || true)

if [ -n "$NEW_TESTS" ]; then
  # ADAPT: path ของ red-proof ตาม pipeline จริง
  RED_PROOF="${RED_PROOF_PATH:-reports/red-proof.json}"
  [ -f "$RED_PROOF" ] || fail "มีเทสใหม่แต่ไม่มี $RED_PROOF (คู่มือ L2.2)"

  FAILING=$(jq -r '.failingTests | length' "$RED_PROOF" 2>/dev/null || echo 0)
  [ "$FAILING" -ge 1 ] || fail "red-proof มี failingTests = 0 — เทสใหม่เขียวตั้งแต่ยังไม่เขียนโค้ด"
  ok "red-proof ถูกต้อง (มีเทสที่เคยแดง $FAILING ตัว)"
fi

echo ""
ok "file-scope guard ผ่านทั้งหมด"
