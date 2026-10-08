import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Plans and the daily tool-call meter (PRICING_PLAN.md). No backfill: an organisation with
// no organisation_plans row is on the Free plan, so every existing organisation keeps working
// and no existing site is removed. A row is also meaningless without its organisation, so
// these organisation FKs are ON DELETE CASCADE instead of Payload's default SET NULL, which
// would fail against the NOT NULL columns (see 20260914_095814_cascade_delete_fks.ts).

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_organisation_plans_plan" AS ENUM('free', 'pro', 'agency');
  CREATE TYPE "public"."enum_organisation_plans_status" AS ENUM('active', 'suspended');
  CREATE TYPE "public"."enum_organisation_plans_source" AS ENUM('manual', 'billing');
  CREATE TYPE "public"."enum__organisation_plans_v_version_plan" AS ENUM('free', 'pro', 'agency');
  CREATE TYPE "public"."enum__organisation_plans_v_version_status" AS ENUM('active', 'suspended');
  CREATE TYPE "public"."enum__organisation_plans_v_version_source" AS ENUM('manual', 'billing');
  ALTER TYPE "public"."enum_activity_events_error_code" ADD VALUE 'plan_limit' BEFORE 'tool_error';
  CREATE TABLE "organisation_plans" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"organisation_id" integer NOT NULL,
  	"plan" "enum_organisation_plans_plan" DEFAULT 'pro' NOT NULL,
  	"status" "enum_organisation_plans_status" DEFAULT 'active' NOT NULL,
  	"current_period_end" timestamp(3) with time zone,
  	"max_sites_override" numeric,
  	"daily_tool_calls_override" numeric,
  	"source" "enum_organisation_plans_source" DEFAULT 'manual',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_organisation_plans_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_organisation_id" integer NOT NULL,
  	"version_plan" "enum__organisation_plans_v_version_plan" DEFAULT 'pro' NOT NULL,
  	"version_status" "enum__organisation_plans_v_version_status" DEFAULT 'active' NOT NULL,
  	"version_current_period_end" timestamp(3) with time zone,
  	"version_max_sites_override" numeric,
  	"version_daily_tool_calls_override" numeric,
  	"version_source" "enum__organisation_plans_v_version_source" DEFAULT 'manual',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "usage_daily" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"organisation_id" integer NOT NULL,
  	"day" varchar NOT NULL,
  	"tool_calls" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "organisation_plans_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "usage_daily_id" integer;
  ALTER TABLE "organisation_plans" ADD CONSTRAINT "organisation_plans_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_organisation_plans_v" ADD CONSTRAINT "_organisation_plans_v_parent_id_organisation_plans_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."organisation_plans"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_organisation_plans_v" ADD CONSTRAINT "_organisation_plans_v_version_organisation_id_organisations_id_fk" FOREIGN KEY ("version_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "usage_daily" ADD CONSTRAINT "usage_daily_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "organisation_plans_organisation_idx" ON "organisation_plans" USING btree ("organisation_id");
  CREATE INDEX "organisation_plans_updated_at_idx" ON "organisation_plans" USING btree ("updated_at");
  CREATE INDEX "organisation_plans_created_at_idx" ON "organisation_plans" USING btree ("created_at");
  CREATE INDEX "_organisation_plans_v_parent_idx" ON "_organisation_plans_v" USING btree ("parent_id");
  CREATE INDEX "_organisation_plans_v_version_version_organisation_idx" ON "_organisation_plans_v" USING btree ("version_organisation_id");
  CREATE INDEX "_organisation_plans_v_version_version_updated_at_idx" ON "_organisation_plans_v" USING btree ("version_updated_at");
  CREATE INDEX "_organisation_plans_v_version_version_created_at_idx" ON "_organisation_plans_v" USING btree ("version_created_at");
  CREATE INDEX "_organisation_plans_v_created_at_idx" ON "_organisation_plans_v" USING btree ("created_at");
  CREATE INDEX "_organisation_plans_v_updated_at_idx" ON "_organisation_plans_v" USING btree ("updated_at");
  CREATE INDEX "usage_daily_organisation_idx" ON "usage_daily" USING btree ("organisation_id");
  CREATE INDEX "usage_daily_updated_at_idx" ON "usage_daily" USING btree ("updated_at");
  CREATE INDEX "usage_daily_created_at_idx" ON "usage_daily" USING btree ("created_at");
  CREATE UNIQUE INDEX "organisation_day_idx" ON "usage_daily" USING btree ("organisation_id","day");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_organisation_plans_fk" FOREIGN KEY ("organisation_plans_id") REFERENCES "public"."organisation_plans"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_usage_daily_fk" FOREIGN KEY ("usage_daily_id") REFERENCES "public"."usage_daily"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_organisation_plans_id_idx" ON "payload_locked_documents_rels" USING btree ("organisation_plans_id");
  CREATE INDEX "payload_locked_documents_rels_usage_daily_id_idx" ON "payload_locked_documents_rels" USING btree ("usage_daily_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "organisation_plans" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_organisation_plans_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "usage_daily" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "organisation_plans" CASCADE;
  DROP TABLE "_organisation_plans_v" CASCADE;
  DROP TABLE "usage_daily" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_organisation_plans_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_usage_daily_fk";
  
  ALTER TABLE "activity_events" ALTER COLUMN "error_code" SET DATA TYPE text;
  DROP TYPE "public"."enum_activity_events_error_code";
  CREATE TYPE "public"."enum_activity_events_error_code" AS ENUM('not_enabled', 'tool_error');
  ALTER TABLE "activity_events" ALTER COLUMN "error_code" SET DATA TYPE "public"."enum_activity_events_error_code" USING "error_code"::"public"."enum_activity_events_error_code";
  DROP INDEX "payload_locked_documents_rels_organisation_plans_id_idx";
  DROP INDEX "payload_locked_documents_rels_usage_daily_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "organisation_plans_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "usage_daily_id";
  DROP TYPE "public"."enum_organisation_plans_plan";
  DROP TYPE "public"."enum_organisation_plans_status";
  DROP TYPE "public"."enum_organisation_plans_source";
  DROP TYPE "public"."enum__organisation_plans_v_version_plan";
  DROP TYPE "public"."enum__organisation_plans_v_version_status";
  DROP TYPE "public"."enum__organisation_plans_v_version_source";`)
}
