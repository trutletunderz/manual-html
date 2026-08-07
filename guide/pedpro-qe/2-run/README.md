# Pedpro QE Starter Kit

ไฟล์ที่รันได้จริงจากคู่มือ — ไม่ใช่ตัวอย่างในเอกสาร

> **ก่อนเริ่ม:** ทุกไฟล์ต้องปรับ path/ชื่อ script ให้ตรงกับโปรเจกต์จริง
> จุดที่ต้องแก้มี comment `# ADAPT:` กำกับไว้ทุกจุด

---

## ลำดับที่แนะนำ

### เฟส 1 — วัดของที่มีอยู่ (1 สัปดาห์ · ไม่สร้าง gate ใหม่)

```bash
./scripts/record-baseline.sh    # ⭐ รันตัวนี้ก่อน — บันทึกค่า "ก่อน"
./scripts/phase1-audit.sh       # รายงานละเอียดกว่า
```

> **⭐ ถ้าไม่มีค่า "ก่อน" คุณจะพิสูจน์ไม่ได้ว่าสิ่งที่ทำมีผล**
> และจะไม่มีตัวเลขไปเขียนเนื้อหา

รันครั้งเดียวได้ 4 อย่าง:

| ตรวจ | บอกอะไร |
|---|---|
| shuffle 3 seed | มีเทสพึ่งลำดับการรันกี่ตัว |
| grep audit | `waitForTimeout` / `.only` / `toBeDefined()` เหลืออยู่กี่จุด |
| fail-closed | ถ้า report หายไป gate แดงจริงมั้ย |
| timing | เทสไหนช้าเกิน 200ms |

จากนั้น:

```bash
./scripts/gate-drill.sh        # ⭐⭐ สำคัญที่สุดในเฟสนี้
```

**อย่าสร้าง gate ใหม่ก่อนรู้ว่า gate เก่ากี่ตัวเป็นของปลอม**

---

### เฟส 2 — ปิดช่องใหญ่ที่สุด (3 สัปดาห์)

เรียงตามผลตอบแทน ÷ แรงที่ลง:

1. `ci/s6-file-scope-guard.sh` — 1 ชม. ปิด failure mode 4 ตัว
2. `monitors/invariants.ts` — 3 ชม. ได้ oracle ที่ตรวจข้อมูลจริงทั้งหมด
3. red-proof ที่ S3 → S4 (ต้องแก้ pipeline เอง ดู `docs/red-proof.md`)
4. `security/authz/` — 1 วัน
5. `security/race/harness.ts` — ครึ่งวัน

---

### เฟส 3 — ปิด loop (ต่อเนื่อง)

```bash
node scripts/knowledge-gc.mjs      # ไตรมาสละครั้ง
```

`pipeline-skill/fault-attacks.yaml` คือหัวใจ — ทุกครั้งที่บั๊กหลุด
เพิ่ม 1 รายการ แล้วเมื่อสร้าง gate ครอบได้ ให้ใส่ `automatedBy`

**เป้าหมายไม่ใช่สะสมความรู้ แต่คือแปลงความรู้เป็นข้อจำกัดเชิงโครงสร้าง**

---

## ไฟล์ในชุดนี้

