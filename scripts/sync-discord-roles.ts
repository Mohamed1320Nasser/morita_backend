/**
 * Script to sync Discord roles from wallet types
 * Run this once to fix existing users
 */

import prisma from "../src/common/prisma/client";
import logger from "../src/common/loggers";

async function syncDiscordRolesFromWallets() {
    logger.info("Starting Discord role sync from wallet types...");

    try {
        // Get all users with wallets
        const usersWithWallets = await prisma.user.findMany({
            where: {
                wallet: {
                    isNot: null,
                },
            },
            include: {
                wallet: true,
            },
        });

        logger.info(`Found ${usersWithWallets.length} users with wallets`);

        let updatedCount = 0;

        for (const user of usersWithWallets) {
            if (!user.wallet) continue;

            // Map wallet type to discord role
            const walletTypeToDiscordRole: Record<string, string> = {
                WORKER: "worker",
                SUPPORT: "support",
                CUSTOMER: "customer",
            };

            const newDiscordRole = walletTypeToDiscordRole[user.wallet.walletType];

            if (!newDiscordRole) {
                logger.warn(`Unknown wallet type: ${user.wallet.walletType} for user ${user.id}`);
                continue;
            }

            // Only update if current discordRole is null or "customer"
            if (!user.discordRole || user.discordRole === "customer") {
                await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        discordRole: newDiscordRole as any,
                    },
                });

                updatedCount++;
                logger.info(
                    `Updated user ${user.id} (${user.username || user.fullname}): ${user.wallet.walletType} → ${newDiscordRole}`
                );
            }
        }

        logger.info(`✅ Sync complete! Updated ${updatedCount} users`);
        logger.info(`Skipped ${usersWithWallets.length - updatedCount} users (already have correct role)`);
    } catch (error) {
        logger.error("Error syncing Discord roles:", error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run the script
syncDiscordRolesFromWallets()
    .then(() => {
        logger.info("Script finished successfully");
        process.exit(0);
    })
    .catch((error) => {
        logger.error("Script failed:", error);
        process.exit(1);
    });
