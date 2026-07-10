import { NextResponse } from "next/server";
import { getCurrentAccessContext, requireArchiveApprovedMember } from "@/lib/access";
import { syncArchiveEmbeddings, validateArchiveInput } from "@/lib/archive";

export async function PATCH(request, context) {
  const { id } = await context.params;
  const accessContext = await getCurrentAccessContext();
  const guard = requireArchiveApprovedMember(accessContext);

  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  try {
    const payload = validateArchiveInput(await request.json());

    const { data: existing, error: existingError } = await accessContext.supabase
      .from("account_archives")
      .select("*")
      .eq("id", id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json({ error: "아카이브 항목을 찾을 수 없습니다." }, { status: 404 });
    }

    if (existing.owner_id !== accessContext.user.id) {
      return NextResponse.json({ error: "본인 아카이브만 수정할 수 있습니다." }, { status: 403 });
    }

    const { data, error } = await accessContext.supabase
      .from("account_archives")
      .update({
        ...payload,
        embedding_status: "pending",
        embedding_error: null,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    let embeddingStatus = "pending";

    try {
      embeddingStatus = await syncArchiveEmbeddings({
        supabase: accessContext.supabase,
        archive: {
          ...data,
          ...payload,
          owner_id: accessContext.user.id,
        },
      });
    } catch (embeddingError) {
      await accessContext.supabase
        .from("account_archives")
        .update({
          embedding_status: "error",
          embedding_error: embeddingError.message,
        })
        .eq("id", id);

      embeddingStatus = "error";
    }

    return NextResponse.json({
      archive: data,
      embeddingStatus,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(_request, context) {
  const { id } = await context.params;
  const accessContext = await getCurrentAccessContext();
  const guard = requireArchiveApprovedMember(accessContext);

  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { data: existing, error: existingError } = await accessContext.supabase
    .from("account_archives")
    .select("id, owner_id")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: "아카이브 항목을 찾을 수 없습니다." }, { status: 404 });
  }

  if (existing.owner_id !== accessContext.user.id) {
    return NextResponse.json({ error: "본인 아카이브만 삭제할 수 있습니다." }, { status: 403 });
  }

  const { error } = await accessContext.supabase.from("account_archives").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
