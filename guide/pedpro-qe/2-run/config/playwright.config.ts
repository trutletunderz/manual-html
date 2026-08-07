// ============================================================
// Playwright config — คู่มือ L2.6
// ============================================================
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",

  // ⭐ .only หลุดเข้า CI = build แดง
  forbidOnly: !!process.env.CI,

  // ⭐ retry เฉพาะ CI และต้องวัด flake ที่ attempt แรก (L2.7)
  //    ถ้า retry บนเครื่อง dev คุณจะไม่เห็น flake จนกว่ามันจะทำ CI พัง
  retries: process.env.CI ? 2 : 0,

  workers: process.env.CI ? 4 : undefined,
  fullyParallel: true,
  timeout: 30_000,
  expect: { timeout: 5_000 },

  reporter: process.env.CI
    ? [["list"], ["json", { outputFile: "reports/playwright.json" }], ["html", { open: "never" }]]
    : [["list"]],

  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",

    // ⭐ ใช้ data-test ตาม convention ของโปรเจกต์
    testIdAttribute: "data-test",

    // ⭐ บังคับ locale/timezone — ไม่งั้นเทสวันที่จะพังบน CI
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",

    // ⭐ ปิด animation — สาเหตุอันดับต้นของ flaky visual test
    reducedMotion: "reduce",

    // ⭐ เก็บหลักฐานเฉพาะตอนพัง — ประหยัดพื้นที่และเวลา
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",

    actionTimeout: 10_000,
  },

  projects: [
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
    },
    {
      // ⭐ LINE in-app — UA spoof จับได้เท่าที่จับได้ (L3.6)
      //    ไม่ทดแทน manual checklist บนเครื่องจริง
      name: "line-inapp",
      use: {
        ...devices["iPhone 13"],
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
          "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/14.0.0",
      },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: process.env.CI
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
})
