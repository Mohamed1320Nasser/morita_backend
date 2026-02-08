import { Service } from "typedi";
import { EmbedBuilder, TextChannel } from "discord.js";
import { discordClient } from "../clients/DiscordClient";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";

@Service()
export default class CryptoNotificationService {
  constructor() {}

  async sendTransactionNotification(transaction: any, wallet: any) {
    try {
      // Check if notification channel is configured
      if (!discordConfig.cryptoNotificationChannelId) {
        logger.error(
          "[CryptoNotification] ⚠️  CRYPTO_NOTIFICATION_CHANNEL_ID not configured in environment"
        );
        return;
      }

      // Get the Discord channel
      const channel = await discordClient.channels.fetch(
        discordConfig.cryptoNotificationChannelId
      );

      if (!channel || !channel.isTextBased()) {
        logger.error(
          "[CryptoNotification] Invalid notification channel configured"
        );
        return;
      }

      // Format amount with proper decimals
      const formattedAmount = parseFloat(transaction.amount).toFixed(8);

      // Build embed
      const embed = new EmbedBuilder()
        .setTitle("💰 New Crypto Payment Received!")
        .setColor(0x00ff00) // Green
        .setTimestamp()
        .addFields(
          {
            name: "💵 Amount Received",
            value: `\`\`\`${formattedAmount} ${transaction.currency}\`\`\``,
            inline: false,
          },
          {
            name: "≈ USD Value",
            value: transaction.amountUsd
              ? `**$${parseFloat(transaction.amountUsd).toFixed(2)}**`
              : "N/A",
            inline: true,
          },
          {
            name: "🪙 Currency",
            value: `**${transaction.currency}**`,
            inline: true,
          },
          {
            name: "🔢 Confirmations",
            value: `**${transaction.confirmations}**`,
            inline: true,
          },
          {
            name: "📍 Our Wallet",
            value: `\`${this.truncateAddress(wallet.address)}\`\n*${wallet.name}*`,
            inline: false,
          },
          {
            name: "📤 Sender",
            value: `\`${this.truncateAddress(transaction.fromAddress)}\``,
            inline: false,
          },
          {
            name: "🔗 Transaction ID",
            value: `\`${this.truncateAddress(transaction.txHash)}\``,
            inline: false,
          }
        );

      // Add explorer link
      const explorerUrl = this.getExplorerUrl(
        wallet.network,
        transaction.txHash
      );
      embed.addFields({
        name: "🌐 View on Explorer",
        value: `[Click Here](${explorerUrl})`,
        inline: false,
      });

      // Add timestamp if available
      if (transaction.transactionTime) {
        const timestamp = Math.floor(
          new Date(transaction.transactionTime).getTime() / 1000
        );
        embed.addFields({
          name: "🕐 Transaction Time",
          value: `<t:${timestamp}:F>`,
          inline: false,
        });
      }

      // Send message
      const message = await (channel as TextChannel).send({
        embeds: [embed],
      });

      logger.info(
        `[CryptoNotification] ✅ Sent notification for ${formattedAmount} ${transaction.currency}`
      );

      return message.id;
    } catch (error: any) {
      logger.error(
        "[CryptoNotification] ❌ Error sending notification:",
        error.message
      );
      throw error;
    }
  }

  private truncateAddress(address: string): string {
    if (!address || address.length < 20) return address;
    return `${address.slice(0, 10)}...${address.slice(-8)}`;
  }

  private getExplorerUrl(network: string, txHash: string): string {
    const explorers: Record<string, string> = {
      bitcoin: `https://blockchair.com/bitcoin/transaction/${txHash}`,
      litecoin: `https://blockchair.com/litecoin/transaction/${txHash}`,
      ethereum: `https://blockchair.com/ethereum/transaction/${txHash}`,
      solana: `https://blockchair.com/solana/transaction/${txHash}`,
      ripple: `https://blockchair.com/ripple/transaction/${txHash}`,
    };
    return explorers[network] || `https://blockchair.com`;
  }
}
