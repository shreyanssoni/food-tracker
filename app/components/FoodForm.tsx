"use client";
import { useState } from "react";
import { z } from "zod";
import { useSession } from "next-auth/react";
import { PlusCircle, Loader2, Soup } from "lucide-react";
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
            className="w-full pl-10 pr-16 py-4 rounded-xl border bg-white/80 backdrop-blur dark:bg-zinc-900/70 border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm"
            disabled={loading}
          />
          {/* submit button */}
          <button
            type="submit"
            disabled={loading || !text.trim()}
            className={`absolute right-2 top-1/2 -translate-y-1/2 px-2 py-2 rounded-full transition-colors ${
              loading || !text.trim()
                ? "text-zinc-400 cursor-not-allowed"
                : "text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10"
            }`}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <PlusCircle className="h-5 w-5" />
            )}
          </button>
          {/* character counter */}
          {/* <div className="absolute -bottom-5 right-1 text-[11px] text-zinc-400">
            {text.length}/140
          </div> */}
        </div>

        {/* helper hint */}
        <div className="text-xs text-zinc-500 dark:text-zinc-400 text-center transition-opacity">
          Tip: include time like “at 9am” or recency like “30 min ago” for
          better logs
        </div>

        {/* example chips */}
        {/* <div className="flex flex-wrap gap-2 justify-center">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setText(p)}
              className="text-xs rounded-full px-3 py-1 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              {p}
            </button>
          ))}
        </div> */}
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
