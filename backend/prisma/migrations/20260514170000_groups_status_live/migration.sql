-- AlterTable
ALTER TABLE `conversations` ADD COLUMN `title` VARCHAR(191) NULL,
    ADD COLUMN `avatar` VARCHAR(191) NULL,
    ADD COLUMN `created_by_id` VARCHAR(191) NULL;

ALTER TABLE `conversation_members` ADD COLUMN `role` VARCHAR(32) NOT NULL DEFAULT 'member';

-- CreateTable
CREATE TABLE `status_posts` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `type` ENUM('text', 'image', 'audio', 'video', 'file') NOT NULL DEFAULT 'text',
    `attachment_name` VARCHAR(255) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `status_posts_expires_at_idx`(`expires_at`),
    INDEX `status_posts_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `live_rooms` (
    `id` VARCHAR(191) NOT NULL,
    `host_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ended_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `live_rooms_is_active_started_at_idx`(`is_active`, `started_at`),
    INDEX `live_rooms_host_id_idx`(`host_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `live_participants` (
    `id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `left_at` DATETIME(3) NULL,

    UNIQUE INDEX `live_participants_room_id_user_id_key`(`room_id`, `user_id`),
    INDEX `live_participants_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `status_posts` ADD CONSTRAINT `status_posts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `live_rooms` ADD CONSTRAINT `live_rooms_host_id_fkey` FOREIGN KEY (`host_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `live_participants` ADD CONSTRAINT `live_participants_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `live_rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `live_participants` ADD CONSTRAINT `live_participants_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
