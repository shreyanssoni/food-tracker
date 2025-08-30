"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useSession } from "next-auth/react";
import { PlusCircle, Loader2, Soup, Mic, Pause, Play, Square } from "lucide-react";
import type { FoodLog } from "@/types";
import { createClient as createBrowserClient } from "@/utils/supabase/client";

const schema = z.object({
  text: z.string().min(2, { message: "Please enter what you ate" }),
});

type Message = {
  type: "success" | "error" | "info";
  content: string;
  timestamp: Date;
};

export function FoodForm({ onLogged }: { onLogged: (log: FoodLog) => void }) {
  const { data: session } = useSession();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const supabase = createBrowserClient();

  // Voice dictation state
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [processing, setProcessing] = useState(false); // UI: after stop, while engine finalizes
  const [serverSttEnabled, setServerSttEnabled] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<BlobPart[]>([]);
  const autoStopTimerRef = useRef<number | null>(null);
  const processingTimeoutRef = useRef<number | null>(null);

  const getRecognition = () => {
    const SR: any = (typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null;
    if (!SR) return null;
    const rec = new SR();
    rec.lang = "en-US"; // English transcription
    rec.interimResults = true;
    rec.continuous = true;
    return rec;
  };

  const hasWebSpeech = () =>
    typeof window !== "undefined" && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const stopDictation = () => {
    try {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
    } catch {}
    recognitionRef.current = null;
    setRecording(false);
    setPaused(false);
    setProcessing(true);
    // schedule safety timeout for processing to avoid stuck UI
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
    }
    processingTimeoutRef.current = window.setTimeout(() => {
      setProcessing(false);
      addMessage("error", "Transcription took too long. You can resume recording or type your meal.");
    }, 15000) as unknown as number;
    // If we were using server recording, stop that path too
    if (mediaRecorderRef.current) {
      stopServerRecording();
    }
    // clear any running auto-stop timers
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  };

  const startDictation = async () => {
    if (loading) return;
    const rec = getRecognition();
    if (!rec) {
      // Prefer front-end only: do not auto-fallback to server
      addMessage(
        "info",
        "Voice input isn’t supported on this device/browser. For fastest English dictation, try Chrome. You can also type your meal or add a photo."
      );
      return;
    }

    // Preflight permission
    const allowed = await ensureMicPermission();
    if (!allowed) {
      addMessage(
        "error",
        "Microphone permission is blocked. In Chrome: click the lock icon > Site settings > Allow Microphone. You can also type your meal or add a photo."
      );
      return;
    }

    let pendingFinal = "";

    rec.onresult = (event: any) => {
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalChunk += result[0].transcript;
        } else {
          // Optionally we could show interim text; we keep UI simple.
        }
      }
      if (finalChunk.trim()) {
        pendingFinal += (pendingFinal ? " " : "") + finalChunk.trim();
        setText((prev) => {
          const sep = prev && !prev.endsWith(" ") ? " " : "";
          return (prev + sep + pendingFinal).trimStart();
        });
        pendingFinal = "";
      }
    };


    rec.onerror = (e: any) => {
      const err: string | undefined = e?.error;
      if (err === "not-allowed") {
        addMessage("error", "Microphone access denied. Please allow the mic in browser settings, or type your meal/add a photo.");
      } else if (err === "audio-capture") {
        addMessage("error", "No microphone found. Connect a mic or type your meal/add a photo.");
      } else if (err === "network") {
        addMessage("error", "Network error during transcription. Please try again, type your meal, or add a photo.");
      } else if (err === "no-speech") {
        addMessage("info", "Didn't catch that. Try again, or type your meal/add a photo.");
      } else {
        addMessage("error", "Could not record or transcribe. Please type your meal or add a photo.");
      }
      stopDictation();
      setProcessing(false);
    };

    rec.onend = () => {
      // Auto-stop callback from engine (silence etc.)
      if (!paused) {
        setRecording(false);
        setProcessing(false);
        if (processingTimeoutRef.current) {
          clearTimeout(processingTimeoutRef.current);
          processingTimeoutRef.current = null;
        }
      }
    };

    try {
      rec.start();
      recognitionRef.current = rec;
      setRecording(true);
      setPaused(false);
      // 60s auto-stop
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = window.setTimeout(() => {
        addMessage("info", "Auto-stopped after 1 minute and transcribing.");
        stopDictation();
      }, 60000) as unknown as number;
    } catch {
      addMessage("error", "Could not start voice input");
    }
  };

  const ensureMicPermission = async (): Promise<boolean> => {
    try {
      if (!(navigator as any)?.mediaDevices?.getUserMedia) return true; // continue; SR may still prompt
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately stop tracks; SR will handle audio
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      return false;
    }
  };

  // Server STT recording using MediaRecorder
  const startServerRecording = async () => {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      addMessage("info", "Voice input not supported. Please type your meal or add a photo.");
      return;
    }
    const allowed = await ensureMicPermission();
    if (!allowed) {
      addMessage(
        "error",
        "Microphone permission is blocked. In Chrome: click the lock icon > Site settings > Allow Microphone. You can also type your meal or add a photo."
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) mediaChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        try {
          // stop all tracks
          stream.getTracks().forEach((t) => t.stop());
        } catch {}
        setProcessing(true);
        const blob = new Blob(mediaChunksRef.current, { type: "audio/webm" });
        mediaChunksRef.current = [];
        try {
          const form = new FormData();
          form.append("file", blob, "audio.webm");
          // Add fetch timeout to avoid stuck processing
          const controller = new AbortController();
          const fetchTimeout = window.setTimeout(() => controller.abort(), 30000);
          const res = await fetch("/api/ai/stt", { method: "POST", body: form, signal: controller.signal });
          clearTimeout(fetchTimeout);
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j?.error || `Transcription failed (${res.status})`);
          }
          const j = await res.json();
          const t = (j?.text || "").trim();
          if (t) {
            setText((prev) => {
              const sep = prev && !prev.endsWith(" ") ? " ": "";
              return (prev + sep + t).trimStart();
            });
          } else {
            addMessage("info", "Didn't catch that. Try again, or type your meal/add a photo.");
          }
        } catch (e: any) {
          if (e?.name === 'AbortError') {
            addMessage("error", "Transcription timed out. Please try again or type your meal.");
          } else {
            addMessage("error", e?.message || "Could not transcribe. Please type your meal or add a photo.");
          }
        } finally {
          setProcessing(false);
          if (processingTimeoutRef.current) {
            clearTimeout(processingTimeoutRef.current);
            processingTimeoutRef.current = null;
          }
        }
      };
      mediaRecorderRef.current = mr;
      // Use timeslice to periodically flush data and allow idle timers if needed
      mr.start(1000);
      setRecording(true);
      setPaused(false);
      // Auto-stop after 60s
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          addMessage("info", "Auto-stopped after 1 minute and transcribing.");
          stopServerRecording();
        }
      }, 60000) as unknown as number;
    } catch (e) {
      addMessage("error", "Could not start recording. Please type your meal or add a photo.");
    }
  };

  const stopServerRecording = () => {
    try {
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== "inactive") {
        mr.stop();
      }
    } catch {}
    mediaRecorderRef.current = null;
    setRecording(false);
    setPaused(false);
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  };

  // Pause/Resume handlers
  const togglePause = () => {
    if (!recording) return;
    // Web Speech API: emulate pause by stopping engine without processing, resume by startDictation
    if (recognitionRef.current) {
      if (!paused) {
        try { recognitionRef.current.stop?.(); } catch {}
        setPaused(true);
      } else {
        startDictation();
      }
      return;
    }
    // Server recording
    const mr = mediaRecorderRef.current;
    if (mr) {
      if (!paused && mr.state === "recording" && (mr as any).pause) {
        (mr as any).pause();
        setPaused(true);
      } else if (paused && (mr as any).resume) {
        (mr as any).resume();
        setPaused(false);
      }
    }
  };

  const presets = [
    "2 eggs and toast at 9am",
    "Large coffee with oat milk 30 min ago",
    "Chicken salad bowl for lunch",
  ];

  const addMessage = (type: Message["type"], content: string) => {
    setMessages((prev) => [
      { type, content, timestamp: new Date() },
      ...prev.slice(0, 4), // Keep only the last 5 messages
    ]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = schema.safeParse({ text });
    if (!parsed.success) {
      addMessage(
        "error",
        'Please enter what you ate (e.g., "2 eggs and toast at 9am")'
      );
      return;
    }

    setLoading(true);
    addMessage("info", "Analyzing your meal...");

    try {
      const response = await fetch("/api/ai/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          userId: session?.user?.id,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to analyze your meal");
      }

      const data = await response.json();

      if (data?.log) {
        try {
          // Add user ID to the log
          const baseLog = { ...data.log } as any;
          // If eaten_at is null/undefined, omit it so DB default now() is used
          if (baseLog.eaten_at == null) {
            delete baseLog.eaten_at;
          }
          // Compose final payload without unknown columns
          const logWithUser = {
            ...baseLog,
            user_id: session?.user?.id || null,
          } as const;

          const { data: inserted, error } = await supabase
            .from("food_logs")
            .insert(logWithUser)
            .select()
            .single();

          if (error) throw error;

          onLogged(inserted);
          setText("");

          // Get empathetic response
          try {
            const empathyRes = await fetch("/api/ai/empathy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ log: inserted }),
            });

            if (empathyRes.ok) {
              const empathyData = await empathyRes.json();
              addMessage(
                "success",
                empathyData.message || "Meal logged successfully!"
              );
            } else {
              addMessage("success", "Meal logged successfully!");
            }
          } catch (empathyError) {
            console.error("Error getting empathetic response:", empathyError);
            addMessage("success", "Meal logged successfully!");
          }
        } catch (dbError) {
          console.error("Database error:", dbError);
          addMessage("error", "Failed to save your meal. Please try again.");
        }
      } else {
        addMessage(
          "error",
          "Could not understand your meal. Try being more specific."
        );
      }
    } catch (e) {
      console.error("Error:", e);
      addMessage("error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch server STT availability
  useEffect(() => {
    fetch("/api/ai/stt")
      .then((r) => r.ok ? r.json() : { enabled: false })
      .then((d) => setServerSttEnabled(Boolean(d?.enabled)))
      .catch(() => setServerSttEnabled(false));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        if (recognitionRef.current) {
          recognitionRef.current.stop?.();
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch {}
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-3">
        <div className="relative group">
          {/* leading icon */}
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black dark:text-white transition-colors">
            <Soup className="h-5 w-5" />
          </div>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder="What did you eat?"
            aria-label="Quick log: what did you eat?"
            maxLength={140}
            className={`w-full pl-10 pr-36 py-4 rounded-xl border bg-white/80 backdrop-blur dark:bg-zinc-900/70 border-zinc-200 dark:border-zinc-700 focus:border-transparent transition-all duration-200 shadow-sm ${
              recording
                ? "ring-2 ring-rose-500/50 sm:animate-pulse"
                : processing
                  ? "ring-2 ring-blue-500/50 sm:animate-pulse"
                  : "focus:ring-2 focus:ring-blue-500"
            }`}
            disabled={loading}
          />
          {(recording || processing) && (
            <div
              aria-live="polite"
              className="sm:absolute sm:-top-2 sm:right-2 sm:translate-y-[-100%] mt-2 sm:mt-0 flex items-center gap-2 text-[12px] sm:text-[11px] rounded-full px-2.5 py-1.5 sm:px-2 sm:py-1 border backdrop-blur shadow-sm select-none
              bg-white/80 border-zinc-200 text-zinc-700 dark:bg-zinc-900/70 dark:border-zinc-700 dark:text-zinc-200"
            >
              {recording && !paused ? (
                <>
                  <span className="relative inline-flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-60" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600" />
                  </span>
                  Listening…
                  <button type="button" onClick={togglePause} className="ml-2 px-2 py-0.5 rounded-full underline hover:no-underline">Pause</button>
                  <button type="button" onClick={stopDictation} className="ml-1 px-2 py-0.5 rounded-full text-zinc-600 hover:text-zinc-800">Stop</button>
                  {/* mini equalizer */}
                  <span className="ml-1 flex items-end gap-[2px]" aria-hidden>
                    <span className="w-[2px] h-2 bg-rose-500 animate-[bounce_0.9s_ease-in-out_infinite]" />
                    <span className="w-[2px] h-3 bg-rose-500 animate-[bounce_1.1s_ease-in-out_infinite]" />
                    <span className="w-[2px] h-2 bg-rose-500 animate-[bounce_0.8s_ease-in-out_infinite]" />
                  </span>
                </>
              ) : processing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                  Transcribing…
                </>
              ) : (
                <>
                  <Mic className="h-3.5 w-3.5 text-zinc-500" />
                  Paused
                  <button type="button" onClick={togglePause} className="ml-2 px-2 py-0.5 rounded-full underline hover:no-underline">Resume</button>
                  <button type="button" onClick={stopDictation} className="ml-1 px-2 py-0.5 rounded-full text-zinc-600 hover:text-zinc-800">Stop</button>
                </>
              )}
            </div>
          )}
          {/* voice dictation toggle (responsive for mobile) */}
          <button
            type="button"
            onClick={() => (recording ? togglePause() : startDictation())}
            className={`group absolute right-14 sm:right-12 top-1/2 -translate-y-1/2 h-11 w-11 sm:h-10 sm:w-10 inline-flex items-center justify-center rounded-full transition-all duration-200 z-10
              ${loading ? "cursor-not-allowed opacity-60" : "hover:scale-[1.04] active:scale-[0.98]"}
              ${recording
                ? "text-rose-700 dark:text-rose-300 bg-rose-50/70 dark:bg-rose-400/10 border border-rose-200/70 dark:border-rose-500/30 shadow-sm"
                : "text-zinc-700 dark:text-zinc-200 bg-white/70 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-700 shadow-sm hover:bg-zinc-50/80 dark:hover:bg-zinc-800/60"}
            `}
            aria-label={recording ? (paused ? "Resume voice input" : "Pause voice input") : "Start voice input"}
            aria-pressed={recording}
            title={recording ? (paused ? "Resume voice input" : "Pause voice input") : "Start voice input"}
            disabled={loading}
          >
            {/* gradient ring */}
            <span
              className={`absolute inset-0 rounded-full pointer-events-none transition-opacity hidden sm:block ${recording ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
              aria-hidden
              style={{
                background: "linear-gradient(135deg, rgba(244,63,94,0.25), rgba(14,165,233,0.15))",
                padding: 1,
                WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                WebkitMaskComposite: "xor" as any,
                maskComposite: "exclude" as any,
              }}
            />
            {/* glow when recording */}
            {recording && (
              <span className="absolute -inset-0.5 sm:-inset-1 rounded-full bg-rose-500/15 blur-sm sm:blur-md sm:animate-pulse" aria-hidden />
            )}
            <span className="relative">
              {recording ? (
                paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
              <span className="sr-only">{recording ? (paused ? "Resume" : "Pause") : "Start"} voice input</span>
            </span>
            {/* focus ring */}
            <span className="absolute inset-0 rounded-full ring-2 ring-transparent focus-within:ring-rose-400" aria-hidden />
          </button>
          {/* submit button (responsive for mobile) */}
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-11 w-11 sm:h-10 sm:w-10 inline-flex items-center justify-center rounded-full text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 dark:bg-blue-500 dark:hover:bg-blue-600 shadow focus:outline-none focus:ring-2 focus:ring-blue-400 z-20"
            disabled={loading || !text.trim()}
            aria-label="Add log"
            title="Add log"
          >
            <PlusCircle className="h-5 w-5" />
          </button>
        </div>

        {/* helper hint + CTA */}
        <div className="text-xs text-zinc-500 dark:text-zinc-400 text-center transition-opacity">
          Tip: include time like “at 9am” or recency like “30 min ago” for better logs.
          <div className="mt-1">
            Or <button
              type="button"
              onClick={() => {
                // focus input for typing
              }}
              className="underline hover:no-underline">type your meal</button> or <button
              type="button"
              onClick={() => {
                // Dispatch a custom event to open photo upload panel
                window.dispatchEvent(new CustomEvent("open-photo-upload"));
                const el = document.getElementById("photo-upload-panel");
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              className="underline hover:no-underline">add a photo</button>.
          </div>
          {!hasWebSpeech() && serverSttEnabled && (
            <div className="mt-1">
              No browser dictation? <button
                type="button"
                onClick={() => startServerRecording()}
                className="underline hover:no-underline"
              >Use server transcription (slower)</button>
            </div>
          )}
        </div>
      </form>

      {/* Messages */}
      {messages.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`p-3 rounded-lg text-sm border ${
                msg.type === "error"
                  ? "bg-red-50 text-red-700 border-red-100 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20"
                  : msg.type === "success"
                    ? "bg-green-50 text-green-700 border-green-100 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/20"
                    : "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20"
              }`}
            >
              {msg.content}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
