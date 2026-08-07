# เริ่มที่นี่

> คุยกันยาว — ไฟล์นี้คือแผนที่ อ่าน 2 นาทีแล้วรู้ว่าอะไรอยู่ไหน

---

## สามก้อน

```
1-read/        คู่มือ — เปิดหาเวลาติด ไม่ได้มีไว้อ่านรวด
2-run/         โค้ดที่รันได้ — เอาไปวางในโปรเจกต์
3-share/       เผยแพร่ได้ — แจก/โพสต์ได้เลย
_superseded/   ของเก่าที่ถูกแทนแล้ว — ไม่ต้องเปิด
```

---

## ถ้ามีเวลา 5 นาที

เปิด **`3-share/three-questions.html`**

ทั้งหมดที่คุยกันมา ย่อเหลือหน้าเดียว

---

## ถ้าจะเริ่มลงมือ

เปิด **`2-run/RUNBOOK.md`** แล้วทำตาม STEP 0 → 5

```
STEP 0  ต่อสายไฟ         30 นาที   ← ทุกข้อหลังพึ่งข้อนี้
STEP 1  วัดของที่มี       20 นาที
STEP 2  gate drill        90 นาที   ⭐ ผลตอบแทนสูงสุด
STEP 3  authz             45 นาที
STEP 4  invariant          3 ชม.    ⭐ แพงสุด คุ้มสุด
STEP 5  approval drill    ต่อเนื่อง
```

⚠️ **โค้ดใน `2-run/` ยังไม่เคยถูกรันเลยสักบรรทัด**
ผ่านแค่ syntax check — คาดว่าจะเจอบั๊กตอนรันจริง
`RUNBOOK.md` มีหัวข้อ "จะพังตรงไหน" ทุก step

---

## 1-read · คู่มือ

| ไฟล์ | เนื้อหา |
|---|---|
| `index.html` | ภาพรวม · 3 เส้นทางอ่าน |
| `l0-foundation.html` | รากฐาน · oracle problem · testing vs checking |
| `l1-design.html` | เทคนิคออกแบบเทส 15 หัวข้อ |
| `l2-automation.html` | automation · CI · gate design · agent failure mode |
| `l3-nfr.html` | performance · security · a11y · **ภาษาไทย** |
| `l4-qe.html` | SLO · learning loop · **approval drill** · agentic QE |
| `l5-advanced.html` | mutation · LLM eval · **prompt injection** |
| `appendix.html` | fault-attacks 47 กฎ · gate catalog · **บันทึกแก้ไข 28 จุด** |

**`standalone/`** — ฉบับเดียวกันแต่ inline CSS/JS แล้ว แจกไฟล์เดียวจบ

---

## 2-run · โค้ด

### เริ่มอ่านที่

| ไฟล์ | คือ |
|---|---|
| `RUNBOOK.md` | ⭐ ลำดับการทำ 5 step |
| `README.md` | ภาพรวม kit + ลำดับ 3 เฟส |
| `CLAUDE.md` | context ที่ agent อ่านทุก run |
| `docs/README.md` | index ของ docs |

### โครงสร้าง

```
ci/          file-scope guard · gate chain
scripts/     baseline · gate drill · knowledge GC · drill 4 ตัว
drills/      สร้าง patch สำหรับ gate drill
monitors/    invariant monitor
security/    authz · race · webhook · tampering · injection
test/        Thai fixtures · i18n gate · setup
perf/        k6 + validity + SLO
docs/        conventions · testing · gates · quality · templates
config/      vitest · playwright · eslint · package scripts
server/       internal API reference (seed/query)
.github/     workflow
```

### ⚠️ ต้องแก้ก่อนใช้

**46 จุด `ADAPT`** กระจายใน 25 ไฟล์ — หาด้วย

```bash
grep -rn "ADAPT" 2-run/
```

**`server/internal-api.reference.ts`** — สร้าง user และแก้ balance ได้โดยตรง
ต้องปิด 3 ชั้นก่อนใช้ · **ห้าม deploy ขึ้น production**

---

## 3-share · เผยแพร่

| ไฟล์ | ใช้ทำอะไร | ขนาด |
|---|---|---|
| `three-questions.html` | ⭐ ฉบับสามัญ หน้าเดียว | 9K |
| `card.html` | การ์ดพิมพ์ A6 แปะจอ | 4K |
| `six-things.html` | บทความสองภาษา 6 หัวข้อ | 55K |

**ทุกไฟล์มี `<ช่องรอเติม>`** — ชื่อ วันที่ ตัวเลขจาก drill จริง
หาด้วย: `grep -o '&lt;[^&]*&gt;' 3-share/*.html`

---

## แกนที่ร้อยทั้งหมด

```
มาจากไหน   ·   อะไรกั้น   ·   ลองรึยัง
```

> **รู้ให้ได้ว่าอะไรคือถูกต้อง แล้วทำให้ผิดไม่ได้**

ทั้งคู่มือ 6 ชั้นคือคำถามเดียวนี้ ถามซ้ำกับสิ่งที่สูงขึ้นไปเรื่อยๆ

---

## สถานะตามเกณฑ์ของตัวเอง

| คำถาม | ตอบ |
|---|---|
| มาจากไหน | ⚠️ เขียนจากความเข้าใจ ไม่ใช่จากการรัน — **oracle ระดับ P5** |
| อะไรกั้น | ✓ syntax check · dangling ref check · bracket balance |
| **ลองรึยัง** | ❌ **ยัง** — ไม่เคยรันเลยสักบรรทัด |

ข้อ 3 ยังตอบว่า "ยัง"
สิ่งเดียวที่ยกระดับมันได้คือ `2-run/RUNBOOK.md` — ไม่ใช่การเขียนเพิ่ม

---

## ที่ยังขาด

| | สถานะ |
|---|---|
| approval drill runner | ทำด้วยมือไปก่อน (RUNBOOK STEP 5) |
| injection eval | **ช่องที่เปิดอยู่จริง** |
| mutation testing | ยังไม่มีโค้ด |
| LLM eval ทั้งชุด | ยังไม่มีโค้ด |

ทั้ง 4 อยู่ในคู่มือ L4–L5 แต่ยังไม่มีไฟล์
**รู้ว่าเปิดอยู่ ดีกว่าคิดว่าปิดแล้ว**
