# Gates

> อ่านเมื่อ: CI แดงแล้วไม่รู้ว่าทำไม

เรียงตามลำดับที่รัน — gate ที่เร็วและจับได้เยอะรันก่อน

---

## กลุ่ม A · static (~45 วินาที)

| gate | ปฏิเสธเมื่อ | แก้ |
|---|---|---|
| `tsc --noEmit` | type ไม่ตรง | ดู error · ถ้าเกี่ยวกับ API shape ให้อ่าน Bruno |
| `eslint` | anti-pattern ใน `docs/testing.md` | ดูตารางเกณฑ์ปฏิเสธ |
| secret scan | พบ pattern ที่ดูเหมือน key | ถ้า false positive ใส่ `# secret-scan:ignore` |
| dependency audit | ช่องโหว่ระดับ high | อัปเดตหรือหา alternative |
| new deps | dependency ใหม่ที่มี install script | ใส่ `DEP-APPROVED: <ชื่อ>` ใน commit |
| **file-scope guard** | stage implementation แตะ `*.spec.ts` | กลับไปแก้ที่ stage เขียนเทส |

### file-scope guard ปฏิเสธอะไรบ้าง

```
✗ แก้ไฟล์ *.spec.ts ใน stage implementation
✗ จำนวนไฟล์เทสลดลง (เว้นแต่มี RISK-ACCEPT:)
✗ เพิ่ม timeout ≥ 1000ms
✗ แก้ snapshot > 3 ไฟล์ (เว้นแต่มี SNAPSHOT-REVIEWED:)
✗ มีเทสใหม่แต่ไม่มี red-proof.json
```

**ถ้า guard แดงเพราะเทสผิด** — เทสผิดจริงหรือโค้ดผิด
ถ้าเทสผิด กลับไปแก้ที่ stage เขียนเทส ไม่ใช่แก้ตรงนี้

---

## กลุ่ม B · test (~2 นาที)

| gate | ปฏิเสธเมื่อ |
|---|---|
| unit + integration | เทสแดง |
| **fail-closed check** | ไม่มี `reports/vitest.json` |
| **test count** | รันเทสน้อยกว่า baseline |
| Thai i18n | พ.ศ. / collation / `break-all` / `100vh` |

### fail-closed check

```bash
[ -f reports/vitest.json ] || exit 1
COUNT=$(jq '.numTotalTests' reports/vitest.json)
[ "$COUNT" -ge "$MIN_EXPECTED_TESTS" ] || exit 1
```

**ทำไมต้องมี** — ถ้าเทสไม่ได้รันเลย (config พัง, filter ผิด)
gate จะเขียวโดยไม่ตรวจอะไร

นี่คือคำถามข้อ 3 ในระดับ gate: ตรวจว่าตัวมันเองได้ทำงานจริง

---

## กลุ่ม C · security (~3 นาที)

| gate | ปฏิเสธเมื่อ | ความรุนแรง |
|---|---|---|
| **authz completeness** | endpoint ใหม่ไม่มี spec | บล็อกเสมอ |
| authz enforcement | actor เข้าถึงสิ่งที่ไม่ควรได้ | บล็อกเสมอ |
| **race condition** | การกระทำที่ควรสำเร็จครั้งเดียว สำเร็จหลายครั้ง | หยุดทุกอย่าง |
| **webhook signature** | ยิง webhook ปลอมได้ | หยุดทุกอย่าง |
| mass assignment | client กำหนด privileged field ได้ | บล็อกเสมอ |
| audit + PII | audit log ขาด หรือมี PII ดิบ | บล็อกเสมอ (PDPA) |

### authz completeness แดงบ่อยที่สุด

```
⭐ endpoint ที่ยังไม่มี authz spec (3 ตัว):
   - GET /api/games/:id/history
   - POST /api/promotions/claim
   - DELETE /api/bank-account/:id
```

**นี่ไม่ใช่บั๊ก** — มันแปลว่าคุณเพิ่ม endpoint แล้วยังไม่ได้ตัดสินใจว่าใครเข้าถึงได้

