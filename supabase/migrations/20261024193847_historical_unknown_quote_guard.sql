-- New historical imports may preserve absent global quotes as JSON null.
-- No existing payload, money, RLS policy or account is rewritten.
alter table public.bt_bets drop constraint bt_bets_payload_check;
alter table public.bt_bets add constraint bt_bets_payload_check check ((
  payload ?& array['id','houseId','date','kind','stake','potential','odds']
  and payload->>'kind' in ('Simple','Combinada')
  and payload->>'stake' ~ '^[0-9]+$'
  and (payload->>'stake')::numeric between 1 and 100000000000
  and (
    (payload->>'potential' ~ '^[0-9]+$' and (payload->>'potential')::numeric between 0 and 100000000000)
    or (payload->'potential' = 'null'::jsonb and payload->'historical' = 'true'::jsonb)
  )
  and (
    ((payload->>'odds')::numeric between 1 and 100000)
    or (payload->'odds' = 'null'::jsonb and payload->'historical' = 'true'::jsonb)
  )
) is true);

-- A deferred guard validates the FINAL transaction state, including deletions.
-- Nulls can never escape into a pending wager or a partial/dated-before-bet closure.
create function bettrack_private.guard_historical_closed()
returns trigger language plpgsql set search_path = '' as $$
declare b jsonb; s jsonb; owner_id uuid; target_bet_key text; targets text[] := array[]::text[];
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
  if b is null or not (b->'odds' = 'null'::jsonb or b->'potential' = 'null'::jsonb) then continue; end if;
  select r.payload into s from public.bt_settlements r where r.user_id=owner_id and r.bet_id=target_bet_key;
  if not coalesce(
    b->'historical' = 'true'::jsonb
    and b->>'source' in ('ocr','import')
    and b->>'dateSource' in ('manual','ticket')
    and b->'timingUnknown' = 'false'::jsonb
    and s->>'kind' in ('Ganada','Perdida','Cashout')
    and (s->>'closedStake')::numeric = (b->>'stake')::numeric
    and (s->>'date')::timestamptz >= (b->>'date')::timestamptz
    and (s->>'date')::timestamptz <= now()
    and (s->>'kind'<>'Ganada' or (s->>'returned')::numeric>(b->>'stake')::numeric), false)
  then raise exception 'BT_HISTORICAL_REQUIRES_FINAL_SETTLEMENT'; end if;
  end loop;
  return null;
end;
$$;
revoke all on function bettrack_private.guard_historical_closed() from public, anon, authenticated;
create constraint trigger bt_historical_closed_bet
after insert or update or delete on public.bt_bets
deferrable initially deferred for each row execute function bettrack_private.guard_historical_closed();
create constraint trigger bt_historical_closed_settlement
after insert or update or delete on public.bt_settlements
deferrable initially deferred for each row execute function bettrack_private.guard_historical_closed();

-- Read-only deployment capability: absence keeps older backends safely blocked.
create function public.bt_capabilities() returns jsonb
language sql stable set search_path = '' as $$
  select case when auth.uid() is null then '{}'::jsonb
    else '{"historicalUnknownQuote":true}'::jsonb end;
$$;
revoke all on function public.bt_capabilities() from public, anon;
grant execute on function public.bt_capabilities() to authenticated;
