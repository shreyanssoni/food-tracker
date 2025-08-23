import { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { createClient } from "@/utils/supabase/server";

export { auth, signIn, signOut } from '@/auth';
