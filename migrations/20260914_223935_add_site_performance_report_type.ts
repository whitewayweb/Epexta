import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_google_search_console_report_snapshots_report_type" ADD VALUE 'site_performance';
  ALTER TYPE "public"."enum_google_search_console_report_refresh_leases_report_type" ADD VALUE 'site_performance';
  ALTER TYPE "public"."enum_google_analytics_report_snapshots_report_type" ADD VALUE 'site_performance';
  ALTER TYPE "public"."enum_google_analytics_report_refresh_leases_report_type" ADD VALUE 'site_performance';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "google_search_console_report_snapshots" ALTER COLUMN "report_type" SET DATA TYPE text;
  DROP TYPE "public"."enum_google_search_console_report_snapshots_report_type";
  CREATE TYPE "public"."enum_google_search_console_report_snapshots_report_type" AS ENUM('post_performance', 'compare_periods', 'search_queries', 'index_status');
  ALTER TABLE "google_search_console_report_snapshots" ALTER COLUMN "report_type" SET DATA TYPE "public"."enum_google_search_console_report_snapshots_report_type" USING "report_type"::"public"."enum_google_search_console_report_snapshots_report_type";
  ALTER TABLE "google_search_console_report_refresh_leases" ALTER COLUMN "report_type" SET DATA TYPE text;
  DROP TYPE "public"."enum_google_search_console_report_refresh_leases_report_type";
  CREATE TYPE "public"."enum_google_search_console_report_refresh_leases_report_type" AS ENUM('post_performance', 'compare_periods', 'search_queries', 'index_status');
  ALTER TABLE "google_search_console_report_refresh_leases" ALTER COLUMN "report_type" SET DATA TYPE "public"."enum_google_search_console_report_refresh_leases_report_type" USING "report_type"::"public"."enum_google_search_console_report_refresh_leases_report_type";
  ALTER TABLE "google_analytics_report_snapshots" ALTER COLUMN "report_type" SET DATA TYPE text;
  DROP TYPE "public"."enum_google_analytics_report_snapshots_report_type";
  CREATE TYPE "public"."enum_google_analytics_report_snapshots_report_type" AS ENUM('post_performance', 'compare_periods');
  ALTER TABLE "google_analytics_report_snapshots" ALTER COLUMN "report_type" SET DATA TYPE "public"."enum_google_analytics_report_snapshots_report_type" USING "report_type"::"public"."enum_google_analytics_report_snapshots_report_type";
  ALTER TABLE "google_analytics_report_refresh_leases" ALTER COLUMN "report_type" SET DATA TYPE text;
  DROP TYPE "public"."enum_google_analytics_report_refresh_leases_report_type";
  CREATE TYPE "public"."enum_google_analytics_report_refresh_leases_report_type" AS ENUM('post_performance', 'compare_periods');
  ALTER TABLE "google_analytics_report_refresh_leases" ALTER COLUMN "report_type" SET DATA TYPE "public"."enum_google_analytics_report_refresh_leases_report_type" USING "report_type"::"public"."enum_google_analytics_report_refresh_leases_report_type";`)
}
