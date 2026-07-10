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
      .select("user_id, email, role, approval_status, retry_request_count, created_at, last_requested_at, updated_at")
      .eq("approval_status", "pending")
      .order("updated_at", { ascending: false });

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
  const body = await request.json();
  const targetUserId = String(body.userId || "").trim();
  const action = String(body.action || "").trim();

  if (action === "request_reapproval") {
    if (!context.user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { data, error } = await context.supabase.rpc("request_approval_retry");

    if (error) {
      if (String(error.message || "").includes("public.request_approval_retry")) {
        return NextResponse.json(
          {
            error:
              "Supabase에 승인 재요청 함수가 아직 반영되지 않았습니다. SQL Editor에서 최신 schema.sql을 다시 실행한 뒤 잠시 후 다시 시도해 주세요.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = data?.[0];
    if (!result?.ok) {
      return NextResponse.json({ error: result?.error_message || "승인 재요청에 실패했습니다." }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      retryRequestCount: result.retry_request_count,
      approvalStatus: result.approval_status,
    });
  }

  const guard = requireAdmin(context);

  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

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
