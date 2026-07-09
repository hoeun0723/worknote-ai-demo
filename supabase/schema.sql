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

create index if not exists documents_owner_id_idx on public.documents (owner_id);
create index if not exists documents_visibility_idx on public.documents (visibility);
create index if not exists documents_category_idx on public.documents (category);
create index if not exists document_chunks_document_id_idx on public.document_chunks (document_id);
create index if not exists document_chunks_embedding_idx
on public.document_chunks
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
before update on public.documents
for each row
execute function public.set_updated_at();

alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

drop policy if exists "documents_select_visible" on public.documents;
create policy "documents_select_visible"
on public.documents
for select
using (
  visibility = 'public'
  or owner_id = auth.uid()
);

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own"
on public.documents
for insert
with check (
  owner_id = auth.uid()
);

drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own"
on public.documents
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own"
on public.documents
for delete
using (owner_id = auth.uid());

drop policy if exists "document_chunks_select_visible" on public.document_chunks;
create policy "document_chunks_select_visible"
on public.document_chunks
for select
using (
  exists (
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
with check (owner_id = auth.uid());

drop policy if exists "document_chunks_update_own" on public.document_chunks;
create policy "document_chunks_update_own"
on public.document_chunks
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "document_chunks_delete_own" on public.document_chunks;
create policy "document_chunks_delete_own"
on public.document_chunks
for delete
using (owner_id = auth.uid());

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
    (d.visibility = 'public' or d.owner_id = auth.uid())
    and (filter_visibility = 'all' or d.visibility = filter_visibility)
    and (filter_category is null or d.category = filter_category)
  order by dc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
