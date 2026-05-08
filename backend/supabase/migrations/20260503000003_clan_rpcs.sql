-- Atomic clan score increment (avoids read-modify-write race)
CREATE OR REPLACE FUNCTION increment_clan_score(p_user_id UUID, p_amount INT DEFAULT 1)
RETURNS VOID LANGUAGE SQL SECURITY DEFINER AS $$
  UPDATE clans
  SET season_score = season_score + p_amount
  WHERE id = (SELECT clan_id FROM users WHERE id = p_user_id AND clan_id IS NOT NULL);
$$;

-- Create clan + set leader's clan_id in one transaction
CREATE OR REPLACE FUNCTION create_clan(p_name TEXT, p_faction TEXT, p_leader_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO clans (name, faction, leader_id)
  VALUES (p_name, p_faction, p_leader_id)
  RETURNING id INTO v_id;

  UPDATE users SET clan_id = v_id WHERE id = p_leader_id;
  RETURN v_id;
END;
$$;

-- Join a clan (validates faction + capacity)
CREATE OR REPLACE FUNCTION join_clan(p_clan_id UUID, p_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clan      clans%ROWTYPE;
  v_user_faction TEXT;
  v_member_count INT;
BEGIN
  SELECT * INTO v_clan FROM clans WHERE id = p_clan_id;
  IF NOT FOUND THEN RETURN 'Clan introuvable'; END IF;

  SELECT faction INTO v_user_faction FROM users WHERE id = p_user_id;
  IF v_user_faction != v_clan.faction THEN
    RETURN 'Faction incompatible';
  END IF;

  SELECT COUNT(*) INTO v_member_count FROM users WHERE clan_id = p_clan_id;
  IF v_member_count >= v_clan.max_members THEN
    RETURN 'Clan complet';
  END IF;

  UPDATE users SET clan_id = p_clan_id WHERE id = p_user_id;
  RETURN 'ok';
END;
$$;

-- Leave clan (transfers leadership if leader)
CREATE OR REPLACE FUNCTION leave_clan(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clan_id UUID;
  v_is_leader BOOL;
  v_next_leader UUID;
BEGIN
  SELECT clan_id INTO v_clan_id FROM users WHERE id = p_user_id;
  IF v_clan_id IS NULL THEN RETURN; END IF;

  SELECT (leader_id = p_user_id) INTO v_is_leader FROM clans WHERE id = v_clan_id;

  UPDATE users SET clan_id = NULL WHERE id = p_user_id;

  IF v_is_leader THEN
    -- Transfer to most active remaining member
    SELECT id INTO v_next_leader
    FROM users WHERE clan_id = v_clan_id AND id != p_user_id
    ORDER BY last_active_at DESC NULLS LAST LIMIT 1;

    IF v_next_leader IS NOT NULL THEN
      UPDATE clans SET leader_id = v_next_leader WHERE id = v_clan_id;
    ELSE
      -- No members left: dissolve clan
      UPDATE users SET clan_id = NULL WHERE clan_id = v_clan_id;
      DELETE FROM clans WHERE id = v_clan_id;
    END IF;
  END IF;
END;
$$;
