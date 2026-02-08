
# Wine Time Capsule 2044 - Grand Cru Vault

Premium-Kellerverwaltung mit Fokus auf Werterhalt, Portfolio-Analyse und Multi-User Sicherheit.

## 🚀 Setup-Anleitung (Produktion)

### 1. Supabase Backend konfigurieren
Erstellen Sie ein neues Projekt auf [Supabase](https://supabase.com) und führen Sie folgendes SQL im SQL-Editor aus:

```sql
-- TABELLEN ERSTELLEN
create table wines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  vintage integer,
  region text,
  category text check (category in ('Genuss', 'Investment', 'Rarität', 'Daily Drinker')),
  wine_type text,
  quantity integer default 0,
  purchase_price decimal,
  market_price decimal,
  format text,
  drink_start integer,
  drink_end integer,
  peak_year integer,
  wishlist boolean default false,
  
  -- Identität
  producer text,
  appellation text,
  subregion text,
  vineyard text,
  country text,
  alcohol_percent decimal,
  
  -- Vinifikation & Technik
  closure_type text,
  aging_process text,
  farming text,
  harvest text,
  fermentation text,
  maturation_profile text,
  
  -- KI-Datenstrukturen (JSONB für maximale Flexibilität)
  grapes jsonb default '[]'::jsonb,
  aromas jsonb default '[]'::jsonb,
  structure jsonb default '{}'::jsonb,
  pairings jsonb default '[]'::jsonb,
  scores jsonb default '[]'::jsonb,
  
  -- KI-Meta & Evidence Aggregation
  evidence jsonb default '{}'::jsonb,
  confidence text,
  missing_fields text[],
  is_favorite boolean default false,
  
  -- Soft Delete
  deleted_at timestamp with time zone,
  deleted_reason text,
  deleted_by uuid,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table tastings (
  id uuid primary key default gen_random_uuid(),
  wine_id uuid references wines on delete cascade,
  user_id uuid references auth.users not null,
  date timestamp with time zone default now(),
  rating integer check (rating >= 1 and rating <= 5),
  note text
);

create table occasions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  date date not null,
  wine_id uuid references wines on delete set null,
  created_at timestamp with time zone default now()
);

create table inventory_events (
  id uuid primary key default gen_random_uuid(),
  wine_id uuid references wines on delete cascade,
  user_id uuid references auth.users not null,
  type text not null,
  delta integer not null,
  source text,
  timestamp timestamp with time zone default now()
);

create table purchase_lots (
  id uuid primary key default gen_random_uuid(),
  wine_id uuid references wines on delete cascade,
  user_id uuid references auth.users not null,
  quantity integer not null,
  price_per_bottle decimal not null,
  date date default now(),
  merchant text,
  note text
);

-- ROW LEVEL SECURITY (RLS) AKTIVIEREN
alter table wines enable row level security;
alter table tastings enable row level security;
alter table occasions enable row level security;
alter table inventory_events enable row level security;
alter table purchase_lots enable row level security;

-- POLICIES ERSTELLEN
create policy "Users can see own wines" on wines for select using (auth.uid() = user_id);
create policy "Users can insert own wines" on wines for insert with check (auth.uid() = user_id);
create policy "Users can update own wines" on wines for update using (auth.uid() = user_id);
create policy "Users can delete own wines" on wines for delete using (auth.uid() = user_id);

create policy "User all access tastings" on tastings for all using (auth.uid() = user_id);
create policy "User all access occasions" on occasions for all using (auth.uid() = user_id);
create policy "User all access events" on inventory_events for all using (auth.uid() = user_id);
create policy "User all access lots" on purchase_lots for all using (auth.uid() = user_id);
```

### 2. Migration für bestehende Datenbanken
Falls Sie bereits Daten haben, führen Sie dies aus, um die Tabellen zu aktualisieren:

```sql
ALTER TABLE wines 
ADD COLUMN IF NOT EXISTS evidence jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS confidence text,
ADD COLUMN IF NOT EXISTS missing_fields text[];

NOTIFY pgrst, 'reload schema';
```
