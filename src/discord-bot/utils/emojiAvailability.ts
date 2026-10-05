/**
 * Whether the bot can use a custom emoji. Discord rejects a whole message if a
 * select option carries a custom emoji the bot has no access to (one from a
 * server the bot is not in), so builders check here first.
 *
 * The bot registers the lookup once it is ready; until then (or outside the
 * bot process) every emoji is assumed usable.
 */
let lookup: ((emojiId: string) => boolean) | null = null;

export function setEmojiLookup(fn: (emojiId: string) => boolean): void {
    lookup = fn;
}

export function canUseCustomEmoji(emojiId: string): boolean {
    return lookup ? lookup(emojiId) : true;
}
