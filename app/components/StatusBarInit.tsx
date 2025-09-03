"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

export default function StatusBarInit() {
  const { theme, systemTheme } = useTheme();

  useEffect(() => {
    // Dynamically import to avoid SSR issues
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor?.isNativePlatform?.()) return;
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        // Do not overlay WebView; OS will place content below the status bar
        await StatusBar.setOverlaysWebView({ overlay: false });
        // Set style/background to match current theme
        const effectiveTheme = theme === "system" ? systemTheme : theme;
        const dark = effectiveTheme === "dark";
        try { await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }); } catch {}
        // Use your light/dark backgrounds to match app chrome
        try { await StatusBar.setBackgroundColor({ color: dark ? "#000000" : "#ffffff" }); } catch {}
      } catch {
        // ignore
      }
    })();
  }, [theme, systemTheme]);

  return null;
}
