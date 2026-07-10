import { NextResponse } from "next/server";
import { getCurrentAccessContext, requireAdmin } from "@/lib/access";

export async function GET() {
  const context = await getCurrentAccessContext();

  if (!context.user) {
    return NextResponse.json({
      session: null,
      profile: null,
      pendingMembers: [],
    });
  }

  let pendingMembers = [];

  if (context.isAdmin) {
    const { data } = await context.supabase
      .from("app_users")
      .select("user_id, email, role, approval_status, created_at")
      .eq("approval_status", "pending")
      .order("created_at", { ascending: true });

    pendingMembers = data ?? [];
  }

  return NextResponse.json({
    session: {
      user: {
        id: context.user.id,
        email: context.user.email,
      },
    },
    profile: context.profile,
    pendingMembers,
  });
}

export async function PATCH(request) {
  const context = await getCurrentAccessContext();
  const guard = requireAdmin(context);

  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const body = await request.json();
  const targetUserId = String(body.userId || "").trim();
  const action = String(body.action || "").trim();

  if (!targetUserId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "잘못된 승인 요청입니다." }, { status: 400 });
  }

  const patch =
    action === "approve"
      ? {
          approval_status: "approved",
          approved_by: context.user.id,
          approved_at: new Date().toISOString(),
        }
      : {
          approval_status: "rejected",
          approved_by: context.user.id,
          approved_at: new Date().toISOString(),
        };

  const { error } = await context.supabase.from("app_users").update(patch).eq("user_id", targetUserId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
