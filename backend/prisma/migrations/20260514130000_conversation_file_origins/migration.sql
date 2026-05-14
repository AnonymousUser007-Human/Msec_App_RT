-- AlterTable
ALTER TABLE `messages` ADD COLUMN `file_content_hash` VARCHAR(64) NULL,
    ADD COLUMN `original_submitter_id` VARCHAR(191) NULL,
    ADD COLUMN `is_first_introduction` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `conversation_file_origins` (
    `id` VARCHAR(191) NOT NULL,
    `conversation_id` VARCHAR(191) NOT NULL,
    `content_hash` VARCHAR(64) NOT NULL,
    `first_message_id` VARCHAR(191) NOT NULL,
    `first_sender_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `conversation_file_origins_conversation_id_content_hash_key`(`conversation_id`, `content_hash`),
    UNIQUE INDEX `conversation_file_origins_first_message_id_key`(`first_message_id`),
    INDEX `conversation_file_origins_conversation_id_idx`(`conversation_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `messages_conversation_id_file_content_hash_idx` ON `messages`(`conversation_id`, `file_content_hash`);

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_original_submitter_id_fkey` FOREIGN KEY (`original_submitter_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `conversation_file_origins` ADD CONSTRAINT `conversation_file_origins_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `conversation_file_origins` ADD CONSTRAINT `conversation_file_origins_first_message_id_fkey` FOREIGN KEY (`first_message_id`) REFERENCES `messages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `conversation_file_origins` ADD CONSTRAINT `conversation_file_origins_first_sender_id_fkey` FOREIGN KEY (`first_sender_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
