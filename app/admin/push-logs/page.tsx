import { createClient } from '@/utils/supabase/server';
import { getCurrentUser } from '@/utils/auth';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function PushLogsPage() {
  const user = await getCurrentUser();
  const supabase = createClient();

  if (!user) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-4">Push Logs</h1>
        <p>Please sign in.</p>
      </div>
    );
  }

  const { data: me } = await supabase
    .from('app_users')
    .select('is_sys_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (!me?.is_sys_admin) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-4">Push Logs</h1>
        <p>Access denied.</p>
      </div>
    );
  }

  const { data, error } = await supabase
    .from('push_sends')
    .select('id, user_id, slot, title, body, url, success, status_code, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-4">Push Logs</h1>
        <p className="text-red-600">Failed to load logs.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Push Logs</h1>
        <Link href="/" className="text-blue-600 hover:underline">Back</Link>
      </div>
      <div className="overflow-auto rounded border border-gray-200 dark:border-gray-800">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="text-left px-3 py-2">Time</th>
              <th className="text-left px-3 py-2">Slot</th>
              <th className="text-left px-3 py-2">User</th>
              <th className="text-left px-3 py-2">Title</th>
              <th className="text-left px-3 py-2">Body</th>
              <th className="text-left px-3 py-2">URL</th>
              <th className="text-left px-3 py-2">Success</th>
              <th className="text-left px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((row) => (
              <tr key={row.id} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-3 py-2 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                <td className="px-3 py-2">{row.slot || '-'}</td>
                <td className="px-3 py-2">{row.user_id || 'broadcast'}</td>
                <td className="px-3 py-2">{row.title}</td>
                <td className="px-3 py-2 max-w-xl truncate" title={row.body}>{row.body}</td>
                <td className="px-3 py-2">{row.url}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${row.success ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
                    {row.success ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="px-3 py-2">{row.status_code ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500 mt-2">Showing latest {data?.length || 0} rows.</p>
    </div>
  );
}
