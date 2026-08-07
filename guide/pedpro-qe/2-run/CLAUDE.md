<!-- ────────────────────────────────────────────────
     สามคำถาม — ใช้กับทุกงานในไฟล์นี้

     มาจากไหน   ที่มาของความถูกต้องอยู่นอกสิ่งที่ถูกตรวจ
     อะไรกั้น    ข้อจำกัดที่ละเมิดแล้วกู้ไม่ได้ บังคับด้วยโครงสร้าง
                ไม่ใช่ด้วยข้อความในไฟล์นี้
     ลองรึยัง    gate ที่ยังไม่มี drill ถือว่ายังไม่ได้พิสูจน์

     รู้ให้ได้ว่าอะไรคือถูกต้อง แล้วทำให้ผิดไม่ได้
──────────────────────────────────────────────── -->

# Pedpro

Thai fantasy gaming portal · Nuxt 4 · Vue 3.5+ · TypeScript strict
Deploy: Docker → Cloud Build → Cloud Run (asia-southeast1)

---

## ข้อจำกัดที่บังคับด้วยโครงสร้าง

สิ่งเหล่านี้ละเมิดไม่ได้ — ไม่ใช่เพราะไฟล์นี้ห้าม แต่เพราะกลไกไม่ยอม

| ข้อจำกัด | บังคับด้วย |
|---|---|
| stage implementation แตะ `*.spec.ts` ไม่ได้ | sparse-checkout + `ci/s6-file-scope-guard.sh` |
| เทสใหม่ต้องเคยแดงก่อน | `reports/red-proof.json` + gate |
| จำนวนไฟล์เทสลดลงไม่ได้ | test count baseline |
| request ที่ไม่มี MSW handler ทำให้เทสแดง | `onUnhandledRequest: "error"` |
| endpoint ใหม่ที่ไม่มี authz spec ทำให้ CI แดง | `security/authz/authz.spec.ts` |
| ไม่มี `reports/vitest.json` = gate ไม่ผ่าน | fail-closed check |

รายละเอียดของ gate ทั้งหมด → `docs/gates.md`

---

## ข้อตกลงที่อยู่ในไฟล์นี้เท่านั้น

สิ่งเหล่านี้ไม่มีกลไกกั้น — ถ้าละเมิดจะรู้ตอน review เท่านั้น

โค้ดใน repo นี้ไม่มี semicolon · ใช้ double quote
selector ในเทสใช้ `data-test` ไม่ใช่ class หรือ text
API ทุกตัวคืน `{ Result, Error?, Data? }` โดย `Result` เป็น `0 | 1`
ทุก mutation ส่ง `DoAdmin` และ `DoIp`
เรียก API ด้วยรูปแบบ `res?.Result` เสมอ
โครงสร้างไฟล์เป็น flat ที่ root ไม่ใช่ `app/` แบบ Nuxt 4 default
`~/` และ `@/` ชี้ไปที่ root ของโปรเจกต์
component ใต้ `pages/<feature>/components/` ต้อง import แบบระบุ path

รายละเอียดพร้อมตัวอย่าง → `docs/conventions.md`

---

## Bruno เป็นแหล่งความจริงของ API

spec ของ API อยู่ใน Bruno collection และเป็น read-only
ก่อนเขียนฟอร์มหรือเรียก API ใดๆ ให้อ่าน Bruno ก่อนเสมอ

type ที่ generate จาก Bruno ถูกใช้เป็น contract gate ผ่าน `tsc`
ถ้า response shape ไม่ตรง จะรู้ตอน compile ไม่ใช่ตอน runtime

---

## อ่านไฟล์ไหน เมื่อไหร่

| เมื่อ | อ่าน |
|---|---|
| เขียนโค้ดใดๆ | `docs/conventions.md` |
| เขียนหรือแก้เทส | `docs/testing.md` |
| CI แดงแล้วไม่รู้ว่าทำไม | `docs/gates.md` |
| งานแตะเงิน / auth / webhook | `pipeline-skill/fault-attacks-active.md` |
| ต้องตัดสินใจเรื่องคุณภาพ | `docs/quality/policy.md` |
| ระบบพังอยู่ตอนนี้ | `docs/quality/emergency-path.md` |
| เขียน postmortem | `docs/templates/postmortem.md` |

ไฟล์ที่ไม่อยู่ในตารางนี้ ไม่ต้องอ่านก่อนเริ่มงาน

---

## สิ่งที่ไฟล์นี้ไม่ได้ทำ

ไฟล์นี้เป็นคำแนะนำ ไม่ใช่กลไก

ข้อจำกัดที่สำคัญพอที่จะละเมิดไม่ได้ ถูกย้ายไปเป็น gate แล้ว
สิ่งที่เหลืออยู่ในนี้คือสิ่งที่ยัง**ไม่ได้**ถูกย้าย

เมื่อไฟล์นี้ยาวขึ้น ส่วนที่อ่านจริงจะน้อยลง
ทางแก้คือย้ายของออกไปเป็นกลไก ไม่ใช่เขียนให้ชัดขึ้น

`node scripts/knowledge-gc.mjs` วัดสัดส่วนที่ย้ายไปแล้ว
