import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getCurrentAccessContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
      user: null,
      profile: null,
      isApproved: false,
      isAdmin: false,
      isArchiveApproved: false,
    };
  }

  const { data: profile } = await supabase
    .from("app_users")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const isApproved = profile?.approval_status === "approved";
  const isAdmin = isApproved && profile?.role === "admin";
  const isArchiveApproved = isApproved && profile?.archive_approval_status === "approved";

  return {
    supabase,
    user,
    profile,
    isApproved,
    isAdmin,
    isArchiveApproved,
  };
}

export function requireApprovedMember(context) {
  if (!context.user) {
    return { ok: false, status: 401, error: "로그인이 필요합니다." };
  }

  if (!context.isApproved) {
    return { ok: false, status: 403, error: "관리자 승인이 필요합니다." };
  }

  return { ok: true };
}

export function requireAdmin(context) {
  if (!context.user) {
    return { ok: false, status: 401, error: "로그인이 필요합니다." };
  }

  if (!context.isAdmin) {
    return { ok: false, status: 403, error: "관리자만 접근할 수 있습니다." };
  }

  return { ok: true };
}

export function requireArchiveApprovedMember(context) {
  const base = requireApprovedMember(context);
  if (!base.ok) return base;

  if (!context.isArchiveApproved) {
    return { ok: false, status: 403, error: "계정 아카이브는 별도의 관리자 승인이 필요합니다." };
  }

  return { ok: true };
}
