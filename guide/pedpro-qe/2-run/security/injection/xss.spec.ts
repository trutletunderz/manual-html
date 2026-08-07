// ============================================================
// XSS & Injection Suite — คู่มือ L3.4E
//
// ⭐ หลักการที่สำคัญที่สุด:
//    ตรวจว่า payload "execute" มั้ย ไม่ใช่ตรวจว่า HTML มี <script> มั้ย
//    เพราะ <script> ที่แสดงเป็นข้อความ = ปลอดภัย
//    แต่ onerror ที่ไม่มีคำว่า script = อันตราย
//
//    วิธี: ทุก payload ตั้ง window.__pwned = 1
//          จบเทสแล้วเช็คว่า __pwned ยัง undefined อยู่มั้ย
// ============================================================

import { test, expect, type Page } from "@playwright/test"
import { execSync } from "node:child_process"
import {
  XSS_PAYLOADS, URL_PAYLOADS, OPEN_REDIRECT_PAYLOADS, LEAK_PATTERNS,
} from "./payloads"

// ADAPT: ฟังก์ชันที่ตั้งค่าผ่าน API แล้วไปโผล่ที่หน้าเว็บ
import {
  setDisplayName, setWithdrawNote, setBankAccountName,
  setSupportMessage, setProfileWebsite, loginAsTestUser,
} from "./helpers"

/** จุดที่ input ของผู้ใช้ไปโผล่ */
const REFLECTION_POINTS = [
  { name: "ชื่อที่แสดง",     set: setDisplayName,     page: "/profile",  testId: "display-name" },
  { name: "หมายเหตุการถอน", set: setWithdrawNote,    page: "/withdraw", testId: "withdraw-note" },
  { name: "ชื่อบัญชีธนาคาร", set: setBankAccountName, page: "/profile",  testId: "bank-name" },
  { name: "ข้อความสนับสนุน", set: setSupportMessage,  page: "/support",  testId: "support-msg" },
] as const

async function wasPwned(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as any).__pwned !== undefined)
}

// ============================================================
// 1. Stored XSS ที่จุดสะท้อนแต่ละจุด
// ============================================================
for (const point of REFLECTION_POINTS) {
  test.describe(`XSS: ${point.name}`, () => {

    for (const payload of XSS_PAYLOADS) {
      test(`ไม่ execute: ${payload.slice(0, 45)}`, async ({ page }) => {
        await loginAsTestUser(page)
        await point.set(payload)

        await page.goto(point.page)
        await page.waitForLoadState("networkidle")

        // ── 1. ต้องไม่มีการ execute ──
        expect(
          await wasPwned(page),
          `⭐ XSS สำเร็จที่ "${point.name}"\n  payload: ${payload}`
        ).toBe(false)

        // ── 2. ต้องแสดงเป็นข้อความ ไม่ใช่ถูก strip เงียบๆ ──
        //    การ strip ทิ้งทั้งหมดอาจซ่อนปัญหาว่า sanitizer ทำงานเกินไป
        const el = page.getByTestId(point.testId)
        if (await el.count()) {
          const text = await el.innerText()
          expect(
            text.length,
            `input ถูกลบทั้งหมด — ตรวจว่าเป็น sanitize ที่ตั้งใจ ไม่ใช่ data loss`
          ).toBeGreaterThan(0)
        }

        // ── 3. ต้องไม่มี element อันตรายถูกสร้างจริง ──
        const sel = `[data-test="${point.testId}"]`
        expect(await page.locator(`${sel} script`).count()).toBe(0)
        expect(await page.locator(`${sel} iframe`).count()).toBe(0)
        expect(await page.locator(`${sel} [onerror]`).count()).toBe(0)
        expect(await page.locator(`${sel} [onload]`).count()).toBe(0)
      })
    }

    // ⭐ ตรวจว่า payload เข้าไปถึงหน้าจริง (กัน false negative)
    test("payload ธรรมดาแสดงผลได้จริง", async ({ page }) => {
      await loginAsTestUser(page)
      const marker = `MARKER-${Date.now()}`
      await point.set(marker)
      await page.goto(point.page)

      await expect(
        page.getByTestId(point.testId),
        "ถ้าข้อความธรรมดายังไม่โผล่ แปลว่าเทส XSS ข้างบนไม่ได้เทสอะไรเลย"
      ).toContainText(marker)
    })
  })
}

