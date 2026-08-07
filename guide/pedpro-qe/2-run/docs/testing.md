# Testing

> อ่านเมื่อ: เขียนหรือแก้เทส

---

## กฎข้อเดียวที่สำคัญที่สุด

**เทสใหม่ต้องเคยแดงก่อน**

```
1. เขียนเทส
2. รัน → ต้องได้ RED
3. บันทึก reports/red-proof.json
4. เขียนโค้ด
5. รัน → ต้องได้ GREEN
```

เทสที่เขียวตั้งแต่ยังไม่มีโค้ด **ไม่ได้พิสูจน์อะไร** —
มันอาจไม่มี assertion หรือ assertion อาจเป็นจริงเสมอ

นี่คือคำถามข้อ 1: ที่มาของความถูกต้องต้องอยู่นอกโค้ดที่ตรวจ
red-proof คือหลักฐานว่ามันอยู่นอกจริง

---

## เกณฑ์ที่ทำให้เทสถูกปฏิเสธ

### จาก ESLint (รู้ใน 10 วินาที)

| pattern | เหตุผล |
|---|---|
| `it.only` / `describe.only` | เทสตัวอื่นไม่ได้รัน |
| ไม่มี `expect` ในเทส | เทสที่ผ่านเสมอ |
| `toBeDefined()` | ผ่านได้กับเกือบทุกค่า |
| `toBeTruthy()` | เหมือนกัน |
| `waitForTimeout` | ทำให้ flaky — ใช้ web-first assertion |
| `catch(() => {})` | กลืน error → ระบบพังก็ยังเขียว |

### จาก gate (รู้ใน 1 นาที)

| pattern | เหตุผล |
|---|---|
| ไม่มี red-proof | ไม่มีหลักฐานว่าจับอะไรได้ |
| จำนวนไฟล์เทสลดลง | การลบเทส = รับความเสี่ยงกลับมา |
| เพิ่ม timeout ≥ 1000ms | flaky ต้องแก้ root cause |
| แก้ snapshot > 3 ไฟล์โดยไม่มีเหตุผล | snapshot abuse |

ถ้าจำเป็นต้องลบเทสจริง ใส่ใน commit message:

```
RISK-ACCEPT: <risk item ที่หมดคนคุ้มครอง>
```

---

## F.I.R.S.T + U

| | เกณฑ์ที่ใช้ในโปรเจกต์นี้ |
|---|---|
| **F**ast | unit < 50ms · เกิน 200ms ถือว่าต้องดู |
| **I**ndependent | ผ่าน `--sequence.shuffle` 3 seed |
| **R**epeatable | `TZ=Asia/Bangkok` ตั้งใน config แล้ว |
| **S**elf-validating | assertion ที่ระบุค่าที่คาด ไม่ใช่แค่ "มีค่า" |
| **T**imely | red-proof |
| **U**nique | ไม่ซ้ำกับเทสที่มีอยู่ |

`I` ตรวจได้ทันที:

```bash
pnpm test:shuffle
```

ถ้าพัง แปลว่ามีเทสพึ่ง state ที่เทสตัวก่อนทิ้งไว้ —
สาเหตุที่พบบ่อยคือไม่ได้ reset store ใน `beforeEach`

---

## เขียนเทสของฟอร์ม

12 ข้อที่ต้องพิจารณา — ไม่ต้องทำครบทุกข้อ แต่ต้องรู้ว่าข้ามข้อไหน

```
□ ค่าว่าง / whitespace / zero-width space
□ ค่าที่ขอบ (ต่ำกว่า 1, พอดี, เกิน 1)
□ ค่าที่ไม่ใช่ตัวเลข → Number("abc") = NaN
□ Number("") = 0  ← ค่าว่างกลายเป็นศูนย์เงียบๆ
□ scientific notation "5e3" = 5000
□ ค่าติดลบ
□ ค่ายาวเกิน field limit
□ double submit (กดพร้อมกัน 3 ครั้ง)
□ unmount ระหว่างรอ response
□ กด Enter ในช่อง input
□ ข้อความไทยยาวไม่มีเว้นวรรค
□ สระซ้อน "กิิิ๊๊๊"
```

fixture พร้อมใช้: `test/fixtures/thai.ts`

---

## Invariant ของงานที่แตะเงิน

เทสที่แตะเงินต้องเรียก:

```ts
import { trackFinancial } from "../setup/global"

it("ฝากเงินสำเร็จ", async () => {
  const user = await createUser({ balance: 0 })
  trackFinancial(user.id)          // ← invariant จะถูกตรวจอัตโนมัติหลังเทสจบ

  await api.post("/api/deposit", { amount: 500, DoAdmin: 0, DoIp: "10.0.0.1" }, user.token)
  expect(await getBalance(user.id)).toBe(500)
})
```

`afterEach` จะตรวจ `sum(ledger) === balance` ให้เอง

นี่คือคำถามข้อ 2 — ไม่ต้องจำว่าต้องเขียน assertion นี้
เรียก `trackFinancial()` แล้วกลไกทำงานแทน

---

## Mock

| ขอบเขต | mock อะไร |
|---|---|
| unit | dependency ที่อยู่นอก module นั้น |
| integration | network layer (MSW) |
| e2e | ไม่ mock อะไรเลย ยกเว้น payment gateway |

MSW ตั้ง `onUnhandledRequest: "error"` ไว้ —
request ที่ไม่มี handler จะทำให้เทสแดงทันที ไม่ใช่ผ่านเงียบๆ

ถ้าเทสแดงเพราะ unhandled request แปลว่าโค้ดเรียก API
ที่คุณไม่รู้ว่ามันเรียก — **นั่นคือข้อมูล ไม่ใช่ปัญหาของ MSW**

---

## เทสที่แตะระบบจริง

ใช้ namespace ต่อ worker กันชนกันตอนรันขนาน:

```ts
import { createUser, cleanup } from "../helpers"

afterAll(cleanup)     // ลบเฉพาะ namespace ของ worker นี้
```

`helpers.ts` throw ถ้าไม่มี `INTERNAL_TOKEN` — fail-closed
เทสที่ต้องต่อ DB จะไม่รันเงียบๆ โดยไม่ตรวจอะไร

---

## เมื่อเทส flaky

**อย่าเพิ่ม retry เป็นทางแก้แรก**

retry 2 ครั้งทำให้ build เขียว 97.5% ทั้งที่ flake rate 5% เท่าเดิม —
คุณจะไม่เห็นปัญหาจนกว่ามันจะโตพอที่ retry เอาไม่อยู่

```bash
./scripts/nightly-flake.sh
```

ดู `correlation index`:
- \> 0.4 → flake มาจากสาเหตุร่วม (env, resource) — แก้ที่ต้นเหตุ
- < 0.4 → flake เป็นอิสระ — แก้ทีละตัว

---

## อะไรที่ไม่ต้องเขียนเทส

- UI component รายตัวที่ไม่มี logic
- getter/setter ที่ไม่มีการแปลงค่า
- config object

การเขียนเทสให้ครบทุกอย่าง**ลด**คุณภาพ เพราะ suite ช้าลง
คนเลยรันน้อยลง

พื้นที่ที่ยังไม่มีเทสเลยสักตัว มีค่ากว่าพื้นที่ที่มีเทส 78 ตัวแล้วเพิ่มตัวที่ 79
