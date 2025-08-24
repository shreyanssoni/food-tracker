/* Custom service worker for push notifications */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    try { data = JSON.parse(event.data.text()); } catch { data = {}; }
  }
  let title = data.title || 'Nourish';
  let body = data.body || '';
  let url = data.url || '/';

  // Defensive: if body looks like code-fenced JSON, try to extract fields
  try {
    const looksFenced = typeof body === 'string' && body.trim().startsWith('```');
    const looksJsonish = typeof body === 'string' && body.includes('"title"') && body.includes('"body"');
    if (looksFenced || looksJsonish) {
      const stripFences = (s) => {
        const raw = (s || '').trim();
        if (!raw) return '';
        if (raw.startsWith('```')) {
          const firstFenceEnd = raw.indexOf('\n');
          const rest = firstFenceEnd >= 0 ? raw.slice(firstFenceEnd + 1) : raw;
          const secondFence = rest.indexOf('```');
          if (secondFence >= 0) return rest.slice(0, secondFence).trim();
        }
        return raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      };
      const cleaned = stripFences(body);
      try {
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === 'object') {
          if (parsed.title) title = String(parsed.title);
          if (parsed.body) body = String(parsed.body);
          if (parsed.url && typeof parsed.url === 'string' && parsed.url.startsWith('/')) url = parsed.url;
        }
      } catch {}
    }
  } catch {}
  const options = {
    body,
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    data: { url },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  const url = (event.notification && event.notification.data && event.notification.data.url) || '/';
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const w = client;
        if ('focus' in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
