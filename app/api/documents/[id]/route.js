import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncDocumentEmbeddings, validateDocumentInput } from "@/lib/documents";

export async function PATCH(request, context) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인 후 문서를 수정할 수 있습니다." }, { status: 401 });
  }

  try {
    const payload = validateDocumentInput(await request.json());

    const { data: existing, error: existingError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
    }

    if (existing.owner_id !== user.id) {
      return NextResponse.json({ error: "본인 문서만 수정할 수 있습니다." }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("documents")
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
      embeddingStatus = await syncDocumentEmbeddings({
        supabase,
        document: {
          ...data,
          ...payload,
          owner_id: user.id,
        },
      });
    } catch (embeddingError) {
      await supabase
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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인 후 문서를 삭제할 수 있습니다." }, { status: 401 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("documents")
    .select("id, owner_id")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
  }

  if (existing.owner_id !== user.id) {
    return NextResponse.json({ error: "본인 문서만 삭제할 수 있습니다." }, { status: 403 });
  }

  const { error } = await supabase.from("documents").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
