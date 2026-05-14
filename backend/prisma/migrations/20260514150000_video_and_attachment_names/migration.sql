-- AlterEnum
ALTER TABLE `messages` MODIFY `type` ENUM('text', 'image', 'audio', 'video', 'file') NOT NULL DEFAULT 'text';

-- AlterTable
ALTER TABLE `messages` ADD COLUMN `attachment_name` VARCHAR(255) NULL;
