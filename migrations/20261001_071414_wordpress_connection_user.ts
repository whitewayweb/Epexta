import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Every WordPress connection now belongs to the user who added it (required), and only
// that user's pages and MCP tools see it. A required column can't be added to rows that
// already exist, so each existing connection is assigned to its organisation's earliest
// admin (falling back to its earliest member) - the people who could add one before this.
//
// Two connections to the same site in one organisation would both land on that admin and
// violate the new (organisation, user, site_url) unique index. The migration stops with
// the offending ids rather than deleting either one: remove the one you don't want in
// /admin (or via the site's "Remove" button), then re-run it.
//
// The FK is ON DELETE CASCADE, not Payload's default SET NULL: a connection is meaningless
// without its owner, and SET NULL would fail against the NOT NULL column when a user is
// deleted (see 20260914_095814_cascade_delete_fks.ts).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const duplicates = await db.execute(sql`
    SELECT organisation_id, site_url, array_agg(id ORDER BY id) AS ids
    FROM "wordpress_connections"
    GROUP BY organisation_id, site_url
    HAVING count(*) > 1;`)
  if (duplicates.rows.length > 0) {
    const listing = duplicates.rows
      .map((row) => `${String(row.site_url)} (organisation ${String(row.organisation_id)}, connection ids ${JSON.stringify(row.ids)})`)
      .join('; ')
    throw new Error(
      `Cannot give WordPress connections an owner: the same site is connected more than once in one organisation. Remove all but one of: ${listing}`
    )
  }

  await db.execute(sql`
   ALTER TABLE "wordpress_connections" ADD COLUMN "user_id" integer;

   UPDATE "wordpress_connections" wc
   SET "user_id" = (
     SELECT m."user_id"
     FROM "organisations_members" m
     WHERE m."_parent_id" = wc."organisation_id"
     ORDER BY (m."role" = 'admin') DESC, m."_order" ASC
     LIMIT 1
   );

   ALTER TABLE "wordpress_connections" ALTER COLUMN "user_id" SET NOT NULL;
   ALTER TABLE "wordpress_connections" ADD CONSTRAINT "wordpress_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE no action;
   CREATE INDEX "wordpress_connections_user_idx" ON "wordpress_connections" USING btree ("user_id");
   CREATE UNIQUE INDEX "organisation_user_siteUrl_idx" ON "wordpress_connections" USING btree ("organisation_id","user_id","site_url");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wordpress_connections" DROP CONSTRAINT "wordpress_connections_user_id_users_id_fk";
   DROP INDEX "wordpress_connections_user_idx";
   DROP INDEX "organisation_user_siteUrl_idx";
   ALTER TABLE "wordpress_connections" DROP COLUMN "user_id";`)
}
