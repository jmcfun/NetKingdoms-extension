-- Phase 3 schema

-- Track which season a user locked their faction in (enables unlock on new season)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS faction_locked_season INTEGER;

-- Season-end rewards (badges, cosmetics)
CREATE TABLE IF NOT EXISTS rewards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  season_id    UUID REFERENCES seasons(id),
  type         TEXT NOT NULL, -- 'top_faction', 'top_clan', 'top_pct', 'participation', 'explorer'
  label        TEXT NOT NULL,
  icon         TEXT NOT NULL DEFAULT '🏅',
  earned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rewards_user ON rewards(user_id);

-- Persist season archive info on seasons table
ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS winner_faction    TEXT,
  ADD COLUMN IF NOT EXISTS total_territories INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_snapshots   INTEGER DEFAULT 0;

-- Anti-cheat: improve audit_flags with automated severity levels
ALTER TABLE audit_flags
  ADD COLUMN IF NOT EXISTS auto_detected BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS resolved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes         TEXT;

-- Track shadow-throttled users (visits count 0 silently)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS shadow_throttle    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trust_level        SMALLINT NOT NULL DEFAULT 0;
  -- 0 = new (<7d), 1 = trusted (7-30d), 2 = established (>30d)

-- Function to compute user trust level (called by detect-anomalies)
CREATE OR REPLACE FUNCTION compute_trust_level(p_created_at TIMESTAMPTZ)
RETURNS SMALLINT LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE
    WHEN p_created_at > NOW() - INTERVAL '7 days'  THEN 0
    WHEN p_created_at > NOW() - INTERVAL '30 days' THEN 1
    ELSE 2
  END
$$;

-- Keep browse_events for only 30 days (GDD privacy requirement)
-- This is handled by cleanup-territories CRON; add a dedicated browse_events cleanup
CREATE OR REPLACE FUNCTION purge_old_browse_events()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted INTEGER;
BEGIN
  DELETE FROM browse_events WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;
