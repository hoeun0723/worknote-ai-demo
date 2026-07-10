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
    };
  }

  const { data: profile } = await supabase
    .from("app_users")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const isApproved = profile?.approval_status === "approved";
  const isAdmin = isApproved && profile?.role === "admin";

  return {
    supabase,
    user,
    profile,
    isApproved,
    isAdmin,
  };
}

export function requireApprovedMember(context) {
  if (!context.user) {
    return { ok: false, status: 401, error: "로그인 후 이용할 수 있습니다." };
  }

  if (!context.isApproved) {
    return { ok: false, status: 403, error: "관리자 승인 후 이용할 수 있습니다." };
  }

  return { ok: true };
}

export function requireAdmin(context) {
  if (!context.user) {
    return { ok: false, status: 401, error: "로그인 후 이용할 수 있습니다." };
  }

  if (!context.isAdmin) {
    return { ok: false, status: 403, error: "관리자만 접근할 수 있습니다." };
  }

  return { ok: true };
}
