// ============================================================
// Thai Test Fixtures — คู่มือ ภาคผนวก C
//
// ⭐ ส่วนที่ tool ต่างชาติไม่มี และเป็นความได้เปรียบที่แท้จริง
//
// กฎที่สำคัญที่สุดในไฟล์นี้ (การแก้ H-06):
//   fixture ที่มี checksum/hash/signature
//   ต้อง generate ด้วยอัลกอริทึมที่เขียนแยกจากโค้ด production เสมอ
//   ไม่งั้นถ้า production คำนวณผิดแบบเดียวกัน เทสจะเขียวทั้งที่ทั้งคู่ผิด
//   (tautological fixture)
// ============================================================

export const thaiEvilStrings = {
  // ── layout / line-break ────────────────────────────────
  /** ไม่มีเว้นวรรค 60+ ตัว — ทดสอบว่าทะลุ container มั้ย */
  noSpace: "ประเทศไทยมีจังหวัดเชียงรายอยู่ทางภาคเหนือติดกับพม่าและลาว",

  /** สระ/วรรณยุกต์ซ้อน — ทดสอบสระลอยทับบรรทัดบน */
  stackedMarks: "กิิิ๊๊๊๋๋๋ำำำ",

  /** ชื่อยาวสุดขั้วที่มีจริง */
  longName: "นางสาวประภัสสรมณีวรรณเจริญรุ่งเรืองยิ่งสถาพร",

  /** สระนำหน้า — ทดสอบการเรียงและการตัดคำ */
  leadingVowels: "เเกม",       // เ ซ้อน 2 ตัว (พิมพ์ผิดที่พบบ่อย)

  // ── encoding / normalization ───────────────────────────
  thaiNumerals: "๑๒๓๔๕๖๗๘๙๐",
  mixed: "สมชาย Smith 王小明 🎮",

  /** zero-width space ที่ copy ติดมาจาก Word/เว็บ */
  zeroWidth: "สม\u200Bชาย",

  /** non-breaking space */
  nbsp: "สม\u00A0ชาย",

  /** ตัวอักษรที่ normalize แล้วต่างกัน (NFC vs NFD) */
  combining: "\u0e01\u0e34\u0e49",   // ก + สระอิ + ไม้โท

  // ── collation ──────────────────────────────────────────
  /** เรียงถูกตามพจนานุกรม: มด, มะม่วง, เมฆ, แมว, ไม้, หมา */
  sortTricky: ["แมว", "มด", "ไม้", "มะม่วง", "เมฆ", "หมา"] as const,

  /** สระนำหน้าต้องเรียงตามพยัญชนะ ไม่ใช่ตามสระ */
  sortVowelLead: ["เกม", "แกม", "โกม", "ใกม", "ไกม", "กเม"] as const,

  /** พยัญชนะที่เลิกใช้แล้วแต่ยังอยู่ในลำดับ */
  sortObsolete: ["ก", "ข", "ฃ", "ค", "ฅ", "ฆ", "ง"] as const,

  // ── identity ───────────────────────────────────────────
  phones: [
    "0812345678",
    "+66812345678",
    "66812345678",
    "081-234-5678",
    "081 234 5678",
    "081.234.5678",
  ] as const,

  titles: [
    "นายสมชาย ใจดี",
    "นาย สมชาย ใจดี",
    "น.ส.สมหญิง",
    "นางสาว สมหญิง",
    "ด.ช.สมชาย",
  ] as const,

  /** ⭐ checksum ถูกต้อง (ตรวจแล้ว — ดูการคำนวณด้านล่าง) */
  thaiIdValid: "1101700207366",

  /** ผิดหลักเดียว — ใช้ทดสอบว่า validator ตรวจ checksum จริงมั้ย */
  thaiIdBadChecksum: "1101700207365",

  /** สั้นเกินไป */
  thaiIdTooShort: "110170020736",
} as const

// ============================================================
// Generator — ห้ามใช้เลขบัตรจริงเด็ดขาด (PDPA)
// ============================================================

