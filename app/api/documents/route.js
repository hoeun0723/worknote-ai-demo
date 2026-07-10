import { NextResponse } from "next/server";
import { getCurrentAccessContext, requireApprovedMember } from "@/lib/access";
import { syncDocumentEmbeddings, validateDocumentInput } from "@/lib/documents";

export async function GET() {
  const context = await getCurrentAccessContext();
  const guard = requireApprovedMember(context);

  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { data, error } = await context.supabase
    .from("documents")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(request) {
  const context = await getCurrentAccessContext();
  const guard = requireApprovedMember(context);

  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  try {
    const payload = validateDocumentInput(await request.json());

    const { data, error } = await context.supabase
      .from("documents")
      .insert({
        ...payload,
        owner_id: context.user.id,
        owner_email: context.user.email,
        embedding_status: "pending",
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    let embeddingStatus = "pending";

    try {
      embeddingStatus = await syncDocumentEmbeddings({
        supabase: context.supabase,
        document: {
          ...data,
          ...payload,
          owner_id: context.user.id,
        },
      });
    } catch (embeddingError) {
      await context.supabase
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
