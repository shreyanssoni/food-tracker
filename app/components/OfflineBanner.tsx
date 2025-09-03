"use client";

import { useEffect, useState } from "react";

export default function OfflineBanner() {
  const [online, setOnline] = useState<boolean>(true);

  useEffect(() => {
    // Initial state
    if (typeof navigator !== "undefined" && "onLine" in navigator) {
      setOnline(navigator.onLine);
    }
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="w-full bg-amber-500 dark:bg-amber-400 text-black text-sm text-center py-1">
      You are offline. Showing cached data. <span className="font-medium">Reconnect</span> to update.
    </div>
  );
}
