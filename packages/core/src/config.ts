import { z } from 'zod';

const configSchema = z
  .object({
    DATABASE_DIALECT: z.enum(['sqlite', 'postgres']).default('sqlite'),
    DATABASE_URL: z.string().default('./data/paperless-dedupe.db'),
    PAPERLESS_URL: z.string().url('PAPERLESS_URL must be a valid URL'),
    PAPERLESS_API_TOKEN: z.string().optional(),
    PAPERLESS_USERNAME: z.string().optional(),
    PAPERLESS_PASSWORD: z.string().optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    CORS_ALLOW_ORIGIN: z.string().default(''),
    AUTO_MIGRATE: z
      .string()
      .default('true')
      .transform((v) => v === 'true'),
  })
  .refine(
    (data) => data.PAPERLESS_API_TOKEN || (data.PAPERLESS_USERNAME && data.PAPERLESS_PASSWORD),
    {
      message:
        'At least one authentication method is required: PAPERLESS_API_TOKEN or both PAPERLESS_USERNAME and PAPERLESS_PASSWORD',
      path: ['PAPERLESS_API_TOKEN'],
    },
  );

export type AppConfig = z.infer<typeof configSchema>;

export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  const result = configSchema.safeParse(env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  return result.data;
}
