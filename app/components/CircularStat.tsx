"use client";
import React from 'react';

interface Props {
  label: string;
  value: number; // current amount (e.g., 80g)
  target: number; // daily target (e.g., 150g)
  unit?: string; // g or kcal
}

export default function CircularStat({ label, value, target, unit = '' }: Props) {
  const clampedTarget = Math.max(1, target || 1);
  const ratio = Math.min(1, Math.max(0, value / clampedTarget));
  const size = 112; // larger for readability
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * ratio;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Use currentColor so we can style bg ring via text classes for light/dark */}
        <svg width={size} height={size} className="-rotate-90 text-gray-200 dark:text-gray-700">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#10b981"
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
            {Math.round(value)}{unit ? ` ${unit}` : ''}
          </div>
          <div className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">
            of {Math.round(target)}{unit ? ` ${unit}` : ''}
          </div>
        </div>
      </div>
      <div className="mt-2 text-sm font-medium text-gray-800 dark:text-gray-200">{label}</div>
    </div>
  );
}
