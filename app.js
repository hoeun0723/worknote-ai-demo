const STORAGE_KEY = "worknote-ai-docs-v2";
const USER_KEY = "worknote-ai-current-user";

const seedDocuments = [
  {
    id: crypto.randomUUID(),
    title: "ArgoCD manifest generate error 정리",
    category: "Kubernetes / ArgoCD",
    tags: ["ArgoCD", "Kubernetes", "배포", "manifest"],
    url: "https://www.notion.so/",
    content:
      "ArgoCD에서 manifest generate error가 발생하면 repo-server 로그와 application sync 상태를 먼저 확인한다. Helm values 경로, Kustomize 설정, Git credential, branch 경로를 점검하고 Jenkins 빌드 이후 태그가 정상 반영되었는지 순서대로 본다.",
    visibility: "public",
    ownerId: "system",
    ownerName: "공용 문서",
    createdAt: "2026-07-09T09:10:00.000Z",
  },
  {
    id: crypto.randomUUID(),
    title: "Jenkins 브랜치 배포 트리거 확인 방법",
    category: "Jenkins / CI-CD",
    tags: ["Jenkins", "GitLab", "Webhook", "배포"],
    url: "https://www.notion.so/",
    content:
      "GitLab push 이후 Jenkins가 실행되지 않으면 webhook 설정, credential, Jenkinsfile branch 조건, executor 대기 상태를 확인한다. 특정 브랜치만 배포하려면 pipeline checkout branch 조건과 멀티브랜치 설정을 함께 본다.",
    visibility: "public",
    ownerId: "system",
    ownerName: "공용 문서",
    createdAt: "2026-07-08T12:25:00.000Z",
  },
  {
    id: crypto.randomUUID(),
    title: "localhost 8080 포트 충돌 해결",
    category: "개발환경 / Spring Boot",
    tags: ["8080", "Spring Boot", "port", "kill"],
    url: "https://www.notion.so/",
    content:
      "Spring Boot 실행 중 8080 포트가 이미 사용 중이면 해당 포트를 점유한 프로세스를 찾고 종료한다. Windows에서는 netstat -ano와 taskkill 명령으로 점검할 수 있다.",
    visibility: "public",
    ownerId: "system",
    ownerName: "공용 문서",
    createdAt: "2026-07-02T08:20:00.000Z",
  },
  {
    id: crypto.randomUUID(),
    title: "QA 요청 상태 규칙 정리",
    category: "QA / 협업",
    tags: ["QA", "상태값", "요청", "협업"],
    url: "https://www.notion.so/",
    content:
      "QA 시트의 상태값은 작업 상태를 뜻하는지, 상대 팀에게 요청 중인 상태를 뜻하는지 먼저 합의해야 한다. 컬럼 의미가 혼재되면 완료 기준과 커뮤니케이션 책임이 흐려진다.",
    visibility: "public",
    ownerId: "system",
    ownerName: "공용 문서",
    createdAt: "2026-07-01T07:15:00.000Z",
  },
  {
    id: crypto.randomUUID(),
    title: "내 개인 체크리스트: 배포 전 확인 항목",
    category: "개인 메모 / 배포",
    tags: ["체크리스트", "private", "배포"],
    url: "",
    content:
      "운영 배포 전 환경 변수, 캐시 초기화 필요 여부, 롤백 절차, 담당자 연락처를 다시 확인한다. 이 문서는 개인용이라 public으로 노출하지 않는다.",
    visibility: "private",
    ownerId: "demo@worknote.ai",
    ownerName: "demo@worknote.ai",
    createdAt: "2026-07-08T05:35:00.000Z",
  },
];

const synonymMap = {
  배포: ["deploy", "deployment", "jenkins", "argocd", "kubernetes", "release"],
  오류: ["error", "failed", "exception", "문제", "충돌"],
  포트: ["8080", "localhost", "spring", "boot", "server"],
  문서: ["notion", "기록", "정리", "메모"],
  qa: ["테스트", "상태값", "확인", "요청"],
  개인: ["private", "나만", "개인용"],
};

