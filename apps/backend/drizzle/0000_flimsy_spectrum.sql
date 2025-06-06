CREATE TABLE "messages" (
	"msg_id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"content" text,
	"token_cnt" integer,
	CONSTRAINT "role_check" CHECK ("messages"."role" in ('user', 'assistant'))
);
