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
import { EMOJIS } from "../constants/emojis";
import { MESSAGES } from "../constants/messages";
import {
    ServiceCategory,
    Service,
    PricingMethod,
    PaymentMethod,
} from "../types/discord.types";

export class ComponentBuilder {
    // Category selection menu
    static createCategorySelectMenu(
        categories: ServiceCategory[]
    ): ActionRowBuilder<StringSelectMenuBuilder> {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId("category_select")
            .setPlaceholder(MESSAGES.SELECT_CATEGORY)
            .setMinValues(1)
            .setMaxValues(1);

        // Discord limit: max 25 options
        const limitedCategories = categories.slice(0, 25);

        limitedCategories.forEach(category => {
            // Discord limits: label 100 chars, description 100 chars, value 100 chars
            const label = category.name.length > 100
                ? category.name.substring(0, 97) + "..."
                : category.name;

            const description = category.description
                ? (category.description.length > 100
                    ? category.description.substring(0, 97) + "..."
                    : category.description)
                : "Click to view services";

            const value = category.id.length > 100
                ? category.id.substring(0, 100)
                : category.id;

            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(label)
                    .setDescription(description)
                    .setValue(value)
                    .setEmoji(category.emoji || EMOJIS.SERVICE)
            );
        });

        return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            selectMenu
        );
    }

    // Service selection menu
    static createServiceSelectMenu(
        services: Service[]
    ): ActionRowBuilder<StringSelectMenuBuilder> {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId("service_select")
            .setPlaceholder(MESSAGES.SELECT_SERVICE)
            .setMinValues(1)
            .setMaxValues(1);

        // Discord limit: max 25 options
        const limitedServices = services.slice(0, 25);

        limitedServices.forEach(service => {
            // Discord limits: label 100 chars, description 100 chars, value 100 chars
            const label = service.name.length > 100
                ? service.name.substring(0, 97) + "..."
                : service.name;

            const description = service.description
                ? (service.description.length > 100
                    ? service.description.substring(0, 97) + "..."
                    : service.description)
                : "Click to view details";

            const value = service.id.length > 100
                ? service.id.substring(0, 100)
                : service.id;

            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(label)
                    .setDescription(description)
                    .setValue(value)
                    .setEmoji(service.emoji || EMOJIS.SERVICE)
            );
        });

        return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            selectMenu
        );
    }

    // Pricing method selection menu
    static createMethodSelectMenu(
        methods: PricingMethod[]
    ): ActionRowBuilder<StringSelectMenuBuilder> {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId("method_select")
            .setPlaceholder(MESSAGES.SELECT_METHOD)
            .setMinValues(1)
            .setMaxValues(1);

        // Discord limit: max 25 options
        const limitedMethods = methods.slice(0, 25);

        limitedMethods.forEach(method => {
            const unitText =
                method.pricingUnit === "FIXED"
                    ? ""
                    : ` (${method.pricingUnit})`;

            // Discord limits: label 100 chars, description 100 chars, value 100 chars
            const labelText = `${method.name} - $${method.basePrice}${unitText}`;
            const label = labelText.length > 100
                ? labelText.substring(0, 97) + "..."
                : labelText;

            const description = method.description
                ? (method.description.length > 100
                    ? method.description.substring(0, 97) + "..."
                    : method.description)
                : "Select this pricing method";

            const value = method.id.length > 100
                ? method.id.substring(0, 100)
                : method.id;

            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(label)
                    .setDescription(description)
                    .setValue(value)
                    .setEmoji(EMOJIS.PRICE)
            );
        });

        return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            selectMenu
        );
    }

    // Payment method selection menu
    static createPaymentSelectMenu(
        paymentMethods: PaymentMethod[]
    ): ActionRowBuilder<StringSelectMenuBuilder> {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId("payment_select")
            .setPlaceholder(MESSAGES.SELECT_PAYMENT)
            .setMinValues(1)
            .setMaxValues(1);

        // Discord limit: max 25 options
        const limitedPaymentMethods = paymentMethods.slice(0, 25);

        limitedPaymentMethods.forEach(method => {
            const emoji =
                method.type === "CRYPTO" ? EMOJIS.CRYPTO : EMOJIS.CREDIT_CARD;

            // Discord limits: label 100 chars, description 100 chars, value 100 chars
            const label = method.name.length > 100
                ? method.name.substring(0, 97) + "..."
                : method.name;

            const descriptionText = `${method.type} payment method`;
            const description = descriptionText.length > 100
                ? descriptionText.substring(0, 97) + "..."
                : descriptionText;

            const value = method.id.length > 100
                ? method.id.substring(0, 100)
                : method.id;

            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(label)
                    .setDescription(description)
                    .setValue(value)
                    .setEmoji(emoji)
            );
        });

        return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            selectMenu
        );
    }

    // Service action buttons
    static createServiceActionButtons(): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId("calculate_price")
                .setLabel("Calculate Price")
                .setEmoji(EMOJIS.CALCULATE)
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("order_now")
                .setLabel("Order Now")
                .setEmoji(EMOJIS.ORDER)
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("back_to_services")
                .setLabel("Back to Services")
                .setEmoji(EMOJIS.BACK)
                .setStyle(ButtonStyle.Secondary)
        );
    }

    // Pricing calculator buttons
    static createPricingButtons(): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId("calculate")
                .setLabel("Calculate")
                .setEmoji(EMOJIS.CALCULATE)
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("reset_calculator")
                .setLabel("Reset")
                .setEmoji(EMOJIS.REFRESH)
                .setStyle(ButtonStyle.Secondary)
        );
    }

    // Price breakdown buttons
    static createPriceBreakdownButtons(): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId("order_from_price")
                .setLabel("Order Now")
                .setEmoji(EMOJIS.ORDER)
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("recalculate")
                .setLabel("Recalculate")
                .setEmoji(EMOJIS.REFRESH)
                .setStyle(ButtonStyle.Secondary)
        );
    }

    // Order confirmation buttons
    static createOrderConfirmationButtons(): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId("confirm_order")
                .setLabel("Confirm Order")
                .setEmoji(EMOJIS.CONFIRM)
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("cancel_order")
                .setLabel("Cancel Order")
                .setEmoji(EMOJIS.CANCEL)
                .setStyle(ButtonStyle.Danger)
        );
    }

    // Ticket action buttons
    static createTicketActionButtons(): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId("accept_order")
                .setLabel("Accept Order")
                .setEmoji(EMOJIS.CONFIRM)
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("update_status")
                .setLabel("Update Status")
                .setEmoji(EMOJIS.EDIT)
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("complete_order")
                .setLabel("Complete Order")
                .setEmoji(EMOJIS.SUCCESS)
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("cancel_ticket_order")
                .setLabel("Cancel Order")
                .setEmoji(EMOJIS.CANCEL)
                .setStyle(ButtonStyle.Danger)
        );
    }

    // Navigation buttons
    static createNavigationButtons(): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId("back_to_services")
                .setLabel("Back to Services")
                .setEmoji(EMOJIS.BACK)
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("open_ticket")
                .setLabel("Open a Ticket")
                .setEmoji(EMOJIS.TICKET)
                .setStyle(ButtonStyle.Primary)
        );
    }

    // Order details modal
    static createOrderDetailsModal(): ModalBuilder {
        const modal = new ModalBuilder()
            .setCustomId("order_details_modal")
            .setTitle(MESSAGES.ORDER_TITLE);

        // OSRS Username input
        const osrsUsernameInput = new TextInputBuilder()
            .setCustomId("osrs_username")
            .setLabel(MESSAGES.OSRS_USERNAME)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50)
            .setPlaceholder("Enter your OSRS username");

        // Discord Tag input
        const discordTagInput = new TextInputBuilder()
            .setCustomId("discord_tag")
            .setLabel(MESSAGES.DISCORD_TAG)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50)
            .setPlaceholder("Your Discord username#1234");

        // Special Notes input
        const specialNotesInput = new TextInputBuilder()
            .setCustomId("special_notes")
            .setLabel(MESSAGES.SPECIAL_NOTES)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(500)
            .setPlaceholder("Any special requirements or notes...");

        // Add inputs to modal
        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                osrsUsernameInput
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                discordTagInput
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                specialNotesInput
            )
        );

        return modal;
    }

    // Modifier toggle buttons (for pricing calculator)
    static createModifierButtons(
        modifiers: any[]
    ): ActionRowBuilder<ButtonBuilder>[] {
        const rows: ActionRowBuilder<ButtonBuilder>[] = [];
        const buttonsPerRow = 3;

        for (let i = 0; i < modifiers.length; i += buttonsPerRow) {
            const row = new ActionRowBuilder<ButtonBuilder>();

            for (
                let j = 0;
                j < buttonsPerRow && i + j < modifiers.length;
                j++
            ) {
                const modifier = modifiers[i + j];
                const button = new ButtonBuilder()
                    .setCustomId(`modifier_${modifier.id}`)
                    .setLabel(
                        `${modifier.name} (${modifier.value}${modifier.modifierType === "PERCENTAGE" ? "%" : ""})`
                    )
                    .setEmoji(EMOJIS.CHECKBOX_EMPTY)
                    .setStyle(ButtonStyle.Secondary);

                row.addComponents(button);
            }

            rows.push(row);
        }

        return rows;
    }

    // Help buttons
    static createHelpButtons(): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId("help_services")
                .setLabel("Services Help")
                .setEmoji(EMOJIS.SERVICE)
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("help_pricing")
                .setLabel("Pricing Help")
                .setEmoji(EMOJIS.PRICE)
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("help_orders")
                .setLabel("Orders Help")
                .setEmoji(EMOJIS.ORDER)
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("help_support")
                .setLabel("Support")
                .setEmoji(EMOJIS.SUPPORT)
                .setStyle(ButtonStyle.Secondary)
        );
    }
}
