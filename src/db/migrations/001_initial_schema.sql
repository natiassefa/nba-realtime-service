-- Games table: stores game metadata and basic information
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL,
    home_team_id VARCHAR(100),
    home_team_name VARCHAR(200),
    home_team_alias VARCHAR(10),
    away_team_id VARCHAR(100),
    away_team_name VARCHAR(200),
    away_team_alias VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Schedules table: stores daily schedule data
CREATE TABLE IF NOT EXISTS schedules (
    date DATE PRIMARY KEY,
    schedule_data JSONB NOT NULL,
    game_ids UUID[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game summaries table: stores game summary data with versioning
CREATE TABLE IF NOT EXISTS game_summaries (
    id BIGSERIAL PRIMARY KEY,
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    summary_data JSONB NOT NULL,
    hash VARCHAR(64) NOT NULL, -- SHA256 hash for deduplication
    fetched_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(game_id, hash) -- Prevent duplicate inserts with same hash
);

-- Play-by-play table: stores play-by-play events with versioning
CREATE TABLE IF NOT EXISTS play_by_play (
    id BIGSERIAL PRIMARY KEY,
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    pbp_data JSONB NOT NULL,
    hash VARCHAR(64) NOT NULL, -- SHA256 hash for deduplication
    fetched_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(game_id, hash) -- Prevent duplicate inserts with same hash
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_games_scheduled_at ON games(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_home_team ON games(home_team_id);
CREATE INDEX IF NOT EXISTS idx_games_away_team ON games(away_team_id);
CREATE INDEX IF NOT EXISTS idx_game_summaries_game_id ON game_summaries(game_id);
CREATE INDEX IF NOT EXISTS idx_game_summaries_fetched_at ON game_summaries(fetched_at);
CREATE INDEX IF NOT EXISTS idx_play_by_play_game_id ON play_by_play(game_id);
CREATE INDEX IF NOT EXISTS idx_play_by_play_fetched_at ON play_by_play(fetched_at);
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop triggers if they exist (for idempotent migrations)
DROP TRIGGER IF EXISTS update_games_updated_at ON games;
DROP TRIGGER IF EXISTS update_schedules_updated_at ON schedules;

-- Triggers to auto-update updated_at
CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

