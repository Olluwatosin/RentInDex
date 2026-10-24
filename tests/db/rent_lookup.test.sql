-- Golden tests for the pricing engine.
--
-- rent_lookup() decides whether a renter is being overcharged, and it lives in
-- the database rather than in TypeScript, so it needs its own tests. These pin
-- the behaviour the application depends on: which rung of the geography ladder
-- a band comes from, when the property-type filter is dropped, which source
-- wins, and what each of those costs in confidence.
--
-- Safe by construction: every fixture sits under a state name no real row uses,
-- and the whole file runs in a transaction that ends in ROLLBACK. It touches no
-- existing data and leaves nothing behind.
--
-- Run with:  npm run test:db

\set ON_ERROR_STOP on

begin;

create temp table assertions (label text, ok boolean, detail text);

create function pg_temp.expect(p_label text, p_got text, p_want text) returns void
language plpgsql as $$
begin
  insert into assertions
  values (p_label, p_got is not distinct from p_want, format('got %L, wanted %L', p_got, p_want));
end $$;

-- Each assertion is a SELECT, and 47 one-column result tables are noise. The
-- report at the foot of the file speaks through RAISE, which is unaffected.
\o /dev/null

-- ── fixtures ─────────────────────────────────────────────────────────────────

-- Testville: a well-sampled 2-bedroom market. p25 1,150,000 / p50 1,300,000 /
-- p75 1,450,000. One 3-bedroom listing, deliberately too thin to stand alone.
insert into listings_data (source_site, listing_url, state, city, area_raw, property_type, annual_rent) values
  ('jiji', 'test/1', 'ZZ Test State', 'Testville', 'Testville', '2 Bedroom Flat', 1000000),
  ('jiji', 'test/2', 'ZZ Test State', 'Testville', 'Testville', '2 Bedroom Flat', 1200000),
  ('jiji', 'test/3', 'ZZ Test State', 'Testville', 'Testville', '2 Bedroom Flat', 1400000),
  ('jiji', 'test/4', 'ZZ Test State', 'Testville', 'Testville', '2 Bedroom Flat', 1600000),
  ('jiji', 'test/5', 'ZZ Test State', 'Testville', 'Testville', '3 Bedroom Flat', 9000000),
  -- An outlier that would wreck every percentile if it were counted.
  ('jiji', 'test/6', 'ZZ Test State', 'Testville', 'Testville', '2 Bedroom Flat', 999000000);
update listings_data set is_outlier = true where listing_url = 'test/6';

-- Metroville: listings whose area column names a suburb, so a renter who types
-- the city can only be answered at city level.
insert into listings_data (source_site, listing_url, state, city, area_raw, property_type, annual_rent) values
  ('jiji', 'test/7', 'ZZ Test State', 'Metroville', 'Suburb Alpha', '2 Bedroom Flat', 600000),
  ('jiji', 'test/8', 'ZZ Test State', 'Metroville', 'Suburb Beta',  '2 Bedroom Flat', 800000),
  ('jiji', 'test/9', 'ZZ Test State', 'Metroville', 'Suburb Gamma', '2 Bedroom Flat', 1000000);

-- ── the ladder: area and type, the best case ─────────────────────────────────

