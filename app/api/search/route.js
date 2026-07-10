import { NextResponse } from "next/server";
import { getCurrentAccessContext, requireApprovedMember } from "@/lib/access";
import { embedTexts, generateSearchAnswer, isOpenAIConfigured, toVectorString } from "@/lib/embeddings";

function collapseMatches(rows) {
  const byDocument = new Map();

  rows.forEach((row) => {
    const existing = byDocument.get(row.document_id);
    const snippet = row.chunk_content;

    if (!existing) {
      byDocument.set(row.document_id, {
        document_id: row.document_id,
        title: row.title,
        category: row.category,
        visibility: row.visibility,
        notion_url: row.notion_url,
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

  return [...byDocument.values()].sort((a, b) => b.score - a.score);
}

export async function POST(request) {
  const accessContext = await getCurrentAccessContext();
  const guard = requireApprovedMember(accessContext);

  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  if (!isOpenAIConfigured()) {
    return NextResponse.json(
      { error: "OpenAI API 키가 설정되지 않아 semantic search를 실행할 수 없습니다." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const query = String(body.query || "").trim();
    const category = body.category && body.category !== "all" ? body.category : null;
    const visibility = body.visibility && body.visibility !== "all" ? body.visibility : "all";
    const generateAnswerFlag = Boolean(body.generateAnswer);

    if (!query) {
      return NextResponse.json({ error: "검색어를 입력해 주세요." }, { status: 400 });
    }

    const [queryEmbedding] = await embedTexts([query]);

    const { data, error } = await accessContext.supabase.rpc("match_document_chunks", {
      query_embedding: toVectorString(queryEmbedding),
      match_count: 12,
      filter_visibility: visibility,
      filter_category: category,
    });

    if (error) {
      throw error;
    }

    const collapsed = collapseMatches(data ?? []);
    const answer = generateAnswerFlag ? await generateSearchAnswer({ query, matches: collapsed.slice(0, 4) }) : "";

    return NextResponse.json({
      results: collapsed,
      answer,
      message: collapsed.length ? `${collapsed.length}개의 관련 문서를 찾았습니다.` : "관련 문서를 찾지 못했습니다.",
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
