// ============================================================
// ESLint rules ที่เป็น gate — คู่มือ L2.2, L2.15
//
// ⭐ rule พวกนี้จับ anti-pattern ได้ใน 10 วินาที
//    ถูกกว่าและเร็วกว่าให้ Codex อ่าน diff 3 นาที
//
// merge เข้า eslint.config.js ของโปรเจกต์
// ============================================================
import vitest from "@vitest/eslint-plugin"
import playwright from "eslint-plugin-playwright"

export default [
  // ── ไฟล์เทส (vitest) ──────────────────────────────────
  {
    files: ["**/*.spec.ts", "**/*.test.ts"],
    plugins: { vitest },
    rules: {
      // ⭐ เทสที่ไม่มี assertion = เทสที่ผ่านเสมอ
      "vitest/expect-expect": ["error", {
        assertFunctionNames: ["expect", "expectExactlyOneSuccess", "expectIdempotent", "checkMR"],
      }],

      // ⭐ .only หลุดเข้า main = เทสตัวอื่นไม่ได้รัน
      "vitest/no-focused-tests": "error",

      // .skip ต้องมีเหตุผล
      "vitest/no-disabled-tests": "warn",

      // ⭐ assertion ที่อ่อนเกินไป
      "vitest/no-conditional-expect": "error",
      "vitest/valid-expect": ["error", { minArgs: 1, maxArgs: 2 }],

      // ชื่อเทสต้องสื่อความหมาย
      "vitest/valid-title": ["error", { ignoreTypeOfDescribeName: true }],

      // ⭐ ห้าม assertion ที่ผ่านได้กับเกือบทุกค่า
      "no-restricted-syntax": ["error",
        {
          selector: "CallExpression[callee.property.name='toBeDefined']",
          message: "toBeDefined() อ่อนเกินไป — assert ค่าที่คาดหวังจริง (L2.2)",
        },
        {
          selector: "CallExpression[callee.property.name='toBeTruthy']",
          message: "toBeTruthy() ผ่านได้กับเกือบทุกค่า — assert ค่าที่คาดหวังจริง",
        },
        {
          selector: "MemberExpression[property.name='waitForTimeout']",
          message: "waitForTimeout ทำให้เทส flaky — ใช้ web-first assertion (L2.6)",
        },
      ],
    },
  },

  // ── E2E (playwright) ──────────────────────────────────
  {
    files: ["e2e/**/*.spec.ts"],
    plugins: { playwright },
    rules: {
      "playwright/no-wait-for-timeout": "error",
      "playwright/no-force-option": "error",
      "playwright/no-element-handle": "error",
      "playwright/no-eval": "error",
      "playwright/expect-expect": "error",
      "playwright/no-skipped-test": "warn",
      // ⭐ บังคับใช้ getByTestId แทน CSS selector ที่เปราะ
      "playwright/no-raw-locators": ["warn", {
        allowed: ["[data-test]"],
      }],
    },
  },

  // ── โค้ด production ───────────────────────────────────
  {
    files: ["**/*.ts", "**/*.vue"],
    ignores: ["**/*.spec.ts", "**/*.test.ts"],
    rules: {
      // ⭐ missing await = race condition ที่ mutation testing เจอบ่อยที่สุด
      //    (AwaitRemoval mutator รอด 18 ตัวในตัวอย่างของคู่มือ)
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "error",

      "no-restricted-syntax": ["error",
        {
          selector: "CallExpression[callee.name='eval']",
          message: "eval ไม่ควรมีในโค้ด",
        },
        {
          selector: "NewExpression[callee.name='Function']",
          message: "new Function เทียบเท่า eval",
        },
        {
          selector: "CallExpression[callee.name='parseInt'][arguments.length<2]",
          message: "parseInt('500abc') = 500 — ใช้ Number() แล้วตรวจ NaN (FA-004)",
        },
      ],

      // ⭐ ห้าม catch ที่กลืน error (L5.2)
      "no-empty": ["error", { allowEmptyCatch: false }],
    },
  },
]
