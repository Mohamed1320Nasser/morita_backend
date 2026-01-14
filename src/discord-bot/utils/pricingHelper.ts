

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

export interface ServicePricing {
  
  name: string;
  
  price: number;
  
  currency?: string;
  
  category?: string;
  
  gameType?: string;
  
  description?: string;
}

export interface PricingDisplayOptions {
  
  title?: string;
  
  description?: string;
  
  color?: number;
  
  groupByCategory?: boolean;
  
  itemsPerPage?: number;
  
  enablePagination?: boolean;
  
  thumbnail?: string;
  
  footer?: string;
}

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
      itemsPerPage = 20, 
      enablePagination = true,
      thumbnail,
      footer,
    } = options;

    if (groupByCategory && services.some((s) => s.category)) {
      return await displayGroupedPricing(interaction, services, options);
    }

    const items: ContentItem[] = services.map((service) => {
      const serviceName = service.name;
      const priceText = `${service.price.toFixed(2)} ${service.currency || '$'}/service`;

      return {
        name: serviceName,
        value: priceText,
        inline: false,
      };
    });

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

    const grouped = new Map<string, ServicePricing[]>();

    for (const service of services) {
      const category = service.category || 'Uncategorized';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(service);
    }

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
        enablePagination: false, 
        itemsPerPage: 20,
      });

      embeds.push(...result.embeds);
      isFirstEmbed = false;
    }

    if (footer && embeds.length > 0) {
      const lastEmbed = embeds[embeds.length - 1];
      lastEmbed.setFooter({ text: footer });
    }

    const MAX_EMBEDS = 10;
    if (embeds.length <= MAX_EMBEDS) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: embeds as any });
      } else {
        await interaction.reply({ embeds: embeds as any });
      }
    } else {
      
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

export function formatServiceName(service: ServicePricing): string {
  let name = service.name;

  if (service.gameType) {
    name = `[${service.gameType}] ${name}`;
  }

  if (service.category) {
    name = `${service.category} - ${name}`;
  }

  return name;
}

export async function displayInfernalCapePricing(
  interaction: CommandInteraction | ButtonInteraction
): Promise<boolean> {
  
  const services: ServicePricing[] = [
    
    { name: 'Parsec - Main - Twisted Bow', price: 70.0, category: 'Main' },
    { name: 'Parsec - Main - Armadyl Crossbow', price: 85.0, category: 'Main' },
    { name: 'Parsec - Main - Bowfa', price: 85.0, category: 'Main' },

    { name: 'Parsec - Zerker - Twisted Bow', price: 85.0, category: 'Zerker' },
    { name: 'Parsec - Zerker - Armadyl Crossbow', price: 95.0, category: 'Zerker' },

    { name: 'Parsec - Pure - Twisted Bow', price: 90.0, category: 'Pure' },
    { name: 'Parsec - Pure - Armadyl Crossbow', price: 100.0, category: 'Pure' },

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
