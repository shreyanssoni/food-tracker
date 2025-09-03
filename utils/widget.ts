// Utilities to sync data to the Android widget via Capacitor Preferences

import { Capacitor, registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

export type WidgetTask = { id: string; title: string; done?: boolean };

type WidgetRefresherPlugin = {
  refresh: () => Promise<{ ok: boolean }>
}

const WidgetRefresher = registerPlugin<WidgetRefresherPlugin>('WidgetRefresher');

export async function writeTodayTasksForWidget(tasks: WidgetTask[]) {
  try {
    if (Capacitor.getPlatform() !== 'android') return;
    const compact = tasks.slice(0, 10).map(t => ({ id: t.id, title: t.title, done: !!t.done }));
    await Preferences.set({ key: 'widget:tasks:today', value: JSON.stringify(compact) });
    // Trigger an instant widget refresh via native plugin
    try { await WidgetRefresher.refresh(); } catch {}
  } catch {}
}
