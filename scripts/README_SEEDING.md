# 🌱 MMOGoldHut-Style Data Seeding

This document explains how to use the comprehensive data seeding script to populate your Morita database with realistic MMOGoldHut-style pricing data.

## 📋 What This Script Does

The `seed-mmogoldhut-style-data.ts` script creates a **complete set of realistic gaming service data** showcasing ALL features of the enhanced pricing system:

### Categories Created (5 total):
- ⚔️ **Skills** - Skill training services
- 🎮 **Minigames** - Minigame completion services
- 📜 **Quests** - Quest completion services
- 💀 **Bossing** - Boss killing services
- 💰 **Gold** - OSRS gold trading

### Services Created (11 total):

#### Skills Category:
1. **🏃 Agility** - Level-based pricing (1-40, 40-50, 50-60, 60-90, 90-99)
2. **🔮 Runecrafting** - Multiple methods with upcharges
3. **🔨 Smithing** - Fixed price with warning modifier

#### Minigames Category:
4. **🔥 Fire Cape** - 6 pricing tiers (Main/Zerker/Pure × Parsec/VPN) + upcharges + notes
5. **🌋 Infernal Cape** - 4 premium tiers with upcharges

#### Quests Category:
6. **🍲 Recipe for Disaster** - Fixed price with prerequisite upcharges

#### Bossing Category:
7. **🐍 Zulrah** - Per-kill pricing with bulk discounts
8. **⚔️ Chambers of Xeric** - Per-hour pricing

#### Gold Category:
9. **💵 OSRS Gold** - Tiered pricing per million GP

### Features Demonstrated:

✅ **All Pricing Units:**
- `FIXED` - One-time service fee
- `PER_LEVEL` - Price per XP level
- `PER_HOUR` - Hourly rate
- `PER_KILL` - Per boss kill
- `PER_ITEM` - Per item (used for gold per million, items collected, etc.)

✅ **All Modifier Types:**
- **UPCHARGE** (red) - Additional charges for special conditions
- **NOTE** (green) - Important information for customers
- **WARNING** (yellow) - Critical warnings about requirements

✅ **Pricing Patterns:**
- Level-based pricing (1-40, 40-50, etc.)
- Multiple pricing tiers (Main/Zerker/Pure accounts)
- Bulk discounts (1-50 kills vs 100+ kills)
- Conditional upcharges (+20M if no Rigour)
- Service notes (ETA, requirements, etc.)

## 🚀 How to Use

### Option 1: Fresh Start (Recommended for Testing)

This will **delete all existing data** and create a fresh set of demo data:

```bash
cd /Users/mohamednasser/Documents/morita/morita_backend
npx ts-node scripts/seed-mmogoldhut-style-data.ts --clean
```

⚠️ **WARNING:** The `--clean` flag will delete ALL:
- Service categories
- Services
- Pricing methods
- Pricing modifiers

Use this for testing or initial setup only!

### Option 2: Add to Existing Data

This will **add demo data** without deleting your existing services:

```bash
cd /Users/mohamednasser/Documents/morita/morita_backend
npx ts-node scripts/seed-mmogoldhut-style-data.ts
```

This is safer if you already have production data.

## 📊 Expected Output

```
🚀 MMOGoldHut-Style Data Seeding Script

============================================================

📦 Creating Service Categories...

  ✓ ⚔️ Skills
  ✓ 🎮 Minigames
  ✓ 📜 Quests
  ✓ 💀 Bossing
  ✓ 💰 Gold

✅ Created 5 categories

============================================================

🌱 Seeding Services with Pricing Data...

⚔️  Seeding Skills Category...

  🏃 Creating Agility service...
    ✓ Created 5 level-based pricing methods
  🔮 Creating Runecrafting service...
    ✓ Created 3 methods with upcharges and notes
  🔨 Creating Smithing service...
    ✓ Created fixed price method with warning

🎮 Seeding Minigames Category...

  🔥 Creating Fire Cape service...
    ✓ Created 6 tiers with 3 upcharges and 5 notes
  🌋 Creating Infernal Cape service...
    ✓ Created 4 premium tiers

📜 Seeding Quests Category...

  🍲 Creating Recipe for Disaster service...
    ✓ Created quest service with prerequisites

💀 Seeding Bossing Category...

  🐍 Creating Zulrah service...
    ✓ Created 3 per-kill pricing tiers
  ⚔️ Creating Chambers of Xeric service...
    ✓ Created hourly raid service

💰 Seeding Gold Category...

  💵 Creating OSRS Gold service...
    ✓ Created 4 gold pricing tiers

============================================================

✅ Data Seeding Complete!

📊 Summary:
  • 5 categories
  • 11 services
  • 30+ pricing methods
  • 15+ modifiers
```

## 🎮 Testing in Discord

After running the script:

1. **Start your Discord bot:**
   ```bash
   npm run dev
   ```

2. **In Discord, run:**
   ```
   /services
   ```

3. **Browse the categories:**
   - Select "Skills" → "Agility" to see level-based pricing
   - Select "Minigames" → "Fire Cape" to see multiple tiers + upcharges + notes
   - Select "Bossing" → "Zulrah" to see per-kill pricing

