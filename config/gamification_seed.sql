-- Optional seed data for gamification tables (idempotent)
-- Run after gamification.sql

-- Seed levels 1..20 with a simple EP curve: 100 + (level-1)*20
DO $$
DECLARE i int;
BEGIN
  FOR i IN 1..20 LOOP
    INSERT INTO public.levels(level, ep_required)
    VALUES (i, 100 + (i-1)*20)
    ON CONFLICT (level) DO UPDATE SET ep_required = EXCLUDED.ep_required;
  END LOOP;
END $$;

-- Seed some collectibles
INSERT INTO public.collectibles(id, name, icon, rarity)
SELECT gen_random_uuid(), 'Bronze Badge', 'badge-bronze', 'common'
WHERE NOT EXISTS (SELECT 1 FROM public.collectibles WHERE name='Bronze Badge');

INSERT INTO public.collectibles(id, name, icon, rarity)
SELECT gen_random_uuid(), 'Silver Badge', 'badge-silver', 'rare'
WHERE NOT EXISTS (SELECT 1 FROM public.collectibles WHERE name='Silver Badge');

INSERT INTO public.collectibles(id, name, icon, rarity)
SELECT gen_random_uuid(), 'Gold Badge', 'badge-gold', 'epic'
WHERE NOT EXISTS (SELECT 1 FROM public.collectibles WHERE name='Gold Badge');

-- Mark all *Badge collectibles as badges
UPDATE public.collectibles SET is_badge = TRUE
WHERE is_badge = FALSE AND LOWER(name) LIKE '%badge%';

-- Dummy accessories (non-badge, purchasable via store)
INSERT INTO public.collectibles(id, name, icon, rarity, is_badge)
SELECT gen_random_uuid(), 'Warrior Emblem', 'warrior-emblem', 'rare', FALSE
WHERE NOT EXISTS (SELECT 1 FROM public.collectibles WHERE name='Warrior Emblem');

INSERT INTO public.collectibles(id, name, icon, rarity, is_badge)
SELECT gen_random_uuid(), 'Fitness T-Shirt', 'tshirt', 'common', FALSE
WHERE NOT EXISTS (SELECT 1 FROM public.collectibles WHERE name='Fitness T-Shirt');

INSERT INTO public.collectibles(id, name, icon, rarity, is_badge)
SELECT gen_random_uuid(), 'Training Sword', 'sword', 'rare', FALSE
WHERE NOT EXISTS (SELECT 1 FROM public.collectibles WHERE name='Training Sword');

INSERT INTO public.collectibles(id, name, icon, rarity, is_badge)
SELECT gen_random_uuid(), 'Motivation Poster', 'poster', 'common', FALSE
WHERE NOT EXISTS (SELECT 1 FROM public.collectibles WHERE name='Motivation Poster');

INSERT INTO public.collectibles(id, name, icon, rarity, is_badge)
SELECT gen_random_uuid(), 'Runner Cap', 'cap', 'common', FALSE
WHERE NOT EXISTS (SELECT 1 FROM public.collectibles WHERE name='Runner Cap');

-- Rewards at levels (diamonds and collectibles)
-- Diamonds at L2, L3, L5; Collectibles at L4 and L10
INSERT INTO public.rewards(id, kind, amount, unlock_level)
SELECT gen_random_uuid(), 'diamond', 25, 2
WHERE NOT EXISTS (SELECT 1 FROM public.rewards WHERE kind='diamond' AND unlock_level=2 AND amount=25);

INSERT INTO public.rewards(id, kind, amount, unlock_level)
SELECT gen_random_uuid(), 'diamond', 50, 3
WHERE NOT EXISTS (SELECT 1 FROM public.rewards WHERE kind='diamond' AND unlock_level=3 AND amount=50);

INSERT INTO public.rewards(id, kind, amount, unlock_level)
SELECT gen_random_uuid(), 'diamond', 100, 5
WHERE NOT EXISTS (SELECT 1 FROM public.rewards WHERE kind='diamond' AND unlock_level=5 AND amount=100);

