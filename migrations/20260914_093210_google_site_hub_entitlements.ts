import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_module_entitlements_module_slug" ADD VALUE 'google-search-console';
  ALTER TYPE "public"."enum_module_entitlements_module_slug" ADD VALUE 'google-analytics';
  ALTER TYPE "public"."enum__module_entitlements_v_version_module_slug" ADD VALUE 'google-search-console';
  ALTER TYPE "public"."enum__module_entitlements_v_version_module_slug" ADD VALUE 'google-analytics';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "module_entitlements" ALTER COLUMN "module_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_module_entitlements_module_slug";
  CREATE TYPE "public"."enum_module_entitlements_module_slug" AS ENUM('wordpress');
  ALTER TABLE "module_entitlements" ALTER COLUMN "module_slug" SET DATA TYPE "public"."enum_module_entitlements_module_slug" USING "module_slug"::"public"."enum_module_entitlements_module_slug";
  ALTER TABLE "_module_entitlements_v" ALTER COLUMN "version_module_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum__module_entitlements_v_version_module_slug";
  CREATE TYPE "public"."enum__module_entitlements_v_version_module_slug" AS ENUM('wordpress');
  ALTER TABLE "_module_entitlements_v" ALTER COLUMN "version_module_slug" SET DATA TYPE "public"."enum__module_entitlements_v_version_module_slug" USING "version_module_slug"::"public"."enum__module_entitlements_v_version_module_slug";`)
}
