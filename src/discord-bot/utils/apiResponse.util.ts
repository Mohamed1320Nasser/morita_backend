/**
 * Backend responses reach the bot wrapped a variable number of times:
 *
 *   axios            -> { data: ... }
 *   resInterceptor   -> { msg, status, error, data: ... }
 *   some controllers -> { success: true, data: ... }
 *
 * Controllers that return a bare service result nest twice; those that build
 * their own { success, data } object nest three times. Call sites that assumed
 * a fixed depth silently read `undefined` off the wrong level, which is how a
 * wallet holding $440 was reported as having no balance at all.
 *
 * unwrapApiData peels envelope layers until it reaches the payload, so callers
 * do not have to know which kind of controller they are talking to.
 */

// Keys that mark a wrapper rather than a payload: the backend envelope
// (msg/status/error/success) and the axios response object.
const ENVELOPE_KEYS = [
    "msg",
    "status",
    "error",
    "success",
    "statusText",
    "headers",
    "config",
    "request",
];

function isEnvelope(value: any): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (!("data" in value)) return false;

    // A payload that happens to carry its own `data` field must not be peeled,
    // so require every sibling key to be a known wrapper key.
    const keys = Object.keys(value);
    return keys.every(k => k === "data" || ENVELOPE_KEYS.includes(k));
}

export function unwrapApiData<T = any>(response: any): T {
    let current = response;

    // Bounded so a self-referencing object cannot spin forever.
    for (let depth = 0; depth < 5; depth++) {
        if (!isEnvelope(current)) break;
        current = current.data;
    }

    return current as T;
}

/**
 * True when the backend explicitly reported failure at any envelope level.
 */
export function isApiFailure(response: any): boolean {
    let current = response;

    for (let depth = 0; depth < 5; depth++) {
        if (!current || typeof current !== "object") break;
        if (current.success === false) return true;
        if (current.error === true) return true;
        if (!isEnvelope(current)) break;
        current = current.data;
    }

    return false;
}
