"use client";

import { useEffect } from "react";
import { PushNotifications } from "@capacitor/push-notifications";

async function registerForPush() {
  try {
    const permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === "granted") {
      await PushNotifications.register();
    } else {
      const req = await PushNotifications.requestPermissions();
      if (req.receive === "granted") {
        await PushNotifications.register();
      }
    }
  } catch (e) {
    console.warn("[PushInit] Permission/register error", e);
  }
}

export default function PushInit() {
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

  return null;
}
