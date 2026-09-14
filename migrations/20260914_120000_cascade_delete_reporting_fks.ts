import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Follow-up to 20260914_095814_cascade_delete_fks.ts's audit: the reporting
// collections (modules/*/reporting-collections.ts) were added in the very next
// migration (20260914_105016_google_site_hub_reporting.ts), after that audit had
// already run, so their required relationships never got the same treatment and
// were left on Payload's raw default (ON DELETE SET NULL on a NOT NULL column) -
// the exact bug class the prior migration exists to prevent. This surfaced when
// deleting a google-search-console/google-analytics mapping that still has any
// snapshot/lease row referencing it threw a Postgres NOT NULL violation instead of
// actually deleting (see the superadmin/org-admin delete access added to both
// mapping collections' access.delete).
//
// - report_snapshots.mapping_id / report_refresh_leases.mapping_id: a snapshot or
//   lease is meaningless without its mapping, so ON DELETE CASCADE.
// - quota_usage.organisation_id / .wordpress_connection_id: same reasoning - a
//   quota counter without its organisation/connection is meaningless, and both
//   columns are NOT NULL, so CASCADE (matches how wordpress_connections.organisation
//   and google_connections.organisation were fixed in the prior migration).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "google_search_console_report_snapshots" DROP CONSTRAINT "google_search_console_report_snapshots_mapping_id_google_search_console_mappings_id_fk";
    ALTER TABLE "google_search_console_report_snapshots" ADD CONSTRAINT "google_search_console_report_snapshots_mapping_id_google_search_console_mappings_id_fk"
      FOREIGN KEY ("mapping_id") REFERENCES "public"."google_search_console_mappings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    ALTER TABLE "google_search_console_report_refresh_leases" DROP CONSTRAINT "google_search_console_report_refresh_leases_mapping_id_google_search_console_mappings_id_fk";
    ALTER TABLE "google_search_console_report_refresh_leases" ADD CONSTRAINT "google_search_console_report_refresh_leases_mapping_id_google_search_console_mappings_id_fk"
      FOREIGN KEY ("mapping_id") REFERENCES "public"."google_search_console_mappings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    ALTER TABLE "google_search_console_quota_usage" DROP CONSTRAINT "google_search_console_quota_usage_organisation_id_organisations_id_fk";
    ALTER TABLE "google_search_console_quota_usage" ADD CONSTRAINT "google_search_console_quota_usage_organisation_id_organisations_id_fk"
      FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    ALTER TABLE "google_search_console_quota_usage" DROP CONSTRAINT "google_search_console_quota_usage_wordpress_connection_id_wordpress_connections_id_fk";
    ALTER TABLE "google_search_console_quota_usage" ADD CONSTRAINT "google_search_console_quota_usage_wordpress_connection_id_wordpress_connections_id_fk"
      FOREIGN KEY ("wordpress_connection_id") REFERENCES "public"."wordpress_connections"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    ALTER TABLE "google_analytics_report_snapshots" DROP CONSTRAINT "google_analytics_report_snapshots_mapping_id_google_analytics_mappings_id_fk";
    ALTER TABLE "google_analytics_report_snapshots" ADD CONSTRAINT "google_analytics_report_snapshots_mapping_id_google_analytics_mappings_id_fk"
      FOREIGN KEY ("mapping_id") REFERENCES "public"."google_analytics_mappings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    ALTER TABLE "google_analytics_report_refresh_leases" DROP CONSTRAINT "google_analytics_report_refresh_leases_mapping_id_google_analytics_mappings_id_fk";
    ALTER TABLE "google_analytics_report_refresh_leases" ADD CONSTRAINT "google_analytics_report_refresh_leases_mapping_id_google_analytics_mappings_id_fk"
      FOREIGN KEY ("mapping_id") REFERENCES "public"."google_analytics_mappings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    ALTER TABLE "google_analytics_quota_usage" DROP CONSTRAINT "google_analytics_quota_usage_organisation_id_organisations_id_fk";
    ALTER TABLE "google_analytics_quota_usage" ADD CONSTRAINT "google_analytics_quota_usage_organisation_id_organisations_id_fk"
      FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    ALTER TABLE "google_analytics_quota_usage" DROP CONSTRAINT "google_analytics_quota_usage_wordpress_connection_id_wordpress_connections_id_fk";
    ALTER TABLE "google_analytics_quota_usage" ADD CONSTRAINT "google_analytics_quota_usage_wordpress_connection_id_wordpress_connections_id_fk"
      FOREIGN KEY ("wordpress_connection_id") REFERENCES "public"."wordpress_connections"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "google_search_console_report_snapshots" DROP CONSTRAINT "google_search_console_report_snapshots_mapping_id_google_search_console_mappings_id_fk";
    ALTER TABLE "google_search_console_report_snapshots" ADD CONSTRAINT "google_search_console_report_snapshots_mapping_id_google_search_console_mappings_id_fk"
      FOREIGN KEY ("mapping_id") REFERENCES "public"."google_search_console_mappings"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "google_search_console_report_refresh_leases" DROP CONSTRAINT "google_search_console_report_refresh_leases_mapping_id_google_search_console_mappings_id_fk";
    ALTER TABLE "google_search_console_report_refresh_leases" ADD CONSTRAINT "google_search_console_report_refresh_leases_mapping_id_google_search_console_mappings_id_fk"
      FOREIGN KEY ("mapping_id") REFERENCES "public"."google_search_console_mappings"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "google_search_console_quota_usage" DROP CONSTRAINT "google_search_console_quota_usage_organisation_id_organisations_id_fk";
    ALTER TABLE "google_search_console_quota_usage" ADD CONSTRAINT "google_search_console_quota_usage_organisation_id_organisations_id_fk"
      FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "google_search_console_quota_usage" DROP CONSTRAINT "google_search_console_quota_usage_wordpress_connection_id_wordpress_connections_id_fk";
    ALTER TABLE "google_search_console_quota_usage" ADD CONSTRAINT "google_search_console_quota_usage_wordpress_connection_id_wordpress_connections_id_fk"
      FOREIGN KEY ("wordpress_connection_id") REFERENCES "public"."wordpress_connections"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "google_analytics_report_snapshots" DROP CONSTRAINT "google_analytics_report_snapshots_mapping_id_google_analytics_mappings_id_fk";
    ALTER TABLE "google_analytics_report_snapshots" ADD CONSTRAINT "google_analytics_report_snapshots_mapping_id_google_analytics_mappings_id_fk"
      FOREIGN KEY ("mapping_id") REFERENCES "public"."google_analytics_mappings"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "google_analytics_report_refresh_leases" DROP CONSTRAINT "google_analytics_report_refresh_leases_mapping_id_google_analytics_mappings_id_fk";
    ALTER TABLE "google_analytics_report_refresh_leases" ADD CONSTRAINT "google_analytics_report_refresh_leases_mapping_id_google_analytics_mappings_id_fk"
      FOREIGN KEY ("mapping_id") REFERENCES "public"."google_analytics_mappings"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "google_analytics_quota_usage" DROP CONSTRAINT "google_analytics_quota_usage_organisation_id_organisations_id_fk";
    ALTER TABLE "google_analytics_quota_usage" ADD CONSTRAINT "google_analytics_quota_usage_organisation_id_organisations_id_fk"
      FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "google_analytics_quota_usage" DROP CONSTRAINT "google_analytics_quota_usage_wordpress_connection_id_wordpress_connections_id_fk";
    ALTER TABLE "google_analytics_quota_usage" ADD CONSTRAINT "google_analytics_quota_usage_wordpress_connection_id_wordpress_connections_id_fk"
      FOREIGN KEY ("wordpress_connection_id") REFERENCES "public"."wordpress_connections"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  `)
}
