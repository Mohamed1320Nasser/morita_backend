import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { discordApiClient } from "../clients/DiscordApiClient";
import { unwrapApiData } from "../utils/apiResponse.util";
import { applyBrandThumbnail, applyCalculatorBranding } from "../utils/priceEmbed";
import logger from "../../common/loggers";

/** Public subset of ReferralRewardConfig served by GET /referral-reward/config. */
export interface PublicReferralConfig {
    isEnabled: boolean;
    rewardMode: "PER_REFERRAL" | "MILESTONE" | "HYBRID";
    perReferralEnabled: boolean;
    perReferralAmount: number;
    milestonesEnabled: boolean;
    milestones: Array<{ count: number; reward: number }>;
    requireOnboarding: boolean;
    minimumDaysInServer: number;
    notifyDiscord: boolean;
    notifyDM: boolean;
    currencyName: string;
    orderRewardEnabled?: boolean;
    orderRewardType?: "FIXED" | "PERCENTAGE";
    orderRewardValue?: number;
    orderRewardMaxPerOrder?: number;
    orderRewardMinOrderValue?: number;
    orderRewardOrderCount?: number;
    orderRewardWindowDays?: number;
    orderRewardHoldDays?: number;
}

/** Join reward paid: returned by POST /referral/reward and inside /referral/process-pending. */
export interface ReferralPayout {
    status: "PAID";
    kind?: "JOIN";
    referralId: string;
    referrerDiscordId: string;
    referredDiscordId: string;
    amount: number;
    perReferralAmount: number;
    milestoneBonus: number;
    milestonesReached: number[];
    qualifiedReferrals: number;
    currencyName: string;
    notifyDM: boolean;
    notifyDiscord: boolean;
}

/** Order reward paid: inside /referral/process-pending. */
export interface ReferralOrderPayout {
    status: "PAID";
    kind: "ORDER";
    referrerDiscordId: string;
    referredDiscordId: string;
    orderNumber: number;
    orderValue: number;
    rewardType: "FIXED" | "PERCENTAGE";
    rewardValue: number;
    amount: number;
    currencyName: string;
    notifyDM: boolean;
    notifyDiscord: boolean;
}

export type AnyReferralPayout = ReferralPayout | ReferralOrderPayout;

/**
 * e.g. { main: "5% of their first order", details: "max $20.00 per order · orders from $10.00 · paid 7 days after the order completes" },
 * or null when order rewards are off.
 */
export function describeOrderReward(config: PublicReferralConfig): { main: string; details: string } | null {
    if (!config.orderRewardEnabled || !(Number(config.orderRewardValue) > 0)) return null;

    const n = config.orderRewardOrderCount || 1;
    const which = n === 1 ? "their first order" : `each of their first ${n} orders`;
    const value = Number(config.orderRewardValue);

    const main = config.orderRewardType === "FIXED"
        ? `${formatMoney(config.currencyName, value)} on ${which}`
        : `${value}% of ${which}`;

    const details: string[] = [];
    if (config.orderRewardType !== "FIXED" && Number(config.orderRewardMaxPerOrder) > 0) {
        details.push(`max ${formatMoney(config.currencyName, Number(config.orderRewardMaxPerOrder))} per order`);
    }
    if (Number(config.orderRewardMinOrderValue) > 0) {
        details.push(`orders from ${formatMoney(config.currencyName, Number(config.orderRewardMinOrderValue))}`);
    }
    if (Number(config.orderRewardWindowDays) > 0) {
        details.push(`within ${config.orderRewardWindowDays} days of joining`);
    }
    const hold = Number(config.orderRewardHoldDays) || 0;
    details.push(hold > 0 ? `paid ${hold} day${hold === 1 ? "" : "s"} after the order completes` : "paid when the order completes");

    return { main, details: details.join(" · ") };
}

