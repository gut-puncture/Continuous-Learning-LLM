CREATE TABLE "cluster_members" (
	"membership_id" bigserial PRIMARY KEY NOT NULL,
	"cluster_id" integer NOT NULL,
	"msg_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "clusters" (
	"cluster_id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"cluster_name" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "kg_edges" (
	"edge_id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_id" integer NOT NULL,
	"relation" text NOT NULL,
	"object_id" integer NOT NULL,
	"weight" integer DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "kg_nodes" (
	"node_id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"emb" vector(3072),
	"degree" integer DEFAULT 0,
	"eig_cent" real DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "msg_to_node" (
	"mapping_id" bigserial PRIMARY KEY NOT NULL,
	"msg_id" integer NOT NULL,
	"node_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sentiment" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "excitement" real;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "helpfulness" real;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "novelty" real;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "centrality" real;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "metrics_ready" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "duplicate_of" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "dedup_ready" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "cluster_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "cluster_members_unique" ON "cluster_members" USING btree ("cluster_id","msg_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kg_edges_unique" ON "kg_edges" USING btree ("user_id","subject_id","relation","object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kg_nodes_user_label_unique" ON "kg_nodes" USING btree ("user_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "msg_to_node_unique" ON "msg_to_node" USING btree ("msg_id","node_id");