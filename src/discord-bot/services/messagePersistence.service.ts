import { Client, TextChannel, Message, MessageCreateOptions, MessageEditOptions } from "discord.js";
import logger from "../../common/loggers";
import prisma from "../../common/prisma/client";

export class MessagePersistenceService {
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    private messageContentChanged(existingMessage: Message, newMessageData: MessageCreateOptions): boolean {
        try {
            
            const oldContent = existingMessage.content || "";
            const newContent = newMessageData.content || "";
            if (oldContent !== newContent) {
                logger.debug("[MessagePersistence] Content changed");
                return true;
            }

            const oldEmbeds = existingMessage.embeds || [];
            const newEmbeds = (newMessageData.embeds || []) as any[];

            if (oldEmbeds.length !== newEmbeds.length) {
                logger.debug("[MessagePersistence] Embed count changed");
                return true;
            }

            for (let i = 0; i < oldEmbeds.length; i++) {
                const oldEmbed = oldEmbeds[i];
                const newEmbed = newEmbeds[i];

                const newData = (newEmbed as any).data || newEmbed;

                if (oldEmbed.title !== newData.title) {
                    logger.debug(`[MessagePersistence] Embed title changed: "${oldEmbed.title}" -> "${newData.title}"`);
                    return true;
                }
                if (oldEmbed.description !== newData.description) {
                    logger.debug("[MessagePersistence] Embed description changed");
                    return true;
                }
                if (oldEmbed.color !== newData.color) {
                    logger.debug("[MessagePersistence] Embed color changed");
                    return true;
                }
                if (oldEmbed.url !== newData.url) {
                    logger.debug("[MessagePersistence] Embed URL changed");
                    return true;
                }

                if (oldEmbed.image?.url !== newData.image?.url) {
                    logger.debug("[MessagePersistence] Embed image changed");
                    return true;
                }
                if (oldEmbed.thumbnail?.url !== newData.thumbnail?.url) {
                    logger.debug("[MessagePersistence] Embed thumbnail changed");
                    return true;
                }

                if (oldEmbed.footer?.text !== newData.footer?.text) {
                    logger.debug("[MessagePersistence] Embed footer changed");
                    return true;
                }

                const oldFields = oldEmbed.fields || [];
                const newFields = newData.fields || [];
                if (oldFields.length !== newFields.length) {
                    logger.debug("[MessagePersistence] Embed fields count changed");
                    return true;
                }

                for (let j = 0; j < oldFields.length; j++) {
                    if (oldFields[j].name !== newFields[j].name ||
                        oldFields[j].value !== newFields[j].value ||
                        oldFields[j].inline !== newFields[j].inline) {
                        logger.debug("[MessagePersistence] Embed field changed");
                        return true;
                    }
                }
            }

            const oldComponents = existingMessage.components || [];
            const newComponents = (newMessageData.components || []) as any[];

            if (oldComponents.length !== newComponents.length) {
                logger.debug("[MessagePersistence] Component count changed");
                return true;
            }

            for (let i = 0; i < oldComponents.length; i++) {
                const oldRow = oldComponents[i];
                const newRow = newComponents[i];

                if (oldRow.components.length !== newRow.components.length) {
                    logger.debug("[MessagePersistence] Component row length changed");
                    return true;
                }

                for (let j = 0; j < oldRow.components.length; j++) {
                    const oldComp = oldRow.components[j];
                    const newComp = newRow.components[j];

                    if (oldComp.type !== newComp.type) {
                        logger.debug("[MessagePersistence] Component type changed");
                        return true;
                    }

                    if (oldComp.type === 2) { 
                        if (oldComp.label !== newComp.label ||
                            oldComp.customId !== newComp.customId ||
                            oldComp.style !== newComp.style ||
                            oldComp.disabled !== newComp.disabled) {
                            logger.debug("[MessagePersistence] Button changed");
                            return true;
                        }
                    }

                    if (oldComp.type === 3) { 
                        if (oldComp.placeholder !== newComp.placeholder ||
                            oldComp.customId !== newComp.customId) {
                            logger.debug("[MessagePersistence] Select menu changed");
                            return true;
                        }

                        const oldOptions = oldComp.options || [];
                        const newOptions = newComp.options || [];
                        if (oldOptions.length !== newOptions.length) {
                            logger.debug("[MessagePersistence] Select menu options changed");
                            return true;
                        }

                        for (let k = 0; k < oldOptions.length; k++) {
                            if (oldOptions[k].label !== newOptions[k].label ||
                                oldOptions[k].value !== newOptions[k].value ||
                                oldOptions[k].description !== newOptions[k].description) {
                                logger.debug("[MessagePersistence] Select menu option changed");
                                return true;
                            }
                        }
                    }
                }
            }

            logger.debug("[MessagePersistence] No content changes detected");
            return false;

        } catch (error) {
            
            logger.warn("[MessagePersistence] Error comparing messages, assuming changed:", error);
            return true;
        }
    }

