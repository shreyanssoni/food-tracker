"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { PushNotifications } from "@capacitor/push-notifications";

async function ensureAndroidChannel() {
  try {
    // Create a default channel on Android (no-op on iOS/web)
    await (PushNotifications as any).createChannel?.({
      id: "default",
      name: "Default",
      description: "General notifications",
      importance: 4, // IMPORTANCE_HIGH
      visibility: 1,
      lights: true,
      vibration: true,
    });
    // eslint-disable-next-line no-console
    console.log("[PushInit] Default notification channel ensured");
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[PushInit] Failed to ensure channel (ok on non-Android)", e);
  }
}

async function registerForPush() {
  try {
    const permStatus = await PushNotifications.checkPermissions();
    // eslint-disable-next-line no-console
    console.log("[PushInit] Permission status:", permStatus);

    if (permStatus.receive === "granted") {
      await ensureAndroidChannel();
      await PushNotifications.register();
    } else {
      const req = await PushNotifications.requestPermissions();
      // eslint-disable-next-line no-console
      console.log("[PushInit] Permission request result:", req);
      if (req.receive === "granted") {
        await ensureAndroidChannel();
        await PushNotifications.register();
      }
    }
  } catch (e) {
    console.warn("[PushInit] Permission/register error", e);
  }
}

export default function PushInit() {
  const { status } = useSession();
  useEffect(() => {
    // Skip on web browsers that are not running inside Capacitor
    const isCapacitor = !!(window as any).Capacitor?.isNativePlatform?.();
    if (!isCapacitor) return;

    (async () => {
      await registerForPush();

      PushNotifications.addListener("registration", async (token) => {
        console.log("[PushInit] Device registered for push:", token.value);
        try {
          const res = await fetch("/api/store-fcm-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token.value, platform: "android" }),
          });
          if (!res.ok) {
            console.warn("[PushInit] store-fcm-token failed", await res.text());
          }
        } catch (e) {
          console.warn("[PushInit] store-fcm-token error", e);
        }
      });

      PushNotifications.addListener("registrationError", (err) => {
        console.error("[PushInit] registration error", err);
      });

      PushNotifications.addListener("pushNotificationReceived", (notif) => {
        console.log("[PushInit] Notification received", notif);
      });

      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        console.log("[PushInit] Notification action", action);
        // TODO: navigate based on action.notification.data
      });
    })();

    return () => {
      // No global remove API; listeners auto-clean on reload
    };
  }, []);

  // Re-register and re-post token after login (fixes 401 before auth)
  useEffect(() => {
    const isCapacitor = !!(window as any).Capacitor?.isNativePlatform?.();
    if (!isCapacitor) return;
    if (status !== "authenticated") return;
    (async () => {
      try {
        await registerForPush();
      } catch {}
    })();
  }, [status]);

  return null;
}