let documents = loadDocuments();
let currentUser = loadCurrentUser();
let currentCategory = "all";
let currentQuery = "";
let currentVisibility = "all";

const elements = {
  docCount: document.getElementById("docCount"),
  publicCount: document.getElementById("publicCount"),
  privateCount: document.getElementById("privateCount"),
  categoryList: document.getElementById("categoryList"),
  categoryFilter: document.getElementById("categoryFilter"),
  visibilityFilter: document.getElementById("visibilityFilter"),
  sortFilter: document.getElementById("sortFilter"),
  resultGrid: document.getElementById("resultGrid"),
  searchInput: document.getElementById("searchInput"),
  searchBtn: document.getElementById("searchBtn"),
  mobileSearchBtn: document.getElementById("mobileSearchBtn"),
  resetBtn: document.getElementById("resetBtn"),
  aiMessage: document.getElementById("aiMessage"),
  newDocBtn: document.getElementById("newDocBtn"),
  mobileNewDocBtn: document.getElementById("mobileNewDocBtn"),
  docModal: document.getElementById("docModal"),
  closeModalBtn: document.getElementById("closeModalBtn"),
  docForm: document.getElementById("docForm"),
  visibilityInput: document.getElementById("visibilityInput"),
  privateHint: document.getElementById("privateHint"),
  detailDrawer: document.getElementById("detailDrawer"),
  closeDrawerBtn: document.getElementById("closeDrawerBtn"),
  detailTitle: document.getElementById("detailTitle"),
  detailMeta: document.getElementById("detailMeta"),
  detailSummary: document.getElementById("detailSummary"),
  detailContent: document.getElementById("detailContent"),
  detailLink: document.getElementById("detailLink"),
  authStatus: document.getElementById("authStatus"),
  authBadge: document.getElementById("authBadge"),
  loginNameInput: document.getElementById("loginNameInput"),
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  mobileLoginNameInput: document.getElementById("mobileLoginNameInput"),
  mobileLoginBtn: document.getElementById("mobileLoginBtn"),
  mobileLogoutBtn: document.getElementById("mobileLogoutBtn"),
  mobileAuthStatus: document.getElementById("mobileAuthStatus"),
};

function escapeHTML(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function loadDocuments() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedDocuments));
    return [...seedDocuments];
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [...seedDocuments];
  } catch {
    return [...seedDocuments];
  }
}

function saveDocuments() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
}

function loadCurrentUser() {
  const saved = localStorage.getItem(USER_KEY);
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved);
    return parsed && parsed.id && parsed.name ? parsed : null;
  } catch {
    return null;
  }
}

function saveCurrentUser() {
  if (currentUser) {
    localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
    return;
  }

  localStorage.removeItem(USER_KEY);
}

function slugifyUserId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?()[\]{}'"`~:;|/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  const normalized = normalize(text);
  if (!normalized) return [];

  const baseTokens = normalized.split(" ").filter(Boolean);
  const expanded = [...baseTokens];

  baseTokens.forEach((token) => {
    Object.entries(synonymMap).forEach(([key, values]) => {
      const lowerValues = values.map((value) => value.toLowerCase());
      if (token.includes(key) || lowerValues.some((value) => token.includes(value))) {
        expanded.push(key, ...lowerValues);
      }
    });
  });

  return [...new Set(expanded)].filter((token) => token.length > 1);
}

function summarize(content) {
  const clean = String(content || "").trim();
  if (clean.length <= 100) return clean;

  const firstSentence = clean.split(/[.!?\n]/)[0];
  if (firstSentence.length >= 35 && firstSentence.length <= 130) return `${firstSentence}.`;
  return `${clean.slice(0, 120)}...`;
}

function getDocText(doc) {
  return `${doc.title} ${doc.category} ${(doc.tags || []).join(" ")} ${doc.content} ${doc.visibility}`;
}

