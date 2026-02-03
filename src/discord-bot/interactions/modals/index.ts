import { ModalSubmitInteraction } from "discord.js";
import { Modal } from "../../types/discord.types";
import logger from "../../../common/loggers";

import { handleOrderDetailsModal } from "./order-details.modal";
import { handleCalculatorModal } from "./calculator.modal";
import {
    handleTicketCreateModal,
    handleTicketCloseConfirmModal,
} from "./ticket-create.modal";
import { handleTicketModal } from "./ticket-modal.modal"; 
import { handleCreateOrderJobModal } from "./create-order-job.modal";
import { handleCompleteOrderModal } from "./complete-order.modal";
import { handleReportIssueModal } from "./report-issue.modal";
import { handleOrderReviewModal } from "./order-review.modal";
import { handleResolveApproveWorkCompleteModal } from "./resolve-approve-work-complete.modal";
import { handleResolveRequestCorrectionsModal } from "./resolve-request-corrections.modal";
import { handleResolveApproveCustomerRefundModal } from "./resolve-approve-customer-refund.modal";
import { handleAccountDeliveryModal } from "./account-delivery.modal";
import { handleAccountReviewModal } from "./account-review.modal";
import { handleAccountDataModal } from "./account-data.modal";

import onboardingQuestionnaireModal from "./onboarding-questionnaire.modal";

const modalHandlers: {
    [key: string]: (interaction: ModalSubmitInteraction) => Promise<void>;
} = {
    order_details_modal: handleOrderDetailsModal,
    order_details_modal_ticket: handleOrderDetailsModal,
};

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
        pattern: /^ticket_modal_/, 
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
    {
        pattern: /^order_review_/,
        handler: handleOrderReviewModal,
    },
    {
        pattern: /^resolve_approve_work_modal_/,
        handler: handleResolveApproveWorkCompleteModal,
    },
    {
        pattern: /^resolve_corrections_modal_/,
        handler: handleResolveRequestCorrectionsModal,
    },
    {
        pattern: /^resolve_refund_modal_/,
        handler: handleResolveApproveCustomerRefundModal,
    },
    {
        pattern: /^onboarding_questionnaire_\d+$/,
        handler: onboardingQuestionnaireModal.execute,
    },
    {
        pattern: /^account_delivery_modal_/,
        handler: handleAccountDeliveryModal,
    },
    {
        pattern: /^account_review_/,
        handler: handleAccountReviewModal,
    },
    {
        pattern: /^account_data_modal_/,
        handler: handleAccountDataModal,
    },
];

export default Object.entries(modalHandlers).map(([customId, execute]) => ({
    customId,
    execute,
})) as Modal[];

export async function handleModalInteraction(
    interaction: ModalSubmitInteraction
): Promise<void> {
    const customId = interaction.customId;

    let handler = modalHandlers[customId];

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

            try {
                if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply({
                        content: "❌ An error occurred while processing this form. Please try again or contact support.",
                    });
                } else if (!interaction.replied) {
                    await interaction.reply({
                        content: "❌ An error occurred while processing this form. Please try again or contact support.",
                        ephemeral: true,
                    });
                }
            } catch (replyError) {
                logger.error("Failed to send error reply:", replyError);
            }
        }
    } else {
        logger.warn(`No modal handler found for: ${customId}`);
        try {
            await interaction.reply({
                content: "This form is not implemented yet.",
                ephemeral: true,
            });
        } catch (err) {
            logger.error("Failed to send not-found reply:", err);
        }
    }
}

export { patternModalHandlers };
