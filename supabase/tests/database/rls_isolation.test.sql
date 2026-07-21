-- Automated RLS cross-account isolation tests.
--
-- Run with: supabase test db
--
-- For every user-owned table, verifies that a second user can neither read,
-- update, delete, nor impersonate-insert rows owned by the first user, and
-- that the owner can still see their own row. Also verifies the wine_catalog
-- lockdown (public read, no direct client writes) introduced alongside the
-- RLS fixes in this change.
--
-- Everything runs inside a single transaction that is rolled back at the
-- end, so no fixture data is ever persisted to the database.
begin;

create extension if not exists pgtap with schema extensions;

select plan(47);

-- ============================================================
-- Fixtures: two isolated auth users
-- ============================================================
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, recovery_sent_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'authenticated', 'authenticated',
    'rls-test-a@example.com', 'test_disabled',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}',
    now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'authenticated', 'authenticated',
    'rls-test-b@example.com', 'test_disabled',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}', '{}',
    now(), now(),
    '', '', '', ''
  );

-- ============================================================
-- Helpers: switch the current session to behave as a given user
-- (or drop back to an unauthenticated context) for RLS purposes.
-- ============================================================
create or replace function pg_temp.login_as(p_user_id uuid) returns void
language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
end;
$$;

-- ============================================================
-- Fixture data owned by user A (inserted as postgres, which bypasses RLS)
-- ============================================================
insert into public.wines (id, user_id, name, vintage, quantity)
values ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RLS Test Wine A', 2020, 3);

insert into public.occasions (id, user_id, title, start_date, end_date)
values ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RLS Test Occasion A', current_date, current_date);

insert into public.occasion_instances (id, occasion_id, user_id, instance_date)
values ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date);

insert into public.occasion_wine_pool (id, occasion_id, user_id, wine_id)
values ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000000-0000-0000-0000-000000000001');

