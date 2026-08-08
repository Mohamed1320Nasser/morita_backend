export function getBotApiKey(): string {
    return process.env.DISCORD_BOT_API_KEY || "";
}

export function botApiHeaders(
    extra: Record<string, string> = {}
): Record<string, string> {
    return {
        "Content-Type": "application/json",
        "X-API-Key": getBotApiKey(),
        ...extra,
    };
}
