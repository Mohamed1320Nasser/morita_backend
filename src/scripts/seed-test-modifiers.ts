import prisma from "../common/prisma/client";

/**
 * Seed throwaway modifiers so a quote can be eyeballed on a real environment.
 *
 * Seeds both kinds, because they reach the embed by different paths:
 *   - ServiceModifier attaches to the service and rides along with every quote.
 *   - PricingModifier attaches to one method and only shows when a segment
 *     that method covers is part of the answer.
 *
 * Every row is named with the TEST_PREFIX so --remove can find them again.
 * Nothing else is touched, and rows that already exist are updated rather than
 * duplicated, so re-running is safe.
 *
 * Read-only by default. Pass --apply to write, --remove to delete.
 *
 *   npx ts-node src/scripts/seed-test-modifiers.ts --service agility
 *   npx ts-node src/scripts/seed-test-modifiers.ts --service agility --apply
 *   npx ts-node src/scripts/seed-test-modifiers.ts --service agility --remove --apply
 */

const TEST_PREFIX = "TEST ";

const APPLY = process.argv.includes("--apply");
const REMOVE = process.argv.includes("--remove");

const argValue = (flag: string) => {
    const index = process.argv.indexOf(flag);
    return index === -1 ? undefined : process.argv[index + 1];
};

const serviceQuery = argValue("--service");

// Level range the method-level modifiers should land inside. A PricingModifier
// on a method outside the range the customer asks for never appears, which is
// the usual reason a seeded modifier looks like it did nothing.
const rangeStart = Number(argValue("--start") ?? 1);
const rangeEnd = Number(argValue("--end") ?? 99);

type SeedModifier = {
    name: string;
    modifierType: "PERCENTAGE" | "FIXED";
    value: number;
    displayType: "NORMAL" | "UPCHARGE" | "DISCOUNT" | "NOTE" | "WARNING";
    priority: number;
    condition?: string;
};

const SERVICE_MODIFIERS: SeedModifier[] = [
    {
        name: `${TEST_PREFIX}No Graceful Outfit`,
        modifierType: "PERCENTAGE",
        value: 20,
        displayType: "UPCHARGE",
        priority: 1,
        condition: "Customer has no Graceful outfit",
    },
    {
        name: `${TEST_PREFIX}Rush Delivery`,
        modifierType: "PERCENTAGE",
        value: 35,
        displayType: "UPCHARGE",
        priority: 2,
        condition: "Priority queue",
    },
    {
        name: `${TEST_PREFIX}Returning Customer`,
        modifierType: "PERCENTAGE",
        value: -10,
        displayType: "DISCOUNT",
        priority: 3,
        condition: "Third order or later",
    },
    {
        name: `${TEST_PREFIX}Account Setup Fee`,
        modifierType: "FIXED",
        value: 5,
        displayType: "UPCHARGE",
        priority: 4,
    },
];

const METHOD_MODIFIERS: SeedModifier[] = [
    {
        name: `${TEST_PREFIX}No Stamina Potions`,
        modifierType: "PERCENTAGE",
        value: 15,
        displayType: "UPCHARGE",
        priority: 1,
        condition: "Customer supplies no staminas",
    },
    {
        name: `${TEST_PREFIX}Supplies Provided`,
        modifierType: "FIXED",
        value: -3,
        displayType: "DISCOUNT",
        priority: 2,
        condition: "Customer provides all supplies",
    },
];

async function findService() {
    if (!serviceQuery) {
        throw new Error("Pass --service <name or id>, e.g. --service agility");
    }

    const byId = await prisma.service.findFirst({
        where: { id: serviceQuery, deletedAt: null },
    });
    if (byId) return byId;

    const matches = await prisma.service.findMany({
        where: { name: { contains: serviceQuery }, deletedAt: null },
        orderBy: { name: "asc" },
    });

    if (matches.length === 0) {
        throw new Error(`No service matches "${serviceQuery}"`);
    }
    if (matches.length > 1) {
        const names = matches.map(s => `  - ${s.name} (${s.id})`).join("\n");
        throw new Error(
            `"${serviceQuery}" matches ${matches.length} services, pass the id instead:\n${names}`
        );
    }
    return matches[0];
}

