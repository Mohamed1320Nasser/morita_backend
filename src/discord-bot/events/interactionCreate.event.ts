import { Events, Interaction, Client } from "discord.js";
import logger from "../../common/loggers";
import { Command, Button, SelectMenu, Modal } from "../types/discord.types";
import { handleButtonInteraction } from "../interactions/buttons";
import { handleSelectMenuInteraction } from "../interactions/selectMenus";
import modalHandlers, { handleModalInteraction } from "../interactions/modals";

export default {
    name: Events.InteractionCreate,
    async execute(interaction: Interaction) {
        try {
            if (interaction.isCommand()) {
                await handleCommand(interaction);
            } else if (interaction.isButton()) {
                await handleButton(interaction);
            } else if (interaction.isStringSelectMenu()) {
                await handleSelectMenu(interaction);
            } else if (interaction.isModalSubmit()) {
                await handleModal(interaction);
            }
        } catch (error) {
            
            if (
                error instanceof Error &&
                (error.message === "Unknown interaction" ||
                    error.message.includes("Unknown interaction") ||
                    error.message.includes("already been acknowledged"))
            ) {
                logger.debug(
                    "Interaction expired or already acknowledged in outer handler"
                );
                return;
            }

            logger.error("Error handling interaction:", error);

            const errorMessage =
                "An error occurred while processing your request. Please try again later.";

            if (!interaction.isRepliable()) {
                logger.debug(
                    "Interaction is no longer repliable in outer handler"
                );
                return;
            }

            try {
                if (interaction.replied || interaction.deferred) {
                    
                    await interaction.followUp({
                        content: errorMessage,
                        ephemeral: true,
                    });
                } else {
                    
                    await interaction.reply({
                        content: errorMessage,
                        ephemeral: true,
                    });
                }
            } catch (replyError) {
                
                if (
                    replyError instanceof Error &&
                    (replyError.message === "Unknown interaction" ||
                        replyError.message.includes("Unknown interaction") ||
                        replyError.message.includes(
                            "already been acknowledged"
                        ))
                ) {
                    logger.debug(
                        "Could not send error message - interaction expired or already acknowledged"
                    );
                    return;
                }
                logger.error(
                    "Could not send error message in outer handler:",
                    replyError
                );
            }
        }
    },
};

async function handleCommand(interaction: any) {
    const command = interaction.client.commands.get(
        interaction.commandName
    ) as Command;

    if (!command) {
        logger.warn(
            `No command matching ${interaction.commandName} was found.`
        );
        return;
    }

    try {
        logger.info(
            `Executing command: ${interaction.commandName} by ${interaction.user.tag}`
        );
        await command.execute(interaction);
    } catch (error) {
        logger.error(
            `Error executing command ${interaction.commandName}:`,
            error
        );

        const errorMessage = "There was an error while executing this command!";

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                content: errorMessage,
                ephemeral: true,
            });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
}

async function handleButton(interaction: any) {
    const customId = interaction.customId;
    logger.info(`Button interaction: ${customId} by ${interaction.user.tag}`);

    try {
        await handleButtonInteraction(interaction);
    } catch (error) {
        logger.error(`Error handling button ${customId}:`, error);
        await interaction.reply({
            content: "An error occurred while processing this button.",
            ephemeral: true,
        });
    }
}

async function handleSelectMenu(interaction: any) {
    const customId = interaction.customId;
    logger.info(
        `Select menu interaction: ${customId} by ${interaction.user.tag}`
    );

    await handleSelectMenuInteraction(interaction);
}

async function handleModal(interaction: any) {
    const customId = interaction.customId;
    logger.info(`Modal interaction: ${customId} by ${interaction.user.tag}`);

    await handleModalInteraction(interaction);
}
