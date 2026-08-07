// ============================================================
// Thai i18n Gate — คู่มือ L3.7
//
// ⭐ ส่วนที่ไม่มีตำราสากลเล่มไหนสอน และ tool ต่างชาติจับไม่ได้
//
// gate นี้จับปัญหาที่:
//   - collation ไม่ตรงกับ DB -> pagination มีรายการหาย/ซ้ำ
//   - พ.ศ. ผิด -> ปล่อยผู้ที่อายุไม่ถึงเกณฑ์เข้าระบบ (ปัญหากฎหมาย)
//   - break-all -> ตัดกลางคำ แยกสระออกจากพยัญชนะ
// ============================================================

import { describe, it, expect, vi, afterEach } from "vitest"
import { execSync } from "node:child_process"
import { thaiEvilStrings, fakeThaiId, isValidThaiId } from "../fixtures/thai"

// ADAPT: import จากโค้ดจริงของโปรเจกต์
import {
  beToCe, ceToBe, calcAgeFromBE,
  normalizePhone, stripThaiTitle, formatCount,
} from "~/utils/thai"

// ============================================================
// 1. พ.ศ. / ค.ศ.  — 8 จุดที่พังตามคู่มือ L3.7.1
// ============================================================
describe("การแปลง พ.ศ. / ค.ศ.", () => {
  afterEach(() => vi.useRealTimers())

  it.each([
    [2567, 2024],
    [2568, 2025],
    [2500, 1957],
    [2600, 2057],
    [2484, 1941],   // ปีที่ไทยเปลี่ยนวันขึ้นปีใหม่
  ])("พ.ศ. %i = ค.ศ. %i", (be, ce) => {
    expect(beToCe(be)).toBe(ce)
    expect(ceToBe(ce)).toBe(be)
  })

  it("round-trip ทุกปีในช่วง 300 ปี", () => {
    for (let be = 2400; be <= 2700; be++) {
      expect(ceToBe(beToCe(be)), `พ.ศ. ${be}`).toBe(be)
    }
  })

  it("⭐ ไม่แปลงซ้ำสองรอบ (bug ที่เจอบ่อยที่สุด)", () => {
    // ถ้าได้ 1481 แปลว่าลบ 543 สองครั้ง
    expect(beToCe(beToCe(2567))).not.toBe(1481)
  })

  it("⭐ คำนวณอายุถูกต้องข้ามระบบปี", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-25T00:00:00+07:00"))

    expect(calcAgeFromBE(2551, 7, 24), "เกิด 24 ก.ค. 2551 = ครบ 18 เมื่อวาน").toBe(18)
    expect(calcAgeFromBE(2551, 7, 25), "เกิดวันนี้พอดี").toBe(18)
    expect(calcAgeFromBE(2551, 7, 26), "ยังไม่ถึงวันเกิด").toBe(17)
  })

  it("⭐ เกณฑ์อายุขั้นต่ำใช้ปีที่ถูกต้อง (ปัญหากฎหมาย)", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-25T00:00:00+07:00"))

    const MIN_AGE = 20   // ADAPT: ตามกฎหมายที่ใช้จริง
    // คนเกิด พ.ศ. 2550 อายุ 19 ปี -> ต้องไม่ผ่าน
    expect(calcAgeFromBE(2550, 7, 26)).toBeLessThan(MIN_AGE)
  })
})

