/**
 * Discord API Limits and Constants
 *
 * These are hard limits imposed by Discord's API.
 * Exceeding these will cause API errors.
 *
 * Reference: https://discord.com/developers/docs/resources/channel#embed-limits
 */

export const DISCORD_LIMITS = {
  /**
   * Embed Limits
   */
  EMBED: {
    /** Maximum number of fields per embed */
    MAX_FIELDS: 25,

    /** Maximum characters in a field value */
    MAX_FIELD_VALUE: 1024,

    /** Maximum characters in field name */
    MAX_FIELD_NAME: 256,

    /** Maximum characters in embed description */
    MAX_DESCRIPTION: 4096,

    /** Maximum characters in embed title */
    MAX_TITLE: 256,

    /** Maximum characters in embed footer text */
    MAX_FOOTER_TEXT: 2048,

    /** Maximum characters in embed author name */
    MAX_AUTHOR_NAME: 256,

    /** Maximum total characters across all embed fields */
    MAX_TOTAL_CHARACTERS: 6000,

    /** Maximum number of embeds per message */
    MAX_EMBEDS_PER_MESSAGE: 10,
  },

  /**
   * Message Limits
   */
  MESSAGE: {
    /** Maximum characters in a regular message */
    MAX_LENGTH: 2000,

    /** Maximum length for code blocks (accounting for ``` markers) */
    MAX_CODE_BLOCK: 1990,

    /** Recommended max for ANSI code blocks (with escape sequences) */
    MAX_ANSI_CODE_BLOCK: 1950,
  },

  /**
   * Component Limits (Buttons, Select Menus)
   */
  COMPONENTS: {
    /** Maximum action rows per message */
    MAX_ACTION_ROWS: 5,

    /** Maximum buttons per action row */
    MAX_BUTTONS_PER_ROW: 5,

    /** Maximum select menus per action row */
    MAX_SELECT_MENUS_PER_ROW: 1,

    /** Maximum options in a select menu */
    MAX_SELECT_OPTIONS: 25,

    /** Maximum custom ID length */
    MAX_CUSTOM_ID_LENGTH: 100,

    /** Maximum button label length */
    MAX_BUTTON_LABEL: 80,
  },

  /**
   * Pagination Settings (Application-specific)
   */
  PAGINATION: {
    /** Optimal items per page for pricing display */
    PRICING_ITEMS_PER_PAGE: 20,

    /** Items per page for service lists */
    SERVICE_LIST_ITEMS_PER_PAGE: 10,

    /** Buffer to leave room for additional fields (modifiers, notes) */
    FIELD_BUFFER: 5,
  },

  /**
   * Timing Limits
   */
  TIMING: {
    /** Interaction token validity (15 minutes) */
    INTERACTION_TOKEN_VALIDITY_MS: 15 * 60 * 1000,

    /** Ephemeral message auto-delete timeout (10 minutes) */
    EPHEMERAL_AUTO_DELETE_MS: 10 * 60 * 1000,

    /** Initial defer update timeout (3 seconds) */
    DEFER_UPDATE_TIMEOUT_MS: 3000,
  },
} as const;

/**
 * Helper function to calculate available fields in an embed
 */
export function getAvailableFields(currentFieldCount: number): number {
  return Math.max(0, DISCORD_LIMITS.EMBED.MAX_FIELDS - currentFieldCount);
}

/**
 * Helper function to check if content fits in a field value
 */
export function fitsInFieldValue(content: string): boolean {
  return content.length <= DISCORD_LIMITS.EMBED.MAX_FIELD_VALUE;
}

/**
 * Helper function to truncate content to fit in a field value
 */
export function truncateForFieldValue(content: string, suffix: string = '...'): string {
  if (fitsInFieldValue(content)) {
    return content;
  }
  const maxLength = DISCORD_LIMITS.EMBED.MAX_FIELD_VALUE - suffix.length;
  return content.substring(0, maxLength) + suffix;
}

/**
 * Helper function to check if embed is within total character limit
 */
export function calculateEmbedSize(embed: {
  title?: string;
  description?: string;
  fields?: Array<{ name: string; value: string }>;
  footer?: { text: string };
  author?: { name: string };
}): number {
  let total = 0;

  if (embed.title) total += embed.title.length;
  if (embed.description) total += embed.description.length;
  if (embed.footer?.text) total += embed.footer.text.length;
  if (embed.author?.name) total += embed.author.name.length;

  if (embed.fields) {
    for (const field of embed.fields) {
      total += field.name.length + field.value.length;
    }
  }

  return total;
}

/**
 * Helper to check if adding a field would exceed limits
 */
export function canAddField(
  currentFieldCount: number,
  currentTotalSize: number,
  newFieldName: string,
  newFieldValue: string
): boolean {
  // Check field count limit
  if (currentFieldCount >= DISCORD_LIMITS.EMBED.MAX_FIELDS) {
    return false;
  }

  // Check field value size
  if (newFieldValue.length > DISCORD_LIMITS.EMBED.MAX_FIELD_VALUE) {
    return false;
  }

  // Check total size
  const newSize = currentTotalSize + newFieldName.length + newFieldValue.length;
  if (newSize > DISCORD_LIMITS.EMBED.MAX_TOTAL_CHARACTERS) {
    return false;
  }

  return true;
}