function scoreDocument(doc, query) {
  if (!query) return 100;

  const queryTokens = tokenize(query);
  const docText = normalize(getDocText(doc));
  const docTokens = tokenize(getDocText(doc));
  const docTokenSet = new Set(docTokens);

  let score = 0;
  queryTokens.forEach((token) => {
    if (docTokenSet.has(token)) score += 18;
    else if (docText.includes(token)) score += 10;
  });

  const title = normalize(doc.title);
  const category = normalize(doc.category);
  const tags = normalize((doc.tags || []).join(" "));

  queryTokens.forEach((token) => {
    if (title.includes(token)) score += 14;
    if (category.includes(token)) score += 8;
    if (tags.includes(token)) score += 10;
  });

  const coverage = queryTokens.length ? score / (queryTokens.length * 22) : 1;
  return Math.min(99, Math.max(0, Math.round(coverage * 100)));
}

function getVisibleDocuments() {
  return documents.filter((doc) => {
    if (doc.visibility === "public") return true;
    return currentUser && doc.ownerId === currentUser.id;
  });
}

function getCategories() {
  const counts = getVisibleDocuments().reduce((acc, doc) => {
    acc[doc.category] = (acc[doc.category] || 0) + 1;
    return acc;
  }, {});

  return [
    { name: "all", label: "전체", count: getVisibleDocuments().length },
    ...Object.entries(counts).map(([name, count]) => ({ name, label: name, count })),
  ];
}

function renderAuth() {
  if (currentUser) {
    elements.authStatus.textContent = `${currentUser.name} 님으로 로그인됨`;
    elements.authBadge.textContent = "member";
    elements.mobileAuthStatus.textContent = `${currentUser.name} 님으로 로그인됨`;
    elements.loginNameInput.value = currentUser.name;
    elements.mobileLoginNameInput.value = currentUser.name;
  } else {
    elements.authStatus.textContent = "로그인하지 않음";
    elements.authBadge.textContent = "guest";
    elements.mobileAuthStatus.textContent = "로그인하지 않음";
    elements.loginNameInput.value = "";
    elements.mobileLoginNameInput.value = "";
  }
}

function updatePrivateHint() {
  if (!currentUser) {
    elements.privateHint.textContent = "문서를 저장하려면 먼저 로그인해야 합니다. Public도 작성자는 로그인 사용자 기준으로 저장됩니다.";
    elements.privateHint.className = "rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-700";
    return;
  }

  if (elements.visibilityInput.value === "private") {
    elements.privateHint.textContent = `이 문서는 ${currentUser.name} 계정의 private 문서로 저장됩니다.`;
    elements.privateHint.className = "rounded-2xl bg-cyan-50 px-4 py-3 text-sm font-semibold leading-6 text-cyan-700";
    return;
  }

  elements.privateHint.textContent = `이 문서는 ${currentUser.name} 님이 등록한 public 문서로 저장되고, 다른 사용자도 검색할 수 있습니다.`;
  elements.privateHint.className = "rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold leading-6 text-slate-600";
}

function renderCategories() {
  const categories = getCategories();

  if (elements.categoryList) {
    elements.categoryList.innerHTML = categories
      .map((category) => {
        const isActive = currentCategory === category.name;
        return `
          <button class="category-item group flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition ${
            isActive
              ? "border-cyan-300/40 bg-cyan-300/15 text-white"
              : "border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/[0.10]"
          }" data-category="${escapeHTML(category.name)}">
            <span class="truncate text-sm font-black">${escapeHTML(category.label)}</span>
            <small class="grid h-7 min-w-7 place-items-center rounded-full ${isActive ? "bg-cyan-300 text-slate-950" : "bg-white/10 text-slate-400"} px-2 text-xs font-black">${category.count}</small>
          </button>
        `;
      })
      .join("");
  }

  elements.categoryFilter.innerHTML = categories
    .map((category) => `<option value="${escapeHTML(category.name)}">${escapeHTML(category.label)}</option>`)
    .join("");
  elements.categoryFilter.value = categories.some((category) => category.name === currentCategory) ? currentCategory : "all";
}

