# RUNBOOK — ทำให้ kit รันได้จริง

> **สมมติฐาน:** ยังไม่มีอะไรถูกรันเลย · 46 จุด ADAPT ยังไม่ได้เติม
>
> **⭐ คาดหวังว่าจะพัง** — โค้ด 59 ไฟล์ที่ไม่เคยรันย่อมมีบั๊ก
> เป้าหมายของ runbook นี้ไม่ใช่ให้ทุกอย่างเขียว
> แต่คือ**ให้รันได้ถึงจุดที่มันบอกความจริงกับคุณ**

---

## ลำดับ — ห้ามข้าม

```
STEP 0  ต่อสายไฟ         30 นาที   ← ทุกข้อหลังพึ่งข้อนี้
STEP 1  baseline          20 นาที
STEP 2  gate drill        90 นาที   ⭐ ข้อที่ได้ผลตอบแทนสูงสุด
STEP 3  authz             45 นาที
STEP 4  invariant          3 ชั่วโมง ⭐ ข้อที่แพงที่สุดและคุ้มที่สุด
STEP 5  approval drill    ต่อเนื่อง
```

**รวม ~6 ชั่วโมง** กระจายได้หลายวัน · แต่ละ step จบในตัว

---

# STEP 0 · ต่อสายไฟ

## 0.1 ตรวจเครื่องมือ

```bash
node -v      # ต้อง >= 20
pnpm -v
jq --version # ⭐ สคริปต์หลายตัวใช้ — ถ้าไม่มีจะพังแบบงงๆ
git --version
```

ถ้าไม่มี `jq`:
```bash
# macOS
brew install jq
# Ubuntu
sudo apt install jq
```

## 0.2 คัดลอกไฟล์เข้าโปรเจกต์

```bash
cd <โปรเจกต์ของคุณ>

cp -r <kit>/ci          .
cp -r <kit>/scripts     .
cp -r <kit>/drills      .
cp -r <kit>/security    .
cp -r <kit>/monitors    .
cp -r <kit>/test/setup  test/
cp -r <kit>/test/fixtures test/
cp -r <kit>/pipeline-skill .
cp -r <kit>/docs        .

chmod +x ci/*.sh scripts/*.sh drills/*.sh
```

## 0.3 merge config

**vitest** — ต้องมี 3 อย่างขั้นต่ำ ไม่งั้น STEP 1 กับ 2 พังทั้งคู่:

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    // ⭐ 1. reporter json — สคริปต์ทุกตัวอ่านไฟล์นี้
    reporters: ["default", "json"],
    outputFile: { json: "reports/vitest.json" },

    // ⭐ 2. fail-closed
    passWithNoTests: false,
    allowOnly: false,

    // ⭐ 3. timezone — ไม่งั้นเทสวันที่จะพังบน CI
    env: { TZ: "Asia/Bangkok" },

    slowTestThreshold: 50,
  },
})
```

ตรวจว่าใช้ได้:
```bash
pnpm vitest run
ls -la reports/vitest.json     # ต้องมีไฟล์นี้
jq '.numTotalTests' reports/vitest.json
```

> **ถ้า `reports/vitest.json` ไม่เกิด** → ยังไม่ได้ merge config
> อย่าไปต่อ ทุก step หลังจากนี้จะให้ผลผิด

## 0.4 ปรับ `ci/run-gates.sh`

เปิดไฟล์แล้วแก้คำสั่งทุกบรรทัดให้ตรงกับโปรเจกต์จริง
**ตัดบรรทัดที่ยังไม่มีออกก่อน** — เก็บไว้แค่ที่รันได้:

```bash
# เก็บ
run "tsc"    pnpm vue-tsc --noEmit
run "eslint" pnpm eslint .
run "unit"   pnpm vitest run

# ตัดออกไปก่อน (ยังไม่มี)
# run "authz" ...
# run "race"  ...
```

ทดสอบ:
```bash
./ci/run-gates.sh
echo "exit=$?"     # ควรได้ 0
```

## ✅ เกณฑ์ผ่าน STEP 0

- [ ] `reports/vitest.json` เกิดขึ้นหลังรันเทส
- [ ] `./ci/run-gates.sh` รันจบและคืน exit 0
- [ ] `jq` ใช้ได้

---

# STEP 1 · Baseline

```bash
./scripts/record-baseline.sh
```

## จะเห็นอะไร

```
  [1/5] นับ anti-pattern ...
  [2/5] นับไฟล์เทส ...
  [3/5] รันเทสเก็บเวลา ...
  [4/5] รัน shuffle 3 seed ...
  [5/5] นับ knowledge ...

  ไฟล์เทส              47
  เทสทั้งหมด            312 (ผ่าน 312)
  เวลารวม              18420 ms
  เทส > 200ms          7
  shuffle พัง          2/3 seed   ⭐ มีเทสพึ่งลำดับการรัน
  ...