    async ensureMessage(
        channelId: string,
        messageType: string,
        messageData: MessageCreateOptions,
        options?: {
            pin?: boolean;
            categoryId?: string;
            serviceId?: string;
            groupIndex?: number;
        }
    ): Promise<Message> {
        try {
            
            const channel = await this.client.channels.fetch(channelId);
            if (!channel || !(channel instanceof TextChannel)) {
                throw new Error(`Channel ${channelId} not found or not a text channel`);
            }

            const existingRecord = await prisma.discordMessage.findFirst({
                where: {
                    channelId,
                    messageType,
                    categoryId: options?.categoryId,
                    serviceId: options?.serviceId,
                    groupIndex: options?.groupIndex,
                },
            });

            let message: Message;

            if (existingRecord) {
                
                try {
                    message = await channel.messages.fetch(existingRecord.messageId);

                    const contentChanged = this.messageContentChanged(message, messageData);

                    if (contentChanged) {
                        
                        await message.edit(messageData as MessageEditOptions);

                        logger.info(`[MessagePersistence] ✏️ Edited message (content changed): ${messageType} in ${channel.name}`);

                        await prisma.discordMessage.update({
                            where: { id: existingRecord.id },
                            data: {
                                updatedAt: new Date(),
                            },
                        });
                    } else {
                        
                        logger.info(`[MessagePersistence] ✅ Message already up-to-date (skipped edit): ${messageType} in ${channel.name}`);
                    }
                } catch (fetchError) {
                    
                    logger.warn(`[MessagePersistence] Message ${existingRecord.messageId} not found, creating new one`);

                    message = await channel.send(messageData);

                    await prisma.discordMessage.update({
                        where: { id: existingRecord.id },
                        data: {
                            messageId: message.id,
                            updatedAt: new Date(),
                        },
                    });

                    logger.info(`[MessagePersistence] Created new message after deletion: ${messageType}`);
                }
            } else {
                
                message = await channel.send(messageData);

                await prisma.discordMessage.create({
                    data: {
                        messageId: message.id,
                        channelId: channel.id,
                        messageType,
                        categoryId: options?.categoryId,
                        serviceId: options?.serviceId,
                        groupIndex: options?.groupIndex,
                        isPinned: options?.pin || false,
                    },
                });

                logger.info(`[MessagePersistence] Created new message: ${messageType} in ${channel.name}`);
            }

            if (options?.pin && !message.pinned) {
                await message.pin();
                await prisma.discordMessage.update({
                    where: { messageId: message.id },
                    data: { isPinned: true },
                });
                logger.info(`[MessagePersistence] Pinned message: ${messageType}`);
            }

            return message;
        } catch (error) {
            logger.error(`[MessagePersistence] Error ensuring message ${messageType}:`, error);
            throw error;
        }
    }

