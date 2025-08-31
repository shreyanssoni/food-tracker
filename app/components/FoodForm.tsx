"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useSession } from "next-auth/react";
import { PlusCircle, Loader2, Soup, Mic, MicOff } from "lucide-react";
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

  // Speech recognition state
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Initialize speech recognition
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.warn('Speech recognition not supported in this browser');
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const results = event.results;
        const transcript = Array.from(results)
          .map(result => result[0])
          .filter(Boolean) // Filter out any undefined results
          .map(result => result.transcript)
          .join('');
        
        setTranscript(transcript);
        setText(transcript);
      };

      recognition.onerror = (event: Event) => {
        const errorEvent = event as SpeechRecognitionErrorEvent;
        console.error('Speech recognition error', errorEvent.error);
        addMessage('error', `Speech recognition error: ${errorEvent.error}`);
        stopDictation();
      };

      recognition.onend = () => {
        if (isListening) {
          // If we're still supposed to be listening, restart recognition
          try {
            recognition.start();
          } catch (err) {
            console.error('Error restarting recognition:', err);
            stopDictation();
          }
        }
      };

      recognitionRef.current = recognition;

      return () => {
        recognition.stop();
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }
  }, [isListening]);

  useEffect(() => {
    if (transcript) {
      setText(transcript);
    }
  }, [transcript]);

  const startDictation = async () => {
    if (loading || !recognitionRef.current) {
      if (!recognitionRef.current) {
        addMessage('error', 'Speech recognition not available in your browser.');
      }
      return;
    }
    
    try {
      setTranscript('');
      setText('');
      setIsListening(true);
      
      // Start recognition with error handling
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error('Error starting recognition:', err);
        throw new Error('Failed to start voice input');
      }
      
      // Auto-stop after 60 seconds
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        addMessage('info', 'Auto-stopped after 1 minute.');
        stopDictation();
      }, 60000);
      
    } catch (err) {
      console.error('Error in startDictation:', err);
      addMessage('error', 'Could not start voice input. Please try again or type your meal.');
      setIsListening(false);
      setIsProcessing(false);
    }
  };

  const stopDictation = () => {
    setIsListening(false);
    setIsProcessing(false);
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.error('Error stopping recognition:', err);
      }
    }
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
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
              isListening
                ? "ring-2 ring-rose-400/40"
                : isProcessing
                  ? "ring-2 ring-blue-400/40"
                  : "focus:ring-2 focus:ring-blue-500"
            }`}
            disabled={loading}
          />
          {/* Removed the separate status pill to keep UI simple */}
          {/* Single mic button toggles start/stop */}
          <button
            type="button"
            onClick={isListening ? stopDictation : startDictation}
            disabled={loading}
            className={`absolute right-14 top-1/2 -translate-y-1/2 h-11 w-11 sm:h-10 sm:w-10 inline-flex items-center justify-center rounded-full transition-all z-20 ${
              isListening 
                ? 'text-white bg-red-600 hover:bg-red-700 focus:ring-2 focus:ring-red-400' 
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700/50'
            }`}
            aria-label={isListening ? 'Stop recording' : 'Start voice input'}
            title={isListening ? 'Stop voice input' : 'Start voice input'}
          >
            {isListening ? (
              <MicOff className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
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
