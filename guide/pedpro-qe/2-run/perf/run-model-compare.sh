#!/usr/bin/env bash
# วัด coordinated omission — คู่มือ L3.2.9
set -euo pipefail
echo "=== 1/2 OPEN model ==="
MODE=open RATE=${RATE:-50} k6 run perf/scenarios/load.js
mv reports/k6-summary.json reports/open.json
echo "=== 2/2 CLOSED model ==="
MODE=closed VUS=${VUS:-50} k6 run perf/scenarios/load.js
mv reports/k6-summary.json reports/closed.json
node perf/analyze/compare-models.mjs
