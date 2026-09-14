import { config } from "dotenv";

// Next.js loads .env.local automatically; a standalone vitest process doesn't, so
// integration tests that need DATABASE_URL/PAYLOAD_SECRET/ENCRYPTION_KEY load it here.
config({ path: ".env.local" });
