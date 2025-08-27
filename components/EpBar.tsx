"use client";
import React from "react";

type Props = {
  level: number;
  currentEp: number;
  requiredEp: number;
  className?: string;
};

export default function EpBar({ level, currentEp, requiredEp, className = "" }: Props) {
  const pct = Math.max(0, Math.min(100, Math.round((currentEp / Math.max(1, requiredEp)) * 100)));
  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 font-semibold">Level {level}</span>
        <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">{currentEp} / {requiredEp} EP</span>
      </div>
      <div className="relative h-2.5 sm:h-3 rounded-full bg-gray-200/70 dark:bg-gray-800/70 overflow-hidden border border-white/50 dark:border-gray-900/50">
        <div
          className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
        {/* subtle shine */}
        <div className="pointer-events-none absolute inset-0 bg-white/10 mix-blend-overlay" />
      </div>
    </div>
  );
}
