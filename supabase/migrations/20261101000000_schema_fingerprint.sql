-- A fingerprint of the schema, so drift between this repository and the live
-- project is detectable instead of discovered.
--
-- The baseline migrations were reconstructed from production and verified by
-- building the schema in a throwaway Postgres and comparing a 151-line
-- structural listing against the live one. That check was done by hand, once.
-- Nothing repeated it, and nothing had to: a Vercel deploy does not run
-- migrations, so the repo and the project stay in step only while someone
-- remembers to apply each file. Two have already been applied by hand.
--
-- So the check becomes a function, callable over PostgREST with the credentials
-- CI already needs for the scrapers, and compared against the same fingerprint
-- taken from a database built purely from supabase/migrations/. Equal means the
-- repo really does describe production. Unequal names the difference.
--
-- Returns structure only — table and column names, types, defaults,
-- constraints, indexes, triggers, RLS flags, and a hash of each function body.
-- No row of anyone's data is read.

-- One line per structural fact. Ordered and hashed by the caller, not here, so
-- the line format stays the single source of truth for both sides.
create or replace function public.schema_fingerprint_lines()
 returns table(line text)
 language sql
 stable
as $function$
  select 'COL  ' || table_name || '.' || column_name || ' :: ' ||
         coalesce(case when data_type = 'numeric' and numeric_precision is not null
                   then 'numeric(' || numeric_precision || ',' || numeric_scale || ')' end,
                  case when data_type = 'character varying' and character_maximum_length is not null
                   then 'varchar(' || character_maximum_length || ')' end,
                  data_type) ||
         ' null=' || is_nullable || ' def=' || coalesce(column_default, '-')
    from information_schema.columns
   where table_schema = 'public'
  union all
  select 'CON  ' || rel.relname || ' ' || con.conname || ' ' || pg_get_constraintdef(con.oid)
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
   where n.nspname = 'public'
  union all
  select 'IDX  ' || indexdef from pg_indexes where schemaname = 'public'
  union all
  select 'TRG  ' || pg_get_triggerdef(tg.oid)
    from pg_trigger tg
    join pg_class rel on rel.oid = tg.tgrelid
    join pg_namespace n on n.oid = rel.relnamespace
   where n.nspname = 'public' and not tg.tgisinternal
  union all
  select 'RLS  ' || c.relname || ' ' || c.relrowsecurity::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
  -- RLS is enabled everywhere with no policies by design, so a policy appearing
  -- is exactly the kind of drift worth catching: it opens a table to the public
  -- internet.
  union all
  select 'POL  ' || tablename || ' ' || policyname || ' ' || cmd || ' ' || coalesce(qual, '-')
    from pg_policies where schemaname = 'public'
  union all
  -- Our own functions only. Extension-owned ones (pg_trgm installs some forty)
  -- are excluded by their extension dependency, so installing or upgrading an
  -- extension does not read as drift in our schema.
  --
  -- Two details here are load-bearing, and both were found by a test that
  -- filtered this function's output:
  --
  --   prokind = 'f'  — pg_get_functiondef() raises on an aggregate, and
  --                    pg_proc holds aggregates and procedures too.
  --   offset 0       — an optimisation fence. Without it the planner inlines
  --                    this SQL function into the caller's query, and a caller
  --                    doing `where line like 'COL %'` lets it evaluate
  --                    pg_get_functiondef() on rows the namespace filter had
  --                    not eliminated yet — reaching pg_catalog's aggregates
  --                    and failing with `"array_agg" is an aggregate
  --                    function`. The unfiltered call worked fine, which is
  --                    exactly why this needed a test rather than a try.
  select 'FN   ' || proname || '(' || args || ') md5=' || md5(regexp_replace(def, '\s+', ' ', 'g'))
    from (
      select p.proname,
             pg_get_function_identity_arguments(p.oid) as args,
             pg_get_functiondef(p.oid) as def
        from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.prokind = 'f'
         and not exists (
           select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
         )
       offset 0
    ) own_functions;
$function$;

create or replace function public.schema_fingerprint()
 returns jsonb
 language sql
 stable
as $function$
  select jsonb_build_object(
    'lines', count(*),
    -- "C" collation so the ordering is byte order on both sides, independent of
    -- the locale a given server happens to run under.
    'md5', md5(string_agg(line, E'\n' order by line collate "C"))
  )
  from public.schema_fingerprint_lines();
$function$;
