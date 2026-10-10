-- ============================================================
-- PLANIFY.CH — Schéma Supabase
-- L-GAV / CCNT Hôtellerie-Restauration
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- ─── SITES ──────────────────────────────────────────────────
create table sites (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  color       text default '#58a6ff',
  address     text,
  created_at  timestamptz default now()
);

-- ─── EMPLOYEES ──────────────────────────────────────────────
create table employees (
  id           uuid primary key default uuid_generate_v4(),
  site_id      uuid references sites(id) on delete cascade,
  first_name   text not null,
  last_name    text not null,
  role         text,
  contract_pct integer default 100,  -- pourcentage (80, 100, etc.)
  email        text,
  phone        text,
  active       boolean default true,
  created_at   timestamptz default now()
);

-- ─── SHIFT DEFINITIONS (palette) ────────────────────────────
create table shift_defs (
  id         uuid primary key default uuid_generate_v4(),
  site_id    uuid references sites(id) on delete cascade,
  label      text not null,
  start_time time,           -- null = repos/congé
  end_time   time,
  color      text default '#818cf8',
  is_rest    boolean default false,
  is_leave   boolean default false,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- ─── SHIFTS (assignés) ──────────────────────────────────────
create table shifts (
  id           uuid primary key default uuid_generate_v4(),
  employee_id  uuid references employees(id) on delete cascade,
  site_id      uuid references sites(id) on delete cascade,
  shift_def_id uuid references shift_defs(id) on delete set null,
  work_date    date not null,
  start_time   time,
  end_time     time,
  status       text default 'draft' check (status in ('draft','confirmed','cancelled')),
  note         text,
  created_by   text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (employee_id, work_date)
);

-- ─── CLOCK-INS (pointage) ───────────────────────────────────
create table clockings (
  id            uuid primary key default uuid_generate_v4(),
  employee_id   uuid references employees(id) on delete cascade,
  site_id       uuid references sites(id) on delete cascade,
  clock_in      timestamptz,
  clock_out     timestamptz,
  work_date     date not null,
  duration_min  integer generated always as (
    case when clock_out is not null
    then extract(epoch from (clock_out - clock_in))::integer / 60
    else null end
  ) stored,
  note          text,
  created_at    timestamptz default now()
);

-- ─── WEEK TEMPLATES (plans de travail) ──────────────────────
create table week_templates (
  id          uuid primary key default uuid_generate_v4(),
  site_id     uuid references sites(id) on delete cascade,
  name        text not null,
  created_at  timestamptz default now()
);

create table week_template_slots (
  id               uuid primary key default uuid_generate_v4(),
  template_id      uuid references week_templates(id) on delete cascade,
  employee_index   integer not null,  -- position dans la liste triée des employés
  day_index        integer not null,  -- 0=lundi … 6=dimanche
  shift_def_id     uuid references shift_defs(id) on delete cascade,
  start_time       time,
  end_time         time
);

-- ─── RLS (Row Level Security) ───────────────────────────────
-- Activer RLS sur toutes les tables
alter table sites              enable row level security;
alter table employees          enable row level security;
alter table shift_defs         enable row level security;
alter table shifts             enable row level security;
alter table clockings          enable row level security;
alter table week_templates     enable row level security;
alter table week_template_slots enable row level security;

-- Politique permissive pour commencer (à restreindre par auth plus tard)
create policy "allow_all" on sites              for all using (true) with check (true);
create policy "allow_all" on employees          for all using (true) with check (true);
create policy "allow_all" on shift_defs         for all using (true) with check (true);
create policy "allow_all" on shifts             for all using (true) with check (true);
create policy "allow_all" on clockings          for all using (true) with check (true);
create policy "allow_all" on week_templates     for all using (true) with check (true);
create policy "allow_all" on week_template_slots for all using (true) with check (true);

-- ─── TRIGGER updated_at ─────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger shifts_updated_at
  before update on shifts
  for each row execute function set_updated_at();

-- ─── DONNÉES DE DÉPART ──────────────────────────────────────
-- Sites Inglewood (à adapter)
insert into sites (id, name, color) values
  ('11111111-0000-0000-0000-000000000001', 'Hôtel du Lac',            '#58a6ff'),
  ('11111111-0000-0000-0000-000000000002', 'Restaurant La Terrasse',  '#f59e0b'),
  ('11111111-0000-0000-0000-000000000003', 'Café Central',            '#3fb950');

-- Shift defs par site (même palette pour tous)
insert into shift_defs (site_id, label, start_time, end_time, color, sort_order) values
  ('11111111-0000-0000-0000-000000000001', 'Matin',  '07:00', '15:00', '#f59e0b', 1),
  ('11111111-0000-0000-0000-000000000001', 'Midi',   '10:00', '18:00', '#10b981', 2),
  ('11111111-0000-0000-0000-000000000001', 'Soir',   '16:00', '00:00', '#818cf8', 3),
  ('11111111-0000-0000-0000-000000000001', 'Nuit',   '23:00', '07:00', '#ec4899', 4),
  ('11111111-0000-0000-0000-000000000001', 'Coupé',  '10:00', '14:00', '#fb923c', 5),
  ('11111111-0000-0000-0000-000000000001', 'Repos',  null,    null,    '#374151', 6),
  ('11111111-0000-0000-0000-000000000001', 'Congé',  null,    null,    '#065f46', 7),
  ('11111111-0000-0000-0000-000000000002', 'Matin',  '07:00', '15:00', '#f59e0b', 1),
  ('11111111-0000-0000-0000-000000000002', 'Midi',   '10:00', '18:00', '#10b981', 2),
  ('11111111-0000-0000-0000-000000000002', 'Soir',   '16:00', '00:00', '#818cf8', 3),
  ('11111111-0000-0000-0000-000000000002', 'Coupé',  '10:00', '14:00', '#fb923c', 4),
  ('11111111-0000-0000-0000-000000000002', 'Repos',  null,    null,    '#374151', 5),
  ('11111111-0000-0000-0000-000000000002', 'Congé',  null,    null,    '#065f46', 6),
  ('11111111-0000-0000-0000-000000000003', 'Matin',  '07:00', '15:00', '#f59e0b', 1),
  ('11111111-0000-0000-0000-000000000003', 'Midi',   '10:00', '18:00', '#10b981', 2),
  ('11111111-0000-0000-0000-000000000003', 'Soir',   '16:00', '00:00', '#818cf8', 3),
  ('11111111-0000-0000-0000-000000000003', 'Repos',  null,    null,    '#374151', 4),
  ('11111111-0000-0000-0000-000000000003', 'Congé',  null,    null,    '#065f46', 5);
