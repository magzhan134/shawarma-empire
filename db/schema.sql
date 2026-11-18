-- Схема базы для Supabase. Выполни целиком в SQL Editor один раз.

create table if not exists users (
  id bigint primary key,                       -- Telegram ID
  name text not null default '',
  username text,
  lang text,
  city text,
  source text,                                 -- метка канала (ch_...) или ref
  referrer_id bigint,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  total_earned double precision not null default 0,
  income double precision not null default 0,
  stars_spent integer not null default 0,
  badge text,
  notify_at timestamptz,                       -- когда напомнить о полной кассе
  state jsonb not null
);
create index if not exists users_total_idx on users (total_earned desc);
create index if not exists users_city_total_idx on users (city, total_earned desc);
create index if not exists users_notify_idx on users (notify_at) where notify_at is not null;
create index if not exists users_created_idx on users (created_at);
create index if not exists users_seen_idx on users (last_seen);

create table if not exists purchases (
  charge_id text primary key,                  -- telegram_payment_charge_id, защищает от двойной выдачи
  user_id bigint not null,
  product text not null,
  stars integer not null,
  refunded boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists purchases_user_idx on purchases (user_id);

create table if not exists events (
  id bigint generated always as identity primary key,
  user_id bigint,
  type text not null,
  data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_type_idx on events (type, created_at);

create or replace view city_leaderboard as
  select city, sum(total_earned) as total, count(*) as players
  from users where city is not null group by city;

create or replace function admin_stats() returns json language sql stable as $$
  select json_build_object(
    'users', (select count(*) from users),
    'new_24h', (select count(*) from users where created_at > now() - interval '24 hours'),
    'dau', (select count(*) from users where last_seen > now() - interval '24 hours'),
    'd1_cohort', (select count(*) from users where created_at <= now() - interval '24 hours' and created_at > now() - interval '48 hours'),
    'd1_returned', (select count(*) from users where created_at <= now() - interval '24 hours' and created_at > now() - interval '48 hours' and last_seen >= created_at + interval '24 hours'),
    'd7_cohort', (select count(*) from users where created_at <= now() - interval '168 hours' and created_at > now() - interval '192 hours'),
    'd7_returned', (select count(*) from users where created_at <= now() - interval '168 hours' and created_at > now() - interval '192 hours' and last_seen >= created_at + interval '168 hours'),
    'payers', (select count(distinct user_id) from purchases where not refunded),
    'stars', (select coalesce(sum(stars), 0) from purchases where not refunded),
    'sources', (select coalesce(json_agg(s), '[]'::json) from (
      select coalesce(source, 'organic') as source, count(*) as users,
             count(*) filter (where stars_spent > 0) as payers, coalesce(sum(stars_spent), 0) as stars
      from users group by 1 order by 2 desc limit 20) s)
  );
$$;

-- Доступ только с сервера (service-ключ). Публичный anon-ключ ничего не видит.
alter table users enable row level security;
alter table purchases enable row level security;
alter table events enable row level security;
revoke all on city_leaderboard from anon, authenticated;
revoke execute on function admin_stats() from public, anon, authenticated;
grant execute on function admin_stats() to service_role;

-- В новых проектах Supabase таблицы, созданные через SQL, не выдаются серверной роли автоматически.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
