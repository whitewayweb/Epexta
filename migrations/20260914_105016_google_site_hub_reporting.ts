import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_google_search_console_report_snapshots_report_type" AS ENUM('post_performance', 'compare_periods', 'search_queries', 'index_status');
  CREATE TYPE "public"."enum_google_search_console_report_snapshots_freshness_state" AS ENUM('fresh', 'stale', 'delayed', 'unavailable');
  CREATE TYPE "public"."enum_google_search_console_report_refresh_leases_report_type" AS ENUM('post_performance', 'compare_periods', 'search_queries', 'index_status');
  CREATE TYPE "public"."enum_google_analytics_report_snapshots_report_type" AS ENUM('post_performance', 'compare_periods');
  CREATE TYPE "public"."enum_google_analytics_report_snapshots_freshness_state" AS ENUM('fresh', 'stale', 'delayed', 'unavailable');
  CREATE TYPE "public"."enum_google_analytics_report_refresh_leases_report_type" AS ENUM('post_performance', 'compare_periods');
  CREATE TABLE "google_search_console_report_snapshots" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"mapping_id" integer NOT NULL,
  	"report_type" "enum_google_search_console_report_snapshots_report_type" NOT NULL,
  	"canonical_post_url" varchar NOT NULL,
  	"normalized_query_params" varchar,
  	"date_range_start" timestamp(3) with time zone NOT NULL,
  	"date_range_end" timestamp(3) with time zone NOT NULL,
  	"timezone" varchar NOT NULL,
  	"fetched_at" timestamp(3) with time zone NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"freshness_state" "enum_google_search_console_report_snapshots_freshness_state" NOT NULL,
  	"payload" jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "google_search_console_report_refresh_leases" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"mapping_id" integer NOT NULL,
  	"report_type" "enum_google_search_console_report_refresh_leases_report_type" NOT NULL,
  	"canonical_post_url" varchar NOT NULL,
  	"normalized_query_params" varchar,
  	"date_range_start" timestamp(3) with time zone NOT NULL,
  	"date_range_end" timestamp(3) with time zone NOT NULL,
  	"lease_holder" varchar NOT NULL,
  	"lease_expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "google_search_console_quota_usage" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"organisation_id" integer NOT NULL,
  	"wordpress_connection_id" integer NOT NULL,
  	"window_start" timestamp(3) with time zone NOT NULL,
  	"request_count" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "google_analytics_report_snapshots" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"mapping_id" integer NOT NULL,
  	"report_type" "enum_google_analytics_report_snapshots_report_type" NOT NULL,
  	"canonical_post_url" varchar NOT NULL,
  	"normalized_query_params" varchar,
  	"date_range_start" timestamp(3) with time zone NOT NULL,
  	"date_range_end" timestamp(3) with time zone NOT NULL,
  	"timezone" varchar NOT NULL,
  	"fetched_at" timestamp(3) with time zone NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"freshness_state" "enum_google_analytics_report_snapshots_freshness_state" NOT NULL,
  	"payload" jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "google_analytics_report_refresh_leases" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"mapping_id" integer NOT NULL,
  	"report_type" "enum_google_analytics_report_refresh_leases_report_type" NOT NULL,
  	"canonical_post_url" varchar NOT NULL,
  	"normalized_query_params" varchar,
  	"date_range_start" timestamp(3) with time zone NOT NULL,
  	"date_range_end" timestamp(3) with time zone NOT NULL,
  	"lease_holder" varchar NOT NULL,
  	"lease_expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "google_analytics_quota_usage" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"organisation_id" integer NOT NULL,
  	"wordpress_connection_id" integer NOT NULL,
  	"window_start" timestamp(3) with time zone NOT NULL,
  	"request_count" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ga4_property_quota" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"ga4_property_id" varchar NOT NULL,
  	"tokens_remaining" numeric,
  	"tokens_per_hour" numeric,
  	"tokens_per_day" numeric,
  	"concurrent_requests" numeric,
  	"last_observed_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ga4_project_property_quota" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"ga4_property_id" varchar NOT NULL,
  	"google_cloud_project_id" varchar NOT NULL,
  	"tokens_remaining" numeric,
  	"tokens_per_hour" numeric,
  	"tokens_per_day" numeric,
  	"concurrent_requests" numeric,
  	"last_observed_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "google_search_console_report_snapshots_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "google_search_console_report_refresh_leases_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "google_search_console_quota_usage_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "google_analytics_report_snapshots_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "google_analytics_report_refresh_leases_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "google_analytics_quota_usage_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ga4_property_quota_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ga4_project_property_quota_id" integer;
  ALTER TABLE "google_search_console_report_snapshots" ADD CONSTRAINT "google_search_console_report_snapshots_mapping_id_google_search_console_mappings_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."google_search_console_mappings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "google_search_console_report_refresh_leases" ADD CONSTRAINT "google_search_console_report_refresh_leases_mapping_id_google_search_console_mappings_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."google_search_console_mappings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "google_search_console_quota_usage" ADD CONSTRAINT "google_search_console_quota_usage_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "google_search_console_quota_usage" ADD CONSTRAINT "google_search_console_quota_usage_wordpress_connection_id_wordpress_connections_id_fk" FOREIGN KEY ("wordpress_connection_id") REFERENCES "public"."wordpress_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "google_analytics_report_snapshots" ADD CONSTRAINT "google_analytics_report_snapshots_mapping_id_google_analytics_mappings_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."google_analytics_mappings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "google_analytics_report_refresh_leases" ADD CONSTRAINT "google_analytics_report_refresh_leases_mapping_id_google_analytics_mappings_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."google_analytics_mappings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "google_analytics_quota_usage" ADD CONSTRAINT "google_analytics_quota_usage_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "google_analytics_quota_usage" ADD CONSTRAINT "google_analytics_quota_usage_wordpress_connection_id_wordpress_connections_id_fk" FOREIGN KEY ("wordpress_connection_id") REFERENCES "public"."wordpress_connections"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "google_search_console_report_snapshots_mapping_idx" ON "google_search_console_report_snapshots" USING btree ("mapping_id");
  CREATE INDEX "google_search_console_report_snapshots_expires_at_idx" ON "google_search_console_report_snapshots" USING btree ("expires_at");
  CREATE INDEX "google_search_console_report_snapshots_updated_at_idx" ON "google_search_console_report_snapshots" USING btree ("updated_at");
  CREATE INDEX "google_search_console_report_snapshots_created_at_idx" ON "google_search_console_report_snapshots" USING btree ("created_at");
  CREATE UNIQUE INDEX "compound_index_idx" ON "google_search_console_report_snapshots" USING btree ("mapping_id","report_type","canonical_post_url","normalized_query_params","date_range_start","date_range_end");
  CREATE INDEX "google_search_console_report_refresh_leases_mapping_idx" ON "google_search_console_report_refresh_leases" USING btree ("mapping_id");
  CREATE INDEX "google_search_console_report_refresh_leases_lease_expire_idx" ON "google_search_console_report_refresh_leases" USING btree ("lease_expires_at");
  CREATE INDEX "google_search_console_report_refresh_leases_updated_at_idx" ON "google_search_console_report_refresh_leases" USING btree ("updated_at");
  CREATE INDEX "google_search_console_report_refresh_leases_created_at_idx" ON "google_search_console_report_refresh_leases" USING btree ("created_at");
  CREATE UNIQUE INDEX "compound_index_1_idx" ON "google_search_console_report_refresh_leases" USING btree ("mapping_id","report_type","canonical_post_url","normalized_query_params","date_range_start","date_range_end");
  CREATE INDEX "google_search_console_quota_usage_organisation_idx" ON "google_search_console_quota_usage" USING btree ("organisation_id");
  CREATE INDEX "google_search_console_quota_usage_wordpress_connection_idx" ON "google_search_console_quota_usage" USING btree ("wordpress_connection_id");
  CREATE INDEX "google_search_console_quota_usage_updated_at_idx" ON "google_search_console_quota_usage" USING btree ("updated_at");
  CREATE INDEX "google_search_console_quota_usage_created_at_idx" ON "google_search_console_quota_usage" USING btree ("created_at");
  CREATE UNIQUE INDEX "organisation_wordpressConnection_windowStart_idx" ON "google_search_console_quota_usage" USING btree ("organisation_id","wordpress_connection_id","window_start");
  CREATE INDEX "google_analytics_report_snapshots_mapping_idx" ON "google_analytics_report_snapshots" USING btree ("mapping_id");
  CREATE INDEX "google_analytics_report_snapshots_expires_at_idx" ON "google_analytics_report_snapshots" USING btree ("expires_at");
  CREATE INDEX "google_analytics_report_snapshots_updated_at_idx" ON "google_analytics_report_snapshots" USING btree ("updated_at");
  CREATE INDEX "google_analytics_report_snapshots_created_at_idx" ON "google_analytics_report_snapshots" USING btree ("created_at");
  CREATE UNIQUE INDEX "compound_index_2_idx" ON "google_analytics_report_snapshots" USING btree ("mapping_id","report_type","canonical_post_url","normalized_query_params","date_range_start","date_range_end");
  CREATE INDEX "google_analytics_report_refresh_leases_mapping_idx" ON "google_analytics_report_refresh_leases" USING btree ("mapping_id");
  CREATE INDEX "google_analytics_report_refresh_leases_lease_expires_at_idx" ON "google_analytics_report_refresh_leases" USING btree ("lease_expires_at");
  CREATE INDEX "google_analytics_report_refresh_leases_updated_at_idx" ON "google_analytics_report_refresh_leases" USING btree ("updated_at");
  CREATE INDEX "google_analytics_report_refresh_leases_created_at_idx" ON "google_analytics_report_refresh_leases" USING btree ("created_at");
  CREATE UNIQUE INDEX "compound_index_3_idx" ON "google_analytics_report_refresh_leases" USING btree ("mapping_id","report_type","canonical_post_url","normalized_query_params","date_range_start","date_range_end");
  CREATE INDEX "google_analytics_quota_usage_organisation_idx" ON "google_analytics_quota_usage" USING btree ("organisation_id");
  CREATE INDEX "google_analytics_quota_usage_wordpress_connection_idx" ON "google_analytics_quota_usage" USING btree ("wordpress_connection_id");
  CREATE INDEX "google_analytics_quota_usage_updated_at_idx" ON "google_analytics_quota_usage" USING btree ("updated_at");
  CREATE INDEX "google_analytics_quota_usage_created_at_idx" ON "google_analytics_quota_usage" USING btree ("created_at");
  CREATE UNIQUE INDEX "organisation_wordpressConnection_windowStart_1_idx" ON "google_analytics_quota_usage" USING btree ("organisation_id","wordpress_connection_id","window_start");
  CREATE UNIQUE INDEX "ga4_property_quota_ga4_property_id_idx" ON "ga4_property_quota" USING btree ("ga4_property_id");
  CREATE INDEX "ga4_property_quota_updated_at_idx" ON "ga4_property_quota" USING btree ("updated_at");
  CREATE INDEX "ga4_property_quota_created_at_idx" ON "ga4_property_quota" USING btree ("created_at");
  CREATE INDEX "ga4_project_property_quota_ga4_property_id_idx" ON "ga4_project_property_quota" USING btree ("ga4_property_id");
  CREATE INDEX "ga4_project_property_quota_updated_at_idx" ON "ga4_project_property_quota" USING btree ("updated_at");
  CREATE INDEX "ga4_project_property_quota_created_at_idx" ON "ga4_project_property_quota" USING btree ("created_at");
  CREATE UNIQUE INDEX "ga4PropertyId_googleCloudProjectId_idx" ON "ga4_project_property_quota" USING btree ("ga4_property_id","google_cloud_project_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_google_search_console_repor_fk" FOREIGN KEY ("google_search_console_report_snapshots_id") REFERENCES "public"."google_search_console_report_snapshots"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_google_search_console_rep_1_fk" FOREIGN KEY ("google_search_console_report_refresh_leases_id") REFERENCES "public"."google_search_console_report_refresh_leases"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_google_search_console_quota_fk" FOREIGN KEY ("google_search_console_quota_usage_id") REFERENCES "public"."google_search_console_quota_usage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_google_analytics_report_sna_fk" FOREIGN KEY ("google_analytics_report_snapshots_id") REFERENCES "public"."google_analytics_report_snapshots"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_google_analytics_report_ref_fk" FOREIGN KEY ("google_analytics_report_refresh_leases_id") REFERENCES "public"."google_analytics_report_refresh_leases"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_google_analytics_quota_usag_fk" FOREIGN KEY ("google_analytics_quota_usage_id") REFERENCES "public"."google_analytics_quota_usage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ga4_property_quota_fk" FOREIGN KEY ("ga4_property_quota_id") REFERENCES "public"."ga4_property_quota"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ga4_project_property_quota_fk" FOREIGN KEY ("ga4_project_property_quota_id") REFERENCES "public"."ga4_project_property_quota"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_google_search_console_repo_idx" ON "payload_locked_documents_rels" USING btree ("google_search_console_report_snapshots_id");
  CREATE INDEX "payload_locked_documents_rels_google_search_console_re_1_idx" ON "payload_locked_documents_rels" USING btree ("google_search_console_report_refresh_leases_id");
  CREATE INDEX "payload_locked_documents_rels_google_search_console_quot_idx" ON "payload_locked_documents_rels" USING btree ("google_search_console_quota_usage_id");
  CREATE INDEX "payload_locked_documents_rels_google_analytics_report_sn_idx" ON "payload_locked_documents_rels" USING btree ("google_analytics_report_snapshots_id");
  CREATE INDEX "payload_locked_documents_rels_google_analytics_report_re_idx" ON "payload_locked_documents_rels" USING btree ("google_analytics_report_refresh_leases_id");
  CREATE INDEX "payload_locked_documents_rels_google_analytics_quota_usa_idx" ON "payload_locked_documents_rels" USING btree ("google_analytics_quota_usage_id");
  CREATE INDEX "payload_locked_documents_rels_ga4_property_quota_id_idx" ON "payload_locked_documents_rels" USING btree ("ga4_property_quota_id");
  CREATE INDEX "payload_locked_documents_rels_ga4_project_property_quota_idx" ON "payload_locked_documents_rels" USING btree ("ga4_project_property_quota_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "google_search_console_report_snapshots" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "google_search_console_report_refresh_leases" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "google_search_console_quota_usage" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "google_analytics_report_snapshots" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "google_analytics_report_refresh_leases" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "google_analytics_quota_usage" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ga4_property_quota" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ga4_project_property_quota" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "google_search_console_report_snapshots" CASCADE;
  DROP TABLE "google_search_console_report_refresh_leases" CASCADE;
  DROP TABLE "google_search_console_quota_usage" CASCADE;
  DROP TABLE "google_analytics_report_snapshots" CASCADE;
  DROP TABLE "google_analytics_report_refresh_leases" CASCADE;
  DROP TABLE "google_analytics_quota_usage" CASCADE;
  DROP TABLE "ga4_property_quota" CASCADE;
  DROP TABLE "ga4_project_property_quota" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_google_search_console_repor_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_google_search_console_rep_1_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_google_search_console_quota_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_google_analytics_report_sna_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_google_analytics_report_ref_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_google_analytics_quota_usag_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ga4_property_quota_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ga4_project_property_quota_fk";
  
  DROP INDEX "payload_locked_documents_rels_google_search_console_repo_idx";
  DROP INDEX "payload_locked_documents_rels_google_search_console_re_1_idx";
  DROP INDEX "payload_locked_documents_rels_google_search_console_quot_idx";
  DROP INDEX "payload_locked_documents_rels_google_analytics_report_sn_idx";
  DROP INDEX "payload_locked_documents_rels_google_analytics_report_re_idx";
  DROP INDEX "payload_locked_documents_rels_google_analytics_quota_usa_idx";
  DROP INDEX "payload_locked_documents_rels_ga4_property_quota_id_idx";
  DROP INDEX "payload_locked_documents_rels_ga4_project_property_quota_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "google_search_console_report_snapshots_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "google_search_console_report_refresh_leases_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "google_search_console_quota_usage_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "google_analytics_report_snapshots_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "google_analytics_report_refresh_leases_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "google_analytics_quota_usage_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ga4_property_quota_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ga4_project_property_quota_id";
  DROP TYPE "public"."enum_google_search_console_report_snapshots_report_type";
  DROP TYPE "public"."enum_google_search_console_report_snapshots_freshness_state";
  DROP TYPE "public"."enum_google_search_console_report_refresh_leases_report_type";
  DROP TYPE "public"."enum_google_analytics_report_snapshots_report_type";
  DROP TYPE "public"."enum_google_analytics_report_snapshots_freshness_state";
  DROP TYPE "public"."enum_google_analytics_report_refresh_leases_report_type";`)
}
