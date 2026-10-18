# Morita Backend

Backend for **Morita**, an OSRS (Old School RuneScape) services marketplace that runs on Discord.
This repository contains two applications that share one codebase and one database:

| Application | Entry point | Default port | Purpose |
|---|---|---|---|
| **REST API** | `src/app.ts` | `3000` | Business logic and data for the dashboard and the bot |
| **Discord bot** | `src/discord-bot/start.ts` | `3002` (internal API) | Everything members and staff do inside Discord |

The admin dashboard lives in a separate repository (`morita_dashboard`) and talks to the REST API.

---

## Contents

- [Architecture](#architecture)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Running in production](#running-in-production)
- [Project structure](#project-structure)
- [Scripts](#scripts)
- [Further documentation](#further-documentation)

---

## Architecture

```
                 ┌──────────────────────┐
  Admins ──────▶ │  Dashboard (Next.js) │
                 └──────────┬───────────┘
                            │ HTTPS (JWT)
                            ▼
                 ┌──────────────────────┐      ┌──────────────┐
                 │   REST API (:3000)   │ ───▶ │    MySQL     │
                 └──────────┬───────────┘      └──────────────┘
                   ▲        │ X-API-Key               ▲
       X-API-Key   │        ▼                         │
                 ┌─┴────────────────────┐             │
  Members ─────▶ │ Discord bot (:3002)  │ ────────────┘
  & staff        └──────────┬───────────┘
                            │
                            ▼
                     Redis (bot cache)
```

- The **bot** calls the REST API for all business operations and authenticates with a shared API key.
- The **API** calls the bot's internal HTTP server (port `3002`) for Discord actions started from the dashboard
  (closing a ticket, creating a member's referral invite). These calls also require the API key.
- Both applications read the same `.env` file.

---

## Features

**Orders & payments**
- Order lifecycle: create → claim → in progress → awaiting confirmation → completed, plus cancel, dispute and refund
- Customer escrow: the order value is locked when the order is created and released on completion or cancellation
- Worker security deposit: locked on claim and returned to the source it came from (deposit or balance)
- Automatic payout split between worker, support and system on completion
- Wallets per user (customer, worker, support) with a full transaction ledger
- Crypto payment verification and configurable payment methods

**Discord**
- Service catalogue and pricing channels, price calculators (`!s` skills, `!p` bossing, `!m` minigames, `!i` ironman, `!q` quotes)
- Support tickets with open/close logs and saved HTML transcripts (admin-only)
- Onboarding: Terms of Service, questionnaire and customer role assignment
- Account shop with categories and live stock
- Slash commands for staff (balances, orders) and members (wallet, referrals)

**Growth & loyalty**
- Referral programme: personal invite links, join rewards (per referral / milestones / hybrid),
  order rewards, anti-fraud rules and a pending-reward processor
- Daily rewards, order rewards and loyalty tiers

**Admin**
- KPIs, reports and service analytics for the dashboard
- Role-based access (admin, support, worker, customer)

---

## Tech stack

| Area | Technology |
|---|---|
| Language | TypeScript 5 (Node.js) |
| HTTP framework | Express 5 + `routing-controllers`, `typedi` for dependency injection |
| Validation | `class-validator` / `class-transformer` |
| Database | MySQL with Prisma ORM 6 |
| Discord | discord.js 14 |
| Cache | Redis (`ioredis`) |
| Scheduling | `node-cron` |
| Auth | JWT |
| Logging | Winston |
| Process manager | PM2 |

---

## Requirements

- **Node.js** 20 LTS or newer, and npm
- **MySQL** 8
- **Redis** 6+ (used by the bot; defaults to `redis://localhost:6379`)
- A **Discord application** with a bot user, invited to your server with the required permissions
- **PM2** on the production server (`npm i -g pm2`)

---

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure the environment
cp .env.example .env
#    then fill in the values (see docs/ENVIRONMENT.md)

# 3. Create the database tables and generate the Prisma client
npx prisma db push
npx prisma generate

# 4. (Optional) Load the service catalogue
npm run seed:all

# 5. Run the API and the bot in development (two terminals)
npm run dev        # REST API on http://localhost:3000
npm run dev:bot    # Discord bot
```

> **Use a separate Discord server (or separate channels) for local development.**
> If the local bot and the production bot point at the same channels, both will post and edit
> the same messages and overwrite each other.

---

## Running in production

The production server runs both applications with PM2 using `ecosystem.prod.config.js`
(`morita-backend-prod` on port 3000 and `morita-bot-prod` on port 3002).

```bash
git pull
npm ci
npx prisma db push        # only when prisma/schema.prisma changed
npx prisma generate
npm run build

pm2 restart morita-backend-prod morita-bot-prod
pm2 logs morita-bot-prod  # follow the bot logs
```

The full procedure, including first-time setup, is in **docs/DEPLOYMENT.md**.

---

## Project structure

```
morita_backend/
├── prisma/
│   └── schema.prisma          # Database schema (single source of truth)
├── src/
│   ├── app.ts                 # REST API entry point
│   ├── api/                   # One folder per domain: controller, service, DTOs
│   │   ├── order/  wallet/  ticket/  referral/  referralReward/
│   │   ├── user/  auth/  onboarding/  dailyReward/  orderReward/
│   │   └── ...
│   ├── common/                # Config, middlewares, Prisma client, utilities
│   │   └── utils/transaction.util.ts   # Wallet locking and money movements
│   ├── discord-bot/
│   │   ├── start.ts           # Bot entry point + internal HTTP API (:3002)
│   │   ├── commands/          # Slash commands
│   │   ├── interactions/      # Buttons, modals and select menus
│   │   ├── events/            # Discord gateway events (joins, messages, ...)
│   │   ├── services/          # Bot-side logic (tickets, onboarding, referrals, ...)
│   │   ├── jobs/ cron/        # Scheduled tasks
│   │   └── config/            # Channel, role and feature configuration
│   └── scripts/               # Seeding and maintenance scripts
├── docs/                      # Project documentation
├── ecosystem.prod.config.js   # PM2 production config
└── .env.example               # Environment variable template
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the API with auto-reload |
| `npm run dev:bot` | Start the Discord bot with auto-reload |
| `npm run build` | Compile TypeScript into `build/` |
| `npm run start` | Start the compiled API |
| `npm run start:bot` | Start the compiled bot |
| `npm run db:push` | Apply `schema.prisma` to the database |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:studio` | Open Prisma Studio to browse data |
| `npm run seed:all` | Seed the services catalogue |
| `npm run bot:clear-commands` | Remove registered slash commands (they are re-registered on bot start) |
| `npm run setup:permissions` | Apply onboarding channel permissions in Discord |
| `npm run format` | Format the source with Prettier |
| `npm run logs:pm2:bot` | Follow the bot logs on the server |

---

## Further documentation

| Document | Contents |
|---|---|
| `docs/DEPLOYMENT.md` | Server setup, deployment and restart procedure |
| `docs/ENVIRONMENT.md` | Every environment variable and what it controls |
| `docs/SCHEDULED_JOBS.md` | Background jobs and how often they run |
| `docs/DATABASE.md` | Main tables and how they relate |

---

## Security notes

- Never commit `.env`. Keep `DISCORD_BOT_TOKEN`, `JWT_SECRET`, `DISCORD_BOT_API_KEY` and the database credentials private.
- The bot's internal API (port `3002`) must not be exposed to the internet; only the API should reach it.
- Rotate all secrets when ownership of the project or server changes.

---

## License

Private project. All rights reserved.
