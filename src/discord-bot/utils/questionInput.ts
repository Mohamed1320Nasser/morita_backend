const LABEL_LIMIT = 45;
const PLACEHOLDER_LIMIT = 100;

/**
 * Discord caps a modal input label at 45 characters and rejects anything
 * longer, so a long question gets cut mid-word and the customer cannot read
 * what is being asked. Trim the label at a word boundary and fall back to
 * showing the whole question in the placeholder, which allows 100.
 */
export function buildQuestionLabel(question: string): string {
    const clean = String(question || "").trim();

    if (clean.length <= LABEL_LIMIT) {
        return clean;
    }

    const cut = clean.slice(0, LABEL_LIMIT - 1);
    const lastSpace = cut.lastIndexOf(" ");

    // Only break on a word boundary when it does not strand a tiny label.
    const trimmed = lastSpace > LABEL_LIMIT / 2 ? cut.slice(0, lastSpace) : cut;

    return `${trimmed.trimEnd()}…`;
}

export function buildQuestionPlaceholder(
    question: string,
    placeholder?: string | null
): string | null {
    if (placeholder && placeholder.trim()) {
        return placeholder.trim().slice(0, PLACEHOLDER_LIMIT);
    }

    const clean = String(question || "").trim();

    if (clean.length > LABEL_LIMIT) {
        return clean.slice(0, PLACEHOLDER_LIMIT);
    }

    return null;
}