function getFilteredDocuments() {
  let result = getVisibleDocuments().map((doc) => ({ ...doc, score: scoreDocument(doc, currentQuery) }));

  if (currentCategory !== "all") {
    result = result.filter((doc) => doc.category === currentCategory);
  }

  if (currentVisibility !== "all") {
    result = result.filter((doc) => doc.visibility === currentVisibility);
  }

  if (currentQuery) {
    result = result.filter((doc) => doc.score > 0);
  }

  const sortValue = elements.sortFilter.value;
  if (sortValue === "latest") {
    result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else if (sortValue === "title") {
    result.sort((a, b) => a.title.localeCompare(b.title, "ko"));
  } else {
    result.sort((a, b) => b.score - a.score || new Date(b.createdAt) - new Date(a.createdAt));
  }

  return result;
}

function formatDate(isoDate) {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(isoDate));
  } catch {
    return "날짜 없음";
  }
}

function visibilityBadge(doc) {
  if (doc.visibility === "public") {
    return '<span class="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">Public</span>';
  }

  return '<span class="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700">Private</span>';
}

function ownerLabel(doc) {
  if (doc.visibility === "public") return "공용 문서";
  return doc.ownerName || "개인 문서";
}

function renderDocuments() {
  const visibleDocuments = getVisibleDocuments();
  const filtered = getFilteredDocuments();
  const publicCount = visibleDocuments.filter((doc) => doc.visibility === "public").length;
  const privateCount = visibleDocuments.filter((doc) => doc.visibility === "private").length;

  elements.docCount.textContent = visibleDocuments.length;
  elements.publicCount.textContent = publicCount;
  elements.privateCount.textContent = privateCount;

  if (!filtered.length) {
    elements.resultGrid.innerHTML = `
      <div class="md:col-span-2 xl:col-span-3 rounded-[2rem] border border-dashed border-white/20 bg-white/[0.88] p-12 text-center shadow-soft backdrop-blur-2xl">
        <div class="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-slate-950 text-2xl text-cyan-200">?</div>
        <h3 class="mt-5 text-2xl font-black tracking-tight text-slate-950">조건에 맞는 문서를 찾지 못했습니다.</h3>
        <p class="mx-auto mt-3 max-w-md text-sm font-medium leading-7 text-slate-500">검색어를 바꾸거나 카테고리, 공개 범위를 다시 선택해 보세요. private 문서를 찾는 중이라면 로그인 사용자도 함께 확인하면 좋습니다.</p>
      </div>
    `;
    elements.aiMessage.textContent = currentUser
      ? "지금은 public 문서와 내 private 문서 안에서만 검색하고 있습니다. 조건을 조금 넓혀보면 결과가 나올 수 있습니다."
      : "로그인하지 않은 상태라 public 문서만 검색 중입니다. private 문서까지 보고 싶다면 로그인 흐름을 사용해 보세요.";
    return;
  }

  elements.resultGrid.innerHTML = filtered
    .map((doc) => {
      const tags = (doc.tags || [])
        .slice(0, 5)
        .map((tag) => `<span class="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-500">#${escapeHTML(tag)}</span>`)
        .join("");

      const canDelete = !doc.ownerId || !currentUser ? doc.ownerId === "system" && currentUser?.id === "system" : doc.ownerId === currentUser.id;
      const deleteButton = canDelete
        ? `<button class="delete-btn grid w-12 place-items-center rounded-2xl border border-rose-200 bg-rose-50 text-xl font-light text-rose-500 transition hover:bg-rose-100" data-delete-id="${escapeHTML(doc.id)}" title="삭제">×</button>`
        : "";

      return `
        <article class="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-white p-5 shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-glow">
          <div class="absolute -right-14 -top-14 h-32 w-32 rounded-full bg-gradient-to-br from-cyan-200 to-emerald-200 opacity-0 blur-2xl transition group-hover:opacity-80"></div>
          <div class="relative flex items-start justify-between gap-3">
            <div class="flex flex-wrap gap-2">
              <span class="rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-black text-cyan-700">${escapeHTML(doc.category)}</span>
              ${visibilityBadge(doc)}
            </div>
            <span class="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-950 text-sm font-black text-cyan-200">${doc.score}%</span>
          </div>
          <div class="relative mt-5">
            <p class="text-xs font-black uppercase tracking-[0.18em] text-slate-400">${formatDate(doc.createdAt)} · ${escapeHTML(ownerLabel(doc))}</p>
            <h3 class="mt-2 text-xl font-black leading-snug tracking-tight text-slate-950">${escapeHTML(doc.title)}</h3>
            <p class="clamp-3 mt-3 text-sm font-medium leading-7 text-slate-600">${escapeHTML(summarize(doc.content))}</p>
          </div>
          <div class="relative mt-5 flex flex-wrap gap-2">${tags}</div>
          <div class="relative mt-6 flex gap-2">
            <button class="detail-btn flex-1 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-cyan-700" data-id="${escapeHTML(doc.id)}">상세보기</button>
            ${deleteButton}
          </div>
        </article>
      `;
    })
    .join("");

  if (currentQuery) {
    const top = filtered[0];
    const rangeMessage = currentUser
      ? "public 문서와 내 private 문서 기준"
      : "public 문서 기준";
    elements.aiMessage.textContent = `"${currentQuery}" 검색 결과 가장 관련도가 높은 문서는 "${top.title}"입니다. ${rangeMessage}으로 ${top.score}% 관련도로 추천했습니다.`;
  } else if (currentUser) {
    elements.aiMessage.textContent = `${currentUser.name} 님은 public 문서와 내 private 문서를 함께 보고 있습니다. 공유용 문서와 개인 메모를 한 화면에서 구분해 검색할 수 있습니다.`;
  } else {
    elements.aiMessage.textContent = "로그인하지 않으면 public 문서만 보입니다. 로그인하면 내 private 문서를 함께 검색할 수 있습니다.";
  }
}

