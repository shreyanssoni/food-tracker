import { Capacitor } from '@capacitor/core';

async function ensureAndroidChannel() {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await (PushNotifications as any).createChannel?.({
      id: 'default',
      name: 'Default',
      description: 'General notifications',
      importance: 4,
      visibility: 1,
      lights: true,
      vibration: true,
    });
  } catch {}
}

export async function registerDevicePushIfPossible() {
  try {
    if (Capacitor.getPlatform() !== 'android') return;
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.checkPermissions();
    let granted = perm.receive === 'granted';
    if (!granted) {
      const req = await PushNotifications.requestPermissions();
      granted = req.receive === 'granted';
    }
    if (!granted) return;
    await ensureAndroidChannel();

    await new Promise<void>(async (resolve) => {
      try {
        await PushNotifications.addListener('registration', async (token: any) => {
          try {
            await fetch('/api/store-fcm-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: token.value, platform: 'android' }),
            });
          } catch {}
          resolve();
        });
        await PushNotifications.register();
        // Fallback resolve in case no event fires
        setTimeout(() => resolve(), 4000);
      } catch {
        resolve();
      }
    });
  } catch {}
}
