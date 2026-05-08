-- Kingdom Challenge weekly puzzle
CREATE TABLE IF NOT EXISTS challenges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number  INTEGER NOT NULL UNIQUE,
  year         INTEGER NOT NULL,
  question     TEXT NOT NULL,
  choices      JSONB NOT NULL,   -- [{text, is_correct}] — shuffled on client
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL -- created_at + 72h (Thursday 00:00)
);

CREATE TABLE IF NOT EXISTS challenge_completions (
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  challenge_id UUID REFERENCES challenges(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, challenge_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_completions_user ON challenge_completions(user_id);

-- Store push subscription endpoint for Web Push notifications
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);
