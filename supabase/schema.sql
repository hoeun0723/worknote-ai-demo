create extension if not exists vector;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'member' check (role in ('member', 'admin')),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_email text,
  title text not null,
  category text not null,
  tags text[] not null default '{}',
  notion_url text,
  content text not null,
  summary text,
  visibility text not null check (visibility in ('public', 'private')),
  embedding_status text not null default 'pending' check (embedding_status in ('pending', 'ready', 'error', 'skipped')),
  embedding_error text,
  last_embedded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  visibility text not null check (visibility in ('public', 'private')),
  category text not null,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

create index if not exists app_users_approval_status_idx on public.app_users (approval_status);
create index if not exists documents_owner_id_idx on public.documents (owner_id);
create index if not exists documents_visibility_idx on public.documents (visibility);
create index if not exists documents_category_idx on public.documents (category);
create index if not exists document_chunks_document_id_idx on public.document_chunks (document_id);
create index if not exists document_chunks_embedding_idx
on public.document_chunks
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_users (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do update
  set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

insert into public.app_users (user_id, email)
select id, email
from auth.users
on conflict (user_id) do update
set email = excluded.email;

create or replace function public.is_admin_user(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users
    where user_id = check_user_id
      and role = 'admin'
      and approval_status = 'approved'
  );
$$;

create or replace function public.is_approved_user(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users
    where user_id = check_user_id
      and approval_status = 'approved'
  );
$$;

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at
before update on public.app_users
for each row
execute function public.set_updated_at();

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
before update on public.documents
for each row
execute function public.set_updated_at();

alter table public.app_users enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

drop policy if exists "app_users_select_self_or_admin" on public.app_users;
create policy "app_users_select_self_or_admin"
on public.app_users
for select
using (
  user_id = auth.uid()
  or public.is_admin_user()
);

drop policy if exists "app_users_admin_update" on public.app_users;
create policy "app_users_admin_update"
on public.app_users
for update
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "documents_select_visible" on public.documents;
create policy "documents_select_visible"
on public.documents
for select
using (
  public.is_approved_user()
  and (visibility = 'public' or owner_id = auth.uid())
);

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own"
on public.documents
for insert
with check (
  public.is_approved_user()
  and owner_id = auth.uid()
);

drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own"
on public.documents
for update
using (
  public.is_approved_user()
  and owner_id = auth.uid()
)
with check (
  public.is_approved_user()
  and owner_id = auth.uid()
);

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own"
on public.documents
for delete
using (
  public.is_approved_user()
  and owner_id = auth.uid()
);

drop policy if exists "document_chunks_select_visible" on public.document_chunks;
create policy "document_chunks_select_visible"
on public.document_chunks
for select
using (
  public.is_approved_user()
  and exists (
    select 1
    from public.documents d
    where d.id = document_chunks.document_id
      and (d.visibility = 'public' or d.owner_id = auth.uid())
  )
);

drop policy if exists "document_chunks_insert_own" on public.document_chunks;
create policy "document_chunks_insert_own"
on public.document_chunks
for insert
with check (
  public.is_approved_user()
  and owner_id = auth.uid()
);

drop policy if exists "document_chunks_update_own" on public.document_chunks;
create policy "document_chunks_update_own"
on public.document_chunks
for update
using (
  public.is_approved_user()
  and owner_id = auth.uid()
)
with check (
  public.is_approved_user()
  and owner_id = auth.uid()
);

drop policy if exists "document_chunks_delete_own" on public.document_chunks;
create policy "document_chunks_delete_own"
on public.document_chunks
for delete
using (
  public.is_approved_user()
  and owner_id = auth.uid()
);

create or replace function public.match_document_chunks(
  query_embedding vector(1536),
  match_count integer default 8,
  filter_visibility text default 'all',
  filter_category text default null
)
returns table (
  document_id uuid,
  title text,
  category text,
  notion_url text,
  visibility text,
  owner_id uuid,
  summary text,
  chunk_content text,
  score double precision,
  tags text[]
)
language sql
stable
as $$
  select
    d.id as document_id,
    d.title,
    d.category,
    d.notion_url,
    d.visibility,
    d.owner_id,
    d.summary,
    dc.content as chunk_content,
    1 - (dc.embedding <=> query_embedding) as score,
    d.tags
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  where
    public.is_approved_user()
    and (d.visibility = 'public' or d.owner_id = auth.uid())
    and (filter_visibility = 'all' or d.visibility = filter_visibility)
    and (filter_category is null or d.category = filter_category)
  order by dc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
