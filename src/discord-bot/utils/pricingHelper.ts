/**
 * Pricing Display Helper
 *
 * Specialized helper for displaying service pricing that automatically
 * handles Discord message limits using the message splitter utility.
 */

import { CommandInteraction, ButtonInteraction, Colors } from 'discord.js';
import {
  splitContent,
  sendLongContent,
  formatPricingItems,
  groupPricingByCategory,
  createGroupedEmbeds,
  ContentItem,
  SplitOptions,
} from './messageSplitter';
import { handleInteractionError } from './errorHandler';
import logger from '../../common/loggers';

/**
 * Service pricing data structure
 */
export interface ServicePricing {
  /** Service name (e.g., "Twisted Bow") */
  name: string;
  /** Price amount */
  price: number;
  /** Currency symbol (default: "$") */
  currency?: string;
  /** Category (e.g., "Main", "Zerker", "Pure") */
  category?: string;
  /** Game type (e.g., "OSRS", "RS3") */
  gameType?: string;
  /** Optional description */
  description?: string;
}

/**
 * Pricing display options
 */
export interface PricingDisplayOptions {
  /** Title for the embed */
  title?: string;
  /** Description text */
  description?: string;
  /** Embed color */
  color?: number;
  /** Whether to group by category */
  groupByCategory?: boolean;
  /** Items per page */
  itemsPerPage?: number;
  /** Enable pagination */
  enablePagination?: boolean;
  /** Thumbnail URL */
  thumbnail?: string;
  /** Footer text */
  footer?: string;
}

/**
 * Display service pricing with automatic splitting
 *
 * This function handles all the complexity of:
 * - Long pricing lists that exceed Discord limits
 * - Automatic splitting into multiple embeds
 * - Pagination with buttons
 * - Grouping by categories
 * - Error handling
 *
 * @param interaction - Discord interaction
 * @param services - Array of service pricing data
 * @param options - Display options
 * @returns true if successful
 *
 * @example
 * ```typescript
 * const services = [
 *   { name: 'Twisted Bow', price: 70.00, category: 'Main' },
 *   { name: 'Armadyl Crossbow', price: 85.00, category: 'Main' },
 *   // ... many more
 * ];
 *
 * await displayServicePricing(interaction, services, {
 *   title: '🔥 Infernal Cape',
 *   description: 'Professional infernal cape service',
 *   groupByCategory: true,
 * });
 * ```
 */
export async function displayServicePricing(
  interaction: CommandInteraction | ButtonInteraction,
  services: ServicePricing[],
  options: PricingDisplayOptions = {}
): Promise<boolean> {
  try {
    const {
      title = 'Service Pricing',
      description,
      color = Colors.Orange,
      groupByCategory = true,
      itemsPerPage = 20, // Reduced from 25 to leave room for headers
      enablePagination = true,
      thumbnail,
      footer,
    } = options;

    // If grouping by category
    if (groupByCategory && services.some((s) => s.category)) {
      return await displayGroupedPricing(interaction, services, options);
    }

    // Format services as content items
    const items: ContentItem[] = services.map((service) => {
      const serviceName = service.name;
      const priceText = `${service.price.toFixed(2)} ${service.currency || '$'}/service`;

      return {
        name: serviceName,
        value: priceText,
        inline: false,
      };
    });

    // Use sendLongContent to handle splitting automatically
    const success = await sendLongContent(interaction, items, {
      title,
      description,
      color,
      thumbnail,
      footer,
      useFields: true,
      itemsPerPage,
      enablePagination,
    });

    if (!success) {
      logger.error('Failed to display service pricing');
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error displaying service pricing:', error);
    await handleInteractionError(error, interaction);
    return false;
  }
}

/**
 * Display pricing grouped by category
 *
 * @param interaction - Discord interaction
 * @param services - Service pricing data
 * @param options - Display options
 * @returns true if successful
 */
async function displayGroupedPricing(
  interaction: CommandInteraction | ButtonInteraction,
  services: ServicePricing[],
  options: PricingDisplayOptions
): Promise<boolean> {
  try {
    const {
      title = 'Service Pricing',
      description,
      color = Colors.Orange,
      thumbnail,
      footer,
    } = options;

    // Group services by category
    const grouped = new Map<string, ServicePricing[]>();

    for (const service of services) {
      const category = service.category || 'Uncategorized';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(service);
    }

    // Create embeds for each category
    const embeds = [];
    let isFirstEmbed = true;

    for (const [category, categoryServices] of grouped) {
      const items: ContentItem[] = categoryServices.map((service) => ({
        name: service.name,
        value: `${service.price.toFixed(2)} ${service.currency || '$'}/service`,
        inline: false,
      }));

      const result = splitContent(items, {
        title: `${isFirstEmbed ? title + ' - ' : ''}${category}`,
        description: isFirstEmbed ? description : undefined,
        color,
        thumbnail: isFirstEmbed ? thumbnail : undefined,
        useFields: true,
        enablePagination: false, // Don't paginate per category
        itemsPerPage: 20,
      });

      embeds.push(...result.embeds);
      isFirstEmbed = false;
    }

    // Add footer to last embed
    if (footer && embeds.length > 0) {
      const lastEmbed = embeds[embeds.length - 1];
      lastEmbed.setFooter({ text: footer });
    }

    // Send embeds (handle if exceeds 10 embeds limit)
    const MAX_EMBEDS = 10;
    if (embeds.length <= MAX_EMBEDS) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: embeds as any });
      } else {
        await interaction.reply({ embeds: embeds as any });
      }
    } else {
      // Send in batches
      const firstBatch = embeds.slice(0, MAX_EMBEDS);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          embeds: firstBatch as any,
          content: `⚠️ Showing ${MAX_EMBEDS} of ${embeds.length} categories. More available...`,
        });
      } else {
        await interaction.reply({
          embeds: firstBatch as any,
          content: `⚠️ Showing ${MAX_EMBEDS} of ${embeds.length} categories. More available...`,
        });
      }

      // Send remaining in follow-up messages
      for (let i = MAX_EMBEDS; i < embeds.length; i += MAX_EMBEDS) {
        const batch = embeds.slice(i, i + MAX_EMBEDS);
        await interaction.followUp({ embeds: batch as any });
      }
    }

    return true;
  } catch (error) {
    logger.error('Error displaying grouped pricing:', error);
    await handleInteractionError(error, interaction);
    return false;
  }
}

