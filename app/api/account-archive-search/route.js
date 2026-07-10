import { NextResponse } from "next/server";
import { getCurrentAccessContext, requireArchiveApprovedMember } from "@/lib/access";
import { embedTexts, generateSearchAnswer, isOpenAIConfigured, toVectorString } from "@/lib/embeddings";

function collapseMatches(rows) {
  const byArchive = new Map();

  rows.forEach((row) => {
    const existing = byArchive.get(row.archive_id);
    const snippet = row.chunk_content;

    if (!existing) {
      byArchive.set(row.archive_id, {
        archive_id: row.archive_id,
        title: row.title,
        category: row.category,
        service_name: row.service_name,
        login_id: row.login_id,
        url: row.url,
        ip_address: row.ip_address,
        summary: row.summary,
        score: row.score,
        tags: row.tags,
        snippet,
      });
      return;
    }

    if (row.score > existing.score) {
      existing.score = row.score;
      existing.snippet = snippet;
    }
  });

  return [...byArchive.values()].sort((a, b) => b.score - a.score);
}

export async function POST(request) {
  const accessContext = await getCurrentAccessContext();
  const guard = requireArchiveApprovedMember(accessContext);

  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  if (!isOpenAIConfigured()) {
    return NextResponse.json({ error: "OpenAI API 키가 설정되지 않아 AI 검색을 실행할 수 없습니다." }, { status: 503 });
  }

  try {
    const body = await request.json();
    const query = String(body.query || "").trim();
    const category = body.category && body.category !== "all" ? body.category : null;
    const generateAnswerFlag = Boolean(body.generateAnswer);

    if (!query) {
      return NextResponse.json({ error: "검색어를 입력해 주세요." }, { status: 400 });
    }

    const [queryEmbedding] = await embedTexts([query]);

    const { data, error } = await accessContext.supabase.rpc("match_account_archive_chunks", {
      query_embedding: toVectorString(queryEmbedding),
      match_count: 12,
      filter_category: category,
    });

    if (error) throw error;

    const collapsed = collapseMatches(data ?? []);
    const answer = generateAnswerFlag
      ? await generateSearchAnswer({
          query,
          matches: collapsed.slice(0, 4).map((item) => ({
            title: item.title,
            category: item.category,
            visibility: "archive",
            summary: item.summary,
            snippet: item.snippet,
          })),
        })
      : "";

    return NextResponse.json({
      results: collapsed,
      answer,
      message: collapsed.length
        ? `${collapsed.length}개의 계정 아카이브 항목을 찾았습니다.`
        : "관련된 계정 아카이브 항목을 찾지 못했습니다.",
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
