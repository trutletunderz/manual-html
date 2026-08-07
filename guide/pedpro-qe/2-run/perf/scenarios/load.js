// Load — nightly · open model (คู่มือ L3.2.3)
//
// ⭐ ใช้ constant-arrival-rate ไม่ใช่ constant-vus
//    ผู้ใช้จริงคือ open model — คนกดปุ่มเพราะอยากใช้
//    ไม่ใช่เพราะ request ก่อนหน้าเสร็จแล้ว
import { buildThresholds } from "../config/slo.js"
import { ENV, apiGet, apiPost, thinkTime } from "../lib/http.js"
import { handleSummary as hs } from "../lib/summary.js"
import { sleep, check } from "k6"

const D = `${ENV.warmupSeconds + 600}s`

// ⭐ สัดส่วนต้องมาจาก analytics จริง ไม่ใช่เดา (validity ข้อ 8)
export const options = {
  scenarios: {
    browse:   { executor: "constant-arrival-rate", rate: 200, timeUnit: "1s",
                duration: D, preAllocatedVUs: 300, maxVUs: 1500, exec: "browse" },
    deposit:  { executor: "constant-arrival-rate", rate: 20,  timeUnit: "1s",
                duration: D, preAllocatedVUs: 100, maxVUs: 500,  exec: "deposit" },
    withdraw: { executor: "constant-arrival-rate", rate: 5,   timeUnit: "1s",
                duration: D, preAllocatedVUs: 40,  maxVUs: 200,  exec: "withdraw" },
  },
  thresholds: buildThresholds(["deposit", "withdraw", "history"]),
  summaryTrendStats: ["avg","min","med","p(90)","p(95)","p(99)","max","count"],
}

export function browse() {
  apiGet("/api/games", { endpoint: "history" })
  sleep(thinkTime(4))
}

export function deposit() {
  const r = apiPost("/api/deposit", { amount: 500, DoAdmin: 0, DoIp: "10.0.0.1" },
    { endpoint: "deposit", token: __ENV.TEST_TOKEN })
  check(r, { "deposit ok": (x) => x.ok })
  sleep(thinkTime(3))
}

export function withdraw() {
  const r = apiPost("/api/withdraw", { amount: 100, DoAdmin: 0, DoIp: "10.0.0.1" },
    { endpoint: "withdraw", token: __ENV.TEST_TOKEN })
  check(r, { "withdraw handled": (x) => x.res.status < 500 })
  sleep(thinkTime(5))
}

export const handleSummary = hs
