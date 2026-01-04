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
import { handleBackToCategory } from "./back-to-category.button";
import {
    handleOpenTicket,
    handleTicketCalculate,
    handleTicketClose,
} from "./open-ticket.button";
import { handleCreateTicket } from "./create-ticket.button";
import { handleCalculate } from "./calculate.button";
import { handleResetCalculator } from "./reset-calculator.button";
import { handleOrderFromPrice } from "./order-from-price.button";
import { handleRecalculate } from "./recalculate.button";
import { handleConfirmOrder } from "./confirm-order.button";
// REMOVED: Cancel order is now a command only (/cancel-order)
// import { handleCancelOrder } from "./cancel-order.button";
import { handleAcceptOrder } from "./accept-order.button";
import { handleUpdateStatus } from "./update-status.button";
import { handleCompleteOrder } from "./complete-order.button";
import { handleCancelTicketOrder } from "./cancel-ticket-order.button";
import { handleHelpServices } from "./help-services.button";
import { handleHelpPricing } from "./help-pricing.button";
import { handleHelpOrders } from "./help-orders.button";
import { handleHelpSupport } from "./help-support.button";
import { handleServiceDetails } from "./pricing-service-details.button";
import { handleAdminRefreshPricing } from "./admin-refresh-pricing.button";
import { handlePricingPagination } from "./pricing-pagination.button";
import { handleClaimJobButton } from "./claim-job.button";
import { handleConfirmCompleteButton } from "./confirm-complete.button";
import { handleReportIssueButton } from "./report-issue.button";
import { handleOrderInfoButton } from "./order-info.button";
import { handleStartWork } from "./start-work.button";
import { handleLeaveReviewButton } from "./leave-review.button";
import { handleConfirmCloseTicket, handleCancelCloseTicket } from "./confirm-close-ticket.button";
import { handleResolveIssueButton } from "./resolve-issue.button";

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
    // REMOVED: cancel_order button - now command only (/cancel-order)
    accept_order: handleAcceptOrder,
    update_status: handleUpdateStatus,
    complete_order: handleCompleteOrder,
    cancel_ticket_order: handleCancelTicketOrder,
    help_services: handleHelpServices,
    help_pricing: handleHelpPricing,
    help_orders: handleHelpOrders,
    help_support: handleHelpSupport,
    pricing_service_details: handleServiceDetails,
    admin_refresh_pricing_channel: handleAdminRefreshPricing,
};

// Export button handlers as array for the main interaction handler
export default Object.entries(buttonHandlers).map(([customId, execute]) => ({
    customId,
    execute,
})) as Button[];

// Global deduplication cache to prevent duplicate button executions
const processingInteractions = new Set<string>();

// Helper function to handle button interactions
export async function handleButtonInteraction(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        const customId = interaction.customId;
        const interactionKey = `${interaction.id}`;

        // Check if this interaction is already being processed
        if (processingInteractions.has(interactionKey)) {
            logger.warn(`[ButtonHandler] Duplicate execution prevented for ${customId}`);
            return;
        }

        // Mark as processing
        processingInteractions.add(interactionKey);

        // Auto-cleanup after 10 seconds
        setTimeout(() => processingInteractions.delete(interactionKey), 10000);

        // Check for exact match first
        if (buttonHandlers[customId]) {
            await buttonHandlers[customId](interaction);
            return;
        }

        // Check for pattern matches
        if (
            customId.startsWith("pricing_service_") &&
            customId.endsWith("_details")
        ) {
            await handleServiceDetails(interaction);
            return;
        }

        // Pricing pagination buttons
        if (customId.startsWith("pricing_prev_") || customId.startsWith("pricing_next_")) {
            await handlePricingPagination(interaction);
            return;
        }

        // Ticket buttons (with dynamic ticket ID)
        if (customId.startsWith("ticket_calculate_")) {
            await handleTicketCalculate(interaction);
            return;
        }

        if (customId.startsWith("ticket_close_")) {
            await handleTicketClose(interaction);
            return;
        }

        // Open ticket with service data
        if (customId.startsWith("open_ticket_")) {
            await handleOpenTicket(interaction);
            return;
        }

        // Recalculate buttons (including inticket variant)
        if (customId.startsWith("recalculate_")) {
            await handleRecalculate(interaction);
            return;
        }

        // Calculate price buttons (from pricing channel service details)
        if (customId.startsWith("calculate_price_")) {
            await handleCalculatePrice(interaction);
            return;
        }

        // Job claiming buttons
        if (customId.startsWith("claim_job_")) {
            await handleClaimJobButton(interaction);
            return;
        }

        // Order completion buttons
        if (customId.startsWith("confirm_complete_")) {
            await handleConfirmCompleteButton(interaction);
            return;
        }

        if (customId.startsWith("report_issue_")) {
            await handleReportIssueButton(interaction);
            return;
        }

        // Order channel buttons
        if (customId.startsWith("order_info_")) {
            await handleOrderInfoButton(interaction);
            return;
        }

        if (customId.startsWith("mark_complete_")) {
            await handleCompleteOrder(interaction);
            return;
        }

        // Start work button
        if (customId.startsWith("start_work_")) {
            await handleStartWork(interaction);
            return;
        }

        // Leave review button
        if (customId.startsWith("leave_review_")) {
            await handleLeaveReviewButton(interaction);
            return;
        }

        // Back to category button
        if (customId.startsWith("back_to_category_")) {
            await handleBackToCategory(interaction);
            return;
        }

        // Create ticket buttons (for all ticket types)
        if (customId.startsWith("create_ticket_")) {
            await handleCreateTicket(interaction);
            return;
        }

        // Confirm close ticket button (Support/Admin confirmation)
        if (customId.startsWith("confirm_close_ticket_")) {
            await handleConfirmCloseTicket(interaction);
            return;
        }

        // Cancel close ticket button (Support/Admin cancellation)
        if (customId.startsWith("cancel_close_ticket_")) {
            await handleCancelCloseTicket(interaction);
            return;
        }

        // Resolve issue buttons (Admin/Support issue resolution)
        if (customId.startsWith("resolve_approve_work_") ||
            customId.startsWith("resolve_corrections_") ||
            customId.startsWith("resolve_refund_")) {
            await handleResolveIssueButton(interaction);
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
