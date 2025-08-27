"use client";
import React from "react";

// Renders a layered avatar using appearance stage and equipped items metadata
// equippedMeta is a map keyed by collectible id => { icon, name, ... }
// equipment slots store collectible ids: weapon, armor, cosmetic, pet

type EquippedMeta = Record<string, { icon?: string; name?: string; rarity?: string } | undefined>;

type Props = {
  appearanceStage: string; // e.g., 'stage1'..'stage6'
  imageUrl?: string; // public url from storage
  equipment?: { weapon?: string | null; armor?: string | null; cosmetic?: string | null; pet?: string | null } | null;
  equippedMeta?: EquippedMeta;
  className?: string;
};

export default function AvatarCanvas({ appearanceStage, imageUrl, equipment, equippedMeta, className = "" }: Props) {
  // Helper to resolve icon path or http url -> fallback
  const resolveIcon = (icon?: string | null) => {
    if (!icon) return "/images/collectibles/default.svg";
    if (icon.startsWith("http") || icon.startsWith("/")) return icon;
    return `/images/collectibles/${icon}.svg`;
  };

  // Clamp stage to a maximum of 50 for rendering assets
  const clampStageName = (stage: string) => {
    const m = stage?.match(/stage(\d+)/i);
    if (!m) return stage;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > 50) return "stage50";
    return `stage${n}`;
  };

  // If an external storage URL encodes stage number, rewrite to 50 when >50
  const resolveAvatarSrc = (src: string | undefined | null, stage: string) => {
    const capped = clampStageName(stage);
    if (src) {
      try {
        // Replace occurrences like avatar_stage12.svg or /stage12/ to stage50
        if (/stage\d+/i.test(src) && capped === "stage50") {
          return src.replace(/stage\d+/ig, "stage50");
        }
      } catch {}
      return src;
    }
    return `/images/collectibles/avatar_${capped}.svg`;
  };

  const weapon = equipment?.weapon ? equippedMeta?.[equipment.weapon] : undefined;
  const armor = equipment?.armor ? equippedMeta?.[equipment.armor] : undefined;
  const cosmetic = equipment?.cosmetic ? equippedMeta?.[equipment.cosmetic] : undefined;
  const pet = equipment?.pet ? equippedMeta?.[equipment.pet] : undefined;
  const primary = weapon || armor || pet || cosmetic;
  const equippedList = [
    weapon ? { key: 'weapon', item: weapon } : null,
    armor ? { key: 'armor', item: armor } : null,
    cosmetic ? { key: 'cosmetic', item: cosmetic } : null,
    pet ? { key: 'pet', item: pet } : null,
  ].filter(Boolean) as Array<{ key: string; item: { icon?: string; name?: string; rarity?: string } }>;

  const slotLetter = (slot: string) => ({ weapon: 'W', armor: 'A', cosmetic: 'C', pet: 'P' } as Record<string, string>)[slot] || '?';

  return (
    <div className={`group relative w-full aspect-square max-w-[16rem] sm:max-w-sm mx-auto transition-transform duration-200 ease-out will-change-transform hover:-translate-y-0.5 ${className}`}>
      {/* Gradient glow frame (softer in light) */}
      <div
        className="pointer-events-none absolute -inset-[3px] rounded-3xl bg-[conic-gradient(at_20%_-10%,#22d3ee_10%,#6366f1_35%,#a855f7_55%,#22d3ee_85%)] opacity-20 group-hover:opacity-40 dark:opacity-30 dark:group-hover:opacity-60 blur-xl transition-opacity duration-300"
        aria-hidden
      />
      {/* Base avatar frame based on stage */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden border border-slate-200/70 dark:border-gray-800 bg-gradient-to-br from-white/70 to-slate-50/70 dark:from-gray-900/80 dark:to-black/40 shadow-[inset_0_0_1px_rgba(0,0,0,0.06),0_8px_24px_rgba(2,6,23,0.06)]">
        {/* simple stage background variations */}
        <div className={`absolute inset-0 ${stageGradient(appearanceStage)} opacity-60 dark:opacity-70`} />
      </div>
      {/* Base sprite placeholder (could be replaced by stage-specific asset) */}
      <div className="absolute inset-0 grid place-items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolveAvatarSrc(imageUrl, appearanceStage)}
          onError={(e) => {
            const fallback = "/images/collectibles/default.svg";
            // @ts-ignore
            if (!e.currentTarget.src.endsWith(fallback)) {
              // @ts-ignore
              e.currentTarget.src = fallback;
            }
          }}
          alt="avatar"
          className="h-[72%] w-[72%] sm:h-[70%] sm:w-[70%] object-contain drop-shadow-[0_4px_20px_rgba(0,0,0,0.08)]"
        />
      </div>

      {/* Equipped chips row (bottom, non-obtrusive) */}
      {equippedList.length > 0 && (
        <div className="absolute inset-x-0 bottom-2 sm:bottom-3 flex items-center justify-center gap-1.5 sm:gap-2 px-2">
          {equippedList.map(({ key, item }) => (
            <div
              key={key}
              className={`flex items-center gap-1 px-2 py-1 rounded-full border transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md ${rarityClasses(item.rarity).badge} ${rarityClasses(item.rarity).glow}`}
              title={item.name || key}
            >
              <span
                className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-white text-slate-800 dark:bg-white/10 dark:text-slate-200 text-[9px] font-bold px-[6px] leading-none border border-slate-200 dark:border-white/10 shadow-sm transition-transform duration-200"
                aria-label={`${key} slot`}
              >
                {slotLetter(key)}
              </span>
              <img
                src={resolveIcon(item.icon)}
                alt={item.name || key}
                className="h-4 w-4 sm:h-5 sm:w-5 object-contain"
              />
            </div>
          ))}
        </div>
      )}

      {/* Single primary badge removed in favor of multi-chip row above */}
    </div>
  );
}

