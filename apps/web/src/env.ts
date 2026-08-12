import {z} from "zod";

const envSchema = z.object({
    NEXT_PUBLIC_SERVER_URL: z.string().url().default("http://localhost:5000")
})

const parsed = envSchema.safeParse({
  NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
});

if (!parsed.success) {
  console.error("\nInvalid environment variables (apps/web):\n");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
}

export const env = parsed.success
  ? parsed.data
  : { NEXT_PUBLIC_SERVER_URL: "http://localhost:4000" };