-- Link a collectible to L4 (Bronze) and L10 (Gold)
DO $$
DECLARE c1 uuid; c2 uuid;
BEGIN
  SELECT id INTO c1 FROM public.collectibles WHERE name='Bronze Badge' LIMIT 1;
  IF c1 IS NOT NULL THEN
    INSERT INTO public.rewards(id, kind, collectible_id, unlock_level)
    SELECT gen_random_uuid(), 'collectible', c1, 4
    WHERE NOT EXISTS (
      SELECT 1 FROM public.rewards WHERE kind='collectible' AND collectible_id=c1 AND unlock_level=4
    );
  END IF;
  SELECT id INTO c2 FROM public.collectibles WHERE name='Gold Badge' LIMIT 1;
  IF c2 IS NOT NULL THEN
    INSERT INTO public.rewards(id, kind, collectible_id, unlock_level)
    SELECT gen_random_uuid(), 'collectible', c2, 10
    WHERE NOT EXISTS (
      SELECT 1 FROM public.rewards WHERE kind='collectible' AND collectible_id=c2 AND unlock_level=10
    );
  END IF;
END $$;

-- Seed a few system tasks (min levels)
-- Use user_id='system' for global templates
INSERT INTO public.tasks(id, user_id, title, description, ep_value, is_system, min_level)
SELECT gen_random_uuid(), 'system', 'Drink 2L Water', 'Hydrate well', 10, TRUE, 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.tasks WHERE user_id='system' AND title='Drink 2L Water'
);

INSERT INTO public.tasks(id, user_id, title, description, ep_value, is_system, min_level)
SELECT gen_random_uuid(), 'system', 'Sleep 7+ hours', 'Rest and recover', 15, TRUE, 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.tasks WHERE user_id='system' AND title='Sleep 7+ hours'
);

INSERT INTO public.tasks(id, user_id, title, description, ep_value, is_system, min_level)
SELECT gen_random_uuid(), 'system', '10k Steps', 'Walk and move', 15, TRUE, 2
WHERE NOT EXISTS (
  SELECT 1 FROM public.tasks WHERE user_id='system' AND title='10k Steps'
);

INSERT INTO public.task_schedules(task_id, frequency, byweekday)
SELECT t.id, 'daily', NULL
FROM public.tasks t
LEFT JOIN public.task_schedules s ON s.task_id=t.id
WHERE t.user_id='system' AND s.task_id IS NULL;

-- =============================
-- Seed updates for unlock rules
-- =============================

-- Mark existing rewards as level-based to keep current behavior
UPDATE public.rewards SET unlock_rule='level'
WHERE unlock_rule IS NULL;

-- Optional: If you want EP-based unlocks, uncomment and adapt below.
-- Example 1: make Bronze collectible unlock at total_ep >= 300
-- DO $$
-- DECLARE rid uuid;
-- BEGIN
--   SELECT id INTO rid FROM public.rewards r
--   JOIN public.collectibles c ON c.id=r.collectible_id AND c.name='Bronze Badge'
--   LIMIT 1;
--   IF rid IS NOT NULL THEN
--     UPDATE public.rewards SET unlock_rule='total_ep', unlock_ep=300 WHERE id=rid;
--   END IF;
-- END $$;

-- Example 2: derive unlock_ep from levels curve (cumulative EP up to unlock_level)
-- This keeps semantics equivalent to level-based, but expresses as EP threshold as well.
-- UPDATE public.rewards r
-- SET unlock_ep = v.cum_ep_from
-- FROM public.v_levels_cumulative v
-- WHERE r.unlock_rule='level' AND r.unlock_level=v.level;

-- =============================
-- Seed collectibles store entries
-- =============================
-- Ensure table exists in case schema file wasn't run first
CREATE TABLE IF NOT EXISTS public.collectibles_store (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collectible_id uuid NOT NULL UNIQUE REFERENCES public.collectibles(id) ON DELETE CASCADE,
  price INTEGER NOT NULL CHECK (price >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.collectibles_store(collectible_id, price)
SELECT c.id, COALESCE(
  CASE LOWER(c.rarity)
    WHEN 'epic' THEN 200
    WHEN 'rare' THEN 100
    ELSE 50
  END, 50)
FROM public.collectibles c
LEFT JOIN public.collectibles_store s ON s.collectible_id = c.id
WHERE s.collectible_id IS NULL;

-- Sample gating: require Bronze Badge for Silver/Gold purchases if present
DO $$
DECLARE bronze uuid;
BEGIN
  SELECT id INTO bronze FROM public.collectibles WHERE LOWER(name) = 'bronze badge' LIMIT 1;
  IF bronze IS NOT NULL THEN
    -- For any non-badge collectible without requirements, set min_level 1 by default
    INSERT INTO public.collectibles_requirements(collectible_id, min_level)
    SELECT c.id, 1
    FROM public.collectibles c
    LEFT JOIN public.collectibles_requirements r ON r.collectible_id = c.id
    WHERE r.collectible_id IS NULL AND COALESCE(c.is_badge, FALSE) = FALSE;
  END IF;
END $$;
