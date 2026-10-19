/**
 * Repeat-customer tier by completed orders (KPI plan, Feature 4: Bronze for
 * 1-2 orders up to Diamond for 26+). It labels customers for staff; discounts
 * stay with the spending-based Loyalty Tiers.
 */
export const CUSTOMER_TIERS = [
    { name: "Bronze", minOrders: 1, emoji: "🥉" },
    { name: "Silver", minOrders: 3, emoji: "🥈" },
    { name: "Gold", minOrders: 6, emoji: "🥇" },
    { name: "Platinum", minOrders: 11, emoji: "💠" },
    { name: "Diamond", minOrders: 26, emoji: "💎" },
] as const;

export function customerTierFor(completedOrders: number) {
    let tier: (typeof CUSTOMER_TIERS)[number] | null = null;
    for (const candidate of CUSTOMER_TIERS) {
        if (completedOrders >= candidate.minOrders) tier = candidate;
    }
    return tier
        ? { name: tier.name, emoji: tier.emoji, completedOrders }
        : { name: "New", emoji: "🆕", completedOrders };
}
