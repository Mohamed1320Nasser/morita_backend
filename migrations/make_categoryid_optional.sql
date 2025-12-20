-- Migration: Make Ticket.categoryId optional
-- Date: 2025-12-20
-- Purpose: Allow tickets to be created without a category

-- Modify the categoryId column to allow NULL values
ALTER TABLE `Ticket`
MODIFY COLUMN `categoryId` VARCHAR(191) NULL;

-- Note: This migration is safe to run. Existing tickets with categoryId will keep their values.
-- New tickets can now be created with categoryId as NULL.
