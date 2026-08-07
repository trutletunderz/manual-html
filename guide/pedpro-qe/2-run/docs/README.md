# docs

> `CLAUDE.md` ที่ root ชี้มาที่นี่
> ไฟล์ในนี้ไม่ต้องอ่านทั้งหมด — อ่านตามตารางใน `CLAUDE.md`

---

## อ่านเมื่อไหร่

| เมื่อ | ไฟล์ |
|---|---|
| เขียนโค้ดใดๆ | `conventions.md` |
| เขียนหรือแก้เทส | `testing.md` |
| CI แดงไม่รู้ทำไม | `gates.md` |
| ตัดสินใจเรื่องคุณภาพ | `quality/policy.md` |
| ระบบพังอยู่ตอนนี้ | `quality/emergency-path.md` |
| จะวัดว่าดีขึ้นมั้ย | `quality/baseline.md` |
| เขียน postmortem | `templates/postmortem.md` |
| ตัดสินใจที่ย้อนยาก | `templates/adr.md` |
| ก่อน release ที่แตะ auth/payment | `line-release-checklist.md` |
| หลัง drill ทุกครั้ง | `drill-log.md` |

---

## โครงสร้าง

```
docs/
  README.md            ← ไฟล์นี้
  conventions.md       code style · API · โครงสร้าง · ภาษาไทย
  testing.md           วิธีเขียนเทส · เกณฑ์ปฏิเสธ
  gates.md             gate ทั้งหมด · แดงแล้วทำไง

  daily/
    three-questions.md      ตัวบทหลัก
    claude-md-header.md     บล็อกที่วางหัว CLAUDE.md
    approval-template.md    ข้อความที่ human gate

  quality/
    policy.md               สิ่งที่ไม่ยอมให้เกิด · metric
    baseline.md             ค่า "ก่อน"
    emergency-path.md       ลำดับหยุดเลือด

  templates/
    postmortem.md
    adr.md

  decisions/
    0012-auto-approve-t0.md

  drill-log.md
  line-release-checklist.md
  emergency-log.md        (สคริปต์เขียนให้)
```

---

## กฎของไฟล์ในนี้

**ทุกไฟล์เป็น advisory** — ไม่มีกลไกกั้น

ถ้าข้อไหนสำคัญพอที่จะละเมิดไม่ได้
ย้ายไปเป็น gate แล้วลบออกจากที่นี่

`node scripts/knowledge-gc.mjs` วัดสัดส่วนที่ย้ายไปแล้ว —
ถ้าต่ำกว่า 50% แปลว่าความรู้ส่วนใหญ่ยังอยู่ในรูปคำแนะนำ
ซึ่งจะถูกเมินเมื่อไฟล์โตขึ้น
