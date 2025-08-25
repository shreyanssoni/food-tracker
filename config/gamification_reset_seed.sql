-- Reset and reseed collectibles and rewards (safe, ordered, idempotent-ish)
-- Run after schema files: config/supabase.sql and config/gamification.sql
-- Purpose: clear all collectibles and rewards-related data, then insert a clean, industry-grade baseline

BEGIN;

-- =============================
-- 1) Clear dependent data first (respect FK constraints)
-- =============================

-- Claims on rewards
DELETE FROM public.user_reward_claims;

-- User-owned collectibles
DELETE FROM public.user_collectibles;

-- Goal collectible links
DELETE FROM public.goal_collectibles;

-- Store listings for collectibles
DELETE FROM public.collectibles_store;

-- Gating/requirements for collectibles
DELETE FROM public.collectibles_requirements;

-- Rewards themselves (depends on level_reward_groups optionally)
DELETE FROM public.rewards;

-- Optional: clear reward groups as well to rebuild cleanly
DELETE FROM public.level_reward_groups;

-- Finally, collectibles catalog
DELETE FROM public.collectibles;

-- (We do not touch ledgers or user_progress here.)

-- =============================
-- 2) Seed: Collectibles catalog
--    Use explicit UUIDs generated at runtime where needed; here we use gen_random_uuid()
--    Keep inserts deterministic with ON CONFLICT guards in case of partial runs.
-- =============================

-- Core badges (progression)
WITH ins AS (
  SELECT
    jsonb_build_object(
      'name','Bronze Badge','icon','badge-bronze','rarity','common','is_badge',true
    ) AS j UNION ALL
  SELECT jsonb_build_object('name','Silver Badge','icon','badge-silver','rarity','rare','is_badge',true) UNION ALL
  SELECT jsonb_build_object('name','Gold Badge','icon','badge-gold','rarity','epic','is_badge',true)
)
INSERT INTO public.collectibles(id, name, icon, rarity, is_badge)
SELECT gen_random_uuid(), j->>'name', j->>'icon', j->>'rarity', (j->>'is_badge')::boolean
FROM ins
ON CONFLICT DO NOTHING;

-- Cosmetic/non-badge items (storeable)
WITH ins AS (
  SELECT jsonb_build_object('name','Warrior Embelem','icon','url1','rarity','common','is_badge',false) UNION ALL
  SELECT jsonb_build_object('name','Keep Going Soldier','icon','url2','rarity','common','is_badge',false) UNION ALL
  SELECT jsonb_build_object('name','Platinum Crest','icon','url3','rarity','rare','is_badge',false) UNION ALL
  SELECT jsonb_build_object('name','Diamond Relic','icon','url4','rarity','rare','is_badge',false) UNION ALL
  SELECT jsonb_build_object('name','Mystic Rune','icon','url5','rarity','rare','is_badge',false) UNION ALL
  SELECT jsonb_build_object('name','Dragon Seal','icon','url6','rarity','rare','is_badge',false) UNION ALL
  SELECT jsonb_build_object('name','Shadow Crown','icon','url7','rarity','epic','is_badge',false) UNION ALL
  SELECT jsonb_build_object('name','Flame Coin','icon','url8','rarity','epic','is_badge',false) UNION ALL
  SELECT jsonb_build_object('name','Infinity Token','icon','url9','rarity','epic','is_badge',false)
)
INSERT INTO public.collectibles(id, name, icon, rarity, is_badge)
SELECT gen_random_uuid(), j->>'name', j->>'icon', j->>'rarity', (j->>'is_badge')::boolean
FROM ins
ON CONFLICT DO NOTHING;

-- =============================
-- 3) Seed: Explicit Requirements (gating) from sheet
-- Clear any leftover requirements for our 9 items to avoid duplicates
DELETE FROM public.collectibles_requirements
WHERE collectible_id IN (
  SELECT id FROM public.collectibles WHERE name IN (
    'Warrior Embelem','Keep Going Soldier','Platinum Crest','Diamond Relic','Mystic Rune','Dragon Seal','Shadow Crown','Flame Coin','Infinity Token'
  )
);