function stageGradient(stage: string) {
  switch (stage) {
    case "stage6":
      return "bg-gradient-to-br from-emerald-300/50 to-blue-300/50 dark:from-emerald-800/40 dark:to-blue-900/30";
    case "stage5":
      return "bg-gradient-to-br from-blue-300/50 to-fuchsia-300/50 dark:from-blue-800/40 dark:to-fuchsia-900/30";
    case "stage4":
      return "bg-gradient-to-br from-amber-300/50 to-rose-300/50 dark:from-amber-800/40 dark:to-rose-900/30";
    case "stage3":
      return "bg-gradient-to-br from-cyan-300/50 to-emerald-300/50 dark:from-cyan-800/40 dark:to-emerald-900/30";
    case "stage2":
      return "bg-gradient-to-br from-gray-300/50 to-blue-200/50 dark:from-gray-800/40 dark:to-blue-900/20";
    default:
      return "bg-gradient-to-br from-gray-200/50 to-white/40 dark:from-gray-900/40 dark:to-gray-950/20";
  }
}

function rarityClasses(r?: string) {
  const rarity = (r || '').toLowerCase();
  switch (rarity) {
    case 'legendary':
      return {
        badge: 'border-amber-300/70 dark:border-amber-500/50 bg-amber-50/80 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200',
        glow: 'shadow-[0_0_18px_rgba(245,158,11,0.35)]'
      };
    case 'epic':
      return {
        badge: 'border-fuchsia-300/70 dark:border-fuchsia-500/50 bg-fuchsia-50/80 dark:bg-fuchsia-900/20 text-fuchsia-800 dark:text-fuchsia-200',
        glow: 'shadow-[0_0_16px_rgba(217,70,239,0.30)]'
      };
    case 'rare':
      return {
        badge: 'border-blue-300/70 dark:border-blue-500/50 bg-blue-50/80 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200',
        glow: 'shadow-[0_0_14px_rgba(59,130,246,0.28)]'
      };
    case 'uncommon':
      return {
        badge: 'border-emerald-300/70 dark:border-emerald-500/50 bg-emerald-50/80 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200',
        glow: 'shadow-[0_0_12px_rgba(16,185,129,0.25)]'
      };
    default:
      return {
        badge: 'border-slate-300/70 dark:border-slate-600/60 bg-white/70 dark:bg-slate-900/50 text-slate-700 dark:text-slate-200',
        glow: 'shadow-[0_0_10px_rgba(148,163,184,0.20)]'
      };
  }
}
