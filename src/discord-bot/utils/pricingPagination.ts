/**
 * Pricing Pagination Utility
 *
 * Handles pagination for services with many pricing methods
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { PricingMethod } from '../types/discord.types';
import logger from '../../common/loggers';

export interface PaginationOptions {
  /** Current page number (0-indexed) */
  currentPage: number;

  /** Items per page */
  itemsPerPage: number;

  /** Total items */
  totalItems: number;

  /** Service ID */
  serviceId: string;

  /** Category ID */
  categoryId: string;
}

/**
 * Create pagination buttons for pricing
 */
export function createPricingPaginationButtons(options: PaginationOptions): ActionRowBuilder<ButtonBuilder> {
  const { currentPage, itemsPerPage, totalItems, serviceId, categoryId } = options;

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const hasPrevious = currentPage > 0;
  const hasNext = currentPage < totalPages - 1;

  const row = new ActionRowBuilder<ButtonBuilder>();

  // Previous button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`pricing_prev_${serviceId}_${categoryId}_${currentPage}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasPrevious)
  );

  // Page indicator (disabled button showing current page)
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`pricing_page_indicator_${currentPage}`)
      .setLabel(`${currentPage + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true)
  );

  // Next button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`pricing_next_${serviceId}_${categoryId}_${currentPage}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasNext)
  );

  return row;
}

/**
 * Create action buttons with pagination
 */
export function createServiceActionButtonsWithPagination(
  serviceId: string,
  categoryId: string,
  paginationOptions?: PaginationOptions
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  // First row: Main action buttons
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`open_ticket_${serviceId}_${categoryId}_0`)
      .setLabel('🎫 Open Ticket')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`calculate_price_${serviceId}`)
      .setLabel('💰 Calculate Price')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`back_to_category_${categoryId}`)
      .setLabel('⬅️ Back')
      .setStyle(ButtonStyle.Secondary)
  );
  rows.push(actionRow);

  // Second row: Pagination buttons (if needed)
  if (paginationOptions && paginationOptions.totalItems > paginationOptions.itemsPerPage) {
    rows.push(createPricingPaginationButtons(paginationOptions));
  }

  return rows;
}

/**
 * Get paginated pricing methods
 */
export function getPaginatedPricingMethods(
  pricingMethods: PricingMethod[],
  page: number,
  itemsPerPage: number
): PricingMethod[] {
  const startIndex = page * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  return pricingMethods.slice(startIndex, endIndex);
}

/**
 * Add pagination info to embed footer
 */
export function addPaginationFooter(
  embed: EmbedBuilder,
  currentPage: number,
  totalPages: number,
  totalItems: number
): void {
  const footerText = `Page ${currentPage + 1} of ${totalPages} • ${totalItems} total pricing methods • Morita Gaming Services`;
  embed.setFooter({
    text: footerText,
    iconURL: 'https://cdn.discordapp.com/icons/placeholder/morita-icon.png',
  });
}

/**
 * Parse pagination info from button customId
 */
export function parsePaginationButtonId(customId: string): {
  action: 'prev' | 'next';
  serviceId: string;
  categoryId: string;
  currentPage: number;
} | null {
  // Format: pricing_prev_serviceId_categoryId_currentPage
  // or: pricing_next_serviceId_categoryId_currentPage
  const match = customId.match(/^pricing_(prev|next)_([^_]+)_([^_]+)_(\d+)$/);

  if (!match) {
    return null;
  }

  return {
    action: match[1] as 'prev' | 'next',
    serviceId: match[2],
    categoryId: match[3],
    currentPage: parseInt(match[4], 10),
  };
}

/**
 * Calculate new page number based on action
 */
export function calculateNewPage(
  action: 'prev' | 'next',
  currentPage: number,
  totalPages: number
): number {
  if (action === 'prev') {
    return Math.max(0, currentPage - 1);
  } else {
    return Math.min(totalPages - 1, currentPage + 1);
  }
}
