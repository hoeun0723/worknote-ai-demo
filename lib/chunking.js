export function createSummaryFromContent(content) {
  const clean = String(content || "").trim().replace(/\s+/g, " ");
  if (clean.length <= 160) return clean;

  const firstSentence = clean.split(/[.!?\n]/).find((line) => line.trim().length > 20);
  if (firstSentence && firstSentence.length <= 160) {
    return `${firstSentence.trim()}.`;
  }

  return `${clean.slice(0, 157)}...`;
}

export function splitIntoChunks(text, maxLength = 900, overlap = 120) {
  const normalized = String(text || "").trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks = [];
  let buffer = "";

  function pushBuffer() {
    const chunk = buffer.trim();
    if (!chunk) return;
    chunks.push(chunk);
    const tail = chunk.slice(Math.max(0, chunk.length - overlap));
    buffer = tail;
  }

  paragraphs.forEach((paragraph) => {
    if ((buffer + "\n\n" + paragraph).trim().length > maxLength) {
      pushBuffer();
    }

    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
  });

  pushBuffer();

  return chunks.length ? chunks : [normalized];
}
