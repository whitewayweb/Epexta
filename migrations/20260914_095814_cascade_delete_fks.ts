import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Payload's Postgres adapter defaults every relationship FK to ON DELETE SET NULL,
// regardless of whether the field itself is `required: true` - so deleting a row this
// plan requires to cascade (an Organisation, in particular) throws a NOT NULL
// constraint violation instead of cascading, since Postgres can't null out a NOT NULL
// column. This migration audits every required relationship reachable from
// Organisations (plus a couple of adjacent ones found during the audit - api_keys.user,
// organisations_members.user) and gives each a deliberate ON DELETE action instead of
// leaving Payload's default in place unexamined:
//
// - A required relationship whose row is meaningless without its parent (a connection,
//   mapping, OAuth state, entitlement, or membership row without its organisation/user)
//   gets ON DELETE CASCADE, so deleting the parent actually removes it instead of
//   erroring. This is what makes GOOGLE_PERFORMANCE_PLAN.md's "Organisation deletion"
//   requirement ("deleting an organisation cascades to both modules' connections,
//   mappings, ... for that organisation") true rather than aspirational.
// - `*-mappings.confirmedBy` is different: it's an audit-trail pointer, not part of a
//   mapping's own integrity, so the mapping must survive its confirming user being
//   deleted later. That field was changed to optional (see the DROP NOT NULL above)
//   specifically so ON DELETE SET NULL (already Payload's default for it, unchanged
//   here) can actually apply instead of conflicting with a NOT NULL column.
// - `*-mappings.replacedBy` (self-referential, already optional) is left as SET NULL -
//   unchanged from Payload's default, since a superseded mapping's replacedBy pointer
//   going stale is not otherwise a correctness issue.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "google_search_console_mappings" ALTER COLUMN "confirmed_by_id" DROP NOT NULL;
  ALTER TABLE "google_analytics_mappings" ALTER COLUMN "confirmed_by_id" DROP NOT NULL;`)

  await db.execute(sql`
    ALTER TABLE "wordpress_connections" DROP CONSTRAINT "wordpress_connections_organisation_id_organisations_id_fk";
    ALTER TABLE "wordpress_connections" ADD CONSTRAINT "wordpress_connections_organisation_id_organisations_id_fk"
      FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    ALTER TABLE "module_entitlements" DROP CONSTRAINT "module_entitlements_organisation_id_organisations_id_fk";
    ALTER TABLE "module_entitlements" ADD CONSTRAINT "module_entitlements_organisation_id_organisations_id_fk"
      FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    ALTER TABLE "google_connections" DROP CONSTRAINT "google_connections_organisation_id_organisations_id_fk";
    ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_organisation_id_organisations_id_fk"
      FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    ALTER TABLE "google_oauth_states" DROP CONSTRAINT "google_oauth_states_organisation_id_organisations_id_fk";
    ALTER TABLE "google_oauth_states" ADD CONSTRAINT "google_oauth_states_organisation_id_organisations_id_fk"
      FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    ALTER TABLE "google_oauth_states" DROP CONSTRAINT "google_oauth_states_user_id_users_id_fk";
    ALTER TABLE "google_oauth_states" ADD CONSTRAINT "google_oauth_states_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    ALTER TABLE "google_search_console_mappings" DROP CONSTRAINT "google_search_console_mappings_organisation_id_organisations_id";
    ALTER TABLE "google_search_console_mappings" ADD CONSTRAINT "google_search_console_mappings_organisation_id_organisations_id"
      FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    ALTER TABLE "google_search_console_mappings" DROP CONSTRAINT "google_search_console_mappings_wordpress_connection_id_wordpres";
    ALTER TABLE "google_search_console_mappings" ADD CONSTRAINT "google_search_console_mappings_wordpress_connection_id_wordpres"
      FOREIGN KEY ("wordpress_connection_id") REFERENCES "public"."wordpress_connections"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    ALTER TABLE "google_search_console_mappings" DROP CONSTRAINT "google_search_console_mappings_google_connection_id_google_conn";
    ALTER TABLE "google_search_console_mappings" ADD CONSTRAINT "google_search_console_mappings_google_connection_id_google_conn"
      FOREIGN KEY ("google_connection_id") REFERENCES "public"."google_connections"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    ALTER TABLE "google_analytics_mappings" DROP CONSTRAINT "google_analytics_mappings_organisation_id_organisations_id_fk";
    ALTER TABLE "google_analytics_mappings" ADD CONSTRAINT "google_analytics_mappings_organisation_id_organisations_id_fk"
      FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    ALTER TABLE "google_analytics_mappings" DROP CONSTRAINT "google_analytics_mappings_wordpress_connection_id_wordpress_con";
    ALTER TABLE "google_analytics_mappings" ADD CONSTRAINT "google_analytics_mappings_wordpress_connection_id_wordpress_con"
      FOREIGN KEY ("wordpress_connection_id") REFERENCES "public"."wordpress_connections"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    ALTER TABLE "google_analytics_mappings" DROP CONSTRAINT "google_analytics_mappings_google_connection_id_google_connectio";
    ALTER TABLE "google_analytics_mappings" ADD CONSTRAINT "google_analytics_mappings_google_connection_id_google_connectio"
      FOREIGN KEY ("google_connection_id") REFERENCES "public"."google_connections"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_user_id_users_id_fk";
    ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    ALTER TABLE "organisations_members" DROP CONSTRAINT "organisations_members_user_id_users_id_fk";
    ALTER TABLE "organisations_members" ADD CONSTRAINT "organisations_members_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    -- ModuleEntitlements has versions enabled, which gives it a second table
    -- (_module_entitlements_v) with its own FK to organisations - easy to miss by only
    -- auditing the "real" table, exactly as happened on the first pass here. Its
    -- version_organisation_id column is NOT NULL for the same reason the main table's
    -- is, so it needs the same fix.
    ALTER TABLE "_module_entitlements_v" DROP CONSTRAINT "_module_entitlements_v_version_organisation_id_organisations_id";
    ALTER TABLE "_module_entitlements_v" ADD CONSTRAINT "_module_entitlements_v_version_organisation_id_organisations_id"
      FOREIGN KEY ("version_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "wordpress_connections" DROP CONSTRAINT "wordpress_connections_organisation_id_organisations_id_fk";
    ALTER TABLE "wordpress_connections" ADD CONSTRAINT "wordpress_connections_organisation_id_organisations_id_fk"
      FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "module_entitlements" DROP CONSTRAINT "module_entitlements_organisation_id_organisations_id_fk";
    ALTER TABLE "module_entitlements" ADD CONSTRAINT "module_entitlements_organisation_id_organisations_id_fk"
      FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "google_connections" DROP CONSTRAINT "google_connections_organisation_id_organisations_id_fk";
    ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_organisation_id_organisations_id_fk"
      FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "google_oauth_states" DROP CONSTRAINT "google_oauth_states_organisation_id_organisations_id_fk";
    ALTER TABLE "google_oauth_states" ADD CONSTRAINT "google_oauth_states_organisation_id_organisations_id_fk"
      FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "google_oauth_states" DROP CONSTRAINT "google_oauth_states_user_id_users_id_fk";
    ALTER TABLE "google_oauth_states" ADD CONSTRAINT "google_oauth_states_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "google_search_console_mappings" DROP CONSTRAINT "google_search_console_mappings_organisation_id_organisations_id";
    ALTER TABLE "google_search_console_mappings" ADD CONSTRAINT "google_search_console_mappings_organisation_id_organisations_id"
      FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "google_search_console_mappings" DROP CONSTRAINT "google_search_console_mappings_wordpress_connection_id_wordpres";
    ALTER TABLE "google_search_console_mappings" ADD CONSTRAINT "google_search_console_mappings_wordpress_connection_id_wordpres"
      FOREIGN KEY ("wordpress_connection_id") REFERENCES "public"."wordpress_connections"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "google_search_console_mappings" DROP CONSTRAINT "google_search_console_mappings_google_connection_id_google_conn";
    ALTER TABLE "google_search_console_mappings" ADD CONSTRAINT "google_search_console_mappings_google_connection_id_google_conn"
      FOREIGN KEY ("google_connection_id") REFERENCES "public"."google_connections"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "google_analytics_mappings" DROP CONSTRAINT "google_analytics_mappings_organisation_id_organisations_id_fk";
    ALTER TABLE "google_analytics_mappings" ADD CONSTRAINT "google_analytics_mappings_organisation_id_organisations_id_fk"
      FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "google_analytics_mappings" DROP CONSTRAINT "google_analytics_mappings_wordpress_connection_id_wordpress_con";
    ALTER TABLE "google_analytics_mappings" ADD CONSTRAINT "google_analytics_mappings_wordpress_connection_id_wordpress_con"
      FOREIGN KEY ("wordpress_connection_id") REFERENCES "public"."wordpress_connections"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "google_analytics_mappings" DROP CONSTRAINT "google_analytics_mappings_google_connection_id_google_connectio";
    ALTER TABLE "google_analytics_mappings" ADD CONSTRAINT "google_analytics_mappings_google_connection_id_google_connectio"
      FOREIGN KEY ("google_connection_id") REFERENCES "public"."google_connections"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_user_id_users_id_fk";
    ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "organisations_members" DROP CONSTRAINT "organisations_members_user_id_users_id_fk";
    ALTER TABLE "organisations_members" ADD CONSTRAINT "organisations_members_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

    ALTER TABLE "_module_entitlements_v" DROP CONSTRAINT "_module_entitlements_v_version_organisation_id_organisations_id";
    ALTER TABLE "_module_entitlements_v" ADD CONSTRAINT "_module_entitlements_v_version_organisation_id_organisations_id"
      FOREIGN KEY ("version_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  `)

  await db.execute(sql`
   ALTER TABLE "google_search_console_mappings" ALTER COLUMN "confirmed_by_id" SET NOT NULL;
  ALTER TABLE "google_analytics_mappings" ALTER COLUMN "confirmed_by_id" SET NOT NULL;`)
}
