CREATE TABLE IF NOT EXISTS `branding_settings` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `fileId` INTEGER UNSIGNED NOT NULL,
    `updatedBy` INTEGER UNSIGNED NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `branding_settings_key_key`(`key`),
    INDEX `branding_settings_key_idx`(`key`),
    INDEX `branding_settings_fileId_idx`(`fileId`),
    INDEX `branding_settings_updatedBy_idx`(`updatedBy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `branding_settings`
    ADD CONSTRAINT `branding_settings_fileId_fkey`
    FOREIGN KEY (`fileId`) REFERENCES `File`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `branding_settings`
    ADD CONSTRAINT `branding_settings_updatedBy_fkey`
    FOREIGN KEY (`updatedBy`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
