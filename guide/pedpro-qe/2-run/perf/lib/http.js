import http from "k6/http"
import exec from "k6/execution"
import { Trend, Rate, Counter, Gauge } from "k6/metrics"

export const ENV = {
  baseUrl: __ENV.BASE_URL || "http://localhost:3000",
  internalToken: __ENV.INTERNAL_TOKEN || "",
  warmupSeconds: Number(__ENV.WARMUP_SECONDS || 60),
  runId: __ENV.RUN_ID || `perf-${Date.now()}`,
}

if (!ENV.internalToken) throw new Error("INTERNAL_TOKEN ไม่ได้ตั้ง — fail-closed")

export const M = {
  businessError:  new Rate("biz_error_rate"),
  ledgerMismatch: new Counter("biz_ledger_mismatch"),
  auditMissing:   new Counter("biz_audit_missing"),
  coldStart:      new Rate("infra_cold_start"),
  payloadBytes:   new Trend("infra_response_bytes"),
  concurrency:    new Gauge("infra_concurrency_estimate"),
}

// ⭐ currentTestRunDuration นับจากจุดเริ่มของ "การทดสอบ" ไม่ใช่จุดเริ่มของ VU
//    ถ้าใช้ Date.now() ที่ module scope จะผิด เพราะ k6 รัน init ต่อ VU
//    -> VU ที่เกิดตอน spike จะ tag ตัวเองเป็น warmup ทั้งที่คือช่วงที่แย่ที่สุด
function phase() {
  return exec.instance.currentTestRunDuration / 1000 < ENV.warmupSeconds ? "warmup" : "steady"
}

const safeJson = (res) => { try { return res.json() } catch { return null } }

// สแตกนี้คืน HTTP 200 พร้อม { Result: 0 } เสมอ
// ⭐ ถ้าไม่แยก k6 จะรายงานสำเร็จ 100% ทั้งที่ล้มเหลวทางธุรกิจทุก request
const isBusinessOk = (b) => b != null && b.Result === 1

export function apiRequest(method, path, payload, opts = {}) {
  const endpoint = opts.endpoint || "unknown"
  const tags = { endpoint, phase: phase(), ...(opts.tags || {}) }

  const params = {
    headers: {
      "Content-Type": "application/json",
      "X-Run-Id": ENV.runId,
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers || {}),
    },
    tags,
    timeout: opts.timeout || "30s",
  }

  const url = `${ENV.baseUrl}${path}`
  const res = payload === undefined
    ? http.request(method, url, null, params)
    : http.request(method, url, JSON.stringify(payload), params)

  const body = safeJson(res)
  M.businessError.add(!isBusinessOk(body), { endpoint })
  M.payloadBytes.add(res.body ? res.body.length : 0, { endpoint })

  const age = res.headers["X-Instance-Age-Ms"]
  if (age !== undefined) M.coldStart.add(Number(age) < 5000, { endpoint })

  return { res, body, ok: isBusinessOk(body), tags }
}

export const apiGet  = (p, o) => apiRequest("GET", p, undefined, o)
export const apiPost = (p, b, o) => apiRequest("POST", p, b, o)

// think time สมจริง — exponential distribution
export const thinkTime = (mean = 3) => -Math.log(1 - Math.random()) * mean
