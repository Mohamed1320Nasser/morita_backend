export function countStart(page: number, limit: number): number {
    page = Math.max(page, 1);
    return limit * (page - 1);
}
