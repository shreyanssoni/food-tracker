"use client";
import { useEffect, useState } from "react";

export function HabitBanner() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const messages = [
      "Consistency is key. What small action can you take today?",
      "Remember, progress over perfection. Celebrate your small wins!",
      "Every day is a new opportunity to improve yourself. Take it!",
      "Don't watch the clock; do what it does. Keep going.",
      "Success is the sum of small efforts, repeated day in and day out.",
      "You are capable of more than you know. Believe in yourself!",
      "Take the first step. You don't have to see the whole staircase.",
      "It's not about having time; it's about making time.",
      "Small changes can make a big difference. Start today!",
      "Your only limit is your mind. Push beyond your boundaries.",
      "The journey of a thousand miles begins with one step.",
      "Hydrate check 💧 Take a sip and keep going!",
    ];
    const t = setTimeout(() => {
      const pick = messages[Math.floor(Math.random() * messages.length)];
      setMsg(pick);
    }, 800); // light nudge shortly after load
    return () => clearTimeout(t);
  }, []);

  if (!msg) return null;
  return (
    <div className="bg-brand-50 text-brand-800 rounded-xl p-3 text-sm shadow-soft">
      {msg}
    </div>
  );
}
