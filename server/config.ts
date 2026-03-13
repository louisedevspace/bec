import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.string().optional(),
  APP_NAME: z.string().default("Becxus Exchange"),
  PUBLIC_URL: z.string().optional(),
  DEPOSIT_FEE_RATE: z.string().optional(),
  WITHDRAWAL_FEE_RATE: z.string().optional(),
  SUPABASE_URL: z.string().min(1, "SUPABASE_URL is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  ALLOWED_ORIGINS: z.string().optional(), // comma-separated list
});

export type ServerConfig = {
  env: "development" | "production" | string;
  port: number;
  appName: string;
  publicUrl: string;
  depositFeeRate: number;
  withdrawalFeeRate: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  allowedOrigins: string[];
};

function parseEnv(): ServerConfig {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const env = parsed.data;
  const port = Number(env.PORT || 5050);
  const isProduction = env.NODE_ENV === 'production';
  const protocol = isProduction ? "https" : "http";
  const host = `localhost:${port}`;
  const defaultPublicUrl = `${protocol}://${host}`;
  const publicUrl = env.PUBLIC_URL || defaultPublicUrl;
  const allowedOrigins = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const depositFeeRate = Number(env.DEPOSIT_FEE_RATE || 0);
  const withdrawalFeeRate = Number(env.WITHDRAWAL_FEE_RATE || 0);

  return {
    env: env.NODE_ENV,
    port,
    appName: env.APP_NAME,
    publicUrl,
    depositFeeRate: Number.isFinite(depositFeeRate) && depositFeeRate >= 0 ? depositFeeRate : 0,
    withdrawalFeeRate: Number.isFinite(withdrawalFeeRate) && withdrawalFeeRate >= 0 ? withdrawalFeeRate : 0,
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    allowedOrigins,
  };
}

let cached: ServerConfig | null = null;

export function getServerConfig(): ServerConfig {
  if (cached) return cached;
  cached = parseEnv();
  return cached;
}
