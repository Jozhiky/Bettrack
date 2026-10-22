-- Cloud-only BETTRACK. Private transaction helpers; no direct client writes.
create schema if not exists bettrack_private;
revoke all on schema bettrack_private from public, anon;
grant usage on schema bettrack_private to authenticated;
create table public.bt_accounts (user_id uuid primary key references auth.users(id) on delete cascade, version bigint not null default 0);
alter table public.bt_accounts enable row level security;
create policy own_account on public.bt_accounts for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.bt_accounts from anon, authenticated;
grant select on public.bt_accounts to authenticated;
create table public.bt_houses (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null check(length(id) between 1 and 150), payload jsonb not null,
 primary key(user_id,id), check(jsonb_typeof(payload)='object' and payload->>'id'=id),
 check((payload ?& array['id','name','currency','active'] and payload->>'currency' in ('PEN','USD','EUR') and length(payload->>'name') between 1 and 100) is true)
);
alter table public.bt_houses enable row level security;
create policy own_rows on public.bt_houses for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.bt_houses from anon, authenticated;
grant select on public.bt_houses to authenticated;
create table public.bt_streamers (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null check(length(id) between 1 and 150), payload jsonb not null,
 primary key(user_id,id), check(jsonb_typeof(payload)='object' and payload->>'id'=id),
 check((payload ?& array['id','name','active'] and length(payload->>'name') between 1 and 100) is true)
);
alter table public.bt_streamers enable row level security;
create policy own_rows on public.bt_streamers for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.bt_streamers from anon, authenticated;
grant select on public.bt_streamers to authenticated;
create table public.bt_images (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null check(length(id) between 1 and 150), payload jsonb not null,
 primary key(user_id,id), check(jsonb_typeof(payload)='object' and payload->>'id'=id),
 check((payload ?& array['id','name','hash','path'] and payload->>'hash' ~ '^[a-f0-9]{64}$' and split_part(payload->>'path','/',1)=user_id::text) is true)
);
alter table public.bt_images enable row level security;
create policy own_rows on public.bt_images for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.bt_images from anon, authenticated;
grant select on public.bt_images to authenticated;
create table public.bt_bets (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null check(length(id) between 1 and 150), payload jsonb not null,
 primary key(user_id,id), check(jsonb_typeof(payload)='object' and payload->>'id'=id),
 check((payload ?& array['id','houseId','date','kind','stake','potential','odds'] and payload->>'kind' in ('Simple','Combinada') and payload->>'stake' ~ '^[0-9]+$' and (payload->>'stake')::numeric between 1 and 100000000000 and payload->>'potential' ~ '^[0-9]+$' and (payload->>'potential')::numeric between 0 and 100000000000 and (payload->>'odds')::numeric between 1 and 100000) is true),
 house_id text generated always as (nullif(payload->>'houseId','')) stored, foreign key(user_id,house_id) references public.bt_houses(user_id,id) deferrable initially deferred,
 streamer_id text generated always as (nullif(payload->>'streamerId','')) stored, foreign key(user_id,streamer_id) references public.bt_streamers(user_id,id) deferrable initially deferred,
 image_id text generated always as (nullif(payload->>'imageId','')) stored, foreign key(user_id,image_id) references public.bt_images(user_id,id) deferrable initially deferred
);
alter table public.bt_bets enable row level security;
create policy own_rows on public.bt_bets for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.bt_bets from anon, authenticated;
grant select on public.bt_bets to authenticated;
create index on public.bt_bets(user_id,house_id);
create index on public.bt_bets(user_id,streamer_id);
create index on public.bt_bets(user_id,image_id);
create table public.bt_selections (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null check(length(id) between 1 and 150), payload jsonb not null,
 primary key(user_id,id), check(jsonb_typeof(payload)='object' and payload->>'id'=id),
 check((payload ?& array['id','betId','event','market','pick'] and length(payload->>'event') between 1 and 250 and length(payload->>'market') between 1 and 250 and length(payload->>'pick') between 1 and 250) is true),
 bet_id text generated always as (nullif(payload->>'betId','')) stored, foreign key(user_id,bet_id) references public.bt_bets(user_id,id) deferrable initially deferred
);
alter table public.bt_selections enable row level security;
create policy own_rows on public.bt_selections for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.bt_selections from anon, authenticated;
grant select on public.bt_selections to authenticated;
create index on public.bt_selections(user_id,bet_id);
create table public.bt_settlements (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null check(length(id) between 1 and 150), payload jsonb not null,
 primary key(user_id,id), check(jsonb_typeof(payload)='object' and payload->>'id'=id),
 check((payload ?& array['id','betId','date','kind','closedStake','returned'] and payload->>'kind' in ('Ganada','Perdida','Cashout') and payload->>'closedStake' ~ '^[0-9]+$' and (payload->>'closedStake')::numeric between 1 and 100000000000 and payload->>'returned' ~ '^[0-9]+$' and (payload->>'returned')::numeric between 0 and 100000000000 and (payload->>'kind' <> 'Perdida' or (payload->>'returned')::bigint=0)) is true),
 bet_id text generated always as (nullif(payload->>'betId','')) stored, foreign key(user_id,bet_id) references public.bt_bets(user_id,id) deferrable initially deferred, unique(user_id,bet_id)
);
alter table public.bt_settlements enable row level security;
create policy own_rows on public.bt_settlements for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.bt_settlements from anon, authenticated;
grant select on public.bt_settlements to authenticated;
create index on public.bt_settlements(user_id,bet_id);
create table public.bt_movements (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null check(length(id) between 1 and 150), payload jsonb not null,
 primary key(user_id,id), check(jsonb_typeof(payload)='object' and payload->>'id'=id),
 check((payload ?& array['id','houseId','date','kind','amount'] and payload->>'amount' ~ '^-?[0-9]+$' and abs((payload->>'amount')::numeric)<=100000000000 and payload->>'kind' in ('Capital inicial','Depósito','Retiro','Apuesta colocada','Apuesta liquidada','Cashout','Ajuste','Transferencia')) is true),
 house_id text generated always as (nullif(payload->>'houseId','')) stored, foreign key(user_id,house_id) references public.bt_houses(user_id,id) deferrable initially deferred,
 bet_id text generated always as (nullif(payload->>'betId','')) stored, foreign key(user_id,bet_id) references public.bt_bets(user_id,id) deferrable initially deferred,
 settlement_id text generated always as (nullif(payload->>'settlementId','')) stored, foreign key(user_id,settlement_id) references public.bt_settlements(user_id,id) deferrable initially deferred
);
alter table public.bt_movements enable row level security;
create policy own_rows on public.bt_movements for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.bt_movements from anon, authenticated;
grant select on public.bt_movements to authenticated;
create index on public.bt_movements(user_id,house_id);
create index on public.bt_movements(user_id,bet_id);
create index on public.bt_movements(user_id,settlement_id);
create table public.bt_settings (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null check(length(id) between 1 and 150), payload jsonb not null,
 primary key(user_id,id), check(jsonb_typeof(payload)='object' and payload->>'id'=id),
 check((id='settings' and payload ?& array['theme','currency','exposureLimit','lossLimit'] and payload->>'theme' in ('light','dark') and payload->>'currency' in ('PEN','USD','EUR') and (payload->>'exposureLimit')::numeric>=0 and (payload->>'lossLimit')::numeric>=0) is true)
);
alter table public.bt_settings enable row level security;
create policy own_rows on public.bt_settings for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.bt_settings from anon, authenticated;
grant select on public.bt_settings to authenticated;
create table public.bt_uploads (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null check(length(id) between 1 and 150), payload jsonb not null,
 primary key(user_id,id), check(jsonb_typeof(payload)='object' and payload->>'id'=id),
 check((payload ?& array['id','imageId','status','createdAt'] and payload->>'status' in ('queued','processing','saved','linked','review','duplicate','error')) is true),
 image_id text generated always as (nullif(payload->>'imageId','')) stored, foreign key(user_id,image_id) references public.bt_images(user_id,id) deferrable initially deferred,
 bet_id text generated always as (nullif(payload->>'betId','')) stored, foreign key(user_id,bet_id) references public.bt_bets(user_id,id) deferrable initially deferred
);
alter table public.bt_uploads enable row level security;
create policy own_rows on public.bt_uploads for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.bt_uploads from anon, authenticated;
grant select on public.bt_uploads to authenticated;
create index on public.bt_uploads(user_id,image_id);
create index on public.bt_uploads(user_id,bet_id);
create table public.bt_audit (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null check(length(id) between 1 and 150), payload jsonb not null,
 primary key(user_id,id), check(jsonb_typeof(payload)='object' and payload->>'id'=id),
 check((payload ?& array['id','date','action','entityId','before','after']) is true)
);
alter table public.bt_audit enable row level security;
create policy own_rows on public.bt_audit for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.bt_audit from anon, authenticated;
grant select on public.bt_audit to authenticated;
create unique index bt_one_initial on public.bt_movements(user_id,house_id) where payload->>'kind'='Capital inicial';
create unique index bt_one_stake on public.bt_movements(user_id,bet_id) where payload->>'kind'='Apuesta colocada';
create unique index bt_one_return on public.bt_movements(user_id,settlement_id) where settlement_id is not null;
create table public.bt_storage_cleanup (user_id uuid not null references auth.users(id) on delete cascade, path text not null, primary key(user_id,path));
alter table public.bt_storage_cleanup enable row level security;
create policy own_cleanup_read on public.bt_storage_cleanup for select to authenticated using ((select auth.uid())=user_id);
create policy own_cleanup_delete on public.bt_storage_cleanup for delete to authenticated using ((select auth.uid())=user_id);
revoke all on public.bt_storage_cleanup from anon,authenticated;
grant select,delete on public.bt_storage_cleanup to authenticated;
create table public.bt_server_audit (id bigint generated always as identity primary key,user_id uuid not null references auth.users(id) on delete cascade, occurred_at timestamptz not null default now(), version bigint not null, changes jsonb not null);
alter table public.bt_server_audit enable row level security;
create policy own_audit on public.bt_server_audit for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.bt_server_audit from anon,authenticated;
grant select on public.bt_server_audit to authenticated;
create index on public.bt_server_audit(user_id,occurred_at);

