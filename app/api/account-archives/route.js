import { NextResponse } from "next/server";
import { getCurrentAccessContext, requireArchiveApprovedMember } from "@/lib/access";
import { syncArchiveEmbeddings, validateArchiveInput } from "@/lib/archive";

export async function GET() {
  const context = await getCurrentAccessContext();
  const guard = requireArchiveApprovedMember(context);

  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { data, error } = await context.supabase
    .from("account_archives")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ archives: data ?? [] });
}

export async function POST(request) {
  const context = await getCurrentAccessContext();
  const guard = requireArchiveApprovedMember(context);

  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  try {
    const payload = validateArchiveInput(await request.json());

    const { data, error } = await context.supabase
      .from("account_archives")
      .insert({
        ...payload,
        owner_id: context.user.id,
        owner_email: context.user.email,
        embedding_status: "pending",
      })
      .select("*")
      .single();

    if (error) throw error;

    let embeddingStatus = "pending";

    try {
      embeddingStatus = await syncArchiveEmbeddings({
        supabase: context.supabase,
        archive: {
          ...data,
          ...payload,
          owner_id: context.user.id,
        },
      });
    } catch (embeddingError) {
      await context.supabase
        .from("account_archives")
        .update({
          embedding_status: "error",
          embedding_error: embeddingError.message,
        })
        .eq("id", data.id);

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
