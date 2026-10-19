/**
 * Calendar maths in the business's own timezone.
 *
 * The server runs in UTC, so getHours(), setHours(0) and new Date("2026-10-01")
 * all work in UTC. For a business three hours ahead that moves the peak-hour
 * chart by three hours and cuts every "today" / "this month" at the wrong
 * moment. Reports use these helpers instead, so day and hour boundaries follow
 * BUSINESS_TIMEZONE (an IANA name, e.g. "Africa/Cairo"; DST is handled).
 */

export const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "Africa/Cairo";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
});

export interface BusinessParts {
    year: number;
    /** 0-11, like Date.getMonth() */
    monthIndex: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    /** 0 = Sunday, like Date.getDay() */
    weekday: number;
}

export function businessParts(date: Date): BusinessParts {
    const parts: Record<string, string> = {};
    for (const part of formatter.formatToParts(date)) {
        parts[part.type] = part.value;
    }
    return {
        year: Number(parts.year),
        monthIndex: Number(parts.month) - 1,
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        second: Number(parts.second),
        weekday: WEEKDAYS.indexOf(parts.weekday),
    };
}

/** Offset of the business timezone from UTC at this instant, in ms */
function offsetAt(date: Date): number {
    const p = businessParts(date);
    const wallClockAsUtc = Date.UTC(p.year, p.monthIndex, p.day, p.hour, p.minute, p.second);
    return wallClockAsUtc - (date.getTime() - date.getUTCMilliseconds());
}

/**
 * The instant at which the business clock shows this wall time. Out-of-range
 * values roll over like Date.UTC (day 0 = last day of the previous month).
 */
export function businessTime(
    year: number,
    monthIndex: number,
    day: number,
    hour = 0,
    minute = 0,
    second = 0,
    ms = 0
): Date {
    const wallClock = Date.UTC(year, monthIndex, day, hour, minute, second, ms);
    // Second pass corrects the guess when the offset changes in between (DST)
    let instant = wallClock - offsetAt(new Date(wallClock));
    instant = wallClock - offsetAt(new Date(instant));
    return new Date(instant);
}

export const businessHour = (date: Date) => businessParts(date).hour;
export const businessWeekday = (date: Date) => businessParts(date).weekday;

/** YYYY-MM-DD of the business day this instant falls in */
export function businessDateKey(date: Date): string {
    const p = businessParts(date);
    return `${p.year}-${String(p.monthIndex + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function startOfBusinessDay(date: Date = new Date()): Date {
    const p = businessParts(date);
    return businessTime(p.year, p.monthIndex, p.day);
}

/**
 * Start of the current calendar period on the business clock. Weeks start on
 * Monday. Returns undefined for "all" or an unknown period.
 */
export function startOfBusinessPeriod(period: string | undefined, now: Date = new Date()): Date | undefined {
    const p = businessParts(now);
    switch (period) {
        case "daily":
            return businessTime(p.year, p.monthIndex, p.day);
        case "weekly":
            return businessTime(p.year, p.monthIndex, p.day - ((p.weekday + 6) % 7));
        case "monthly":
            return businessTime(p.year, p.monthIndex, 1);
        case "quarterly":
            return businessTime(p.year, Math.floor(p.monthIndex / 3) * 3, 1);
        case "yearly":
            return businessTime(p.year, 0, 1);
        default:
            return undefined;
    }
}

/** Start of the business month that is `monthsBack` months before this instant's month */
export function startOfBusinessMonth(date: Date = new Date(), monthsBack = 0): Date {
    const p = businessParts(date);
    return businessTime(p.year, p.monthIndex - monthsBack, 1);
}

/**
 * Range bounds sent by the dashboard. A plain date ("2026-10-19") means the
 * whole business day: the start bound is its first moment and the end bound its
 * last, so "today" includes today. Full timestamps are taken as they are.
 */
export function parseRangeStart(value: string): Date {
    if (DATE_ONLY.test(value)) {
        const [y, m, d] = value.split("-").map(Number);
        return businessTime(y, m - 1, d);
    }
    return new Date(value);
}

export function parseRangeEnd(value: string): Date {
    if (DATE_ONLY.test(value)) {
        const [y, m, d] = value.split("-").map(Number);
        return businessTime(y, m - 1, d, 23, 59, 59, 999);
    }
    return new Date(value);
}
