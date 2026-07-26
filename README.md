# BoliDesk

BoliDesk is a local-first demo workspace for Indian service businesses. It turns a WhatsApp-style job note into a reviewed quote, invoice, payment request, and practical follow-up list.

The app deliberately runs in demo mode today: data shown in the interface is safe sample data, payment links are simulated, and no WhatsApp messages are sent.

## Run locally

Prerequisites: Node.js 22+, Docker Desktop, and npm.

```bash
cp .env.example .env
docker compose up -d db
npm ci
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The database commands are idempotent, so `npm run db:setup` can be repeated after a schema change. `npm run db:reset` drops and recreates the local database, then reruns the seed script.

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

Copy `.env.example` to `.env`. `DATABASE_URL` is required by Prisma and points at the Postgres service on your machine. The remaining variables are reserved for future WhatsApp, Razorpay, and AI-parser integrations; leave `DEMO_MODE=true` while exploring this build.
