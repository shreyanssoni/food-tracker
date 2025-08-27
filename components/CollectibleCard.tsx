"use client";
import React from "react";

export type Collectible = {
  id: string;
  name: string;
  icon?: string | null;
  rarity?: string | null;
  type?: "weapon" | "armor" | "cosmetic" | "pet" | string | null;
};

type Props = {
  item: Collectible;
  owned?: boolean;
  equipped?: boolean;
  onEquip?: (item: Collectible) => void;
  onUnequip?: (item: Collectible) => void;
  compact?: boolean;
};

export default function CollectibleCard({
  item,
  owned = true,
  equipped = false,
  onEquip,
  onUnequip,
  compact = false,
}: Props) {
  const rarity = (item.rarity || "common").toLowerCase();
  const rarityClass =
    rarity === "epic"
      ? "from-fuchsia-500 to-amber-400"
      : rarity === "rare"
        ? "from-blue-500 to-emerald-400"
        : "from-gray-400 to-gray-300";
  const resolveIcon = (icon?: string | null) => {
    if (!icon) return "/images/collectibles/default.svg";
    if (icon.startsWith("http") || icon.startsWith("/")) return icon;
    return `/images/collectibles/${icon}.svg`;
  };

  return (
    <div
      className={`group relative rounded-2xl p-[1px] bg-gradient-to-r ${rarityClass}`}
    >
      <div className="relative rounded-2xl p-2 sm:p-3 border border-white/60 dark:border-gray-800/70 bg-white/80 dark:bg-gray-950/60 h-full flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div
              className="text-[12px] sm:text-[13px] md:text-sm font-semibold leading-tight truncate"
              title={item.name}
            >
              {item.name}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r ${rarityClass} text-white capitalize`}
              >
                {item.rarity || "Common"}
              </span>
              {equipped && (
                <span className="text-[10px] px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                  Equipped
                </span>
              )}
            </div>
          </div>
        </div>
        <div
          className={`mt-2 ${compact ? "h-20" : "h-28 sm:h-32"} rounded-xl p-[1px] bg-gradient-to-r ${rarityClass} overflow-hidden`}
        >
          <div className="h-full w-full rounded-[10px] border border-gray-200/60 dark:border-gray-800/60 grid place-items-center bg-gray-50 dark:bg-gray-900 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveIcon(item.icon)}
              alt={item.name}
              className="block mx-auto max-h-full max-w-full object-contain object-center"
              onError={(e) => {
                const fallback = "/images/collectibles/default.svg";
                // @ts-ignore
                if (!e.currentTarget.src.endsWith(fallback)) {
                  // @ts-ignore
                  e.currentTarget.src = fallback;
                }
              }}
            />
          </div>
        </div>
        {owned && (
          <div className="mt-2 flex items-center justify-end gap-2">
            {equipped ? (
              <button
                onClick={() => onUnequip?.(item)}
                className="text-[11px] sm:text-xs px-2.5 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:bg-white/70 dark:hover:bg-gray-900/60"
              >
                Unequip
              </button>
            ) : (
              <button
                onClick={() => onEquip?.(item)}
                className="text-[11px] sm:text-xs px-2.5 py-1.5 rounded-full border border-transparent bg-gradient-to-r from-blue-600 to-emerald-500 text-white"
              >
                Equip
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
