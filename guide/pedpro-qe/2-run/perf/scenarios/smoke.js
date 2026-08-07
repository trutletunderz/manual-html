// Smoke — รันทุก deploy · 1 นาที
import { check } from "k6"
import { apiGet } from "../lib/http.js"
import { handleSummary as hs } from "../lib/summary.js"

export const options = {
  vus: 3,
  duration: "60s",
  thresholds: {
    "http_req_failed": ["rate<0.01"],
    "biz_error_rate": ["rate<0.05"],
    "http_req_duration": ["p(95)<2000"],
  },
}

export default function () {
  const health = apiGet("/api/health", { endpoint: "health" })
  check(health, { "health 200": (r) => r.res.status === 200 })

  const home = apiGet("/", { endpoint: "home" })
  check(home, { "home 200": (r) => r.res.status === 200 })
}

export const handleSummary = hs
