"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const initialForm = {
  title: "",
  category: "",
  tags: "",
  notionUrl: "",
  visibility: "public",
  content: "",
};

const exampleQueries = [
  "ArgoCD 배포 오류 문서 찾아줘",
  "8080 포트 충돌 해결 방법",
  "QA 상태값 규칙 정리",
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

export default function Dashboard() {
  const [supabase, setSupabase] = useState(null);
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessProfile, setAccessProfile] = useState(null);
  const [pendingMembers, setPendingMembers] = useState([]);
  const [docs, setDocs] = useState([]);
  const [filters, setFilters] = useState({
    query: "",
    category: "all",
    visibility: "all",
  });
  const [sort, setSort] = useState("latest");
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [savingDoc, setSavingDoc] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchAnswer, setSearchAnswer] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchMessage, setSearchMessage] = useState("");
  const [generateAnswer, setGenerateAnswer] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [adminActionLoading, setAdminActionLoading] = useState("");
  const [retryLoading, setRetryLoading] = useState(false);

  const isApproved = accessProfile?.approval_status === "approved";
  const isAdmin = isApproved && accessProfile?.role === "admin";
  const retryCount = accessProfile?.retry_request_count ?? 0;
  const remainingRetries = Math.max(0, 3 - retryCount);

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
    if (isApproved) {
      void loadDocuments();
      return;
    }

    setDocs([]);
    setSelectedDoc(null);
  }, [isApproved]);

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
      void loadAccessState();
    }, 10000);

    return () => window.clearInterval(timer);
  }, [isAdmin]);

  async function loadAccessState() {
    setAccessLoading(true);

    try {
      const response = await fetch("/api/access", { cache: "no-store" });
      const payload = await response.json();

      setAccessProfile(payload.profile ?? null);
      setPendingMembers(payload.pendingMembers ?? []);
      return payload;
    } finally {
      setAccessLoading(false);
    }
  }

  async function loadDocuments() {
    setLoadingDocs(true);

    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        setSearchMessage(payload.error ?? "문서 목록을 불러오지 못했습니다.");
        return;
      }

      setDocs(payload.documents ?? []);
    } finally {
      setLoadingDocs(false);
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
    setSearchResults([]);
    setSearchAnswer("");
    setSelectedDoc(null);
    setAuthMessage("로그아웃되었습니다.");
    await loadAccessState();
  }

  async function handleReturnToLogin() {
    await handleSignOut();
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
        setAuthMessage(payload.error ?? "승인 처리에 실패했습니다.");
        return;
      }

      await loadAccessState();
    } finally {
      setAdminActionLoading("");
    }
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

  const categories = useMemo(() => {
    const counts = docs.reduce((acc, doc) => {
      if (!doc.category) return acc;
      acc[doc.category] = (acc[doc.category] || 0) + 1;
      return acc;
    }, {});

    return [
      { name: "all", count: docs.length },
      ...Object.entries(counts).map(([name, count]) => ({ name, count })),
    ];
  }, [docs]);

  const visibleDocs = useMemo(() => {
    const normalizedQuery = filters.query.trim().toLowerCase();
    const results = docs.filter((doc) => {
      if (filters.category !== "all" && doc.category !== filters.category) return false;
      if (filters.visibility !== "all" && doc.visibility !== filters.visibility) return false;
      if (!normalizedQuery) return true;

      const haystack = [doc.title, doc.category, doc.content, doc.summary, ...(doc.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });

    return results.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "ko");
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
    });
  }, [docs, filters, sort]);

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

  function beginEdit(doc) {
    setEditingId(doc.id);
    setForm({
      title: doc.title,
      category: doc.category,
      tags: (doc.tags ?? []).join(", "),
      notionUrl: doc.notion_url ?? "",
      visibility: doc.visibility,
      content: doc.content,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setForm(initialForm);
  }

  async function handleSaveDocument(event) {
    event.preventDefault();
    setSavingDoc(true);
    setSearchMessage("");

    try {
      const payload = {
        title: form.title,
        category: form.category,
        tags: form.tags,
        notionUrl: form.notionUrl,
        visibility: form.visibility,
        content: form.content,
      };

      const response = await fetch(editingId ? `/api/documents/${editingId}` : "/api/documents", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setSearchMessage(data.error ?? "문서를 저장하지 못했습니다.");
        return;
      }

      resetForm();
      await loadDocuments();
      setSearchMessage(
        data.embeddingStatus === "ready"
          ? "문서를 저장했고 임베딩 생성까지 완료했습니다."
          : "문서를 저장했습니다. OpenAI 키가 없으면 임베딩은 생성되지 않습니다."
      );
    } finally {
      setSavingDoc(false);
    }
  }

  async function handleDeleteDocument(id) {
    const ok = window.confirm("이 문서를 삭제할까요?");
    if (!ok) return;

    const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    const data = await response.json();

    if (!response.ok) {
      setSearchMessage(data.error ?? "문서를 삭제하지 못했습니다.");
      return;
    }

    if (selectedDoc?.id === id) setSelectedDoc(null);
    await loadDocuments();
    if (editingId === id) resetForm();
  }

  async function handleSemanticSearch() {
    if (!filters.query.trim()) {
      setSearchMessage("검색어를 먼저 입력해 주세요.");
      return;
    }

    setSearching(true);
    setSearchMessage("");

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: filters.query,
          category: filters.category,
          visibility: filters.visibility,
          generateAnswer,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setSearchAnswer("");
        setSearchResults([]);
        setSearchMessage(data.error ?? "AI 검색을 실행하지 못했습니다.");
        return;
      }

      setSearchAnswer(data.answer ?? "");
      setSearchResults(data.results ?? []);
      setSearchMessage(data.message ?? "");
    } finally {
      setSearching(false);
    }
  }

  function applyExampleQuery(query) {
    setFilters((current) => ({ ...current, query }));
    setSearchAnswer("");
    setSearchResults([]);
  }

  if (accessLoading) {
    return (
      <main className="gate-shell">
        <section className="gate-card">
          <p className="gate-kicker">Team Access</p>
          <h1>접속 권한을 확인하는 중입니다.</h1>
          <p>승인 상태와 계정 정보를 불러오고 있습니다.</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="gate-shell">
        <section className="gate-card">
          <p className="gate-kicker">Team Access</p>
          <h1>팀 전용 문서 포털</h1>
          <p>회원가입 후 이메일 인증과 관리자 승인이 완료되어야 문서 조회와 등록이 가능합니다.</p>

          <div className="gate-form">
            <input
              className="gate-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="이메일"
              type="email"
            />
            <input
              className="gate-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호"
              type="password"
            />
            <div className="gate-actions">
              <button className="primary-action" onClick={handleSignIn} type="button">
                로그인
              </button>
              <button className="secondary-action" onClick={handleSignUp} type="button">
                회원가입
              </button>
            </div>
            <div className="helper-banner">
              이메일 인증 전이면 "이메일 인증 전입니다", 승인 전이면 "관리자 승인이 필요합니다" 안내가 표시됩니다.
            </div>
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
          <p className="gate-kicker">Approval Pending</p>
          <h1>{approvalLabel(accessProfile?.approval_status)}</h1>
          <p>
            현재 계정은 <strong>{session.user.email}</strong> 입니다. 관리자 승인이 완료되면 문서 조회와 문서 등록이
            가능해집니다.
          </p>
          <div className={`status-pill ${isRejected ? "rejected" : ""}`}>
            {approvalLabel(accessProfile?.approval_status)}
          </div>
          <p className="gate-subtext">
            {isRejected ? "관리자 승인이 거절되었습니다." : "관리자 승인이 필요합니다."}
          </p>
          {isRejected ? (
            <p className="gate-subtext">재요청 가능 횟수: {remainingRetries}회 남음 (최대 3회)</p>
          ) : null}
          <div className="gate-actions">
            <button className="secondary-action" onClick={loadAccessState} type="button">
              상태 새로고침
            </button>
            {isRejected ? (
              <button
                className="primary-action"
                disabled={retryLoading || remainingRetries <= 0}
                onClick={handleRetryApprovalRequest}
                type="button"
              >
                {retryLoading ? "재요청 중..." : remainingRetries > 0 ? "관리자 승인 재요청" : "재요청 횟수 소진"}
              </button>
            ) : null}
            <button className="secondary-action" onClick={handleReturnToLogin} type="button">
              로그인 페이지로
            </button>
            <button className="ghost-link" onClick={handleSignOut} type="button">
              로그아웃
            </button>
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
              <p className="brand-subtitle">업무 문서 검색 비서</p>
            </div>
          </div>

          <section className="sidebar-section sidebar-auth">
            <div className="sidebar-header-row">
              <div>
                <p className="sidebar-kicker">Auth</p>
                <p className="sidebar-title">계정 상태</p>
              </div>
              <span className={`sidebar-badge ${session ? "sidebar-badge-active" : ""}`}>
                {isAdmin ? "admin" : "member"}
              </span>
            </div>

            <div className="stack">
              <p className="sidebar-note">{session.user.email} 계정으로 승인 완료되었습니다.</p>
              <p className="sidebar-note">
                권한: {isAdmin ? "관리자" : "일반 사용자"} / 상태: {approvalLabel(accessProfile?.approval_status)}
              </p>
              <button className="sidebar-button sidebar-button-ghost" onClick={handleSignOut} type="button">
                로그아웃
              </button>
              {authMessage ? <p className="sidebar-help">{authMessage}</p> : null}
            </div>
          </section>

          <section className="sidebar-section">
            <div className="sidebar-header-row">
              <div>
                <p className="sidebar-kicker">Categories</p>
                <p className="sidebar-title">카테고리</p>
              </div>
              <span className="sidebar-badge">auto</span>
            </div>

            <div className="category-list">
              {categories.map((item) => (
                <button
                  key={item.name}
                  className={`category-button-dark ${filters.category === item.name ? "active" : ""}`}
                  onClick={() => setFilters((current) => ({ ...current, category: item.name }))}
                  type="button"
                >
                  <span>{item.name === "all" ? "전체" : item.name}</span>
                  <small>{item.count}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="sidebar-section">
            <p className="sidebar-kicker">Try search</p>
            <div className="example-list">
              {exampleQueries.map((query) => (
                <button key={query} className="example-button" onClick={() => applyExampleQuery(query)} type="button">
                  {query}
                </button>
              ))}
            </div>
          </section>
        </aside>

        <div className="app-main">
          <header className="mobile-header">
            <div className="brand-block">
              <div className="brand-mark">W</div>
              <div>
                <h1 className="brand-title">WorkNote AI</h1>
                <p className="brand-subtitle">업무 문서 검색 비서</p>
              </div>
            </div>
          </header>

          {isAdmin ? (
            <section className="admin-panel">
              <div className="admin-panel-header">
                <div>
                  <p className="panel-kicker">Admin Approval</p>
                  <h3>사용자 승인 대기 목록</h3>
                </div>
                <div className="inline-meta">
                  <button className="secondary-action" onClick={loadAccessState} type="button">
                    목록 새로고침
                  </button>
                  <span className="count-chip">{pendingMembers.length} pending</span>
                </div>
              </div>

              {pendingMembers.length ? (
                <div className="approval-list">
                  {pendingMembers.map((member) => (
                    <article className="approval-card" key={member.user_id}>
                      <div>
                        <h4>{member.email}</h4>
                        <p>가입일: {formatDate(member.created_at)}</p>
                        <p>재요청 횟수: {member.retry_request_count ?? 0}/3</p>
                        <p>마지막 요청: {formatDate(member.last_requested_at || member.updated_at || member.created_at)}</p>
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
                <div className="empty-state compact">현재 승인 대기 중인 사용자가 없습니다.</div>
              )}
            </section>
          ) : null}

          <section className="hero-card">
            <div className="hero-floating-badge">Notion-ready Knowledge Assistant</div>
            <p className="hero-kicker">AI document search</p>
            <h2 className="hero-heading">흩어진 회의록과 장애 대응 문서를 빠르게 찾는 AI 문서 검색 서비스</h2>
            <p className="hero-description">
              이 사이트는 관리자 승인을 받은 팀원만 접근할 수 있습니다. 그 안에서 public 문서는 팀원 전체가,
              private 문서는 작성자 본인만 볼 수 있습니다.
            </p>

            <div className="hero-stats">
              <div className="hero-stat-card">
                <p className="hero-stat-label">Visible Docs</p>
                <strong>{stats.total}</strong>
              </div>
              <div className="hero-stat-card">
                <p className="hero-stat-label">Public</p>
                <strong>{stats.publicDocs}</strong>
              </div>
              <div className="hero-stat-card">
                <p className="hero-stat-label">Private</p>
                <strong>{stats.privateDocs}</strong>
              </div>
              <div className="hero-stat-card hero-stat-dark">
                <p className="hero-stat-label">Embeddings</p>
                <strong>{stats.readyDocs}</strong>
              </div>
            </div>
          </section>

          <section className="search-shell">
            <div className="search-grid">
              <div className="search-input-wrap">
                <span className="search-icon">⌕</span>
                <input
                  className="search-input"
                  placeholder="예: Jenkins에서 브랜치 배포 전 확인할 문서 찾아줘"
                  value={filters.query}
                  onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                />
              </div>

              <div className="search-controls">
                <select
                  className="search-select"
                  value={filters.category}
                  onChange={(e) => setFilters((current) => ({ ...current, category: e.target.value }))}
                >
                  <option value="all">전체 카테고리</option>
                  {categories
                    .filter((item) => item.name !== "all")
                    .map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                </select>
                <select
                  className="search-select"
                  value={filters.visibility}
                  onChange={(e) => setFilters((current) => ({ ...current, visibility: e.target.value }))}
                >
                  <option value="all">전체 범위</option>
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
                <select className="search-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="latest">최신순</option>
                  <option value="title">제목순</option>
                </select>
                <button className="search-reset" onClick={resetForm} type="button">
                  작성 초기화
                </button>
              </div>
            </div>

            <div className="search-actions">
              <button className="primary-action" onClick={handleSemanticSearch} type="button" disabled={searching}>
                {searching ? "검색 중..." : "AI 검색"}
              </button>
              <button
                className="secondary-action"
                onClick={() => {
                  setSearchAnswer("");
                  setSearchResults([]);
                  setFilters({ query: "", category: "all", visibility: "all" });
                }}
                type="button"
              >
                검색 초기화
              </button>
              <label className="toggle-row">
                <input checked={generateAnswer} onChange={(e) => setGenerateAnswer(e.target.checked)} type="checkbox" />
                <span>답변 요약 함께 생성</span>
              </label>
            </div>
          </section>

          <section className="summary-card">
            <div className="summary-icon">AI</div>
            <div>
              <p className="summary-kicker">AI 추천 요약</p>
              <p className="summary-text">
                {searchMessage || "검색어를 입력하면 의미 기반으로 관련 문서를 찾고, 원하면 답변 요약까지 함께 생성합니다."}
              </p>
            </div>
          </section>

          <section className="content-grid">
            <aside className="composer-panel">
              <div className="panel-heading">
                <p className="panel-kicker">New Document</p>
                <h3>{editingId ? "문서 수정" : "문서 등록"}</h3>
                <p>승인된 사용자만 문서를 등록하거나 수정할 수 있습니다.</p>
              </div>

              <form className="form-card" onSubmit={handleSaveDocument}>
                <input
                  className="form-input"
                  placeholder="제목"
                  value={form.title}
                  onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                  required
                />
                <input
                  className="form-input"
                  placeholder="카테고리"
                  value={form.category}
                  onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))}
                  required
                />
                <input
                  className="form-input"
                  placeholder="태그 (쉼표로 구분)"
                  value={form.tags}
                  onChange={(e) => setForm((current) => ({ ...current, tags: e.target.value }))}
                />
                <input
                  className="form-input"
                  placeholder="Notion 링크"
                  type="url"
                  value={form.notionUrl}
                  onChange={(e) => setForm((current) => ({ ...current, notionUrl: e.target.value }))}
                />
                <select
                  className="form-input"
                  value={form.visibility}
                  onChange={(e) => setForm((current) => ({ ...current, visibility: e.target.value }))}
                >
                  <option value="public">Public - 팀원 모두 검색 가능</option>
                  <option value="private">Private - 작성자만 검색 가능</option>
                </select>
                <textarea
                  className="form-textarea"
                  placeholder="문서 내용을 적어 주세요."
                  value={form.content}
                  onChange={(e) => setForm((current) => ({ ...current, content: e.target.value }))}
                  required
                />
                <div className="form-actions">
                  <button className="primary-action" disabled={savingDoc} type="submit">
                    {savingDoc ? "저장 중..." : editingId ? "수정 저장" : "저장하기"}
                  </button>
                  <button className="secondary-action" onClick={resetForm} type="button">
                    입력 비우기
                  </button>
                </div>
              </form>
            </aside>

            <section className="results-panel">
              {searchAnswer ? (
                <article className="answer-card-ui">
                  <p className="panel-kicker">Generated Answer</p>
                  <h3>AI 요약 답변</h3>
                  <pre>{searchAnswer}</pre>
                </article>
              ) : null}

              {searchResults.length ? (
                <article className="section-card">
                  <div className="section-card-header">
                    <div>
                      <p className="panel-kicker">Semantic Matches</p>
                      <h3>AI 검색 결과</h3>
                    </div>
                    <span className="count-chip">{searchResults.length} docs</span>
                  </div>

                  <div className="search-result-list">
                    {searchResults.map((result) => (
                      <article className="search-result-item" key={result.document_id}>
                        <div className="inline-meta">
                          <span className={`pill ${result.visibility === "private" ? "pill-private" : "pill-public"}`}>
                            {visibilityLabel(result.visibility)}
                          </span>
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
                  <div>
                    <p className="panel-kicker">Documents</p>
                    <h3>접근 가능한 문서 목록</h3>
                  </div>
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
                            <span className={`pill ${doc.visibility === "private" ? "pill-private" : "pill-public"}`}>
                              {visibilityLabel(doc.visibility)}
                            </span>
                            <span className="tag-chip">{doc.category}</span>
                          </div>
                          <span className="tag-chip">{embeddingStatusLabel(doc.embedding_status)}</span>
                        </div>

                        <h4>{doc.title}</h4>
                        <p>{doc.summary || "요약 없음"}</p>

                        <div className="tag-list">
                          {(doc.tags ?? []).map((tag) => (
                            <span className="tag-chip" key={tag}>
                              #{tag}
                            </span>
                          ))}
                        </div>

                        <div className="doc-meta-text">
                          <span>작성자: {doc.owner_email || "unknown"}</span>
                          <span>수정일: {formatDate(doc.updated_at || doc.created_at)}</span>
                        </div>

                        <div className="doc-actions">
                          <button className="primary-action" onClick={() => setSelectedDoc(doc)} type="button">
                            자세히 보기
                          </button>
                          <button className="secondary-action" onClick={() => beginEdit(doc)} type="button">
                            수정
                          </button>
                          <button className="danger-action" onClick={() => handleDeleteDocument(doc.id)} type="button">
                            삭제
                          </button>
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
              <button className="detail-close" onClick={() => setSelectedDoc(null)} type="button">
                ×
              </button>
            </div>

            <div className="detail-meta">
              <span className={`pill ${selectedDoc.visibility === "private" ? "pill-private" : "pill-public"}`}>
                {visibilityLabel(selectedDoc.visibility)}
              </span>
              <span className="tag-chip">{selectedDoc.category}</span>
              <span className="tag-chip">{embeddingStatusLabel(selectedDoc.embedding_status)}</span>
              {(selectedDoc.tags ?? []).map((tag) => (
                <span className="tag-chip" key={tag}>
                  #{tag}
                </span>
              ))}
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
                <a className="primary-action detail-link" href={selectedDoc.notion_url} rel="noreferrer" target="_blank">
                  Notion 바로가기
                </a>
              ) : null}
              <button className="secondary-action" onClick={() => setSelectedDoc(null)} type="button">
                닫기
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
