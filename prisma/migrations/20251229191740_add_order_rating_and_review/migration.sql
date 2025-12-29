-- AlterTable
ALTER TABLE `Order` ADD COLUMN `rating` INTEGER NULL,
    ADD COLUMN `review` TEXT NULL,
    ADD COLUMN `reviewedAt` DATETIME(0) NULL;