function renderAll() {
  renderAuth();
  renderCategories();
  updatePrivateHint();
  renderDocuments();
}

function openModal() {
  elements.docModal.classList.remove("hidden");
  elements.docModal.setAttribute("aria-hidden", "false");
  updatePrivateHint();
  document.getElementById("titleInput").focus();
}

function closeModal() {
  elements.docModal.classList.add("hidden");
  elements.docModal.setAttribute("aria-hidden", "true");
  elements.docForm.reset();
  elements.visibilityInput.value = "public";
  updatePrivateHint();
}

function openDrawer(docId) {
  const doc = getVisibleDocuments().find((item) => item.id === docId);
  if (!doc) return;

  elements.detailTitle.textContent = doc.title;
  elements.detailMeta.innerHTML = `
    <span class="rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-black text-cyan-700">${escapeHTML(doc.category)}</span>
    ${visibilityBadge(doc)}
    <span class="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-500">${escapeHTML(ownerLabel(doc))}</span>
    ${(doc.tags || []).map((tag) => `<span class="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-500">#${escapeHTML(tag)}</span>`).join("")}
  `;
  elements.detailSummary.textContent = summarize(doc.content);
  elements.detailContent.textContent = doc.content;

  if (doc.url) {
    elements.detailLink.href = doc.url;
    elements.detailLink.style.display = "inline-flex";
  } else {
    elements.detailLink.style.display = "none";
  }

  elements.detailDrawer.classList.remove("hidden");
}

function closeDrawer() {
  elements.detailDrawer.classList.add("hidden");
}

function handleSearch() {
  currentQuery = elements.searchInput.value.trim();
  renderDocuments();
}

function addDocument(event) {
  event.preventDefault();

  if (!currentUser) {
    alert("문서를 저장하려면 먼저 로그인해야 합니다.");
    return;
  }

  const visibility = elements.visibilityInput.value;
  const tags = document
    .getElementById("tagsInput")
    .value.split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const doc = {
    id: crypto.randomUUID(),
    title: document.getElementById("titleInput").value.trim(),
    category: document.getElementById("categoryInput").value.trim(),
    tags,
    url: document.getElementById("urlInput").value.trim(),
    content: document.getElementById("contentInput").value.trim(),
    visibility,
    ownerId: currentUser.id,
    ownerName: currentUser.name,
    createdAt: new Date().toISOString(),
  };

  documents.unshift(doc);
  saveDocuments();
  closeModal();
  currentCategory = "all";
  currentVisibility = "all";
  currentQuery = "";
  elements.searchInput.value = "";
  elements.visibilityFilter.value = "all";
  renderAll();
}

function deleteDocument(docId) {
  const doc = documents.find((item) => item.id === docId);
  if (!doc) return;

  if (!currentUser || doc.ownerId !== currentUser.id) {
    alert("내가 등록한 private 문서만 삭제할 수 있습니다.");
    return;
  }

  const shouldDelete = confirm(`"${doc.title}" 문서를 삭제할까요?`);
  if (!shouldDelete) return;

  documents = documents.filter((item) => item.id !== docId);
  saveDocuments();
  closeDrawer();
  renderAll();
}

function resetDemo() {
  localStorage.removeItem(STORAGE_KEY);
  documents = loadDocuments();
  currentCategory = "all";
  currentVisibility = "all";
  currentQuery = "";
  elements.searchInput.value = "";
  elements.sortFilter.value = "relevance";
  elements.visibilityFilter.value = "all";
  renderAll();
}

function loginWithName(nameValue) {
  const name = String(nameValue || "").trim();
  if (!name) {
    alert("로그인용 이름 또는 이메일을 입력해 주세요.");
    return;
  }

  currentUser = {
    id: slugifyUserId(name),
    name,
  };
  saveCurrentUser();
  renderAll();
}

function handleDesktopLogin() {
  loginWithName(elements.loginNameInput.value);
}

function handleMobileLogin() {
  loginWithName(elements.mobileLoginNameInput.value);
}

function logout() {
  currentUser = null;
  saveCurrentUser();
  closeDrawer();

  if (currentVisibility === "private") {
    currentVisibility = "all";
    elements.visibilityFilter.value = "all";
  }

  renderAll();
}

if (elements.newDocBtn) elements.newDocBtn.addEventListener("click", openModal);
if (elements.mobileNewDocBtn) elements.mobileNewDocBtn.addEventListener("click", openModal);
elements.closeModalBtn.addEventListener("click", closeModal);
elements.docForm.addEventListener("submit", addDocument);
elements.visibilityInput.addEventListener("change", updatePrivateHint);
elements.searchBtn.addEventListener("click", handleSearch);
if (elements.mobileSearchBtn) elements.mobileSearchBtn.addEventListener("click", handleSearch);
elements.searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") handleSearch();
});
elements.categoryFilter.addEventListener("change", (event) => {
  currentCategory = event.target.value;
  renderDocuments();
});
elements.visibilityFilter.addEventListener("change", (event) => {
  currentVisibility = event.target.value;
  if (currentVisibility === "private" && !currentUser) {
    currentVisibility = "all";
    elements.visibilityFilter.value = "all";
    alert("Private 필터는 로그인 후에 의미가 있습니다. 현재는 public 문서만 볼 수 있습니다.");
  }
  renderDocuments();
});
elements.sortFilter.addEventListener("change", renderDocuments);
elements.resetBtn.addEventListener("click", resetDemo);
elements.closeDrawerBtn.addEventListener("click", closeDrawer);
elements.loginBtn.addEventListener("click", handleDesktopLogin);
elements.logoutBtn.addEventListener("click", logout);
elements.mobileLoginBtn.addEventListener("click", handleMobileLogin);
elements.mobileLogoutBtn.addEventListener("click", logout);
elements.loginNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") handleDesktopLogin();
});
elements.mobileLoginNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") handleMobileLogin();
});

if (elements.categoryList) {
  elements.categoryList.addEventListener("click", (event) => {
    const button = event.target.closest(".category-item");
    if (!button) return;
    currentCategory = button.dataset.category;
    renderAll();
  });
}

elements.resultGrid.addEventListener("click", (event) => {
  const detailButton = event.target.closest("[data-id]");
  const deleteButton = event.target.closest("[data-delete-id]");

  if (deleteButton) {
    deleteDocument(deleteButton.dataset.deleteId);
    return;
  }

  if (detailButton) openDrawer(detailButton.dataset.id);
});

document.querySelectorAll(".example-query").forEach((button) => {
  button.addEventListener("click", () => {
    elements.searchInput.value = button.textContent.trim();
    currentQuery = elements.searchInput.value;
    renderDocuments();
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
    closeDrawer();
  }
});

renderAll();