// ============================================================
// 2. การเรียงลำดับภาษาไทย
// ============================================================
describe("การเรียงลำดับภาษาไทย", () => {
  const sortTh = (arr: readonly string[]) =>
    [...arr].sort((a, b) => a.localeCompare(b, "th-TH"))

  it("เรียงถูกตามพจนานุกรม", () => {
    expect(sortTh(thaiEvilStrings.sortTricky)).toEqual([
      "มด", "มะม่วง", "เมฆ", "แมว", "ไม้", "หมา",
    ])
  })

  it("พยัญชนะที่เลิกใช้แล้วยังอยู่ในลำดับที่ถูก", () => {
    expect(sortTh(thaiEvilStrings.sortObsolete)).toEqual([
      "ก", "ข", "ฃ", "ค", "ฅ", "ฆ", "ง",
    ])
  })

  it("การเรียงเป็น total order (antisymmetric + transitive)", () => {
    const words = [...thaiEvilStrings.sortTricky, ...thaiEvilStrings.sortVowelLead]
    const cmp = (x: string, y: string) => Math.sign(x.localeCompare(y, "th-TH"))

    for (const a of words)
      for (const b of words) {
        expect(cmp(a, b), `antisymmetry: ${a} vs ${b}`).toBe(-cmp(b, a))
        for (const c of words) {
          if (cmp(a, b) <= 0 && cmp(b, c) <= 0)
            expect(cmp(a, c), `transitivity: ${a} <= ${b} <= ${c}`).toBeLessThanOrEqual(0)
        }
      }
  })

  // ⭐ เทสที่มีมูลค่าสูงสุดในไฟล์นี้
  it.skipIf(!process.env.INTERNAL_TOKEN)(
    "⭐ frontend เรียงเหมือน DB (ไม่งั้น pagination พัง)",
    async () => {
      const names = [
        ...thaiEvilStrings.sortTricky,
        "สมชาย", "ก", "อ", "ฮ",
      ]

      // ADAPT: endpoint ที่เรียกใช้ ORDER BY ... COLLATE ของ DB จริง
      const res = await fetch(`${process.env.BASE_URL}/api/internal/sort-test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": process.env.INTERNAL_TOKEN!,
        },
        body: JSON.stringify({ names }),
      })
      if (!res.ok) throw new Error(`sort-test ล้มเหลว: HTTP ${res.status}`)

      const fromDb: string[] = (await res.json()).Data
      const fromJs = sortTh(names)

      expect(
        fromJs,
        "⭐ collation ไม่ตรงกัน -> pagination จะมีรายการหาย/ซ้ำระหว่างหน้า\n" +
          `  JS: ${fromJs.join(", ")}\n` +
          `  DB: ${fromDb.join(", ")}\n` +
          "  แก้: เรียงที่เดียว — ถ้าเรียงที่ DB แล้ว frontend ห้ามเรียงซ้ำ"
      ).toEqual(fromDb)
    }
  )
})

// ============================================================
// 3. Normalize ข้อมูลไทย
// ============================================================
describe("normalize ข้อมูลไทย", () => {
  it.each(thaiEvilStrings.phones)("normalize เบอร์: %s -> 0812345678", (input) => {
    expect(normalizePhone(input)).toBe("0812345678")
  })

  it("normalize เบอร์เป็น idempotent", () => {
    for (const p of thaiEvilStrings.phones) {
      const once = normalizePhone(p)
      expect(normalizePhone(once), `${p} normalize ซ้ำแล้วเปลี่ยน`).toBe(once)
    }
  })

  it.each([
    ["นายสมชาย ใจดี", "สมชาย ใจดี"],
    ["นาย สมชาย ใจดี", "สมชาย ใจดี"],
    ["น.ส.สมหญิง", "สมหญิง"],
    ["นางสาว สมหญิง", "สมหญิง"],
  ])("ตัดคำนำหน้า: %s -> %s", (input, expected) => {
    expect(stripThaiTitle(input)).toBe(expected)
  })

  it("ลักษณนามไทยไม่มีพหูพจน์", () => {
    expect(formatCount(1)).toBe("1 รายการ")
    expect(formatCount(5)).toBe("5 รายการ")
    expect(formatCount(0)).toBe("0 รายการ")
  })
})

// ============================================================
// 4. เลขบัตรประชาชน
// ============================================================
describe("เลขบัตรประชาชน", () => {
  it("fixture ที่ให้มา checksum ถูกต้อง", () => {
    expect(isValidThaiId(thaiEvilStrings.thaiIdValid)).toBe(true)
  })

  it("ผิดหลักเดียวต้องไม่ผ่าน", () => {
    expect(isValidThaiId(thaiEvilStrings.thaiIdBadChecksum)).toBe(false)
  })

  it("สั้นเกินไปต้องไม่ผ่าน", () => {
    expect(isValidThaiId(thaiEvilStrings.thaiIdTooShort)).toBe(false)
  })

  it("generator สร้างเลขที่ checksum ถูกทุกครั้ง (1000 ตัว)", () => {
    for (let i = 0; i < 1000; i++) {
      const id = fakeThaiId(i)
      expect(isValidThaiId(id), `seed ${i} -> ${id}`).toBe(true)
    }
  })

  it("⭐ validator ของ production ตรงกับ checksum ที่คำนวณแยก", async () => {
    // ADAPT: import validator ตัวจริง
    const { validateThaiId } = await import("~/utils/thai")

    for (let i = 0; i < 200; i++) {
      const good = fakeThaiId(i)
      expect(validateThaiId(good), `${good} ควรผ่าน`).toBe(true)

      // สร้างเลขผิดโดยเปลี่ยนหลักสุดท้าย
      const bad = good.slice(0, 12) + ((Number(good[12]) + 1) % 10)
      expect(validateThaiId(bad), `${bad} ควรไม่ผ่าน`).toBe(false)
    }
  })
})

// ============================================================
// 5. Static gate — ตรวจโค้ดเบสตรงๆ
// ============================================================
describe("static: กฎการแสดงผลภาษาไทย", () => {
  const grep = (pattern: string, extra = "") => {
    try {
      return execSync(
        `grep -rn '${pattern}' --include='*.vue' --include='*.css' --include='*.scss' ` +
          `--include='*.ts' . ${extra} 2>/dev/null | grep -v node_modules || true`,
        { encoding: "utf8" }
      ).trim()
    } catch {
      return ""
    }
  }

  it("ไม่มี word-break: break-all (ตัดกลางคำไทย)", () => {
    const found = grep("break-all")
    expect(
      found,
      `⭐ break-all แยกสระออกจากพยัญชนะ ทำให้อ่านไม่รู้เรื่อง\n` +
        `ใช้ overflow-wrap: break-word แทน\n${found}`
    ).toBe("")
  })

  it("ไม่มี 100vh (ถูก bottom bar ของ LINE ทับ)", () => {
    const found = grep("100vh")
    expect(found, `ใช้ 100dvh แทน\n${found}`).toBe("")
  })

  it("ไม่มี v-html ที่ไม่ผ่าน sanitize", () => {
    const found = grep("v-html", "| grep -v 'sanitize('")
    expect(found, `v-html ต้องผ่าน sanitize เสมอ\n${found}`).toBe("")
  })
})
