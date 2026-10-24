-- Baseline functions for RentInDex, reconstructed from the live project on
-- 2026-10-24. See 20260501000000_baseline_schema.sql for why these were not in
-- the repository before.
--
-- Bodies are reproduced exactly as they ran in production; only comments were
-- added. Order matters: the helpers come before the functions that call them.

-- ── helpers ──────────────────────────────────────────────────────────────────

-- Collapse a property type to a comparison key, so "2 Bedroom Flat",
-- "2-bedroom flat" and "2bedroomflat" all match.
CREATE OR REPLACE FUNCTION public.norm_ptype(s text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select regexp_replace(lower(coalesce(s, '')), '[^a-z0-9]', '', 'g')
$function$;

-- Does a listing's city/area pair refer to the area the renter named?
--
-- Deliberately generous, in a fixed order: exact match, then substring either
-- way, then trigram similarity at 0.5. Renters type "Lekki" for "Lekki Phase 1"
-- and "Wuse 2" for "Wuse II", and a strict match would answer "no data" to a
-- question we can actually answer. Passing '' as row_city restricts matching to
-- the area column alone, which is how rent_lookup separates a neighbourhood
-- band from a whole-city one.
CREATE OR REPLACE FUNCTION public.area_matches(row_city text, row_area text, user_area text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  with u as (select trim(regexp_replace(lower(coalesce(user_area,'')), '\s+district$', '')) as a),
       c as (select trim(regexp_replace(lower(coalesce(row_city,'')), '\s+district$', '')) as a),
       r as (select trim(regexp_replace(lower(coalesce(row_area,'')), '\s+district$', '')) as a)
  select (select a from u) <> '' and (
       (select a from c) = (select a from u)
    or (select a from r) = (select a from u)
    or ((select a from c) <> '' and ((select a from c) like '%'||(select a from u)||'%' or (select a from u) like '%'||(select a from c)||'%'))
    or ((select a from r) <> '' and ((select a from r) like '%'||(select a from u)||'%' or (select a from u) like '%'||(select a from r)||'%'))
    or ((select a from c) <> '' and similarity((select a from c), (select a from u)) >= 0.5)
    or ((select a from r) <> '' and similarity((select a from r), (select a from u)) >= 0.5)
  )
$function$;

-- Reduce what a renter told us to one comparable number.
--
-- An exact figure wins. Otherwise a band is read from its digits: a two-ended
-- band becomes its midpoint, and an open-ended one ("below 500,000", "above
-- 2m") is nudged 30% into the open side rather than taken at its boundary,
-- which would otherwise pull every open band toward the middle of the market.
CREATE OR REPLACE FUNCTION public.compute_rent_estimate(p_annual_rent numeric, p_rent_range text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  nums numeric[];
  lo numeric;
  hi numeric;
begin
  if p_annual_rent is not null and p_annual_rent > 0 then
    return p_annual_rent;
  end if;
  if p_rent_range is null then
    return null;
  end if;
  select array_agg(replace(x[1], ',', '')::numeric)
    into nums
    from regexp_matches(p_rent_range, '[0-9][0-9,]*', 'g') as x;
  if nums is null or array_length(nums, 1) = 0 then
    return null;
  end if;
  lo := nums[1];
  hi := nums[array_length(nums, 1)];
  if array_length(nums, 1) = 1 then
    if p_rent_range ~* 'below|under' then return round(lo * 0.7);
    elsif p_rent_range ~* 'above|over'  then return round(lo * 1.3);
    else return lo;
    end if;
  end if;
  return round((lo + hi) / 2);
end;
$function$;

-- Keeps renter_data.rent_estimate in step with whichever of annual_rent /
-- rent_range the submission carried. See trg_rent_estimate at the foot of this
-- file.
CREATE OR REPLACE FUNCTION public.set_rent_estimate()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.rent_estimate := compute_rent_estimate(new.annual_rent, new.rent_range);
  return new;
end;
$function$;

-- ── geography lookups ────────────────────────────────────────────────────────

-- The areas we hold enough of a sample for to offer as suggestions. Capped at
-- eight and at n >= 2 so we never suggest an area we cannot then talk about.
CREATE OR REPLACE FUNCTION public.areas_in_state(p_state text)
 RETURNS TABLE(area text, n bigint)
 LANGUAGE sql
 STABLE
AS $function$
  select area, sum(cnt)::bigint as n from (
    select coalesce(nullif(trim(area_raw), ''), city) as area, count(*) as cnt
      from listings_data
     where state = p_state and not is_outlier
       and coalesce(nullif(trim(area_raw), ''), city) is not null
     group by 1
    union all
    select coalesce(nullif(trim(area_raw), ''), city) as area, count(*) as cnt
      from renter_data
     where state = p_state and not is_outlier
       and coalesce(nullif(trim(area_raw), ''), city) is not null
     group by 1
  ) t
  group by area
  having sum(cnt) >= 2
  order by sum(cnt) desc
  limit 8;
$function$;

-- Every area name in a state, for fuzzy-matching what a renter typed. Wider
-- and flatter than areas_in_state: this one is for recognising input, not for
-- showing it.
CREATE OR REPLACE FUNCTION public.areas_for_matching(p_state text)
 RETURNS TABLE(area text)
 LANGUAGE sql
 STABLE
AS $function$
  select distinct area from (
    select coalesce(nullif(trim(area_raw), ''), city) as area
      from listings_data
     where state = p_state and not is_outlier
    union
    select coalesce(nullif(trim(area_raw), ''), city) as area
      from renter_data
     where state = p_state and not is_outlier
  ) t
  where area is not null and length(area) >= 3
  limit 500;
$function$;

-- Infer the state from an area name alone, for renters who say "Yaba" without
-- saying "Lagos". Whichever state holds the most matching rows wins.
CREATE OR REPLACE FUNCTION public.find_state_for_area(p_area text)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  with q as (select trim(regexp_replace(lower(coalesce(p_area,'')), '\s+district$', '')) as a)
  select state from (
    select state, count(*) as n from listings_data
      where (select a from q) <> '' and not is_outlier
        and ( lower(coalesce(area_raw,'')) like '%'||(select a from q)||'%'
           or lower(coalesce(city,''))     like '%'||(select a from q)||'%'
           or similarity(lower(coalesce(area_raw,'')), (select a from q)) >= 0.5
           or similarity(lower(coalesce(city,'')),     (select a from q)) >= 0.5 )
      group by state
    union all
    select state, count(*) as n from renter_data
      where (select a from q) <> '' and not is_outlier
        and ( lower(coalesce(area_raw,'')) like '%'||(select a from q)||'%'
           or lower(coalesce(city,''))     like '%'||(select a from q)||'%' )
      group by state
  ) t
  group by state order by sum(n) desc limit 1;
$function$;

-- ── the pricing engine ───────────────────────────────────────────────────────

-- Is this rent fair? The whole product in one function.
--
-- It builds two independent bands — asking (listings_data) and actual
-- (renter_data) — by walking the same ladder for each: area and type, then area
-- at any type, then city and type, then city at any type, then state. The first
-- rung with at least p_min_n rows wins, so we always answer from the finest
-- geography that has a real sample behind it.
--
-- Two rules keep the answer honest, and both are load-bearing:
--
--   * A band that had to drop the property-type filter is marked any_type, and
--     the caller must never present it as a price for the type asked about — it
--     mixes self-cons with duplexes.
--   * The reference band is chosen by geography first, then by source: actual
--     beats asking at the same level, because what people pay beats what
--     landlords ask. Losing the type filter costs a confidence grade.
--
-- Returns the verdict and both bands, so the caller can show its working
-- rather than asserting a number.
CREATE OR REPLACE FUNCTION public.rent_lookup(p_state text, p_area text DEFAULT NULL::text, p_property_type text DEFAULT NULL::text, p_annual_rent numeric DEFAULT NULL::numeric, p_min_n integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  pt text := norm_ptype(p_property_type);
  asking jsonb; actual jsonb;
  ask_level text; act_level text;
  ask_any boolean := false; act_any boolean := false;
  a_p25 numeric; a_p50 numeric; a_p75 numeric; a_n int;
  r_p25 numeric; r_p50 numeric; r_p75 numeric; r_n int;
  verdict text; ref_p25 numeric; ref_p75 numeric; ref_src text; confidence text;
begin
  -- ── ASKING (listings_data) ──
  if p_area is not null then
    select percentile_cont(0.25) within group (order by annual_rent),
           percentile_cont(0.50) within group (order by annual_rent),
           percentile_cont(0.75) within group (order by annual_rent), count(*)
      into a_p25, a_p50, a_p75, a_n
    from listings_data
    where state = p_state and not is_outlier
      and (pt = '' or norm_ptype(property_type) = pt)
      and area_matches('', area_raw, p_area);
    if a_n >= p_min_n then ask_level := 'area'; end if;

    if ask_level is null and pt <> '' then
      select percentile_cont(0.25) within group (order by annual_rent),
             percentile_cont(0.50) within group (order by annual_rent),
             percentile_cont(0.75) within group (order by annual_rent), count(*)
        into a_p25, a_p50, a_p75, a_n
      from listings_data
      where state = p_state and not is_outlier
        and area_matches('', area_raw, p_area);
      if a_n >= p_min_n then ask_level := 'area'; ask_any := true; end if;
    end if;

    if ask_level is null then
      select percentile_cont(0.25) within group (order by annual_rent),
             percentile_cont(0.50) within group (order by annual_rent),
             percentile_cont(0.75) within group (order by annual_rent), count(*)
        into a_p25, a_p50, a_p75, a_n
      from listings_data
      where state = p_state and not is_outlier
        and (pt = '' or norm_ptype(property_type) = pt)
        and area_matches(city, area_raw, p_area);
      if a_n >= p_min_n then ask_level := 'city'; end if;
    end if;
    if ask_level is null and pt <> '' then
      select percentile_cont(0.25) within group (order by annual_rent),
             percentile_cont(0.50) within group (order by annual_rent),
             percentile_cont(0.75) within group (order by annual_rent), count(*)
        into a_p25, a_p50, a_p75, a_n
      from listings_data
      where state = p_state and not is_outlier
        and area_matches(city, area_raw, p_area);
      if a_n >= p_min_n then ask_level := 'city'; ask_any := true; end if;
    end if;
  end if;

  if ask_level is null then
    select percentile_cont(0.25) within group (order by annual_rent),
           percentile_cont(0.50) within group (order by annual_rent),
           percentile_cont(0.75) within group (order by annual_rent), count(*)
      into a_p25, a_p50, a_p75, a_n
    from listings_data
    where state = p_state and not is_outlier
      and (pt = '' or norm_ptype(property_type) = pt);
    if a_n >= p_min_n then ask_level := 'state'; end if;
    if ask_level is null and pt <> '' then
      select percentile_cont(0.25) within group (order by annual_rent),
             percentile_cont(0.50) within group (order by annual_rent),
             percentile_cont(0.75) within group (order by annual_rent), count(*)
        into a_p25, a_p50, a_p75, a_n
      from listings_data
      where state = p_state and not is_outlier;
      if a_n >= p_min_n then ask_level := 'state'; ask_any := true; end if;
    end if;
  end if;

  -- ── ACTUAL (renter_data) ──
  if p_area is not null then
    select percentile_cont(0.25) within group (order by rent_estimate),
           percentile_cont(0.50) within group (order by rent_estimate),
           percentile_cont(0.75) within group (order by rent_estimate), count(*)
      into r_p25, r_p50, r_p75, r_n
    from renter_data
    where state = p_state and not is_outlier and rent_estimate is not null
      and (pt = '' or norm_ptype(property_type) = pt)
      and area_matches('', area_raw, p_area);
    if r_n >= p_min_n then act_level := 'area'; end if;

    if act_level is null and pt <> '' then
      select percentile_cont(0.25) within group (order by rent_estimate),
             percentile_cont(0.50) within group (order by rent_estimate),
             percentile_cont(0.75) within group (order by rent_estimate), count(*)
        into r_p25, r_p50, r_p75, r_n
      from renter_data
      where state = p_state and not is_outlier and rent_estimate is not null
        and area_matches('', area_raw, p_area);
      if r_n >= p_min_n then act_level := 'area'; act_any := true; end if;
    end if;

    if act_level is null then
      select percentile_cont(0.25) within group (order by rent_estimate),
             percentile_cont(0.50) within group (order by rent_estimate),
             percentile_cont(0.75) within group (order by rent_estimate), count(*)
        into r_p25, r_p50, r_p75, r_n
      from renter_data
      where state = p_state and not is_outlier and rent_estimate is not null
        and (pt = '' or norm_ptype(property_type) = pt)
        and area_matches(city, area_raw, p_area);
      if r_n >= p_min_n then act_level := 'city'; end if;
    end if;
    if act_level is null and pt <> '' then
      select percentile_cont(0.25) within group (order by rent_estimate),
             percentile_cont(0.50) within group (order by rent_estimate),
             percentile_cont(0.75) within group (order by rent_estimate), count(*)
        into r_p25, r_p50, r_p75, r_n
      from renter_data
      where state = p_state and not is_outlier and rent_estimate is not null
        and area_matches(city, area_raw, p_area);
      if r_n >= p_min_n then act_level := 'city'; act_any := true; end if;
    end if;
  end if;

  if act_level is null then
    select percentile_cont(0.25) within group (order by rent_estimate),
           percentile_cont(0.50) within group (order by rent_estimate),
           percentile_cont(0.75) within group (order by rent_estimate), count(*)
      into r_p25, r_p50, r_p75, r_n
    from renter_data
    where state = p_state and not is_outlier and rent_estimate is not null
      and (pt = '' or norm_ptype(property_type) = pt);
    if r_n >= p_min_n then act_level := 'state'; end if;
    if act_level is null and pt <> '' then
      select percentile_cont(0.25) within group (order by rent_estimate),
             percentile_cont(0.50) within group (order by rent_estimate),
             percentile_cont(0.75) within group (order by rent_estimate), count(*)
        into r_p25, r_p50, r_p75, r_n
      from renter_data
      where state = p_state and not is_outlier and rent_estimate is not null;
      if r_n >= p_min_n then act_level := 'state'; act_any := true; end if;
    end if;
  end if;

  asking := case when ask_level is not null then
    jsonb_build_object('level', ask_level, 'any_type', ask_any,
      'p25', round(a_p25), 'p50', round(a_p50), 'p75', round(a_p75), 'n', a_n)
    else null end;
  actual := case when act_level is not null then
    jsonb_build_object('level', act_level, 'any_type', act_any,
      'p25', round(r_p25), 'p50', round(r_p50), 'p75', round(r_p75), 'n', r_n)
    else null end;

  -- ── VERDICT ── finest geography wins; actual beats asking at the same level.
  -- A band that lost the type filter is a weaker reference than one that kept
  -- it, so it can no longer claim high confidence.
  if act_level = 'area' then
    ref_p25 := r_p25; ref_p75 := r_p75; ref_src := 'actual';
    confidence := case when act_any then 'medium' else 'high' end;
  elsif ask_level = 'area' then
    ref_p25 := a_p25; ref_p75 := a_p75; ref_src := 'asking';
    confidence := case when ask_any then 'low' else 'medium' end;
  elsif act_level = 'city' then
    ref_p25 := r_p25; ref_p75 := r_p75; ref_src := 'actual'; confidence := 'medium';
  elsif ask_level = 'city' then
    ref_p25 := a_p25; ref_p75 := a_p75; ref_src := 'asking'; confidence := 'low';
  elsif act_level = 'state' then
    ref_p25 := r_p25; ref_p75 := r_p75; ref_src := 'actual'; confidence := 'medium';
  elsif ask_level = 'state' then
    ref_p25 := a_p25; ref_p75 := a_p75; ref_src := 'asking'; confidence := 'low';
  end if;

  if p_annual_rent is null then verdict := 'no_rent';
  elsif ref_src is null then verdict := 'insufficient';
  elsif p_annual_rent < ref_p25 then verdict := 'below';
  elsif p_annual_rent <= ref_p75 then verdict := 'fair';
  else verdict := 'above';
  end if;

  return jsonb_build_object(
    'state', p_state, 'area', p_area, 'property_type', p_property_type,
    'user_rent', p_annual_rent,
    'asking', asking, 'actual', actual,
    'verdict', verdict, 'verdict_basis', ref_src, 'confidence', confidence
  );
end;
$function$;

-- ── chat transcripts ─────────────────────────────────────────────────────────

-- Append to a transcript and return it, capped at the last 40 messages so a
-- long conversation cannot grow the row without bound. Returns null when the
-- session id does not exist, which the caller treats as an expired session.
CREATE OR REPLACE FUNCTION public.chat_session_append(p_id uuid, p_new jsonb, p_turns integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  result jsonb;
begin
  update public.chat_sessions
     set messages = case
           when jsonb_array_length(messages || p_new) > 40
           then (
             select coalesce(jsonb_agg(m), '[]'::jsonb) from (
               select m from jsonb_array_elements(messages || p_new) with ordinality t(m, i)
               order by i offset greatest(jsonb_array_length(messages || p_new) - 40, 0)
             ) s
           )
           else messages || p_new
         end,
         turns = turns + p_turns,
         last_seen_at = now()
   where id = p_id
   returning jsonb_build_object('messages', messages, 'turns', turns) into result;

  return result; -- null when the id doesn't exist
end;
$function$;

-- Drop transcripts untouched for a day. Called by the daily cron: these hold
-- what renters typed, so they are kept no longer than the conversation needs.
CREATE OR REPLACE FUNCTION public.cleanup_chat_sessions()
 RETURNS integer
 LANGUAGE sql
AS $function$
  with gone as (
    delete from public.chat_sessions
    where last_seen_at < now() - interval '24 hours'
    returning 1
  )
  select count(*)::int from gone;
$function$;

-- ── spend and abuse limits ───────────────────────────────────────────────────

-- Claim one LLM call against today's budget, atomically. Returns false when the
-- day's limit is spent, and the caller then answers from the data alone rather
-- than failing. The `for update` is what makes two concurrent requests unable to
-- claim the same last call.
CREATE OR REPLACE FUNCTION public.llm_reserve(p_daily_limit integer)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
declare
  used int;
begin
  insert into public.llm_usage (day) values (current_date)
  on conflict (day) do nothing;

  select calls into used from public.llm_usage where day = current_date for update;

  if used >= p_daily_limit then
    update public.llm_usage
       set refused = refused + 1, updated_at = now()
     where day = current_date;
    return false;
  end if;

  update public.llm_usage
     set calls = calls + 1, updated_at = now()
   where day = current_date;
  return true;
end;
$function$;

-- Record what a call actually cost, after the fact. Reservation caps the number
-- of calls; this tracks the tokens behind them.
CREATE OR REPLACE FUNCTION public.llm_record_tokens(p_prompt bigint, p_completion bigint)
 RETURNS void
 LANGUAGE sql
AS $function$
  update public.llm_usage
     set prompt_tokens = prompt_tokens + greatest(p_prompt, 0),
         completion_tokens = completion_tokens + greatest(p_completion, 0),
         updated_at = now()
   where day = current_date;
$function$;

CREATE OR REPLACE FUNCTION public.llm_usage_today()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(
    (select to_jsonb(u) from public.llm_usage u where u.day = current_date),
    jsonb_build_object('day', current_date, 'calls', 0, 'refused', 0,
                       'prompt_tokens', 0, 'completion_tokens', 0)
  );
$function$;

-- Fixed-window rate limit. Returns true while the bucket is under its limit;
-- the window resets on the first hit that arrives after it has elapsed.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_bucket text, p_limit integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
declare
  cur_hits int;
begin
  insert into public.rate_limits (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
    set hits = case
          when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          then 1
          else public.rate_limits.hits + 1
        end,
        window_start = case
          when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          then now()
          else public.rate_limits.window_start
        end
  returning hits into cur_hits;

  return cur_hits <= p_limit;
end;
$function$;

-- ── triggers ─────────────────────────────────────────────────────────────────

drop trigger if exists trg_rent_estimate on public.renter_data;
create trigger trg_rent_estimate
  before insert or update on public.renter_data
  for each row execute function public.set_rent_estimate();
