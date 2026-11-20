CREATE TABLE `ai_quota` (
	`utc_day` text NOT NULL,
	`client_tag` text NOT NULL,
	`admitted` integer NOT NULL,
	PRIMARY KEY(`utc_day`, `client_tag`),
	CONSTRAINT "positive_admission" CHECK(admitted > 0)
);
