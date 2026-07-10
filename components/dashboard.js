"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const initialDocumentForm = {
  title: "",
  category: "",
  tags: "",
  notionUrl: "",
  visibility: "public",
  content: "",
};

const initialArchiveForm = {
  title: "",
  category: "",
  serviceName: "",
  loginId: "",
  url: "",
  ipAddress: "",
  passwordNote: "",
  tags: "",
  notes: "",
};

const exampleQueries = [
  "ArgoCD 배포 오류 문서 찾아줘",
  "8080 포트 충돌 해결 방법",
  "QA 상태값 규칙 정리",
];

const archiveExampleQueries = [
  "es 로그인 아이디",
  "운영 DB URL",
  "Jenkins IP 정보",
];

function visibilityLabel(visibility) {
  return visibility === "private" ? "Private" : "Public";
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function embeddingStatusLabel(status) {
  switch (status) {
    case "ready":
      return "임베딩 완료";
    case "pending":
      return "임베딩 대기";
    case "error":
      return "임베딩 오류";
    case "skipped":
      return "임베딩 건너뜀";
    default:
      return status || "상태 없음";
  }
}

function approvalLabel(status) {
  switch (status) {
    case "approved":
      return "승인 완료";
    case "rejected":
      return "승인 거절";
    default:
      return "승인 대기";
  }
}

function getAuthErrorMessage(error) {
  const message = String(error?.message || "");

  if (message.includes("Email not confirmed")) {
    return "이메일 인증 전입니다. 메일함에서 인증을 완료해 주세요.";
  }
  if (message.includes("Invalid login credentials")) {
    return "이메일/비밀번호가 일치하지 않습니다.";
  }
  if (message.includes("User already registered")) {
    return "이미 가입된 이메일입니다.";
  }
  if (message.includes("Password should be at least")) {
    return "비밀번호가 너무 짧습니다. 더 길게 입력해 주세요.";
  }

  return message || "인증 처리 중 문제가 발생했습니다.";
}

function LoadingAnswerCard({ title, description }) {
  return (
    <article className="answer-card-ui answer-card-loading" aria-live="polite">
      <p className="panel-kicker">AI Loading</p>
      <h3>{title}</h3>
      <p className="loading-copy">{description}</p>
      <div className="skeleton-line skeleton-line-wide" />
      <div className="skeleton-line skeleton-line-medium" />
      <div className="skeleton-line skeleton-line-wide" />
      <div className="skeleton-line skeleton-line-short" />
    </article>
  );
}

export default function Dashboard() {
  const [supabase, setSupabase] = useState(null);
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessProfile, setAccessProfile] = useState(null);
  const [pendingMembers, setPendingMembers] = useState([]);
  const [pendingArchiveMembers, setPendingArchiveMembers] = useState([]);
  const [activeView, setActiveView] = useState("documents");

  const [docs, setDocs] = useState([]);
  const [docFilters, setDocFilters] = useState({
    query: "",
    category: "all",
    visibility: "all",
  });
  const [docSort, setDocSort] = useState("latest");
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [documentForm, setDocumentForm] = useState(initialDocumentForm);
  const [editingDocId, setEditingDocId] = useState(null);
  const [savingDoc, setSavingDoc] = useState(false);
  const [searchingDocs, setSearchingDocs] = useState(false);
  const [docSearchAnswer, setDocSearchAnswer] = useState("");
  const [docSearchResults, setDocSearchResults] = useState([]);
  const [docSearchMessage, setDocSearchMessage] = useState("");
  const [generateDocAnswer, setGenerateDocAnswer] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);

  const [archives, setArchives] = useState([]);
  const [archiveFilters, setArchiveFilters] = useState({
    query: "",
    category: "all",
  });
  const [loadingArchives, setLoadingArchives] = useState(false);
  const [archiveForm, setArchiveForm] = useState(initialArchiveForm);
  const [editingArchiveId, setEditingArchiveId] = useState(null);
  const [savingArchive, setSavingArchive] = useState(false);
  const [searchingArchives, setSearchingArchives] = useState(false);
  const [archiveSearchAnswer, setArchiveSearchAnswer] = useState("");
  const [archiveSearchResults, setArchiveSearchResults] = useState([]);
  const [archiveSearchMessage, setArchiveSearchMessage] = useState("");
  const [generateArchiveAnswer, setGenerateArchiveAnswer] = useState(true);
  const [archiveRequestLoading, setArchiveRequestLoading] = useState(false);

  const [adminActionLoading, setAdminActionLoading] = useState("");
  const [retryLoading, setRetryLoading] = useState(false);

  const isApproved = accessProfile?.approval_status === "approved";
  const isAdmin = isApproved && accessProfile?.role === "admin";
  const isArchiveApproved = isApproved && accessProfile?.archive_approval_status === "approved";
  const remainingRetries = Math.max(0, 3 - (accessProfile?.retry_request_count ?? 0));
  const isSelectedDocOwner = Boolean(session?.user?.id && selectedDoc?.owner_id === session.user.id);

  useEffect(() => {
    setSupabase(createSupabaseBrowserClient());
  }, []);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    void loadAccessState();
  }, [session]);

  useEffect(() => {
    if (!isApproved) {
      setDocs([]);
      setArchives([]);
      setSelectedDoc(null);
      return;
    }

    void loadDocuments();
    if (isArchiveApproved) {
      void loadArchives();
    }
  }, [isApproved, isArchiveApproved]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") {
        setSelectedDoc(null);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  useEffect(() => {
    if (!isAdmin) return undefined;

    const timer = window.setInterval(() => {
      void loadAccessState({ silent: true });
    }, 10000);

    return () => window.clearInterval(timer);
  }, [isAdmin]);

  async function loadAccessState(options = {}) {
    if (!options.silent) {
      setAccessLoading(true);
    }

    try {
      const response = await fetch("/api/access", { cache: "no-store" });
      const payload = await response.json();

      setAccessProfile(payload.profile ?? null);
      setPendingMembers(payload.pendingMembers ?? []);
      setPendingArchiveMembers(payload.pendingArchiveMembers ?? []);
      return payload;
    } finally {
      if (!options.silent) {
        setAccessLoading(false);
      }
    }
  }

  async function loadDocuments() {
    setLoadingDocs(true);

    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        setDocSearchMessage(payload.error ?? "문서 목록을 불러오지 못했습니다.");
        return;
      }

      setDocs(payload.documents ?? []);
    } finally {
      setLoadingDocs(false);
    }
  }

  async function loadArchives() {
    setLoadingArchives(true);

    try {
      const response = await fetch("/api/account-archives", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        setArchiveSearchMessage(payload.error ?? "계정 아카이브를 불러오지 못했습니다.");
        return;
      }

      setArchives(payload.archives ?? []);
    } finally {
      setLoadingArchives(false);
    }
  }

  async function handleSignUp() {
    if (!supabase) return;

    setAuthMessage("");
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setAuthMessage(getAuthErrorMessage(error));
      return;
    }

    setAuthMessage("회원가입이 완료되었습니다. 이메일 인증과 관리자 승인이 모두 필요합니다.");
    await loadAccessState();
  }

  async function handleSignIn() {
    if (!supabase) return;

    setAuthMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setAuthMessage(getAuthErrorMessage(error));
      return;
    }

    const payload = await loadAccessState();
    const approvalStatus = payload?.profile?.approval_status;

    if (approvalStatus === "pending") {
      setAuthMessage("관리자 승인이 필요합니다.");
      return;
    }

    if (approvalStatus === "rejected") {
      setAuthMessage("관리자 승인이 거절되었습니다.");
      return;
    }

    setAuthMessage("로그인되었습니다.");
  }

  async function handleSignOut() {
    if (!supabase) return;

    await supabase.auth.signOut();
    setSelectedDoc(null);
    setAuthMessage("로그아웃되었습니다.");
    await loadAccessState();
  }

  async function handleRetryApprovalRequest() {
    setRetryLoading(true);
    setAuthMessage("");

    try {
      const response = await fetch("/api/access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_reapproval" }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setAuthMessage(payload.error ?? "승인 재요청에 실패했습니다.");
        return;
      }

      setAuthMessage(`관리자 승인 재요청을 보냈습니다. (${payload.retryRequestCount}/3)`);
      await loadAccessState();
    } finally {
      setRetryLoading(false);
    }
  }

  async function handleRequestArchiveAccess() {
    setArchiveRequestLoading(true);
    setArchiveSearchMessage("");

    try {
      const response = await fetch("/api/access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_archive_access" }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setArchiveSearchMessage(payload.error ?? "아카이브 접근 요청에 실패했습니다.");
        return;
      }

      setArchiveSearchMessage("아카이브 접근 요청을 보냈습니다. 관리자 승인 후 이용할 수 있습니다.");
      await loadAccessState();
    } finally {
      setArchiveRequestLoading(false);
    }
  }

  async function handleApprovalAction(userId, action) {
    setAdminActionLoading(`${action}:${userId}`);

    try {
      const response = await fetch("/api/access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setAuthMessage(payload.error ?? "관리자 처리에 실패했습니다.");
        return;
      }

      await loadAccessState();
    } finally {
      setAdminActionLoading("");
    }
  }

  async function handleSaveDocument(event) {
    event.preventDefault();
    setSavingDoc(true);
    setDocSearchMessage("");

    try {
      const payload = {
        title: documentForm.title,
        category: documentForm.category,
        tags: documentForm.tags,
        notionUrl: documentForm.notionUrl,
        visibility: documentForm.visibility,
        content: documentForm.content,
      };

      const response = await fetch(editingDocId ? `/api/documents/${editingDocId}` : "/api/documents", {
        method: editingDocId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        setDocSearchMessage(data.error ?? "문서를 저장하지 못했습니다.");
        return;
      }

      setEditingDocId(null);
      setDocumentForm(initialDocumentForm);
      await loadDocuments();
      setDocSearchMessage(
        data.embeddingStatus === "ready"
          ? "문서를 저장했고 임베딩 생성까지 완료했습니다."
          : "문서를 저장했습니다. OpenAI 키가 없으면 임베딩은 생성되지 않습니다."
      );
    } finally {
      setSavingDoc(false);
    }
  }

  async function handleSaveArchive(event) {
    event.preventDefault();
    setSavingArchive(true);
    setArchiveSearchMessage("");

    try {
      const payload = {
        title: archiveForm.title,
        category: archiveForm.category,
        serviceName: archiveForm.serviceName,
        loginId: archiveForm.loginId,
        url: archiveForm.url,
        ipAddress: archiveForm.ipAddress,
        passwordNote: archiveForm.passwordNote,
        tags: archiveForm.tags,
        notes: archiveForm.notes,
      };

      const response = await fetch(editingArchiveId ? `/api/account-archives/${editingArchiveId}` : "/api/account-archives", {
        method: editingArchiveId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        setArchiveSearchMessage(data.error ?? "계정 아카이브를 저장하지 못했습니다.");
        return;
      }

      setEditingArchiveId(null);
      setArchiveForm(initialArchiveForm);
      await loadArchives();
      setArchiveSearchMessage(
        data.embeddingStatus === "ready"
          ? "계정 아카이브를 저장했고 AI 검색용 임베딩도 완료했습니다."
          : "계정 아카이브를 저장했습니다. OpenAI 키가 없으면 임베딩은 생성되지 않습니다."
      );
    } finally {
      setSavingArchive(false);
    }
  }

  async function handleDeleteDocument(id) {
    const ok = window.confirm("이 문서를 삭제할까요?");
    if (!ok) return;

    const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    const data = await response.json();

    if (!response.ok) {
      setDocSearchMessage(data.error ?? "문서를 삭제하지 못했습니다.");
      return;
    }

    if (selectedDoc?.id === id) setSelectedDoc(null);
    await loadDocuments();
    if (editingDocId === id) {
      setEditingDocId(null);
      setDocumentForm(initialDocumentForm);
    }
  }

  async function handleDeleteArchive(id) {
    const ok = window.confirm("이 계정 아카이브를 삭제할까요?");
    if (!ok) return;

    const response = await fetch(`/api/account-archives/${id}`, { method: "DELETE" });
    const data = await response.json();

    if (!response.ok) {
      setArchiveSearchMessage(data.error ?? "계정 아카이브를 삭제하지 못했습니다.");
      return;
    }

    await loadArchives();
    if (editingArchiveId === id) {
      setEditingArchiveId(null);
      setArchiveForm(initialArchiveForm);
    }
  }

  async function handleSemanticSearch() {
    if (!docFilters.query.trim()) {
      setDocSearchMessage("검색어를 먼저 입력해 주세요.");
      return;
    }

    setSearchingDocs(true);
    setDocSearchMessage("");

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: docFilters.query,
          category: docFilters.category,
          visibility: docFilters.visibility,
          generateAnswer: generateDocAnswer,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setDocSearchAnswer("");
        setDocSearchResults([]);
        setDocSearchMessage(data.error ?? "AI 검색을 실행하지 못했습니다.");
        return;
      }

      setDocSearchAnswer(data.answer ?? "");
      setDocSearchResults(data.results ?? []);
      setDocSearchMessage(data.message ?? "");
    } finally {
      setSearchingDocs(false);
    }
  }

  async function handleArchiveSearch() {
    if (!archiveFilters.query.trim()) {
      setArchiveSearchMessage("검색어를 먼저 입력해 주세요.");
      return;
    }

    setSearchingArchives(true);
    setArchiveSearchMessage("");

    try {
      const response = await fetch("/api/account-archive-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: archiveFilters.query,
          category: archiveFilters.category,
          generateAnswer: generateArchiveAnswer,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setArchiveSearchAnswer("");
        setArchiveSearchResults([]);
        setArchiveSearchMessage(data.error ?? "계정 아카이브 AI 검색을 실행하지 못했습니다.");
        return;
      }

      setArchiveSearchAnswer(data.answer ?? "");
      setArchiveSearchResults(data.results ?? []);
      setArchiveSearchMessage(data.message ?? "");
    } finally {
      setSearchingArchives(false);
    }
  }

  async function handleToggleDocVisibility(nextVisibility) {
    if (!selectedDoc) return;

    setShareLoading(true);
    setDocSearchMessage("");

    try {
      const response = await fetch(`/api/documents/${selectedDoc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selectedDoc.title,
          category: selectedDoc.category,
          tags: selectedDoc.tags ?? [],
          notionUrl: selectedDoc.notion_url ?? "",
          visibility: nextVisibility,
          content: selectedDoc.content,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setDocSearchMessage(payload.error ?? "문서 공개 범위를 변경하지 못했습니다.");
        return;
      }

      const nextDoc = payload.document ? { ...selectedDoc, ...payload.document } : { ...selectedDoc, visibility: nextVisibility };
      setSelectedDoc(nextDoc);
      setDocs((current) => current.map((doc) => (doc.id === nextDoc.id ? { ...doc, ...nextDoc } : doc)));
      setDocSearchMessage(
        nextVisibility === "public"
          ? "이 문서를 public으로 전환했습니다. 이제 팀원들도 검색할 수 있습니다."
          : "이 문서를 private으로 전환했습니다. 이제 작성자만 검색할 수 있습니다."
      );
    } finally {
      setShareLoading(false);
    }
  }

  const documentCategories = useMemo(() => {
    const counts = docs.reduce((acc, doc) => {
      acc[doc.category] = (acc[doc.category] || 0) + 1;
      return acc;
    }, {});

    return [{ name: "all", count: docs.length }, ...Object.entries(counts).map(([name, count]) => ({ name, count }))];
  }, [docs]);

  const archiveCategories = useMemo(() => {
    const counts = archives.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});

    return [{ name: "all", count: archives.length }, ...Object.entries(counts).map(([name, count]) => ({ name, count }))];
  }, [archives]);

  const visibleDocs = useMemo(() => {
    const normalizedQuery = docFilters.query.trim().toLowerCase();
    const results = docs.filter((doc) => {
      if (docFilters.category !== "all" && doc.category !== docFilters.category) return false;
      if (docFilters.visibility !== "all" && doc.visibility !== docFilters.visibility) return false;
      if (!normalizedQuery) return true;

      const haystack = [doc.title, doc.category, doc.content, doc.summary, ...(doc.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });

    return results.sort((a, b) => {
      if (docSort === "title") return a.title.localeCompare(b.title, "ko");
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
    });
  }, [docs, docFilters, docSort]);

  const filteredArchives = useMemo(() => {
    const normalizedQuery = archiveFilters.query.trim().toLowerCase();

    return archives.filter((item) => {
      if (archiveFilters.category !== "all" && item.category !== archiveFilters.category) return false;
      if (!normalizedQuery) return true;

      const haystack = [
        item.title,
        item.category,
        item.service_name,
        item.login_id,
        item.url,
        item.ip_address,
        item.password_note,
        item.notes,
        ...(item.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [archives, archiveFilters]);

  const stats = useMemo(() => {
    const publicDocs = docs.filter((doc) => doc.visibility === "public").length;
    const privateDocs = docs.filter((doc) => doc.visibility === "private").length;
    const readyDocs = docs.filter((doc) => doc.embedding_status === "ready").length;

    return {
      total: docs.length,
      publicDocs,
      privateDocs,
      readyDocs,
    };
  }, [docs]);

  function beginEditDoc(doc) {
    setEditingDocId(doc.id);
    setDocumentForm({
      title: doc.title,
      category: doc.category,
      tags: (doc.tags ?? []).join(", "),
      notionUrl: doc.notion_url ?? "",
      visibility: doc.visibility,
      content: doc.content,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function beginEditArchive(item) {
    setEditingArchiveId(item.id);
    setArchiveForm({
      title: item.title,
      category: item.category,
      serviceName: item.service_name ?? "",
      loginId: item.login_id ?? "",
      url: item.url ?? "",
      ipAddress: item.ip_address ?? "",
      passwordNote: item.password_note ?? "",
      tags: (item.tags ?? []).join(", "),
      notes: item.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (accessLoading) {
    return (
      <main className="gate-shell">
        <section className="gate-card">
          <p className="gate-kicker">Geoeojeong Service</p>
          <h1>“그거 어디에 정리했더라?”를 찾는 중이에요.</h1>
          <p>그어정 서비스의 접속 권한과 계정 상태를 확인하고 있습니다.</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="gate-shell">
        <section className="gate-card">
          <p className="gate-kicker">Geoeojeong Service</p>
          <h1>“그거 어디에 정리했더라?”를 해결하는 AI 문서 검색 비서</h1>
          <p>
            그어정 서비스는 Notion에 흩어진 업무 기록, 오류 해결 문서, 메모를 한곳에 모아 찾기 쉽게 도와줍니다.
          </p>
          <p className="gate-subtext">
            public 문서는 누구나 검색하고, private 문서는 로그인한 사용자만 검색할 수 있도록 분리했습니다.
          </p>

          <div className="gate-form">
            <input className="gate-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="이메일" type="email" />
            <input className="gate-input" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="비밀번호" type="password" />
            <div className="gate-actions">
              <button className="primary-action" onClick={handleSignIn} type="button">로그인</button>
              <button className="secondary-action" onClick={handleSignUp} type="button">회원가입</button>
            </div>
            <div className="helper-banner">이메일 인증과 관리자 승인이 끝나면 메인 화면에 들어갈 수 있습니다.</div>
            {authMessage ? <p className="gate-message">{authMessage}</p> : null}
          </div>
        </section>
      </main>
    );
  }

  if (!isApproved) {
    const isRejected = accessProfile?.approval_status === "rejected";

    return (
      <main className="gate-shell">
        <section className="gate-card">
          <p className="gate-kicker">Geoeojeong Service</p>
          <h1>{approvalLabel(accessProfile?.approval_status)}</h1>
          <p>현재 계정은 <strong>{session.user.email}</strong> 입니다. 일반 서비스 승인 후 메인 화면으로 들어갈 수 있습니다.</p>
          <div className={`status-pill ${isRejected ? "rejected" : ""}`}>{approvalLabel(accessProfile?.approval_status)}</div>
          <p className="gate-subtext">{isRejected ? "관리자 승인이 거절되었습니다." : "관리자 승인이 필요합니다."}</p>
          {isRejected ? <p className="gate-subtext">재요청 가능 횟수: {remainingRetries}회 남음 (최대 3회)</p> : null}
          <div className="gate-actions">
            <button className="secondary-action" onClick={loadAccessState} type="button">상태 새로고침</button>
            {isRejected ? (
              <button className="primary-action" disabled={retryLoading || remainingRetries <= 0} onClick={handleRetryApprovalRequest} type="button">
                {retryLoading ? "재요청 중..." : remainingRetries > 0 ? "관리자 승인 재요청" : "재요청 횟수 소진"}
              </button>
            ) : null}
            <button className="ghost-link" onClick={handleSignOut} type="button">로그아웃</button>
          </div>
          {authMessage ? <p className="gate-message">{authMessage}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <>
      <main className="app-frame">
        <aside className="app-sidebar">
          <div className="brand-block">
            <div className="brand-mark">W</div>
            <div>
              <h1 className="brand-title">WorkNote AI</h1>
              <p className="brand-subtitle">그어정 서비스</p>
            </div>
          </div>

          <section className="sidebar-section sidebar-auth">
            <div className="sidebar-header-row">
              <div>
                <p className="sidebar-kicker">Auth</p>
                <p className="sidebar-title">계정 상태</p>
              </div>
              <span className={`sidebar-badge ${session ? "sidebar-badge-active" : ""}`}>{isAdmin ? "admin" : "member"}</span>
            </div>

            <div className="stack">
              <p className="sidebar-note">{session.user.email}</p>
              <p className="sidebar-note">일반 승인: {approvalLabel(accessProfile?.approval_status)}</p>
              <p className="sidebar-note">아카이브 승인: {approvalLabel(accessProfile?.archive_approval_status)}</p>
              <button className="sidebar-button sidebar-button-ghost" onClick={handleSignOut} type="button">로그아웃</button>
              {authMessage ? <p className="sidebar-help">{authMessage}</p> : null}
            </div>
          </section>

          <section className="sidebar-section">
            <div className="sidebar-header-row">
              <div>
                <p className="sidebar-kicker">Space</p>
                <p className="sidebar-title">검색 영역</p>
              </div>
            </div>
            <div className="stack">
              <button
                className={activeView === "documents" ? "primary-action" : "secondary-action"}
                onClick={() => setActiveView("documents")}
                type="button"
              >
                문서 검색
              </button>
              <button
                className={activeView === "archives" ? "primary-action" : "secondary-action"}
                onClick={() => setActiveView("archives")}
                type="button"
              >
                계정 아카이브
              </button>
            </div>
          </section>
        </aside>

        <div className="app-main">
          <header className="mobile-header">
            <div className="brand-block">
              <div className="brand-mark">W</div>
              <div>
                <h1 className="brand-title">WorkNote AI</h1>
                <p className="brand-subtitle">그어정 서비스</p>
              </div>
            </div>
          </header>

          {isAdmin ? (
            <>
              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <p className="panel-kicker">Admin Approval</p>
                    <h3>일반 서비스 승인 대기</h3>
                  </div>
                  <span className="count-chip">{pendingMembers.length} pending</span>
                </div>

                {pendingMembers.length ? (
                  <div className="approval-list">
                    {pendingMembers.map((member) => (
                      <article className="approval-card" key={member.user_id}>
                        <div>
                          <h4>{member.email}</h4>
                          <p>가입일: {formatDate(member.created_at)}</p>
                          <p>재요청 횟수: {member.retry_request_count ?? 0}/3</p>
                        </div>
                        <div className="approval-actions">
                          <button
                            className="primary-action"
                            disabled={adminActionLoading === `approve:${member.user_id}`}
                            onClick={() => handleApprovalAction(member.user_id, "approve")}
                            type="button"
                          >
                            승인
                          </button>
                          <button
                            className="danger-action"
                            disabled={adminActionLoading === `reject:${member.user_id}`}
                            onClick={() => handleApprovalAction(member.user_id, "reject")}
                            type="button"
                          >
                            거절
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state compact">현재 일반 서비스 승인 대기 사용자가 없습니다.</div>
                )}
              </section>

              <section className="admin-panel">
                <div className="admin-panel-header">
                  <div>
                    <p className="panel-kicker">Archive Approval</p>
                    <h3>계정 아카이브 접근 승인 대기</h3>
                  </div>
                  <span className="count-chip">{pendingArchiveMembers.length} pending</span>
                </div>

                {pendingArchiveMembers.length ? (
                  <div className="approval-list">
                    {pendingArchiveMembers.map((member) => (
                      <article className="approval-card" key={member.user_id}>
                        <div>
                          <h4>{member.email}</h4>
                          <p>일반 서비스 승인: {approvalLabel(member.approval_status)}</p>
                          <p>아카이브 요청 시각: {formatDate(member.archive_requested_at || member.updated_at)}</p>
                        </div>
                        <div className="approval-actions">
                          <button
                            className="primary-action"
                            disabled={adminActionLoading === `approve_archive:${member.user_id}`}
                            onClick={() => handleApprovalAction(member.user_id, "approve_archive")}
                            type="button"
                          >
                            아카이브 승인
                          </button>
                          <button
                            className="danger-action"
                            disabled={adminActionLoading === `reject_archive:${member.user_id}`}
                            onClick={() => handleApprovalAction(member.user_id, "reject_archive")}
                            type="button"
                          >
                            아카이브 거절
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state compact">현재 아카이브 접근 승인 대기 사용자가 없습니다.</div>
                )}
              </section>
            </>
          ) : null}

          {activeView === "documents" ? (
            <>
              <section className="hero-card">
                <div className="hero-floating-badge">Notion-ready Knowledge Assistant</div>
                <p className="hero-kicker">AI document search</p>
                <h2 className="hero-heading">“그거 어디에 정리했더라?”를 해결하는 AI 문서 검색 비서</h2>
                <p className="hero-description">
                  public 문서는 누구나 검색하고, private 문서는 로그인한 사용자만 검색할 수 있도록 분리했습니다. Notion에
                  흩어진 업무 기록, 오류 해결 문서, 메모를 카테고리별로 저장하고 관련 문서를 찾아보세요.
                </p>

                <div className="hero-stats">
                  <div className="hero-stat-card"><p className="hero-stat-label">Visible Docs</p><strong>{stats.total}</strong></div>
                  <div className="hero-stat-card"><p className="hero-stat-label">Public</p><strong>{stats.publicDocs}</strong></div>
                  <div className="hero-stat-card"><p className="hero-stat-label">Private</p><strong>{stats.privateDocs}</strong></div>
                  <div className="hero-stat-card hero-stat-dark"><p className="hero-stat-label">Embeddings</p><strong>{stats.readyDocs}</strong></div>
                </div>
              </section>

              <section className="search-shell">
                <div className="search-grid">
                  <div className="search-input-wrap">
                    <span className="search-icon">⌕</span>
                    <input
                      className="search-input"
                      placeholder="예: Jenkins에서 배포 전에 확인할 문서 찾아줘"
                      value={docFilters.query}
                      onChange={(event) => setDocFilters((current) => ({ ...current, query: event.target.value }))}
                    />
                  </div>

                  <div className="search-controls">
                    <select className="search-select" value={docFilters.category} onChange={(e) => setDocFilters((c) => ({ ...c, category: e.target.value }))}>
                      <option value="all">전체 카테고리</option>
                      {documentCategories.filter((item) => item.name !== "all").map((item) => (
                        <option key={item.name} value={item.name}>{item.name}</option>
                      ))}
                    </select>
                    <select className="search-select" value={docFilters.visibility} onChange={(e) => setDocFilters((c) => ({ ...c, visibility: e.target.value }))}>
                      <option value="all">전체 범위</option>
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                    <select className="search-select" value={docSort} onChange={(e) => setDocSort(e.target.value)}>
                      <option value="latest">최신순</option>
                      <option value="title">제목순</option>
                    </select>
                    <button className="search-reset" onClick={() => { setEditingDocId(null); setDocumentForm(initialDocumentForm); }} type="button">
                      작성 초기화
                    </button>
                  </div>
                </div>

                <div className="search-actions">
                  <button className="primary-action" onClick={handleSemanticSearch} type="button" disabled={searchingDocs}>
                    {searchingDocs ? "검색 중..." : "AI 검색"}
                  </button>
                  <button className="secondary-action" onClick={() => { setDocSearchAnswer(""); setDocSearchResults([]); setDocFilters({ query: "", category: "all", visibility: "all" }); }} type="button">
                    검색 초기화
                  </button>
                  <label className="toggle-row">
                    <input checked={generateDocAnswer} onChange={(e) => setGenerateDocAnswer(e.target.checked)} type="checkbox" />
                    <span>답변 요약 함께 생성</span>
                  </label>
                </div>
              </section>

              <section className={`summary-card ${searchingDocs ? "summary-card-loading" : ""}`}>
                <div className="summary-icon">AI</div>
                <div>
                  <p className="summary-kicker">AI 추천 요약</p>
                  <p className="summary-text">{docSearchMessage || "검색어를 입력하면 의미 기반으로 관련 문서를 찾고, 원하면 답변 요약까지 함께 생성합니다."}</p>
                </div>
              </section>

              <section className="content-grid">
                <aside className="composer-panel">
                  <div className="panel-heading">
                    <p className="panel-kicker">New Document</p>
                    <h3>{editingDocId ? "문서 수정" : "문서 등록"}</h3>
                    <p>승인된 사용자만 문서를 등록하거나 수정할 수 있습니다.</p>
                  </div>

                  <form className="form-card" onSubmit={handleSaveDocument}>
                    <input className="form-input" placeholder="제목" value={documentForm.title} onChange={(e) => setDocumentForm((c) => ({ ...c, title: e.target.value }))} required />
                    <input className="form-input" placeholder="카테고리" value={documentForm.category} onChange={(e) => setDocumentForm((c) => ({ ...c, category: e.target.value }))} required />
                    <input className="form-input" placeholder="태그 (쉼표로 구분)" value={documentForm.tags} onChange={(e) => setDocumentForm((c) => ({ ...c, tags: e.target.value }))} />
                    <input className="form-input" placeholder="Notion 링크" type="url" value={documentForm.notionUrl} onChange={(e) => setDocumentForm((c) => ({ ...c, notionUrl: e.target.value }))} />
                    <select className="form-input" value={documentForm.visibility} onChange={(e) => setDocumentForm((c) => ({ ...c, visibility: e.target.value }))}>
                      <option value="public">Public - 팀원 모두 검색 가능</option>
                      <option value="private">Private - 작성자만 검색 가능</option>
                    </select>
                    <textarea className="form-textarea" placeholder="문서 내용을 적어 주세요." value={documentForm.content} onChange={(e) => setDocumentForm((c) => ({ ...c, content: e.target.value }))} required />
                    <div className="form-actions">
                      <button className="primary-action" disabled={savingDoc} type="submit">{savingDoc ? "저장 중..." : editingDocId ? "수정 저장" : "저장하기"}</button>
                      <button className="secondary-action" onClick={() => { setEditingDocId(null); setDocumentForm(initialDocumentForm); }} type="button">입력 비우기</button>
                      {searchingArchives ? <p className="loading-copy">AI가 계정 아카이브를 읽고 답을 찾는 중입니다.</p> : null}
                    </div>
                  </form>
                </aside>

                <section className="results-panel">
                  <section className="sidebar-section">
                    <p className="sidebar-kicker">Quick Search</p>
                    <div className="example-list">
                      {exampleQueries.map((query) => (
                        <button key={query} className="example-button" onClick={() => applyExampleQuery(query)} type="button">{query}</button>
                      ))}
                    </div>
                  </section>

                  {searchingDocs ? (
                    <LoadingAnswerCard
                      title="AI가 요약 답변을 정리하고 있어요"
                      description="검색 결과를 읽고 핵심만 추려서 답변을 만드는 중입니다."
                    />
                  ) : docSearchAnswer ? (
                    <article className="answer-card-ui">
                      <p className="panel-kicker">Generated Answer</p>
                      <h3>AI 요약 답변</h3>
                      <pre>{docSearchAnswer}</pre>
                    </article>
                  ) : null}

                  {docSearchResults.length ? (
                    <article className="section-card">
                      <div className="section-card-header">
                        <div><p className="panel-kicker">Semantic Matches</p><h3>AI 검색 결과</h3></div>
                        <span className="count-chip">{docSearchResults.length} docs</span>
                      </div>
                      <div className="search-result-list">
                        {docSearchResults.map((result) => (
                          <article className="search-result-item" key={result.document_id}>
                            <div className="inline-meta">
                              <span className={`pill ${result.visibility === "private" ? "pill-private" : "pill-public"}`}>{visibilityLabel(result.visibility)}</span>
                              <span className="tag-chip">{result.category}</span>
                              <span className="tag-chip">score {Math.round((result.score ?? 0) * 100)}%</span>
                            </div>
                            <h4>{result.title}</h4>
                            <p>{result.summary || "요약 없음"}</p>
                            <pre>{result.snippet}</pre>
                          </article>
                        ))}
                      </div>
                    </article>
                  ) : null}

                  <article className="section-card">
                    <div className="section-card-header">
                      <div><p className="panel-kicker">Documents</p><h3>접근 가능한 문서 목록</h3></div>
                      <span className="count-chip">{loadingDocs ? "loading..." : `${visibleDocs.length} visible`}</span>
                    </div>

                    {loadingDocs ? (
                      <div className="empty-state">문서를 불러오는 중입니다.</div>
                    ) : visibleDocs.length ? (
                      <div className="document-grid">
                        {visibleDocs.map((doc) => (
                          <article className="document-card" key={doc.id}>
                            <div className="inline-meta spread">
                              <div className="inline-meta">
                                <span className={`pill ${doc.visibility === "private" ? "pill-private" : "pill-public"}`}>{visibilityLabel(doc.visibility)}</span>
                                <span className="tag-chip">{doc.category}</span>
                              </div>
                              <span className="tag-chip">{embeddingStatusLabel(doc.embedding_status)}</span>
                            </div>
                            <h4>{doc.title}</h4>
                            <p>{doc.summary || "요약 없음"}</p>
                            <div className="tag-list">
                              {(doc.tags ?? []).map((tag) => <span className="tag-chip" key={tag}>#{tag}</span>)}
                            </div>
                            <div className="doc-meta-text">
                              <span>작성자: {doc.owner_email || "unknown"}</span>
                              <span>수정일: {formatDate(doc.updated_at || doc.created_at)}</span>
                            </div>
                            <div className="doc-actions">
                              <button className="primary-action" onClick={() => setSelectedDoc(doc)} type="button">자세히 보기</button>
                              <button className="secondary-action" onClick={() => beginEditDoc(doc)} type="button">수정</button>
                              <button className="danger-action" onClick={() => handleDeleteDocument(doc.id)} type="button">삭제</button>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">조건에 맞는 문서가 없습니다. 새 문서를 등록해 보세요.</div>
                    )}
                  </article>
                </section>
              </section>
            </>
          ) : (
            <>
              <section className="hero-card">
                <div className="hero-floating-badge">Restricted Archive Zone</div>
                <p className="hero-kicker">Account archive</p>
                <h2 className="hero-heading">DB 로그인 정보, URL, IP를 AI로 찾는 계정 아카이브</h2>
                <p className="hero-description">
                  이 공간은 일반 로그인 승인과 별도로, 한 번 더 관리자 승인을 받은 사용자만 접근할 수 있습니다. 짧은 계정 정보라도
                  검색 전용으로 정리해두고 “es 로그인 아이디”, “운영 DB URL”처럼 바로 찾아볼 수 있게 만들었습니다.
                </p>
              </section>

              {!isArchiveApproved ? (
                <section className="section-card" style={{ marginTop: 18 }}>
                  <div className="section-card-header">
                    <div>
                      <p className="panel-kicker">Archive Access</p>
                      <h3>계정 아카이브는 별도 승인 구역입니다</h3>
                    </div>
                    <span className="count-chip">{approvalLabel(accessProfile?.archive_approval_status)}</span>
                  </div>
                  <div className="empty-state">
                    <p>이 공간에는 DB 로그인 정보, URL, IP 같은 민감한 데이터가 들어갈 수 있어서 추가 관리자 승인이 필요합니다.</p>
                    <p>현재 상태: {approvalLabel(accessProfile?.archive_approval_status)}</p>
                    <div className="gate-actions" style={{ justifyContent: "center", marginTop: 16 }}>
                      <button className="primary-action" disabled={archiveRequestLoading} onClick={handleRequestArchiveAccess} type="button">
                        {archiveRequestLoading ? "요청 중..." : "계정 아카이브 접근 요청"}
                      </button>
                    </div>
                    {archiveSearchMessage ? <p className="gate-message">{archiveSearchMessage}</p> : null}
                  </div>
                </section>
              ) : (
                <>
                  <section className="search-shell">
                    <div className="search-grid">
                      <div className="search-input-wrap">
                        <span className="search-icon">⌕</span>
                        <input
                          className="search-input"
                          placeholder="예: es 로그인 아이디, 운영 DB URL, Jenkins IP"
                          value={archiveFilters.query}
                          onChange={(event) => setArchiveFilters((current) => ({ ...current, query: event.target.value }))}
                        />
                      </div>

                      <div className="search-controls">
                        <select className="search-select" value={archiveFilters.category} onChange={(e) => setArchiveFilters((c) => ({ ...c, category: e.target.value }))}>
                          <option value="all">전체 카테고리</option>
                          {archiveCategories.filter((item) => item.name !== "all").map((item) => (
                            <option key={item.name} value={item.name}>{item.name}</option>
                          ))}
                        </select>
                        <button className="primary-action" onClick={handleArchiveSearch} type="button" disabled={searchingArchives}>
                          {searchingArchives ? "검색 중..." : "아카이브 AI 검색"}
                        </button>
                        <button className="secondary-action" onClick={() => { setArchiveSearchAnswer(""); setArchiveSearchResults([]); setArchiveFilters({ query: "", category: "all" }); }} type="button">
                          검색 초기화
                        </button>
                        <label className="toggle-row">
                          <input checked={generateArchiveAnswer} onChange={(e) => setGenerateArchiveAnswer(e.target.checked)} type="checkbox" />
                          <span>답변 요약 함께 생성</span>
                        </label>
                      </div>
                    </div>
                  </section>

                  <section className={`summary-card ${searchingArchives ? "summary-card-loading" : ""}`}>
                    <div className="summary-icon">AI</div>
                    <div>
                      <p className="summary-kicker">아카이브 검색 요약</p>
                      <p className="summary-text">{archiveSearchMessage || "민감한 계정 정보도 AI 검색으로 빠르게 찾을 수 있습니다."}</p>
                    </div>
                  </section>

                  <section className="content-grid">
                    <aside className="composer-panel">
                      <div className="panel-heading">
                        <p className="panel-kicker">Archive Item</p>
                        <h3>{editingArchiveId ? "아카이브 수정" : "아카이브 등록"}</h3>
                        <p>이 공간은 검색 전용으로 쓰기 좋게 짧은 로그인 정보, URL, IP를 구조화해서 저장합니다.</p>
                      </div>

                      <form className="form-card" onSubmit={handleSaveArchive}>
                        <input className="form-input" placeholder="제목" value={archiveForm.title} onChange={(e) => setArchiveForm((c) => ({ ...c, title: e.target.value }))} required />
                        <input className="form-input" placeholder="카테고리" value={archiveForm.category} onChange={(e) => setArchiveForm((c) => ({ ...c, category: e.target.value }))} required />
                        <input className="form-input" placeholder="서비스 이름" value={archiveForm.serviceName} onChange={(e) => setArchiveForm((c) => ({ ...c, serviceName: e.target.value }))} />
                        <input className="form-input" placeholder="로그인 ID" value={archiveForm.loginId} onChange={(e) => setArchiveForm((c) => ({ ...c, loginId: e.target.value }))} />
                        <input className="form-input" placeholder="URL" type="url" value={archiveForm.url} onChange={(e) => setArchiveForm((c) => ({ ...c, url: e.target.value }))} />
                        <input className="form-input" placeholder="IP 주소" value={archiveForm.ipAddress} onChange={(e) => setArchiveForm((c) => ({ ...c, ipAddress: e.target.value }))} />
                        <input className="form-input" placeholder="비밀번호 메모" value={archiveForm.passwordNote} onChange={(e) => setArchiveForm((c) => ({ ...c, passwordNote: e.target.value }))} />
                        <input className="form-input" placeholder="태그 (쉼표로 구분)" value={archiveForm.tags} onChange={(e) => setArchiveForm((c) => ({ ...c, tags: e.target.value }))} />
                        <textarea className="form-textarea" placeholder="추가 메모" value={archiveForm.notes} onChange={(e) => setArchiveForm((c) => ({ ...c, notes: e.target.value }))} />
                        <div className="form-actions">
                          <button className="primary-action" disabled={savingArchive} type="submit">{savingArchive ? "저장 중..." : editingArchiveId ? "수정 저장" : "저장하기"}</button>
                          <button className="secondary-action" onClick={() => { setEditingArchiveId(null); setArchiveForm(initialArchiveForm); }} type="button">입력 비우기</button>
                        </div>
                      </form>
                    </aside>

                    <section className="results-panel">
                      <section className="sidebar-section">
                        <p className="sidebar-kicker">Quick Search</p>
                        <div className="example-list">
                          {archiveExampleQueries.map((query) => (
                            <button key={query} className="example-button" onClick={() => setArchiveFilters((c) => ({ ...c, query }))} type="button">{query}</button>
                          ))}
                        </div>
                      </section>

                      {searchingArchives ? (
                        <LoadingAnswerCard
                          title="AI가 아카이브 답변을 정리하고 있어요"
                          description="로그인 정보, URL, IP 관련 항목을 읽고 답변을 정리하는 중입니다."
                        />
                      ) : archiveSearchAnswer ? (
                        <article className="answer-card-ui">
                          <p className="panel-kicker">Generated Answer</p>
                          <h3>아카이브 AI 요약</h3>
                          <pre>{archiveSearchAnswer}</pre>
                        </article>
                      ) : null}

                      {archiveSearchResults.length ? (
                        <article className="section-card">
                          <div className="section-card-header">
                            <div><p className="panel-kicker">Archive Matches</p><h3>계정 아카이브 AI 검색 결과</h3></div>
                            <span className="count-chip">{archiveSearchResults.length} items</span>
                          </div>
                          <div className="search-result-list">
                            {archiveSearchResults.map((result) => (
                              <article className="search-result-item" key={result.archive_id}>
                                <div className="inline-meta">
                                  <span className="tag-chip">{result.category}</span>
                                  {result.service_name ? <span className="tag-chip">{result.service_name}</span> : null}
                                  <span className="tag-chip">score {Math.round((result.score ?? 0) * 100)}%</span>
                                </div>
                                <h4>{result.title}</h4>
                                <p>{result.summary || "요약 없음"}</p>
                                <pre>{result.snippet}</pre>
                              </article>
                            ))}
                          </div>
                        </article>
                      ) : null}

                      <article className="section-card">
                        <div className="section-card-header">
                          <div><p className="panel-kicker">Archive Items</p><h3>계정 아카이브 목록</h3></div>
                          <span className="count-chip">{loadingArchives ? "loading..." : `${filteredArchives.length} items`}</span>
                        </div>

                        {loadingArchives ? (
                          <div className="empty-state">계정 아카이브를 불러오는 중입니다.</div>
                        ) : filteredArchives.length ? (
                          <div className="search-result-list">
                            {filteredArchives.map((item) => (
                              <article className="search-result-item" key={item.id}>
                                <div className="inline-meta">
                                  <span className="tag-chip">{item.category}</span>
                                  {item.service_name ? <span className="tag-chip">{item.service_name}</span> : null}
                                  <span className="tag-chip">{embeddingStatusLabel(item.embedding_status)}</span>
                                </div>
                                <h4>{item.title}</h4>
                                <p>{item.summary || "요약 없음"}</p>
                                <div className="doc-meta-text">
                                  <span>로그인 ID: {item.login_id || "-"}</span>
                                  <span>URL: {item.url || "-"}</span>
                                  <span>IP: {item.ip_address || "-"}</span>
                                  <span>비밀번호 메모: {item.password_note || "-"}</span>
                                  <span>작성자: {item.owner_email || "unknown"}</span>
                                  <span>수정일: {formatDate(item.updated_at || item.created_at)}</span>
                                </div>
                                {item.notes ? <pre style={{ marginTop: 12 }}>{item.notes}</pre> : null}
                                <div className="tag-list">
                                  {(item.tags ?? []).map((tag) => <span className="tag-chip" key={tag}>#{tag}</span>)}
                                </div>
                                <div className="doc-actions">
                                  <button className="secondary-action" onClick={() => beginEditArchive(item)} type="button">수정</button>
                                  <button className="danger-action" onClick={() => handleDeleteArchive(item.id)} type="button">삭제</button>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <div className="empty-state">저장된 계정 아카이브가 없습니다. 첫 항목을 등록해 보세요.</div>
                        )}
                      </article>
                    </section>
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </main>

      {selectedDoc ? (
        <div className="detail-overlay" onClick={() => setSelectedDoc(null)} role="presentation">
          <aside className="detail-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="detail-header">
              <div>
                <p className="panel-kicker">Document Detail</p>
                <h3>{selectedDoc.title}</h3>
              </div>
              <button className="detail-close" onClick={() => setSelectedDoc(null)} type="button">×</button>
            </div>

            <div className="detail-meta">
              <span className={`pill ${selectedDoc.visibility === "private" ? "pill-private" : "pill-public"}`}>{visibilityLabel(selectedDoc.visibility)}</span>
              <span className="tag-chip">{selectedDoc.category}</span>
              <span className="tag-chip">{embeddingStatusLabel(selectedDoc.embedding_status)}</span>
              {(selectedDoc.tags ?? []).map((tag) => <span className="tag-chip" key={tag}>#{tag}</span>)}
            </div>

            <section className="detail-section">
              <h4>문서 정보</h4>
              <p>작성자: {selectedDoc.owner_email || "unknown"}</p>
              <p>수정일: {formatDate(selectedDoc.updated_at || selectedDoc.created_at)}</p>
            </section>

            <section className="detail-section">
              <h4>요약</h4>
              <p>{selectedDoc.summary || "요약 없음"}</p>
            </section>

            <section className="detail-section">
              <h4>문서 내용</h4>
              <pre>{selectedDoc.content}</pre>
            </section>

            <div className="detail-actions">
              {selectedDoc.notion_url ? (
                <a className="primary-action detail-link" href={selectedDoc.notion_url} rel="noreferrer" target="_blank">Notion 바로가기</a>
              ) : null}
              {isSelectedDocOwner ? (
                <button
                  className="secondary-action"
                  disabled={shareLoading}
                  onClick={() => handleToggleDocVisibility(selectedDoc.visibility === "private" ? "public" : "private")}
                  type="button"
                >
                  {shareLoading ? "변경 중..." : selectedDoc.visibility === "private" ? "Public으로 전환" : "Private으로 전환"}
                </button>
              ) : null}
              <button className="secondary-action" onClick={() => setSelectedDoc(null)} type="button">닫기</button>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
