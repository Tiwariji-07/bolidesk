# BoliDesk

BoliDesk is the billing desk for one Indian service shop with a small team (an owner, an office person and a few technicians). It turns a WhatsApp-style job note into an editable quote, a GST invoice, a payment link and a follow-up when the customer is late.

Each shop is a workspace. Staff join it by invite and every page and action is limited to their role and their workspace.

## What it does

- **Jobs.** Type or paste a job note ("Ravi, 2 AC services at Rs 650, gas refill ₹2,500, GST 18%"). BoliDesk reads every item into draft lines. The office assigns the job to a technician and sets the visit time in IST.
- **Quotes.** The draft is edited by a person before anything goes out. "Mark sent" numbers the quote and freezes its prices; accepting it creates a draft invoice.
- **GST invoices.** Issuing an invoice recalculates it on the server, splits CGST and SGST (same state) or IGST (other state) per line, prints SAC/HSN codes and the place of supply, and freezes the seller's and buyer's details. Unregistered and composition shops get a bill of supply with no GST. Numbers follow GST Rule 46: one series per financial year, at most 16 characters, for example `BDI-2627-000001`.
- **Payments.** Cash, UPI, card and bank receipts, part payments and Razorpay payment links. Every payment is a ledger row with its own receipt number; the invoice's paid status is derived from the ledger. Only the owner can reverse a receipt or record a refund.
- **Credit notes.** An issued invoice is never edited. The owner cancels it with a numbered credit note that reverses its exact tax.
- **WhatsApp.** "Open in WhatsApp" opens the customer's chat with a private invoice link filled in. With the WhatsApp Cloud API configured, invoices and reminders are sent as approved templates and their delivery status is tracked.
- **Follow-ups.** An overdue invoice gets a reminder at 9:00 IST the day after it fell due. A payment closes it.
- **Day book.** Money collected per day by method, invoices and credit notes issued with tax totals, money owed by days late, and a monthly sales register CSV in GSTR-1 column order.

## Roles

| | Owner | Office | Technician |
|---|:-:|:-:|:-:|
| Customers, jobs, draft quotes, cash payments | ✓ | ✓ | ✓ |
| Assign jobs, send quotes, issue invoices, payment links, UPI/card/bank receipts, WhatsApp | ✓ | ✓ | |
| Day book and payment history | ✓ | ✓ | |
| Reverse receipts, refunds, credit notes, business settings, team | ✓ | | |

Technicians can mark their own visits done and take cash on a draft invoice (it is issued first).

## Run it locally

You need Node.js 22+, Docker and npm.

```bash
cp .env.example .env
# Set SESSION_SECRET (32+ random characters) and DEMO_USER_PASSWORD (12+ characters) in .env.
docker compose up -d db
npm ci
npm run db:setup
npm run dev
```

Open <http://localhost:3000> and sign in as `demo@bolidesk.local` with your `DEMO_USER_PASSWORD`. The demo shop "CoolCare Services" has customers, an overdue invoice, a paid invoice and a quote waiting for an answer.

`DEMO_MODE=true` (the default) never contacts Razorpay, WhatsApp or OpenAI. Payment links carry no payable URL and messages are only logged.

The whole stack also runs in containers:

```bash
SESSION_SECRET=... DEMO_USER_PASSWORD=... docker compose up --build
```

## Checks

```bash
npm run typecheck
npm run lint
npm test                 # unit tests
npm run test:db          # Postgres tests; uses TEST_DATABASE_URL, which is wiped
npx playwright install chromium
npm run test:e2e         # browser tests against the dev server and demo data
npm run build
```

The database tests cover what mocks cannot prove: concurrent invoice numbering, the workspace lock, one live payment link per invoice, webhook deduplication, session revocation and cross-shop isolation.

## Database commands

| Command | Purpose |
| --- | --- |
| `npm run db:deploy` | Apply migrations (production and CI). |
| `npm run db:seed` | Create the demo shop. It only adds data to an empty demo workspace. |
| `npm run db:setup` | Generate the client, migrate and seed. |
| `npm run db:reset` | Drop the local database, migrate and seed again. |

## Configuration

`npm run env:check` lists missing or unsafe settings by name and never prints values. A production server refuses to start while any are missing.

| Variable | When | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Always | PostgreSQL connection string. |
| `SESSION_SECRET` | Always | 32+ random characters. |
| `DEMO_MODE` | Always | `true` uses demo adapters; `false` requires every live credential below. |
| `ALLOW_REGISTRATION` | Optional | `true` lets anyone create a new shop at `/register`. Leave `false` for a single-shop server; staff join by invite. |
| `APP_URL` | Live | Public `https://` origin, used in customer links. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Live | Payment links and the signed payment webhook. |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Live | Sending templates and receiving signed delivery statuses. |
| `WHATSAPP_TEMPLATE_INVOICE`, `WHATSAPP_TEMPLATE_REMINDER`, `WHATSAPP_TEMPLATE_LANGUAGE` | Optional | Template names (default `invoice_ready`, `payment_reminder`, `en`). |
| `AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL` | Live | Reads job notes into draft lines. Notes are sent to OpenAI. |
| `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD` | Seed | Demo owner account. |
| `TEST_DATABASE_URL` | Tests | Throwaway database for `npm run test:db`. |

Deploying, Razorpay and WhatsApp setup, backups and the go-live checklist are in [docs/operations.md](docs/operations.md).