4. **Expected Discord display:**
   ```
   ╔═══════════════════════════════════════╗
   ║  🏃 Agility                           ║
   ╠═══════════════════════════════════════╣
   ║  Agility Training                     ║
   ║                                       ║
   ║  1-40 = $0.00007 per level            ║
   ║  40-50 = $0.000054 per level          ║
   ║  50-60 = $0.000045 per level          ║
   ║  60-90 = $0.00002 per level           ║
   ║  90-99 = $0.000024 per level          ║
   ╚═══════════════════════════════════════╝
   ```

## 🌐 Testing in Admin Panel

1. **Start your dashboard:**
   ```bash
   cd /Users/mohamednasser/Documents/morita/morital_dashboard
   npm run dev
   ```

2. **Navigate to:** `http://localhost:3001` (or your dashboard URL)

3. **Go to Pricing section** and you'll see:
   - All 5 categories
   - All 11 services
   - 30+ pricing methods with level ranges
   - 15+ modifiers with display types

4. **Test editing:**
   - Click on "Agility" service
   - View pricing methods with `startLevel` and `endLevel`
   - Click on "Fire Cape" service
   - View modifiers with `displayType` (UPCHARGE, NOTE, WARNING)

## 📝 What Each Service Demonstrates

| Service | Feature Demonstrated |
|---------|---------------------|
| **Agility** | Level-based pricing (5 ranges: 1-40, 40-50, 50-60, 60-90, 90-99) |
| **Runecrafting** | Multiple methods + UPCHARGE modifiers + NOTE modifiers |
| **Smithing** | Fixed price + WARNING modifier |
| **Fire Cape** | 6 pricing tiers + 3 upcharges + 5 notes (most complex) |
| **Infernal Cape** | Premium pricing + conditional upcharges |
| **Recipe for Disaster** | Quest pricing with prerequisite upcharges |
| **Zulrah** | Per-kill pricing with bulk discounts |
| **CoX Raids** | Per-hour pricing with loot notes |
| **OSRS Gold** | Per-million-GP pricing with tiered rates |

## 🔧 Customizing the Data

To customize the data for your needs:

1. **Edit the script:** `scripts/seed-mmogoldhut-style-data.ts`

2. **Modify categories:**
   ```typescript
   const categories = [
     {
       name: 'Your Category',
       slug: 'your-category',
       emoji: '🎯',
       description: 'Your description',
       displayOrder: 1,
     },
     // ... more categories
   ];
   ```

3. **Modify services:**
   ```typescript
   const yourService = await prisma.service.upsert({
     where: {
       categoryId_slug: {
         categoryId,
         slug: 'your-service',
       },
     },
     create: {
       categoryId,
       name: 'Your Service',
       slug: 'your-service',
       emoji: '⚡',
       description: 'Your description',
       active: true,
       displayOrder: 1,
     },
   });
   ```

4. **Modify pricing:**
   ```typescript
   const methods = [
     { name: 'Tier 1', startLevel: 1, endLevel: 50, basePrice: 0.0001 },
     { name: 'Tier 2', startLevel: 50, endLevel: 99, basePrice: 0.0002 },
   ];
   ```

5. **Run the modified script:**
   ```bash
   npx ts-node scripts/seed-mmogoldhut-style-data.ts --clean
   ```

## 🐛 Troubleshooting

### Error: "Cannot find module '@prisma/client'"
**Solution:**
```bash
npm install @prisma/client
npx prisma generate
```

### Error: "Unique constraint failed"
**Cause:** Data already exists with the same slug
**Solution:** Use `--clean` flag to clear existing data:
```bash
npx ts-node scripts/seed-mmogoldhut-style-data.ts --clean
```

### Error: "Database connection failed"
**Solution:** Check your `.env` file has correct `DATABASE_URL`:
```env
DATABASE_URL="mysql://user:password@localhost:3306/morita"
```

### Script runs but no data in Discord
**Solution:**
1. Restart your Discord bot: `Ctrl+C` then `npm run dev`
2. Check bot logs for errors
3. Verify services are active: `active: true`

## 📚 Related Documentation

- **Main Implementation Summary:** `/morita/FINAL_IMPLEMENTATION_SUMMARY.md`
- **Pricing Enhancement Plan:** `/morita/PRICING_ENHANCEMENT_PLAN.md`
- **Database Schema:** `/morita_backend/prisma/schema.prisma`
- **Discord Bot Builder:** `/morita_backend/src/discord-bot/utils/enhancedPricingBuilder.ts`

## 🎯 Quick Reference

| Command | Purpose |
|---------|---------|
| `npx ts-node scripts/seed-mmogoldhut-style-data.ts --clean` | Fresh start (deletes all data) |
| `npx ts-node scripts/seed-mmogoldhut-style-data.ts` | Add to existing data |
| `npx prisma studio` | View database in GUI |
| `npm run dev` | Start Discord bot |

---

**Created:** November 8, 2025
**Version:** 1.0.0
**Status:** ✅ Production Ready
