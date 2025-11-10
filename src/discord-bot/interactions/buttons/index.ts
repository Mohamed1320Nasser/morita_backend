import { ButtonInteraction } from "discord.js";
import { Button } from "../../types/discord.types";
import logger from "../../../common/loggers";

// Import all button handlers
import { handleServiceSelect } from "./service-select.button";
import { handleMethodSelect } from "./method-select.button";
import { handleOrderConfirm } from "./order-confirm.button";
import { handleCalculatePrice } from "./calculate-price.button";
import { handleOrderNow } from "./order-now.button";
import { handleBackToServices } from "./back-to-services.button";
import { handleOpenTicket } from "./open-ticket.button";
import { handleCalculate } from "./calculate.button";
import { handleResetCalculator } from "./reset-calculator.button";
import { handleOrderFromPrice } from "./order-from-price.button";
import { handleRecalculate } from "./recalculate.button";
import { handleConfirmOrder } from "./confirm-order.button";
import { handleCancelOrder } from "./cancel-order.button";
import { handleAcceptOrder } from "./accept-order.button";
import { handleUpdateStatus } from "./update-status.button";
import { handleCompleteOrder } from "./complete-order.button";
import { handleCancelTicketOrder } from "./cancel-ticket-order.button";
import { handleHelpServices } from "./help-services.button";
import { handleHelpPricing } from "./help-pricing.button";
import { handleHelpOrders } from "./help-orders.button";
import { handleHelpSupport } from "./help-support.button";
// import { handleCategoryToggle } from "./pricing-category-toggle.button"; // DISABLED - old system
import { handleServiceDetails } from "./pricing-service-details.button";
import { handleAdminRefreshPricing } from "./admin-refresh-pricing.button";

// Button handler mapping
const buttonHandlers: {
    [key: string]: (interaction: ButtonInteraction) => Promise<void>;
} = {
    service_select: handleServiceSelect,
    method_select: handleMethodSelect,
    order_confirm: handleOrderConfirm,
    calculate_price: handleCalculatePrice,
    order_now: handleOrderNow,
    back_to_services: handleBackToServices,
    open_ticket: handleOpenTicket,
    calculate: handleCalculate,
    reset_calculator: handleResetCalculator,
    order_from_price: handleOrderFromPrice,
    recalculate: handleRecalculate,
    confirm_order: handleConfirmOrder,
    cancel_order: handleCancelOrder,
    accept_order: handleAcceptOrder,
    update_status: handleUpdateStatus,
    complete_order: handleCompleteOrder,
    cancel_ticket_order: handleCancelTicketOrder,
    help_services: handleHelpServices,
    help_pricing: handleHelpPricing,
    help_orders: handleHelpOrders,
    help_support: handleHelpSupport,
    // Pricing channel buttons
    // pricing_category_toggle: handleCategoryToggle, // DISABLED - old system
    pricing_service_details: handleServiceDetails,
    admin_refresh_pricing_channel: handleAdminRefreshPricing,
};

// Export button handlers as array for the main interaction handler
export default Object.entries(buttonHandlers).map(([customId, execute]) => ({
    customId,
    execute,
})) as Button[];

// Helper function to handle button interactions
export async function handleButtonInteraction(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        const customId = interaction.customId;

        // Check for exact match first
        if (buttonHandlers[customId]) {
            await buttonHandlers[customId](interaction);
            return;
        }

        // Check for pattern matches
        // Category toggle disabled - old system
        // if (
        //     customId.startsWith("pricing_category_") &&
        //     customId.endsWith("_toggle")
        // ) {
        //     await handleCategoryToggle(interaction);
        //     return;
        // }

        if (
            customId.startsWith("pricing_service_") &&
            customId.endsWith("_details")
        ) {
            await handleServiceDetails(interaction);
            return;
        }

        logger.warn(`No button handler found for: ${customId}`);
        await interaction.reply({
            content: "This button is not implemented yet.",
            ephemeral: true,
        });
    } catch (error) {
        logger.error("Error handling button interaction:", error);
        await interaction.reply({
            content: "An error occurred while processing this button.",
            ephemeral: true,
        });
    }
}