```

## จะพังตรงไหน

| อาการ | สาเหตุ | แก้ |
|---|---|---|
| `TOTAL=0` ทั้งที่มีเทส | ไม่มี `reports/vitest.json` | กลับไป STEP 0.3 |
| `date: illegal option -- 3` | macOS ไม่มี `%3N` | มี fallback แล้ว — ค่า duration จะหยาบกว่า |
| shuffle รันนานมาก | suite ใหญ่ | ตั้ง `TEST_CMD="pnpm vitest run test/unit"` ก่อน |
| นับ anti-pattern ได้ 0 หมด | `SRC_GLOB` ผิด | `SRC_GLOB=src ./scripts/record-baseline.sh` |

## 🔴 สิ่งที่ต้องทำทันทีถ้า shuffle พัง

**อย่าเพิ่งแก้เทส** — บันทึกไว้ก่อนว่าพังกี่ตัว ตัวไหนบ้าง
นี่คือหนี้ที่มีอยู่แล้วและคุณเพิ่งเห็นมันครั้งแรก

```bash
pnpm vitest run --sequence.shuffle --sequence.seed=1 2>&1 | grep -E "FAIL|×"
```

สาเหตุที่พบบ่อย 3 อย่าง:
1. ไม่ได้ reset store (Pinia/Vuex) ใน `beforeEach`
2. mock ที่ตั้งใน `beforeAll` แล้วเทสตัวหลังพึ่งอยู่
3. ข้อมูลใน DB/localStorage ที่เทสตัวก่อนสร้างไว้

## ✅ เกณฑ์ผ่าน STEP 1

- [ ] ได้ไฟล์ `reports/baseline-YYYYMMDD.json`
- [ ] ตัวเลขในไฟล์ไม่ใช่ 0 ทั้งหมด
- [ ] คัดลอกลง `docs/quality/baseline.md` หมวด A และ B แล้ว
- [ ] **ตั้ง ratchet** — anti-pattern ทุกตัวห้ามเพิ่มจากวันนี้

---

# STEP 2 · Gate Drill ⭐

> ข้อที่ให้ผลตอบแทนสูงสุด และเป็นข้อที่คนข้าม

## 2.1 เตรียม

```bash
# ⭐ ต้องเป็น branch ทิ้ง และ worktree สะอาด
git status                    # ต้องว่าง
git checkout -b drill/$(date +%Y%m%d)
```

## 2.2 สร้าง patch

```bash
./drills/make-drills.sh
```

**คาดว่าจะพังบางส่วน** — สคริปต์เดาไฟล์เป้าหมายด้วย `git ls-files`

```
  ✅ d1-it-only
  ⊘ d3-off-by-one — ข้าม (แก้ไฟล์ไม่ได้)
  ✅ d5-timeout-bump
  ...
```

ถ้าข้ามเยอะ ให้ระบุไฟล์เอง:

```bash
SPEC_FILE="test/unit/deposit.spec.ts" \
VALIDATOR="utils/money/validate.ts" \
E2E_FILE="e2e/deposit.spec.ts" \
  ./drills/make-drills.sh
