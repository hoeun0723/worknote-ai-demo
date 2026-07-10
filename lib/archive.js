import { createSummaryFromContent, splitIntoChunks } from "@/lib/chunking";
import { embedTexts, isOpenAIConfigured, toVectorString } from "@/lib/embeddings";
import { normalizeTags } from "@/lib/documents";

function compactParts(parts) {
  return parts.map((item) => String(item || "").trim()).filter(Boolean);
}

export function buildArchiveSearchContent(payload) {
  return compactParts([
    payload.title,
    payload.category,
    payload.service_name,
    payload.login_id,
    payload.url,
    payload.ip_address,
    payload.password_note,
    payload.notes,
    ...(payload.tags ?? []),
  ]).join("\n");
}

export function validateArchiveInput(payload) {
  const title = String(payload.title || "").trim();
  const category = String(payload.category || "").trim();
  const serviceName = String(payload.serviceName || "").trim();
  const loginId = String(payload.loginId || "").trim();
  const url = String(payload.url || "").trim();
  const ipAddress = String(payload.ipAddress || "").trim();
  const passwordNote = String(payload.passwordNote || "").trim();
  const notes = String(payload.notes || "").trim();
  const tags = normalizeTags(payload.tags);

  if (!title) throw new Error("아카이브 제목을 입력해 주세요.");
  if (!category) throw new Error("카테고리를 입력해 주세요.");

  const searchContent = buildArchiveSearchContent({
    title,
    category,
    service_name: serviceName,
    login_id: loginId,
    url,
    ip_address: ipAddress,
    password_note: passwordNote,
    notes,
    tags,
  });

  return {
    title,
    category,
    service_name: serviceName,
    login_id: loginId,
    url,
    ip_address: ipAddress,
    password_note: passwordNote,
    notes,
    tags,
    search_content: searchContent,
    summary: createSummaryFromContent(searchContent),
  };
}

export async function syncArchiveEmbeddings({ supabase, archive }) {
  if (!isOpenAIConfigured()) {
    await supabase
      .from("account_archives")
      .update({
        embedding_status: "skipped",
        embedding_error: "OPENAI_API_KEY is not configured",
      })
      .eq("id", archive.id);

    return "skipped";
  }

  const chunks = splitIntoChunks(archive.search_content || "");
  const vectors = await embedTexts(chunks);

  const rows = chunks.map((chunk, index) => ({
    archive_id: archive.id,
    owner_id: archive.owner_id,
    category: archive.category,
    content: chunk,
    chunk_index: index,
    embedding: toVectorString(vectors[index]),
  }));

  const deleteResult = await supabase.from("account_archive_chunks").delete().eq("archive_id", archive.id);
  if (deleteResult.error) throw deleteResult.error;

  const insertResult = await supabase.from("account_archive_chunks").insert(rows);
  if (insertResult.error) throw insertResult.error;

  const updateResult = await supabase
    .from("account_archives")
    .update({
      embedding_status: "ready",
      embedding_error: null,
      last_embedded_at: new Date().toISOString(),
    })
    .eq("id", archive.id);

  if (updateResult.error) throw updateResult.error;
  return "ready";
}
