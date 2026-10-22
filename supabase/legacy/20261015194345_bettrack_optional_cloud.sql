-- Optional foundation only. No local application connection is enabled.
-- Authenticated clients are read-only until atomic financial RPCs are implemented.
begin;
create table public.bettrack_houses (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null, name text not null check(length(trim(name)) between 1 and 100),
 currency text not null check(currency in ('PEN','USD','EUR')), active boolean not null default true,
 notes text not null default '', updated_at timestamptz not null default now(), revision bigint not null default 1,
 primary key(user_id,id)
);
create table public.bettrack_streamers (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null, name text not null, platform text not null default '', channel text not null default '',
 url text not null default '', notes text not null default '', active boolean not null default true,
 updated_at timestamptz not null default now(), revision bigint not null default 1,
 primary key(user_id,id)
);
create table public.bettrack_bets (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null, house_id text not null, streamer_id text,
 placed_at timestamptz not null, kind text not null check(kind in ('Simple','Doble','Triple','Combinada','Bet Builder')),
 live boolean not null default false, odds numeric(14,6) not null check(odds>=1),
 stake_cents bigint not null check(stake_cents>0 and stake_cents<=100000000000),
 potential_cents bigint not null check(potential_cents>=0),
 source text not null check(source in ('manual','ocr','import')), fingerprint text not null,
 notes text not null default '', created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), revision bigint not null default 1,
 primary key(user_id,id),
 foreign key(user_id,house_id) references public.bettrack_houses(user_id,id),
 foreign key(user_id,streamer_id) references public.bettrack_streamers(user_id,id)
);
create table public.bettrack_selections (
 user_id uuid not null, id text not null, bet_id text not null,
 event text not null, sport text not null default '', league text not null default '',
 market text not null, pick text not null, odds numeric(14,6) check(odds>=1),
 primary key(user_id,id), foreign key(user_id,bet_id) references public.bettrack_bets(user_id,id) on delete cascade
);
create table public.bettrack_settlements (
 user_id uuid not null, id text not null, bet_id text not null,
 settled_at timestamptz not null, closed_stake_cents bigint not null check(closed_stake_cents>0),
 returned_cents bigint not null check(returned_cents>=0),
 kind text not null check(kind in ('Ganada','Perdida','Cashout','Anulada','Parcial')), note text not null default '',
 primary key(user_id,id), foreign key(user_id,bet_id) references public.bettrack_bets(user_id,id),
 check(kind<>'Anulada' or returned_cents=closed_stake_cents),check(kind<>'Perdida' or returned_cents=0)
);
create table public.bettrack_movements (
 user_id uuid not null, id text not null, house_id text not null, bet_id text, settlement_id text, transfer_id text,
 occurred_at timestamptz not null, kind text not null check(kind in ('Capital inicial','Depósito','Retiro','Apuesta colocada','Apuesta liquidada','Cashout','Reembolso','Ajuste','Transferencia')),
 amount_cents bigint not null, note text not null default '', primary key(user_id,id),
 foreign key(user_id,house_id) references public.bettrack_houses(user_id,id),
 foreign key(user_id,bet_id) references public.bettrack_bets(user_id,id),
 foreign key(user_id,settlement_id) references public.bettrack_settlements(user_id,id),
 check(kind<>'Ajuste' or length(trim(note))>0)
);
create table public.bettrack_images (
 user_id uuid not null, id text not null, bet_id text not null, sha256 text not null check(length(sha256)=64),
 object_path text not null, original_name text not null, primary key(user_id,id),
 foreign key(user_id,bet_id) references public.bettrack_bets(user_id,id) on delete cascade,
 check(object_path like user_id::text||'/%')
);
create table public.bettrack_audit (
 user_id uuid not null references auth.users(id) on delete cascade, id text not null,
 occurred_at timestamptz not null default now(), action text not null, entity_id text not null,
 before_data jsonb, after_data jsonb, primary key(user_id,id)
);
create index on public.bettrack_bets(user_id,placed_at);
create index on public.bettrack_bets(user_id,fingerprint);
create index on public.bettrack_selections(user_id,bet_id);
create index on public.bettrack_settlements(user_id,bet_id);
create index on public.bettrack_movements(user_id,house_id,occurred_at);
do $$ declare t text; begin
 foreach t in array array['bettrack_houses','bettrack_streamers','bettrack_bets','bettrack_selections','bettrack_settlements','bettrack_movements','bettrack_images','bettrack_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid()) = user_id)',t);
 end loop;
end $$;
-- Intentionally no Storage bucket, write grants, RPCs or Realtime publication yet.
-- Before activation: implement locked atomic commands + owner-only private Storage policies,
-- version-based conflict resolution and test against two real Supabase Auth users.
commit;
