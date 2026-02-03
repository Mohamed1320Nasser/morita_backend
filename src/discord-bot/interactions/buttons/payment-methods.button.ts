import { ButtonInteraction, EmbedBuilder } from "discord.js";
import prisma from "../../../common/prisma/client";
import logger from "../../../common/loggers";

// Format payment details as code block with syntax highlighting
function formatPaymentBlock(type: string, details: Record<string, string>): string {
    const lines: string[] = [];

    switch (type) {
        case "PAYPAL":
            if (details.email) lines.push(`Email:      "${details.email}"`);
            if (details.paypalMe) lines.push(`PayPal.Me:  "paypal.me/${details.paypalMe}"`);
            break;

        case "ZELLE":
            if (details.email) lines.push(`Email:      "${details.email}"`);
            if (details.phone) lines.push(`Phone:      "${details.phone}"`);
            if (details.bankName) lines.push(`Bank:       "${details.bankName}"`);
            break;

        case "WISE":
            if (details.email) lines.push(`Email:      "${details.email}"`);
            if (details.accountHolder) lines.push(`Holder:     "${details.accountHolder}"`);
            break;

        case "REVOLUT":
            if (details.username) lines.push(`Username:   "${details.username}"`);
            if (details.phone) lines.push(`Phone:      "${details.phone}"`);
            break;

        case "E_TRANSFER":
            if (details.email) lines.push(`Email:      "${details.email}"`);
            if (details.securityQuestion) lines.push(`Question:   "${details.securityQuestion}"`);
            if (details.securityAnswer) lines.push(`Answer:     "${details.securityAnswer}"`);
            break;

        case "CASHAPP":
            if (details.cashtag) lines.push(`Cashtag:    "${details.cashtag}"`);
            break;

        case "VENMO":
            if (details.username) lines.push(`Username:   "${details.username}"`);
            break;

        case "OTHER":
            if (details.customLabel) lines.push(`${details.customLabel}:`);
            if (details.customValue) lines.push(`"${details.customValue}"`);
            break;

        default:
            for (const [key, value] of Object.entries(details)) {
                if (value) lines.push(`${key}:      "${value}"`);
            }
    }

    // Using yaml syntax for colored output (keys in one color, values in another)
    return lines.length > 0 ? `\`\`\`yaml\n${lines.join("\n")}\n\`\`\`` : "Contact support";
}

export async function handlePaymentMethods(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        // Fetch active payment options
        const paymentOptions = await prisma.manualPaymentOption.findMany({
            where: { isActive: true },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        });

        if (paymentOptions.length === 0) {
            await interaction.reply({
                content: "No payment methods are currently available. Please try cryptocurrency payments or contact support.",
                ephemeral: true,
            });
            return;
        }

        // Build embed with payment options
        const embed = new EmbedBuilder()
            .setTitle("💵 Payment Methods")
            .setDescription("Select a payment method and send to the address shown.")
            .setColor(0x57F287)
            .setTimestamp();

        // Add each payment option as a code block field
        for (const option of paymentOptions) {
            const icon = option.icon || "💳";
            const details = option.details as Record<string, string>;
            const formattedBlock = formatPaymentBlock(option.type, details);

            embed.addFields({
                name: `${icon} ${option.name}`,
                value: formattedBlock,
                inline: false,
            });
        }

        embed.setFooter({ text: "Open a ticket after payment with proof" });

        await interaction.reply({
            embeds: [embed.toJSON() as any],
            ephemeral: true,
        });

        logger.info(`[PaymentMethods] Payment methods info shown to ${interaction.user.tag}`);
    } catch (error) {
        logger.error("[PaymentMethods] Error:", error);
        await interaction.reply({
            content: "Failed to load payment methods. Please try again or contact support.",
            ephemeral: true,
        });
    }
}