    async getMessage(
        channelId: string,
        messageType: string,
        options?: {
            categoryId?: string;
            serviceId?: string;
            groupIndex?: number;
        }
    ): Promise<Message | null> {
        try {
            const record = await prisma.discordMessage.findFirst({
                where: {
                    channelId,
                    messageType,
                    categoryId: options?.categoryId,
                    serviceId: options?.serviceId,
                    groupIndex: options?.groupIndex,
                },
            });

            if (!record) {
                return null;
            }

            const channel = await this.client.channels.fetch(channelId);
            if (!channel || !(channel instanceof TextChannel)) {
                return null;
            }

            try {
                return await channel.messages.fetch(record.messageId);
            } catch (error) {
                
                await prisma.discordMessage.delete({
                    where: { id: record.id },
                });
                return null;
            }
        } catch (error) {
            logger.error(`[MessagePersistence] Error getting message ${messageType}:`, error);
            return null;
        }
    }

    async deleteMessage(
        channelId: string,
        messageType: string,
        options?: {
            categoryId?: string;
            serviceId?: string;
            groupIndex?: number;
        }
    ): Promise<void> {
        try {
            const record = await prisma.discordMessage.findFirst({
                where: {
                    channelId,
                    messageType,
                    categoryId: options?.categoryId,
                    serviceId: options?.serviceId,
                    groupIndex: options?.groupIndex,
                },
            });

            if (record) {
                
                try {
                    const channel = await this.client.channels.fetch(channelId);
                    if (channel && channel instanceof TextChannel) {
                        const message = await channel.messages.fetch(record.messageId);
                        await message.delete();
                    }
                } catch (error) {
                    logger.warn(`[MessagePersistence] Could not delete message from Discord:`, error);
                }

                await prisma.discordMessage.delete({
                    where: { id: record.id },
                });

                logger.info(`[MessagePersistence] Deleted message: ${messageType}`);
            }
        } catch (error) {
            logger.error(`[MessagePersistence] Error deleting message ${messageType}:`, error);
        }
    }

    async clearMessages(channelId: string, messageType: string): Promise<void> {
        try {
            const records = await prisma.discordMessage.findMany({
                where: {
                    channelId,
                    messageType,
                },
            });

            const channel = await this.client.channels.fetch(channelId);
            if (!channel || !(channel instanceof TextChannel)) {
                return;
            }

            for (const record of records) {
                try {
                    const message = await channel.messages.fetch(record.messageId);
                    await message.delete();
                } catch (error) {
                    
                }

                await prisma.discordMessage.delete({
                    where: { id: record.id },
                });
            }

            logger.info(`[MessagePersistence] Cleared ${records.length} messages of type ${messageType}`);
        } catch (error) {
            logger.error(`[MessagePersistence] Error clearing messages:`, error);
        }
    }

    async clearExpiredMessages(): Promise<void> {
        try {
            const expiredMessages = await prisma.discordMessage.findMany({
                where: {
                    expiresAt: {
                        lte: new Date(),
                    },
                },
            });

            for (const record of expiredMessages) {
                try {
                    const channel = await this.client.channels.fetch(record.channelId);
                    if (channel && channel instanceof TextChannel) {
                        const message = await channel.messages.fetch(record.messageId);
                        await message.delete();
                    }
                } catch (error) {
                    
                }

                await prisma.discordMessage.delete({
                    where: { id: record.id },
                });
            }

            if (expiredMessages.length > 0) {
                logger.info(`[MessagePersistence] Cleared ${expiredMessages.length} expired messages`);
            }
        } catch (error) {
            logger.error(`[MessagePersistence] Error clearing expired messages:`, error);
        }
    }
}

let messagePersistenceInstance: MessagePersistenceService | null = null;

export function getMessagePersistence(client: Client): MessagePersistenceService {
    if (!messagePersistenceInstance) {
        messagePersistenceInstance = new MessagePersistenceService(client);
    }
    return messagePersistenceInstance;
}
