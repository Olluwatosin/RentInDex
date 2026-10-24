-- Baseline schema for RentInDex, reconstructed from the live project on
-- 2026-10-24. Until now the schema and every function existed only inside the
-- Supabase project: no history, no review, and no way back if that project were
-- lost or a function were edited by hand in the dashboard.
--
-- This file and 20260501000001_baseline_functions.sql together rebuild the whole
-- database from nothing. They describe the state production was already in, so
-- applying them to production changes nothing; they are written for a fresh
-- database — a local stack, a Supabase branch, or a recovery.
--
-- From here on, a schema change is a new migration file, not a dashboard edit.

-- ── extensions ───────────────────────────────────────────────────────────────
-- pg_trgm lives in public because the trigram indexes and similarity() calls in
-- area matching reference it unqualified.
create extension if not exists pg_trgm with schema public;
create extension if not exists pgcrypto with schema extensions;

-- ── areas ────────────────────────────────────────────────────────────────────
-- A canonical neighbourhood list. Written for, but not yet used by, the
-- matching engine: every area_id below is still null and rent_lookup matches on
-- the raw text columns instead. Kept because the normalisation work it exists
-- for is still wanted.
create table if not exists public.areas (
  id         uuid        primary key default gen_random_uuid(),
  state      text        not null,
  city       text,
  name       text        not null,
  aliases    text[]      not null default '{}',
  created_at timestamptz not null default now(),
  unique (state, name)
);

-- ── listings_data ────────────────────────────────────────────────────────────
-- The asking-price half of the index: what landlords and agents advertise.
-- Never conflated with what renters actually pay (renter_data) — the gap
-- between the two is the product.
create table if not exists public.listings_data (
  id            uuid        primary key default gen_random_uuid(),
  scraped_at    timestamptz not null default now(),
  source_site   text        not null
                check (source_site in ('nigeriapropertycentre', 'propertypro', 'jiji')),
  listing_url   text        not null,
  state         text        not null,
  city          text,
  area_raw      text,
  area_id       uuid        references public.areas (id),
  property_type text,
  annual_rent   numeric     not null,
  listed_date   date,
  -- Set by the scrapers, not by a trigger: a listing excluded from every band.
  is_outlier    boolean     not null default false,
  -- Re-scraping the same listing updates it rather than double-counting it.
  unique (source_site, listing_url)
);

create index if not exists listings_data_state_idx on public.listings_data (state);
create index if not exists listings_data_area_idx  on public.listings_data (area_id);
-- area_matches() does both LIKE and similarity() on the lowered text, so the
-- trigram indexes must be on exactly that expression to be used.
create index if not exists listing_area_trgm on public.listings_data using gin (lower(area_raw) gin_trgm_ops);
create index if not exists listing_city_trgm on public.listings_data using gin (lower(city)     gin_trgm_ops);

-- ── renter_data ──────────────────────────────────────────────────────────────
-- The crowd half: what renters report actually paying, from the form and from
-- RentBot. Thinner than listings_data and worth more.
create table if not exists public.renter_data (
  id                  uuid        primary key default gen_random_uuid(),
  submitted_at        timestamptz not null default now(),
  source              text        not null check (source in ('form', 'chatbot', 'survey')),

  state               text        not null,
  city                text,
  area_raw            text,
  area_id             uuid        references public.areas (id),
  property_type       text,

  -- Renters answer in bands far more often than in exact figures, so both are
  -- kept and rent_estimate below reconciles them.
  rent_range          text,
  total_cost_range    text,
  annual_rent         numeric,

  agency_fee          numeric,
  caution_deposit     numeric,
  service_charge      numeric,
  finder_fee          numeric,

  confidence          text,
  email               text,
  is_outlier          boolean     not null default false,
  reviewed            boolean     not null default false,

  furnished           text,
  property_condition  text,
  lease_period        text,

  -- The raw strings behind the numeric fee columns, kept so a bad parse can be
  -- re-read later rather than silently lost.
  agency_fee_raw      text,
  caution_deposit_raw text,
  service_charge_raw  text,
  finder_fee_raw      text,

  total_move_in_cost  numeric,
  utilities           text,
  found_via           text,
  value_rating        smallint    check (value_rating >= 1 and value_rating <= 5),
  recommend_area      text,
  comments            text,
  landlord_interest   text,

  -- Maintained by trg_rent_estimate; never written by the application.
  rent_estimate       numeric,

  power_hours         numeric,
  power_band          text,
  power_metering      text,

  -- One row per RentBot conversation: repeated extraction of a growing chat
  -- upserts onto this instead of inserting duplicates.
  conversation_id     text,

  -- Named explicitly to match production. PostgREST resolves ?on_conflict= by
  -- column rather than by constraint name, so the upsert would survive a
  -- rename — but a baseline that does not reproduce the real names is not a
  -- baseline.
  constraint renter_conversation_uniq unique (conversation_id),

  constraint power_hours_range
    check (power_hours is null or (power_hours >= 0 and power_hours <= 24))
);

