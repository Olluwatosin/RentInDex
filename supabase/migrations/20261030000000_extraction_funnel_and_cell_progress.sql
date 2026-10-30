-- Two additions, both in service of the same problem: the crowd half of the
-- index is not growing, and nothing in the system could say why.
--
-- RentBot has produced zero renter rows, ever — all 216 came from the survey
-- and the form. The extraction endpoint already guards carefully and returns a
-- precise reason on every rejection, but those reasons went only to the console,
-- and runtime logs are retained for one hour on this plan. So "zero rows" was
-- indistinguishable from "zero users", which is the same failure mode as the
-- scrape that died silently for seven weeks.

-- ── extraction_outcomes ──────────────────────────────────────────────────────
--
-- A daily tally of what happened to each extraction attempt, shaped like
-- llm_usage: one row per day per outcome, incremented in place.
--
-- Deliberately holds no transcript, no rent figure and no conversation id —
-- only the shape of the funnel. Someone's rent is their business; whether our
-- own guard rejected it is ours.
create table if not exists public.extraction_outcomes (
  day     date not null default current_date,
  outcome text not null,
  n       integer not null default 0,
  primary key (day, outcome)
);

alter table public.extraction_outcomes enable row level security;

-- Increment one outcome for today. Returns nothing and must never be able to
-- fail an extraction: the caller treats a failed tally as a non-event.
create or replace function public.extraction_record(p_outcome text)
 returns void
 language sql
as $function$
  insert into public.extraction_outcomes (day, outcome, n)
  values (current_date, p_outcome, 1)
  on conflict (day, outcome) do update set n = public.extraction_outcomes.n + 1;
$function$;

-- The funnel over a window, widest outcome first. Defaults to the last 30 days
-- because the question is never "what happened today" — it is "has this ever
-- worked".
create or replace function public.extraction_funnel(p_days integer default 30)
 returns table(outcome text, n bigint)
 language sql
 stable
as $function$
  select outcome, sum(n)::bigint as n
    from public.extraction_outcomes
   where day > current_date - p_days
   group by outcome
   order by sum(n) desc, outcome;
$function$;

-- ── cell_progress ────────────────────────────────────────────────────────────
--
-- How close is one area-and-type cell to having a real renter band?
--
-- rent_lookup answers with a band or with nothing: below p_min_n it reports the
-- wider fallback and the cell's own count is invisible. But that count is
-- exactly what makes an ask worth answering. "One more renter in Yaba and I can
-- give Yaba its own number" is a true, specific, finishable thing to tell
-- someone; "help us grow our data" is not.
--
-- This matters because of how thin the crowd half actually is: 202 usable rows
-- spread over 186 cells, about 1.1 each, so three cells in the country reach the
-- bar of 3. The fix is concentration rather than volume — one more row
-- everywhere leaves every cell short — and concentration needs this number.
--
-- Mirrors rent_lookup's area-level typed query exactly, so the count it reports
-- is the count that will actually produce a band.
create or replace function public.cell_progress(
  p_state text,
  p_area text,
  p_property_type text,
  p_min_n integer default 3
)
 returns jsonb
 language plpgsql
 stable
as $function$
declare
  pt text := norm_ptype(p_property_type);
  typed_n int := 0;
  area_n int := 0;
begin
  if p_state is null or p_area is null then
    return null;
  end if;

  -- Typed rows for this area: the cell that would produce an area-level band.
  select count(*) into typed_n
    from renter_data
   where state = p_state
     and not is_outlier
     and rent_estimate is not null
     and (pt = '' or norm_ptype(property_type) = pt)
     and area_matches('', area_raw, p_area);

  -- Every type in the area, for the weaker any-type band one rung down.
  select count(*) into area_n
    from renter_data
   where state = p_state
     and not is_outlier
     and rent_estimate is not null
     and area_matches('', area_raw, p_area);

  return jsonb_build_object(
    'state', p_state,
    'area', p_area,
    'property_type', p_property_type,
    'typed_n', typed_n,
    'area_n', area_n,
    'min_n', p_min_n,
    -- How many more typed rows before this cell can answer on its own.
    'needed', greatest(p_min_n - typed_n, 0),
    'has_band', typed_n >= p_min_n
  );
end;
$function$;
