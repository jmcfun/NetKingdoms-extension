-- Phase 2 schema migration

-- ── browse_events: add faction (critical for domination query) ─────────────
ALTER TABLE browse_events
  ADD COLUMN IF NOT EXISTS faction TEXT NOT NULL DEFAULT 'Fondeurs';

-- ── territories: add domination + lifecycle columns ───────────────────────
ALTER TABLE territories
  ADD COLUMN IF NOT EXISTS dominant_faction    TEXT,
  ADD COLUMN IF NOT EXISTS is_contested        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_ephemeral        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS value_snapshot      SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_visit_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_dominant_update TIMESTAMPTZ;

-- Backfill last_visit_at from discovered_at for existing rows
UPDATE territories SET last_visit_at = discovered_at WHERE last_visit_at IS NULL;

-- ── users: add season score + activity tracking ───────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username       TEXT,
  ADD COLUMN IF NOT EXISTS season_score   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- ── clans ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL UNIQUE,
  faction          TEXT NOT NULL,
  leader_id        UUID REFERENCES users(id) NOT NULL,
  max_members      INTEGER NOT NULL DEFAULT 5,
  paid_tiers       INTEGER NOT NULL DEFAULT 0,
  stripe_payment_ids TEXT[] NOT NULL DEFAULT '{}',
  season_score     INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS clan_id UUID REFERENCES clans(id);

-- ── seasons ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seasons (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number           INTEGER NOT NULL,
  started_at       TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  fondeurs_score   INTEGER NOT NULL DEFAULT 0,
  spectres_score   INTEGER NOT NULL DEFAULT 0,
  nomades_score    INTEGER NOT NULL DEFAULT 0
);

-- Insert Season 1 (starts now, active)
INSERT INTO seasons (number, started_at, is_active)
VALUES (1, NOW(), TRUE)
ON CONFLICT DO NOTHING;

-- ── season_snapshots ──────────────────────────────────────────────────────
DROP TABLE IF EXISTS snapshots;

CREATE TABLE IF NOT EXISTS season_snapshots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id        UUID NOT NULL REFERENCES seasons(id),
  domain           TEXT NOT NULL REFERENCES territories(domain) ON DELETE CASCADE,
  dominant_faction TEXT NOT NULL,
  points_awarded   INTEGER NOT NULL,
  is_contested     BOOLEAN NOT NULL DEFAULT FALSE,
  is_ephemeral     BOOLEAN NOT NULL DEFAULT FALSE,
  snapshotted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── indexes for domination query performance ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_browse_events_domain_faction_time
  ON browse_events (domain, faction, created_at DESC)
  WHERE flagged = FALSE;

CREATE INDEX IF NOT EXISTS idx_browse_events_user_domain_time
  ON browse_events (user_id, domain, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_territories_dominant
  ON territories (dominant_faction)
  WHERE dominant_faction IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_territories_ephemeral
  ON territories (is_ephemeral)
  WHERE is_ephemeral = TRUE;