DO $$
DECLARE bronze uuid; silver uuid; gold uuid;
BEGIN
  SELECT id INTO bronze FROM public.collectibles WHERE LOWER(name) LIKE 'bronze%';
  SELECT id INTO silver FROM public.collectibles WHERE LOWER(name) LIKE 'silver%';
  SELECT id INTO gold   FROM public.collectibles WHERE LOWER(name) LIKE 'gold%';

  -- Level-only requirements
  INSERT INTO public.collectibles_requirements(collectible_id, min_level)
  SELECT c.id, 2 FROM public.collectibles c WHERE c.name='Warrior Embelem' ON CONFLICT (collectible_id) DO UPDATE SET min_level=EXCLUDED.min_level;
  INSERT INTO public.collectibles_requirements(collectible_id, min_level)
  SELECT c.id, 3 FROM public.collectibles c WHERE c.name='Keep Going Soldier' ON CONFLICT (collectible_id) DO UPDATE SET min_level=EXCLUDED.min_level;
  INSERT INTO public.collectibles_requirements(collectible_id, min_level)
  SELECT c.id, 12 FROM public.collectibles c WHERE c.name='Mystic Rune' ON CONFLICT (collectible_id) DO UPDATE SET min_level=EXCLUDED.min_level;
  INSERT INTO public.collectibles_requirements(collectible_id, min_level)
  SELECT c.id, 20 FROM public.collectibles c WHERE c.name='Shadow Crown' ON CONFLICT (collectible_id) DO UPDATE SET min_level=EXCLUDED.min_level;
  INSERT INTO public.collectibles_requirements(collectible_id, min_level)
  SELECT c.id, 22 FROM public.collectibles c WHERE c.name='Flame Coin' ON CONFLICT (collectible_id) DO UPDATE SET min_level=EXCLUDED.min_level;

  -- Badge-only requirements
  IF bronze IS NOT NULL THEN
    INSERT INTO public.collectibles_requirements(collectible_id, required_badge_id)
    SELECT c.id, bronze FROM public.collectibles c WHERE c.name='Platinum Crest'
    ON CONFLICT (collectible_id) DO UPDATE SET required_badge_id=EXCLUDED.required_badge_id;
  END IF;
  IF silver IS NOT NULL THEN
    INSERT INTO public.collectibles_requirements(collectible_id, required_badge_id)
    SELECT c.id, silver FROM public.collectibles c WHERE c.name='Dragon Seal'
    ON CONFLICT (collectible_id) DO UPDATE SET required_badge_id=EXCLUDED.required_badge_id;
  END IF;
  IF gold IS NOT NULL THEN
    INSERT INTO public.collectibles_requirements(collectible_id, required_badge_id)
    SELECT c.id, gold FROM public.collectibles c WHERE c.name='Infinity Token'
    ON CONFLICT (collectible_id) DO UPDATE SET required_badge_id=EXCLUDED.required_badge_id;
  END IF;

  -- Both badge and level
  IF bronze IS NOT NULL THEN
    INSERT INTO public.collectibles_requirements(collectible_id, required_badge_id, min_level)
    SELECT c.id, bronze, 10 FROM public.collectibles c WHERE c.name='Diamond Relic'
    ON CONFLICT (collectible_id) DO UPDATE SET required_badge_id=EXCLUDED.required_badge_id, min_level=EXCLUDED.min_level;
  END IF;
END $$;

-- =============================
-- 4) Seed: Store listings with explicit prices from sheet
-- Clear old prices for our items, then insert
DELETE FROM public.collectibles_store
WHERE collectible_id IN (
  SELECT id FROM public.collectibles WHERE name IN (
    'Warrior Embelem','Keep Going Soldier','Platinum Crest','Diamond Relic','Mystic Rune','Dragon Seal','Shadow Crown','Flame Coin','Infinity Token'
  )
);

INSERT INTO public.collectibles_store(collectible_id, price)
SELECT c.id, x.price
FROM (
  VALUES
    ('Warrior Embelem', 50),
    ('Keep Going Soldier', 50),
    ('Platinum Crest', 200),
    ('Diamond Relic', 300),
    ('Mystic Rune', 300),
    ('Dragon Seal', 300),
    ('Shadow Crown', 300),
    ('Flame Coin', 300),
    ('Infinity Token', 500)
) AS x(name, price)
JOIN public.collectibles c ON c.name = x.name
ON CONFLICT DO NOTHING;

-- =============================
-- 5) Seed: Rewards groups (unlock rules)
--    Create groups for levels 2..15 (example). You may extend per your level curve.
-- =============================
WITH lvls AS (
  SELECT generate_series(2, 25) AS lvl
)
INSERT INTO public.level_reward_groups(id, unlock_rule, unlock_level)
SELECT gen_random_uuid(), 'level', lvl FROM lvls
ON CONFLICT (unlock_rule, unlock_level, unlock_ep) DO NOTHING;

-- =============================
-- 6) Seed: Rewards
--    Mix of diamond grants and collectible unlocks at key levels.
-- =============================

-- Diamond rewards at L5, L15, L25 per sheet
INSERT INTO public.rewards(id, kind, amount, unlock_rule, unlock_level, group_id)
SELECT gen_random_uuid(), 'diamond', x.amount, 'level', x.level,
       (SELECT id FROM public.level_reward_groups g WHERE g.unlock_rule='level' AND g.unlock_level=x.level LIMIT 1)
FROM (
  VALUES (5, 50), (15, 250), (25, 1000)
) AS x(level, amount)
ON CONFLICT DO NOTHING;

-- Collectible (badge) rewards at L5, L15, L25 per sheet
INSERT INTO public.rewards(id, kind, collectible_id, unlock_rule, unlock_level, group_id)
SELECT gen_random_uuid(), 'collectible', c.id, 'level', x.level,
       (SELECT id FROM public.level_reward_groups g WHERE g.unlock_rule='level' AND g.unlock_level=x.level LIMIT 1)
FROM (
  VALUES ('bronze badge', 5), ('silver badge', 15), ('gold badge', 25)
) AS x(name, level)
JOIN public.collectibles c ON LOWER(c.name)=x.name
ON CONFLICT DO NOTHING;

-- Optional: express EP-based unlocks mirrored from levels
-- UPDATE public.rewards r
-- SET unlock_ep = v.cum_ep_from
-- FROM public.v_levels_cumulative v
-- WHERE r.unlock_rule='level' AND r.unlock_level=v.level;

COMMIT;
