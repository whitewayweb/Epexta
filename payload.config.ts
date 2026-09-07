import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import path from "path";
import { buildConfig } from "payload";
import { fileURLToPath } from "url";

import { ApiKeys } from "./collections/ApiKeys";
import { Organisations } from "./collections/Organisations";
import { Users } from "./collections/Users";
import { WordPressConnections } from "./modules/wordpress/collection";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

// Neon connection strings include `sslmode=require`, which pg-connection-string
// warns will lose its current meaning in a future major version. Strip it and set
// `ssl` explicitly on the pool instead, so the warning stops without changing behavior.
function getDatabasePoolConfig() {
  const raw = process.env.DATABASE_URL || "";
  if (!raw) return { connectionString: raw };

  const url = new URL(raw);
  const hadSslmode = url.searchParams.has("sslmode");
  url.searchParams.delete("sslmode");

  return {
    connectionString: url.toString(),
    ssl: hadSslmode ? { rejectUnauthorized: true } : undefined,
  };
}

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Organisations, ApiKeys, WordPressConnections],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || "",
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: postgresAdapter({
    pool: getDatabasePoolConfig(),
    transactionOptions: false,
    // Dev-mode auto-push writes a "dev" marker into payload_migrations that makes
    // `payload migrate` prompt for confirmation on every future run, forever. Schema
    // changes always go through committed migration files instead (migrate:create,
    // then migrate) - the same path production already uses via the Vercel build command.
    push: false,
  }),
  routes: {
    api: "/api/cms",
  },
});