```

## 2.3 ⭐ ตรวจ patch ด้วยตาก่อนรัน

```bash
for p in drills/generated/*.patch; do
  echo "═══ $p ═══"
  head -5 "$p"
  git apply --check "$p" && echo "  apply ได้ ✓" || echo "  apply ไม่ได้ ✗"
done
```

ลบ patch ที่ apply ไม่ได้ทิ้ง — อย่าเสียเวลาแก้ตอนนี้

## 2.4 รัน

```bash
./scripts/gate-drill.sh
```

## จะเห็นอะไร

```
  [ 1] d1-it-only                   ✅ จับได้
  [ 2] d2-no-assertion              ❌ HOLE — ผ่าน gate ทั้งที่ควรถูกจับ
  [ 3] d5-timeout-bump              ❌ HOLE
  [ 4] d10-slow-test                ✅ จับได้

  จับได้ 2/4

  ⭐ gate ที่เป็นของปลอม:
     - d2-no-assertion (ควรถูกจับโดย: ESLint expect-expect)
     - d5-timeout-bump (ควรถูกจับโดย: file-scope guard)
```

## ตีความ

| ผล | หมายความว่า |
|---|---|
| `❌ HOLE` | gate ที่คุณเชื่อว่ามีอยู่ **ไม่ทำงาน** |
| `⊘ apply ไม่ได้` | patch เก่าไปแล้ว ไม่ใช่ปัญหาของ gate |
| จับได้ครบ | gate ทำงานจริง — หายากกว่าที่คิด |

**⭐ ตัวเลขนี้คือค่าที่มีค่าที่สุดจากทั้ง runbook**
ทีมส่วนใหญ่พบว่ามี gate 2–4 ตัวที่ไม่ทำงานเลย

## 2.5 แก้ gate ที่เป็นของปลอม

เรียงตามความง่าย:

```bash
# d1/d2 → ESLint rules
cp <kit>/config/eslint.gates.js .
# merge เข้า eslint.config.js แล้วรัน
pnpm eslint . --max-warnings=0

# d5 → file-scope guard
BASE_SHA=main ./ci/s6-file-scope-guard.sh

# d4 → fail-closed
# เพิ่มใน ci/run-gates.sh:
#   [ -f reports/vitest.json ] || { echo "GATE FAIL"; exit 1; }
```

รัน drill ซ้ำจนกว่าจะจับได้ครบ

## 2.6 เก็บกวาด

```bash
git checkout main
git branch -D drill/$(date +%Y%m%d)
```

## ✅ เกณฑ์ผ่าน STEP 2

- [ ] รัน drill ได้อย่างน้อย 5 ตัว
- [ ] รู้ว่ามี gate ปลอมกี่ตัว
- [ ] บันทึกลง `docs/drill-log.md`
- [ ] แก้ gate ปลอมอย่างน้อยครึ่งหนึ่ง

---

# STEP 3 · Authz Completeness

> รันได้โดยไม่ต้องต่อ DB — และ**ควร fail ในรอบแรก**

## 3.1 เตรียม

```bash
pnpm add -D glob
```

แก้ root path ใน `security/authz/routes.ts`:

```ts
// ADAPT: ตรวจว่า API route อยู่ที่ไหนจริง
const DEFAULT_ROOT = "server/api"    // ← แก้ตรงนี้
```

ตรวจว่า enumerate ได้:

```bash
node --input-type=module -e "
import { globSync } from 'glob'
console.log(globSync('server/api/**/*.{get,post,put,patch,delete}.ts').slice(0,10))
"
```

ถ้าได้ array ว่าง → path ผิด

## 3.2 รัน GATE 1

```bash
pnpm vitest run security/authz -t completeness
```

## จะเห็นอะไร (และนี่คือสิ่งที่ควรเห็น)

```
FAIL  security/authz/authz.spec.ts

  ⭐ endpoint ที่ยังไม่มี authz spec (23 ตัว):
     - GET /api/games
     - POST /api/games/:id/play
     - GET /api/promotions
     - POST /api/support/message
     ...

  เพิ่มใน security/authz/matrix.ts ก่อน merge
