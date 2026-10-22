create or replace function bettrack_private.commit(expected_version bigint,changes jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rev bigint; c jsonb; t text; key text; old_path text;
begin
 if uid is null then raise exception 'Inicia sesión'; end if;
 if expected_version is null or changes is null or jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)>20000 or octet_length(changes::text)>20000000 then raise exception 'Lote inválido o demasiado grande'; end if;
 select version into rev from public.bt_accounts where user_id=uid for update;
 if rev is null then raise exception 'Abre primero tu espacio'; end if;
 if rev<>expected_version then raise exception 'BT_CONFLICT'; end if;
 for c in select value from jsonb_array_elements(changes) loop
  t:=c->>'collection'; key:=c->>'id';
  if t is null or not(t=any(array['houses','streamers','images','bets','selections','settlements','movements','settings','uploads','audit'])) then raise exception 'Colección inválida'; end if;
  if c->'payload'='null'::jsonb then
   if t='audit' then raise exception 'La auditoría no se puede borrar'; end if;
   if t='images' then
    select payload->>'path' into old_path from public.bt_images where user_id=uid and id=key;
    if old_path is not null then insert into public.bt_storage_cleanup values(uid,old_path) on conflict do nothing; end if;
   end if;
   execute format('delete from public.%I where user_id=$1 and id=$2','bt_'||t) using uid,key;
  else
   if t='images' and not exists(select 1 from storage.objects where bucket_id='bettrack-captures' and name=c->'payload'->>'path' and split_part(name,'/',1)=uid::text) then raise exception 'Sube la captura antes de registrar sus datos'; end if;
   if t='audit' and exists(select 1 from public.bt_audit where user_id=uid and id=key and payload<>c->'payload') then raise exception 'La auditoría no se puede editar'; end if;
   execute format('insert into public.%I(user_id,id,payload) values($1,$2,$3) on conflict(user_id,id) do update set payload=excluded.payload','bt_'||t) using uid,key,c->'payload';
  end if;
 end loop;
 -- Cross-table accounting invariants, checked inside the same locked transaction.
 if exists(select 1 from public.bt_bets b where b.user_id=uid and (
  (select count(*) from public.bt_movements m where m.user_id=uid and m.bet_id=b.id and m.payload->>'kind'='Apuesta colocada' and (m.payload->>'amount')::bigint=-(b.payload->>'stake')::bigint and m.house_id=b.house_id and m.payload->>'date'=b.payload->>'date')<>1
  or (select coalesce(sum(greatest(1,jsonb_array_length(coalesce(s.payload->'builderMarkets','[]')))),0) from public.bt_selections s where s.user_id=uid and s.bet_id=b.id)<case when b.payload->>'kind'='Simple' then 1 else 2 end
  or (b.payload->>'kind'='Simple' and (select sum(greatest(1,jsonb_array_length(coalesce(s.payload->'builderMarkets','[]')))) from public.bt_selections s where s.user_id=uid and s.bet_id=b.id)<>1)
 )) then raise exception 'Apuesta sin selecciones o contabilidad de stake inconsistente'; end if;
 if exists(select 1 from public.bt_settlements s join public.bt_bets b on b.user_id=s.user_id and b.id=s.bet_id where s.user_id=uid and (
  (s.payload->>'closedStake')::bigint<>(b.payload->>'stake')::bigint or (s.payload->>'date')::timestamptz<(b.payload->>'date')::timestamptz
  or (select count(*) from public.bt_movements m where m.user_id=uid and m.settlement_id=s.id and m.bet_id=b.id and m.house_id=b.house_id and (m.payload->>'amount')::bigint=(s.payload->>'returned')::bigint and m.payload->>'date'=s.payload->>'date' and m.payload->>'kind'=case when s.payload->>'kind'='Cashout' then 'Cashout' else 'Apuesta liquidada' end)<>1
 )) then raise exception 'Liquidación o retorno inconsistente'; end if;
 if exists(select 1 from public.bt_movements m where m.user_id=uid and (
  (m.payload->>'kind' in ('Capital inicial','Depósito') and (m.payload->>'amount')::bigint<=0)
  or (m.payload->>'kind'='Retiro' and (m.payload->>'amount')::bigint>=0)
  or (m.payload->>'kind'='Ajuste' and ((m.payload->>'amount')::bigint=0 or coalesce(trim(m.payload->>'note'),'')=''))
  or (m.payload->>'kind'='Apuesta colocada' and (m.bet_id is null or m.settlement_id is not null))
  or (m.payload->>'kind' in ('Apuesta liquidada','Cashout') and (m.bet_id is null or m.settlement_id is null))
  or (m.payload->>'kind' not in ('Apuesta colocada','Apuesta liquidada','Cashout') and (m.bet_id is not null or m.settlement_id is not null))
  or (m.payload->>'kind'<>'Transferencia' and m.payload->>'transferId' is not null)
 )) then raise exception 'Movimiento inválido'; end if;
 if exists(select 1 from public.bt_movements m join public.bt_houses h on h.user_id=m.user_id and h.id=m.house_id where m.user_id=uid and m.payload->>'kind'='Transferencia' group by m.payload->>'transferId' having count(*)<>2 or sum((m.payload->>'amount')::bigint)<>0 or count(distinct house_id)<>2 or count(distinct h.payload->>'currency')<>1 or min(abs((m.payload->>'amount')::bigint))=0 or m.payload->>'transferId' is null) then raise exception 'Transferencia inconsistente'; end if;
 if exists(select 1 from jsonb_array_elements(changes) as delta(value) join public.bt_movements m on m.user_id=uid and m.id=delta.value->>'id' where delta.value->>'collection'='movements' and (m.payload->>'kind'='Retiro' or (m.payload->>'kind'='Transferencia' and (m.payload->>'amount')::bigint<0)) and (select coalesce(sum((x.payload->>'amount')::bigint),0) from public.bt_movements x where x.user_id=uid and x.house_id=m.house_id)<0) then raise exception 'Saldo insuficiente para retirar o transferir'; end if;
 perform (payload->>'date')::timestamptz from public.bt_bets where user_id=uid;
 perform (payload->>'date')::timestamptz from public.bt_movements where user_id=uid;
 insert into public.bt_server_audit(user_id,version,changes) values(uid,rev+1,changes);
 update public.bt_accounts set version=rev+1 where user_id=uid;
 return rev+1;
end $$;
