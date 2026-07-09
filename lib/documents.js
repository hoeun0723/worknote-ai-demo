import { createSummaryFromContent, splitIntoChunks } from "@/lib/chunking";
import { embedTexts, isOpenAIConfigured, toVectorString } from "@/lib/embeddings";

export function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(tags || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function validateDocumentInput(payload) {
  const title = String(payload.title || "").trim();
  const category = String(payload.category || "").trim();
  const content = String(payload.content || "").trim();
  const notionUrl = String(payload.notionUrl || "").trim();
  const visibility = payload.visibility === "private" ? "private" : "public";
  const tags = normalizeTags(payload.tags);

  if (!title) throw new Error("제목을 입력해 주세요.");
  if (!category) throw new Error("카테고리를 입력해 주세요.");
  if (!content) throw new Error("문서 내용을 입력해 주세요.");

  return {
    title,
    category,
    content,
    notion_url: notionUrl,
    visibility,
    tags,
    summary: createSummaryFromContent(content),
  };
}

export async function syncDocumentEmbeddings({ supabase, document }) {
  if (!isOpenAIConfigured()) {
    await supabase
      .from("documents")
      .update({
        embedding_status: "skipped",
        embedding_error: "OPENAI_API_KEY is not configured",
      })
      .eq("id", document.id);

    return "skipped";
  }

  const chunks = splitIntoChunks(document.content);
  const vectors = await embedTexts(chunks);

  const rows = chunks.map((chunk, index) => ({
    document_id: document.id,
    owner_id: document.owner_id,
    visibility: document.visibility,
    category: document.category,
    chunk_index: index,
    content: chunk,
    embedding: toVectorString(vectors[index]),
  }));

  const deleteResult = await supabase.from("document_chunks").delete().eq("document_id", document.id);
  if (deleteResult.error) throw deleteResult.error;

  const insertResult = await supabase.from("document_chunks").insert(rows);
  if (insertResult.error) throw insertResult.error;

  const updateResult = await supabase
    .from("documents")
    .update({
      embedding_status: "ready",
      embedding_error: null,
      last_embedded_at: new Date().toISOString(),
    })
    .eq("id", document.id);

  if (updateResult.error) throw updateResult.error;
  return "ready";
}
