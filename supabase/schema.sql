-- =====================================================================
-- Point Pneus Guerido : base de données de la prise de rendez-vous.
-- À coller une fois dans Supabase > SQL Editor > New query > Run.
-- =====================================================================

-- ---------- Tables ----------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  status text not null default 'en_attente'
    check (status in ('en_attente', 'confirme', 'annule', 'termine')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  services jsonb not null,
  vehicle jsonb,
  plate text,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  note text,
  estimated_total numeric,
  check (end_at > start_at)
);
create index if not exists bookings_start_idx on public.bookings (start_at);
create index if not exists bookings_user_idx on public.bookings (user_id);

create table if not exists public.blocked_slots (
  id uuid primary key default gen_random_uuid(),
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text,
  check (end_at > start_at)
);

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- Une seule ligne de réglages : nombre de voitures prises en même temps.
create table if not exists public.garage_settings (
  id int primary key default 1 check (id = 1),
  capacity int not null default 2 check (capacity between 1 and 10)
);
insert into public.garage_settings (id, capacity) values (1, 2) on conflict (id) do nothing;

-- Cache des recherches de plaque (la plaque est stockée hachée) et limite anti-abus.
create table if not exists public.plate_cache (
  plate_hash text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);
create table if not exists public.plate_lookups (
  id bigserial primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists plate_lookups_ip_idx on public.plate_lookups (ip_hash, created_at);

-- ---------- Sécurité : personne ne lit ni n'écrit directement, sauf règles ci-dessous ----------
alter table public.bookings enable row level security;
alter table public.blocked_slots enable row level security;
alter table public.admins enable row level security;
alter table public.garage_settings enable row level security;
alter table public.plate_cache enable row level security;
alter table public.plate_lookups enable row level security;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

drop policy if exists "client voit ses rdv, garage voit tout" on public.bookings;
create policy "client voit ses rdv, garage voit tout" on public.bookings
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "garage modifie les rdv" on public.bookings;
create policy "garage modifie les rdv" on public.bookings
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "garage gère les blocages" on public.blocked_slots;
create policy "garage gère les blocages" on public.blocked_slots
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "chacun voit s'il est admin" on public.admins;
create policy "chacun voit s'il est admin" on public.admins
  for select using (user_id = auth.uid());

drop policy if exists "garage lit les réglages" on public.garage_settings;
create policy "garage lit les réglages" on public.garage_settings
  for select using (public.is_admin());
drop policy if exists "garage change les réglages" on public.garage_settings;
create policy "garage change les réglages" on public.garage_settings
  for update using (public.is_admin()) with check (public.is_admin());
-- plate_cache et plate_lookups : aucune règle, seule la fonction serveur (clé service_role) y accède.

-- ---------- Créneaux occupés (sans aucune donnée personnelle) ----------
create or replace function public.get_busy(from_ts timestamptz, to_ts timestamptz)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'capacity', (select capacity from public.garage_settings where id = 1),
    'busy', coalesce((
      select jsonb_agg(x) from (
        select start_at, end_at, 'booking' as kind from public.bookings
         where status in ('en_attente', 'confirme')
           and start_at < least(to_ts, from_ts + interval '45 days') and end_at > from_ts
        union all
        select start_at, end_at, 'blocked' from public.blocked_slots
         where start_at < least(to_ts, from_ts + interval '45 days') and end_at > from_ts
      ) x), '[]'::jsonb)
  )
$$;

