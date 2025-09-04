-- Add password authentication fields to app_users
ALTER TABLE public.app_users 
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS password_salt TEXT,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_token TEXT,
  ADD COLUMN IF NOT EXISTS reset_token TEXT,
  ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'email', -- 'email', 'google', etc.
  ADD COLUMN IF NOT EXISTS auth_provider_id TEXT; -- External provider ID (e.g., Google ID)

-- Add unique constraint on email for email/password users
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email_lower ON public.app_users (LOWER(email)) 
WHERE auth_provider = 'email';

-- Add index for password reset tokens
CREATE INDEX IF NOT EXISTS idx_app_users_reset_token ON public.app_users (reset_token) 
WHERE reset_token IS NOT NULL;

-- Add index for verification tokens
CREATE INDEX IF NOT EXISTS idx_app_users_verification_token ON public.app_users (verification_token) 
WHERE verification_token IS NOT NULL;

-- Update existing users to use 'google' as auth provider
UPDATE public.app_users 
SET auth_provider = 'google', 
    auth_provider_id = id 
WHERE auth_provider IS NULL AND email LIKE '%@%';
