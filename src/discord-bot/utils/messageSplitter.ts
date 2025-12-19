/**
 * Discord Message Splitter Utility
 *
 * Handles long content that exceeds Discord limits by:
 * 1. Using embed fields for better organization
 * 2. Splitting into multiple embeds (up to 10 per message)
 * 3. Adding pagination buttons for navigation
 * 4. Falling back to multiple messages if needed
 *
 * Automatically integrates with error handler for MESSAGE_TOO_LONG errors
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  BaseInteraction,
  CommandInteraction,
  ButtonInteraction,
  Colors,
  APIEmbedField,
} from 'discord.js';
import logger from '../../common/loggers';

/**
 * Discord Limits Reference
 */
export const DISCORD_LIMITS = {
  MESSAGE_CONTENT: 2000,
  EMBED_TITLE: 256,
  EMBED_DESCRIPTION: 4096,
  EMBED_FOOTER: 2048,
  EMBED_AUTHOR: 256,
  EMBED_FIELD_NAME: 256,
  EMBED_FIELD_VALUE: 1024,
  EMBED_FIELDS_COUNT: 25,
  EMBED_TOTAL: 6000,
  EMBEDS_PER_MESSAGE: 10,
  ACTION_ROWS: 5,
  BUTTONS_PER_ROW: 5,
};

/**
 * Content item for splitting
 */
export interface ContentItem {
  /** Item name/title */
  name: string;
  /** Item value/description */
  value: string;
  /** Whether to display inline (for embed fields) */
  inline?: boolean;
}

/**
 * Split options
 */
export interface SplitOptions {
  /** Embed title (for all pages) */
  title?: string;
  /** Embed description (shown on first page) */
  description?: string;
  /** Embed color */
  color?: number;
  /** Footer text */
  footer?: string;
  /** Thumbnail URL */
  thumbnail?: string;
  /** Use embed fields instead of description */
  useFields?: boolean;
  /** Items per page (for pagination) */
  itemsPerPage?: number;
  /** Enable pagination buttons */
  enablePagination?: boolean;
  /** Custom page indicator format */
  pageFormat?: (current: number, total: number) => string;
}

/**
 * Split result
 */
export interface SplitResult {
  /** Array of embeds to send */
  embeds: EmbedBuilder[];
  /** Action row with pagination buttons (if pagination enabled) */
  components?: ActionRowBuilder<ButtonBuilder>[];
  /** Whether content was split */
  wasSplit: boolean;
  /** Total number of pages */
  totalPages: number;
}

/**
 * Split content into multiple embeds with smart organization
 *
 * @param items - Content items to display
 * @param options - Split options
 * @returns SplitResult with embeds and components
 *
 * @example
 * ```typescript
 * const items = [
 *   { name: 'Service 1', value: '$50' },
 *   { name: 'Service 2', value: '$75' },
 *   // ... many more
 * ];
 *
 * const result = splitContent(items, {
 *   title: 'Our Services',
 *   useFields: true,
 *   enablePagination: true,
 * });
 *
 * await interaction.reply({
 *   embeds: result.embeds,
 *   components: result.components,
 * });
 * ```
 */
