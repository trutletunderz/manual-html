# Fault Attacks (ACTIVE)

generate จาก pipeline-skill/fault-attacks.yaml เมื่อ 2026-07-26
**ห้ามแก้ไฟล์นี้โดยตรง** — แก้ที่ YAML แล้วรัน `node scripts/knowledge-gc.mjs --write`

> ต้องพิจารณาทุกข้อที่ scope ตรงกับงานที่กำลังทำ
> ข้อที่ถูกครอบด้วย automated gate แล้วจะหายไปจากไฟล์นี้เอง

## scope: money

- [ ] **FA-002** Number('') = 0 — ค่าว่างกลายเป็นศูนย์เงียบๆ ถ้าใช้ if (!amount) จะแยกไม่ออก
- [ ] **FA-003** NaN < 100 เป็น false — input ที่ไม่ใช่ตัวเลขจะผ่าน validation ไปหลังบ้าน
- [ ] **FA-004** parseInt('500abc') = 500 — ห้ามใช้ parseInt กับ input ของผู้ใช้
- [ ] **FA-005** Number('5e3') = 5000 — scientific notation ผ่าน validation ที่เช็คแค่ช่วงค่า
- [ ] **FA-007** double submit — กด 3 ครั้งพร้อมกันด้วย Promise.all ต้องยิง API ครั้งเดียว
- [ ] **FA-201** ขอบวันตามเวลาไทย: 06:59:59 / 07:00:00 / 07:00:01 (UTC+7 = เที่ยงคืน UTC) Cloud Run รัน UTC → 'ครั้งแรกของวัน' อาจได้ 2 ครั้ง
- [ ] **FA-204** idempotency — ยิง webhook/request เดิม 3 ครั้งพร้อมกัน (Promise.all) ต้องได้ ledger 1 แถว และ balance เปลี่ยนครั้งเดียว
- [ ] **FA-205** ลำดับของ idempotency check — ต้องเช็คก่อน insert ledger ไม่ใช่หลัง
- [ ] **FA-207** admin 2 คนกด approve พร้อมกัน → จ่ายครั้งเดียว
- [ ] **FA-210** Cloud Run ตัด CPU หลังส่ง response — งาน background (audit log, notification) หลัง res.json() อาจไม่เสร็จ
- [ ] **FA-401** backend ห้ามเชื่อ DoAdmin/DoIp ที่ client ส่งมา — ต้องมาจาก session/socket
- [ ] **FA-406** จำนวนเงินติดลบ / เกิน MAX_SAFE_INTEGER / ทศนิยมเกิน 2 ตำแหน่ง
- [ ] **FA-407** invariant sum(ledger) === balance ต้องอยู่ใน afterEach ของทุกเทสการเงิน

## scope: auth

- [ ] **FA-107** คำนำหน้าชื่อ 'นายสมชาย' vs 'นาย สมชาย' → KYC ไม่ตรงบัญชีธนาคาร
- [ ] **FA-108** เบอร์โทร 5 รูปแบบ (0xx, +66, 66, มีขีด, มีเว้นวรรค) → normalize เป็นแบบเดียว และ normalize ต้อง idempotent
- [ ] **FA-109** เลขบัตรประชาชน 13 หลัก ต้องตรวจ checksum mod 11 ไม่ใช่แค่นับหลัก
- [ ] **FA-207** admin 2 คนกด approve พร้อมกัน → จ่ายครั้งเดียว
- [ ] **FA-208** token หมดอายุพอดีวินาทีที่กด submit
- [ ] **FA-209** session หมดอายุระหว่างกรอกฟอร์มหลายขั้น
- [ ] **FA-301** LINE in-app browser: session หายหลัง redirect กลับจาก gateway (third-party cookie ถูกบล็อก) — ต้องเทสด้วยมือบนเครื่องจริง
- [ ] **FA-401** backend ห้ามเชื่อ DoAdmin/DoIp ที่ client ส่งมา — ต้องมาจาก session/socket
- [ ] **FA-402** endpoint ใหม่ทุกตัวต้องมี authz spec — ไม่มี = CI แดง
- [ ] **FA-403** error response ที่ถูกปฏิเสธ ห้ามหลุด amount/balance/idCard/phone
- [ ] **FA-404** resource ที่มีอยู่กับไม่มี ต้องตอบ status เดียวกัน (enumeration)
- [ ] **FA-408** rate limit ต้องผูกกับเบอร์/บัญชี ไม่ใช่แค่ IP (เปลี่ยน proxy แล้ว bypass ได้)
- [ ] **FA-409** OTP ใช้ซ้ำไม่ได้ + หมดอายุแล้วใช้ไม่ได้ + ไม่รั่วว่าเบอร์มีในระบบ (timing)
- [ ] **FA-410** logout แล้ว token เดิมต้องใช้ไม่ได้ + เปลี่ยนรหัสผ่านต้องยกเลิก session อื่น
- [ ] **FA-411** PDPA: screenshot/trace/log ของ Playwright ห้ามมี PII จริง
- [ ] **FA-412** prompt injection: เนื้อหาที่ผู้ใช้กรอกอาจไหลเข้า context ของ agent ผ่าน Playwright ที่อ่านหน้าเว็บ

