

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { PricingMethod } from '../types/discord.types';
import logger from '../../common/loggers';

export interface PaginationOptions {
  
  currentPage: number;

  itemsPerPage: number;

  totalItems: number;

  serviceId: string;

  categoryId: string;
}

export function createPricingPaginationButtons(options: PaginationOptions): ActionRowBuilder<ButtonBuilder> {
  const { currentPage, itemsPerPage, totalItems, serviceId, categoryId } = options;

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const hasPrevious = currentPage > 0;
  const hasNext = currentPage < totalPages - 1;

  const row = new ActionRowBuilder<ButtonBuilder>();

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`pricing_prev_${serviceId}_${categoryId}_${currentPage}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasPrevious)
  );

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`pricing_page_indicator_${currentPage}`)
      .setLabel(`${currentPage + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true)
  );

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`pricing_next_${serviceId}_${categoryId}_${currentPage}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasNext)
  );

  return row;
}

export function createServiceActionButtonsWithPagination(
  serviceId: string,
  categoryId: string,
  paginationOptions?: PaginationOptions
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

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

  if (paginationOptions && paginationOptions.totalItems > paginationOptions.itemsPerPage) {
    rows.push(createPricingPaginationButtons(paginationOptions));
  }

  return rows;
}

/**
 * Group pricing methods by groupName, keeping methods with same groupName together
 */
function groupMethodsByGroupName(methods: PricingMethod[]): { groupKey: string; methods: PricingMethod[] }[] {
  const withGroup: PricingMethod[] = [];
  const withoutGroup: PricingMethod[] = [];

  for (const method of methods) {
    if (method.groupName && method.groupName.trim()) {
      withGroup.push(method);
    } else {
      withoutGroup.push(method);
    }
  }

  const groupMap: Map<string, PricingMethod[]> = new Map();
  const groupMinOrder: Map<string, number> = new Map();

  for (const method of withGroup) {
    const groupName = method.groupName!.trim();
    const order = method.displayOrder ?? 999;

    if (!groupMap.has(groupName)) {
      groupMap.set(groupName, []);
      groupMinOrder.set(groupName, order);
    } else {
      const currentMin = groupMinOrder.get(groupName)!;
      if (order < currentMin) {
        groupMinOrder.set(groupName, order);
      }
    }
    groupMap.get(groupName)!.push(method);
  }

  // Sort methods within each group
  for (const [, groupMethods] of groupMap) {
    groupMethods.sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));
  }

  withoutGroup.sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));

  // Create entries for sorting
  type Entry =
    | { type: 'group'; name: string; methods: PricingMethod[]; minOrder: number }
    | { type: 'individual'; method: PricingMethod; order: number };

  const entries: Entry[] = [];

  for (const [groupName, groupMethods] of groupMap) {
    entries.push({
      type: 'group',
      name: groupName,
      methods: groupMethods,
      minOrder: groupMinOrder.get(groupName)!
    });
  }

  for (const method of withoutGroup) {
    entries.push({
      type: 'individual',
      method,
      order: method.displayOrder ?? 999
    });
  }

  // Sort by order
  entries.sort((a, b) => {
    const orderA = a.type === 'group' ? a.minOrder : a.order;
    const orderB = b.type === 'group' ? b.minOrder : b.order;
    return orderA - orderB;
  });

  // Convert to result format
  const result: { groupKey: string; methods: PricingMethod[] }[] = [];
  for (const entry of entries) {
    if (entry.type === 'group') {
      result.push({ groupKey: entry.name, methods: entry.methods });
    } else {
      result.push({ groupKey: entry.method.name, methods: [entry.method] });
    }
  }

  return result;
}

/**
 * Get paginated pricing methods - keeps methods with same groupName together
 * Pagination is by GROUPS, not individual methods
 */
export function getPaginatedPricingMethods(
  pricingMethods: PricingMethod[],
  page: number,
  itemsPerPage: number
): PricingMethod[] {
  // Group methods by groupName first
  const groups = groupMethodsByGroupName(pricingMethods);

  // Paginate by groups, not individual methods
  const startIndex = page * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedGroups = groups.slice(startIndex, endIndex);

  // Flatten the groups back to methods
  const result: PricingMethod[] = [];
  for (const group of paginatedGroups) {
    result.push(...group.methods);
  }

  return result;
}

/**
 * Get total number of groups (for pagination calculation)
 */
export function getTotalGroups(pricingMethods: PricingMethod[]): number {
  const groups = groupMethodsByGroupName(pricingMethods);
  return groups.length;
}

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

export function parsePaginationButtonId(customId: string): {
  action: 'prev' | 'next';
  serviceId: string;
  categoryId: string;
  currentPage: number;
} | null {

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
