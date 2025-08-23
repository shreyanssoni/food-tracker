"use client";
import { useState } from 'react';
import { createClient as createBrowserClient } from '@/utils/supabase/client';

export default function AuthPage() {
  const supabase = createBrowserClient();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <div className="card">
      <h1 className="text-lg font-semibold mb-2">Sign in</h1>
      <p className="text-sm text-gray-600 mb-3">Use a magic link to sign in. No password needed.</p>
      {sent ? (
        <p className="text-sm text-brand-800 bg-brand-50 rounded-lg p-2">Check your email for the sign-in link.</p>
      ) : (
        <form onSubmit={sendMagicLink} className="space-y-2">
          <input className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button className="btn w-full">Send magic link</button>
        </form>
      )}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
