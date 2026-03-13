CREATE TABLE `blog_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`blog_id` text NOT NULL,
	`user_id` text NOT NULL,
	`rating` integer DEFAULT 0,
	`comment` text NOT NULL,
	`parent_review_id` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`blog_id`) REFERENCES `blogs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `blogs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`content` text NOT NULL,
	`slug` text NOT NULL,
	`author_id` text NOT NULL,
	`tags` text DEFAULT '[]',
	`cover_image` text DEFAULT '',
	`cover_image_key` text DEFAULT '',
	`rating` real DEFAULT 0,
	`num_reviews` integer DEFAULT 0,
	`view_count` integer DEFAULT 0,
	`read_time` integer DEFAULT 1,
	`is_featured` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `collection_notes` (
	`collection_id` text NOT NULL,
	`note_id` text NOT NULL,
	`added_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'University',
	`university` text DEFAULT '',
	`slug` text NOT NULL,
	`visibility` text DEFAULT 'private',
	`description` text DEFAULT '',
	`is_premium` integer DEFAULT false,
	`price` real DEFAULT 0,
	`is_archived` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `conversation_participants` (
	`conversation_id` text NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`last_message_id` text,
	`pinned_message_id` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `message_reads` (
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`read_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`content` text,
	`image_url` text,
	`file_url` text,
	`file_name` text,
	`reply_to` text,
	`reactions` text DEFAULT '[]',
	`edited` integer DEFAULT false,
	`deleted_for_everyone` integer DEFAULT false,
	`pinned` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `note_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`user_id` text NOT NULL,
	`rating` integer DEFAULT 0,
	`comment` text NOT NULL,
	`parent_review_id` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`category` text DEFAULT 'University',
	`is_paid` integer DEFAULT false,
	`price` real DEFAULT 0,
	`preview_pages` integer DEFAULT 3,
	`is_archived` integer DEFAULT false,
	`sales_count` integer DEFAULT 0,
	`description` text NOT NULL,
	`university` text NOT NULL,
	`course` text NOT NULL,
	`subject` text NOT NULL,
	`year` text NOT NULL,
	`file_name` text NOT NULL,
	`file_type` text NOT NULL,
	`file_size` real NOT NULL,
	`file_key` text NOT NULL,
	`thumbnail_key` text,
	`preview_key` text,
	`file_path` text,
	`user_id` text NOT NULL,
	`rating` real DEFAULT 0,
	`num_reviews` integer DEFAULT 0,
	`download_count` integer DEFAULT 0,
	`view_count` integer DEFAULT 0,
	`is_featured` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`actor_id` text,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`link` text,
	`is_read` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`category` text NOT NULL,
	`organization` text NOT NULL,
	`advt_no` text,
	`short_description` text,
	`important_dates` text DEFAULT '[]',
	`application_fee` text DEFAULT '[]',
	`fee_mode` text,
	`age_limit` text DEFAULT '{}',
	`vacancy_details` text DEFAULT '[]',
	`how_to_apply` text DEFAULT '[]',
	`selection_process` text DEFAULT '[]',
	`important_links` text DEFAULT '[]',
	`faqs` text DEFAULT '[]',
	`is_published` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`item_type` text NOT NULL,
	`amount` real NOT NULL,
	`notes_snapshot` text DEFAULT '[]',
	`purchased_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`target_note_id` text,
	`target_bundle_id` text,
	`reason` text NOT NULL,
	`details` text NOT NULL,
	`status` text DEFAULT 'pending',
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_bundle_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`university` text NOT NULL,
	`subject` text NOT NULL,
	`requester_id` text NOT NULL,
	`status` text DEFAULT 'pending',
	`fulfilled_by_id` text,
	`fulfillment_note_id` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fulfilled_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`fulfillment_note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `site_analytics` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`date` text NOT NULL,
	`views` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `study_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`exam_date` integer NOT NULL,
	`category` text DEFAULT 'University',
	`resources` text DEFAULT '[]',
	`progress` integer DEFAULT 0,
	`is_public` integer DEFAULT false,
	`clones` integer DEFAULT 0,
	`is_completed` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`buyer_id` text NOT NULL,
	`seller_id` text NOT NULL,
	`note_id` text,
	`bundle_id` text,
	`amount` real NOT NULL,
	`admin_fee` real NOT NULL,
	`seller_earnings` real NOT NULL,
	`razorpay_order_id` text NOT NULL,
	`razorpay_payment_id` text,
	`status` text DEFAULT 'pending',
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`buyer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`bundle_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `universities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text DEFAULT '',
	`logo` text DEFAULT '',
	`cover_image` text DEFAULT '',
	`location` text DEFAULT '',
	`website` text DEFAULT '',
	`meta_title` text DEFAULT '',
	`meta_description` text DEFAULT '',
	`keywords` text DEFAULT '[]',
	`is_active` integer DEFAULT true,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `user_analytics` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`views` integer DEFAULT 0,
	`downloads` integer DEFAULT 0,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_bookmarks` (
	`user_id` text NOT NULL,
	`note_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_follows` (
	`follower_id` text NOT NULL,
	`following_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`following_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password` text,
	`avatar` text DEFAULT '',
	`avatar_key` text DEFAULT '',
	`bio` text DEFAULT '',
	`university` text DEFAULT '',
	`location` text DEFAULT '',
	`wallet_balance` real DEFAULT 0,
	`pending_balance` real DEFAULT 0,
	`payout_schedule` text DEFAULT '[]',
	`payout_details` text DEFAULT '{"upiId":"","bankName":"","accountNumber":"","ifscCode":""}',
	`is_verified_educator` integer DEFAULT false,
	`role` text DEFAULT 'user',
	`last_seen` integer DEFAULT CURRENT_TIMESTAMP,
	`show_last_seen` integer DEFAULT true,
	`note_count` integer DEFAULT 0,
	`blog_count` integer DEFAULT 0,
	`hive_points` integer DEFAULT 0,
	`badges` text DEFAULT '{"list":[], "consistentLearner":{"earnedAt":null, "isActive":false}}',
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blogs_slug_unique` ON `blogs` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `blog_slug_idx` ON `blogs` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `collection_note_pk` ON `collection_notes` (`collection_id`,`note_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `collections_slug_unique` ON `collections` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_collection_name_idx` ON `collections` (`user_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `collection_slug_idx` ON `collections` (`slug`);--> statement-breakpoint
CREATE INDEX `collection_premium_idx` ON `collections` (`is_premium`);--> statement-breakpoint
CREATE UNIQUE INDEX `conv_participant_pk` ON `conversation_participants` (`conversation_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `message_read_pk` ON `message_reads` (`message_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notes_slug_unique` ON `notes` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `note_slug_idx` ON `notes` (`slug`);--> statement-breakpoint
CREATE INDEX `note_category_idx` ON `notes` (`category`);--> statement-breakpoint
CREATE UNIQUE INDEX `opportunities_slug_unique` ON `opportunities` (`slug`);--> statement-breakpoint
CREATE INDEX `opp_publish_idx` ON `opportunities` (`category`,`is_published`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_analytics_path_date_idx` ON `site_analytics` (`path`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `study_events_slug_unique` ON `study_events` (`slug`);--> statement-breakpoint
CREATE INDEX `study_event_public_idx` ON `study_events` (`is_public`);--> statement-breakpoint
CREATE INDEX `study_event_user_idx` ON `study_events` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `universities_slug_unique` ON `universities` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `analytics_user_date_idx` ON `user_analytics` (`user_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookmark_pk` ON `user_bookmarks` (`user_id`,`note_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `follow_pk` ON `user_follows` (`follower_id`,`following_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `user_hive_points_idx` ON `users` (`hive_points`);