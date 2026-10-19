-- Every table in public must have row-level security enabled. Passes trivially until the first
-- table exists, then catches any migration that forgets `alter table ... enable row level security`.
begin;

create extension if not exists pgtap with schema extensions;

select plan(1);

select is_empty(
  $$
    select c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  $$,
  'every table in public has row-level security enabled'
);

select * from finish();

rollback;
