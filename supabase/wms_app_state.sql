-- DEPRECATED: naudok wms_shared_state.sql (bendra būsena visiems vartotojams)
-- Senoji versija saugojo duomenis atskirai kiekvienam prisijungusiam vartotojui.

create table if not exists wms_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Nauja bendra lentelė — žr. wms_shared_state.sql