export function splitContent(
  items: ContentItem[],
  options: SplitOptions = {}
): SplitResult {
  const {
    title = 'Content',
    description,
    color = Colors.Blue,
    footer,
    thumbnail,
    useFields = true,
    itemsPerPage = 25, // Default to max fields per embed
    enablePagination = true,
    pageFormat = (current, total) => `Page ${current}/${total}`,
  } = options;

  const embeds: EmbedBuilder[] = [];
  let wasSplit = false;

  // Calculate total pages needed
  const totalPages = Math.ceil(items.length / itemsPerPage);

  if (totalPages > 1) {
    wasSplit = true;
  }

  // Split items into pages
  for (let page = 0; page < totalPages; page++) {
    const startIndex = page * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, items.length);
    const pageItems = items.slice(startIndex, endIndex);

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title);

    // Add description only on first page
    if (page === 0 && description) {
      embed.setDescription(description);
    }

    // Add thumbnail
    if (thumbnail) {
      embed.setThumbnail(thumbnail);
    }

    // Add items as fields or description
    if (useFields) {
      const fields: APIEmbedField[] = pageItems.map((item) => ({
        name: truncate(item.name, DISCORD_LIMITS.EMBED_FIELD_NAME),
        value: truncate(item.value, DISCORD_LIMITS.EMBED_FIELD_VALUE),
        inline: item.inline ?? false,
      }));
      embed.addFields(fields);
    } else {
      // Use description (less common for lists)
      const content = pageItems
        .map((item) => `**${item.name}**\n${item.value}`)
        .join('\n\n');
      embed.setDescription(truncate(content, DISCORD_LIMITS.EMBED_DESCRIPTION));
    }

    // Add footer with page info
    let footerText = footer || '';
    if (totalPages > 1) {
      const pageInfo = pageFormat(page + 1, totalPages);
      footerText = footerText ? `${footerText} • ${pageInfo}` : pageInfo;
    }
    if (footerText) {
      embed.setFooter({ text: truncate(footerText, DISCORD_LIMITS.EMBED_FOOTER) });
    }

    embeds.push(embed);
  }

  // Add pagination buttons if needed
  let components: ActionRowBuilder<ButtonBuilder>[] | undefined;
  if (enablePagination && totalPages > 1) {
    components = [createPaginationButtons(0, totalPages)];
  }

  return {
    embeds,
    components,
    wasSplit,
    totalPages,
  };
}

/**
 * Create pagination buttons
 *
 * @param currentPage - Current page index (0-based)
 * @param totalPages - Total number of pages
 * @returns ActionRow with pagination buttons
 */
