"use client";
import React from "react";
import CollectibleCard, { Collectible } from "./CollectibleCard";

export type Equipped = { weapon?: string | null; armor?: string | null; cosmetic?: string | null; pet?: string | null } | null;

type Props = {
  items: Collectible[];
  equipped?: Equipped;
  onEquip?: (item: Collectible) => void;
  onUnequip?: (item: Collectible) => void;
};

export default function CollectiblesGrid({ items, equipped, onEquip, onUnequip }: Props) {
  const equippedSet = new Set<string>([
    equipped?.weapon || "",
    equipped?.armor || "",
    equipped?.cosmetic || "",
    equipped?.pet || "",
  ].filter(Boolean) as string[]);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
      {items.map((it) => (
        <CollectibleCard
          key={it.id}
          item={it}
          owned
          equipped={equippedSet.has(it.id)}
          onEquip={onEquip}
          onUnequip={onUnequip}
          compact
        />
      ))}
    </div>
  );
}
