/**
 * Why a ticket closed without an order (KPI plan, Feature 2). Support picks
 * one when the ticket closes; KPIs > Support groups conversions by it.
 */
export const NO_ORDER_REASONS = {
    PRICE_TOO_HIGH: "Price too high",
    NO_RESPONSE: "Customer no response",
    FOUND_ELSEWHERE: "Found elsewhere",
    NOT_READY: "Not ready yet",
    JUST_ASKING: "Just asking questions",
    OTHER: "Other",
} as const;

export type NoOrderReason = keyof typeof NO_ORDER_REASONS;

export const isNoOrderReason = (value: unknown): value is NoOrderReason =>
    typeof value === "string" && value in NO_ORDER_REASONS;
