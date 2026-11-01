-- Golden tests for the schema fingerprint.
--
-- This is the check that detects the repository drifting away from the live
-- project, so its own behaviour needs pinning. The subtle requirement is what
-- it *excludes*: pg_trgm installs around forty functions, and if those counted,
-- an extension upgrade would read as schema drift and the alarm would be
-- ignored within a week.

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

-- ── shape ────────────────────────────────────────────────────────────────────

select pg_temp.expect('reports a line count and a hash',
  (select (schema_fingerprint() ? 'lines') and (schema_fingerprint() ? 'md5'))::text, 'true');
select pg_temp.expect('the count matches the lines it hashed',
  schema_fingerprint() ->> 'lines',
  (select count(*)::text from schema_fingerprint_lines()));
select pg_temp.expect('the hash is a real md5',
  (schema_fingerprint() ->> 'md5' ~ '^[0-9a-f]{32}$')::text, 'true');
select pg_temp.expect('it is stable when nothing changes',
  (schema_fingerprint() ->> 'md5'), (schema_fingerprint() ->> 'md5'));

-- ── what it covers ───────────────────────────────────────────────────────────

select pg_temp.expect('covers columns',     (select count(*) > 80 from schema_fingerprint_lines() where line like 'COL %')::text, 'true');
select pg_temp.expect('covers constraints', (select count(*) > 15 from schema_fingerprint_lines() where line like 'CON %')::text, 'true');
select pg_temp.expect('covers indexes',     (select count(*) > 20 from schema_fingerprint_lines() where line like 'IDX %')::text, 'true');
select pg_temp.expect('covers the trigger', (select count(*) = 1  from schema_fingerprint_lines() where line like 'TRG %')::text, 'true');
select pg_temp.expect('covers RLS on every table',
  (select count(*)::text from schema_fingerprint_lines() where line like 'RLS %'),
  (select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'));

-- RLS is enabled everywhere with no policies by design, so a policy appearing is
-- precisely the drift worth catching — it opens a table to the public internet.
select pg_temp.expect('no policies exist, so none are listed',
  (select count(*)::text from schema_fingerprint_lines() where line like 'POL %'), '0');

-- ── what it must exclude ─────────────────────────────────────────────────────

select pg_temp.expect('pg_trgm functions are excluded',
  (select count(*)::text from schema_fingerprint_lines()
    where line like 'FN %similarity(%' or line like 'FN %gtrgm%' or line like 'FN %gin_trgm%'),
  '0');
select pg_temp.expect('an extension upgrade cannot read as drift',
  -- Nothing the extension owns may appear, whatever it is called.
  (select count(*)::text from schema_fingerprint_lines() l
    where exists (
      select 1 from pg_proc p
       join pg_depend d on d.objid = p.oid and d.deptype = 'e'
       where l.line like 'FN   ' || p.proname || '(%'
    )),
  '0');

-- But our own must all be there, or drift in them would go unnoticed.
select pg_temp.expect('our own functions are all covered',
  (select count(*)::text from schema_fingerprint_lines() where line like 'FN %'),
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')));
select pg_temp.expect('including the pricing engine itself',
  (select count(*) = 1 from schema_fingerprint_lines() where line like 'FN   rent_lookup(%')::text, 'true');

-- ── it must actually notice a change ─────────────────────────────────────────

create temp table before_fp as select schema_fingerprint() ->> 'md5' as md5;

-- A new column is drift.
alter table public.waitlist add column drift_probe text;
select pg_temp.expect('a new column changes the fingerprint',
  (select (select md5 from before_fp) <> (schema_fingerprint() ->> 'md5'))::text, 'true');
alter table public.waitlist drop column drift_probe;
select pg_temp.expect('and removing it restores the fingerprint',
  (select (select md5 from before_fp) = (schema_fingerprint() ->> 'md5'))::text, 'true');

-- A changed function body is drift, even with the same signature. This is the
-- case that caught three functions applied by hand from a paraphrase rather
-- than from the migration file.
create or replace function public.norm_ptype(s text)
 returns text language sql immutable
as $$ select regexp_replace(lower(coalesce(s, '')), '[^a-z0-9]', '', 'g') -- changed
$$;
select pg_temp.expect('a changed function body changes the fingerprint',
  (select (select md5 from before_fp) <> (schema_fingerprint() ->> 'md5'))::text, 'true');

-- A new policy is drift, and the most important kind.
create policy drift_probe on public.waitlist for select using (true);
select pg_temp.expect('a new policy is listed',
  (select count(*)::text from schema_fingerprint_lines() where line like 'POL %'), '1');
drop policy drift_probe on public.waitlist;

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
  raise notice 'schema fingerprint golden tests: % assertions passed', total;
end $$;

rollback;
