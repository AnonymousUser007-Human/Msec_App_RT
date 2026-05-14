-- AlterTable
ALTER TABLE `messages` ADD COLUMN `reply_to_id` VARCHAR(191) NULL,
    ADD COLUMN `forwarded_from_message_id` VARCHAR(191) NULL;

CREATE INDEX `messages_reply_to_id_idx` ON `messages`(`reply_to_id`);
CREATE INDEX `messages_forwarded_from_message_id_idx` ON `messages`(`forwarded_from_message_id`);

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_reply_to_id_fkey` FOREIGN KEY (`reply_to_id`) REFERENCES `messages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `messages` ADD CONSTRAINT `messages_forwarded_from_message_id_fkey` FOREIGN KEY (`forwarded_from_message_id`) REFERENCES `messages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
