// Load test for seat holds: 200 virtual users for 2 minutes, each looping
//   GET /api/seats  ->  POST /api/holds on a random available seat.
//
// Run against STAGING only (it creates real holds and real Razorpay orders):
//   k6 run -e BASE_URL=https://staging.example.com tests/load/hold.k6.js
// Afterwards run tests/load/check-double-booking.sql against the staging database: it must return 0 rows.
//
// Turnstile: staging needs a secret that accepts a known token.
//   - TURNSTILE_SECRET=test (local `next dev`, or a VPS with ALLOW_TEST_MODES=1) accepts "test-pass" (the default here).
//   - On Vercel the production guard forbids "test", so use Cloudflare's always-pass test secret
//     1x0000000000000000000000000000000AA and run with -e TURNSTILE_TOKEN=XXXX.DUMMY.TOKEN.XXXX
//
// Rate limit: /api/holds allows 10 requests per IP per 10 minutes, and a guest IP may hold one booking at a time.
// A load run from one machine would just measure the limiter, so for the run set on STAGING ONLY:
//   LOAD_TEST_DISABLE_RATE_LIMIT=1 and ALLOW_TEST_MODES=1   (remove both afterwards)
// The app refuses these in production and ignores them on Vercel, so use a staging server that is not on Vercel
// (VPS, or a local `next start`). The hold_created threshold fails the run if too few holds were really created.
// 200/201/409/429 all count as correct responses; anything else is a failure.
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const TURNSTILE_TOKEN = __ENV.TURNSTILE_TOKEN || "test-pass";

http.setResponseCallback(http.expectedStatuses(200, 201, 409, 429));

const holdCreated = new Counter("hold_created");
const holdConflict = new Counter("hold_conflict");
const holdLimited = new Counter("hold_rate_limited");

export const options = {
  scenarios: {
    holds: { executor: "constant-vus", vus: 200, duration: "2m" },
  },
  thresholds: {
    http_req_duration: ["p(95)<500"],
    checks: ["rate>0.99"],
    // Without this the run could pass while every hold was rate-limited (429) and nothing was tested.
    hold_created: ["count>100"],
  },
};

const JSON_HEADERS = { "Content-Type": "application/json" };

function randomIp() {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  return `${octet()}.${octet()}.${octet()}.${octet()}`;
}

export default function holdScenario() {
  const seatsRes = http.get(`${BASE_URL}/api/seats`, { tags: { name: "GET /api/seats" } });
  const ok = check(seatsRes, { "seats 200": (r) => r.status === 200 });
  if (!ok) return;

  const available = seatsRes.json("seats").filter((s) => s.status === "available");
  if (available.length === 0) return;
  const seat = available[Math.floor(Math.random() * available.length)];

  // Unique guest per request: a guest may only have one active hold.
  const id = `${__VU}-${__ITER}-${Date.now()}`;
  const phone = `+91${6 + Math.floor(Math.random() * 4)}${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
  const res = http.post(
    `${BASE_URL}/api/holds`,
    JSON.stringify({
      seatIds: [seat.id],
      name: `Load Test ${id}`,
      email: `load-${id}@example.com`,
      phone,
      turnstileToken: TURNSTILE_TOKEN,
    }),
    { headers: { ...JSON_HEADERS, "X-Forwarded-For": randomIp() }, tags: { name: "POST /api/holds" } },
  );

  check(res, { "hold 201, 409 or 429": (r) => r.status === 201 || r.status === 409 || r.status === 429 });
  if (res.status === 201) holdCreated.add(1);
  else if (res.status === 409) holdConflict.add(1);
  else if (res.status === 429) holdLimited.add(1);
}