function seededRandom(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/**
 * สร้างเลขบัตรประชาชนปลอมที่ checksum ถูกต้อง
 *
 * อัลกอริทึม: sum(d[i] * (13-i)) for i in 0..11
 *             check = (11 - (sum mod 11)) mod 10
 *
 * ⭐ ตัว mod 10 ตัวท้ายจำเป็น — ไม่งั้นอาจได้ 11 ซึ่งไม่ใช่หลักเดียว
 */
export function fakeThaiId(seed?: number): string {
  const rnd = seed !== undefined ? seededRandom(seed) : Math.random
  const d = Array.from({ length: 12 }, () => Math.floor(rnd() * 10))
  const sum = d.reduce((acc, n, i) => acc + n * (13 - i), 0)
  const check = (11 - (sum % 11)) % 10
  return [...d, check].join("")
}

/**
 * ตรวจ checksum
 *
 * ⭐ ต้องเขียนแยกจากโค้ด production
 *    ถ้า import validateThaiId จาก production มาใช้ตรวจ fixture
 *    = tautological fixture ที่พิสูจน์ว่า "โค้ดทำสิ่งที่โค้ดทำ"
 */
export function isValidThaiId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false
  const d = [...id].map(Number)
  const sum = d.slice(0, 12).reduce((a, n, i) => a + n * (13 - i), 0)
  return (11 - (sum % 11)) % 10 === d[12]
}

/** เบอร์มือถือไทยที่ยังไม่ถูกใช้ */
export function fakeThaiPhone(): string {
  const prefix = ["06", "08", "09"][Math.floor(Math.random() * 3)]
  return prefix + Math.floor(Math.random() * 1e8).toString().padStart(8, "0")
}

/** ชื่อไทยหลากหลาย รวมเคสสุดขั้ว — ใช้ตอน seed volume test */
export function fakeThaiName(i: number): string {
  const pool = [
    "สมชาย ใจดี",
    "แมวน้อย",
    "เมฆา",
    "ไม้เอก",
    "หมาป่า",
    thaiEvilStrings.longName,
    thaiEvilStrings.zeroWidth,
    thaiEvilStrings.stackedMarks,
    "Somchai Jaidee",
    "王小明",
    "สมชาย 🎮",
  ]
  return `${pool[i % pool.length]}-${i}`
}

/** ที่อยู่ไทย — กทม. ใช้ แขวง/เขต · จังหวัดอื่นใช้ ตำบล/อำเภอ */
export const thaiAddresses = [
  {
    province: "กรุงเทพมหานคร",
    subdistrictLabel: "แขวง",
    districtLabel: "เขต",
    subdistrict: "ลุมพินี",
    district: "ปทุมวัน",
    postcode: "10330",
  },
  {
    province: "เชียงราย",
    subdistrictLabel: "ตำบล",
    districtLabel: "อำเภอ",
    subdistrict: "เวียง",
    district: "เมืองเชียงราย",
    postcode: "57000",
  },
  {
    province: "พะเยา",
    subdistrictLabel: "ตำบล",
    districtLabel: "อำเภอ",
    subdistrict: "เวียง",
    district: "เมืองพะเยา",
    postcode: "56000",
  },
] as const

// ============================================================
// การตรวจ checksum ของ 1101700207366 — ไว้อ้างอิง
//
//   หลัก    1   1   0   1   7   0   0   2   0   7   3   6
//   น้ำหนัก 13  12  11  10   9   8   7   6   5   4   3   2
//   ผลคูณ   13  12   0  10  63   0   0  12   0  28   9  12
//
//   sum = 159
//   159 mod 11 = 5
//   check = (11 - 5) mod 10 = 6   ✓ ตรงกับหลักที่ 13
//
// อีกตัวอย่างที่พิสูจน์ว่า mod 10 ตัวท้ายจำเป็น:
//   1234567890121 -> sum = 352, 352 mod 11 = 0, check = 11 mod 10 = 1  ✓
//   ถ้าไม่มี mod 10 จะได้ 11 ซึ่งไม่ใช่หลักเดียว
// ============================================================
