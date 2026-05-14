-- AlterTable
ALTER TABLE `messages` ADD COLUMN `edited_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `status_posts` ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
