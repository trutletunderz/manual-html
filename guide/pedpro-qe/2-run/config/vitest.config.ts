// ============================================================
// Vitest config — คู่มือ L2.2 (F.I.R.S.T+U)
//
// ทุกบรรทัดที่มี ⭐ คือสิ่งที่ทำให้ gate ทำงานได้จริง
// ============================================================
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom",

    // ⭐ R = Repeatable — บังคับ timezone/locale ให้เหมือนกันทุกเครื่อง
    //    ไม่งั้นเทสที่ผ่านบนเครื่องคุณจะพังบน CI ที่รัน UTC
    env: {
      TZ: "Asia/Bangkok",
      LANG: "th_TH.UTF-8",
      LC_ALL: "th_TH.UTF-8",
    },

    // ⭐ I = Independent — สุ่มลำดับทุกครั้ง
    //    เทสที่พึ่งลำดับจะพังทันทีแทนที่จะพังตอนที่คุณไม่ได้เตรียมใจ
    sequence: {
      shuffle: true,
      hooks: "stack",
    },

    // ⭐ F = Fast — เตือนเมื่อ unit test ช้าเกินเกณฑ์
    slowTestThreshold: 50,

    // ⭐ ห้าม .only หลุดเข้า CI
    allowOnly: false,

    // ⭐ fail-closed — ไม่มีเทสเลย = ไม่ผ่าน
    passWithNoTests: false,

    // ⭐ report ที่ gate อ่าน — ถ้าไฟล์นี้หายไป gate ต้องแดง
    reporters: process.env.CI
      ? ["default", "json", "junit"]
      : ["default"],
    outputFile: {
      json: "reports/vitest.json",
      junit: "reports/junit.xml",
    },

    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "lcov"],
      reportsDirectory: "reports/coverage",
      // ⭐ ratchet — ห้ามลดลง (ตัวเลขต้องมาจาก baseline จริง ไม่ใช่ตั้งลอยๆ)
      thresholds: {
        lines: Number(process.env.COV_LINES ?? 0),
        functions: Number(process.env.COV_FUNCS ?? 0),
        branches: Number(process.env.COV_BRANCHES ?? 0),
      },
      exclude: ["**/*.spec.ts", "**/*.config.*", "**/fixtures/**"],
    },

    setupFiles: ["./test/setup/global.ts"],

    // ⭐ timeout สั้น — ถ้าเทสต้องรอนานแปลว่ามีอะไรผิด
    testTimeout: 10_000,
    hookTimeout: 20_000,

    pool: "threads",
    poolOptions: { threads: { singleThread: false } },
  },
})
