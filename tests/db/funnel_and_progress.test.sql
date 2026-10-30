-- Golden tests for the extraction funnel tally and cell_progress.
--
-- Same discipline as rent_lookup.test.sql: fixtures sit under a state name no
-- real row uses, and the file ends in ROLLBACK, so it cannot touch real data.

\set ON_ERROR_STOP on

begin;

create temp table assertions (label text, ok boolean, detail text);

create function pg_temp.expect(p_label text, p_got text, p_want text) returns void
language plpgsql as $$
begin
  insert into assertions
  values (p_label, p_got is not distinct from p_want, format('got %L, wanted %L', p_got, p_want));
end $$;

\o /dev/null

-- ── the extraction funnel tally ──────────────────────────────────────────────

select extraction_record('saved');
select pg_temp.expect('first attempt creates the day''s row',
  (select n::text from extraction_outcomes where day = current_date and outcome = 'saved'), '1');

select extraction_record('saved');
select extraction_record('saved');
select pg_temp.expect('repeat outcomes increment in place, not insert',
  (select n::text from extraction_outcomes where day = current_date and outcome = 'saved'), '3');
select pg_temp.expect('one row per outcome per day',
  (select count(*)::text from extraction_outcomes where day = current_date and outcome = 'saved'), '1');

select extraction_record('rent_not_stated_by_user');
select extraction_record('need_state_and_rent');
select pg_temp.expect('distinct outcomes are tracked separately',
  (select count(*)::text from extraction_outcomes where day = current_date), '3');

-- The funnel view is what answers "has this ever worked".
select pg_temp.expect('the funnel reports the widest outcome first',
  (select outcome from extraction_funnel(30) limit 1), 'saved');
select pg_temp.expect('the funnel sums across outcomes',
  (select sum(n)::text from extraction_funnel(30)), '5');

-- An outcome older than the window must drop out, or the figure never improves
-- after a fix.
insert into extraction_outcomes (day, outcome, n)
values (current_date - 400, 'parse_error', 99);
select pg_temp.expect('the window excludes older days',
  (select coalesce(sum(n), 0)::text from extraction_funnel(30) where outcome = 'parse_error'), '0');
select pg_temp.expect('a wider window includes them',
  (select sum(n)::text from extraction_funnel(500) where outcome = 'parse_error'), '99');

-- ── cell_progress ────────────────────────────────────────────────────────────

-- Two typed renter rows in Testville, one of another type, one outlier, and one
-- with no readable rent. Only the first two should count toward the cell.
insert into renter_data (source, state, city, area_raw, property_type, annual_rent) values
  ('form', 'ZZ Test State', 'Testville', 'Testville', '2 Bedroom Flat', 800000),
  ('form', 'ZZ Test State', 'Testville', 'Testville', '2 Bedroom Flat', 900000),
  ('form', 'ZZ Test State', 'Testville', 'Testville', '3 Bedroom Flat', 2000000);
insert into renter_data (source, state, city, area_raw, property_type, annual_rent, is_outlier) values
  ('form', 'ZZ Test State', 'Testville', 'Testville', '2 Bedroom Flat', 999000000, true);
insert into renter_data (source, state, city, area_raw, property_type, rent_range) values
  ('form', 'ZZ Test State', 'Testville', 'Testville', '2 Bedroom Flat', 'not sure');

select pg_temp.expect('counts the typed rows in the cell',
  cell_progress('ZZ Test State', 'Testville', '2 bedroom flat', 3) ->> 'typed_n', '2');
select pg_temp.expect('says how many more are needed',
  cell_progress('ZZ Test State', 'Testville', '2 bedroom flat', 3) ->> 'needed', '1');
select pg_temp.expect('and that there is no band yet',
  cell_progress('ZZ Test State', 'Testville', '2 bedroom flat', 3) ->> 'has_band', 'false');
select pg_temp.expect('counts every type in the area separately',
  cell_progress('ZZ Test State', 'Testville', '2 bedroom flat', 3) ->> 'area_n', '3');

-- The count must match the one rent_lookup will actually use, or the promise
-- "one more and I can answer" is a lie.
insert into renter_data (source, state, city, area_raw, property_type, annual_rent)
values ('form', 'ZZ Test State', 'Testville', 'Testville', '2 Bedroom Flat', 1000000);

select pg_temp.expect('the third row closes the gap',
  cell_progress('ZZ Test State', 'Testville', '2 bedroom flat', 3) ->> 'needed', '0');
select pg_temp.expect('and reports a band',
  cell_progress('ZZ Test State', 'Testville', '2 bedroom flat', 3) ->> 'has_band', 'true');
select pg_temp.expect('rent_lookup agrees — this is the promise being kept',
  rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', 900000, 3) #>> '{actual,level}', 'area');
select pg_temp.expect('and on the same sample size',
  rent_lookup('ZZ Test State', 'Testville', '2 bedroom flat', 900000, 3) #>> '{actual,n}',
  cell_progress('ZZ Test State', 'Testville', '2 bedroom flat', 3) ->> 'typed_n');

-- Outliers and unreadable rents stay excluded once the band exists.
select pg_temp.expect('the outlier and the unreadable row never counted',
  cell_progress('ZZ Test State', 'Testville', '2 bedroom flat', 3) ->> 'typed_n', '3');

-- Area matching is the generous one, so "Testville" should also be reachable
-- from the way a renter would type it.
select pg_temp.expect('area matching is as generous as the engine''s',
  cell_progress('ZZ Test State', 'testville', '2 bedroom flat', 3) ->> 'typed_n', '3');

-- An untyped question falls back to every type in the area rather than nothing.
select pg_temp.expect('no property type counts the whole area',
  cell_progress('ZZ Test State', 'Testville', null, 3) ->> 'typed_n', '4');

-- A cell we hold nothing for reports zero and the full gap, never null.
select pg_temp.expect('an unknown area reports zero, not null',
  cell_progress('ZZ Test State', 'Nowhereville', '2 bedroom flat', 3) ->> 'typed_n', '0');
select pg_temp.expect('and the full distance to a band',
  cell_progress('ZZ Test State', 'Nowhereville', '2 bedroom flat', 3) ->> 'needed', '3');

-- Without an area there is no cell to measure, and inventing one would be the
-- same mistake as quoting a state band as neighbourhood data.
select pg_temp.expect('no area means no answer', cell_progress('ZZ Test State', null, '2 bedroom flat', 3)::text, null);
select pg_temp.expect('no state means no answer', cell_progress(null, 'Testville', '2 bedroom flat', 3)::text, null);

\o

do $$
declare total int; failed int; r record;
begin
  select count(*), count(*) filter (where not ok) into total, failed from assertions;
  for r in select * from assertions where not ok order by label loop
    raise warning 'FAIL  %  —  %', r.label, r.detail;
  end loop;
  if failed > 0 then
    raise exception '% of % golden assertions failed', failed, total;
  end if;
  raise notice 'funnel + cell_progress golden tests: % assertions passed', total;
end $$;

rollback;
