#!/usr/bin/env node
// ============================================================
// Secret Scanner — คู่มือ L3.4J
// โหมด: working (default) | staged | history
// ============================================================
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"

const PATTERNS = [
  { name: "AWS Access Key",      re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Google API Key",      re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "GCP Service Account", re: /"type":\s*"service_account"/ },
  { name: "Stripe live",         re: /\bsk_live_[0-9A-Za-z]{20,}\b/ },
  { name: "Slack token",         re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
  { name: "GitHub token",        re: /\bgh[pousr]_[A-Za-z0-9]{36}\b/ },
  { name: "Private key",         re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: "JWT",                 re: /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "Telegram bot token",  re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/ },
  { name: "Connection string",   re: /(postgres|mysql|mongodb(\+srv)?):\/\/[^:\s]+:[^@\s]+@/ },
  { name: "Generic assignment",  re: /(api[_-]?key|secret|password|passwd|token)\s*[:=]\s*["'][^"'\s]{16,}["']/i },
]

function entropy(s) {
  const f = {}
  for (const c of s) f[c] = (f[c] || 0) + 1
  return -Object.values(f).reduce((h, n) => { const p = n / s.length; return h + p * Math.log2(p) }, 0)
}

const HIGH_ENTROPY = /["'`]([A-Za-z0-9+/=_-]{32,})["'`]/g
const ALLOWLIST = [/\.lock$/, /\.snap$/, /package-lock\.json$/, /pnpm-lock\.yaml$/, /\/fixtures?\//]

const MODE = process.argv[2] ?? "working"

function files() {
  if (MODE === "staged")
    return execSync("git diff --cached --name-only --diff-filter=ACM", { encoding: "utf8" }).split("\n").filter(Boolean)
  if (MODE === "history")
    return execSync("git rev-list --all --objects | awk '{print $2}' | sort -u", { encoding: "utf8" }).split("\n").filter(Boolean)
  return execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean)
}

const mask = (l) => l.trim().slice(0, 100).replace(/[A-Za-z0-9+/=_-]{12,}/g, (m) => m.slice(0, 4) + "***")

const findings = []
for (const file of files()) {
  if (ALLOWLIST.some((r) => r.test(file))) continue
  let content
  try { content = readFileSync(file, "utf8") } catch { continue }
  if (content.length > 2_000_000) continue

  content.split("\n").forEach((line, i) => {
    if (/#\s*secret-scan:ignore/.test(line)) return
    for (const { name, re } of PATTERNS)
      if (re.test(line)) findings.push({ file, line: i + 1, type: name, preview: mask(line) })
    for (const m of line.matchAll(HIGH_ENTROPY)) {
      const s = m[1]
      if (entropy(s) > 4.5 && !/^[A-Fa-f0-9]+$/.test(s))
        findings.push({ file, line: i + 1, type: `High entropy (${entropy(s).toFixed(2)})`, preview: mask(line) })
    }
  })
}

if (findings.length) {
  console.error(`\n❌ พบ secret ที่น่าสงสัย ${findings.length} จุด:\n`)
  for (const f of findings) console.error(`  ${f.file}:${f.line}  [${f.type}]\n    ${f.preview}`)
  console.error("\nfalse positive → ใส่ comment: # secret-scan:ignore")
  console.error("⭐ secret จริง → หมุน key ทันที การลบ commit ไม่พอ")
  process.exit(1)
}
console.log(`✅ ไม่พบ secret (โหมด ${MODE})`)
