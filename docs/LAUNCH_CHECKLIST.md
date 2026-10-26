# Launch checklist

Work top to bottom. Tick each item only after you have checked it for real.

## 1. Hosting and database

- [ ] Vercel project created, region set to `bom1` (Mumbai). Deploy from the main branch.
- [ ] Managed Postgres 16 in Mumbai. Use the **pooled** connection URL as `DATABASE_URL`.
- [ ] Daily backups and point-in-time recovery (PITR) are switched on.
- [ ] Backups verified by a **test restore** into a scratch database; the data looked right.
- [ ] Migrations applied to the production database: `DATABASE_URL=<prod> npm run db:migrate`.
- [ ] Venue seat map imported: `DATABASE_URL=<prod> npm run seed:seats -- <venue.csv> --create-tiers`.
- [ ] Tier prices set in Admin > Tiers.
- [ ] Admin user created: `npm run admin:create -- <email> admin`.
- [ ] Scanner user(s) created: `npm run admin:create -- <email> scanner`.

## 2. Event details and legal

- [ ] `src/lib/event.ts` edited with the real event name, date and venue, and redeployed.
- [ ] Privacy notice text reviewed (DPDP Act). Data retention decided; see section 8.

## 3. Environment variables (production)

- [ ] All keys from the README table are set in Vercel.
- [ ] `PAYMENT_GATEWAY` is **not** `fake` (best: unset).
- [ ] `ALLOW_TEST_MODES` is **unset**.
- [ ] `TURNSTILE_SECRET` is the real Cloudflare secret (not `test`), with the production site key in `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. The app refuses to run in production otherwise.
- [ ] `CRON_SECRET` is a long random value; `SESSION_SECRET` is 32+ random characters; `APP_URL` is the final https domain.

## 4. Razorpay

- [ ] Before going live, the whole flow was tested locally with Razorpay **test** keys (test card, or UPI `success@razorpay`).
- [ ] Live keys installed (`RAZORPAY_KEY_ID`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`).
- [ ] Payment capture set to **auto-capture**.
- [ ] Webhook created at `https://<domain>/api/webhooks/razorpay` with events `order.paid`, `payment.captured`, `payment.failed`, `refund.processed`.
- [ ] `RAZORPAY_WEBHOOK_SECRET` is the secret typed into the webhook form. It is a different value from the key secret.

## 5. Email

- [ ] Resend sending domain added; SPF and DKIM show as **verified**.
- [ ] `EMAIL_FROM` uses that domain. A test booking's email reached Gmail and an Outlook/Yahoo inbox (not spam).

## 6. Scheduled jobs

The app needs three jobs calling `GET`/`POST` on its cron URLs: `/api/cron/cleanup` every 5 minutes, `/api/cron/reconcile` every 3 minutes, `/api/cron/outbox` every minute (as in `vercel.json`).

- [ ] **Vercel Pro**: crons are listed in the project's Cron Jobs tab and show recent runs. Vercel Hobby only allows daily crons, so on Hobby this does not work.
- [ ] **Or** an external scheduler (e.g. cron-job.org) calls the three URLs with header `x-cron-secret: <CRON_SECRET>` at `*/5`, `*/3` and `* * * * *`; each returns 200.
- [ ] If hosted on a VPS instead of Vercel: the reverse proxy (e.g. Caddy) sets `X-Forwarded-For`. Rate limits trust its first hop, so a proxy that does not set it lets clients spoof their IP.

## 7. Rehearsals

- [ ] `npm test`, `npx playwright test` pass on the release commit.
- [ ] Load test on **staging**, with the per-IP limits switched off: on the staging server (not Vercel: the flags are ignored there) set `LOAD_TEST_DISABLE_RATE_LIMIT=1` and `ALLOW_TEST_MODES=1` and `TURNSTILE_SECRET=test`, restart, then `k6 run -e BASE_URL=<staging> tests/load/hold.k6.js`. Without this the limiter answers most requests with 429 and the run proves nothing; the `hold_created` threshold (more than 100 holds created) fails the run if that happens. Thresholds must pass and `tests/load/check-double-booking.sql` must return 0 rows. **Afterwards remove all three variables and restart.** Never set them on production.
- [ ] If Cloudflare's always-pass Turnstile test secret (`1x0000000000000000000000000000000AA`) was used on staging, it has been replaced by the real secret in production. The app cannot detect this one.
- [ ] **Rs 1 live payment rehearsal**, end to end: temporarily set a tier to Rs 1, book one seat on the production site with a real payment, receive the email, open the QR, scan it, then cancel it with **Cancel & refund** in Admin > Bookings (or refund it in full in Razorpay; the webhook then cancels the booking and voids its QR), check the QR now scans red, and reset the tier price. Delete or ignore the test booking.
- [ ] Gate scan test **on the venue network** with a real phone over HTTPS (camera works, green on first scan, red on second).
- [ ] The day before the event: attendee CSV exported from Admin and **printed** as a fallback for the gate.

## 8. After the event (DPDP data minimisation)

Decide N (for example 30 days) and run, on the production database, once the event is over and refunds are settled:

```sql
-- Remove personal data from bookings older than N days after the event.
UPDATE bookings
   SET name = 'Deleted', email = 'deleted@invalid', phone = '+00', client_ip = NULL
 WHERE created_at < now() - interval '30 days';

-- Razorpay webhook payloads hold payer email and phone.
UPDATE webhook_events SET payload = '{}'::jsonb WHERE received_at < now() - interval '30 days';

-- The audit log may hold guest names/emails in its details.
UPDATE audit_log SET details = NULL WHERE created_at < now() - interval '30 days';
```

Adjust the interval to the event date, and keep the amounts and seat records for accounting.
