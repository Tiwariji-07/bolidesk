# BoliDesk

BoliDesk is a multi-tenant, local-first SaaS workspace for Indian service businesses. It turns a WhatsApp-style job note into a reviewed quote, invoice, payment request, and practical follow-up list. Every application request is scoped to the signed-in user's workspace membership; a workspace is never selected from browser input.

The app starts in safe demo mode: data shown in the interface is sample data, payment links resolve to a local customer portal, and no external API call is made. Set `DEMO_MODE=false` only after the production credentials below are present and pass `npm run env:check`.

## Run locally

Prerequisites: Node.js 22+, Docker Desktop, and npm.

```bash
cp .env.example .env
# Set SESSION_SECRET and DEMO_USER_PASSWORD to distinct local random values (both are required; do not commit them).
docker compose up -d db
npm ci
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the seeded demo email (`DEMO_USER_EMAIL`, which defaults to `demo@bolidesk.local`) and the private `DEMO_USER_PASSWORD` you set in `.env`. The password is intentionally never committed or printed by setup commands. You can instead create a separate workspace from `/register`. The database commands are idempotent, so `npm run db:setup` can be repeated after a schema change. `npm run db:reset` drops and recreates the local database, then reruns the seed script.

To run the full stack in containers, including migrations and demo data:

```bash
docker compose up --build
```

The application is available at [http://localhost:3000](http://localhost:3000). Stop containers with `docker compose down`; add `-v` only when you intentionally want to remove local Postgres data.

## Database commands

| Command | Purpose |
| --- | --- |
| `npm run db:generate` | Generate the Prisma client after schema changes. |
| `npm run db:validate` | Validate the Prisma schema. |
| `npm run db:migrate` | Create and apply a development migration. |
| `npm run db:deploy` | Apply committed migrations, suitable for CI and containers. |
| `npm run db:seed` | Upsert the CoolCare demo workspace. |
| `npm run db:setup` | Generate, migrate, and seed in one step. |
| `npm run db:reset` | Reset the local database and seed it again. |

## Verification

```bash
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser smoke test starts the development server, visits every app route, parses the sample job note, and creates a simulated payment request.

## Environment

Copy `.env.example` to `.env`. `DATABASE_URL` is required by Prisma and points at the Postgres service on your machine.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Always | PostgreSQL connection string. |
| `SESSION_SECRET` | Always | Random 32+ character server secret used to sign httpOnly sessions. |
| `DEMO_USER_EMAIL` | Demo seed | Seed account email (defaults to `demo@bolidesk.local`). |
| `DEMO_USER_PASSWORD` | Demo seed | Private 12+ character password used only to bcrypt-hash the seed account. Never commit or print it. |
| `DEMO_MODE` | Always | Keep `true` to force non-network demo providers; set `false` for live adapters. |
| `APP_URL` | Live mode | Public HTTPS application origin, used for customer portal callback URLs. |
| `AI_PROVIDER` | Live mode | Must be `openai`. |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Live mode / optional | OpenAI API credential and structured-parser model (`gpt-4.1-mini` default). |
| `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | Live mode | WhatsApp Cloud API credential and sending phone-number ID. |
| `WHATSAPP_API_VERSION` | Optional | Graph API version (`v22.0` default). |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | WhatsApp inbound webhook | Secret chosen by you for Meta's verification handshake. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Live mode | Razorpay API credentials for payment-link creation. |
| `RAZORPAY_WEBHOOK_SECRET` | Live mode | Razorpay webhook secret used to verify the raw request HMAC. |

`npm run env:check` reports missing configuration by variable name only; it never prints secret values. The provider factory falls back to demo adapters if a credential is absent, preventing accidental external calls. Production deployment should still fail its release check when `env:check` reports issues.

## Integrations and webhooks

OpenAI parsing uses the Chat Completions structured JSON schema endpoint. WhatsApp deliveries are available through `POST /api/deliveries/whatsapp` with a scoped `invoiceId` and either `text` or `{ template: { name, languageCode, components? } }`. Every outcome, including failures, is persisted in `DeliveryLog`; API keys and message body secrets are not added to activity logs.

Configure Razorpay to send `payment_link.paid` to:

```text
https://YOUR_APP_URL/api/webhooks/razorpay
```

The handler reads the unmodified body, verifies `x-razorpay-signature` against `RAZORPAY_WEBHOOK_SECRET`, finds the stored Razorpay payment-link ID, and marks only that request's workspace-scoped invoice paid. Duplicate Razorpay deliveries are safe: the invoice transition is idempotent and does not create a second paid activity.

For WhatsApp Cloud API, configure the callback URL as `https://YOUR_APP_URL/api/webhooks/whatsapp` and enter the same `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in Meta. The route implements Meta's `hub.challenge` verification and acknowledges delivery/status callbacks; inbound customer conversation handling is deliberately out of scope.

Each payment request creates a 256-bit opaque customer-portal token. Only its SHA-256 hash is stored, and it expires after 30 days. Customers use `https://YOUR_APP_URL/p/<token>` to view their invoice or quote and follow the payment link; the portal has no workspace session and never accepts an invoice ID as authority.

For deployment, set `DATABASE_URL`, all live variables above, and `APP_URL` to the externally reachable HTTPS origin. Run `npm run db:deploy`, then `npm run db:seed` only if demo data is desired. The provided Compose file intentionally stays in demo mode; a production service should inject secrets through its host's secret manager, run migrations once before application replicas start, and expose only the app and verified webhook URL.