```
ci/
  s6-file-scope-guard.sh      ⭐⭐⭐ S4 ห้ามแตะ *.spec.ts
  run-gates.sh                     gate chain ที่ drill ใช้เรียก

scripts/
  phase1-audit.sh             ⭐   วัดของที่มีอยู่ 4 อย่าง
  gate-drill.sh               ⭐⭐ ทดสอบว่า gate ทำงานจริงมั้ย
  knowledge-gc.mjs                 GC ของ fault-attacks.yaml

drills/
  make-drills.sh                   สร้าง patch 10 ตัวสำหรับ gate drill

monitors/
  invariants.ts               ⭐⭐ 5 invariant ที่รันใน production
  run.ts                           endpoint ที่ Cloud Scheduler เรียก

pipeline-skill/
  fault-attacks.yaml          ⭐   47 กฎ พร้อม provenance + lifecycle

security/
  helpers.ts                  ⭐   seed API client ที่ทุก spec ใช้ร่วมกัน
  authz/types.ts                   schema — ไม่มี default โดยตั้งใจ
  authz/routes.ts                  enumerate จาก fs + runtime (ปิด blind spot)
  authz/matrix.ts                  ตัวอย่าง 7 endpoint (ต้องเติมเอง)
  authz/context.ts                 สร้าง actor 8 ตัว + HTTP client
  authz/authz.spec.ts         ⭐⭐ GATE 1 completeness + GATE 2 enforcement
  race/harness.ts             ⭐⭐ barrier + pre-warm + spread check
  race/business-logic.spec.ts ⭐⭐ 6 เคสที่แปลงเป็นเงินได้ + meta-test
  webhook/signature.spec.ts   ⭐⭐ 8 เทส + static check (timingSafeEqual)
  tampering/mass-assignment.spec.ts  ⭐ 12 field + prototype pollution
  injection/payloads.ts            payload 6 กลุ่ม
  injection/xss.spec.ts       ⭐   ตรวจ execute จริง ไม่ใช่แค่ escape

test/
  setup/global.ts             ⭐   MSW fail-closed + financial invariant hook
  fixtures/thai.ts            ⭐   evil strings + generator ที่ checksum ถูก
  i18n/thai.spec.ts           ⭐   พ.ศ. · collation · normalize · static gate

server/
  internal-api.reference.ts   ⭐⭐ seed/query endpoint — ตัวที่ทำให้เทสรันได้

docs/
  quality/policy.md           ⭐   Test Policy (ค่าตั้งต้น รอแทน)
  quality/baseline.md         ⭐⭐ ตาราง "ก่อน" 10 หมวด — ยังว่าง
  quality/emergency-path.md   ⭐   ลำดับหยุดเลือด 4 ขั้น
  templates/postmortem.md          blameless + escape taxonomy
  templates/adr.md                 พร้อมช่อง "เงื่อนไขทบทวน"
  decisions/0012-*.md              ตัวอย่าง ADR ที่กรอกแล้ว
  drill-log.md                ⭐   บันทึก drill ทั้ง 4 ชนิด
  line-release-checklist.md   ⭐   11 ข้อ ทำด้วยมือก่อน release

perf/
  config/slo.js               ⭐   SLO + journey + burn rate 28 วัน
  analyze/baseline/*.json          ยังว่าง รอ run แรก

config/
  vitest.config.ts            ⭐   shuffle · TZ · fail-closed · slowTestThreshold
  playwright.config.ts        ⭐   data-test · th-TH · LINE project
  eslint.gates.js             ⭐   rule ที่เป็น gate (10 วินาที)
  package.scripts.json             27 scripts

.github/workflows/
  gates.yml                   ⭐   4 jobs เรียงตาม signal-per-second
```

---

## วิธีเริ่มใช้ authz gate

GATE 1 รันได้ทันทีโดยไม่ต้องต่อ DB:

```bash
pnpm vitest run security/authz -t completeness
```

มันจะบอกว่าขาด endpoint ไหน แล้วเติมใน `matrix.ts` ทีละตัว
**ครั้งแรกจะขาดเยอะมาก — นั่นคือประเด็น**

GATE 2 ต้องมี environment ที่ต่อ DB ได้:

```bash
BASE_URL=https://staging.example INTERNAL_TOKEN=xxx \
  pnpm vitest run security/authz
```

ต้องเพิ่ม 2 อย่างในโปรเจกต์ก่อน:

1. `server/api/internal/_routes.get.ts` — คืน route table (ดู comment ใน `routes.ts`)
2. `server/api/internal/seed/*` — สร้าง user/transaction/withdrawal สำหรับเทส

**ถ้ายังไม่มี seed API** ให้รันเฉพาะ GATE 1 ไปก่อน — มันคือส่วนที่มีมูลค่าสูงสุดอยู่แล้ว

---

## ⚠️ internal API — อ่านก่อนใช้

`server/internal-api.reference.ts` คือตัวที่ทำให้เทสทั้ง 24 ไฟล์รันได้
แต่มันสร้าง user และแก้ balance ได้โดยตรง

**ต้องปิดสนิทใน production ด้วย 3 ชั้น:**

1. env guard — `ALLOW_INTERNAL_API=1` และ `NODE_ENV !== production`
2. token >= 32 ตัว + timing-safe comparison
3. **ห้าม deploy ไฟล์นี้ขึ้น production revision** — ใส่ใน `.gcloudignore`

ตอบ `404` ไม่ใช่ `403` เมื่อ guard ไม่ผ่าน — ไม่บอกว่า endpoint มีอยู่

---

## ข้อควรระวัง

- `gate-drill.sh` และ `make-drills.sh` **ต้องรันบน branch ทิ้งเท่านั้น**
  มันแก้ไฟล์จริงแล้ว revert — ถ้ามีอะไรค้างจะเสียงาน
- `invariants.ts` query ทั้งตาราง — ถ้า users เยอะมากให้เพิ่ม index
  บน `ledger.user_id` ก่อน ไม่งั้นจะกิน DB
- `race/harness.ts` ต้องใช้ `undici` agent ที่มี keep-alive
  ไม่งั้น dispatch spread จะเกิน 20ms แล้ว throw

---

## อ้างอิงกลับไปคู่มือ

| ไฟล์ | หัวข้อในคู่มือ |
|---|---|
| `s6-file-scope-guard.sh` | L2.14 |
| `gate-drill.sh` | L2.16 |
| `invariants.ts` | L4.3.1 |
| `fault-attacks.yaml` | ภาคผนวก B |
| `knowledge-gc.mjs` | L4.9 |
| `authz/*` | L3.4B |
| `race/harness.ts` | L3.4C |