create function bettrack_private.snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb:='{}'; t text; rows jsonb; rev bigint;
begin
 if uid is null then raise exception 'Inicia sesión'; end if;
 insert into public.bt_accounts(user_id) values(uid) on conflict do nothing;
 select version into rev from public.bt_accounts where user_id=uid for share;
 foreach t in array array['houses','streamers','images','bets','selections','settlements','movements','settings','uploads','audit'] loop
  execute format('select coalesce(jsonb_agg(payload order by id),''[]''::jsonb) from public.%I where user_id=$1','bt_'||t) into rows using uid;
  result:=result||jsonb_build_object(t,rows);
 end loop;
 return jsonb_build_object('version',rev,'records',result);
end $$;
revoke all on function bettrack_private.snapshot() from public,anon;
grant execute on function bettrack_private.snapshot() to authenticated;
create function public.bt_snapshot() returns jsonb language sql security invoker set search_path='' as $$ select bettrack_private.snapshot() $$;
revoke all on function public.bt_snapshot() from public,anon;
grant execute on function public.bt_snapshot() to authenticated;

create function bettrack_private.commit(expected_version bigint,changes jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rev bigint; c jsonb; t text; key text; old_path text;
begin
 if uid is null then raise exception 'Inicia sesión'; end if;
 if jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)>20000 or octet_length(changes::text)>20000000 then raise exception 'Lote inválido o demasiado grande'; end if;
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
 insert into public.bt_server_audit(user_id,version,changes) values(uid,rev+1,changes);
 update public.bt_accounts set version=rev+1 where user_id=uid;
 return rev+1;
end $$;
revoke all on function bettrack_private.commit(bigint,jsonb) from public,anon;
grant execute on function bettrack_private.commit(bigint,jsonb) to authenticated;
create function public.bt_commit(expected_version bigint,changes jsonb) returns bigint language sql security invoker set search_path='' as $$ select bettrack_private.commit(expected_version,changes) $$;
revoke all on function public.bt_commit(bigint,jsonb) from public,anon;
grant execute on function public.bt_commit(bigint,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('bettrack-captures','bettrack-captures',false,15728640,array['image/png','image/jpeg','image/webp']);
create policy bt_capture_read on storage.objects for select to authenticated using(bucket_id='bettrack-captures' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy bt_capture_insert on storage.objects for insert to authenticated with check(bucket_id='bettrack-captures' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy bt_capture_delete on storage.objects for delete to authenticated using(bucket_id='bettrack-captures' and (storage.foldername(name))[1]=(select auth.uid())::text);
alter publication supabase_realtime add table public.bt_accounts;
