# Morita Backend

OSRS (Old School RuneScape) service platform backend with Discord bot integration.

## Features

- 🎮 **Discord Bot Integration** - Full-featured Discord bot for service pricing and management
- 💰 **Advanced Pricing System** - Multi-method pricing with modifiers and payment options
- 🔗 **Category Management** - Organize services by categories (Skills, Minigames, Ironman, etc.)
- 📊 **Real-time Calculations** - XP-based and quantity-based pricing calculators
- 🎫 **Ticket System** - Automated support ticket management
- 🔐 **Authentication** - JWT-based auth with role management

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Discord Bot Token

### Installation

```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.example .env

# Run database migrations
npx prisma migrate dev

# Seed database with services
npm run seed:all

# Build the project
npm run build
```

### Development

```bash
# Run backend in development mode
npm run dev

# Run Discord bot in development mode
npm run dev:bot

# Run both concurrently
npm run dev:both
```

### Production

```bash
# Build and start backend
npm run build
npm run start

# Start Discord bot
npm run start:bot
```

## Project Structure

```
morita_backend/
├── src/
│   ├── api/              # REST API controllers and services
│   ├── discord-bot/      # Discord bot implementation
│   ├── common/           # Shared utilities and helpers
│   └── scripts/          # Database seeding scripts
├── seed-data/            # JSON files for database seeding
├── prisma/               # Database schema and migrations
└── build/                # Compiled JavaScript output
```

## Discord Bot Commands

### Calculator Commands

- `!s <skill> <start>-<end>` - Skills calculator (e.g., `!s runecrafting 82-99`)
- `!b <boss> <kills>` - Bossing calculator (e.g., `!b zulrah 100`)
- `!m <minigame> <count>` - Minigames calculator (e.g., `!m barrows 100`)
- `!i <item> <quantity>` - Ironman gathering calculator (e.g., `!i amethyst 1000`)
- `!q <service>` - Quote for fixed-price services (e.g., `!q infernal-cape`)

## Database Seeding

The project includes comprehensive seed data for OSRS services:

```bash
# Seed all services
npm run seed:all

# Seed XP table only
npm run seed:xp
```

**Seed Data Files** (in `seed-data/` folder):
- `services-data-structure.json` - Core services (Megascale, Capes, Raids)
- `services-data-ADDITIONS.json` - Accounts Bundle
- `services-data-QUESTS.json` - Quests, Diaries & Misc
- `services-data-MINIGAMES.json` - Minigames (17 services)
- `services-data-IRONMAN.json` - Ironman Gathering (9 services)
- `services-data-SKILLS.json` - Skills category metadata
- `services-data-SKILLS-part1.json` - First 5 skills
- `services-data-SKILLS-part2.json` - Remaining 15 skills

## Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Discord**: Discord.js v14
- **Authentication**: JWT tokens
- **Logging**: Winston
- **Process Manager**: PM2

## Environment Variables

See `.env.example` for required environment variables:

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT tokens
- `DISCORD_BOT_TOKEN` - Discord bot token
- `DISCORD_CLIENT_ID` - Discord application ID
- `API_BASE_URL` - Backend API URL

## Scripts

- `npm run build` - Build TypeScript to JavaScript
- `npm run dev` - Start backend in development mode
- `npm run dev:bot` - Start Discord bot in development mode
- `npm run start` - Start production backend
- `npm run start:bot` - Start production bot
- `npm run seed:all` - Seed all services data

## License

Private project - All rights reserved

## Support

For support, contact the development team.