export async function fetchReferralConfig(): Promise<PublicReferralConfig | null> {
    try {
        const response = await discordApiClient.get("/referral-reward/config");
        return unwrapApiData<PublicReferralConfig>(response) || null;
    } catch (error: any) {
        logger.warn(`[ReferralNotifier] Could not fetch referral config: ${error?.message}`);
        return null;
    }
}

export function formatMoney(currency: string, amount: number) {
    return `${currency || "$"}${Number(amount || 0).toFixed(2)}`;
}

/** What a referrer earns per qualified referral under the current mode, or null if nothing fixed. */
export function perReferralReward(config: PublicReferralConfig): number | null {
    const paysPerReferral =
        (config.rewardMode === "PER_REFERRAL" || config.rewardMode === "HYBRID") &&
        config.perReferralEnabled &&
        Number(config.perReferralAmount) > 0;
    return paysPerReferral ? Number(config.perReferralAmount) : null;
}

/** Human description of when a referral pays, e.g. "completes onboarding and stays 7 days". */
export function describeRequirement(config: PublicReferralConfig, name = "they") {
    const parts: string[] = [];
    if (config.requireOnboarding) parts.push(`${name} complete${name === "they" ? "" : "s"} onboarding`);
    if (config.minimumDaysInServer > 0) {
        parts.push(`stay${name === "they" ? "" : "s"} ${config.minimumDaysInServer} day${config.minimumDaysInServer === 1 ? "" : "s"}`);
    }
    return parts.length > 0 ? parts.join(" and ") : `${name} join${name === "they" ? "" : "s"}`;
}

function referralChannel(client: Client): TextChannel | null {
    const channelId = process.env.DISCORD_REFERRAL_CHANNEL_ID;
    if (!channelId) return null;
    const channel = client.channels.cache.get(channelId);
    return channel && channel.isTextBased() ? (channel as TextChannel) : null;
}

/**
 * Announces a paid referral according to the admin's notifyDM / notifyDiscord
 * settings. Zero-amount qualifications (MILESTONE mode, no milestone hit) are
 * not announced.
 */
export async function notifyReferralPayout(client: Client, payout: AnyReferralPayout) {
    if (!payout || payout.status !== "PAID" || payout.amount <= 0) return;
    if (payout.kind === "ORDER") return notifyOrderPayout(client, payout);

    const amount = formatMoney(payout.currencyName, payout.amount);
    const milestoneText =
        payout.milestonesReached.length > 0
            ? ` including a **${formatMoney(payout.currencyName, payout.milestoneBonus)}** bonus for reaching ` +
              `${payout.milestonesReached.join(", ")} referrals`
            : "";

    if (payout.notifyDM) {
        try {
            const referrer = await client.users.fetch(payout.referrerDiscordId);
            await referrer.send(
                `💰 You earned **${amount}** because <@${payout.referredDiscordId}> qualified as your referral` +
                    `${milestoneText}! It has been added to your wallet.`
            );
        } catch (error: any) {
            logger.warn(`[ReferralNotifier] Could not DM referrer ${payout.referrerDiscordId}: ${error?.message}`);
        }
    }

    if (payout.notifyDiscord) {
        const channel = referralChannel(client);
        if (channel) {
            try {
                const embed = new EmbedBuilder()
                    .setColor(0x22c55e)
                    .setTitle("💰 Referral Reward Paid")
                    .setDescription(
                        `<@${payout.referrerDiscordId}> earned **${amount}** for referring <@${payout.referredDiscordId}>` +
                            `${milestoneText}.`
                    )
                    .addFields({ name: "Qualified Referrals", value: String(payout.qualifiedReferrals), inline: true })
                    .setTimestamp();

                applyBrandThumbnail(embed);
                applyCalculatorBranding(embed);

                await channel.send({ embeds: [embed.toJSON() as any] });
            } catch (error: any) {
                logger.warn(`[ReferralNotifier] Could not post payout to referral channel: ${error?.message}`);
            }
        }
    }
}

