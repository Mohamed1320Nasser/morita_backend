

export const COMMAND_EXAMPLES = {
  SKILLS: '!s agility 70-99',
  BOSSING: '!p cox 120',
  MINIGAMES: '!m barrows 100',
  IRONMAN: '!i amethyst 1000',
  QUEST_SINGLE: '!q desert treasure 1',
  QUEST_BATCH: '!q desert treasure 1, monkey madness, infernal cape',
} as const;

export const INVALID_FORMAT_ERRORS = {
  SKILLS: () =>
    `❌ **Invalid Command Format**\n\n` +
    `**Usage:** \`!s <service> <start-level>-<end-level>\`\n` +
    `**Example:** \`${COMMAND_EXAMPLES.SKILLS}\``,

  BOSSING: () =>
    `❌ **Invalid Command Format**\n\n` +
    `**Usage:** \`!p <boss-name> <kill-count>\`\n` +
    `**Example:** \`${COMMAND_EXAMPLES.BOSSING}\` or \`!p zulrah 100\``,

  MINIGAMES: () =>
    `❌ **Invalid Command Format**\n\n` +
    `**Usage:** \`!m <game-name> <count>\`\n` +
    `**Example:** \`${COMMAND_EXAMPLES.MINIGAMES}\``,

  IRONMAN: () =>
    `❌ **Invalid Command Format**\n\n` +
    `**Usage:** \`!i <item-name> <quantity>\`\n` +
    `**Example:** \`${COMMAND_EXAMPLES.IRONMAN}\``,

  QUEST: () =>
    `❌ **Invalid Command Format**\n\n` +
    `**Single Quest:** \`${COMMAND_EXAMPLES.QUEST_SINGLE}\`\n` +
    `**Multiple Quests:** \`${COMMAND_EXAMPLES.QUEST_BATCH}\``,
} as const;

export const INVALID_PARAMETER_ERRORS = {
  LEVEL_RANGE: () =>
    `❌ **Invalid Level Range**\n\n` +
    `Please specify levels in format: \`start-end\`\n` +
    `**Example:** \`70-99\``,

  LEVELS_OUT_OF_BOUNDS: () =>
    `❌ **Invalid Levels**\n\n` +
    `Levels must be between 1 and 99.`,

  LEVEL_RANGE_ORDER: () =>
    `❌ **Invalid Level Range**\n\n` +
    `Start level must be less than end level.`,

  KILL_COUNT: () =>
    `❌ **Invalid Kill Count**\n\n` +
    `Please specify a valid number of kills.\n` +
    `**Example:** \`100\``,

  COUNT: () =>
    `❌ **Invalid Count**\n\n` +
    `Please specify a valid number.\n` +
    `**Example:** \`100\``,

  QUANTITY: () =>
    `❌ **Invalid Quantity**\n\n` +
    `Please specify a valid number.\n` +
    `**Example:** \`1000\``,
} as const;

export const SERVICE_NOT_FOUND_ERRORS = {
  GENERIC: (serviceName: string) =>
    `❌ **Service Not Found**\n\n` +
    `Could not find a service matching "${serviceName}".\n\n` +
    `Use \`/services\` to see all available services.`,

  BOSSING: (serviceName: string) =>
    `❌ **Service Not Found**\n\n` +
    `Could not find a PvM service matching "${serviceName}".\n\n` +
    `Make sure the service supports kill-count pricing.\n` +
    `**Tip:** Try \`!p cox 120\` or \`!p zulrah 100\``,

  MINIGAMES: (serviceName: string) =>
    `❌ **Service Not Found**\n\n` +
    `Could not find a minigame service matching "${serviceName}".\n\n` +
    `Make sure the service supports per-item pricing.`,

  IRONMAN: (serviceName: string) =>
    `❌ **Ironman Service Not Found**\n\n` +
    `Could not find an Ironman gathering service matching "${serviceName}".\n\n` +
    `Available services: amethyst, ores-bars, charter-ship, chinchompas, farm-runs, raw-fish, herblore-secondaries, impling, logs-planks`,

  QUEST: (questNames: string[]) =>
    `❌ **No Quests Found**\n\n` +
    `Could not find any quests matching your search.\n\n` +
    `**Searched for:** ${questNames.join(', ')}`,
} as const;

export const CALCULATION_ERRORS = {
  GENERIC: () =>
    `❌ **Calculation Error**\n\n` +
    `An error occurred while calculating the price.\n\n` +
    `Please try another service or contact support.`,

  NO_PRICING_SUPPORT: () =>
    `❌ **Calculation Error**\n\n` +
    `An error occurred while calculating the price. ` +
    `This service may not support level-based pricing.\n\n` +
    `Please try another service or contact support.`,

  NO_PRICING_METHODS: () =>
    `❌ **No Pricing Methods**\n\n` +
    `This service does not have any pricing methods configured.\n\n` +
    `Please contact support.`,

  NO_PAYMENT_METHODS: () =>
    `❌ **No Payment Methods**\n\n` +
    `No payment methods are currently available.\n\n` +
    `Please contact support.`,
} as const;

export const STATUS_MESSAGES = {
  CALCULATING: '🔢 Calculating price...',
  FETCHING_QUOTE: '💰 Fetching price quote...',
  FETCHING_BATCH_QUOTE: (count: number) => `💰 Fetching quotes for ${count} quests...`,
  FETCHING_IRONMAN: '🔗 Calculating Ironman service price...',
} as const;

export const SUCCESS_MESSAGES = {
  QUEST_NOTE: () =>
    `ℹ️ **Note**\n` +
    `Price shown is base cost. Additional upcharges may apply based on account requirements.\n` +
    `Contact support for personalized quote!`,

  BATCH_QUEST_NOTE: () =>
    `📝 **Note**\n` +
    `Prices shown are base costs. Payment method upcharges may apply.\n` +
    `Contact support for detailed breakdown!`,
} as const;

export function formatNotFoundMessage(notFound: string[]): string {
  if (notFound.length === 0) {
    return '';
  }
  return `⚠️ Could not find: ${notFound.join(', ')}`;
}
