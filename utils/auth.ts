import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { auth as nextAuth } from '@/auth';
import type { DefaultSession, User } from 'next-auth';

export type { Session } from 'next-auth';

// Extend the built-in session types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      // Add any additional fields you add to your session user
    } & DefaultSession['user'];
  }
}

// Re-export the auth function with proper typing
export const auth = nextAuth;

/**
 * Get the current user from the session
 * @returns The current user or null if not authenticated
 */
export async function getCurrentUser(): Promise<(User & { id: string }) | null> {
  const session = await auth();
  return session?.user ? { ...session.user, id: session.user.id } : null;
}

/**
 * Get the server auth session (compatible with both App Router and Pages Router)
 * @param req - Optional request object
 * @returns The current session or null if not authenticated
 */
export async function getServerAuthSession(req?: NextRequest | Request) {
  try {
    if (req) {
      // For API routes or server components with request
      const token = await getToken({ req });
      return token ? { user: token } : null;
    }
    
    // For server components without request
    const session = await auth();
    return session;
  } catch (error) {
    console.error('Error getting auth session:', error);
    return null;
  }
}

/**
 * Require the user to be authenticated
 * @returns The current user
 * @throws {Error} If the user is not authenticated
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    const error = new Error('Authentication required');
    error.name = 'AuthenticationError';
    throw error;
  }
  return user;
}

/**
 * Check if the current user has a specific role
 * @param role - The role to check for
 * @returns boolean indicating if the user has the role
 */
export async function hasRole(role: string): Promise<boolean> {
  // In a real app, you would check the user's roles here
  // For now, we'll just return false
  return false;
}

/**
 * Require the user to have a specific role
 * @param role - The role to require
 * @returns The current user
 * @throws {Error} If the user is not authenticated or doesn't have the required role
 */
export async function requireRole(role: string) {
  const user = await requireUser();
  const hasRequiredRole = await hasRole(role);
  
  if (!hasRequiredRole) {
    const error = new Error(`Role '${role}' is required`);
    error.name = 'AuthorizationError';
    throw error;
  }
  
  return user;
}
