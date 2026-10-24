-- Explicit booking time for historical receipts without invented placement/settlement dates.
-- No row rewrites, new tables, RLS/Auth/Storage changes or financial RPC changes.
create or replace function bettrack_private.guard_historical_closed()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare b jsonb; s jsonb; t jsonb; owner_id uuid; target_bet_key text; targets text[] := array[]::text[];
begin
  if TG_OP <> 'DELETE' then
    owner_id := NEW.user_id;
    targets := array_append(targets, case when TG_TABLE_NAME='bt_bets' then NEW.id else NEW.payload->>'betId' end);
  end if;
  if TG_OP <> 'INSERT' then
    owner_id := OLD.user_id;
    targets := array_append(targets, case when TG_TABLE_NAME='bt_bets' then OLD.id else OLD.payload->>'betId' end);
  end if;
  foreach target_bet_key in array targets loop
    select r.payload into b from public.bt_bets r where r.user_id=owner_id and r.id=target_bet_key;
    if b is null or not (b->'odds'='null'::jsonb or b->'potential'='null'::jsonb or b->>'dateSource'='accounting') then continue; end if;
    select r.payload into s from public.bt_settlements r where r.user_id=owner_id and r.bet_id=target_bet_key;
    t := b->'historicalTiming';
    if not coalesce(
      b->'historical'='true'::jsonb and b->>'source' in ('ocr','import')
      and (
        (b->>'dateSource' in ('manual','ticket') and b->'timingUnknown'='false'::jsonb)
        or (b->>'dateSource'='accounting'
          and t ?& array['recordedAt','uploadedAt','betAt','settledAt','mode','events']
          and t->>'recordedAt'=b->>'date' and t->>'uploadedAt'=b->>'createdAt'
          and (t->>'uploadedAt')::timestamptz <= (t->>'recordedAt')::timestamptz
          and t->>'mode' in ('unknown','live','prematch')
          and b->'live'=to_jsonb(t->>'mode'='live')
          and b->'timingUnknown'=to_jsonb(t->>'mode'='unknown')
          and jsonb_typeof(t->'events')='array' and jsonb_array_length(t->'events')<=100
          and (t->'betAt'='null'::jsonb or (t->>'betAt')::timestamptz <= (b->>'date')::timestamptz)
          and (t->'settledAt'='null'::jsonb or (t->>'settledAt')::timestamptz <= (b->>'date')::timestamptz)
          and (t->'betAt'='null'::jsonb or t->'settledAt'='null'::jsonb or (t->>'betAt')::timestamptz <= (t->>'settledAt')::timestamptz)
          and s->>'date'=b->>'date')
      )
      and s->>'kind' in ('Ganada','Perdida','Cashout')
      and (s->>'closedStake')::numeric=(b->>'stake')::numeric
      and (s->>'date')::timestamptz >= (b->>'date')::timestamptz
      and (s->>'date')::timestamptz <= now()
      and (s->>'kind'<>'Ganada' or (s->>'returned')::numeric>(b->>'stake')::numeric), false)
    then raise exception 'BT_HISTORICAL_REQUIRES_FINAL_SETTLEMENT'; end if;
  end loop;
  return null;
end;
$$;
revoke all on function bettrack_private.guard_historical_closed() from public, anon, authenticated;

create or replace function public.bt_capabilities() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select case when auth.uid() is null then '{}'::jsonb
    else '{"historicalUnknownQuote":true,"automaticHistoricalBooking":true}'::jsonb end;
$$;
revoke all on function public.bt_capabilities() from public, anon;
grant execute on function public.bt_capabilities() to authenticated;
