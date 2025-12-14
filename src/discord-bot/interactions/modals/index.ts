import { ModalSubmitInteraction } from "discord.js";
import { Modal } from "../../types/discord.types";
import logger from "../../../common/loggers";

// Import all modal handlers
import { handleOrderDetailsModal } from "./order-details.modal";
import { handleCalculatorModal } from "./calculator.modal";
import {
    handleTicketCreateModal,
    handleTicketCloseConfirmModal,
} from "./ticket-create.modal";
import { handleTicketModal } from "./ticket-modal.modal"; // NEW
import { handleCreateOrderJobModal } from "./create-order-job.modal";
import { handleCompleteOrderModal } from "./complete-order.modal";
import { handleReportIssueModal } from "./report-issue.modal";

// Modal handler mapping (exact matches)
const modalHandlers: {
    [key: string]: (interaction: ModalSubmitInteraction) => Promise<void>;
} = {
    order_details_modal: handleOrderDetailsModal,
    order_details_modal_ticket: handleOrderDetailsModal,
};

// Pattern-based modal handlers (for dynamic customIds)
const patternModalHandlers: Array<{
    pattern: RegExp;
    handler: (interaction: ModalSubmitInteraction) => Promise<void>;
}> = [
    {
        pattern: /^calculator_modal_/,
        handler: handleCalculatorModal,
    },
    {
        pattern: /^ticket_create_modal_/,
        handler: handleTicketCreateModal,
    },
    {
        pattern: /^ticket_modal_/, // NEW - handles all ticket types
        handler: handleTicketModal,
    },
    {
        pattern: /^ticket_close_confirm_/,
        handler: handleTicketCloseConfirmModal,
    },
    {
        pattern: /^create_order_job_/,
        handler: handleCreateOrderJobModal,
    },
    {
        pattern: /^complete_order_/,
        handler: handleCompleteOrderModal,
    },
    {
        pattern: /^report_issue_/,
        handler: handleReportIssueModal,
    },
];

// Export modal handlers as array for the main interaction handler
export default Object.entries(modalHandlers).map(([customId, execute]) => ({
    customId,
    execute,
})) as Modal[];

// Helper function to handle modal interactions
export async function handleModalInteraction(
    interaction: ModalSubmitInteraction
): Promise<void> {
    const customId = interaction.customId;

    // Check exact match first
    let handler = modalHandlers[customId];

    // If no exact match, check pattern matches
    if (!handler) {
        const patternMatch = patternModalHandlers.find((ph) =>
            ph.pattern.test(customId)
        );
        if (patternMatch) {
            handler = patternMatch.handler;
        }
    }

    if (handler) {
        try {
            await handler(interaction);
        } catch (error) {
            logger.error(`Error handling modal ${customId}:`, error);

            // Only try to reply if not already replied
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: "An error occurred while processing this form.",
                    ephemeral: true,
                }).catch((err) => logger.error("Failed to send error reply:", err));
            }
        }
    } else {
        logger.warn(`No modal handler found for: ${customId}`);
        await interaction.reply({
            content: "This form is not implemented yet.",
            ephemeral: true,
        }).catch((err) => logger.error("Failed to send not-found reply:", err));
    }
}

// Export pattern handlers for use in other parts of the codebase if needed
export { patternModalHandlers };
