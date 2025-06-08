ALTER TABLE "messages" DROP CONSTRAINT "role_check";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "emb" vector(3072);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "embed_ready" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "priority" real;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "role_check" CHECK ("messages"."role" in ('user', 'assistant', 'system', 'introspection'));