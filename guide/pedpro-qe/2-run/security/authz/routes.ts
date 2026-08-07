// ============================================================
// Route enumeration — คู่มือ L3.4B
//
// ⭐ บทเรียนที่ฝังอยู่ในไฟล์นี้ (การแก้ H-17):
//
//   บั๊ก 1 — index route ที่ราก
//     server/api/users/index.get.ts -> "users/index" -> /\/index$/ -> "users"  ✓
//     server/api/index.get.ts       -> "index"       -> ไม่ match  -> "index"  ✗
//     แก้ด้วย /(^|\/)index$/
//
//   บั๊ก 2 — catch-all [...slug] ให้ผลไม่ตรงรูปแบบใน matrix
//
//   Blind spot ที่สำคัญกว่าบั๊ก —
//     การ enumerate จาก filesystem เห็นแค่ route ที่เป็นไฟล์
//     ไม่เห็น route ที่ลงทะเบียนแบบ dynamic / catch-all handler / middleware
//     -> endpoint ที่ไม่ใช่ไฟล์จะหลุดจาก completeness gate
//     -> ต้องเทียบกับ runtime route table
// ============================================================

import { globSync } from "glob"

// ADAPT: root ของ API route ตามโครงสร้างจริง
const DEFAULT_ROOT = "server/api"

export type RouteId = string   // "POST /api/deposit"

/**
 * enumerate จาก filesystem (Nuxt/Nitro convention)
 *   server/api/deposit.post.ts            -> POST /api/deposit
 *   server/api/users/[id].get.ts          -> GET /api/users/:id
 *   server/api/users/index.get.ts         -> GET /api/users
 *   server/api/index.get.ts               -> GET /api
 *   server/api/files/[...path].get.ts     -> GET /api/files/*
 */
export function enumerateApiRoutes(root = DEFAULT_ROOT): RouteId[] {
  return globSync(`${root}/**/*.{get,post,put,patch,delete}.ts`)
    .map((file) => {
      const rel = file.replace(new RegExp(`^${root}/`), "").replace(/\.ts$/, "")
      const idx = rel.lastIndexOf(".")
      const method = rel.slice(idx + 1).toUpperCase()

      let path = rel
        .slice(0, idx)
        .replace(/\[\.\.\.(\w+)\]/g, "*")     // catch-all
        .replace(/\[(\w+)\]/g, ":$1")         // dynamic segment

      // ⭐ ครอบทั้ง "index" ที่ราก และ "xxx/index"
      path = path.replace(/(^|\/)index$/, "")

      return `${method} /api${path ? "/" + path : ""}`
    })
    .sort()
}

/**
 * ⭐ ถาม server ว่ามี route อะไรบ้างจริงๆ
 *
 * ต้องเพิ่ม endpoint นี้ในโปรเจกต์ (เปิดเฉพาะ dev/staging):
 *
 *   // server/api/internal/_routes.get.ts
 *   export default defineEventHandler((event) => {
 *     requireInternalToken(event)
 *     return useNitroApp().router.routes.map(r => ({
 *       method: r.method ?? "GET", path: r.path
 *     }))
 *   })
 */
export async function enumerateRuntimeRoutes(opts: {
  baseUrl: string
  token: string
}): Promise<RouteId[]> {
  const res = await fetch(`${opts.baseUrl}/api/internal/_routes`, {
    headers: { "X-Internal-Token": opts.token },
  })

  if (!res.ok) {
    // ⭐ fail-closed: ดึง route table ไม่ได้ = ตรวจไม่ได้ = ไม่ผ่าน
    throw new Error(
      `ดึง runtime route table ไม่ได้ (HTTP ${res.status}) — ` +
      `completeness gate ตรวจไม่ครบ`
    )
  }

  const routes: { method: string; path: string }[] = await res.json()
  return routes
    .map((r) => `${r.method.toUpperCase()} ${r.path}`)
    .sort()
}

/** route ที่ไม่ต้องมี authz spec พร้อมเหตุผล (fail-closed: ต้องประกาศ) */
export const ROUTE_EXEMPT: Record<RouteId, string> = {
  // ADAPT: เติมตามจริง — ทุกตัวต้องมีเหตุผล
  "GET /api/health": "health check ไม่มีข้อมูล",
  "GET /api/internal/_routes": "internal เท่านั้น ป้องกันด้วย token",
}

/** เปรียบเทียบ fs กับ runtime -> route ที่หลุดจาก gate */
export function findHiddenRoutes(fromFs: RouteId[], fromRuntime: RouteId[]): RouteId[] {
  const fsSet = new Set(fromFs)
  return fromRuntime.filter(
    (r) =>
      !fsSet.has(r) &&
      !ROUTE_EXEMPT[r] &&
      !r.startsWith("GET /_nuxt") &&          // asset
      !r.includes("**")                        // catch-all ของ framework เอง
  )
}