async function notifyOrderPayout(client: Client, payout: ReferralOrderPayout) {
    const amount = formatMoney(payout.currencyName, payout.amount);
    const basis = payout.rewardType === "PERCENTAGE"
        ? ` (${payout.rewardValue}% of ${formatMoney(payout.currencyName, payout.orderValue)})`
        : "";

    if (payout.notifyDM) {
        try {
            const referrer = await client.users.fetch(payout.referrerDiscordId);
            await referrer.send(
                `🛒 You earned **${amount}**${basis} because <@${payout.referredDiscordId}>, who you referred, ` +
                    `completed order **#${payout.orderNumber}**! It has been added to your wallet.`
            );
        } catch (error: any) {
            logger.warn(`[ReferralNotifier] Could not DM referrer ${payout.referrerDiscordId}: ${error?.message}`);
        }
    }

    if (payout.notifyDiscord) {
        const channel = referralChannel(client);
        if (channel) {
            try {
                const embed = new EmbedBuilder()
                    .setColor(0x22c55e)
                    .setTitle("🛒 Referral Order Reward Paid")
                    .setDescription(
                        `<@${payout.referrerDiscordId}> earned **${amount}**${basis} from an order by ` +
                            `<@${payout.referredDiscordId}>.`
                    )
                    .setTimestamp();

                applyBrandThumbnail(embed);
                applyCalculatorBranding(embed);

                await channel.send({ embeds: [embed.toJSON() as any] });
            } catch (error: any) {
                logger.warn(`[ReferralNotifier] Could not post order payout to referral channel: ${error?.message}`);
            }
        }
    }
}

/**
 * Announces a newly tracked referral (member joined through someone's link).
 * Skipped entirely while rewards are disabled.
 */
export async function notifyReferralJoined(
    client: Client,
    params: { referrerDiscordId: string; memberId: string; memberTag: string; inviteCode: string }
) {
    const config = await fetchReferralConfig();
    if (!config || !config.isEnabled) return;

    const reward = perReferralReward(config);
    const requirement = describeRequirement(config);
    const orderText = describeOrderReward(config);
    let earnText = reward !== null
        ? `you'll earn **${formatMoney(config.currencyName, reward)}** once ${requirement}`
        : `it counts toward your referral milestones once ${requirement}`;
    if (orderText) earnText += `, plus **${orderText.main}** they place`;

    if (config.notifyDiscord) {
        const channel = referralChannel(client);
        if (channel) {
            try {
                const embed = new EmbedBuilder()
                    .setColor(0xfca311)
                    .setTitle("🎉 New Referral!")
                    .setDescription(`<@${params.referrerDiscordId}> referred <@${params.memberId}>`)
                    .addFields(
                        { name: "New Member", value: params.memberTag, inline: true },
                        { name: "Invite Code", value: `\`${params.inviteCode}\``, inline: true }
                    )
                    .setFooter({
                        text: reward !== null
                            ? `Reward: ${formatMoney(config.currencyName, reward)} once ${describeRequirement(config, "the member")}`
                            : `Counts toward milestones once ${describeRequirement(config, "the member")}`,
                    })
                    .setTimestamp();

                applyBrandThumbnail(embed);
                applyCalculatorBranding(embed);

                await channel.send({ embeds: [embed.toJSON() as any] });
            } catch (error: any) {
                logger.warn(`[ReferralNotifier] Could not post to referral channel: ${error?.message}`);
            }
        }
    }

    if (config.notifyDM) {
        try {
            const referrer = await client.users.fetch(params.referrerDiscordId);
            await referrer.send(`🎁 **${params.memberTag}** joined using your invite link! ${earnText[0].toUpperCase()}${earnText.slice(1)}.`);
        } catch (error: any) {
            logger.warn(`[ReferralNotifier] Could not DM referrer ${params.referrerDiscordId}: ${error?.message}`);
        }
    }
}
