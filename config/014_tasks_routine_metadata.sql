-- Phase 2A (revised): Treat tasks as routines by adding minimal metadata
-- Adds time_anchor and order_hint to public.tasks. No new tables.
-- time_anchor: morning | midday | evening | night | anytime

-- Add columns if missing
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS time_anchor text CHECK (time_anchor IN ('morning','midday','evening','night','anytime')),
  ADD COLUMN IF NOT EXISTS order_hint integer;

-- Default time_anchor to 'anytime' where null (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'time_anchor'
  ) THEN
    EXECUTE 'UPDATE public.tasks SET time_anchor = COALESCE(time_anchor, ''anytime'')';
  END IF;
END $$;

-- Helpful indexes for grouping/sorting within a day
CREATE INDEX IF NOT EXISTS tasks_time_anchor_idx ON public.tasks(time_anchor);
CREATE INDEX IF NOT EXISTS tasks_order_hint_idx ON public.tasks(order_hint);