เติมใน `security/authz/matrix.ts` — ต้องระบุครบทั้ง 8 actor
ไม่มี default โดยตั้งใจ

ถ้าไม่ต้องมี spec จริงๆ ใส่ใน `ROUTE_EXEMPT` **พร้อมเหตุผล**

### race condition แดง = หยุดทำอย่างอื่น

ช่องโหว่พวกนี้แปลงเป็นเงินได้โดยตรง
และผู้ใช้ที่ค้นพบจะไม่แจ้ง — เขาจะใช้มัน

ถ้าเทสผ่านบน single instance แต่ production รันหลาย instance
ต้องเทสบน environment ที่มีหลาย instance จริง —
lock ระดับ process ไม่พอ ต้องเป็น DB-level lock

---

## กลุ่ม D · e2e + bundle (~4 นาที)

| gate | ปฏิเสธเมื่อ |
|---|---|
| bundle budget | JS/CSS/font โตเกิน budget หรือโตเกิน 5% จาก baseline |
| bundle forbidden | source map หลุด · key ใน bundle · moment ทั้งก้อน |
| e2e smoke | flow วิกฤตพัง |
| xss suite | payload execute ได้ |

---

## หลัง deploy

| gate | ปฏิเสธเมื่อ |
|---|---|
| security headers | CSP มี `unsafe-eval` · ขาด HSTS · cookie ไม่มี HttpOnly |
| k6 smoke | ระบบไม่ตอบสนอง |

---

## Gate ที่รันเป็นรอบ

| เมื่อ | อะไร |
|---|---|
| nightly | flake detection 10 รอบ · k6 load + validity |
| สัปดาห์ละครั้ง | secret scan (git history) · k6 spike |
| เดือนละครั้ง | **gate drill** · rollback drill · alert drill |

### gate drill — ตัวที่ทดสอบ gate อื่น

```bash
git checkout -b drill/$(date +%Y%m%d)
./drills/make-drills.sh
./scripts/gate-drill.sh
```

มันจงใจใส่ defect ที่ gate ควรจับ แล้วดูว่าจับได้จริงมั้ย

**gate ที่ไม่เคยถูกทดสอบ ไม่ใช่ gate — เป็นความเชื่อ**

---

## เมื่อ gate แดงแล้วคุณคิดว่ามันผิด

3 ทางเลือก เรียงตามที่ควรทำ:

**1. gate ถูก โค้ดผิด** — กรณีส่วนใหญ่ แก้โค้ด

**2. gate ถูก แต่เคสนี้ยกเว้นได้** — ใส่ในรายการยกเว้น**พร้อมเหตุผล**
ทุกกลไกยกเว้นบังคับให้เขียนเหตุผล ไม่ใช่แค่ปิด

**3. gate ผิด** — แก้ gate แล้ว**เพิ่ม drill** ที่ครอบเคสนี้
ไม่งั้นมันจะผิดแบบเดิมอีก

**สิ่งที่ไม่ใช่ทางเลือก** — ปิด gate ชั่วคราวแล้วลืมเปิด
ถ้าจำเป็นต้องข้ามจริง ใช้ `docs/quality/emergency-path.md`
ซึ่งบังคับให้บันทึกเหตุผลและมี TODO ตามเก็บ

---

## Gate ที่ยังไม่มี

| ควรมี | ตอนนี้ทำแทนด้วย |
|---|---|
| mutation testing | ยังไม่มี — oracle strength ยังวัดไม่ได้ |
| injection eval | ยังไม่มี — **นี่คือช่องที่เปิดอยู่จริง** |
| approval drill runner | ทำด้วยมือ ดู `docs/drill-log.md` |
| LLM eval | ยังไม่มี |

ช่องพวกนี้อยู่ในคู่มือ L4–L5 แต่ยังไม่มีโค้ด
รู้ว่าเปิดอยู่ ดีกว่าคิดว่าปิดแล้ว
