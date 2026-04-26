import { z } from 'zod';

const configSchema = z
  .object({
    DATABASE_URL: z.string().default('./data/paperless-ngx-dedupe.db'),
    PAPERLESS_URL: z.url({ error: 'PAPERLESS_URL must be a valid URL' }),
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
    PAPERLESS_METRICS_ENABLED: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    PAPERLESS_METRICS_COLLECTORS: z.string().optional(),
    AI_ENABLED: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    AI_OPENAI_API_KEY: z.string().optional(),
    AI_BULK_ALL_ENABLED: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    RAG_ENABLED: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    FARO_ENABLED: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    FARO_COLLECTOR_URL: z.string().optional(),
    PYROSCOPE_ENABLED: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    PYROSCOPE_SERVER_ADDRESS: z.string().optional(),
    PYROSCOPE_BASIC_AUTH_USER: z.string().optional(),
    PYROSCOPE_BASIC_AUTH_PASSWORD: z.string().optional(),
    OTEL_SERVICE_NAMESPACE: z.string().default('paperless-dedupe'),
  })
  .refine(
    (data) => data.PAPERLESS_API_TOKEN || (data.PAPERLESS_USERNAME && data.PAPERLESS_PASSWORD),
    {
      error:
        'At least one authentication method is required: PAPERLESS_API_TOKEN or both PAPERLESS_USERNAME and PAPERLESS_PASSWORD',
      path: ['PAPERLESS_API_TOKEN'],
    },
  )
  .refine((data) => !data.AI_ENABLED || data.AI_OPENAI_API_KEY, {
    error: 'When AI_ENABLED=true, AI_OPENAI_API_KEY is required',
    path: ['AI_ENABLED'],
  })
  .refine((data) => !data.RAG_ENABLED || data.AI_OPENAI_API_KEY, {
    error: 'When RAG_ENABLED=true, AI_OPENAI_API_KEY is required for generating embeddings',
    path: ['RAG_ENABLED'],
  })
  .refine((data) => !data.FARO_ENABLED || data.FARO_COLLECTOR_URL, {
    error: 'When FARO_ENABLED=true, FARO_COLLECTOR_URL is required',
    path: ['FARO_ENABLED'],
  })
  .refine((data) => !data.PYROSCOPE_ENABLED || data.PYROSCOPE_SERVER_ADDRESS, {
    error: 'When PYROSCOPE_ENABLED=true, PYROSCOPE_SERVER_ADDRESS is required',
    path: ['PYROSCOPE_ENABLED'],
  });

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
