-- area_matches() matched any substring, anywhere, including mid-word.
--
-- 'nowhereville' LIKE '%vi%' is true, so a short area name matched any longer
-- name that happened to contain those letters. The damage is not hypothetical
-- and it is not only about nonsense input — these are all real pairs from the
-- live index, inside the same state, that the engine was blending into one
-- neighbourhood band:
--
--   Ado  →  Idado, Alagbado, Agbado        (Lekki-adjacent and far mainland,
--                                           nothing like each other on price)
--   Abi  →  Jabi, Abijo, Igabi
--   Aba  →  Yaba, Asaba, Alaba, Mararaba, Kukwaba
--   VI   →  Parkview, Games Village, Ovia North East, Victoria Garden City
--
-- This is the third outing for the same bug: see "Stop reporting city-wide
-- blends as neighbourhood rent data" and "Stop merging every GRA into one
-- invented neighbourhood". A band must describe one place.
--
-- Length is the wrong guard. Uyo (97 listings), Jos, Apo, Ife, Epe, Ojo, Ede
-- and Idu are all real three-letter Nigerian place names, and
-- areas_for_matching's `length(area) >= 3` already shows the authors reaching
-- for length and only half-solving it. What was actually missing is a word
-- boundary: the typed name has to appear as a whole word, not as letters inside
-- one. 'uyo road' still matches Uyo; 'nowhereville' no longer matches VI.
--
-- The exact-match and trigram arms are untouched, so the generosity that
-- matters is preserved — "Lekki" still finds "Lekki Phase 1", "Wuse 2" still
-- finds "Wuse II", and "Garki District" still finds "Garki".

-- Escape the regex metacharacters a real area name can contain: the index holds
-- "Sabo / Yaba" and "Giring (Abattoir)", and an unescaped '(' is a syntax error
-- rather than a failed match.
create or replace function public.re_quote(s text)
 returns text
 language sql
 immutable
 strict
as $function$
  select regexp_replace(s, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g')
$function$;

-- True when `needle` appears in `haystack` delimited by non-alphanumerics or by
-- the ends of the string. Used instead of \y because a needle may itself end in
-- punctuation ("Sabo /"), where \y does not behave the way you would want.
create or replace function public.contains_word(haystack text, needle text)
 returns boolean
 language sql
 immutable
as $function$
  select haystack ~ ('(^|[^[:alnum:]])' || public.re_quote(needle) || '([^[:alnum:]]|$)')
$function$;

create or replace function public.area_matches(row_city text, row_area text, user_area text)
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
    -- Whole-word containment, either direction: the renter may type less than
    -- the listing says ("Lekki" for "Lekki Phase 1") or more.
    or ((select a from c) <> '' and (
            public.contains_word((select a from c), (select a from u))
         or public.contains_word((select a from u), (select a from c))))
    or ((select a from r) <> '' and (
            public.contains_word((select a from r), (select a from u))
         or public.contains_word((select a from u), (select a from r))))
    or ((select a from c) <> '' and similarity((select a from c), (select a from u)) >= 0.5)
    or ((select a from r) <> '' and similarity((select a from r), (select a from u)) >= 0.5)
  )
$function$;

-- Known consequence, recorded rather than hidden: "VI" no longer matches
-- "Victoria Island". That match only ever worked by accident — through the same
-- mid-word substring rule that also matched Parkview and Games Village — and an
-- abbreviation is not a substring problem, it is an alias problem. The `areas`
-- table already has an `aliases` column built for exactly this and nothing
-- populates it yet. One renter row is affected today.
