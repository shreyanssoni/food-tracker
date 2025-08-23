import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { createClient } from '@/utils/supabase/server';
import type { NextAuthConfig } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

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
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user?.email) return false;
      try {
        const supabase = createClient();

        // Upsert user into app_users
        const { error: upsertErr } = await supabase
          .from('app_users')
          .upsert(
            {
              id: user.id,
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

        // Ensure default preferences row exists
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const { error: prefsErr } = await supabase
          .from('user_preferences')
          .upsert(
            {
              user_id: user.id!,
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
    async jwt({ token }) {
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
