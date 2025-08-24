import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { createClient } from '@/utils/supabase/server';
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
  callbacks: {
    async signIn({ user }) {
      if (!user?.email) return false;
      try {
        const supabase = createClient();

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

        // 3) Ensure default preferences row exists for normalized id
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const { error: prefsErr } = await supabase
          .from('user_preferences')
          .upsert(
            {
              user_id: normalizedId,
              timezone,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          );
        if (prefsErr) {
          // Non-fatal
          console.warn('Preferences upsert warning:', prefsErr.message);
        }

        return true;
      } catch (e) {
        console.error('signIn callback error:', e);
        return false;
      }
    },
    async session({ session, token }: { session: any; token: JWT }) {
      if (token?.sub && session?.user) session.user.id = token.sub;
      return session;
    },
    async jwt({ token, user }: { token: JWT; user?: any }) {
      // On first sign-in, user is present; ensure token.sub uses our normalized user.id
      if (user?.id) token.sub = user.id;
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
