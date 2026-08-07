# Conventions

> อ่านเมื่อ: เขียนโค้ดใดๆ
>
> ทุกข้อในไฟล์นี้เป็น **advisory** — ไม่มีกลไกกั้น
> ถ้าข้อไหนสำคัญพอที่จะละเมิดไม่ได้ ให้ย้ายไปเป็น ESLint rule หรือ gate

---

## Style

```ts
// ✅
const amount = Number(input)
const isValid = amount >= MIN_DEPOSIT

// ❌ semicolon · single quote
const amount = Number(input);
const label = 'ฝากเงิน'
```

- ไม่มี semicolon
- double quote สำหรับ string ทุกกรณี
- `~/` และ `@/` ชี้ไปที่ root ของโปรเจกต์ (ไม่ใช่ `app/`)

---

## โครงสร้างไฟล์

flat ที่ root — **ไม่ใช่** `app/` layout ของ Nuxt 4 default

```
pages/
  deposit/
    index.vue
    components/          ← page-local
      AmountInput.vue
      ConfirmDialog.vue
components/              ← global เท่านั้น
composables/
stores/
utils/
server/api/
```

component ใต้ `pages/<feature>/components/` **ไม่ auto-import**
ต้องระบุ path:

```ts
import AmountInput from "./components/AmountInput.vue"
```

เหตุผล: กันชื่อชนกันข้าม feature และทำให้เห็นขอบเขตของ component ชัด

---

## รูปแบบ API

ทุก endpoint คืนรูปแบบเดียวกัน:

```ts
type ApiResponse<T> = {
  Result: 0 | 1
  Error?: string
  Data?: T
}
```

`Result: 1` = สำเร็จ · `Result: 0` = ล้มเหลวทางธุรกิจ
**HTTP status ยังเป็น 200** ในทั้งสองกรณี

### ผลที่ตามมา

เครื่องมือที่วัดจาก HTTP status จะรายงานว่าสำเร็จ 100%
ทั้งที่ล้มเหลวทางธุรกิจทุก request

k6 ใน `perf/lib/http.js` จึงแยก `biz_error_rate` ออกจาก `http_req_failed`
ถ้าเพิ่มเครื่องมือวัดตัวใหม่ ต้องแยกแบบเดียวกัน

### การเรียก

```ts
// ✅
const res = await $fetch<ApiResponse<Balance>>("/api/balance")
if (res?.Result === 1) {
  balance.value = res.Data.amount
}

// ❌ ไม่ตรวจ Result
const res = await $fetch("/api/balance")
balance.value = res.Data.amount     // พังเงียบเมื่อ Result = 0
```

ใช้ `res?.Result` เสมอ — optional chaining กันกรณี response ว่าง

---

## Mutation

ทุก mutation ส่ง 2 field นี้:

```ts
await $fetch("/api/deposit", {
  method: "POST",
  body: {
    amount,
    DoAdmin: 0,        // 0 = ผู้ใช้ทำเอง · 1 = admin ทำแทน
    DoIp: clientIp,
  },
})
```

### ⚠️ backend ไม่เชื่อค่านี้

`DoAdmin` และ `DoIp` ที่ client ส่งมา **ถูกเมิน** —
backend เขียน audit log จาก session และ socket แทน

field พวกนี้อยู่ใน payload เพื่อความเข้ากันได้กับระบบเดิม
ไม่ใช่เพื่อกำหนดค่า

เทสที่ยืนยันเรื่องนี้: `security/tampering/mass-assignment.spec.ts`

---

## Bruno เป็นแหล่งความจริง

```
bruno/
  auth/
  deposit/
  withdraw/
```

collection เป็น **read-only** — แก้ไม่ได้จากฝั่ง frontend

### ลำดับที่ถูกต้อง

```
1. อ่าน Bruno spec ของ endpoint นั้น
2. generate type
3. เขียนโค้ด
4. tsc จะจับถ้า shape ไม่ตรง
```

การเดา shape แล้วเขียนโค้ดก่อนอ่าน Bruno คือสาเหตุอันดับหนึ่ง
ของ integration bug ที่เจอตอน deploy

---

## Selector ในเทส

```vue
<button data-test="submit-deposit">ฝากเงิน</button>
```

```ts
page.getByTestId("submit-deposit")     // ✅
page.locator(".btn-primary")           // ❌ เปราะ
page.getByText("ฝากเงิน")              // ❌ พังเมื่อเปลี่ยนข้อความ
```

Playwright ตั้ง `testIdAttribute: "data-test"` ไว้แล้วใน config

---

## ภาษาไทยใน UI

| เรื่อง | ค่า |
|---|---|
| ขนาดตัวอักษรขั้นต่ำ | 16px (ไม่ใช่ 14px แบบ Latin) |
| line-height | ≥ 1.7 |
| `word-break` | `normal` — **ห้าม** `break-all` |
| `overflow-wrap` | `break-word` |
| ความสูงหน้าจอ | `100dvh` ไม่ใช่ `100vh` |

`break-all` แยกสระออกจากพยัญชนะ ทำให้อ่านไม่ออก
`100vh` ถูก bottom bar ของ LINE in-app ทับ

เทสที่ตรวจ: `test/i18n/thai.spec.ts` → `describe("static: กฎการแสดงผลภาษาไทย")`

---

## วันที่และเวลา

- เก็บใน DB เป็น **ค.ศ.** ISO 8601 UTC
- แสดงผลเป็น **พ.ศ.** timezone Asia/Bangkok
- แปลงที่ boundary เท่านั้น — ไม่แปลงกลางทาง

```ts
// ✅ แปลงที่จุดแสดงผล
const displayYear = ceToBe(new Date(txn.createdAt).getFullYear())

// ❌ แปลงแล้วส่งต่อ — เสี่ยงแปลงซ้ำ
const beDate = toBuddhistDate(txn.createdAt)
someOtherFunction(beDate)
```

"วันนี้" ในเชิงธุรกิจเริ่ม **07:00 UTC** (= เที่ยงคืนไทย)
Cloud Run รัน UTC — โค้ดที่ใช้ `new Date().getDate()` ตรงๆ จะได้วันผิด
