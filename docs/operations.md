# Running BoliDesk for a shop

This guide covers one shop on one small server. Two vCPUs and 2 GB of RAM are enough for a team of five.

## 1. Server

Any Linux VM with Docker works, in an Indian region if possible. The app needs a public HTTPS address for customer links and for the Razorpay and WhatsApp webhooks. Put a reverse proxy with automatic certificates (Caddy, or the provider's load balancer) in front of port 3000.

```caddy
billing.yourshop.in {
  reverse_proxy 127.0.0.1:3000
}
```

Keep Postgres off the public internet. The compose file binds it and the app to `127.0.0.1`.

## 2. Configuration

Create `.env` next to `docker-compose.yml`. Generate secrets with `openssl rand -hex 32`.

```env
SESSION_SECRET=<64 hex characters>
DEMO_MODE=false
SEED_DEMO=false
ALLOW_REGISTRATION=false
APP_URL=https://billing.yourshop.in
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_APP_SECRET=...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<any random string>
AI_PROVIDER=openai
OPENAI_API_KEY=...
```

Also add `SEED_DEMO=false` so the migration step does not create the demo shop. The compose file reads `.env` for the app and for its own settings, so nothing in it needs editing. Then run `docker compose up -d --build`. The app refuses to start while a required setting is missing; `docker compose logs app` names the variable.

Create the owner account once, with `ALLOW_REGISTRATION=true` for a few minutes, at `/register`; then set it back to `false` and restart. Everyone else joins by invite from **Settings → Team**.

## 3. Business details

The owner fills **Settings** before issuing the first invoice:

- Legal name, address and state exactly as on the GST registration.
- GST registration type. **Registered (regular)** charges GST. **Composition** and **Not registered** issue a bill of supply with no GST.
- GSTIN. BoliDesk checks its checksum and that it starts with your state code.
- Rate profile and default rate. Since 22 September 2025 most supplies are 5% or 18%. Confirm the SAC/HSN codes and rates for your services with your accountant.
- Document prefix (1–3 letters). It is fixed once the first numbered document exists, so every series stays consecutive.
- UPI ID, printed on invoices for direct payment.

## 4. Razorpay

1. In the Razorpay dashboard, create API keys (live mode once KYC is done).
2. Add a webhook to `https://billing.yourshop.in/api/webhooks/razorpay` with a secret, and subscribe to `payment_link.paid`, `payment_link.partially_paid`, `payment_link.cancelled` and `payment_link.expired`.
3. Put the key ID, key secret and webhook secret in `.env`.

Each payment link asks for the invoice's current balance and expires with the customer link after 30 days. If the balance changes (cash received, credit note), BoliDesk cancels the old link and records any payment already made on it. If Razorpay is down during that, the invoice shows **Retry closing the old link**.

## 5. WhatsApp

"Open in WhatsApp" works without any setup: it opens the customer's chat on the staff member's phone with the message filled in.

To send from the shop's business number automatically:

1. Set up the WhatsApp Cloud API in Meta Business Manager and note the phone number ID and a permanent access token.
2. Create two message templates in the **Utility** category, language English (`en`). Each body takes five parameters: `{{1}}` customer name, `{{2}}` shop name, `{{3}}` invoice number, `{{4}}` amount, `{{5}}` link.
   - `invoice_ready`: "Namaste {{1}}, your invoice {{3}} from {{2}} for {{4}} is ready: {{5}}"
   - `payment_reminder`: "Namaste {{1}}, a reminder from {{2}}: {{4}} is due on invoice {{3}}. View and pay: {{5}}"
3. Subscribe the app's webhook to `https://billing.yourshop.in/api/webhooks/whatsapp` with your verify token, and copy the app secret into `WHATSAPP_APP_SECRET`. Delivery statuses (delivered, read, failed) then appear on each invoice.

## 6. Backups

Run a nightly backup and copy it off the server.

```bash
# crontab -e, as the user that runs docker
30 1 * * * cd /srv/bolidesk && docker compose --profile ops run --rm backup >> backups/backup.log 2>&1
```

`scripts/backup.sh` keeps 14 daily and 12 monthly dumps in `./backups` (or `BACKUP_HOST_DIR`). Sync that folder to another place every night, for example with `rclone` to Google Drive or an S3 bucket.

Once a month, prove a backup restores:

```bash
docker run --rm --network host -v "$PWD/scripts:/scripts:ro" -v "$PWD/backups:/backups" \
  -e SCRATCH_DATABASE_URL=postgresql://bolidesk:bolidesk@127.0.0.1:5433/bolidesk_restore_check \
  postgres:16-alpine bash /scripts/restore-check.sh /backups/daily/<latest>.dump
```

It restores into a scratch database, prints row counts and checks that every paid invoice is covered by its payments.

## 7. Monitoring

Point an uptime monitor (UptimeRobot, Better Stack) at `https://billing.yourshop.in/api/health`. It answers `{"ok":true}` only when the app can reach Postgres. The container health check uses the same endpoint.

## 8. Upgrading

```bash
git pull
docker compose up -d --build   # the migrate service applies new migrations before the app starts
```

Take a backup first. Migrations convert data in place and do not drop columns that still hold data.

## Go-live checklist

- [ ] HTTPS works and `/api/health` answers `ok`.
- [ ] `ALLOW_REGISTRATION=false`; the owner exists; staff joined by invite with the right roles.
- [ ] Settings complete; a test invoice shows the correct GSTIN, state, SAC and tax split. Cancel it with a credit note afterwards.
- [ ] A ₹1 Razorpay link paid from a phone appears as a receipt within a minute.
- [ ] A WhatsApp test message to the owner's own number shows "delivered".
- [ ] Nightly backup runs and is copied off the server; one restore check passed.
- [ ] For the first two weeks, compare the day book with the cash drawer and bank statement every evening, alongside the old way of billing.