-- ---------- Création d'un rendez-vous, avec toutes les vérifications côté serveur ----------
create or replace function public.create_booking(
  p_start timestamptz, p_minutes int, p_services jsonb, p_vehicle jsonb, p_plate text,
  p_name text, p_phone text, p_email text, p_note text, p_total numeric
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_end timestamptz := p_start + make_interval(mins => p_minutes);
  v_local timestamp := p_start at time zone 'Europe/Paris';
  v_local_end timestamp := v_end at time zone 'Europe/Paris';
  v_capacity int;
  v_used int;
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_id uuid;
begin
  if p_minutes is null or p_minutes < 15 or p_minutes > 240 then raise exception 'duree_invalide'; end if;
  if p_start < now() + interval '30 minutes' or p_start > now() + interval '60 days' then raise exception 'creneau_indisponible'; end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 100 then raise exception 'nom_invalide'; end if;
  if length(v_digits) not between 10 and 15 then raise exception 'telephone_invalide'; end if;
  if p_email is not null and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then raise exception 'email_invalide'; end if;
  if jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) not between 1 and 10 then raise exception 'prestations_invalides'; end if;
  if length(coalesce(p_note, '')) > 1000 or length(p_services::text) > 8000 or length(coalesce(p_vehicle::text, '')) > 2000 then raise exception 'trop_long'; end if;

  -- Horaires : lundi à vendredi, 8 h à 12 h et 14 h à 18 h 30, sans déborder sur la pause.
  if extract(isodow from v_local) > 5 or v_local::date <> v_local_end::date then raise exception 'creneau_indisponible'; end if;
  if not ((v_local::time >= '08:00' and v_local_end::time <= '12:00')
       or (v_local::time >= '14:00' and v_local_end::time <= '18:30')) then
    raise exception 'creneau_indisponible';
  end if;

  -- Une réservation à la fois pour éviter deux clients sur le même créneau.
  perform pg_advisory_xact_lock(hashtext('point-pneus-bookings'));

  if exists (select 1 from public.blocked_slots where start_at < v_end and end_at > p_start) then
    raise exception 'creneau_indisponible';
  end if;

  select capacity into v_capacity from public.garage_settings where id = 1;
  select count(*) into v_used from public.bookings
   where status in ('en_attente', 'confirme') and start_at < v_end and end_at > p_start;
  if v_used >= coalesce(v_capacity, 1) then raise exception 'creneau_indisponible'; end if;

  -- Anti-spam : pas plus de 20 réservations en 10 minutes, tous numéros confondus.
  if (select count(*) from public.bookings where created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'trop_de_rdv';
  end if;

  -- Anti-abus : 3 rendez-vous à venir maximum par numéro de téléphone.
  if (select count(*) from public.bookings
       where regexp_replace(customer_phone, '\D', '', 'g') = v_digits
         and status in ('en_attente', 'confirme') and start_at > now()) >= 3 then
    raise exception 'trop_de_rdv';
  end if;

  insert into public.bookings (user_id, start_at, end_at, services, vehicle, plate,
                               customer_name, customer_phone, customer_email, note, estimated_total)
  values (auth.uid(), p_start, v_end, p_services, p_vehicle, nullif(trim(p_plate), ''),
          trim(p_name), trim(p_phone), nullif(trim(p_email), ''), nullif(trim(p_note), ''), p_total)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------- Annulation par le client (jusqu'à 2 h avant) ----------
create or replace function public.cancel_booking(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.bookings set status = 'annule'
   where id = p_id and user_id = auth.uid()
     and status in ('en_attente', 'confirme')
     and start_at > now() + interval '2 hours';
  if not found then raise exception 'annulation_impossible'; end if;
end;
$$;

-- ---------- Demandes de devis (formulaire de la page d'accueil) ----------
create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'nouveau' check (status in ('nouveau', 'traite')),
  kind text not null check (kind in ('pneus', 'mecanique')),
  details jsonb not null,
  customer_name text not null,
  customer_phone text not null
);
create index if not exists quote_requests_created_idx on public.quote_requests (created_at desc);
alter table public.quote_requests enable row level security;

drop policy if exists "garage lit les devis" on public.quote_requests;
create policy "garage lit les devis" on public.quote_requests
  for select using (public.is_admin());
drop policy if exists "garage traite les devis" on public.quote_requests;
create policy "garage traite les devis" on public.quote_requests
  for update using (public.is_admin()) with check (public.is_admin());

create or replace function public.create_quote_request(p_kind text, p_details jsonb, p_name text, p_phone text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_id uuid;
begin
  if p_kind not in ('pneus', 'mecanique') then raise exception 'type_invalide'; end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 100 then raise exception 'nom_invalide'; end if;
  if length(v_digits) not between 10 and 15 then raise exception 'telephone_invalide'; end if;
  if jsonb_typeof(p_details) <> 'object' or length(p_details::text) > 3000 then raise exception 'details_invalides'; end if;
  -- Anti-spam : pas plus de 20 demandes en 10 minutes, tous numéros confondus.
  if (select count(*) from public.quote_requests where created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'trop_de_demandes';
  end if;
  -- Anti-abus : 5 demandes par numéro et par jour.
  if (select count(*) from public.quote_requests
       where regexp_replace(customer_phone, '\D', '', 'g') = v_digits
         and created_at > now() - interval '1 day') >= 5 then
    raise exception 'trop_de_demandes';
  end if;
  insert into public.quote_requests (kind, details, customer_name, customer_phone)
  values (p_kind, p_details, trim(p_name), trim(p_phone))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_quote_request(text, jsonb, text, text) from public;
grant execute on function public.create_quote_request(text, jsonb, text, text) to anon, authenticated;

-- ---------- Mesure d'audience (visiteurs ayant accepté), anonyme : ni IP, ni cookie, ni identifiant ----------
create table if not exists public.site_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('visite', 'page', 'plaque', 'panier', 'appel', 'itineraire', 'rdv')),
  path text,
  source text,
  device text check (device in ('mobile', 'tablette', 'ordinateur'))
);
create index if not exists site_events_created_idx on public.site_events (created_at);
alter table public.site_events enable row level security;
-- Aucune règle : personne ne lit la table directement, tout passe par les deux fonctions ci-dessous.

create or replace function public.track_event(p_kind text, p_path text, p_source text, p_device text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_kind not in ('visite', 'page', 'plaque', 'panier', 'appel', 'itineraire', 'rdv') then return; end if;
  if p_device not in ('mobile', 'tablette', 'ordinateur') then return; end if;
  -- Anti-abus : au-delà de 300 événements par minute, tout le site confondu, on n'enregistre plus.
  if (select count(*) from public.site_events where created_at > now() - interval '1 minute') >= 300 then return; end if;
  insert into public.site_events (kind, path, source, device)
  values (p_kind, left(coalesce(p_path, '/'), 80), left(p_source, 40), p_device);
end;
$$;
revoke all on function public.track_event(text, text, text, text) from public;
grant execute on function public.track_event(text, text, text, text) to anon, authenticated;

-- Lecture réservée au garage, déjà regroupée par jour.
create or replace function public.admin_events(p_days int)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'acces_refuse'; end if;
  return coalesce((
    select jsonb_agg(x) from (
      select to_char(created_at at time zone 'Europe/Paris', 'YYYY-MM-DD') as d, kind, path, source, device, count(*) as n
        from public.site_events
       where created_at > now() - make_interval(days => least(p_days, 400))
       group by 1, 2, 3, 4, 5
    ) x), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_events(int) from public;
grant execute on function public.admin_events(int) to authenticated;

-- ---------- Boutique : les produits gérés depuis l'espace gérant ----------
create table if not exists public.products (
  id text primary key,
  position int not null default 0,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.products enable row level security;
drop policy if exists "tout le monde voit la boutique" on public.products;
create policy "tout le monde voit la boutique" on public.products for select using (true);
drop policy if exists "garage gère la boutique" on public.products;
create policy "garage gère la boutique" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Qamar : les demandes du gérant aux développeurs ----------
create table if not exists public.dev_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'recue' check (status in ('recue', 'en_cours', 'terminee')),
  kind text not null check (kind in ('demande', 'amelioration', 'probleme')),
  priority text not null check (priority in ('basse', 'normale', 'haute', 'urgente')),
  page text not null check (length(page) <= 60),
  description text not null check (length(description) between 8 and 4000),
  attachment jsonb check (attachment is null or pg_column_size(attachment) < 3000000)
);
create index if not exists dev_requests_created_idx on public.dev_requests (created_at desc);
alter table public.dev_requests enable row level security;
drop policy if exists "garage lit ses demandes" on public.dev_requests;
create policy "garage lit ses demandes" on public.dev_requests for select using (public.is_admin());
drop policy if exists "garage envoie ses demandes" on public.dev_requests;
create policy "garage envoie ses demandes" on public.dev_requests for insert with check (public.is_admin() and status = 'recue');
-- Le statut (recue, en_cours, terminee) est changé par les développeurs depuis Supabase > Table Editor.

-- ---------- Effacement automatique (durées annoncées sur la page « Vos données ») ----------
create or replace function public.purge_old_data()
returns void
language plpgsql security definer set search_path = public, auth
as $$
begin
  delete from public.quote_requests where created_at < now() - interval '1 year';
  delete from public.bookings where start_at < now() - interval '3 years';
  delete from public.plate_cache where fetched_at < now() - interval '90 days';
  delete from public.plate_lookups where created_at < now() - interval '1 day';
  delete from public.site_events where created_at < now() - interval '13 months';
  delete from auth.users
   where coalesce(last_sign_in_at, created_at) < now() - interval '3 years'
     and id not in (select user_id from public.admins);
end;
$$;
revoke all on function public.purge_old_data() from public, anon, authenticated;

-- Tous les jours à 3 h du matin (extension pg_cron, incluse dans Supabase).
create extension if not exists pg_cron;
select cron.unschedule('purge-donnees') where exists (select 1 from cron.job where jobname = 'purge-donnees');
select cron.schedule('purge-donnees', '0 3 * * *', 'select public.purge_old_data()');

-- ---------- Droits d'appel ----------
revoke all on function public.create_booking(timestamptz, int, jsonb, jsonb, text, text, text, text, text, numeric) from public;
revoke all on function public.cancel_booking(uuid) from public;
revoke all on function public.get_busy(timestamptz, timestamptz) from public;
grant execute on function public.create_booking(timestamptz, int, jsonb, jsonb, text, text, text, text, text, numeric) to anon, authenticated;
grant execute on function public.get_busy(timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------- Pour donner l'accès « garage » à un compte (après sa première connexion) ----------
-- insert into public.admins (user_id)
--   select id from auth.users where email = 'pointpneusguerido@free.fr';
