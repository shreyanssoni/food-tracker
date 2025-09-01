import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import type { NextAuthConfig } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import { OAuth2Client } from 'google-auth-library';

const config: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
          scope: 'openid email profile',
        },
      },
    }),
    Credentials({
      id: 'google-onetap',
      name: 'Google One Tap',
      credentials: {
        id_token: { label: 'Google ID Token', type: 'text' },
      },
      async authorize(credentials) {
        try {
          const idToken = (credentials as any)?.id_token as string;
          if (!idToken) return null;
          const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
          if (!clientId) return null;
          const client = new OAuth2Client(clientId);
          const ticket = await client.verifyIdToken({ idToken, audience: clientId });
          const payload = ticket.getPayload();
          if (!payload || !payload.email) return null;
          return {
            id: payload.sub || payload.email,
            email: payload.email,
            name: payload.name || payload.email.split('@')[0],
            image: payload.picture || null,
          } as any;
        } catch (e) {
          console.error('One Tap authorize error', e);
          return null;
        }
      },
    }),
  ],
  // Allow Auth.js to accept the current host in development and when using tunnels.
  // Alternatively, you can set AUTH_TRUST_HOST=true in the environment.
  trustHost: true,
  callbacks: {
    async signIn({ user }) {
      if (!user?.email) return false;
      try {
        const supabase = createClient();
        const admin = createAdminClient();

        // 1) If a user already exists with this email, reuse its id
        const { data: existingByEmail, error: findErr } = await supabase
          .from('app_users')
          .select('id, email')
          .eq('email', user.email)
          .maybeSingle();
        if (findErr) {
          console.error('Error finding user by email:', findErr);
          return false;
        }

        const normalizedId = existingByEmail?.id || user.id!; // reuse existing id if found
        // Mutate the user object so NextAuth uses our normalized id
        user.id = normalizedId;

        // 2) Upsert with normalized id
        const { error: upsertErr } = await supabase
          .from('app_users')
          .upsert(
            {
              id: normalizedId,
              email: user.email,
              name: user.name || user.email.split('@')[0],
              image: user.image || null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          );

        if (upsertErr) {
          console.error('Error upserting user:', upsertErr);
          return false;
        }

        // 3) Resolve Supabase Auth user id by email so we can use it for FKs to auth.users
        let supabaseId: string | null = null;
        try {
          const { data: list, error: supaErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
          if (supaErr) {
            console.warn('Could not list Supabase auth users:', supaErr?.message);
          }
          const match = list?.users?.find((u: any) => (u?.email || '').toLowerCase() === user.email!.toLowerCase());
          supabaseId = match?.id ?? null;
        } catch (e: any) {
          console.warn('Supabase admin listUsers error:', e?.message || e);
        }

        // 4) Ensure default preferences row exists for normalized id, but
        // do NOT overwrite timezone with server's timezone (often 'UTC').
        // Preserve existing timezone if present; otherwise, set only if it's a non-UTC IANA zone.
        const serverTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const { data: existingPrefs } = await supabase
          .from('user_preferences')
          .select('timezone')
          .eq('user_id', normalizedId)
          .maybeSingle();

        const keepExistingTz = existingPrefs?.timezone || null;
        const detectedIsValid = !!(serverTZ && serverTZ.toUpperCase() !== 'UTC' && serverTZ.includes('/'));
        const tzToSave = keepExistingTz ?? (detectedIsValid ? serverTZ : null);

        const { error: prefsErr } = await supabase
          .from('user_preferences')
          .upsert(
            {
              user_id: normalizedId,
              timezone: tzToSave,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          );
        if (prefsErr) {
          // Non-fatal
          console.warn('Preferences upsert warning:', prefsErr.message);
        }

        // Attach supabase_id into the temporary user object so jwt callback can pick it up
        (user as any).supabase_id = supabaseId;

        return true;
      } catch (e) {
        console.error('signIn callback error:', e);
        return false;
      }
    },
    async session({ session, token }: { session: any; token: JWT }) {
      if (token?.sub && session?.user) session.user.id = token.sub;
      if (session?.user) (session.user as any).supabase_id = (token as any)?.supabase_id || null;
      return session;
    },
    async jwt({ token, user }: { token: JWT; user?: any }) {
      // On first sign-in, user is present; ensure token.sub uses our normalized user.id
      if (user?.id) token.sub = user.id;
      // Persist supabase_id into JWT for server usage
      const incomingSupa = (user as any)?.supabase_id;
      if (incomingSupa !== undefined) (token as any).supabase_id = incomingSupa;
      return token;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin',
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
