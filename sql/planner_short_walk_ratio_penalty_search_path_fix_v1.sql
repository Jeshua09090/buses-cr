-- Locks the helper search_path so Supabase does not flag it as mutable.

create or replace function public.planner_short_walk_ratio_penalty(
  p_straight_line_m integer,
  p_total_walk_m integer
)
returns integer
language sql
immutable
set search_path = public, extensions
as $$
  select case
    when p_straight_line_m is null or p_straight_line_m <= 0 or p_total_walk_m is null then 0
    when p_straight_line_m <= 1000
      and p_total_walk_m >= 450
      and (p_total_walk_m::numeric / p_straight_line_m::numeric) > 0.85 then 260
    when p_straight_line_m <= 1200
      and p_total_walk_m >= 500
      and (p_total_walk_m::numeric / p_straight_line_m::numeric) > 0.70 then 180
    else 0
  end;
$$;
