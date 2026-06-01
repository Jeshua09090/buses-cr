set search_path = public, extensions;

create or replace function public.ctp_name_tokens(p_value text)
returns text[]
language sql
immutable
parallel safe
as $$
  with tokens as (
    select distinct token
    from regexp_split_to_table(
      lower(regexp_replace(coalesce(p_value, ''), '[^[:alnum:]]+', ' ', 'g')),
      '\s+'
    ) as token
    where length(token) >= 3
      and token not in (
        'san', 'santa', 'jose', 'del', 'las', 'los', 'por', 'con',
        'cartago', 'ruta', 'buses', 'bus', 'ida', 'vuelta'
      )
  )
  select coalesce(array_agg(token order by token), '{}'::text[])
  from tokens;
$$;

comment on function public.ctp_name_tokens(text) is
  'Tokeniza nombres de rutas para comparar textos productivos contra descripciones oficiales del CTP sin depender de coincidencia exacta.';

drop view if exists public.staging_ctp_product_route_family_match_qa;

create or replace view public.staging_ctp_product_route_family_match_qa as
with current_routes as (
  select
    r.id as ruta_id,
    r.codigo_ctp,
    public.normalize_route_code(r.codigo_ctp) as route_code_normalized,
    r.nombre_ruta,
    public.ctp_name_tokens(r.nombre_ruta) as route_tokens
  from public.rutas r
  where public.normalize_route_code(r.codigo_ctp) is not null
),
official_families as (
  select
    rv.route_code_normalized,
    rv.variant_family_code,
    rv.direction_normalized,
    min(rv.description_raw) as family_description,
    public.ctp_name_tokens(min(rv.description_raw)) as family_tokens
  from public.staging_ctp_official_route_variants rv
  where rv.route_code_normalized is not null
    and rv.variant_family_code is not null
  group by
    rv.route_code_normalized,
    rv.variant_family_code,
    rv.direction_normalized
),
scored as (
  select
    cr.ruta_id,
    cr.codigo_ctp,
    cr.route_code_normalized,
    cr.nombre_ruta,
    ofa.variant_family_code,
    ofa.direction_normalized,
    ofa.family_description,
    (
      select count(*)
      from unnest(cr.route_tokens) as token
      where token = any(ofa.family_tokens)
    )::integer as shared_token_count,
    cardinality(cr.route_tokens) as route_token_count,
    cardinality(ofa.family_tokens) as family_token_count,
    array(
      select token
      from unnest(cr.route_tokens) as token
      where token = any(ofa.family_tokens)
      order by token
    ) as shared_tokens
  from current_routes cr
  join official_families ofa
    on ofa.route_code_normalized = cr.route_code_normalized
),
ranked as (
  select
    s.*,
    round(
      case
        when greatest(s.route_token_count, s.family_token_count, 1) = 0 then 0
        else s.shared_token_count::numeric / greatest(s.route_token_count, s.family_token_count, 1)
      end,
      4
    ) as token_similarity_score,
    row_number() over (
      partition by s.ruta_id
      order by
        s.shared_token_count desc,
        case s.direction_normalized when 'ida' then 1 when 'vuelta' then 2 else 3 end,
        s.variant_family_code asc
    ) as family_rank
  from scored s
)
select
  ruta_id,
  codigo_ctp,
  route_code_normalized,
  nombre_ruta,
  variant_family_code,
  direction_normalized,
  family_description,
  shared_token_count,
  route_token_count,
  family_token_count,
  token_similarity_score,
  shared_tokens,
  family_rank
from ranked
order by route_code_normalized asc, ruta_id asc, family_rank asc;

comment on view public.staging_ctp_product_route_family_match_qa is
  'Sugiere familias oficiales del CTP para cada ruta productiva usando codigo normalizado y similitud de nombres.';

grant select on public.staging_ctp_product_route_family_match_qa to authenticated;