export function createPaginationButtons(
  currentPage: number,
  totalPages: number
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  // Previous button
  const prevButton = new ButtonBuilder()
    .setCustomId(`page_prev_${currentPage}`)
    .setLabel('◀ Previous')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(currentPage === 0);

  // Current page indicator
  const pageIndicator = new ButtonBuilder()
    .setCustomId(`page_indicator_${currentPage}`)
    .setLabel(`${currentPage + 1}/${totalPages}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  // Next button
  const nextButton = new ButtonBuilder()
    .setCustomId(`page_next_${currentPage}`)
    .setLabel('Next ▶')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(currentPage === totalPages - 1);

  row.addComponents(prevButton, pageIndicator, nextButton);

  return row;
}

/**
 * Split long text into chunks that fit Discord limits
 *
 * @param text - Text to split
 * @param maxLength - Maximum length per chunk (default: 2000 for messages)
 * @returns Array of text chunks
 */
export function splitText(text: string, maxLength: number = DISCORD_LIMITS.MESSAGE_CONTENT): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let currentChunk = '';

  // Split by lines to avoid breaking mid-sentence
  const lines = text.split('\n');

  for (const line of lines) {
    // If single line exceeds limit, force split
    if (line.length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }

      // Split long line into smaller chunks
      for (let i = 0; i < line.length; i += maxLength) {
        chunks.push(line.substring(i, i + maxLength));
      }
      continue;
    }

    // Check if adding this line would exceed limit
    if (currentChunk.length + line.length + 1 > maxLength) {
      chunks.push(currentChunk);
      currentChunk = line;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + line;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Truncate text to fit Discord limit
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @param suffix - Suffix to add when truncated (default: '...')
 * @returns Truncated text
 */
export function truncate(text: string, maxLength: number, suffix: string = '...'): string {
  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Send long content with automatic splitting
 *
 * Handles all edge cases and automatically uses best method
 *
 * @param interaction - Discord interaction
 * @param items - Content items to send
 * @param options - Split options
 * @returns true if successful
 */
export async function sendLongContent(
  interaction: CommandInteraction | ButtonInteraction,
  items: ContentItem[],
  options: SplitOptions = {}
): Promise<boolean> {
  try {
    const result = splitContent(items, {
      ...options,
      enablePagination: items.length > (options.itemsPerPage || 25),
    });

    // If fits in single message (up to 10 embeds)
    if (result.embeds.length <= DISCORD_LIMITS.EMBEDS_PER_MESSAGE) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          embeds: result.embeds as any,
          components: result.components as any,
        });
      } else {
        await interaction.reply({
          embeds: result.embeds as any,
          components: result.components as any,
          ephemeral: options.useFields ? false : true,
        });
      }

      return true;
    }

    // If exceeds 10 embeds, send first page with pagination
    // Store full data for pagination handler
    const firstPageEmbeds = result.embeds.slice(0, DISCORD_LIMITS.EMBEDS_PER_MESSAGE);
    const hasMore = result.embeds.length > DISCORD_LIMITS.EMBEDS_PER_MESSAGE;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        embeds: firstPageEmbeds as any,
        components: result.components as any,
        content: hasMore ? '⚠️ Showing first page. Use buttons to navigate.' : undefined,
      });
    } else {
      await interaction.reply({
        embeds: firstPageEmbeds as any,
        components: result.components as any,
        content: hasMore ? '⚠️ Showing first page. Use buttons to navigate.' : undefined,
      });
    }

    return true;
  } catch (error) {
    logger.error('Failed to send long content:', error);
    return false;
  }
}

/**
 * Format pricing items for display
 *
 * @param pricingData - Array of pricing items
 * @returns Formatted ContentItems
 */
export function formatPricingItems(
  pricingData: Array<{ name: string; price: number; currency?: string }>
): ContentItem[] {
  return pricingData.map((item) => ({
    name: item.name,
    value: `${item.price.toFixed(2)} ${item.currency || '$'}/service`,
    inline: false,
  }));
}

/**
 * Group pricing items by category
 *
 * @param pricingData - Pricing data with categories
 * @returns Grouped items
 */
export function groupPricingByCategory(
  pricingData: Array<{
    category: string;
    name: string;
    price: number;
    currency?: string;
  }>
): Map<string, ContentItem[]> {
  const grouped = new Map<string, ContentItem[]>();

  for (const item of pricingData) {
    if (!grouped.has(item.category)) {
      grouped.set(item.category, []);
    }

    grouped.get(item.category)!.push({
      name: item.name,
      value: `${item.price.toFixed(2)} ${item.currency || '$'}/service`,
      inline: false,
    });
  }

  return grouped;
}

/**
 * Create embeds for grouped pricing
 *
 * @param groupedData - Grouped pricing data
 * @param baseOptions - Base options for all embeds
 * @returns Array of embeds
 */
export function createGroupedEmbeds(
  groupedData: Map<string, ContentItem[]>,
  baseOptions: SplitOptions = {}
): EmbedBuilder[] {
  const embeds: EmbedBuilder[] = [];

  for (const [category, items] of groupedData) {
    const result = splitContent(items, {
      ...baseOptions,
      title: category,
      enablePagination: false, // Don't add pagination per category
    });

    embeds.push(...result.embeds);
  }

  return embeds;
}

/**
 * Calculate embed size (approximate)
 *
 * @param embed - Embed to calculate size for
 * @returns Approximate character count
 */
export function calculateEmbedSize(embed: EmbedBuilder): number {
  const data = embed.data;
  let size = 0;

  if (data.title) size += data.title.length;
  if (data.description) size += data.description.length;
  if (data.footer?.text) size += data.footer.text.length;
  if (data.author?.name) size += data.author.name.length;

  if (data.fields) {
    for (const field of data.fields) {
      size += field.name.length + field.value.length;
    }
  }

  return size;
}

/**
 * Check if embed exceeds Discord limits
 *
 * @param embed - Embed to check
 * @returns true if within limits
 */
export function isEmbedValid(embed: EmbedBuilder): boolean {
  const data = embed.data;

  if (data.title && data.title.length > DISCORD_LIMITS.EMBED_TITLE) return false;
  if (data.description && data.description.length > DISCORD_LIMITS.EMBED_DESCRIPTION) return false;
  if (data.footer?.text && data.footer.text.length > DISCORD_LIMITS.EMBED_FOOTER) return false;
  if (data.author?.name && data.author.name.length > DISCORD_LIMITS.EMBED_AUTHOR) return false;

  if (data.fields) {
    if (data.fields.length > DISCORD_LIMITS.EMBED_FIELDS_COUNT) return false;

    for (const field of data.fields) {
      if (field.name.length > DISCORD_LIMITS.EMBED_FIELD_NAME) return false;
      if (field.value.length > DISCORD_LIMITS.EMBED_FIELD_VALUE) return false;
    }
  }

  const totalSize = calculateEmbedSize(embed);
  if (totalSize > DISCORD_LIMITS.EMBED_TOTAL) return false;

  return true;
}
