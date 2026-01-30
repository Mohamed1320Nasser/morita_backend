import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import {
    AccountCategory,
    AccountListItem,
    AccountDetail,
} from "./accountEmbedBuilder";

// Button custom IDs for account operations
export const ACCOUNT_BUTTON_IDS = {
    BROWSE_ACCOUNTS: "browse_accounts",
    BACK_TO_CATEGORIES: "account_back_categories",
    BACK_TO_LIST: "account_back_list",
    ACCOUNT_VIEW: "account_view_",           // + accountId
    ACCOUNT_SELECT: "account_select_",       // + accountId
    ACCOUNT_PURCHASE: "account_purchase_",   // + accountId
    ACCOUNT_CONFIRM: "account_confirm_",     // + accountId
    ACCOUNT_CANCEL: "account_cancel",
    ACCOUNT_PAGE: "account_page_",           // + category_page
    PAYMENT_SENT: "account_payment_sent_",   // + ticketId
    CANCEL_ORDER: "account_cancel_order_",   // + ticketId
    CONFIRM_DELIVERY: "account_confirm_delivery_", // + ticketId
    LEAVE_REVIEW: "account_leave_review_",   // + orderId
    CLOSE_TICKET: "account_close_ticket_",   // + ticketId
} as const;

// Select menu custom IDs
export const ACCOUNT_SELECT_IDS = {
    CATEGORY_SELECT: "account_category_select",
    ACCOUNT_SELECT: "account_select_menu",
    PAYMENT_SELECT: "account_payment_select",
} as const;

// Modal custom IDs
export const ACCOUNT_MODAL_IDS = {
    PAYMENT_PREFERENCE: "account_payment_modal",
    DELIVERY_CREDENTIALS: "account_delivery_modal",
    CANCEL_REASON: "account_cancel_reason_modal",
} as const;

