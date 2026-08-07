#!/usr/bin/env node
// ============================================================
// Bundle Budget + Ratchet — คู่มือ L3.3
// ============================================================
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, extname } from "node:path"
import { brotliCompressSync, constants } from "node:zlib"

const DIST = process.env.DIST_DIR ?? ".output/public"
const BASELINE = "perf/analyze/baseline/bundle.json"
const GROWTH_LIMIT = Number(process.env.BUNDLE_GROWTH_LIMIT ?? 0.05)

// ADAPT: ตัวเลขต้องมาจาก baseline จริง ไม่ใช่ตั้งลอยๆ
const BUDGET = {
  totalJsBr: Number(process.env.BUDGET_JS ?? 400 * 1024),
  totalCssBr: Number(process.env.BUDGET_CSS ?? 60 * 1024),
  largestChunkBr: Number(process.env.BUDGET_CHUNK ?? 150 * 1024),
  fontsTotal: Number(process.env.BUDGET_FONTS ?? 350 * 1024),  // ⭐ ฟอนต์ไทยกินเยอะ
}

const FORBIDDEN = [
  { name: "moment ทั้งก้อน", re: /moment\.js|__moment__/ },
  { name: "lodash ทั้งก้อน", re: /_\.VERSION\s*=\s*["']4/ },
  { name: "source map ref", re: /\/\/# sourceMappingURL=.*\.map/ },
  { name: "Google API key", re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: "Stripe live key", re: /sk_live_[0-9A-Za-z]{20,}/ },
  { name: "PEM private key", re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
  { name: "internal URL", re: /https?:\/\/[a-z0-9-]+\.internal\b/ },
]

const walk = (d, out = []) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    statSync(p).isDirectory() ? walk(p, out) : out.push(p)
  }
  return out
}
const br = (b) => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
const kb = (n) => `${(n / 1024).toFixed(1)}KB`

if (!existsSync(DIST)) {
  console.error(`❌ ไม่พบ ${DIST} — build ยังไม่ได้รัน (fail-closed)`)
  process.exit(1)
}

const r = { js: 0, css: 0, fonts: 0, images: 0, chunks: [], violations: [] }

for (const f of walk(DIST)) {
  const buf = readFileSync(f)
  const ext = extname(f)
  const rel = f.replace(DIST, "")

  if (ext === ".js" || ext === ".mjs") {
    const size = br(buf)
    r.js += size
    r.chunks.push({ file: rel, br: size })
    const text = buf.toString("utf8")
    for (const { name, re } of FORBIDDEN)
      if (re.test(text)) r.violations.push(`${name} พบใน ${rel}`)
  } else if (ext === ".css") r.css += br(buf)
  else if ([".woff2", ".woff", ".ttf"].includes(ext)) r.fonts += buf.length
  else if ([".png", ".jpg", ".webp", ".avif", ".svg"].includes(ext)) r.images += buf.length

  if (ext === ".map") r.violations.push(`⭐ SOURCE MAP หลุด: ${rel}`)
}

r.chunks.sort((a, b) => b.br - a.br)
const largest = r.chunks[0]
const fails = []

if (r.js > BUDGET.totalJsBr) fails.push(`JS ${kb(r.js)} > ${kb(BUDGET.totalJsBr)}`)
if (r.css > BUDGET.totalCssBr) fails.push(`CSS ${kb(r.css)} > ${kb(BUDGET.totalCssBr)}`)
if (r.fonts > BUDGET.fontsTotal) fails.push(`FONTS ${kb(r.fonts)} > ${kb(BUDGET.fontsTotal)}`)
if (largest && largest.br > BUDGET.largestChunkBr)
  fails.push(`chunk ใหญ่สุด ${largest.file} = ${kb(largest.br)}`)

// ── ratchet ──
if (existsSync(BASELINE)) {
  const base = JSON.parse(readFileSync(BASELINE, "utf8"))
  for (const k of ["js", "css", "fonts"]) {
    if (!base[k]) continue
    const growth = (r[k] - base[k]) / base[k]
    if (growth > GROWTH_LIMIT)
      fails.push(`⭐ ${k.toUpperCase()} โต ${(growth * 100).toFixed(1)}% (${kb(base[k])} → ${kb(r[k])})`)
  }
}

console.log("\n=== Bundle (brotli) ===")
console.log(`JS ${kb(r.js)} · CSS ${kb(r.css)} · Fonts ${kb(r.fonts)} · Images ${kb(r.images)}`)
console.log("\nTop 5 chunks:")
r.chunks.slice(0, 5).forEach((c) => console.log(`  ${kb(c.br).padStart(9)}  ${c.file}`))

if (r.violations.length) { console.error("\n❌ Violations:"); r.violations.forEach(v => console.error(`   ${v}`)) }
if (fails.length) { console.error("\n❌ Budget:"); fails.forEach(f => console.error(`   ${f}`)) }

if (process.env.UPDATE_BASELINE === "1") {
  writeFileSync(BASELINE, JSON.stringify({ js: r.js, css: r.css, fonts: r.fonts }, null, 2))
  console.log("\n✅ อัปเดต baseline แล้ว")
}

process.exit(fails.length + r.violations.length > 0 ? 1 : 0)
