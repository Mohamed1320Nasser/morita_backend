

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

export interface ContentItem {
  
  name: string;
  
  value: string;
  
  inline?: boolean;
}

export interface SplitOptions {
  
  title?: string;
  
  description?: string;
  
  color?: number;
  
  footer?: string;
  
  thumbnail?: string;
  
  useFields?: boolean;
  
  itemsPerPage?: number;
  
  enablePagination?: boolean;
  
  pageFormat?: (current: number, total: number) => string;
}

export interface SplitResult {
  
  embeds: EmbedBuilder[];
  
  components?: ActionRowBuilder<ButtonBuilder>[];
  
  wasSplit: boolean;
  
  totalPages: number;
}

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
    itemsPerPage = 25, 
    enablePagination = true,
    pageFormat = (current, total) => `Page ${current}/${total}`,
  } = options;

  const embeds: EmbedBuilder[] = [];
  let wasSplit = false;

  const totalPages = Math.ceil(items.length / itemsPerPage);

  if (totalPages > 1) {
    wasSplit = true;
  }

  for (let page = 0; page < totalPages; page++) {
    const startIndex = page * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, items.length);
    const pageItems = items.slice(startIndex, endIndex);

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title);

    if (page === 0 && description) {
      embed.setDescription(description);
    }

    if (thumbnail) {
      embed.setThumbnail(thumbnail);
    }

    if (useFields) {
      const fields: APIEmbedField[] = pageItems.map((item) => ({
        name: truncate(item.name, DISCORD_LIMITS.EMBED_FIELD_NAME),
        value: truncate(item.value, DISCORD_LIMITS.EMBED_FIELD_VALUE),
        inline: item.inline ?? false,
      }));
      embed.addFields(fields);
    } else {
      
      const content = pageItems
        .map((item) => `**${item.name}**\n${item.value}`)
        .join('\n\n');
      embed.setDescription(truncate(content, DISCORD_LIMITS.EMBED_DESCRIPTION));
    }

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

export function createPaginationButtons(
  currentPage: number,
  totalPages: number
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  const prevButton = new ButtonBuilder()
    .setCustomId(`page_prev_${currentPage}`)
    .setLabel('◀ Previous')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(currentPage === 0);

  const pageIndicator = new ButtonBuilder()
    .setCustomId(`page_indicator_${currentPage}`)
    .setLabel(`${currentPage + 1}/${totalPages}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const nextButton = new ButtonBuilder()
    .setCustomId(`page_next_${currentPage}`)
    .setLabel('Next ▶')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(currentPage === totalPages - 1);

  row.addComponents(prevButton, pageIndicator, nextButton);

  return row;
}

export function splitText(text: string, maxLength: number = DISCORD_LIMITS.MESSAGE_CONTENT): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let currentChunk = '';

  const lines = text.split('\n');

  for (const line of lines) {
    
    if (line.length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }

      for (let i = 0; i < line.length; i += maxLength) {
        chunks.push(line.substring(i, i + maxLength));
      }
      continue;
    }

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

export function truncate(text: string, maxLength: number, suffix: string = '...'): string {
  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength - suffix.length) + suffix;
}

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

export function formatPricingItems(
  pricingData: Array<{ name: string; price: number; currency?: string }>
): ContentItem[] {
  return pricingData.map((item) => ({
    name: item.name,
    value: `${item.price.toFixed(2)} ${item.currency || '$'}/service`,
    inline: false,
  }));
}

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

export function createGroupedEmbeds(
  groupedData: Map<string, ContentItem[]>,
  baseOptions: SplitOptions = {}
): EmbedBuilder[] {
  const embeds: EmbedBuilder[] = [];

  for (const [category, items] of groupedData) {
    const result = splitContent(items, {
      ...baseOptions,
      title: category,
      enablePagination: false, 
    });

    embeds.push(...result.embeds);
  }

  return embeds;
}

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
