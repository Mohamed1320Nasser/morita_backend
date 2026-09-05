ALTER TABLE `TicketTypeSettings`
  ADD COLUMN `shopTitle` VARCHAR(255) NULL AFTER `embedColor`,
  ADD COLUMN `shopDescription` TEXT NULL AFTER `shopTitle`;
