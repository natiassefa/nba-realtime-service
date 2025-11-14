-- Migration: Fix play_by_play table to have one row per game_id
-- This changes from allowing multiple rows per game (with different hashes)
-- to enforcing exactly one row per game that gets updated

-- Step 1: Remove the old unique constraint on (game_id, hash)
-- PostgreSQL automatically names unique constraints, so we need to find and drop it
DO $$
DECLARE
    constraint_name text;
BEGIN
    -- Find the constraint name for UNIQUE(game_id, hash)
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'play_by_play'::regclass
      AND contype = 'u'
      AND array_length(conkey, 1) = 2
      AND EXISTS (
          SELECT 1 FROM pg_attribute
          WHERE attrelid = conrelid
            AND attnum = ANY(conkey)
            AND attname IN ('game_id', 'hash')
          GROUP BY attrelid
          HAVING COUNT(*) = 2
      );
    
    -- Drop the constraint if it exists
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE play_by_play DROP CONSTRAINT IF EXISTS %I', constraint_name);
    END IF;
END $$;

-- Step 2: For any games with multiple rows, keep only the most recent one
-- Delete older rows, keeping the one with the latest fetched_at
DELETE FROM play_by_play p1
WHERE EXISTS (
  SELECT 1 FROM play_by_play p2
  WHERE p2.game_id = p1.game_id
    AND p2.fetched_at > p1.fetched_at
);

-- Step 3: Add new unique constraint on game_id only
ALTER TABLE play_by_play ADD CONSTRAINT play_by_play_game_id_unique UNIQUE (game_id);

-- Step 4: Add index on game_id if it doesn't already exist (for performance)
-- Note: The unique constraint automatically creates an index, but we'll keep this
-- for clarity and in case the index was created separately before
CREATE INDEX IF NOT EXISTS idx_play_by_play_game_id ON play_by_play(game_id);

