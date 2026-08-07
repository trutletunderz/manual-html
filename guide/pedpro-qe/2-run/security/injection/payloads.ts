// ============================================================
// Injection payloads — คู่มือ L3.4E
//
// ⭐ ทุก payload ตั้ง window.__pwned = 1 เพื่อให้ตรวจได้ว่า execute จริงมั้ย
//    (แทนที่จะดูว่ามี <script> ใน HTML ซึ่งอาจเป็นข้อความธรรมดา)
// ============================================================

export const XSS_PAYLOADS: readonly string[] = [
  // ── classic ──
  `<script>window.__pwned=1</script>`,
  `<img src=x onerror="window.__pwned=1">`,
  `<svg onload="window.__pwned=1">`,
  `<iframe srcdoc="<script>parent.__pwned=1</script>">`,

  // ── attribute breakout ──
  `"><script>window.__pwned=1</script>`,
  `'><img src=x onerror=window.__pwned=1>`,
  `" onmouseover="window.__pwned=1`,

  // ── event handler ที่คนลืม ──
  `<body onload=window.__pwned=1>`,
  `<details open ontoggle=window.__pwned=1>`,
  `<input autofocus onfocus=window.__pwned=1>`,
  `<marquee onstart=window.__pwned=1>`,
  `<video><source onerror=window.__pwned=1>`,

  // ── mXSS / mutation ──
  `<noscript><p title="</noscript><img src=x onerror=window.__pwned=1>">`,
  `<svg></p><style><a id="</style><img src=x onerror=window.__pwned=1>">`,

  // ── template injection (Vue) ──
  `{{constructor.constructor('window.__pwned=1')()}}`,
  `{{$el.ownerDocument.defaultView.__pwned=1}}`,

  // ── encoding tricks ──
  `<img src=x onerror=&#119;indow.__pwned=1>`,
  `<a href="javas&#99;ript:window.__pwned=1">x</a>`,
] as const

export const URL_PAYLOADS: readonly string[] = [
  `javascript:window.__pwned=1`,
  `JaVaScRiPt:window.__pwned=1`,
  `data:text/html,<script>window.__pwned=1</script>`,
  `vbscript:msgbox(1)`,
  `  javascript:window.__pwned=1`,        // นำหน้าด้วยช่องว่าง
  `java\tscript:window.__pwned=1`,        // แทรก tab
  `java\nscript:window.__pwned=1`,        // แทรก newline
  `\u0001javascript:window.__pwned=1`,    // control char
] as const

export const OPEN_REDIRECT_PAYLOADS: readonly string[] = [
  `//evil.example.com`,
  `https://evil.example.com`,
  `/\\evil.example.com`,
  `\\/\\/evil.example.com`,
  // ⭐ prefix ที่ดูเหมือนโดเมนเรา
  `https://pedpro.example.evil.com`,
  // ⭐ userinfo trick — ทุกอย่างก่อน @ คือ username
  `https://pedpro.example@evil.com`,
  `https://evil.com#pedpro.example`,
  `https://evil.com?next=pedpro.example`,
] as const

export const SQL_PAYLOADS: readonly string[] = [
  `' OR '1'='1`,
  `'; DROP TABLE users;--`,
  `1' UNION SELECT NULL,NULL,NULL--`,
  `admin'--`,
  `' OR 1=1 LIMIT 1--`,
  // ⭐ blind time-based — ถ้า response ช้าผิดปกติ = SQL injection
  `'; SELECT pg_sleep(5)--`,
] as const

export const PATH_TRAVERSAL_PAYLOADS: readonly string[] = [
  `../../etc/passwd`,
  `..\\..\\windows\\system32\\config\\sam`,
  `%2e%2e%2f%2e%2e%2fetc%2fpasswd`,
  `....//....//etc/passwd`,
  `/var/secrets/.env`,
] as const

/** payload ที่ควรถูกจัดการอย่างสงบ ไม่ทำให้ระบบพัง */
export const WEIRD_INPUT_PAYLOADS: readonly string[] = [
  ``,                                     // ว่าง
  ` `,                                    // space เดียว
  `\u0000`,                               // null byte
  `\u200B`,                               // zero-width space
  `\uFEFF`,                               // BOM
  `${"a".repeat(10_000)}`,                // ยาวมาก
  `\r\nSet-Cookie: admin=1`,              // header injection
  `%00`,                                  // encoded null
  `🎮🎰💰`,                                // emoji ล้วน
  `๑๒๓`,                                  // เลขไทย
  `กิิิ๊๊๊๋๋๋`,                             // สระซ้อน
] as const

/** รวมทุกกลุ่มไว้สำหรับ fuzz */
export const ALL_PAYLOADS = [
  ...XSS_PAYLOADS,
  ...URL_PAYLOADS,
  ...SQL_PAYLOADS,
  ...PATH_TRAVERSAL_PAYLOADS,
  ...WEIRD_INPUT_PAYLOADS,
] as const

/** ตรวจว่า response หลุด internal detail มั้ย */
export const LEAK_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "stack trace", re: /at\s+\w+\s+\([^)]*\.(ts|js):\d+/ },
  { name: "SQL query", re: /(SELECT|INSERT|UPDATE|DELETE)\s+.*\s+FROM\s+/i },
  { name: "file path", re: /\/(home|usr|var|opt|root)\/[a-z]/ },
  { name: "internal hostname", re: /https?:\/\/[a-z0-9-]+\.(internal|local|svc)\b/ },
  { name: "env var name", re: /\b(DATABASE_URL|SECRET|PRIVATE_KEY|TOKEN)\s*[:=]/ },
  { name: "node_modules path", re: /node_modules\/[@a-z]/ },
] as const
