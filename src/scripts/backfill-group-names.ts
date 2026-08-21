import prisma from "../common/prisma/client";

/**
 * Backfill PricingMethod.groupName.
 *
 * Two passes:
 *   1. Normalise existing values (trim, collapse whitespace) and merge groups
 *      that differ only by case or trailing spaces within the same service.
 *   2. For levelled methods with no group, adopt the method name as the group
 *      when two or more methods in the same service share that name — which is
 *      how multi-segment skill progressions are already named.
 *
 * Read-only by default. Pass --apply to write.
 */

const APPLY = process.argv.includes("--apply");

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

type Change = {
    id: string;
    service: string;
    method: string;
    from: string | null;
    to: string;
    reason: string;
};

async function main() {
    const methods = await prisma.pricingMethod.findMany({
        include: { service: { select: { name: true } } },
    });

    const changes: Change[] = [];

    // Pass 1: normalise what is already there.
    const canonical = new Map<string, string>();
    for (const m of methods) {
        const current = m.groupName;
        if (!current || !current.trim()) continue;

        const key = `${m.serviceId}::${clean(current).toLowerCase()}`;
        if (!canonical.has(key)) canonical.set(key, clean(current));
    }

    for (const m of methods) {
        const current = m.groupName;
        if (!current || !current.trim()) continue;

        const key = `${m.serviceId}::${clean(current).toLowerCase()}`;
        const target = canonical.get(key)!;

        if (current !== target) {
            changes.push({
                id: m.id,
                service: m.service.name,
                method: m.name,
                from: current,
                to: target,
                reason: current.trim() !== current ? "trim" : "case merge",
            });
        }
    }

    // Pass 2: derive a group for levelled methods that share a name.
    const nameCounts = new Map<string, number>();
    for (const m of methods) {
        if (m.startLevel === null) continue;
        const key = `${m.serviceId}::${clean(m.name).toLowerCase()}`;
        nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
    }

    for (const m of methods) {
        if (m.startLevel === null) continue;
        if (m.groupName && m.groupName.trim()) continue;

        const key = `${m.serviceId}::${clean(m.name).toLowerCase()}`;
        if ((nameCounts.get(key) || 0) < 2) continue;

        changes.push({
            id: m.id,
            service: m.service.name,
            method: m.name,
            from: m.groupName,
            to: clean(m.name),
            reason: "shared name",
        });
    }

    if (changes.length === 0) {
        console.log("Nothing to change.");
        return;
    }

    const byService = new Map<string, Change[]>();
    for (const c of changes) {
        if (!byService.has(c.service)) byService.set(c.service, []);
        byService.get(c.service)!.push(c);
    }

    for (const [service, rows] of [...byService.entries()].sort()) {
        console.log(`\n${service}`);
        for (const r of rows) {
            const from = r.from === null ? "(null)" : `"${r.from}"`;
            console.log(`  ${r.method.padEnd(38)} ${from} -> "${r.to}"   [${r.reason}]`);
        }
    }

    const counts = changes.reduce((acc, c) => {
        acc[c.reason] = (acc[c.reason] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    console.log("\n---");
    for (const [reason, n] of Object.entries(counts)) {
        console.log(`${reason.padEnd(14)}: ${n}`);
    }
    console.log(`total         : ${changes.length}`);

    if (!APPLY) {
        console.log("\nDry run. Re-run with --apply to write these changes.");
        return;
    }

    for (const c of changes) {
        await prisma.pricingMethod.update({
            where: { id: c.id },
            data: { groupName: c.to },
        });
    }

    console.log(`\nApplied ${changes.length} updates.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