```

**23 คือตัวเลขที่มีค่า** — มันแปลว่ามี endpoint 23 ตัวที่ไม่เคยมีใครตัดสินใจเรื่องสิทธิ์

## 3.3 เติม matrix ทีละตัว

```ts
{
  id: "GET /api/games",
  method: "GET",
  buildPath: () => "/api/games",
  rules: {
    anonymous: OK,            // ← ตัดสินใจทีละช่อง
    owner: OK,
    otherUser: OK,
    expiredToken: OK,
    malformedToken: OK,
    bannedUser: DENY,
    unverifiedUser: OK,
    admin: OK,
  },
},
```

**ถ้าไม่ต้องมี spec จริงๆ** ใส่ใน `ROUTE_EXEMPT` พร้อมเหตุผล:

```ts
export const ROUTE_EXEMPT = {
  "GET /api/health": "health check ไม่มีข้อมูล",
}
```

## จะพังตรงไหน

| อาการ | แก้ |
|---|---|
| `Cannot find module 'glob'` | `pnpm add -D glob` |
| endpoint ที่ enumerate ได้ไม่ตรงกับใน matrix | ตรวจรูปแบบ — ต้องเป็น `METHOD /api/path` เป๊ะ |
| route ที่มี `[...slug]` ไม่ match | เปลี่ยน id ใน matrix เป็น `GET /api/files/*` |
| test "runtime routes" fail | ยังไม่มี `_routes` endpoint → `SKIP_RUNTIME_ROUTES=1` ไปก่อน |

## ✅ เกณฑ์ผ่าน STEP 3

- [ ] รู้ว่ามี endpoint กี่ตัว และกี่ตัวไม่มี spec
- [ ] บันทึกลง `docs/quality/baseline.md` หมวด D
- [ ] เติม matrix ของ endpoint ที่แตะเงิน/auth ครบ (ตัวอื่นทยอยได้)

---

# STEP 4 · Invariant Monitor ⭐

> แพงที่สุดในการติดตั้ง (~3 ชม.) และคุ้มที่สุด

## 4.1 เริ่มจากตัวเดียวก่อน

**อย่าติดตั้งครบ 5 ตัวรวดเดียว** — เอา INV-1 ตัวเดียวให้ทำงานก่อน

```ts
// monitors/invariants.ts — เหลือแค่ตัวเดียว
export const INVARIANTS: Invariant[] = [
  {
    id: "INV-1",
    description: "ยอดคงเหลือเท่ากับผลรวม ledger",
    severity: "critical",
    check: async () => {
      // ADAPT: แก้ชื่อตาราง/คอลัมน์ให้ตรงกับ schema จริง
      const rows = await db.query(`
        SELECT u.id, u.balance, COALESCE(SUM(l.amount), 0) AS ledger_sum
        FROM users u LEFT JOIN ledger l ON l.user_id = u.id
        GROUP BY u.id, u.balance
        HAVING u.balance <> COALESCE(SUM(l.amount), 0)
      `)
      return rows.map(r => ({
        id: r.id,
        detail: `balance=${r.balance} sum=${r.ledger_sum}`,
      }))
    },
  },
]
```

## 4.2 รันด้วยมือก่อน ยังไม่ต้องตั้ง cron

```bash
# เขียน script ชั่วคราว
cat > /tmp/run-inv.ts <<'EOF'
import { runInvariants } from "./monitors/invariants"
const r = await runInvariants(async (a) => console.log("ALERT:", a.title, a.body))
console.log(JSON.stringify(r, null, 2))
EOF

pnpm tsx /tmp/run-inv.ts
```

## 🔴 คาดว่าจะเจอการละเมิด

```
ALERT: INVARIANT ละเมิด: INV-1
  ยอดคงเหลือเท่ากับผลรวม ledger
  พบ 14 รายการ

    u_8f2a: balance=1500 sum=1200
    u_3c91: balance=0 sum=-50
```

**นี่คือช่วงเวลาที่มีค่าที่สุดของทั้ง runbook**

14 รายการนั้นมีอยู่แล้ว — คุณเพิ่งเห็นมันครั้งแรก
เพราะเทสทุกตัวตรวจเคสที่มีคนคิดถึง ส่วน invariant ตรวจข้อมูลทั้งหมด

## 4.3 ตัดสินใจกับสิ่งที่เจอ

| กรณี | ทำอะไร |
|---|---|
| ต่างเพราะ seed data เก่า | ล้างข้อมูลทดสอบก่อน แล้ววัดใหม่ |
| ต่างเพราะมี transaction type ที่ไม่ได้นับ | แก้ query ไม่ใช่แก้ข้อมูล |
| **ต่างจริง — เงินไม่ตรง** | 🔴 นี่คือ incident ต้องสืบก่อนทำอย่างอื่น |

## 4.4 พอ INV-1 เขียวแล้วค่อยเพิ่มตัวอื่น

เรียงตามความง่าย: INV-2 (balance < 0) → INV-3 (txn ค้าง) → INV-5 (อายุ) → INV-4 (audit)

## 4.5 ตั้ง scheduler

```bash
# ทดสอบ endpoint ก่อน
curl -H "X-Internal-Token: $INTERNAL_TOKEN" \
  "$BASE_URL/api/internal/monitors/run" | jq

# ตั้ง Cloud Scheduler
gcloud scheduler jobs create http invariant-monitor \
  --schedule="*/10 * * * *" \
  --uri="$BASE_URL/api/internal/monitors/run" \
  --headers="X-Internal-Token=$INTERNAL_TOKEN" \
  --location=asia-southeast1
