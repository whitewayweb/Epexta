import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_google_connections_scope_profile" AS ENUM('google-search-console', 'google-analytics');
  CREATE TYPE "public"."enum_google_connections_status" AS ENUM('active', 'needs_reconnect', 'revoked');
  CREATE TYPE "public"."enum_google_oauth_states_capability" AS ENUM('google-search-console', 'google-analytics');
  CREATE TABLE "google_connections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"organisation_id" integer NOT NULL,
  	"google_account_label" varchar NOT NULL,
  	"access_token" varchar,
  	"refresh_token" varchar,
  	"granted_scopes" jsonb NOT NULL,
  	"scope_profile" "enum_google_connections_scope_profile" NOT NULL,
  	"token_expires_at" timestamp(3) with time zone,
  	"status" "enum_google_connections_status" DEFAULT 'active' NOT NULL,
  	"last_validated_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "google_oauth_states" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"state" varchar NOT NULL,
  	"code_verifier" varchar NOT NULL,
  	"user_id" integer NOT NULL,
  	"organisation_id" integer NOT NULL,
  	"capability" "enum_google_oauth_states_capability" NOT NULL,
  	"flow" jsonb NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "google_connections_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "google_oauth_states_id" integer;
  ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "google_oauth_states" ADD CONSTRAINT "google_oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "google_oauth_states" ADD CONSTRAINT "google_oauth_states_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "google_connections_organisation_idx" ON "google_connections" USING btree ("organisation_id");
  CREATE INDEX "google_connections_scope_profile_idx" ON "google_connections" USING btree ("scope_profile");
  CREATE INDEX "google_connections_updated_at_idx" ON "google_connections" USING btree ("updated_at");
  CREATE INDEX "google_connections_created_at_idx" ON "google_connections" USING btree ("created_at");
  CREATE UNIQUE INDEX "google_oauth_states_state_idx" ON "google_oauth_states" USING btree ("state");
  CREATE INDEX "google_oauth_states_user_idx" ON "google_oauth_states" USING btree ("user_id");
  CREATE INDEX "google_oauth_states_organisation_idx" ON "google_oauth_states" USING btree ("organisation_id");
  CREATE INDEX "google_oauth_states_expires_at_idx" ON "google_oauth_states" USING btree ("expires_at");
  CREATE INDEX "google_oauth_states_updated_at_idx" ON "google_oauth_states" USING btree ("updated_at");
  CREATE INDEX "google_oauth_states_created_at_idx" ON "google_oauth_states" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_google_connections_fk" FOREIGN KEY ("google_connections_id") REFERENCES "public"."google_connections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_google_oauth_states_fk" FOREIGN KEY ("google_oauth_states_id") REFERENCES "public"."google_oauth_states"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_google_connections_id_idx" ON "payload_locked_documents_rels" USING btree ("google_connections_id");
  CREATE INDEX "payload_locked_documents_rels_google_oauth_states_id_idx" ON "payload_locked_documents_rels" USING btree ("google_oauth_states_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "google_connections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "google_oauth_states" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "google_connections" CASCADE;
  DROP TABLE "google_oauth_states" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_google_connections_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_google_oauth_states_fk";
  
  DROP INDEX "payload_locked_documents_rels_google_connections_id_idx";
  DROP INDEX "payload_locked_documents_rels_google_oauth_states_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "google_connections_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "google_oauth_states_id";
  DROP TYPE "public"."enum_google_connections_scope_profile";
  DROP TYPE "public"."enum_google_connections_status";
  DROP TYPE "public"."enum_google_oauth_states_capability";`)
}