## scope: webhook

- [ ] **FA-204** idempotency — ยิง webhook/request เดิม 3 ครั้งพร้อมกัน (Promise.all) ต้องได้ ledger 1 แถว และ balance เปลี่ยนครั้งเดียว
- [ ] **FA-205** ลำดับของ idempotency check — ต้องเช็คก่อน insert ledger ไม่ใช่หลัง
- [ ] **FA-206** webhook มาถึงก่อน response ของ API หลัก (race)
- [ ] **FA-405** webhook ต้องมี HMAC signature + timestamp window + timingSafeEqual

## scope: thai

- [ ] **FA-101** ข้อความไทยไม่มีเว้นวรรค 60+ ตัวอักษร → ทะลุ container มั้ย (จอ 320px)
- [ ] **FA-102** ห้ามใช้ word-break: break-all กับข้อความไทย — มันแยกสระออกจากพยัญชนะ
- [ ] **FA-103** สระ/วรรณยุกต์ซ้อน 'กิิิ๊๊๊๋๋๋' → สระลอย ทับบรรทัดบน layout เพี้ยน
- [ ] **FA-104** localeCompare(a,b,'th-TH') ต้องให้ผลเหมือน ORDER BY ... COLLATE ของ DB ไม่งั้น pagination มีรายการหาย/ซ้ำระหว่างหน้า
- [ ] **FA-105** พ.ศ./ค.ศ. — ตรวจ 8 จุด: KYC, date picker, ประวัติ, filter, export, หมดอายุโปร, อายุขั้นต่ำ, ปีก่อน 2484
- [ ] **FA-106** แปลงปีซ้ำสองรอบ — beToCe(beToCe(2567)) ต้องไม่ได้ 1481
- [ ] **FA-107** คำนำหน้าชื่อ 'นายสมชาย' vs 'นาย สมชาย' → KYC ไม่ตรงบัญชีธนาคาร
- [ ] **FA-108** เบอร์โทร 5 รูปแบบ (0xx, +66, 66, มีขีด, มีเว้นวรรค) → normalize เป็นแบบเดียว และ normalize ต้อง idempotent
- [ ] **FA-109** เลขบัตรประชาชน 13 หลัก ต้องตรวจ checksum mod 11 ไม่ใช่แค่นับหลัก
- [ ] **FA-110** กรุงเทพฯ ใช้ แขวง/เขต — จังหวัดอื่นใช้ ตำบล/อำเภอ → label ต้องเปลี่ยนตามจังหวัด
- [ ] **FA-111** ลักษณนามไทยไม่มีพหูพจน์ — '5 รายการ' ไม่ใช่ '5 รายการs' ห้ามใช้ pluralization ของ i18n lib ตรงๆ
- [ ] **FA-112** Thai numerals ๑๒๓ — ระบบตีเป็นตัวเลขมั้ย? screen reader อ่านได้มั้ย?
- [ ] **FA-113** ตัวอักษรไทยต้อง >= 16px และ line-height >= 1.7 (Latin ใช้ 14px/1.5 พอ)
- [ ] **FA-114** html lang="th" ต้องมี ไม่งั้น screen reader อ่านผิดหมด

## scope: time

- [ ] **FA-105** พ.ศ./ค.ศ. — ตรวจ 8 จุด: KYC, date picker, ประวัติ, filter, export, หมดอายุโปร, อายุขั้นต่ำ, ปีก่อน 2484
- [ ] **FA-106** แปลงปีซ้ำสองรอบ — beToCe(beToCe(2567)) ต้องไม่ได้ 1481
- [ ] **FA-201** ขอบวันตามเวลาไทย: 06:59:59 / 07:00:00 / 07:00:01 (UTC+7 = เที่ยงคืน UTC) Cloud Run รัน UTC → 'ครั้งแรกของวัน' อาจได้ 2 ครั้ง
- [ ] **FA-202** Asia/Bangkok ไม่มี DST — แต่ถ้าโค้ดใช้ library ที่สมมติว่ามี จะเพี้ยน
- [ ] **FA-203** 23:59:59, 00:00:00, วันสิ้นเดือน, 29 ก.พ.
- [ ] **FA-208** token หมดอายุพอดีวินาทีที่กด submit

