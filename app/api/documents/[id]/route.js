import { NextResponse } from "next/server";
import { getCurrentAccessContext, requireApprovedMember } from "@/lib/access";
import { syncDocumentEmbeddings, validateDocumentInput } from "@/lib/documents";

export async function PATCH(request, context) {
  const { id } = await context.params;
  const accessContext = await getCurrentAccessContext();
  const guard = requireApprovedMember(accessContext);

  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  try {
    const payload = validateDocumentInput(await request.json());

    const { data: existing, error: existingError } = await accessContext.supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
    }

    if (existing.owner_id !== accessContext.user.id) {
      return NextResponse.json({ error: "본인 문서만 수정할 수 있습니다." }, { status: 403 });
    }

    const { data, error } = await accessContext.supabase
      .from("documents")
      .update({
        ...payload,
        embedding_status: "pending",
        embedding_error: null,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    let embeddingStatus = "pending";

    try {
      embeddingStatus = await syncDocumentEmbeddings({
        supabase: accessContext.supabase,
        document: {
          ...data,
          ...payload,
          owner_id: accessContext.user.id,
        },
      });
    } catch (embeddingError) {
      await accessContext.supabase
        .from("documents")
        .update({
          embedding_status: "error",
          embedding_error: embeddingError.message,
        })
        .eq("id", id);

      embeddingStatus = "error";
    }

    return NextResponse.json({
      document: data,
      embeddingStatus,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(_request, context) {
  const { id } = await context.params;
  const accessContext = await getCurrentAccessContext();
  const guard = requireApprovedMember(accessContext);

  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { data: existing, error: existingError } = await accessContext.supabase
    .from("documents")
    .select("id, owner_id")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
  }

  if (existing.owner_id !== accessContext.user.id) {
    return NextResponse.json({ error: "본인 문서만 삭제할 수 있습니다." }, { status: 403 });
  }

  const { error } = await accessContext.supabase.from("documents").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
