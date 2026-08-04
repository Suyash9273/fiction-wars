import dotenv from "dotenv"
import path from "path";

dotenv.config({
  path: path.resolve(process.cwd(), "../../.env"),
});
import {z} from "zod"

// Fail-fast env validation (Section 8 of the master brief): a missing or
// malformed connection string throws here, at boot, not later mid-request.
//
// Note: env schemas are kept local to each app (server vs. web) rather than
// forced into one "shared" schema, since the two apps' env vars barely
// overlap (DB/Redis connection strings here vs. a public server URL in web).
// The *pattern* (Zod-validated, fail-fast) is what's shared, not the shape.

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required (MongoDB Atlas connection string)"),
  MONGODB_DB_NAME: z.string().min(1).default("fiction_wars_dev"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required (Redis Cloud/Upstash connection string)"),
  REDIS_KEY_PREFIX: z.string().min(1).default("dev:"),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:3000"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("\n❌ Invalid or missing environment variables:\n");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("\nCheck apps/server/.env against apps/server/.env.example\n");
  process.exit(1);
}

export const env = parsed.data;