## scope: form

- [ ] **FA-001** ค่าว่าง, whitespace เท่านั้น, zero-width space (\u200B) ที่ copy ติดมา
- [ ] **FA-002** Number('') = 0 — ค่าว่างกลายเป็นศูนย์เงียบๆ ถ้าใช้ if (!amount) จะแยกไม่ออก
- [ ] **FA-003** NaN < 100 เป็น false — input ที่ไม่ใช่ตัวเลขจะผ่าน validation ไปหลังบ้าน
- [ ] **FA-004** parseInt('500abc') = 500 — ห้ามใช้ parseInt กับ input ของผู้ใช้
- [ ] **FA-005** Number('5e3') = 5000 — scientific notation ผ่าน validation ที่เช็คแค่ช่วงค่า
- [ ] **FA-006** ค่ายาวเกิน 10,000 ตัวอักษร — field limit ที่ backend กับ frontend ต้องตรงกัน
- [ ] **FA-007** double submit — กด 3 ครั้งพร้อมกันด้วย Promise.all ต้องยิง API ครั้งเดียว
- [ ] **FA-008** unmount ระหว่างรอ response — ต้องไม่มี state update warning หรือ memory leak
- [ ] **FA-009** กด Enter ในช่อง input ต้อง submit ได้
- [ ] **FA-110** กรุงเทพฯ ใช้ แขวง/เขต — จังหวัดอื่นใช้ ตำบล/อำเภอ → label ต้องเปลี่ยนตามจังหวัด
- [ ] **FA-112** Thai numerals ๑๒๓ — ระบบตีเป็นตัวเลขมั้ย? screen reader อ่านได้มั้ย?
- [ ] **FA-209** session หมดอายุระหว่างกรอกฟอร์มหลายขั้น
- [ ] **FA-306** refresh กลางคัน flow หลายขั้น / deep link เข้าขั้นที่ 3 ตรงๆ
- [ ] **FA-307** back gesture บนมือถือ — ข้อมูลในฟอร์มหายมั้ย

## scope: browser

- [ ] **FA-101** ข้อความไทยไม่มีเว้นวรรค 60+ ตัวอักษร → ทะลุ container มั้ย (จอ 320px)
- [ ] **FA-301** LINE in-app browser: session หายหลัง redirect กลับจาก gateway (third-party cookie ถูกบล็อก) — ต้องเทสด้วยมือบนเครื่องจริง
- [ ] **FA-302** window.open ไม่ทำงานใน LINE in-app — ห้ามใช้ในเส้นทางหลัก
- [ ] **FA-303** 100vh ถูก bottom bar ของ LINE ทับ — ใช้ 100dvh
- [ ] **FA-304** file input ใน LINE in-app จำกัด — flow KYC อาจอัปโหลดไม่ได้
- [ ] **FA-305** localStorage เต็ม (quota exceeded) / ถูกลบกลางคัน
- [ ] **FA-306** refresh กลางคัน flow หลายขั้น / deep link เข้าขั้นที่ 3 ตรงๆ
- [ ] **FA-307** back gesture บนมือถือ — ข้อมูลในฟอร์มหายมั้ย
- [ ] **FA-308** จอ 320px (iPhone SE) + zoom 200% (a11y) + dark mode ของ OS
- [ ] **FA-309** 4G ช้ามาก / offline -> online / ตัดเน็ตตอนกำลัง submit
- [ ] **FA-413** v-html ต้องผ่าน sanitize เสมอ
- [ ] **FA-414** href ห้ามรับ javascript: / data: / vbscript: (รวมที่มี space/tab นำหน้า)

## scope: a11y

- [ ] **FA-009** กด Enter ในช่อง input ต้อง submit ได้
- [ ] **FA-112** Thai numerals ๑๒๓ — ระบบตีเป็นตัวเลขมั้ย? screen reader อ่านได้มั้ย?
- [ ] **FA-113** ตัวอักษรไทยต้อง >= 16px และ line-height >= 1.7 (Latin ใช้ 14px/1.5 พอ)
- [ ] **FA-114** html lang="th" ต้องมี ไม่งั้น screen reader อ่านผิดหมด
- [ ] **FA-308** จอ 320px (iPhone SE) + zoom 200% (a11y) + dark mode ของ OS
