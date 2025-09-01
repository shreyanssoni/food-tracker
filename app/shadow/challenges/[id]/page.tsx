import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import Link from 'next/link';
import type { Route } from 'next';
import ChallengeActions from './parts/ChallengeActions';

export const revalidate = 0;

export default async function ChallengePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: ch, error } = await supabase
    .from('challenges')
    .select('id, state, win_condition_type, base_ep, reward_multiplier, start_time, due_time, task_template, created_at, linked_user_task_id')
    .eq('id', params.id)
    .maybeSingle();

  if (error || !ch) {
    redirect('/tasks');
  }

  const templateTitle = (ch.task_template as any)?.title as string | undefined;
  const templateDesc = (ch.task_template as any)?.description as string | undefined;

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Challenge</h1>
        <Link href={("/tasks" as Route)} className="text-sm text-blue-600 dark:text-blue-400 underline">Back to tasks</Link>
      </div>
      <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800/70 bg-white/80 dark:bg-gray-900/80 shadow-sm p-4 space-y-2">
        <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{templateTitle || 'Challenge Offer'}</div>
        {templateDesc && (
          <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{templateDesc}</div>
        )}
        <div className="text-sm text-gray-600 dark:text-gray-400">State: {ch.state}</div>
        <div className="text-sm text-gray-600 dark:text-gray-400">Win condition: {ch.win_condition_type}</div>
        <div className="text-sm text-gray-600 dark:text-gray-400">Base EP: {ch.base_ep} × {ch.reward_multiplier}</div>
        {ch.start_time && <div className="text-xs text-gray-500 dark:text-gray-400">Starts: {new Date(ch.start_time).toLocaleString()}</div>}
        {ch.due_time && <div className="text-xs text-gray-500 dark:text-gray-400">Due: {new Date(ch.due_time).toLocaleString()}</div>}
        <div className="pt-2">
          <ChallengeActions challengeId={ch.id} disabled={ch.state !== 'offered'} />
        </div>
      </div>
    </div>
  );
}
