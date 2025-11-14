-- Add nba_game_id column to games table for reverse lookup
-- This stores the original numeric NBA.com game ID (e.g., "0022300123")
-- which is needed to call nba_api library when we only have the UUID

ALTER TABLE games ADD COLUMN IF NOT EXISTS nba_game_id VARCHAR(20);

-- Create index for fast lookups by NBA game ID
CREATE INDEX IF NOT EXISTS idx_games_nba_game_id ON games(nba_game_id);

-- Add comment explaining the column
COMMENT ON COLUMN games.nba_game_id IS 'Original numeric NBA.com game ID (e.g., "0022300123") used for reverse lookup from UUID';

