import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { discordApiClient } from "../clients/DiscordApiClient";
import logger from "../../common/loggers";
import { applyBrandThumbnail, applyCalculatorBranding } from "../utils/priceEmbed";

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Nudges members who joined a while ago and have never claimed the daily
 * reward.
 *
 * Who is due is worked out by the API on every tick rather than held in
 * memory, so a bot restart never loses a pending reminder. Each member is
 * marked once they have been told, so nobody is nudged twice.
 */
export class DailyRewardReminderService {
    private client: Client;
    private checkInterval: NodeJS.Timeout | null = null;

    constructor(client: Client) {
        this.client = client;
    }

    start(): void {
        logger.info("[DailyRewardReminder] Starting service");

        // No run at boot: a restart would otherwise start a fresh pass every
        // time, which is how the same member ends up reminded twice. The first
        // check happens one interval in.
        this.checkInterval = setInterval(() => {
            this.sendPendingReminders();
        }, CHECK_INTERVAL_MS);
    }

    stop(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        logger.info("[DailyRewardReminder] Stopped");
    }

    private buildEmbed(currencyEmoji: string, currencyName: string): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setTitle(`${currencyEmoji} Don't forget your daily reward!`)
            .setDescription(
                `You have not claimed your daily ${currencyName} yet.\n\n` +
                `Type **\`!daily\`** in the server to collect it — you can claim again every day.`
            )
            .setColor(0xfca311)
            .setTimestamp();

        applyBrandThumbnail(embed);
        return applyCalculatorBranding(embed);
    }

    async sendPendingReminders(): Promise<void> {
        try {
            const response: any = await discordApiClient.get("/daily-reward/pending-reminders");
            const data = response?.data?.data || response?.data || response;

            if (!data?.enabled || !Array.isArray(data.users) || data.users.length === 0) {
                return;
            }

            const embed = this.buildEmbed(
                data.currencyEmoji || "🪙",
                data.currencyName || "reward"
            );

            const channel = data.channelId
                ? ((await this.client.channels.fetch(data.channelId).catch(() => null)) as
                      | TextChannel
                      | null)
                : null;

            const candidates = data.users
                .map((user: any) => user.discordId)
                .filter((id: any): id is string => Boolean(id));

            if (candidates.length === 0) {
                return;
            }

            // Claim these members before sending. If the mark fails, nothing has
            // gone out yet and the next tick retries cleanly; marking afterwards
            // would repeat the reminder on every tick whenever the write failed.
            const markResponse: any = await discordApiClient
                .post("/daily-reward/mark-reminded", { discordIds: candidates })
                .catch(err => {
                    logger.error(
                        `[DailyRewardReminder] Could not mark reminded, skipping this run: ${err.message}`
                    );
                    return null;
                });

            if (!markResponse) {
                return;
            }

            for (const user of data.users) {
                if (!user.discordId) continue;

                let delivered = false;

                // A public nudge reaches people who have DMs closed, which is a
                // large share of members.
                if (channel) {
                    await channel
                        .send({
                            content: `<@${user.discordId}>`,
                            embeds: [embed.toJSON() as any],
                        })
                        .then(() => {
                            delivered = true;
                        })
                        .catch(err =>
                            logger.warn(
                                `[DailyRewardReminder] Channel post failed for ${user.discordId}: ${err.message}`
                            )
                        );
                } else {
                    const member = await this.client.users
                        .fetch(user.discordId)
                        .catch(() => null);

                    if (member) {
                        await member
                            .send({ embeds: [embed.toJSON() as any] })
                            .then(() => {
                                delivered = true;
                            })
                            .catch(() =>
                                logger.info(
                                    `[DailyRewardReminder] DM closed for ${user.discordId}`
                                )
                            );
                    }
                }

                if (delivered) {
                    logger.info(`[DailyRewardReminder] Reminded ${user.discordId}`);
                }
            }

            logger.info(`[DailyRewardReminder] Processed ${candidates.length} reminder(s)`);
        } catch (error: any) {
            logger.error(`[DailyRewardReminder] Check failed: ${error?.message}`);
        }
    }
}

let instance: DailyRewardReminderService | null = null;

export function getDailyRewardReminderService(client: Client): DailyRewardReminderService {
    if (!instance) {
        instance = new DailyRewardReminderService(client);
    }
    return instance;
}

export default DailyRewardReminderService;