create index if not exists renter_data_state_idx on public.renter_data (state);
create index if not exists renter_data_area_idx  on public.renter_data (area_id);
create index if not exists renter_area_trgm on public.renter_data using gin (lower(area_raw) gin_trgm_ops);
create index if not exists renter_city_trgm on public.renter_data using gin (lower(city)     gin_trgm_ops);

-- ── waitlist ─────────────────────────────────────────────────────────────────
-- Signups land here first and are pushed to the email provider afterwards, so a
-- provider outage costs us the sync and not the signup.
create table if not exists public.waitlist (
  id                 uuid        primary key default gen_random_uuid(),
  email              text        not null unique,
  created_at         timestamptz not null default now(),
  source             text        not null default 'site',
  provider_synced    boolean     not null default false,
  provider           text,
  provider_synced_at timestamptz
);

create index if not exists waitlist_created_at_idx on public.waitlist (created_at desc);
-- Partial: the backfill only ever asks for the ones still unsynced.
create index if not exists waitlist_unsynced_idx on public.waitlist (provider_synced)
  where provider_synced = false;

-- ── chat_sessions ────────────────────────────────────────────────────────────
-- RentBot transcripts live server-side so a client cannot forge the history
-- that feeds the dataset. Expired daily by cleanup_chat_sessions().
create table if not exists public.chat_sessions (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  turns        integer     not null default 0,
  messages     jsonb       not null default '[]'::jsonb
);

create index if not exists chat_sessions_last_seen_idx on public.chat_sessions (last_seen_at);

-- ── scrape_runs ──────────────────────────────────────────────────────────────
-- One row per scraper invocation. This table is the only reason the seven
-- straight weeks of failed scheduled scrapes were recoverable after the fact.
create table if not exists public.scrape_runs (
  id           uuid        primary key default gen_random_uuid(),
  source       text        not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,
  parsed       integer,
  sent         integer,
  error        text,
  triggered_by text        not null default 'manual'
);

create index if not exists scrape_runs_source_started_idx
  on public.scrape_runs (source, started_at desc);

-- ── llm_usage ────────────────────────────────────────────────────────────────
-- One row per day, the budget ledger behind llm_reserve().
create table if not exists public.llm_usage (
  day               date        primary key default current_date,
  calls             integer     not null default 0,
  refused           integer     not null default 0,
  prompt_tokens     bigint      not null default 0,
  completion_tokens bigint      not null default 0,
  updated_at        timestamptz not null default now()
);

-- ── rate_limits ──────────────────────────────────────────────────────────────
-- Fixed-window counters, one row per bucket. Postgres rather than memory
-- because serverless instances do not share state.
create table if not exists public.rate_limits (
  bucket       text        primary key,
  window_start timestamptz not null default now(),
  hits         integer     not null default 0
);

-- ── row level security ───────────────────────────────────────────────────────
-- Enabled with NO policies anywhere, deliberately. Every table holds either
-- renters' submissions or our own index, and nothing should be readable by the
-- anon or authenticated keys. All access goes through the server using the
-- service role key, which bypasses RLS.
--
-- So: no policy here is the security model, not an oversight. Adding one opens
-- a table to the public internet — do it only on purpose.
alter table public.areas         enable row level security;
alter table public.listings_data enable row level security;
alter table public.renter_data   enable row level security;
alter table public.waitlist      enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.scrape_runs   enable row level security;
alter table public.llm_usage     enable row level security;
alter table public.rate_limits   enable row level security;
