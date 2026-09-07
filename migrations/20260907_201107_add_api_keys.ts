import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "api_keys" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"name" varchar NOT NULL,
  	"hashed_key" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "api_keys_id" integer;
  ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "api_keys_user_idx" ON "api_keys" USING btree ("user_id");
  CREATE UNIQUE INDEX "api_keys_hashed_key_idx" ON "api_keys" USING btree ("hashed_key");
  CREATE INDEX "api_keys_updated_at_idx" ON "api_keys" USING btree ("updated_at");
  CREATE INDEX "api_keys_created_at_idx" ON "api_keys" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_api_keys_fk" FOREIGN KEY ("api_keys_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_api_keys_id_idx" ON "payload_locked_documents_rels" USING btree ("api_keys_id");
  ALTER TABLE "users" DROP COLUMN "enable_a_p_i_key";
  ALTER TABLE "users" DROP COLUMN "api_key";
  ALTER TABLE "users" DROP COLUMN "api_key_index";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "api_keys" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "api_keys" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_api_keys_fk";
  
  DROP INDEX "payload_locked_documents_rels_api_keys_id_idx";
  ALTER TABLE "users" ADD COLUMN "enable_a_p_i_key" boolean;
  ALTER TABLE "users" ADD COLUMN "api_key" varchar;
  ALTER TABLE "users" ADD COLUMN "api_key_index" varchar;
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "api_keys_id";`)
}