async function remove(serviceId: string, serviceName: string) {
    const serviceRows = await prisma.serviceModifier.findMany({
        where: { serviceId, name: { startsWith: TEST_PREFIX } },
    });

    const methodRows = await prisma.pricingModifier.findMany({
        where: {
            name: { startsWith: TEST_PREFIX },
            method: { serviceId },
        },
        include: { method: { select: { name: true } } },
    });

    console.log(`\nTest modifiers on ${serviceName}:`);
    serviceRows.forEach(r => console.log(`  [service] ${r.name}`));
    methodRows.forEach(r => console.log(`  [method:${r.method.name}] ${r.name}`));

    if (serviceRows.length === 0 && methodRows.length === 0) {
        console.log("  (none)");
        return;
    }

    if (!APPLY) {
        console.log(
            `\nWould delete ${serviceRows.length + methodRows.length} row(s). Re-run with --apply.`
        );
        return;
    }

    await prisma.serviceModifier.deleteMany({
        where: { id: { in: serviceRows.map(r => r.id) } },
    });
    await prisma.pricingModifier.deleteMany({
        where: { id: { in: methodRows.map(r => r.id) } },
    });

    console.log(`\nDeleted ${serviceRows.length + methodRows.length} row(s).`);
}

async function seed(serviceId: string, serviceName: string) {
    // Only levelled methods overlapping the range can surface a modifier, so
    // seeding anywhere else would produce rows the quote never mentions.
    const methods = await prisma.pricingMethod.findMany({
        where: {
            serviceId,
            active: true,
            deletedAt: null,
            pricingUnit: "PER_LEVEL",
        },
        orderBy: { displayOrder: "asc" },
    });

    const inRange = methods.filter(m => {
        const start = m.startLevel ?? 1;
        const end = m.endLevel ?? 99;
        return start <= rangeEnd && end >= rangeStart;
    });

    console.log(`\nService: ${serviceName} (${serviceId})`);
    console.log(`Range:   ${rangeStart}-${rangeEnd}`);
    console.log(
        `Methods: ${inRange.length} of ${methods.length} PER_LEVEL method(s) overlap the range`
    );

    if (inRange.length === 0) {
        console.log(
            "\nNo method covers that range, so method-level modifiers would never show."
        );
        console.log("Seeding service-level modifiers only.");
    }

    console.log("\nService-level modifiers:");
    SERVICE_MODIFIERS.forEach(m =>
        console.log(`  ${m.name} — ${m.modifierType} ${m.value} (${m.displayType})`)
    );

    console.log("\nMethod-level modifiers:");
    if (inRange.length === 0) {
        console.log("  (skipped)");
    } else {
        inRange.forEach(method => {
            METHOD_MODIFIERS.forEach(m =>
                console.log(
                    `  [${method.name} ${method.startLevel ?? "?"}-${method.endLevel ?? "?"}] ` +
                        `${m.name} — ${m.modifierType} ${m.value}`
                )
            );
        });
    }

    if (!APPLY) {
        const total =
            SERVICE_MODIFIERS.length + inRange.length * METHOD_MODIFIERS.length;
        console.log(`\nWould write ${total} row(s). Re-run with --apply.`);
        return;
    }

    let written = 0;

    for (const modifier of SERVICE_MODIFIERS) {
        // No unique constraint on (serviceId, name), so match by hand to keep
        // repeat runs from stacking duplicates.
        const existing = await prisma.serviceModifier.findFirst({
            where: { serviceId, name: modifier.name },
        });

        if (existing) {
            await prisma.serviceModifier.update({
                where: { id: existing.id },
                data: { ...modifier, active: true },
            });
        } else {
            await prisma.serviceModifier.create({
                data: { ...modifier, serviceId, active: true },
            });
        }
        written++;
    }

    for (const method of inRange) {
        for (const modifier of METHOD_MODIFIERS) {
            const existing = await prisma.pricingModifier.findFirst({
                where: { methodId: method.id, name: modifier.name },
            });

            if (existing) {
                await prisma.pricingModifier.update({
                    where: { id: existing.id },
                    data: { ...modifier, active: true },
                });
            } else {
                await prisma.pricingModifier.create({
                    data: { ...modifier, methodId: method.id, active: true },
                });
            }
            written++;
        }
    }

    console.log(`\nWrote ${written} row(s).`);
}

async function main() {
    const service = await findService();

    if (REMOVE) {
        await remove(service.id, service.name);
    } else {
        await seed(service.id, service.name);
    }
}

main()
    .catch(error => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