/**
 * Format service name for display
 *
 * @param service - Service pricing data
 * @returns Formatted name
 */
export function formatServiceName(service: ServicePricing): string {
  let name = service.name;

  // Add game type if provided
  if (service.gameType) {
    name = `[${service.gameType}] ${name}`;
  }

  // Add category if provided and not grouping
  if (service.category) {
    name = `${service.category} - ${name}`;
  }

  return name;
}

/**
 * Example: Display Infernal Cape pricing (like your screenshot)
 *
 * @param interaction - Discord interaction
 * @returns true if successful
 */
export async function displayInfernalCapePricing(
  interaction: CommandInteraction | ButtonInteraction
): Promise<boolean> {
  // Example data structure - replace with your actual data fetching
  const services: ServicePricing[] = [
    // Main category
    { name: 'Parsec - Main - Twisted Bow', price: 70.0, category: 'Main' },
    { name: 'Parsec - Main - Armadyl Crossbow', price: 85.0, category: 'Main' },
    { name: 'Parsec - Main - Bowfa', price: 85.0, category: 'Main' },

    // Zerker category
    { name: 'Parsec - Zerker - Twisted Bow', price: 85.0, category: 'Zerker' },
    { name: 'Parsec - Zerker - Armadyl Crossbow', price: 95.0, category: 'Zerker' },

    // Pure category
    { name: 'Parsec - Pure - Twisted Bow', price: 90.0, category: 'Pure' },
    { name: 'Parsec - Pure - Armadyl Crossbow', price: 100.0, category: 'Pure' },

    // Add many more services here...
    // The function will automatically handle splitting!
  ];

  return await displayServicePricing(interaction, services, {
    title: '🔥 Infernal Cape',
    description: 'Professional infernal cape service',
    groupByCategory: true,
    color: Colors.Orange,
    footer: 'Morita Services - High Quality',
    enablePagination: true,
  });
}

/**
 * Convert your existing pricing format to ServicePricing array
 *
 * @param rawPricingData - Your raw pricing data from API/database
 * @returns ServicePricing array
 */
export function convertRawPricingData(rawPricingData: any[]): ServicePricing[] {
  return rawPricingData.map((item) => ({
    name: item.name || item.serviceName || 'Unknown Service',
    price: parseFloat(item.price) || 0,
    currency: item.currency || '$',
    category: item.category || item.type,
    gameType: item.gameType || item.game,
    description: item.description,
  }));
}
