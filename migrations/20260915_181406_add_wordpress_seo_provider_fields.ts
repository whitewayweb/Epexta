import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_wordpress_connections_seo_provider_preference" AS ENUM('auto', 'yoast', 'rank-math', 'aioseo');
  CREATE TYPE "public"."enum_wordpress_connections_seo_profile_state" AS ENUM('confirmed', 'selected', 'ambiguous', 'unknown', 'unsupported', 'unavailable');
  CREATE TYPE "public"."enum_wordpress_connections_seo_provider_observed" AS ENUM('yoast', 'rank-math', 'aioseo');
  ALTER TABLE "wordpress_connections" ADD COLUMN "seo_provider_preference" "enum_wordpress_connections_seo_provider_preference" DEFAULT 'auto';
  ALTER TABLE "wordpress_connections" ADD COLUMN "seo_profile_state" "enum_wordpress_connections_seo_profile_state";
  ALTER TABLE "wordpress_connections" ADD COLUMN "seo_provider_observed" "enum_wordpress_connections_seo_provider_observed";
  ALTER TABLE "wordpress_connections" ADD COLUMN "seo_profile_evidence" jsonb;
  ALTER TABLE "wordpress_connections" ADD COLUMN "seo_profile_observed_at" timestamp(3) with time zone;
  ALTER TABLE "wordpress_connections" ADD COLUMN "seo_profile_error" varchar;`)

  // Backfill: every wordpress-connections row that existed before this migration has
  // never been probed for an SEO provider. Default to "auto" preference and an explicit
  // "unknown" state (not null) so no later code path can mistake an unset value for
  // "confirmed" - state is a probe observation, never inferred from column defaults, and
  // this migration must never mark an existing Yoast-using site as confirmed without a
  // real probe. ADD COLUMN ... DEFAULT already backfills seo_provider_preference; the
  // explicit UPDATE covers seo_profile_state, which has no column default, and is safe to
  // re-run (WHERE-guarded) rather than relying on migration-completion bookkeeping alone.
  await db.execute(sql`
    UPDATE "wordpress_connections"
    SET "seo_profile_state" = 'unknown'
    WHERE "seo_profile_state" IS NULL;
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wordpress_connections" DROP COLUMN "seo_provider_preference";
  ALTER TABLE "wordpress_connections" DROP COLUMN "seo_profile_state";
  ALTER TABLE "wordpress_connections" DROP COLUMN "seo_provider_observed";
  ALTER TABLE "wordpress_connections" DROP COLUMN "seo_profile_evidence";
  ALTER TABLE "wordpress_connections" DROP COLUMN "seo_profile_observed_at";
  ALTER TABLE "wordpress_connections" DROP COLUMN "seo_profile_error";
  DROP TYPE "public"."enum_wordpress_connections_seo_provider_preference";
  DROP TYPE "public"."enum_wordpress_connections_seo_profile_state";
  DROP TYPE "public"."enum_wordpress_connections_seo_provider_observed";`)
}
