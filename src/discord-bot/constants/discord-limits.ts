

export const DISCORD_LIMITS = {
  
  EMBED: {
    
    MAX_FIELDS: 25,

    MAX_FIELD_VALUE: 1024,

    MAX_FIELD_NAME: 256,

    MAX_DESCRIPTION: 4096,

    MAX_TITLE: 256,

    MAX_FOOTER_TEXT: 2048,

    MAX_AUTHOR_NAME: 256,

    MAX_TOTAL_CHARACTERS: 6000,

    MAX_EMBEDS_PER_MESSAGE: 10,
  },

  MESSAGE: {
    
    MAX_LENGTH: 2000,

    MAX_CODE_BLOCK: 1990,

    MAX_ANSI_CODE_BLOCK: 1950,
  },

  COMPONENTS: {
    
    MAX_ACTION_ROWS: 5,

    MAX_BUTTONS_PER_ROW: 5,

    MAX_SELECT_MENUS_PER_ROW: 1,

    MAX_SELECT_OPTIONS: 25,

    MAX_CUSTOM_ID_LENGTH: 100,

    MAX_BUTTON_LABEL: 80,
  },

  PAGINATION: {
    
    PRICING_ITEMS_PER_PAGE: 20,

    SERVICE_LIST_ITEMS_PER_PAGE: 10,

    FIELD_BUFFER: 5,
  },

  TIMING: {
    
    INTERACTION_TOKEN_VALIDITY_MS: 15 * 60 * 1000,

    EPHEMERAL_AUTO_DELETE_MS: 10 * 60 * 1000,

    DEFER_UPDATE_TIMEOUT_MS: 3000,
  },
} as const;

export function getAvailableFields(currentFieldCount: number): number {
  return Math.max(0, DISCORD_LIMITS.EMBED.MAX_FIELDS - currentFieldCount);
}

export function fitsInFieldValue(content: string): boolean {
  return content.length <= DISCORD_LIMITS.EMBED.MAX_FIELD_VALUE;
}

export function truncateForFieldValue(content: string, suffix: string = '...'): string {
  if (fitsInFieldValue(content)) {
    return content;
  }
  const maxLength = DISCORD_LIMITS.EMBED.MAX_FIELD_VALUE - suffix.length;
  return content.substring(0, maxLength) + suffix;
}

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

export function canAddField(
  currentFieldCount: number,
  currentTotalSize: number,
  newFieldName: string,
  newFieldValue: string
): boolean {
  
  if (currentFieldCount >= DISCORD_LIMITS.EMBED.MAX_FIELDS) {
    return false;
  }

  if (newFieldValue.length > DISCORD_LIMITS.EMBED.MAX_FIELD_VALUE) {
    return false;
  }

  const newSize = currentTotalSize + newFieldName.length + newFieldValue.length;
  if (newSize > DISCORD_LIMITS.EMBED.MAX_TOTAL_CHARACTERS) {
    return false;
  }

  return true;
}
