import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_google_search_console_mappings_status" AS ENUM('active', 'needs_reconnect', 'needs_remapping', 'superseded');
  CREATE TYPE "public"."enum_google_analytics_mappings_status" AS ENUM('active', 'needs_reconnect', 'needs_remapping', 'superseded');
  CREATE TABLE "google_search_console_mappings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"organisation_id" integer NOT NULL,
  	"wordpress_connection_id" integer NOT NULL,
  	"google_connection_id" integer NOT NULL,
  	"search_console_property_url" varchar NOT NULL,
  	"confirmed_by_id" integer NOT NULL,
  	"confirmed_at" timestamp(3) with time zone NOT NULL,
  	"last_validated_at" timestamp(3) with time zone,
  	"status" "enum_google_search_console_mappings_status" DEFAULT 'active' NOT NULL,
  	"replaced_at" timestamp(3) with time zone,
  	"replaced_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "google_analytics_mappings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"organisation_id" integer NOT NULL,
  	"wordpress_connection_id" integer NOT NULL,
  	"google_connection_id" integer NOT NULL,
  	"ga4_property_id" varchar NOT NULL,
  	"reporting_timezone" varchar,
  	"confirmed_by_id" integer NOT NULL,
  	"confirmed_at" timestamp(3) with time zone NOT NULL,
  	"last_validated_at" timestamp(3) with time zone,
  	"status" "enum_google_analytics_mappings_status" DEFAULT 'active' NOT NULL,
  	"replaced_at" timestamp(3) with time zone,
  	"replaced_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "google_search_console_mappings_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "google_analytics_mappings_id" integer;
  ALTER TABLE "google_search_console_mappings" ADD CONSTRAINT "google_search_console_mappings_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "google_search_console_mappings" ADD CONSTRAINT "google_search_console_mappings_wordpress_connection_id_wordpress_connections_id_fk" FOREIGN KEY ("wordpress_connection_id") REFERENCES "public"."wordpress_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "google_search_console_mappings" ADD CONSTRAINT "google_search_console_mappings_google_connection_id_google_connections_id_fk" FOREIGN KEY ("google_connection_id") REFERENCES "public"."google_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "google_search_console_mappings" ADD CONSTRAINT "google_search_console_mappings_confirmed_by_id_users_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "google_search_console_mappings" ADD CONSTRAINT "google_search_console_mappings_replaced_by_id_google_search_console_mappings_id_fk" FOREIGN KEY ("replaced_by_id") REFERENCES "public"."google_search_console_mappings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "google_analytics_mappings" ADD CONSTRAINT "google_analytics_mappings_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "google_analytics_mappings" ADD CONSTRAINT "google_analytics_mappings_wordpress_connection_id_wordpress_connections_id_fk" FOREIGN KEY ("wordpress_connection_id") REFERENCES "public"."wordpress_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "google_analytics_mappings" ADD CONSTRAINT "google_analytics_mappings_google_connection_id_google_connections_id_fk" FOREIGN KEY ("google_connection_id") REFERENCES "public"."google_connections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "google_analytics_mappings" ADD CONSTRAINT "google_analytics_mappings_confirmed_by_id_users_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "google_analytics_mappings" ADD CONSTRAINT "google_analytics_mappings_replaced_by_id_google_analytics_mappings_id_fk" FOREIGN KEY ("replaced_by_id") REFERENCES "public"."google_analytics_mappings"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "google_search_console_mappings_organisation_idx" ON "google_search_console_mappings" USING btree ("organisation_id");
  CREATE INDEX "google_search_console_mappings_wordpress_connection_idx" ON "google_search_console_mappings" USING btree ("wordpress_connection_id");
  CREATE INDEX "google_search_console_mappings_google_connection_idx" ON "google_search_console_mappings" USING btree ("google_connection_id");
  CREATE INDEX "google_search_console_mappings_confirmed_by_idx" ON "google_search_console_mappings" USING btree ("confirmed_by_id");
  CREATE INDEX "google_search_console_mappings_status_idx" ON "google_search_console_mappings" USING btree ("status");
  CREATE INDEX "google_search_console_mappings_replaced_by_idx" ON "google_search_console_mappings" USING btree ("replaced_by_id");
  CREATE INDEX "google_search_console_mappings_updated_at_idx" ON "google_search_console_mappings" USING btree ("updated_at");
  CREATE INDEX "google_search_console_mappings_created_at_idx" ON "google_search_console_mappings" USING btree ("created_at");
  CREATE INDEX "google_analytics_mappings_organisation_idx" ON "google_analytics_mappings" USING btree ("organisation_id");
  CREATE INDEX "google_analytics_mappings_wordpress_connection_idx" ON "google_analytics_mappings" USING btree ("wordpress_connection_id");
  CREATE INDEX "google_analytics_mappings_google_connection_idx" ON "google_analytics_mappings" USING btree ("google_connection_id");
  CREATE INDEX "google_analytics_mappings_confirmed_by_idx" ON "google_analytics_mappings" USING btree ("confirmed_by_id");
  CREATE INDEX "google_analytics_mappings_status_idx" ON "google_analytics_mappings" USING btree ("status");
  CREATE INDEX "google_analytics_mappings_replaced_by_idx" ON "google_analytics_mappings" USING btree ("replaced_by_id");
  CREATE INDEX "google_analytics_mappings_updated_at_idx" ON "google_analytics_mappings" USING btree ("updated_at");
  CREATE INDEX "google_analytics_mappings_created_at_idx" ON "google_analytics_mappings" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_google_search_console_mappi_fk" FOREIGN KEY ("google_search_console_mappings_id") REFERENCES "public"."google_search_console_mappings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_google_analytics_mappings_fk" FOREIGN KEY ("google_analytics_mappings_id") REFERENCES "public"."google_analytics_mappings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_google_search_console_mapp_idx" ON "payload_locked_documents_rels" USING btree ("google_search_console_mappings_id");
  CREATE INDEX "payload_locked_documents_rels_google_analytics_mappings__idx" ON "payload_locked_documents_rels" USING btree ("google_analytics_mappings_id");`)

  // Postgres partial unique indexes - Payload's CollectionConfig.indexes has no `where`
  // option, so these are hand-written here rather than generated. This is what actually
  // enforces "one active mapping per WordPress connection, per module" at the database
  // level, even under two concurrent mapping-replacement requests - an application-level
  // "check then insert" would let both observe zero active mappings and both insert one.
  // See "Mappings are capability-specific" in GOOGLE_PERFORMANCE_PLAN.md.
  await db.execute(sql`
    CREATE UNIQUE INDEX "google_search_console_mappings_one_active_per_site_idx"
      ON "google_search_console_mappings" ("wordpress_connection_id")
      WHERE "status" = 'active';
    CREATE UNIQUE INDEX "google_analytics_mappings_one_active_per_site_idx"
      ON "google_analytics_mappings" ("wordpress_connection_id")
      WHERE "status" = 'active';
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX "google_search_console_mappings_one_active_per_site_idx";
    DROP INDEX "google_analytics_mappings_one_active_per_site_idx";
  `)

  await db.execute(sql`
   ALTER TABLE "google_search_console_mappings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "google_analytics_mappings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "google_search_console_mappings" CASCADE;
  DROP TABLE "google_analytics_mappings" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_google_search_console_mappi_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_google_analytics_mappings_fk";
  
  DROP INDEX "payload_locked_documents_rels_google_search_console_mapp_idx";
  DROP INDEX "payload_locked_documents_rels_google_analytics_mappings__idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "google_search_console_mappings_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "google_analytics_mappings_id";
  DROP TYPE "public"."enum_google_search_console_mappings_status";
  DROP TYPE "public"."enum_google_analytics_mappings_status";`)
}
