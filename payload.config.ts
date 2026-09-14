import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import path from "path";
import { buildConfig } from "payload";
import { fileURLToPath } from "url";

import { ApiKeys } from "./collections/ApiKeys";
import { ModuleEntitlements } from "./collections/ModuleEntitlements";
import { Organisations } from "./collections/Organisations";
import { Users } from "./collections/Users";
import { GoogleAnalyticsMappings } from "./modules/google-analytics/collection";
import { GoogleConnections, GoogleOAuthStates } from "./modules/google-connections/collections";
import { GoogleSearchConsoleMappings } from "./modules/google-search-console/collection";
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
  collections: [
    Users,
    Organisations,
    ApiKeys,
    ModuleEntitlements,
    WordPressConnections,
    GoogleConnections,
    GoogleOAuthStates,
    GoogleSearchConsoleMappings,
    GoogleAnalyticsMappings,
  ],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || "",
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: postgresAdapter({
    pool: getDatabasePoolConfig(),
    // Real transactions are required - see lib/db-transactions.test.ts and "Enabling
    // database transactions" in GOOGLE_PERFORMANCE_PLAN.md. `transactionOptions: false`
    // used to be set here with no more explanation than "compatibility issues with the
    // connection pool"; with it removed, beginTransaction/commitTransaction/
    // rollbackTransaction give genuine atomicity and isolation against this project's
    // pooled Neon endpoint (verified empirically, not assumed). Never hold a Payload
    // transaction open across an external network call (e.g. a Google OAuth token
    // exchange) - do the network call first, then run the DB statements inside a short
    // transaction, so a slow upstream call can't pin a pooled connection for its
    // duration under Vercel's serverless concurrency.
    //
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
