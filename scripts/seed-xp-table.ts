/**
 * Seed OSRS Experience Table
 *
 * This script populates the ExperienceTable with official OSRS XP data
 * Source: Old School RuneScape Wiki
 *
 * Usage:
 *   npx ts-node scripts/seed-xp-table.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// OSRS Official XP Table (Levels 1-99)
const XP_TABLE = [
    { level: 1, experience: 0, difference: 0 },
    { level: 2, experience: 83, difference: 83 },
    { level: 3, experience: 174, difference: 91 },
    { level: 4, experience: 276, difference: 102 },
    { level: 5, experience: 388, difference: 112 },
    { level: 6, experience: 512, difference: 124 },
    { level: 7, experience: 650, difference: 138 },
    { level: 8, experience: 801, difference: 151 },
    { level: 9, experience: 969, difference: 168 },
    { level: 10, experience: 1154, difference: 185 },
    { level: 11, experience: 1358, difference: 204 },
    { level: 12, experience: 1584, difference: 226 },
    { level: 13, experience: 1833, difference: 249 },
    { level: 14, experience: 2107, difference: 274 },
    { level: 15, experience: 2411, difference: 304 },
    { level: 16, experience: 2746, difference: 335 },
    { level: 17, experience: 3115, difference: 369 },
    { level: 18, experience: 3523, difference: 408 },
    { level: 19, experience: 3973, difference: 450 },
    { level: 20, experience: 4470, difference: 497 },
    { level: 21, experience: 5018, difference: 548 },
    { level: 22, experience: 5624, difference: 606 },
    { level: 23, experience: 6291, difference: 667 },
    { level: 24, experience: 7028, difference: 737 },
    { level: 25, experience: 7842, difference: 814 },
    { level: 26, experience: 8740, difference: 898 },
    { level: 27, experience: 9730, difference: 990 },
    { level: 28, experience: 10824, difference: 1094 },
    { level: 29, experience: 12031, difference: 1207 },
    { level: 30, experience: 13363, difference: 1332 },
    { level: 31, experience: 14833, difference: 1470 },
    { level: 32, experience: 16456, difference: 1623 },
    { level: 33, experience: 18247, difference: 1791 },
    { level: 34, experience: 20224, difference: 1977 },
    { level: 35, experience: 22406, difference: 2182 },
    { level: 36, experience: 24815, difference: 2409 },
    { level: 37, experience: 27473, difference: 2658 },
    { level: 38, experience: 30408, difference: 2935 },
    { level: 39, experience: 33648, difference: 3240 },
    { level: 40, experience: 37224, difference: 3576 },
    { level: 41, experience: 41171, difference: 3947 },
    { level: 42, experience: 45529, difference: 4358 },
    { level: 43, experience: 50339, difference: 4810 },
    { level: 44, experience: 55649, difference: 5310 },
    { level: 45, experience: 61512, difference: 5863 },
    { level: 46, experience: 67983, difference: 6471 },
    { level: 47, experience: 75127, difference: 7144 },
    { level: 48, experience: 83014, difference: 7887 },
    { level: 49, experience: 91721, difference: 8707 },
    { level: 50, experience: 101333, difference: 9612 },
    { level: 51, experience: 111945, difference: 10612 },
    { level: 52, experience: 123660, difference: 11715 },
    { level: 53, experience: 136594, difference: 12934 },
    { level: 54, experience: 150872, difference: 14278 },
    { level: 55, experience: 166636, difference: 15764 },
    { level: 56, experience: 184040, difference: 17404 },
    { level: 57, experience: 203254, difference: 19214 },
    { level: 58, experience: 224466, difference: 21212 },
    { level: 59, experience: 247886, difference: 23420 },
    { level: 60, experience: 273742, difference: 25856 },
    { level: 61, experience: 302288, difference: 28546 },
    { level: 62, experience: 333804, difference: 31516 },
    { level: 63, experience: 368599, difference: 34795 },
    { level: 64, experience: 407015, difference: 38416 },
    { level: 65, experience: 449428, difference: 42413 },
    { level: 66, experience: 496254, difference: 46826 },
    { level: 67, experience: 547953, difference: 51699 },
    { level: 68, experience: 605032, difference: 57079 },
    { level: 69, experience: 668051, difference: 63019 },
    { level: 70, experience: 737627, difference: 69576 },
    { level: 71, experience: 814445, difference: 76818 },
    { level: 72, experience: 899257, difference: 84812 },
    { level: 73, experience: 992895, difference: 93638 },
    { level: 74, experience: 1096278, difference: 103383 },
    { level: 75, experience: 1210421, difference: 114143 },
    { level: 76, experience: 1336443, difference: 126022 },
    { level: 77, experience: 1475581, difference: 139138 },
    { level: 78, experience: 1629200, difference: 153619 },
    { level: 79, experience: 1798808, difference: 169608 },
    { level: 80, experience: 1986068, difference: 187260 },
    { level: 81, experience: 2192818, difference: 206750 },
    { level: 82, experience: 2421087, difference: 228269 },
    { level: 83, experience: 2673114, difference: 252027 },
    { level: 84, experience: 2951373, difference: 278259 },
    { level: 85, experience: 3258594, difference: 307221 },
    { level: 86, experience: 3597792, difference: 339198 },
    { level: 87, experience: 3972294, difference: 374502 },
    { level: 88, experience: 4385776, difference: 413482 },
    { level: 89, experience: 4842295, difference: 456519 },
    { level: 90, experience: 5346332, difference: 504037 },
    { level: 91, experience: 5902831, difference: 556499 },
    { level: 92, experience: 6517253, difference: 614422 },
    { level: 93, experience: 7195629, difference: 678376 },
    { level: 94, experience: 7944614, difference: 748985 },
    { level: 95, experience: 8771558, difference: 826944 },
    { level: 96, experience: 9684577, difference: 913019 },
    { level: 97, experience: 10692629, difference: 1008052 },
    { level: 98, experience: 11805606, difference: 1112977 },
    { level: 99, experience: 13034431, difference: 1228825 },
];

async function main() {
    console.log("\n🌱 Seeding OSRS Experience Table...\n");

    // Clear existing data
    await prisma.experienceTable.deleteMany({});
    console.log("✓ Cleared existing XP table data");

    // Insert XP data
    await prisma.experienceTable.createMany({
        data: XP_TABLE,
    });

    console.log(`✅ Successfully seeded ${XP_TABLE.length} levels\n`);

    // Verify
    const count = await prisma.experienceTable.count();
    console.log(`📊 Total records in database: ${count}`);

    // Show sample data
    const sample = await prisma.experienceTable.findMany({
        where: {
            level: { in: [1, 50, 82, 90, 99] },
        },
        orderBy: { level: "asc" },
    });

    console.log("\n📋 Sample Data:");
    console.log("──────────────────────────────────");
    for (const row of sample) {
        console.log(
            `Level ${row.level}: ${row.experience.toLocaleString()} XP (diff: ${row.difference.toLocaleString()})`
        );
    }

    await prisma.$disconnect();
}

main().catch(error => {
    console.error("Error seeding XP table:", error);
});
