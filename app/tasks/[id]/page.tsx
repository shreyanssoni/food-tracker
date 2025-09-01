import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  // Load the task; rely on RLS so only the owner's task is returned
  const { data: task, error } = await supabase
    .from('tasks')
    .select('id, title, description, ep_value, created_at, challenge_id')
    .eq('id', params.id)
    .maybeSingle();

  if (error) {
    // If any error (including RLS not allowed), go back to list
    redirect('/tasks');
  }

  if (!task) {
    redirect('/tasks');
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Task</h1>
        <Link href="/tasks" className="text-sm text-blue-600 dark:text-blue-400 underline">Back to tasks</Link>
      </div>
      <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800/70 bg-white/80 dark:bg-gray-900/80 shadow-sm p-4">
        <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{task.title}</div>
        {task.description && (
          <div className="mt-2 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{task.description}</div>
        )}
        <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">EP: {task.ep_value ?? 0}</div>
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Created: {new Date(task.created_at).toLocaleString()}</div>
      </div>
    </div>
  );
}