select pg_temp.expect('area+type: level',
  rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', 1300000, 3) #>> '{asking,level}', 'area');
select pg_temp.expect('area+type: keeps the type filter',
  rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', 1300000, 3) #>> '{asking,any_type}', 'false');
select pg_temp.expect('area+type: sample size excludes the outlier',
  rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', 1300000, 3) #>> '{asking,n}', '4');
select pg_temp.expect('area+type: median unmoved by the outlier',
  rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', 1300000, 3) #>> '{asking,p50}', '1300000');
select pg_temp.expect('area+type: quartiles',
  concat_ws('/',
    rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', 1300000, 3) #>> '{asking,p25}',
    rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', 1300000, 3) #>> '{asking,p75}'),
  '1150000/1450000');

-- Property type is matched on its normalised form, so the shape the renter
-- types does not decide whether we can answer.
select pg_temp.expect('property type is normalised before matching',
  rent_lookup('ZZ Test State', 'Testville', '2-BEDROOM   flat!', 1300000, 3) #>> '{asking,n}', '4');

-- ── the verdict boundaries ───────────────────────────────────────────────────

select pg_temp.expect('below p25 is below',
  rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', 1000000, 3) ->> 'verdict', 'below');
select pg_temp.expect('exactly p25 is fair',
  rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', 1150000, 3) ->> 'verdict', 'fair');
select pg_temp.expect('exactly p75 is fair',
  rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', 1450000, 3) ->> 'verdict', 'fair');
select pg_temp.expect('above p75 is above',
  rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', 1450001, 3) ->> 'verdict', 'above');

-- ── no rent, and no data ─────────────────────────────────────────────────────

select pg_temp.expect('no rent given yields no_rent, and still returns the band',
  rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', null, 3) ->> 'verdict', 'no_rent');
select pg_temp.expect('no rent given still carries the band',
  rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', null, 3) #>> '{asking,n}', '4');
select pg_temp.expect('a state we hold nothing for is insufficient, not a guess',
  rent_lookup('ZZ Nowhere', 'Nowhereville', '2 bedroom flat', 500000, 3) ->> 'verdict', 'insufficient');
select pg_temp.expect('insufficient carries no band to misread',
  rent_lookup('ZZ Nowhere', 'Nowhereville', '2 bedroom flat', 500000, 3) ->> 'asking', null);
select pg_temp.expect('insufficient has no verdict basis',
  rent_lookup('ZZ Nowhere', 'Nowhereville', '2 bedroom flat', 500000, 3) ->> 'verdict_basis', null);

-- ── dropping the type filter ─────────────────────────────────────────────────
--
-- One 3-bedroom listing is not a market. The engine widens to every type in
-- the area and must flag that it did: the band now mixes 2- and 3-bedrooms, so
-- presenting it as a 3-bedroom price would be a lie.

select pg_temp.expect('thin typed sample widens to any type',
  rent_lookup('ZZ Test State', 'Testville', '3 bedroom flat', 5000000, 3) #>> '{asking,any_type}', 'true');
select pg_temp.expect('a widened band says so in its level too',
  rent_lookup('ZZ Test State', 'Testville', '3 bedroom flat', 5000000, 3) #>> '{asking,level}', 'area');
select pg_temp.expect('widening costs a confidence grade',
  rent_lookup('ZZ Test State', 'Testville', '3 bedroom flat', 5000000, 3) ->> 'confidence', 'low');
select pg_temp.expect('a widened band is drawn from every type in the area',
  rent_lookup('ZZ Test State', 'Testville', '3 bedroom flat', 5000000, 3) #>> '{asking,n}', '5');

-- A higher sample-size bar widens the band that was fine at min_n = 3.
select pg_temp.expect('p_min_n is respected',
  rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', 1300000, 5) #>> '{asking,any_type}', 'true');

-- ── city level ───────────────────────────────────────────────────────────────

select pg_temp.expect('a city-wide band is labelled city, never area',
  rent_lookup('ZZ Test State', 'Metroville', '2 bedroom flat', 800000, 3) #>> '{asking,level}', 'city');
select pg_temp.expect('a city band is only ever low confidence from asking prices',
  rent_lookup('ZZ Test State', 'Metroville', '2 bedroom flat', 800000, 3) ->> 'confidence', 'low');

-- ── what renters pay beats what landlords ask ────────────────────────────────

insert into renter_data (source, state, city, area_raw, property_type, annual_rent) values
  ('form', 'ZZ Test State', 'Testville', 'Testville', '2 Bedroom Flat', 700000),
  ('form', 'ZZ Test State', 'Testville', 'Testville', '2 Bedroom Flat', 800000),
  ('form', 'ZZ Test State', 'Testville', 'Testville', '2 Bedroom Flat', 900000);

select pg_temp.expect('actual beats asking at the same geography',
  rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', 1300000, 3) ->> 'verdict_basis', 'actual');
select pg_temp.expect('the verdict follows the actual band, not the asking one',
  -- 1,300,000 is fair against asking prices and well above what people here
  -- actually pay. The renter needs the second answer.
  rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', 1300000, 3) ->> 'verdict', 'above');
select pg_temp.expect('a typed area-level actual band is the only high confidence there is',
  rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', 1300000, 3) ->> 'confidence', 'high');
select pg_temp.expect('both bands are returned so the answer can show its working',
  (rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', 1300000, 3) ->> 'asking' is not null and
   rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', 1300000, 3) ->> 'actual' is not null)::text,
  'true');

-- Finer geography still wins over a better source: an asking band for the area
-- beats an actual band for the whole city.
--
-- Capitalton is built so the two sources land on different rungs. The listings
-- name the area itself, so asking reaches area level. The renter rows sit in a
-- suburb, so for someone asking about "Capitalton" they can only be matched on
-- the city column — city level.
insert into listings_data (source_site, listing_url, state, city, area_raw, property_type, annual_rent) values
  ('jiji', 'test/10', 'ZZ Test State', 'Capitalton', 'Capitalton', '2 Bedroom Flat', 2000000),
  ('jiji', 'test/11', 'ZZ Test State', 'Capitalton', 'Capitalton', '2 Bedroom Flat', 2400000),
  ('jiji', 'test/12', 'ZZ Test State', 'Capitalton', 'Capitalton', '2 Bedroom Flat', 2800000);
insert into renter_data (source, state, city, area_raw, property_type, annual_rent) values
  ('form', 'ZZ Test State', 'Capitalton', 'Zedbury', '2 Bedroom Flat', 500000),
  ('form', 'ZZ Test State', 'Capitalton', 'Zedbury', '2 Bedroom Flat', 550000),
  ('form', 'ZZ Test State', 'Capitalton', 'Zedbury', '2 Bedroom Flat', 600000);

select pg_temp.expect('the two sources really are on different rungs',
  concat_ws('/',
    rent_lookup('ZZ Test State', 'Capitalton', '2 bedroom flat', 2400000, 3) #>> '{asking,level}',
    rent_lookup('ZZ Test State', 'Capitalton', '2 bedroom flat', 2400000, 3) #>> '{actual,level}'),
  'area/city');
select pg_temp.expect('area asking beats city actual — geography first',
  rent_lookup('ZZ Test State', 'Capitalton', '2 bedroom flat', 2400000, 3) ->> 'verdict_basis', 'asking');
select pg_temp.expect('and the verdict follows that finer band',
  -- Against the city-wide actual band 2,400,000 would be "above"; against the
  -- area's own asking prices it is squarely fair.
  rent_lookup('ZZ Test State', 'Capitalton', '2 bedroom flat', 2400000, 3) ->> 'verdict', 'fair');

-- ── area matching is generous on purpose ─────────────────────────────────────
--
-- Renters do not type the name on the listing. Each of these must match, or we
-- answer "no data" to a question we can answer.

select pg_temp.expect('exact match',            area_matches('', 'Yaba', 'Yaba')::text, 'true');
select pg_temp.expect('case insensitive',       area_matches('', 'Yaba', 'yaba')::text, 'true');
select pg_temp.expect('renter types less',      area_matches('', 'Lekki Phase 1', 'Lekki')::text, 'true');
select pg_temp.expect('renter types more',      area_matches('', 'Lekki', 'Lekki Phase 1')::text, 'true');
select pg_temp.expect('roman and arabic numerals', area_matches('', 'Wuse II', 'Wuse 2')::text, 'true');
select pg_temp.expect('the word district is ignored', area_matches('', 'Garki', 'Garki District')::text, 'true');
select pg_temp.expect('different areas do not match', area_matches('', 'Ikeja', 'Yaba')::text, 'false');
select pg_temp.expect('an empty query matches nothing', area_matches('', 'Yaba', '')::text, 'false');
select pg_temp.expect('a null query matches nothing', area_matches('', 'Yaba', null)::text, 'false');

-- ── rent_estimate: reconciling exact figures with bands ──────────────────────

select pg_temp.expect('an exact rent wins over a band',
  compute_rent_estimate(950000, '800,000 - 1,200,000')::text, '950000');
select pg_temp.expect('a two-ended band becomes its midpoint',
  compute_rent_estimate(null, '800,000 - 1,200,000')::text, '1000000');
select pg_temp.expect('"below N" sits inside the band, not on its edge',
  compute_rent_estimate(null, 'Below 500,000')::text, '350000');
select pg_temp.expect('"above N" sits inside the band, not on its edge',
  compute_rent_estimate(null, 'Above 2,000,000')::text, '2600000');
select pg_temp.expect('an unreadable band yields nothing rather than a guess',
  compute_rent_estimate(null, 'no idea')::text, null);
select pg_temp.expect('no answer at all yields nothing',
  compute_rent_estimate(null, null)::text, null);

-- The trigger has to fire on update as well as insert, or an edited submission
-- keeps a stale estimate and silently skews the actual band.
insert into renter_data (source, state, area_raw, rent_range)
values ('form', 'ZZ Test State', 'Triggerton', '800,000 - 1,200,000');
select pg_temp.expect('the trigger fills rent_estimate on insert',
  (select rent_estimate::text from renter_data where area_raw = 'Triggerton'), '1000000');
update renter_data set rent_range = '2,000,000 - 3,000,000' where area_raw = 'Triggerton';
select pg_temp.expect('the trigger refreshes rent_estimate on update',
  (select rent_estimate::text from renter_data where area_raw = 'Triggerton'), '2500000');

-- A renter row with no readable rent must not join the actual band at all.
insert into renter_data (source, state, area_raw, property_type, rent_range)
values ('form', 'ZZ Test State', 'Testville', '2 Bedroom Flat', 'not sure');
select pg_temp.expect('a row with no readable rent is left out of the band',
  rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', 1300000, 3) #>> '{actual,n}', '3');

\o

-- ── report ───────────────────────────────────────────────────────────────────

do $$
declare
  total int;
  failed int;
  r record;
begin
  select count(*), count(*) filter (where not ok) into total, failed from assertions;
  for r in select * from assertions where not ok order by label loop
    raise warning 'FAIL  %  —  %', r.label, r.detail;
  end loop;
  if failed > 0 then
    raise exception '% of % golden assertions failed', failed, total;
  end if;
  raise notice 'rent_lookup golden tests: % assertions passed', total;
end $$;

rollback;
