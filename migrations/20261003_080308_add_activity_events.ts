import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// An event is meaningless without its organisation, so that FK is ON DELETE CASCADE instead of
// Payload's default SET NULL (which would fail against the NOT NULL column - see
// 20260914_095814_cascade_delete_fks.ts). The user FK stays SET NULL: the feed keeps the
// event, and actor_label keeps the name.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_activity_events_module" AS ENUM('wordpress', 'google-search-console', 'google-analytics');
  CREATE TYPE "public"."enum_activity_events_kind" AS ENUM('read', 'create', 'update');
  CREATE TYPE "public"."enum_activity_events_outcome" AS ENUM('success', 'failure');
  CREATE TYPE "public"."enum_activity_events_source" AS ENUM('api-key', 'oauth');
  CREATE TYPE "public"."enum_activity_events_error_code" AS ENUM('not_enabled', 'tool_error');
  CREATE TABLE "activity_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"organisation_id" integer NOT NULL,
  	"user_id" integer,
  	"actor_label" varchar,
  	"module" "enum_activity_events_module" NOT NULL,
  	"tool" varchar NOT NULL,
  	"kind" "enum_activity_events_kind" NOT NULL,
  	"outcome" "enum_activity_events_outcome" NOT NULL,
  	"summary" varchar NOT NULL,
  	"site_label" varchar,
  	"source" "enum_activity_events_source" NOT NULL,
  	"client" varchar,
  	"error_code" "enum_activity_events_error_code",
  	"duration_ms" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "activity_events_id" integer;
  ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "activity_events_organisation_idx" ON "activity_events" USING btree ("organisation_id");
  CREATE INDEX "activity_events_user_idx" ON "activity_events" USING btree ("user_id");
  CREATE INDEX "activity_events_updated_at_idx" ON "activity_events" USING btree ("updated_at");
  CREATE INDEX "activity_events_created_at_idx" ON "activity_events" USING btree ("created_at");
  CREATE INDEX "organisation_createdAt_idx" ON "activity_events" USING btree ("organisation_id","created_at");
  CREATE INDEX "organisation_module_createdAt_idx" ON "activity_events" USING btree ("organisation_id","module","created_at");
  CREATE INDEX "organisation_user_createdAt_idx" ON "activity_events" USING btree ("organisation_id","user_id","created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_activity_events_fk" FOREIGN KEY ("activity_events_id") REFERENCES "public"."activity_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_activity_events_id_idx" ON "payload_locked_documents_rels" USING btree ("activity_events_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "activity_events" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "activity_events" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_activity_events_fk";
  
  DROP INDEX "payload_locked_documents_rels_activity_events_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "activity_events_id";
  DROP TYPE "public"."enum_activity_events_module";
  DROP TYPE "public"."enum_activity_events_kind";
  DROP TYPE "public"."enum_activity_events_outcome";
  DROP TYPE "public"."enum_activity_events_source";
  DROP TYPE "public"."enum_activity_events_error_code";`)
}
