"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function FoodPhotoQuickAction() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const [status, setStatus] = useState<string>("Opening camera…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Auto-open the camera prompt as soon as the page loads
    const t = setTimeout(() => fileRef.current?.click(), 50);
    return () => clearTimeout(t);
  }, []);

  const readDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result) || "");
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });

  // Compress image using canvas to stay within API limits
  const compressImage = async (
    file: File,
    opts: { maxW?: number; maxH?: number; quality?: number } = {}
  ): Promise<{ base64: string; mime: string }> => {
    const { maxW = 1280, maxH = 1280, quality = 0.8 } = opts;
    const dataUrl = await readDataUrl(file);
    const img = document.createElement("img");
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Failed to load image"));
      img.src = dataUrl;
    });
    let { width, height } = img;
    const ratio = Math.min(1, maxW / width, maxH / height);
    width = Math.max(1, Math.round(width * ratio));
    height = Math.max(1, Math.round(height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.drawImage(img, 0, 0, width, height);
    const mime = file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";
    const outUrl = canvas.toDataURL(mime, quality);
    const base64 = outUrl.split(",")[1] || "";
    return { base64, mime };
  };

  const handleFile = async (file?: File) => {
    if (!file) {
      setError("No photo captured.");
      setStatus("Cancelled");
      return;
    }
    try {
      setError(null);
      setStatus("Analyzing photo…");

      const { base64: imageBase64, mime: mimeType } = await compressImage(file, {
        maxW: 1600,
        maxH: 1600,
        quality: 0.8,
      });

      // 1) Send to AI photo analyzer
      const aiRes = await fetch("/api/ai/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType }),
      });

      if (!aiRes.ok) {
        const msg = await aiRes.text();
        throw new Error(`Photo analysis failed: ${msg}`);
      }

      const { log, suggestion } = await aiRes.json();

      // 2) Forward to food_logs insert
      setStatus("Saving food log…");
      const saveRes = await fetch("/api/food_logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...log, note: log?.note ?? suggestion ?? null }),
      });

      if (!saveRes.ok) {
        const msg = await saveRes.text();
        throw new Error(`Save failed: ${msg}`);
      }

      setStatus("Saved! Redirecting…");
      // Optional: redirect to home or a logs page if exists
      router.replace("/");
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
      setStatus("Failed");
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center p-6 text-center">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] || undefined)}
      />
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Add Food via Photo</h1>
        <p className="text-sm opacity-80">{status}</p>
        {error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : null}
        <div className="pt-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded bg-blue-600 px-4 py-2 text-white"
          >
            Open Camera
          </button>
        </div>
      </div>
    </main>
  );
}
