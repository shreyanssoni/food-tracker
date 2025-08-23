import { z } from 'zod';

const envSchema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string(),
  
  // NextAuth
  NEXTAUTH_URL: z.string().url().optional().default('http://localhost:3000'),
  NEXTAUTH_SECRET: z.string().min(32, 'Must be at least 32 characters'),
  
  // Google OAuth
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  
  // Google Gemini API
  GEMINI_API_KEY: z.string(),
  
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  
  // PWA
  NEXT_PUBLIC_PWA_CACHE_VERSION: z.string().default('1'),
});

type Env = z.infer<typeof envSchema>;

declare global {
  namespace NodeJS {
    interface ProcessEnv extends Env {}
  }
}

/**
 * Validates the environment variables and returns a typed object.
 * Throws an error if any required environment variables are missing or invalid.
 */
export function getEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingEnvs = error.issues.map((issue) => {
        const path = issue.path.join('.');
        return `- ${path}: ${issue.message}`;
      });
      
      throw new Error(
        `Missing or invalid environment variables:\n${missingEnvs.join('\n')}\n\n` +
        'Please check your .env.local file and ensure all required variables are set.'
      );
    }
    
    throw error;
  }
}

/**
 * Gets the environment variables with runtime validation.
 * Use this in client components or when you need to access env vars at runtime.
 */
export function getRuntimeEnv() {
  if (typeof window !== 'undefined') {
    throw new Error('getRuntimeEnv should not be used in the browser. Use getClientEnv instead.');
  }
  
  return getEnv();
}

/**
 * Gets the public (client-side) environment variables.
 * Only includes variables prefixed with NEXT_PUBLIC_*.
 */
export function getClientEnv() {
  const env = getEnv();
  
  return {
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_PWA_CACHE_VERSION: env.NEXT_PUBLIC_PWA_CACHE_VERSION,
  };
}

// Validate environment variables on module load
if (process.env.NODE_ENV !== 'test') {
  getEnv();
}
