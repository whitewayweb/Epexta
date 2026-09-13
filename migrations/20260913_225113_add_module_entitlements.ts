import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_module_entitlements_module_slug" AS ENUM('wordpress');
  CREATE TYPE "public"."enum_module_entitlements_source" AS ENUM('manual', 'billing', 'migration');
  CREATE TYPE "public"."enum__module_entitlements_v_version_module_slug" AS ENUM('wordpress');
  CREATE TYPE "public"."enum__module_entitlements_v_version_source" AS ENUM('manual', 'billing', 'migration');
  CREATE TABLE "module_entitlements" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"organisation_id" integer NOT NULL,
  	"module_slug" "enum_module_entitlements_module_slug" NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"source" "enum_module_entitlements_source" DEFAULT 'manual',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_module_entitlements_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_organisation_id" integer NOT NULL,
  	"version_module_slug" "enum__module_entitlements_v_version_module_slug" NOT NULL,
  	"version_enabled" boolean DEFAULT true,
  	"version_source" "enum__module_entitlements_v_version_source" DEFAULT 'manual',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "module_entitlements_id" integer;
  ALTER TABLE "module_entitlements" ADD CONSTRAINT "module_entitlements_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_module_entitlements_v" ADD CONSTRAINT "_module_entitlements_v_parent_id_module_entitlements_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."module_entitlements"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_module_entitlements_v" ADD CONSTRAINT "_module_entitlements_v_version_organisation_id_organisations_id_fk" FOREIGN KEY ("version_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "module_entitlements_organisation_idx" ON "module_entitlements" USING btree ("organisation_id");
  CREATE INDEX "module_entitlements_updated_at_idx" ON "module_entitlements" USING btree ("updated_at");
  CREATE INDEX "module_entitlements_created_at_idx" ON "module_entitlements" USING btree ("created_at");
  CREATE UNIQUE INDEX "organisation_moduleSlug_idx" ON "module_entitlements" USING btree ("organisation_id","module_slug");
  CREATE INDEX "_module_entitlements_v_parent_idx" ON "_module_entitlements_v" USING btree ("parent_id");
  CREATE INDEX "_module_entitlements_v_version_version_organisation_idx" ON "_module_entitlements_v" USING btree ("version_organisation_id");
  CREATE INDEX "_module_entitlements_v_version_version_updated_at_idx" ON "_module_entitlements_v" USING btree ("version_updated_at");
  CREATE INDEX "_module_entitlements_v_version_version_created_at_idx" ON "_module_entitlements_v" USING btree ("version_created_at");
  CREATE INDEX "_module_entitlements_v_created_at_idx" ON "_module_entitlements_v" USING btree ("created_at");
  CREATE INDEX "_module_entitlements_v_updated_at_idx" ON "_module_entitlements_v" USING btree ("updated_at");
  CREATE INDEX "version_organisation_version_moduleSlug_idx" ON "_module_entitlements_v" USING btree ("version_organisation_id","version_module_slug");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_module_entitlements_fk" FOREIGN KEY ("module_entitlements_id") REFERENCES "public"."module_entitlements"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_module_entitlements_id_idx" ON "payload_locked_documents_rels" USING btree ("module_entitlements_id");`)

  // Backfill: before this migration, WordPress was implicitly available to every
  // organisation with no gating at all. Fail-closed enforcement (lib/entitlements.ts)
  // means an organisation with no row here reads as disabled - so every organisation
  // that already existed gets an explicit enabled "wordpress" row, regardless of
  // whether it has a WordPress connection yet, so no existing customer loses access
  // on deploy day. ON CONFLICT targets the same compound unique index the schema step
  // above just created, so this insert is conflict-safe at the database level (safe to
  // re-run against a database that already has some rows backfilled) rather than
  // relying on Payload's own migration-completion bookkeeping for idempotency.
  await db.execute(sql`
    INSERT INTO "module_entitlements" ("organisation_id", "module_slug", "enabled", "source", "created_at", "updated_at")
    SELECT "id", 'wordpress', true, 'migration', now(), now()
    FROM "organisations"
    ON CONFLICT ("organisation_id", "module_slug") DO NOTHING;
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "module_entitlements" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_module_entitlements_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "module_entitlements" CASCADE;
  DROP TABLE "_module_entitlements_v" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_module_entitlements_fk";
  
  DROP INDEX "payload_locked_documents_rels_module_entitlements_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "module_entitlements_id";
  DROP TYPE "public"."enum_module_entitlements_module_slug";
  DROP TYPE "public"."enum_module_entitlements_source";
  DROP TYPE "public"."enum__module_entitlements_v_version_module_slug";
  DROP TYPE "public"."enum__module_entitlements_v_version_source";`)
}
