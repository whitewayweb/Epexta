import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Additive: a new "admin" revocation reason (support revoking a grant in /admin, or an
// organisation admin disconnecting a member's app) and who revoked a grant (revokedBy,
// SET NULL if that user is deleted - the grant's own audit record outlives them). The down
// migration folds "admin" back into "user" before restoring the old enum.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_oauth_grants_revoked_reason" ADD VALUE 'admin' BEFORE 'client';
  ALTER TABLE "oauth_grants" ADD COLUMN "revoked_by_id" integer;
  ALTER TABLE "oauth_grants" ADD CONSTRAINT "oauth_grants_revoked_by_id_users_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "oauth_grants_revoked_by_idx" ON "oauth_grants" USING btree ("revoked_by_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "oauth_grants" DROP CONSTRAINT "oauth_grants_revoked_by_id_users_id_fk";
  
  ALTER TABLE "oauth_grants" ALTER COLUMN "revoked_reason" SET DATA TYPE text;
  UPDATE "oauth_grants" SET "revoked_reason" = 'user' WHERE "revoked_reason" = 'admin';
  DROP TYPE "public"."enum_oauth_grants_revoked_reason";
  CREATE TYPE "public"."enum_oauth_grants_revoked_reason" AS ENUM('user', 'client', 'refresh_reuse', 'code_replay', 'member_removed');
  ALTER TABLE "oauth_grants" ALTER COLUMN "revoked_reason" SET DATA TYPE "public"."enum_oauth_grants_revoked_reason" USING "revoked_reason"::"public"."enum_oauth_grants_revoked_reason";
  DROP INDEX "oauth_grants_revoked_by_idx";
  ALTER TABLE "oauth_grants" DROP COLUMN "revoked_by_id";`)
}
