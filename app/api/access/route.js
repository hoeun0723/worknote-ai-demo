import { NextResponse } from "next/server";
import { getCurrentAccessContext, requireAdmin } from "@/lib/access";

export async function GET() {
  const context = await getCurrentAccessContext();

  if (!context.user) {
    return NextResponse.json({
      session: null,
      profile: null,
      pendingMembers: [],
      pendingArchiveMembers: [],
    });
  }

  let pendingMembers = [];
  let pendingArchiveMembers = [];

  if (context.isAdmin) {
    const [{ data: memberRows }, { data: archiveRows }] = await Promise.all([
      context.supabase
        .from("app_users")
        .select("user_id, email, role, approval_status, retry_request_count, created_at, last_requested_at, updated_at")
        .eq("approval_status", "pending")
        .order("updated_at", { ascending: false }),
      context.supabase
        .from("app_users")
        .select(
          "user_id, email, role, approval_status, archive_approval_status, archive_requested_at, archive_approved_at, updated_at"
        )
        .eq("approval_status", "approved")
        .eq("archive_approval_status", "pending")
        .order("archive_requested_at", { ascending: false }),
    ]);

    pendingMembers = memberRows ?? [];
    pendingArchiveMembers = archiveRows ?? [];
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
    pendingArchiveMembers,
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

  if (action === "request_archive_access") {
    if (!context.user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { data, error } = await context.supabase.rpc("request_archive_access");

    if (error) {
      if (String(error.message || "").includes("public.request_archive_access")) {
        return NextResponse.json(
          {
            error:
              "Supabase에 아카이브 접근 요청 함수가 아직 반영되지 않았습니다. SQL Editor에서 최신 schema.sql을 다시 실행한 뒤 잠시 후 다시 시도해 주세요.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = data?.[0];
    if (!result?.ok) {
      return NextResponse.json({ error: result?.error_message || "아카이브 접근 요청에 실패했습니다." }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      archiveApprovalStatus: result.archive_approval_status,
    });
  }

  const guard = requireAdmin(context);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  if (!targetUserId) {
    return NextResponse.json({ error: "대상 사용자가 없습니다." }, { status: 400 });
  }

  if (action === "approve" || action === "reject") {
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

  if (action === "approve_archive" || action === "reject_archive") {
    const patch =
      action === "approve_archive"
        ? {
            archive_approval_status: "approved",
            archive_approved_by: context.user.id,
            archive_approved_at: new Date().toISOString(),
          }
        : {
            archive_approval_status: "rejected",
            archive_approved_by: context.user.id,
            archive_approved_at: new Date().toISOString(),
          };

    const { error } = await context.supabase.from("app_users").update(patch).eq("user_id", targetUserId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "잘못된 승인 요청입니다." }, { status: 400 });
}
