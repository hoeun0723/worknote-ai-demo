import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncDocumentEmbeddings, validateDocumentInput } from "@/lib/documents";

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인 후 문서를 저장할 수 있습니다." }, { status: 401 });
  }

  try {
    const payload = validateDocumentInput(await request.json());

    const { data, error } = await supabase
      .from("documents")
      .insert({
        ...payload,
        owner_id: user.id,
        owner_email: user.email,
        embedding_status: "pending",
      })
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
        .eq("id", data.id);
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
