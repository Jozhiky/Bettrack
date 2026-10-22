-- A Simple ticket can have one Bet Builder leg with several child markets.
-- Preserve all existing accounting, auth.uid, CAS and ownership guards.
do $migration$
declare
 definition text := pg_get_functiondef('bettrack_private.commit(bigint,jsonb)'::regprocedure);
 old_guard text := $old$(b.payload->>'kind'='Simple' and (select sum(greatest(1,jsonb_array_length(coalesce(s.payload->'builderMarkets','[]')))) from public.bt_selections s where s.user_id=uid and s.bet_id=b.id)<>1)$old$;
 new_guard text := $new$(b.payload->>'kind'='Simple' and (select count(*) from public.bt_selections s where s.user_id=uid and s.bet_id=b.id)<>1)$new$;
begin
 if (length(definition)-length(replace(definition,old_guard,'')))/length(old_guard) <> 1 then
  raise exception 'Unexpected commit definition; review migration before applying';
 end if;
 execute replace(definition,old_guard,new_guard);
end $migration$;
