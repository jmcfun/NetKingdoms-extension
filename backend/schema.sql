-- NetKingdoms Supabase schema

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  faction text not null,
  created_at timestamptz default now()
);

create table if not exists browse_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  domain text not null,
  url text not null,
  tier text not null,
  zone text not null,
  created_at timestamptz default now(),
  flagged boolean default false
);

create table if not exists territories (
  domain text primary key,
  tier text not null,
  zone text not null,
  first_seen_by uuid references users(id),
  first_seen_faction text,
  discovered_at timestamptz default now()
);

create table if not exists snapshots (
  id uuid primary key default gen_random_uuid(),
  domain text references territories(domain),
  faction text not null,
  points int not null,
  snapshot_at timestamptz not null
);

create table if not exists ephemeral_sites (
  domain text primary key,
  tier text not null,
  zone text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  multiplier int default 5
);

create table if not exists audit_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  reason text not null,
  severity text not null,
  created_at timestamptz default now()
);
