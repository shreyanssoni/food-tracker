export type Slot = 'weapon' | 'armor' | 'cosmetic' | 'pet';

// Placeholder TYPE mapping using public_slug as key (preferred),
// falling back to id if you don't have a slug for a collectible.
// Expand this map as needed. One type per collectible.
export const collectibleTypeMap: Record<string, Slot> = {
  // Examples by public_slug
  'steel-sword': 'weapon',
  'guardian-armor': 'armor',
  'top-hat': 'cosmetic',
  'mini-dragon': 'pet',

  // You can also key by ID if needed, e.g. '123': 'weapon'
};

// Name-based mapping (case-insensitive). Use for data that lacks public_slug.
export const collectibleNameTypeMap: Record<string, Slot> = {
  // Provided mappings
  'warrior embelem': 'weapon',
  'keep going soldier': 'armor',
  'platinum crest': 'armor',
  'diamond relic': 'armor',
  'mystic rune': 'cosmetic',
  'dragon seal': 'cosmetic',
  'shadow crown': 'cosmetic',
  'flame coin': 'cosmetic',
  'infinity token': 'cosmetic',
};

export function collectibleTypeFor(c: any): Slot | null {
  // Prefer an explicit type on the object if present
  const inlineType = (c?.type as Slot | undefined) || null;
  if (inlineType && ['weapon','armor','cosmetic','pet'].includes(inlineType)) return inlineType;
  const key = (c?.public_slug as string) || String(c?.id || '');
  if (key && collectibleTypeMap[key]) return collectibleTypeMap[key];
  const nm = String(c?.name || '').trim().toLowerCase();
  if (nm && collectibleNameTypeMap[nm]) return collectibleNameTypeMap[nm];
  return null;
}

export function allowedSlotsForCollectible(c: any): Slot[] {
  // Badges cannot be equipped
  if (c?.is_badge) return [];
  const t = collectibleTypeFor(c);
  if (t) return [t];
  // Default: allow all if not explicitly typed
  return (['weapon', 'armor', 'cosmetic', 'pet'] as Slot[]);
}
