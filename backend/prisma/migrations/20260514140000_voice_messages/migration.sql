-- AlterEnum
ALTER TABLE `messages` MODIFY `type` ENUM('text', 'image', 'audio', 'file') NOT NULL DEFAULT 'text';
