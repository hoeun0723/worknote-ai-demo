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
  archive_approval_status text not null default 'pending' check (archive_approval_status in ('pending', 'approved', 'rejected')),
  retry_request_count integer not null default 0,
  last_requested_at timestamptz,
  archive_requested_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  archive_approved_by uuid references auth.users(id) on delete set null,
  archive_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_users add column if not exists archive_approval_status text not null default 'pending';
alter table public.app_users add column if not exists retry_request_count integer not null default 0;
alter table public.app_users add column if not exists last_requested_at timestamptz;
alter table public.app_users add column if not exists archive_requested_at timestamptz;
alter table public.app_users add column if not exists archive_approved_by uuid references auth.users(id) on delete set null;
alter table public.app_users add column if not exists archive_approved_at timestamptz;

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

create table if not exists public.account_archives (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_email text,
  title text not null,
  category text not null,
  service_name text,
  login_id text,
  url text,
  ip_address text,
  password_note text,
  notes text,
  tags text[] not null default '{}',
  search_content text not null,
  summary text,
  embedding_status text not null default 'pending' check (embedding_status in ('pending', 'ready', 'error', 'skipped')),
  embedding_error text,
  last_embedded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_archive_chunks (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.account_archives(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

create index if not exists app_users_approval_status_idx on public.app_users (approval_status);
create index if not exists app_users_archive_approval_status_idx on public.app_users (archive_approval_status);
create index if not exists documents_owner_id_idx on public.documents (owner_id);
create index if not exists documents_visibility_idx on public.documents (visibility);
create index if not exists documents_category_idx on public.documents (category);
create index if not exists document_chunks_document_id_idx on public.document_chunks (document_id);
create index if not exists document_chunks_embedding_idx
on public.document_chunks
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);
create index if not exists account_archives_owner_id_idx on public.account_archives (owner_id);
create index if not exists account_archives_category_idx on public.account_archives (category);
create index if not exists account_archive_chunks_archive_id_idx on public.account_archive_chunks (archive_id);
create index if not exists account_archive_chunks_embedding_idx
on public.account_archive_chunks
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

create or replace function public.is_archive_approved_user(check_user_id uuid default auth.uid())
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
      and archive_approval_status = 'approved'
  );
$$;

create or replace function public.request_approval_retry()
returns table (
  ok boolean,
  error_message text,
  retry_request_count integer,
  approval_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.app_users%rowtype;
begin
  if auth.uid() is null then
    return query select false, '로그인이 필요합니다.', 0, 'pending'::text;
    return;
  end if;

  select *
  into current_profile
  from public.app_users
  where user_id = auth.uid();

  if not found then
    return query select false, '사용자 정보를 찾을 수 없습니다.', 0, 'pending'::text;
    return;
  end if;

  if current_profile.approval_status <> 'rejected' then
    return query
    select false, '거절된 계정만 재요청할 수 있습니다.', current_profile.retry_request_count, current_profile.approval_status;
    return;
  end if;

  if current_profile.retry_request_count >= 3 then
    return query
    select false, '재요청은 최대 3번까지 가능합니다.', current_profile.retry_request_count, current_profile.approval_status;
    return;
  end if;

  update public.app_users
  set approval_status = 'pending',
      retry_request_count = current_profile.retry_request_count + 1,
      last_requested_at = now(),
      approved_by = null,
      approved_at = null
  where user_id = auth.uid();

  return query
  select true, null::text, current_profile.retry_request_count + 1, 'pending'::text;
end;
$$;

create or replace function public.request_archive_access()
returns table (
  ok boolean,
  error_message text,
  archive_approval_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.app_users%rowtype;
begin
  if auth.uid() is null then
    return query select false, '로그인이 필요합니다.', 'pending'::text;
    return;
  end if;

  select *
  into current_profile
  from public.app_users
  where user_id = auth.uid();

  if not found then
    return query select false, '사용자 정보를 찾을 수 없습니다.', 'pending'::text;
    return;
  end if;

  if current_profile.approval_status <> 'approved' then
    return query select false, '일반 서비스 승인 후에만 아카이브 접근을 요청할 수 있습니다.', current_profile.archive_approval_status;
    return;
  end if;

  if current_profile.archive_approval_status = 'approved' then
    return query select false, '이미 아카이브 접근 승인이 완료되었습니다.', current_profile.archive_approval_status;
    return;
  end if;

  update public.app_users
  set archive_approval_status = 'pending',
      archive_requested_at = now(),
      archive_approved_by = null,
      archive_approved_at = null
  where user_id = auth.uid();

  return query select true, null::text, 'pending'::text;
end;
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

drop trigger if exists account_archives_set_updated_at on public.account_archives;
create trigger account_archives_set_updated_at
before update on public.account_archives
for each row
execute function public.set_updated_at();

alter table public.app_users enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.account_archives enable row level security;
alter table public.account_archive_chunks enable row level security;

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

drop policy if exists "account_archives_select_approved" on public.account_archives;
create policy "account_archives_select_approved"
on public.account_archives
for select
using (public.is_archive_approved_user());

drop policy if exists "account_archives_insert_approved" on public.account_archives;
create policy "account_archives_insert_approved"
on public.account_archives
for insert
with check (
  public.is_archive_approved_user()
  and owner_id = auth.uid()
);

drop policy if exists "account_archives_update_approved" on public.account_archives;
create policy "account_archives_update_approved"
on public.account_archives
for update
using (
  public.is_archive_approved_user()
  and owner_id = auth.uid()
)
with check (
  public.is_archive_approved_user()
  and owner_id = auth.uid()
);

drop policy if exists "account_archives_delete_approved" on public.account_archives;
create policy "account_archives_delete_approved"
on public.account_archives
for delete
using (
  public.is_archive_approved_user()
  and owner_id = auth.uid()
);

drop policy if exists "account_archive_chunks_select_approved" on public.account_archive_chunks;
create policy "account_archive_chunks_select_approved"
on public.account_archive_chunks
for select
using (public.is_archive_approved_user());

drop policy if exists "account_archive_chunks_insert_approved" on public.account_archive_chunks;
create policy "account_archive_chunks_insert_approved"
on public.account_archive_chunks
for insert
with check (
  public.is_archive_approved_user()
  and owner_id = auth.uid()
);

drop policy if exists "account_archive_chunks_update_approved" on public.account_archive_chunks;
create policy "account_archive_chunks_update_approved"
on public.account_archive_chunks
for update
using (
  public.is_archive_approved_user()
  and owner_id = auth.uid()
)
with check (
  public.is_archive_approved_user()
  and owner_id = auth.uid()
);

drop policy if exists "account_archive_chunks_delete_approved" on public.account_archive_chunks;
create policy "account_archive_chunks_delete_approved"
on public.account_archive_chunks
for delete
using (
  public.is_archive_approved_user()
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

create or replace function public.match_account_archive_chunks(
  query_embedding vector(1536),
  match_count integer default 8,
  filter_category text default null
)
returns table (
  archive_id uuid,
  title text,
  category text,
  service_name text,
  login_id text,
  url text,
  ip_address text,
  summary text,
  chunk_content text,
  score double precision,
  tags text[]
)
language sql
stable
as $$
  select
    a.id as archive_id,
    a.title,
    a.category,
    a.service_name,
    a.login_id,
    a.url,
    a.ip_address,
    a.summary,
    ac.content as chunk_content,
    1 - (ac.embedding <=> query_embedding) as score,
    a.tags
  from public.account_archive_chunks ac
  join public.account_archives a on a.id = ac.archive_id
  where
    public.is_archive_approved_user()
    and (filter_category is null or a.category = filter_category)
  order by ac.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