```

## จะพังตรงไหน

| อาการ | แก้ |
|---|---|
| `db is not defined` | แทน `declare const db` ด้วย import จริง |
| query ช้ามาก / timeout | เพิ่ม index บน `ledger.user_id` **ก่อน** ตั้ง cron |
| ละเมิดเป็นพันรายการ | น่าจะ query ผิด ไม่ใช่ข้อมูลผิด — ตรวจ JOIN |
| alert ไม่เข้า | ทดสอบ notifier แยกก่อน |

## ✅ เกณฑ์ผ่าน STEP 4

- [ ] INV-1 รันได้และให้ผลที่เชื่อถือได้
- [ ] รู้ว่ามีการละเมิดกี่รายการ (บันทึกหมวด E)
- [ ] จัดการกับที่เจอแล้ว หรือมี ticket ไว้แล้ว
- [ ] ตั้ง scheduler แล้ว หรือมีแผนจะตั้ง

---

# STEP 5 · Approval Drill

> ⚠️ **ยังไม่มี runner ใน kit** — ทำด้วยมือไปก่อน

## 5.1 สร้าง defect 1 ตัว

เลือกจากชนิดที่ automation จับไม่ได้ — เริ่มที่ **D4 (ภาษา)** เพราะทำง่ายที่สุด

```bash
git checkout -b drill/approval-$(date +%Y%m%d)

# แก้ข้อความให้ผิดโทน เช่น
#   "ยอดเงินไม่ถึงขั้นต่ำที่กำหนด"  →  "เกิดข้อผิดพลาด"
# หรือสะกดผิดแบบที่ต้องอ่านถึงจะเห็น
```

## 5.2 ⭐ ยืนยันว่า drill นี้ valid

```bash
./ci/run-gates.sh
echo "exit=$?"
```

**ต้องได้ exit 0** — ถ้า gate จับได้ นี่คือ gate drill ไม่ใช่ approval drill
ต้องเปลี่ยนเคสใหม่

## 5.3 ส่งเข้า pipeline ปกติ

ปล่อยให้มันไหลไปถึงขั้นที่คุณอนุมัติ **โดยไม่มีอะไรบอกว่านี่คือการซ้อม**

เคล็ดลับ: ให้มันไปถึงตอนที่คุณกำลังยุ่ง — นั่นคือสภาพจริงที่ต้องวัด

## 5.4 บันทึกผล

| ผล | นับเป็น |
|---|---|
| reject + ระบุปัญหาจริงได้ | ✅ PASS |
| reject แต่ให้เหตุผลอื่น | ⚠️ INCONCLUSIVE — ไม่ใช่ PASS |
| approve | ❌ FAIL |

**⭐ INCONCLUSIVE ห้ามนับเป็น PASS**
ถ้า reject เพราะ "ดูแปลกๆ" นั่นคือความบังเอิญ ไม่ใช่การจับได้

## 5.5 revert ทันที

```bash
git checkout main
git branch -D drill/approval-$(date +%Y%m%d)
```

## 5.6 ความถี่

สัปดาห์ละครั้ง · **สุ่มวันและเวลา**
ถ้ารันวันเดิมเวลาเดิม คุณจะรู้ตัวและตั้งใจดูเป็นพิเศษ → ผลไม่มีความหมาย

## ✅ เกณฑ์ผ่าน STEP 5

- [ ] ทำ drill ครั้งแรกเสร็จ
- [ ] ยืนยันว่า defect ผ่าน automated gate ได้จริง
- [ ] บันทึกลง `docs/drill-log.md`
- [ ] มีแผนว่าจะทำสัปดาห์ละครั้ง

---

# สรุป — ตารางที่จะเต็มหลังทำครบ

| หมวด | ค่า | ได้จาก |
|---|---|---|
| เทสพึ่งลำดับ | `___` ตัว | STEP 1 |
| anti-pattern ที่เหลือ | `___` จุด | STEP 1 |
| **gate ที่เป็นของปลอม** | `___` / `___` | **STEP 2** ⭐ |
| endpoint ไม่มี authz spec | `___` / `___` | STEP 3 |
| **invariant ที่ละเมิดอยู่** | `___` รายการ | **STEP 4** ⭐ |
| approval drill รอบแรก | `___` | STEP 5 |

---

# ถ้าติดตรงไหน

**หลักการเดียวที่ใช้ได้กับทุก step:**

> ถ้าสคริปต์ให้ผลที่ดูดีเกินไป (0 ปัญหา, ผ่านหมด, เขียวทุกอัน)
> **ให้สงสัยว่ามันไม่ได้ทำงาน ก่อนจะเชื่อว่าระบบดี**

วิธีตรวจ: จงใจทำให้มันควรพัง แล้วดูว่ามันพังจริงมั้ย

```bash
# ตัวอย่าง — ตรวจว่า gate-drill ทำงานจริง
echo "it.only('x', () => {})" >> test/unit/some.spec.ts
./ci/run-gates.sh    # ต้องแดง
git checkout -- .
```

นี่คือหลักการเดียวกับทั้ง kit: **ระบบป้องกันที่ไม่เคยถูกโจมตี ไม่รู้ว่ามันป้องกันได้จริงมั้ย**
