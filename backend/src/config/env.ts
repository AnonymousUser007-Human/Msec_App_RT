import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("*"),
  MAX_FILE_SIZE_MB: z.coerce.number().default(10),
  PUBLIC_BASE_URL: z.preprocess((val) => (val === "" ? undefined : val), z.string().url().optional()),
  VAPID_PUBLIC_KEY: z.preprocess((val) => (val === "" ? undefined : val), z.string().min(1).optional()),
  VAPID_PRIVATE_KEY: z.preprocess((val) => (val === "" ? undefined : val), z.string().min(1).optional()),
  VAPID_SUBJECT: z.preprocess((val) => (val === "" ? undefined : val), z.string().min(1).optional()),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variables d'environnement invalides:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
