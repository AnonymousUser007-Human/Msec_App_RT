-- AlterEnum
ALTER TABLE `messages` MODIFY `type` ENUM('text', 'image', 'audio', 'video', 'file', 'folder') NOT NULL DEFAULT 'text';
