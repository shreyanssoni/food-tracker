"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Caveat } from "next/font/google";

const caveat = Caveat({ subsets: ["latin"], weight: ["400", "700"] });

export default function TypewriterSearch() {
  const phrases = [
    "i am growing 1% daily",
    "loggin my food",
    "walked 10000 steps today",
    "vibin'n to music",
  ];
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [pause, setPause] = useState(false);

  useEffect(() => {
    if (pause) {
      const t = setTimeout(() => setPause(false), 1200);
      return () => clearTimeout(t);
    }
    const current = phrases[phraseIndex % phrases.length];
    const speed = deleting ? 40 : 70;
    const timer = setTimeout(() => {
      if (!deleting) {
        const next = current.slice(0, text.length + 1);
        setText(next);
        if (next === current) {
          setPause(true);
          setDeleting(true);
        }
      } else {
        const next = current.slice(0, text.length - 1);
        setText(next);
        if (next.length === 0) {
          setDeleting(false);
          setPhraseIndex((i) => (i + 1) % phrases.length);
          setPause(true);
        }
      }
    }, speed);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, deleting, pause, phraseIndex]);

  return (
    <div className="w-full max-w-2xl">
      <div className="group flex items-center gap-3 rounded-full border border-gray-200/80 dark:border-gray-800/70 bg-white/80 dark:bg-gray-900/60 px-4 sm:px-5 py-2.5 sm:py-3 shadow-inner">
        <Search className="h-5 w-5 sm:h-6 sm:w-6 text-gray-500 dark:text-gray-400" aria-hidden />
        <div
          className={`truncate text-lg sm:text-2xl leading-7 sm:leading-8 text-gray-800 dark:text-gray-100 ${caveat.className}`}
          role="search"
          aria-label="Search"
        >
          {text}
          <span
            className="ml-1 inline-block w-[2px] h-6 sm:h-7 align-middle bg-gray-700 dark:bg-gray-200 animate-pulse"
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}