// ============================================================
// 2. XSS ผ่าน URL / href
// ============================================================
test.describe("XSS ผ่าน URL และ href", () => {
  for (const payload of URL_PAYLOADS) {
    test(`href ไม่รับ: ${JSON.stringify(payload).slice(0, 40)}`, async ({ page }) => {
      await loginAsTestUser(page)
      await setProfileWebsite(payload)
      await page.goto("/profile")

      const link = page.getByTestId("profile-website")
      if (!(await link.count())) return   // ไม่แสดงเลยก็ปลอดภัย

      const href = (await link.getAttribute("href")) ?? ""
      expect(
        href,
        `href = ${href}\n  -> ต้อง sanitize scheme ก่อนใส่ใน href`
      ).not.toMatch(/^[\s\u0000-\u001f]*(javascript|data|vbscript):/i)
    })
  }
})

// ============================================================
// 3. Open redirect
// ============================================================
test.describe("Open redirect", () => {
  for (const payload of OPEN_REDIRECT_PAYLOADS) {
    test(`ไม่ redirect ออกนอกโดเมน: ${payload.slice(0, 40)}`, async ({ page }) => {
      // ADAPT: path ที่รับ redirect parameter
      await page.goto(`/login?next=${encodeURIComponent(payload)}`)
      await loginAsTestUser(page)
      await page.waitForLoadState("networkidle")

      const url = new URL(page.url())
      const allowed = new URL(process.env.BASE_URL ?? "http://localhost:3000")

      expect(
        url.hostname,
        `⭐ open redirect — ผู้ใช้ถูกพาไป ${url.hostname}\n` +
          `  ใช้ทำ phishing ได้เพราะลิงก์เริ่มจากโดเมนที่ผู้ใช้ไว้ใจ`
      ).toBe(allowed.hostname)
    })
  }
})

// ============================================================
// 4. Error message ไม่หลุด internal detail
// ============================================================
test.describe("error message ไม่รั่วข้อมูล", () => {
  const BAD_INPUTS = [
    { path: "/api/transactions/not-a-uuid", method: "GET" },
    { path: "/api/deposit", method: "POST", body: { amount: "abc" } },
    { path: "/api/withdraw", method: "POST", body: null },
  ]

  for (const input of BAD_INPUTS) {
    test(`${input.method} ${input.path}`, async ({ request }) => {
      const res = await request.fetch(input.path, {
        method: input.method,
        data: input.body ?? undefined,
        failOnStatusCode: false,
      })

      expect(res.status(), "ต้องไม่ 5xx").toBeLessThan(500)

      const text = await res.text()
      for (const { name, re } of LEAK_PATTERNS) {
        expect(
          re.test(text),
          `⭐ error response หลุด ${name}\n  ${text.slice(0, 300)}`
        ).toBe(false)
      }
    })
  }
})

// ============================================================
// 5. Static gate — ตรวจโค้ดเบสตรงๆ
// ============================================================
test.describe("static: กฎการเขียนที่กัน XSS", () => {
  const grep = (cmd: string) => {
    try {
      return execSync(cmd, { encoding: "utf8" }).trim()
    } catch {
      return ""
    }
  }

  test("ไม่มี v-html ที่ไม่ผ่าน sanitize", () => {
    const out = grep(
      `grep -rn 'v-html' --include='*.vue' . | grep -v node_modules | grep -v 'sanitize(' || true`
    )
    expect(out, `v-html ต้องผ่าน sanitize เสมอ:\n${out}`).toBe("")
  })

  test("ไม่มี innerHTML ที่รับค่าจากตัวแปร", () => {
    const out = grep(
      `grep -rnE '\\.innerHTML\\s*=\\s*[^"'"'"'\`]' --include='*.ts' --include='*.vue' . ` +
        `| grep -v node_modules || true`
    )
    expect(out, `innerHTML ที่รับตัวแปร = ช่องทาง XSS:\n${out}`).toBe("")
  })

  test("ไม่มี eval / new Function", () => {
    const out = grep(
      `grep -rnE '\\beval\\(|new Function\\(' --include='*.ts' --include='*.vue' . ` +
        `| grep -v node_modules || true`
    )
    expect(out, `eval/new Function ไม่ควรมีในโค้ด frontend:\n${out}`).toBe("")
  })

  test("ไม่มี target=_blank ที่ไม่มี rel=noopener", () => {
    const out = grep(
      `grep -rn 'target="_blank"' --include='*.vue' . ` +
        `| grep -v node_modules | grep -v 'noopener' || true`
    )
    expect(out, `target=_blank ต้องมี rel="noopener noreferrer":\n${out}`).toBe("")
  })
})