insert into public.inventory_events (id, wine_id, user_id, type, delta)
values ('a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'purchase', 3);

insert into public.tastings (id, wine_id, user_id, rating, note)
values ('a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5, 'RLS test note');

insert into public.cellar_pockets (id, user_id, name)
values ('a0000000-0000-0000-0000-000000000007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RLS Test Pocket A');

insert into public.ai_cache (id, user_id, provider, model, cache_key, response)
values ('a0000000-0000-0000-0000-000000000008', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test', 'test-model', 'rls-test-key', '{}'::jsonb);

-- user_settings rows are auto-created by the on_auth_user_created trigger
-- for both fixture users, so no manual insert is needed here.

-- ============================================================
-- wines
-- ============================================================
select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is((select count(*)::int from public.wines where id = 'a0000000-0000-0000-0000-000000000001'), 1, 'wines: owner can select their own wine');

select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is((select count(*)::int from public.wines where id = 'a0000000-0000-0000-0000-000000000001'), 0, 'wines: other user cannot select the wine');

savepoint sp_wines_update;
with upd as (
  update public.wines set quantity = 999 where id = 'a0000000-0000-0000-0000-000000000001' returning id
)
select is((select count(*)::int from upd), 0, 'wines: other user cannot update the wine');
rollback to savepoint sp_wines_update;

savepoint sp_wines_delete;
with del as (
  delete from public.wines where id = 'a0000000-0000-0000-0000-000000000001' returning id
)
select is((select count(*)::int from del), 0, 'wines: other user cannot delete the wine');
rollback to savepoint sp_wines_delete;

select throws_ok(
  $$insert into public.wines (id, user_id, name) values ('a0000000-0000-0000-0000-000000000099', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Impersonated wine')$$,
  '42501',
  'wines: other user cannot insert a wine impersonating the owner'
);

-- ============================================================
-- occasions
-- ============================================================
select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is((select count(*)::int from public.occasions where id = 'a0000000-0000-0000-0000-000000000002'), 1, 'occasions: owner can select their own occasion');

select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is((select count(*)::int from public.occasions where id = 'a0000000-0000-0000-0000-000000000002'), 0, 'occasions: other user cannot select the occasion');

savepoint sp_occasions_update;
with upd as (
  update public.occasions set title = 'hijacked' where id = 'a0000000-0000-0000-0000-000000000002' returning id
)
select is((select count(*)::int from upd), 0, 'occasions: other user cannot update the occasion');
rollback to savepoint sp_occasions_update;

savepoint sp_occasions_delete;
with del as (
  delete from public.occasions where id = 'a0000000-0000-0000-0000-000000000002' returning id
)
select is((select count(*)::int from del), 0, 'occasions: other user cannot delete the occasion');
rollback to savepoint sp_occasions_delete;

select throws_ok(
  $$insert into public.occasions (id, user_id, title, start_date, end_date) values ('a0000000-0000-0000-0000-000000000098', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Impersonated occasion', current_date, current_date)$$,
  '42501',
  'occasions: other user cannot insert an occasion impersonating the owner'
);

-- ============================================================
-- occasion_instances
-- ============================================================
select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is((select count(*)::int from public.occasion_instances where id = 'a0000000-0000-0000-0000-000000000003'), 1, 'occasion_instances: owner can select their own instance');

select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is((select count(*)::int from public.occasion_instances where id = 'a0000000-0000-0000-0000-000000000003'), 0, 'occasion_instances: other user cannot select the instance');

savepoint sp_instances_update;
with upd as (
  update public.occasion_instances set status = 'cancelled' where id = 'a0000000-0000-0000-0000-000000000003' returning id
)
select is((select count(*)::int from upd), 0, 'occasion_instances: other user cannot update the instance');
rollback to savepoint sp_instances_update;

savepoint sp_instances_delete;
with del as (
  delete from public.occasion_instances where id = 'a0000000-0000-0000-0000-000000000003' returning id
)
select is((select count(*)::int from del), 0, 'occasion_instances: other user cannot delete the instance');
rollback to savepoint sp_instances_delete;

select throws_ok(
  $$insert into public.occasion_instances (id, occasion_id, user_id, instance_date) values ('a0000000-0000-0000-0000-000000000097', 'a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date + 1)$$,
  '42501',
  'occasion_instances: other user cannot insert an instance impersonating the owner'
);

-- ============================================================
-- occasion_wine_pool
-- ============================================================
select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is((select count(*)::int from public.occasion_wine_pool where id = 'a0000000-0000-0000-0000-000000000004'), 1, 'occasion_wine_pool: owner can select their own pool entry');

select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is((select count(*)::int from public.occasion_wine_pool where id = 'a0000000-0000-0000-0000-000000000004'), 0, 'occasion_wine_pool: other user cannot select the pool entry');

savepoint sp_pool_update;
with upd as (
  update public.occasion_wine_pool set priority = 'high' where id = 'a0000000-0000-0000-0000-000000000004' returning id
)
select is((select count(*)::int from upd), 0, 'occasion_wine_pool: other user cannot update the pool entry');
rollback to savepoint sp_pool_update;

savepoint sp_pool_delete;
with del as (
  delete from public.occasion_wine_pool where id = 'a0000000-0000-0000-0000-000000000004' returning id
)
select is((select count(*)::int from del), 0, 'occasion_wine_pool: other user cannot delete the pool entry');
rollback to savepoint sp_pool_delete;

select throws_ok(
  $$insert into public.occasion_wine_pool (id, occasion_id, user_id, wine_id) values ('a0000000-0000-0000-0000-000000000096', 'a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000000-0000-0000-0000-000000000001')$$,
  '42501',
  'occasion_wine_pool: other user cannot insert a pool entry impersonating the owner'
);

-- ============================================================
-- inventory_events
-- ============================================================
select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is((select count(*)::int from public.inventory_events where id = 'a0000000-0000-0000-0000-000000000005'), 1, 'inventory_events: owner can select their own event');

select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is((select count(*)::int from public.inventory_events where id = 'a0000000-0000-0000-0000-000000000005'), 0, 'inventory_events: other user cannot select the event');

savepoint sp_events_update;
with upd as (
  update public.inventory_events set note = 'hijacked' where id = 'a0000000-0000-0000-0000-000000000005' returning id
)
select is((select count(*)::int from upd), 0, 'inventory_events: other user cannot update the event');
rollback to savepoint sp_events_update;

savepoint sp_events_delete;
with del as (
  delete from public.inventory_events where id = 'a0000000-0000-0000-0000-000000000005' returning id
)
select is((select count(*)::int from del), 0, 'inventory_events: other user cannot delete the event');
rollback to savepoint sp_events_delete;

select throws_ok(
  $$insert into public.inventory_events (id, wine_id, user_id, type, delta) values ('a0000000-0000-0000-0000-000000000095', 'a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'adjustment', 1)$$,
  '42501',
  'inventory_events: other user cannot insert an event impersonating the owner'
);

-- ============================================================
-- tastings
-- ============================================================
select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is((select count(*)::int from public.tastings where id = 'a0000000-0000-0000-0000-000000000006'), 1, 'tastings: owner can select their own tasting');

select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is((select count(*)::int from public.tastings where id = 'a0000000-0000-0000-0000-000000000006'), 0, 'tastings: other user cannot select the tasting');

savepoint sp_tastings_update;
with upd as (
  update public.tastings set note = 'hijacked' where id = 'a0000000-0000-0000-0000-000000000006' returning id
)
select is((select count(*)::int from upd), 0, 'tastings: other user cannot update the tasting');
rollback to savepoint sp_tastings_update;

savepoint sp_tastings_delete;
with del as (
  delete from public.tastings where id = 'a0000000-0000-0000-0000-000000000006' returning id
)
select is((select count(*)::int from del), 0, 'tastings: other user cannot delete the tasting');
rollback to savepoint sp_tastings_delete;

select throws_ok(
  $$insert into public.tastings (id, wine_id, user_id, rating, note) values ('a0000000-0000-0000-0000-000000000094', 'a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4, 'impersonated')$$,
  '42501',
  'tastings: other user cannot insert a tasting impersonating the owner'
);

-- ============================================================
-- cellar_pockets
-- ============================================================
select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is((select count(*)::int from public.cellar_pockets where id = 'a0000000-0000-0000-0000-000000000007'), 1, 'cellar_pockets: owner can select their own pocket');

select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is((select count(*)::int from public.cellar_pockets where id = 'a0000000-0000-0000-0000-000000000007'), 0, 'cellar_pockets: other user cannot select the pocket');

savepoint sp_pockets_update;
with upd as (
  update public.cellar_pockets set name = 'hijacked' where id = 'a0000000-0000-0000-0000-000000000007' returning id
)
select is((select count(*)::int from upd), 0, 'cellar_pockets: other user cannot update the pocket');
rollback to savepoint sp_pockets_update;

savepoint sp_pockets_delete;
with del as (
  delete from public.cellar_pockets where id = 'a0000000-0000-0000-0000-000000000007' returning id
)
select is((select count(*)::int from del), 0, 'cellar_pockets: other user cannot delete the pocket');
rollback to savepoint sp_pockets_delete;

select throws_ok(
  $$insert into public.cellar_pockets (id, user_id, name) values ('a0000000-0000-0000-0000-000000000093', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Impersonated pocket')$$,
  '42501',
  'cellar_pockets: other user cannot insert a pocket impersonating the owner'
);

-- ============================================================
-- ai_cache
-- ============================================================
select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is((select count(*)::int from public.ai_cache where id = 'a0000000-0000-0000-0000-000000000008'), 1, 'ai_cache: owner can select their own cache entry');

select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is((select count(*)::int from public.ai_cache where id = 'a0000000-0000-0000-0000-000000000008'), 0, 'ai_cache: other user cannot select the cache entry');

savepoint sp_cache_update;
with upd as (
  update public.ai_cache set response = '{"hijacked":true}'::jsonb where id = 'a0000000-0000-0000-0000-000000000008' returning id
)
select is((select count(*)::int from upd), 0, 'ai_cache: other user cannot update the cache entry');
rollback to savepoint sp_cache_update;

savepoint sp_cache_delete;
with del as (
  delete from public.ai_cache where id = 'a0000000-0000-0000-0000-000000000008' returning id
)
select is((select count(*)::int from del), 0, 'ai_cache: other user cannot delete the cache entry');
rollback to savepoint sp_cache_delete;

select throws_ok(
  $$insert into public.ai_cache (id, user_id, provider, model, cache_key, response) values ('a0000000-0000-0000-0000-000000000092', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test', 'test-model', 'impersonated-key', '{}'::jsonb)$$,
  '42501',
  'ai_cache: other user cannot insert a cache entry impersonating the owner'
);

-- ============================================================
-- user_settings (rows auto-created by the on_auth_user_created trigger)
-- ============================================================
select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is((select count(*)::int from public.user_settings where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1, 'user_settings: owner can select their own settings');

select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is((select count(*)::int from public.user_settings where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'user_settings: other user cannot select the settings');

savepoint sp_settings_update;
with upd as (
  update public.user_settings set currency = 'USD' where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning user_id
)
select is((select count(*)::int from upd), 0, 'user_settings: other user cannot update the settings');
rollback to savepoint sp_settings_update;

savepoint sp_settings_delete;
with del as (
  delete from public.user_settings where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning user_id
)
select is((select count(*)::int from del), 0, 'user_settings: other user cannot delete the settings');
rollback to savepoint sp_settings_delete;

-- ============================================================
-- wine_catalog: public read, but no direct client writes (locked down
-- alongside this change; the catalog is kept in sync by a SECURITY
-- DEFINER trigger on public.wines instead, see
-- 20260213000028_lock_down_wine_catalog_writes.sql).
-- ============================================================
select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select ok(
  (select count(*)::int from public.wine_catalog where name = 'RLS Test Wine A') >= 1,
  'wine_catalog: any authenticated user can read catalog entries synced from another user''s wine'
);

select throws_ok(
  $$insert into public.wine_catalog (canonical_key, name) values ('rls-test-impersonated-catalog-entry', 'Impersonated catalog entry')$$,
  '42501',
  'wine_catalog: authenticated user cannot directly insert a catalog entry'
);

savepoint sp_catalog_update;
with upd as (
  update public.wine_catalog set name = 'hijacked' where name = 'RLS Test Wine A' returning id
)
select is((select count(*)::int from upd), 0, 'wine_catalog: authenticated user cannot directly update a catalog entry');
rollback to savepoint sp_catalog_update;

select * from finish();
rollback;