export class AccountComponentBuilder {
    /**
     * Create the main "Browse Accounts" button for shop message
     */
    static createBrowseAccountsButton(): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(ACCOUNT_BUTTON_IDS.BROWSE_ACCOUNTS)
                .setLabel("🛒 Browse Accounts")
                .setStyle(ButtonStyle.Primary)
        );
    }

    /**
     * Create category selection dropdown
     */
    static createCategorySelectMenu(
        categories: AccountCategory[]
    ): ActionRowBuilder<StringSelectMenuBuilder> {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(ACCOUNT_SELECT_IDS.CATEGORY_SELECT)
            .setPlaceholder("Select account type...")
            .setMinValues(1)
            .setMaxValues(1);

        // Filter to only show categories with available accounts
        const availableCategories = categories.filter(cat => cat.availableCount > 0);

        if (availableCategories.length === 0) {
            // Add a disabled option if no categories available
            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel("No accounts available")
                    .setDescription("Please check back later")
                    .setValue("none")
                    .setEmoji("❌")
            );
            selectMenu.setDisabled(true);
        } else {
            availableCategories.forEach(category => {
                selectMenu.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(category.label)
                        .setDescription(`${category.availableCount} available`)
                        .setValue(category.category)
                        .setEmoji(category.emoji)
                );
            });
        }

        return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
    }

    /**
     * Create account selection dropdown for a category
     */
    static createAccountSelectMenu(
        accounts: AccountListItem[]
    ): ActionRowBuilder<StringSelectMenuBuilder> {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(ACCOUNT_SELECT_IDS.ACCOUNT_SELECT)
            .setPlaceholder("Select an account to view details...")
            .setMinValues(1)
            .setMaxValues(1);

        if (accounts.length === 0) {
            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel("No accounts available")
                    .setDescription("Please check another category")
                    .setValue("none")
                    .setEmoji("❌")
            );
            selectMenu.setDisabled(true);
        } else {
            accounts.slice(0, 25).forEach(account => {
                const statsText = this.formatAccountStats(account.stats);
                const description = statsText
                    ? `$${account.price.toFixed(2)} • ${statsText}`
                    : `$${account.price.toFixed(2)}`;

                selectMenu.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(account.name.slice(0, 100))
                        .setDescription(description.slice(0, 100))
                        .setValue(account.id)
                        .setEmoji("🎮")
                );
            });
        }

        return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
    }

    /**
     * Create pagination buttons for account list
     * Returns null if totalItems <= 5 (no pagination needed)
     */
    static createPaginationButtons(
        category: string,
        currentPage: number,
        totalPages: number,
        totalItems: number = 0
    ): ActionRowBuilder<ButtonBuilder> | null {
        // If 5 or fewer items, only show back to categories button
        if (totalItems <= 5) {
            return new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(ACCOUNT_BUTTON_IDS.BACK_TO_CATEGORIES)
                    .setLabel("← Back to Categories")
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        const row = new ActionRowBuilder<ButtonBuilder>();

        // Back to categories button
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(ACCOUNT_BUTTON_IDS.BACK_TO_CATEGORIES)
                .setLabel("← Categories")
                .setStyle(ButtonStyle.Secondary)
        );

        // Previous page
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`${ACCOUNT_BUTTON_IDS.ACCOUNT_PAGE}${category}_${currentPage - 1}`)
                .setLabel("◀ Prev")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage <= 1)
        );

        // Page indicator
        row.addComponents(
            new ButtonBuilder()
                .setCustomId("page_indicator")
                .setLabel(`${currentPage}/${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );

        // Next page
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`${ACCOUNT_BUTTON_IDS.ACCOUNT_PAGE}${category}_${currentPage + 1}`)
                .setLabel("Next ▶")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage >= totalPages)
        );

        return row;
    }

    /**
     * Create account detail view buttons
     */
    static createAccountDetailButtons(
        accountId: string,
        category: string
    ): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`${ACCOUNT_BUTTON_IDS.ACCOUNT_PURCHASE}${accountId}`)
                .setLabel("🛒 Purchase This Account")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`${ACCOUNT_BUTTON_IDS.BACK_TO_LIST}_${category}`)
                .setLabel("← Back to List")
                .setStyle(ButtonStyle.Secondary)
        );
    }

    /**
     * Create purchase confirmation buttons
     */
    static createPurchaseConfirmButtons(
        accountId: string
    ): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`${ACCOUNT_BUTTON_IDS.ACCOUNT_CONFIRM}${accountId}`)
                .setLabel("✅ Confirm Purchase")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(ACCOUNT_BUTTON_IDS.ACCOUNT_CANCEL)
                .setLabel("❌ Cancel")
                .setStyle(ButtonStyle.Danger)
        );
    }

    /**
     * Create payment method selection dropdown
     */
    static createPaymentSelectMenu(
        paymentMethods: Array<{ id: string; name: string; type: string }>
    ): ActionRowBuilder<StringSelectMenuBuilder> {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(ACCOUNT_SELECT_IDS.PAYMENT_SELECT)
            .setPlaceholder("Select payment method...")
            .setMinValues(1)
            .setMaxValues(1);

        paymentMethods.forEach(method => {
            const emoji = method.type === 'CRYPTO' ? '💎' : '💳';
            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(method.name)
                    .setDescription(`${method.type === 'CRYPTO' ? 'Cryptocurrency' : 'Standard Payment'}`)
                    .setValue(method.id)
                    .setEmoji(emoji)
            );
        });

        return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
    }

    /**
     * Create ticket action buttons (customer view)
     */
    static createTicketCustomerButtons(
        ticketId: string,
        status: 'awaiting_payment' | 'payment_sent' | 'processing'
    ): ActionRowBuilder<ButtonBuilder> {
        const row = new ActionRowBuilder<ButtonBuilder>();

        if (status === 'awaiting_payment') {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`${ACCOUNT_BUTTON_IDS.PAYMENT_SENT}${ticketId}`)
                    .setLabel("💳 Payment Sent")
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`${ACCOUNT_BUTTON_IDS.CANCEL_ORDER}${ticketId}`)
                    .setLabel("❌ Cancel Order")
                    .setStyle(ButtonStyle.Danger)
            );
        } else if (status === 'payment_sent') {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId("payment_processing")
                    .setLabel("⏳ Processing Payment...")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );
        }

        return row;
    }

    /**
     * Create ticket action buttons (staff view)
     */
    static createTicketStaffButtons(
        ticketId: string,
        accountId: string
    ): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`account_confirm_payment_${ticketId}`)
                .setLabel("✅ Confirm Payment")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`account_deliver_${ticketId}_${accountId}`)
                .setLabel("📦 Deliver Account")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`account_release_${accountId}`)
                .setLabel("🔓 Release Account")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`${ACCOUNT_BUTTON_IDS.CANCEL_ORDER}${ticketId}`)
                .setLabel("❌ Cancel & Refund")
                .setStyle(ButtonStyle.Danger)
        );
    }

    /**
     * Create post-delivery buttons
     */
    static createPostDeliveryButtons(
        orderId: string,
        ticketId: string
    ): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`${ACCOUNT_BUTTON_IDS.LEAVE_REVIEW}${orderId}`)
                .setLabel("⭐ Leave Review")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`${ACCOUNT_BUTTON_IDS.CLOSE_TICKET}${ticketId}`)
                .setLabel("📋 Close Ticket")
                .setStyle(ButtonStyle.Secondary)
        );
    }

    /**
     * Create account delivery credentials modal
     */
    static createDeliveryCredentialsModal(
        ticketId: string,
        accountName: string
    ): ModalBuilder {
        const modal = new ModalBuilder()
            .setCustomId(`${ACCOUNT_MODAL_IDS.DELIVERY_CREDENTIALS}_${ticketId}`)
            .setTitle("Deliver Account Credentials");

        const emailInput = new TextInputBuilder()
            .setCustomId("account_email")
            .setLabel("Email/Username")
            .setPlaceholder("Enter the account email or username")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(255);

        const passwordInput = new TextInputBuilder()
            .setCustomId("account_password")
            .setLabel("Password")
            .setPlaceholder("Enter the account password")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        const bankPinInput = new TextInputBuilder()
            .setCustomId("account_bank_pin")
            .setLabel("Bank PIN (optional)")
            .setPlaceholder("Enter bank PIN if set")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(10);

        const additionalInfoInput = new TextInputBuilder()
            .setCustomId("account_additional_info")
            .setLabel("Additional Information (optional)")
            .setPlaceholder("Any other important info...")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(500);

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(emailInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(passwordInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(bankPinInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(additionalInfoInput)
        );

        return modal;
    }

    /**
     * Create cancel reason modal
     */
    static createCancelReasonModal(
        ticketId: string
    ): ModalBuilder {
        const modal = new ModalBuilder()
            .setCustomId(`${ACCOUNT_MODAL_IDS.CANCEL_REASON}_${ticketId}`)
            .setTitle("Cancel Order");

        const reasonInput = new TextInputBuilder()
            .setCustomId("cancel_reason")
            .setLabel("Reason for cancellation")
            .setPlaceholder("Please provide a reason for cancelling this order...")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(500);

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
        );

        return modal;
    }

    /**
     * Create cancel confirmation buttons
     */
    static createCancelConfirmButtons(
        ticketId: string
    ): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`account_confirm_cancel_${ticketId}`)
                .setLabel("Yes, Cancel Order")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`account_keep_order_${ticketId}`)
                .setLabel("No, Keep Order")
                .setStyle(ButtonStyle.Secondary)
        );
    }

    // ==================== Helper Methods ====================

    private static formatAccountStats(stats: any): string {
        if (!stats || Object.keys(stats).length === 0) return '';

        const parts: string[] = [];

        if (stats.combatLevel) parts.push(`CB ${stats.combatLevel}`);
        if (stats.totalLevel) parts.push(`Total ${stats.totalLevel}`);

        return parts.join(' • ');
    }
}
