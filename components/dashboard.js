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

export default function Dashboard() {
  const [supabase, setSupabase] = useState(null);
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [docs, setDocs] = useState([]);
  const [filters, setFilters] = useState({
    query: "",
    category: "all",
    visibility: "all",
  });
  const [sort, setSort] = useState("latest");
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [savingDoc, setSavingDoc] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchAnswer, setSearchAnswer] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchMessage, setSearchMessage] = useState("");
  const [generateAnswer, setGenerateAnswer] = useState(true);

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
    void loadDocuments();
  }, [session]);

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
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    setAuthMessage(
      error
        ? error.message
        : "회원가입 요청을 보냈습니다. Supabase 설정에 따라 이메일 확인 또는 즉시 로그인될 수 있습니다."
    );
  }

  async function handleSignIn() {
    if (!supabase) return;
    setAuthMessage("");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setAuthMessage(error ? error.message : "로그인되었습니다.");
    if (!error) {
      await loadDocuments();
    }
  }

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSearchResults([]);
    setSearchAnswer("");
    setAuthMessage("로그아웃되었습니다.");
    await loadDocuments();
  }

  const categories = useMemo(() => {
    const counts = docs.reduce((acc, doc) => {
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

    const response = await fetch(`/api/documents/${id}`, {
      method: "DELETE",
    });
    const data = await response.json();

    if (!response.ok) {
      setSearchMessage(data.error ?? "문서를 삭제하지 못했습니다.");
      return;
    }

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

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <span className="badge">Next.js + Supabase + OpenAI</span>
            <h1 className="headline">
              공개 문서와 내 문서를
              <br />
              같이 검색하는 실제 서비스형 데모
            </h1>
            <p className="subtle">
              Supabase Auth로 로그인하고, 문서를 저장하면 서버에서 임베딩을 생성해 semantic search를 수행합니다.
              검색 결과는 항상 <code>public OR owner_id = current_user</code> 범위로 제한됩니다.
            </p>
          </div>

          <div className="auth-card">
            <div className="topbar">
              <div>
                <p className="section-title">Auth</p>
                <h2 style={{ margin: "10px 0 0" }}>사용자 로그인</h2>
              </div>
              <span className={`pill ${session ? "pill-public" : "pill-private"}`}>
                {session ? "Signed in" : "Guest"}
              </span>
            </div>

            <div className="auth-actions" style={{ marginTop: 16 }}>
              <input
                className="input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="이메일"
                type="email"
              />
              <input
                className="input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호"
                type="password"
              />
              <div className="inline-row">
                <button className="button button-primary" onClick={handleSignIn} type="button">
                  로그인
                </button>
                <button className="button button-secondary" onClick={handleSignUp} type="button">
                  회원가입
                </button>
                {session ? (
                  <button className="button button-ghost" onClick={handleSignOut} type="button">
                    로그아웃
                  </button>
                ) : null}
              </div>
              <div className="helper">
                {session?.user?.email
                  ? `${session.user.email} 계정으로 로그인되어 있습니다.`
                  : "로그인하지 않으면 public 문서만 볼 수 있습니다."}
              </div>
              {authMessage ? <p className="muted">{authMessage}</p> : null}
            </div>
          </div>
        </div>

        <div className="stats">
          <div className="stat-card">
            <span className="section-title">Visible Docs</span>
            <strong>{stats.total}</strong>
          </div>
          <div className="stat-card">
            <span className="section-title">Public</span>
            <strong>{stats.publicDocs}</strong>
          </div>
          <div className="stat-card">
            <span className="section-title">Private</span>
            <strong>{stats.privateDocs}</strong>
          </div>
          <div className="stat-card">
            <span className="section-title">Embeddings Ready</span>
            <strong>{stats.readyDocs}</strong>
          </div>
        </div>
      </section>

      <section className="panel toolbar">
        <div className="toolbar-grid">
          <input
            className="input"
            placeholder="예: Jenkins 배포 실패 원인 문서 찾아줘"
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
          />
          <select
            className="select"
            value={filters.category}
            onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}
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
            className="select"
            value={filters.visibility}
            onChange={(event) => setFilters((current) => ({ ...current, visibility: event.target.value }))}
          >
            <option value="all">전체 범위</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
          <select className="select" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="latest">최신순</option>
            <option value="title">제목순</option>
          </select>
        </div>

        <div className="inline-row">
          <button className="button button-primary" onClick={handleSemanticSearch} type="button" disabled={searching}>
            {searching ? "검색 중..." : "AI 검색"}
          </button>
          <button
            className="button button-ghost"
            onClick={() => {
              setSearchAnswer("");
              setSearchResults([]);
              setFilters({ query: "", category: "all", visibility: "all" });
            }}
            type="button"
          >
            검색 초기화
          </button>
          <label className="inline-row muted" style={{ marginLeft: 4 }}>
            <input
              checked={generateAnswer}
              onChange={(event) => setGenerateAnswer(event.target.checked)}
              type="checkbox"
            />
            답변 요약도 함께 생성
          </label>
        </div>

        {searchMessage ? (
          <div className={searchMessage.includes("OpenAI") ? "helper warn" : "helper"}>{searchMessage}</div>
        ) : null}
      </section>

      <section className="two-col">
        <aside className="panel sidebar stack">
          <div>
            <p className="section-title">Composer</p>
            <h2 style={{ margin: "10px 0 0" }}>{editingId ? "문서 수정" : "새 문서 등록"}</h2>
            <p className="muted">문서를 저장하거나 수정하면 서버에서 chunking 후 임베딩을 다시 생성합니다.</p>
          </div>

          {!session ? (
            <div className="helper warn">문서를 저장하거나 수정하려면 먼저 로그인해야 합니다.</div>
          ) : null}

          <form className="composer-card form-grid" onSubmit={handleSaveDocument}>
            <input
              className="input"
              placeholder="문서 제목"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              required
            />
            <input
              className="input"
              placeholder="카테고리"
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              required
            />
            <input
              className="input"
              placeholder="태그 (쉼표로 구분)"
              value={form.tags}
              onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
            />
            <input
              className="input"
              placeholder="Notion 링크"
              type="url"
              value={form.notionUrl}
              onChange={(event) => setForm((current) => ({ ...current, notionUrl: event.target.value }))}
            />
            <select
              className="select"
              value={form.visibility}
              onChange={(event) => setForm((current) => ({ ...current, visibility: event.target.value }))}
            >
              <option value="public">Public - 누구나 검색 가능</option>
              <option value="private">Private - 작성자만 검색 가능</option>
            </select>
            <textarea
              className="textarea"
              placeholder="업무 문서 내용을 입력해 주세요."
              value={form.content}
              onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
              required
            />
            <div className="inline-row">
              <button className="button button-primary" disabled={!session || savingDoc} type="submit">
                {savingDoc ? "저장 중..." : editingId ? "수정 저장" : "문서 저장"}
              </button>
              <button className="button button-secondary" onClick={resetForm} type="button">
                입력 초기화
              </button>
            </div>
          </form>

          <div>
            <p className="section-title">Categories</p>
            <div className="category-list" style={{ marginTop: 12 }}>
              {categories.map((item) => (
                <button
                  key={item.name}
                  className={`category-button ${filters.category === item.name ? "active" : ""}`}
                  onClick={() => setFilters((current) => ({ ...current, category: item.name }))}
                  type="button"
                >
                  <span>{item.name === "all" ? "전체" : item.name}</span>
                  <small>{item.count}</small>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="stack">
          {searchAnswer ? (
            <article className="answer-card">
              <div className="topbar">
                <div>
                  <p className="section-title">Generated Answer</p>
                  <h2 style={{ margin: "10px 0 0" }}>AI 요약 답변</h2>
                </div>
              </div>
              <pre className="muted" style={{ marginTop: 16 }}>{searchAnswer}</pre>
            </article>
          ) : null}

          {searchResults.length ? (
            <article className="panel content">
              <div className="topbar">
                <div>
                  <p className="section-title">Semantic Matches</p>
                  <h2 style={{ margin: "10px 0 0" }}>AI 검색 결과</h2>
                </div>
                <span className="chip">{searchResults.length} docs</span>
              </div>

              <div className="result-list" style={{ marginTop: 16 }}>
                {searchResults.map((result) => (
                  <div className="search-result-card" key={result.document_id}>
                    <div className="topbar">
                      <div className="inline-row">
                        <span className={`pill ${result.visibility === "private" ? "pill-private" : "pill-public"}`}>
                          {visibilityLabel(result.visibility)}
                        </span>
                        <span className="chip">{result.category}</span>
                        <span className="chip">score {Math.round((result.score ?? 0) * 100)}%</span>
                      </div>
                    </div>
                    <h3>{result.title}</h3>
                    <p className="muted">{result.summary || "요약 없음"}</p>
                    <pre className="muted" style={{ marginTop: 12 }}>{result.snippet}</pre>
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          <article className="panel content">
            <div className="topbar">
              <div>
                <p className="section-title">Documents</p>
                <h2 style={{ margin: "10px 0 0" }}>내가 접근 가능한 문서 목록</h2>
              </div>
              <span className="chip">{loadingDocs ? "loading..." : `${visibleDocs.length} visible`}</span>
            </div>

            {loadingDocs ? (
              <div className="empty">문서를 불러오는 중입니다.</div>
            ) : visibleDocs.length ? (
              <div className="doc-grid" style={{ marginTop: 16 }}>
                {visibleDocs.map((doc) => (
                  <article className="doc-card" key={doc.id}>
                    <div className="topbar">
                      <div className="inline-row">
                        <span className={`pill ${doc.visibility === "private" ? "pill-private" : "pill-public"}`}>
                          {visibilityLabel(doc.visibility)}
                        </span>
                        <span className="chip">{doc.category}</span>
                      </div>
                      <span className="chip">{doc.embedding_status}</span>
                    </div>

                    <h3>{doc.title}</h3>
                    <p className="muted">{doc.summary || "요약 없음"}</p>

                    <div className="chip-row">
                      {(doc.tags ?? []).map((tag) => (
                        <span className="chip" key={tag}>
                          #{tag}
                        </span>
                      ))}
                    </div>

                    <p className="muted">
                      작성자: {doc.owner_email || "unknown"}
                      <br />
                      수정일: {formatDate(doc.updated_at || doc.created_at)}
                    </p>

                    <div className="inline-row">
                      <button className="button button-secondary" onClick={() => beginEdit(doc)} type="button">
                        수정
                      </button>
                      <button className="button button-danger" onClick={() => handleDeleteDocument(doc.id)} type="button">
                        삭제
                      </button>
                      {doc.notion_url ? (
                        <a className="button button-ghost" href={doc.notion_url} rel="noreferrer" target="_blank">
                          Notion
                        </a>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty">조건에 맞는 문서가 없습니다. public 문서를 만들거나 로그인 후 private 문서를 추가해 보세요.</div>
            )}
          </article>

          <p className="footer-note">
            이 버전은 브라우저 localStorage 데모가 아니라, Supabase DB를 기준으로 사용자별 문서와 권한을 다루는 구조입니다.
            AI 검색은 OpenAI 임베딩을 사용하고, 선택적으로 검색 결과 요약 답변도 생성합니다.
          </p>
        </section>
      </section>
    </main>
  );
}
