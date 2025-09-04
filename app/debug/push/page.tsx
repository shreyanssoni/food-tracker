"use client";

import React, { useEffect, useState } from "react";
import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from "@capacitor/push-notifications";

export default function PushDebugPage() {
  const [permission, setPermission] = useState<string>("unknown");
  const [token, setToken] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<string>("");

  const log = (msg: string) => setLogs((prev) => [msg, ...prev].slice(0, 100));

  const ensureChannel = async () => {
    try {
      // On Android, ensure a default channel exists for heads-up notifications
      await (PushNotifications as any).createChannel?.({
        id: "default",
        name: "Default",
        description: "General notifications",
        importance: 4, // IMPORTANCE_HIGH
        visibility: 1,
        lights: true,
        vibration: true,
      });
    } catch (e) {
      // ignored on platforms that don't support channels
    }
  };

  const init = async () => {
    const permStatus = await PushNotifications.checkPermissions();
    setPermission(permStatus.receive);
    if (permStatus.receive !== "granted") {
      const req = await PushNotifications.requestPermissions();
      setPermission(req.receive);
      if (req.receive !== "granted") {
        log("Permission not granted. Please enable notifications in Settings.");
        return;
      }
    }

    await ensureChannel();

    await PushNotifications.register();

    PushNotifications.addListener("registration", (t: Token) => {
      setToken(t.value);
      log(`Received FCM token: ${t.value}`);
    });

    PushNotifications.addListener("registrationError", (err) => {
      log("Registration error: " + JSON.stringify(err));
    });

    PushNotifications.addListener(
      "pushNotificationReceived",
      (notification: PushNotificationSchema) => {
        log("Notification received: " + JSON.stringify(notification));
      }
    );

    PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action: ActionPerformed) => {
        log("Action performed: " + JSON.stringify(action));
      }
    );
  };

  const saveTokenToServer = async () => {
    if (!token) {
      setSaveStatus("No token yet. Tap Re-register first.");
      return;
    }
    try {
      setSaveStatus("Saving...");
      const res = await fetch("/api/store-fcm-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, platform: "android" }),
      });
      const text = await res.text();
      if (res.ok) {
        setSaveStatus("Saved ✔");
        log("Token saved to server: " + token);
      } else {
        setSaveStatus(`Save failed: ${text}`);
        log("Save failed: " + text);
      }
    } catch (e: any) {
      setSaveStatus("Save error: " + (e?.message ?? String(e)));
    }
  };

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Push Notifications Debug</h1>
      <div className="space-y-2">
        <div><strong>Permission:</strong> {permission}</div>
        <div className="break-all">
          <strong>FCM Token:</strong>
          <div className="mt-1 p-2 rounded bg-gray-100 dark:bg-gray-800 text-xs select-all">{token || "(waiting...)"}</div>
        </div>
        <button
          onClick={init}
          className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Re-register
        </button>
        <button
          onClick={saveTokenToServer}
          className="ml-2 px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Save token to server
        </button>
        {saveStatus && (
          <div className="text-sm text-gray-700 dark:text-gray-300">{saveStatus}</div>
        )}
      </div>

      <div>
        <h2 className="font-semibold mb-2">Event Log</h2>
        <div className="space-y-1 text-xs">
          {logs.length === 0 ? (
            <div className="text-gray-500">No events yet.</div>
          ) : (
            logs.map((l, i) => (
              <div key={i} className="p-2 rounded bg-gray-100 dark:bg-gray-800 break-all">{l}</div>
            ))
          )}
        </div>
      </div>

      <div className="text-sm text-gray-600 dark:text-gray-400">
        1) Run the Android app on a device/emulator with Google Play Services.
        <br />
        2) Open this page and copy the FCM token.
        <br />
        3) In Firebase Console → Cloud Messaging → Send test message → paste the token.
      </div>
    </div>
  );
}

