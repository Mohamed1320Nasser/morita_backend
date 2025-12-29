-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `fullname` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `password` VARCHAR(191) NULL,
    `profileId` INTEGER UNSIGNED NULL,
    `emailIsVerified` BOOLEAN NOT NULL DEFAULT false,
    `emailVerifyToken` VARCHAR(191) NULL,
    `passwordSetupToken` VARCHAR(191) NULL,
    `passwordSetupExpiry` DATETIME(0) NULL,
    `banned` BOOLEAN NOT NULL DEFAULT false,
    `role` ENUM('admin', 'system', 'tester', 'user') NOT NULL DEFAULT 'user',
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `deletedAt` DATETIME(3) NULL,
    `discordId` VARCHAR(191) NULL,
    `discordUsername` VARCHAR(191) NULL,
    `discordDisplayName` VARCHAR(191) NULL,
    `discordRole` ENUM('admin', 'support', 'worker', 'customer') NULL DEFAULT 'customer',

    UNIQUE INDEX `User_username_key`(`username`),
    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_profileId_key`(`profileId`),
    UNIQUE INDEX `User_passwordSetupToken_key`(`passwordSetupToken`),
    UNIQUE INDEX `User_discordId_key`(`discordId`),
    INDEX `User_email_idx`(`email`),
    INDEX `User_role_idx`(`role`),
    INDEX `User_discordId_idx`(`discordId`),
    INDEX `User_discordRole_idx`(`discordRole`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `token` VARCHAR(191) NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `userId` INTEGER UNSIGNED NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `companyId` INTEGER UNSIGNED NULL,
    `source` VARCHAR(191) NULL,
    `langCode` VARCHAR(191) NULL,
    `expired` BOOLEAN NOT NULL DEFAULT false,
    `expired_since` DATETIME(0) NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `Session_token_key`(`token`),
    INDEX `Session_userId_idx`(`userId`),
    INDEX `Session_tenantId_idx`(`tenantId`),
    INDEX `Session_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OtpRequest` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER UNSIGNED NULL,
    `email` VARCHAR(191) NULL,
    `otp` VARCHAR(191) NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `expiredAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `type` ENUM('verify_email', 'forget_email') NOT NULL,

    UNIQUE INDEX `OtpRequest_userId_type_key`(`userId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `File` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `folder` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `format` VARCHAR(191) NOT NULL,
    `uploadedBy` INTEGER UNSIGNED NOT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServiceCategory` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `emoji` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `iconId` INTEGER UNSIGNED NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `ServiceCategory_slug_key`(`slug`),
    INDEX `ServiceCategory_slug_idx`(`slug`),
    INDEX `ServiceCategory_active_idx`(`active`),
    INDEX `ServiceCategory_displayOrder_idx`(`displayOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Service` (
    `id` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `emoji` VARCHAR(191) NULL,
    `imageUrl` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `deletedAt` DATETIME(3) NULL,

    INDEX `Service_categoryId_idx`(`categoryId`),
    INDEX `Service_active_idx`(`active`),
    INDEX `Service_displayOrder_idx`(`displayOrder`),
    UNIQUE INDEX `Service_categoryId_slug_key`(`categoryId`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServiceModifier` (
    `id` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `modifierType` ENUM('PERCENTAGE', 'FIXED') NOT NULL,
    `value` DECIMAL(10, 2) NOT NULL,
    `displayType` ENUM('NORMAL', 'UPCHARGE', 'DISCOUNT', 'NOTE', 'WARNING') NOT NULL DEFAULT 'NORMAL',
    `priority` INTEGER NOT NULL DEFAULT 0,
    `condition` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `ServiceModifier_serviceId_idx`(`serviceId`),
    INDEX `ServiceModifier_priority_idx`(`priority`),
    INDEX `ServiceModifier_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PricingMethod` (
    `id` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `groupName` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `basePrice` DECIMAL(18, 8) NOT NULL,
    `pricingUnit` ENUM('FIXED', 'PER_LEVEL', 'PER_KILL', 'PER_ITEM', 'PER_HOUR') NOT NULL DEFAULT 'FIXED',
    `startLevel` INTEGER NULL,
    `endLevel` INTEGER NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `deletedAt` DATETIME(3) NULL,

    INDEX `PricingMethod_serviceId_idx`(`serviceId`),
    INDEX `PricingMethod_active_idx`(`active`),
    INDEX `PricingMethod_displayOrder_idx`(`displayOrder`),
    INDEX `PricingMethod_startLevel_endLevel_idx`(`startLevel`, `endLevel`),
    INDEX `PricingMethod_groupName_idx`(`groupName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PricingModifier` (
    `id` VARCHAR(191) NOT NULL,
    `methodId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `modifierType` ENUM('PERCENTAGE', 'FIXED') NOT NULL,
    `value` DECIMAL(10, 2) NOT NULL,
    `condition` TEXT NULL,
    `displayType` ENUM('NORMAL', 'UPCHARGE', 'DISCOUNT', 'NOTE', 'WARNING') NOT NULL DEFAULT 'NORMAL',
    `priority` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `PricingModifier_methodId_idx`(`methodId`),
    INDEX `PricingModifier_priority_idx`(`priority`),
    INDEX `PricingModifier_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentMethod` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('CRYPTO', 'NON_CRYPTO') NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `deletedAt` DATETIME(3) NULL,

    INDEX `PaymentMethod_type_idx`(`type`),
    INDEX `PaymentMethod_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MethodPrice` (
    `id` VARCHAR(191) NOT NULL,
    `methodId` VARCHAR(191) NOT NULL,
    `paymentMethodId` VARCHAR(191) NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `MethodPrice_methodId_idx`(`methodId`),
    INDEX `MethodPrice_paymentMethodId_idx`(`paymentMethodId`),
    UNIQUE INDEX `MethodPrice_methodId_paymentMethodId_key`(`methodId`, `paymentMethodId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Account` (
    `id` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `accountData` JSON NOT NULL,
    `status` ENUM('AVAILABLE', 'RESERVED', 'IN_USE', 'COMPLETED') NOT NULL DEFAULT 'AVAILABLE',
    `reservedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `Account_categoryId_idx`(`categoryId`),
    INDEX `Account_serviceId_idx`(`serviceId`),
    INDEX `Account_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` VARCHAR(191) NOT NULL,
    `orderNumber` INTEGER NOT NULL DEFAULT 0,
    `customerId` INTEGER UNSIGNED NOT NULL,
    `workerId` INTEGER UNSIGNED NULL,
    `supportId` INTEGER UNSIGNED NULL,
    `ticketId` VARCHAR(191) NULL,
    `serviceId` VARCHAR(191) NULL,
    `methodId` VARCHAR(191) NULL,
    `paymentMethodId` VARCHAR(191) NULL,
    `accountId` VARCHAR(191) NULL,
    `orderChannelId` VARCHAR(191) NULL,
    `claimMessageId` VARCHAR(191) NULL,
    `pinnedMessageId` VARCHAR(191) NULL,
    `ticketChannelId` VARCHAR(191) NULL,
    `orderValue` DECIMAL(18, 8) NOT NULL,
    `depositAmount` DECIMAL(18, 8) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `workerPayout` DECIMAL(18, 8) NULL,
    `supportPayout` DECIMAL(18, 8) NULL,
    `systemPayout` DECIMAL(18, 8) NULL,
    `payoutProcessed` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('PENDING', 'CLAIMING', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_CONFIRM', 'COMPLETED', 'CANCELLED', 'DISPUTED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `jobDetails` JSON NULL,
    `completionNotes` TEXT NULL,
    `cancellationReason` TEXT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `assignedAt` DATETIME(3) NULL,
    `claimedAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `confirmedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `Order_orderNumber_key`(`orderNumber`),
    UNIQUE INDEX `Order_orderChannelId_key`(`orderChannelId`),
    INDEX `Order_customerId_idx`(`customerId`),
    INDEX `Order_workerId_idx`(`workerId`),
    INDEX `Order_status_idx`(`status`),
    INDEX `Order_ticketId_idx`(`ticketId`),
    INDEX `Order_createdAt_idx`(`createdAt`),
    INDEX `Order_workerId_status_idx`(`workerId`, `status`),
    INDEX `Order_customerId_status_idx`(`customerId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderStatusHistory` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `fromStatus` ENUM('PENDING', 'CLAIMING', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_CONFIRM', 'COMPLETED', 'CANCELLED', 'DISPUTED', 'REFUNDED') NULL,
    `toStatus` ENUM('PENDING', 'CLAIMING', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_CONFIRM', 'COMPLETED', 'CANCELLED', 'DISPUTED', 'REFUNDED') NOT NULL,
    `changedById` INTEGER UNSIGNED NOT NULL,
    `reason` TEXT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `OrderStatusHistory_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Transaction` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER UNSIGNED NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `type` ENUM('DEPOSIT', 'WITHDRAWAL', 'PAYMENT', 'REFUND') NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `Transaction_userId_idx`(`userId`),
    INDEX `Transaction_orderId_idx`(`orderId`),
    INDEX `Transaction_type_idx`(`type`),
    INDEX `Transaction_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Wallet` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER UNSIGNED NOT NULL,
    `walletType` ENUM('CUSTOMER', 'WORKER', 'SUPPORT') NOT NULL DEFAULT 'CUSTOMER',
    `balance` DECIMAL(18, 8) NOT NULL DEFAULT 0,
    `pendingBalance` DECIMAL(18, 8) NOT NULL DEFAULT 0,
    `deposit` DECIMAL(18, 8) NOT NULL DEFAULT 0,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `Wallet_userId_key`(`userId`),
    INDEX `Wallet_userId_idx`(`userId`),
    INDEX `Wallet_walletType_idx`(`walletType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WalletTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `walletId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `type` ENUM('DEPOSIT', 'WITHDRAWAL', 'PAYMENT', 'REFUND', 'EARNING', 'COMMISSION', 'SYSTEM_FEE', 'ADJUSTMENT', 'RELEASE', 'WORKER_DEPOSIT') NOT NULL,
    `amount` DECIMAL(18, 8) NOT NULL,
    `balanceBefore` DECIMAL(18, 8) NOT NULL,
    `balanceAfter` DECIMAL(18, 8) NOT NULL,
    `depositBefore` DECIMAL(18, 8) NULL,
    `depositAfter` DECIMAL(18, 8) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `status` ENUM('PENDING', 'COMPLETED', 'FAILED', 'REVERSED') NOT NULL DEFAULT 'COMPLETED',
    `paymentMethodId` VARCHAR(191) NULL,
    `reference` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdById` INTEGER UNSIGNED NOT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `WalletTransaction_walletId_idx`(`walletId`),
    INDEX `WalletTransaction_orderId_idx`(`orderId`),
    INDEX `WalletTransaction_type_idx`(`type`),
    INDEX `WalletTransaction_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemWallet` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'system-wallet',
    `balance` DECIMAL(18, 8) NOT NULL DEFAULT 0,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DiscordMessage` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `channelId` VARCHAR(191) NOT NULL,
    `messageType` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `serviceId` VARCHAR(191) NULL,
    `groupIndex` INTEGER NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `expiresAt` DATETIME(0) NULL,

    UNIQUE INDEX `DiscordMessage_messageId_key`(`messageId`),
    INDEX `DiscordMessage_messageId_idx`(`messageId`),
    INDEX `DiscordMessage_channelId_idx`(`channelId`),
    INDEX `DiscordMessage_messageType_idx`(`messageType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExperienceTable` (
    `level` TINYINT UNSIGNED NOT NULL,
    `experience` BIGINT NOT NULL,
    `difference` INTEGER NOT NULL,

    INDEX `ExperienceTable_level_idx`(`level`),
    PRIMARY KEY (`level`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Ticket` (
    `id` VARCHAR(191) NOT NULL,
    `ticketNumber` INTEGER NOT NULL AUTO_INCREMENT,
    `ticketType` ENUM('PURCHASE_SERVICES_OSRS', 'PURCHASE_SERVICES_RS3', 'BUY_GOLD_OSRS', 'BUY_GOLD_RS3', 'SELL_GOLD_OSRS', 'SELL_GOLD_RS3', 'SWAP_CRYPTO', 'GENERAL') NOT NULL DEFAULT 'GENERAL',
    `customerId` INTEGER UNSIGNED NOT NULL,
    `customerDiscordId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `serviceId` VARCHAR(191) NULL,
    `channelId` VARCHAR(191) NOT NULL,
    `calculatedPrice` DECIMAL(18, 8) NULL,
    `paymentMethodId` VARCHAR(191) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `status` ENUM('OPEN', 'IN_PROGRESS', 'AWAITING_CONFIRMATION', 'COMPLETED', 'CANCELLED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `supportId` INTEGER UNSIGNED NULL,
    `supportDiscordId` VARCHAR(191) NULL,
    `customerNotes` TEXT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `closedAt` DATETIME(0) NULL,

    UNIQUE INDEX `Ticket_ticketNumber_key`(`ticketNumber`),
    UNIQUE INDEX `Ticket_channelId_key`(`channelId`),
    INDEX `Ticket_customerId_idx`(`customerId`),
    INDEX `Ticket_categoryId_idx`(`categoryId`),
    INDEX `Ticket_serviceId_idx`(`serviceId`),
    INDEX `Ticket_status_idx`(`status`),
    INDEX `Ticket_channelId_idx`(`channelId`),
    INDEX `Ticket_ticketType_idx`(`ticketType`),
    INDEX `Ticket_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketMessage` (
    `id` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `authorId` INTEGER UNSIGNED NOT NULL,
    `authorDiscordId` VARCHAR(191) NOT NULL,
    `authorName` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `isWelcome` BOOLEAN NOT NULL DEFAULT false,
    `discordMessageId` VARCHAR(191) NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `TicketMessage_discordMessageId_key`(`discordMessageId`),
    INDEX `TicketMessage_ticketId_idx`(`ticketId`),
    INDEX `TicketMessage_authorId_idx`(`authorId`),
    INDEX `TicketMessage_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CategoryTicketSettings` (
    `id` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `bannerUrl` TEXT NULL,
    `welcomeTitle` VARCHAR(255) NULL,
    `welcomeMessage` TEXT NOT NULL,
    `footerText` TEXT NULL,
    `embedColor` VARCHAR(6) NULL DEFAULT '5865F2',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `CategoryTicketSettings_categoryId_key`(`categoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketMetadata` (
    `id` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `goldAmount` DECIMAL(15, 2) NULL,
    `goldRate` DECIMAL(10, 4) NULL,
    `deliveryMethod` VARCHAR(100) NULL,
    `worldLocation` VARCHAR(200) NULL,
    `osrsUsername` VARCHAR(100) NULL,
    `cryptoType` VARCHAR(50) NULL,
    `cryptoAmount` DECIMAL(20, 8) NULL,
    `walletAddress` VARCHAR(500) NULL,
    `swapDirection` VARCHAR(50) NULL,
    `paymentEmail` VARCHAR(255) NULL,
    `paymentProof` TEXT NULL,
    `payoutAmount` DECIMAL(18, 8) NULL,
    `specialNotes` TEXT NULL,
    `internalNotes` TEXT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `TicketMetadata_ticketId_key`(`ticketId`),
    INDEX `TicketMetadata_ticketId_idx`(`ticketId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketTypeSettings` (
    `id` VARCHAR(191) NOT NULL,
    `ticketType` ENUM('PURCHASE_SERVICES_OSRS', 'PURCHASE_SERVICES_RS3', 'BUY_GOLD_OSRS', 'BUY_GOLD_RS3', 'SELL_GOLD_OSRS', 'SELL_GOLD_RS3', 'SWAP_CRYPTO', 'GENERAL') NOT NULL,
    `groupKey` VARCHAR(50) NULL,
    `buttonLabel` VARCHAR(100) NULL,
    `buttonColor` VARCHAR(20) NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `bannerUrl` TEXT NULL,
    `thumbnailUrl` TEXT NULL,
    `welcomeTitle` VARCHAR(255) NULL,
    `welcomeMessage` TEXT NOT NULL,
    `footerText` TEXT NULL,
    `embedColor` VARCHAR(6) NULL DEFAULT '5865F2',
    `customFields` JSON NULL,
    `autoAssign` BOOLEAN NOT NULL DEFAULT false,
    `notifyOnCreate` BOOLEAN NOT NULL DEFAULT true,
    `notifyOnClose` BOOLEAN NOT NULL DEFAULT true,
    `mentionSupport` BOOLEAN NOT NULL DEFAULT true,
    `mentionCustomer` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `TicketTypeSettings_ticketType_key`(`ticketType`),
    INDEX `TicketTypeSettings_ticketType_idx`(`ticketType`),
    INDEX `TicketTypeSettings_isActive_idx`(`isActive`),
    INDEX `TicketTypeSettings_groupKey_idx`(`groupKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TermsOfService` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL,
    `bannerUrl` TEXT NULL,
    `thumbnailUrl` TEXT NULL,
    `embedColor` VARCHAR(6) NOT NULL DEFAULT '5865F2',
    `footerText` TEXT NULL,
    `buttonLabel` VARCHAR(100) NOT NULL DEFAULT 'Accept Terms',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `TermsOfService_isActive_idx`(`isActive`),
    INDEX `TermsOfService_version_idx`(`version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TosAcceptance` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER UNSIGNED NOT NULL,
    `tosId` VARCHAR(191) NOT NULL,
    `discordId` VARCHAR(191) NOT NULL,
    `discordUsername` VARCHAR(191) NOT NULL,
    `acceptedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `ipAddress` VARCHAR(45) NULL,

    INDEX `TosAcceptance_discordId_idx`(`discordId`),
    INDEX `TosAcceptance_acceptedAt_idx`(`acceptedAt`),
    UNIQUE INDEX `TosAcceptance_userId_tosId_key`(`userId`, `tosId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OnboardingQuestion` (
    `id` VARCHAR(191) NOT NULL,
    `question` TEXT NOT NULL,
    `fieldType` ENUM('TEXT', 'TEXTAREA') NOT NULL DEFAULT 'TEXT',
    `placeholder` VARCHAR(255) NULL,
    `required` BOOLEAN NOT NULL DEFAULT true,
    `minLength` INTEGER NULL,
    `maxLength` INTEGER NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `OnboardingQuestion_displayOrder_idx`(`displayOrder`),
    INDEX `OnboardingQuestion_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OnboardingAnswer` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER UNSIGNED NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `answer` TEXT NOT NULL,
    `discordId` VARCHAR(191) NOT NULL,
    `answeredAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `OnboardingAnswer_discordId_idx`(`discordId`),
    INDEX `OnboardingAnswer_userId_idx`(`userId`),
    UNIQUE INDEX `OnboardingAnswer_userId_questionId_key`(`userId`, `questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OnboardingSession` (
    `id` VARCHAR(191) NOT NULL,
    `discordId` VARCHAR(191) NOT NULL,
    `discordUsername` VARCHAR(191) NOT NULL,
    `tosAccepted` BOOLEAN NOT NULL DEFAULT false,
    `questionsCompleted` BOOLEAN NOT NULL DEFAULT false,
    `roleAssigned` BOOLEAN NOT NULL DEFAULT false,
    `registeredInDb` BOOLEAN NOT NULL DEFAULT false,
    `startedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `completedAt` DATETIME(3) NULL,

    UNIQUE INDEX `OnboardingSession_discordId_key`(`discordId`),
    INDEX `OnboardingSession_discordId_idx`(`discordId`),
    INDEX `OnboardingSession_tosAccepted_questionsCompleted_idx`(`tosAccepted`, `questionsCompleted`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `File`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OtpRequest` ADD CONSTRAINT `OtpRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `File` ADD CONSTRAINT `File_uploadedBy_fkey` FOREIGN KEY (`uploadedBy`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceCategory` ADD CONSTRAINT `ServiceCategory_iconId_fkey` FOREIGN KEY (`iconId`) REFERENCES `File`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Service` ADD CONSTRAINT `Service_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `ServiceCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceModifier` ADD CONSTRAINT `ServiceModifier_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PricingMethod` ADD CONSTRAINT `PricingMethod_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PricingModifier` ADD CONSTRAINT `PricingModifier_methodId_fkey` FOREIGN KEY (`methodId`) REFERENCES `PricingMethod`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MethodPrice` ADD CONSTRAINT `MethodPrice_methodId_fkey` FOREIGN KEY (`methodId`) REFERENCES `PricingMethod`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MethodPrice` ADD CONSTRAINT `MethodPrice_paymentMethodId_fkey` FOREIGN KEY (`paymentMethodId`) REFERENCES `PaymentMethod`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Account` ADD CONSTRAINT `Account_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `ServiceCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Account` ADD CONSTRAINT `Account_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_workerId_fkey` FOREIGN KEY (`workerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_supportId_fkey` FOREIGN KEY (`supportId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_methodId_fkey` FOREIGN KEY (`methodId`) REFERENCES `PricingMethod`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_paymentMethodId_fkey` FOREIGN KEY (`paymentMethodId`) REFERENCES `PaymentMethod`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `Account`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderStatusHistory` ADD CONSTRAINT `OrderStatusHistory_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderStatusHistory` ADD CONSTRAINT `OrderStatusHistory_changedById_fkey` FOREIGN KEY (`changedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Wallet` ADD CONSTRAINT `Wallet_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `Wallet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_paymentMethodId_fkey` FOREIGN KEY (`paymentMethodId`) REFERENCES `PaymentMethod`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_supportId_fkey` FOREIGN KEY (`supportId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `ServiceCategory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_paymentMethodId_fkey` FOREIGN KEY (`paymentMethodId`) REFERENCES `PaymentMethod`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketMessage` ADD CONSTRAINT `TicketMessage_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketMessage` ADD CONSTRAINT `TicketMessage_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CategoryTicketSettings` ADD CONSTRAINT `CategoryTicketSettings_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `ServiceCategory`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketMetadata` ADD CONSTRAINT `TicketMetadata_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TosAcceptance` ADD CONSTRAINT `TosAcceptance_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TosAcceptance` ADD CONSTRAINT `TosAcceptance_tosId_fkey` FOREIGN KEY (`tosId`) REFERENCES `TermsOfService`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnboardingAnswer` ADD CONSTRAINT `OnboardingAnswer_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnboardingAnswer` ADD CONSTRAINT `OnboardingAnswer_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `OnboardingQuestion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
