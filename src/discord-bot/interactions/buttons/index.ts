import { ButtonInteraction } from "discord.js";
import { Button } from "../../types/discord.types";
import logger from "../../../common/loggers";

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

import acceptTosButton from "./accept-tos.button";
import continueOnboardingButton from "./continue-onboarding.button";
import retryOnboardingButton from "./retry-onboarding.button";

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

export default Object.entries(buttonHandlers).map(([customId, execute]) => ({
    customId,
    execute,
})) as Button[];

const processingInteractions = new Set<string>();

export async function handleButtonInteraction(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        const customId = interaction.customId;
        const interactionKey = `${interaction.id}`;

        if (processingInteractions.has(interactionKey)) {
            logger.warn(`[ButtonHandler] Duplicate execution prevented for ${customId}`);
            return;
        }

        processingInteractions.add(interactionKey);

        setTimeout(() => processingInteractions.delete(interactionKey), 10000);

        if (buttonHandlers[customId]) {
            await buttonHandlers[customId](interaction);
            return;
        }

        if (
            customId.startsWith("pricing_service_") &&
            customId.endsWith("_details")
        ) {
            await handleServiceDetails(interaction);
            return;
        }

        if (customId.startsWith("pricing_prev_") || customId.startsWith("pricing_next_")) {
            await handlePricingPagination(interaction);
            return;
        }

        if (customId.startsWith("ticket_calculate_")) {
            await handleTicketCalculate(interaction);
            return;
        }

        if (customId.startsWith("ticket_close_")) {
            await handleTicketClose(interaction);
            return;
        }

        if (customId.startsWith("open_ticket_")) {
            await handleOpenTicket(interaction);
            return;
        }

        if (customId.startsWith("recalculate_")) {
            await handleRecalculate(interaction);
            return;
        }

        if (customId.startsWith("calculate_price_")) {
            await handleCalculatePrice(interaction);
            return;
        }

        if (customId.startsWith("claim_job_")) {
            await handleClaimJobButton(interaction);
            return;
        }

        if (customId.startsWith("confirm_complete_")) {
            await handleConfirmCompleteButton(interaction);
            return;
        }

        if (customId.startsWith("report_issue_")) {
            await handleReportIssueButton(interaction);
            return;
        }

        if (customId.startsWith("order_info_")) {
            await handleOrderInfoButton(interaction);
            return;
        }

        if (customId.startsWith("mark_complete_")) {
            await handleCompleteOrder(interaction);
            return;
        }

        if (customId.startsWith("start_work_")) {
            await handleStartWork(interaction);
            return;
        }

        if (customId.startsWith("leave_review_")) {
            await handleLeaveReviewButton(interaction);
            return;
        }

        if (customId.startsWith("public_review_")) {
            await handleLeaveReviewButton(interaction);
            return;
        }

        if (customId.startsWith("anonymous_review_")) {
            await handleLeaveReviewButton(interaction);
            return;
        }

        if (customId.startsWith("back_to_category_")) {
            await handleBackToCategory(interaction);
            return;
        }

        if (customId.startsWith("create_ticket_")) {
            await handleCreateTicket(interaction);
            return;
        }

        if (customId.startsWith("confirm_close_ticket_")) {
            await handleConfirmCloseTicket(interaction);
            return;
        }

        if (customId.startsWith("cancel_close_ticket_")) {
            await handleCancelCloseTicket(interaction);
            return;
        }

        if (customId.startsWith("resolve_approve_work_") ||
            customId.startsWith("resolve_corrections_") ||
            customId.startsWith("resolve_refund_")) {
            await handleResolveIssueButton(interaction);
            return;
        }

        if (customId === "accept_tos") {
            await acceptTosButton.execute(interaction);
            return;
        }

        if (customId.startsWith("continue_onboarding_")) {
            await continueOnboardingButton.execute(interaction);
            return;
        }

        if (customId === "retry_onboarding") {
            await retryOnboardingButton.execute(interaction);
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
