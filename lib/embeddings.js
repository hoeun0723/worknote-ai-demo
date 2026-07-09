import { getOpenAIClient, isOpenAIConfigured } from "@/lib/openai";

export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
export const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4.1-mini";

export { isOpenAIConfigured };

export function toVectorString(vector) {
  return `[${vector.join(",")}]`;
}

export async function embedTexts(texts) {
  if (!isOpenAIConfigured()) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const client = getOpenAIClient();

  const responses = await Promise.all(
    texts.map((input) =>
      client.embeddings.create({
        model: EMBEDDING_MODEL,
        input,
      })
    )
  );

  return responses.map((item) => item.data[0].embedding);
}

export async function generateSearchAnswer({ query, matches }) {
  if (!isOpenAIConfigured() || !matches.length) return "";

  const client = getOpenAIClient();
  const context = matches
    .map(
      (match, index) =>
        `문서 ${index + 1}\n제목: ${match.title}\n카테고리: ${match.category}\n공개범위: ${match.visibility}\n요약: ${match.summary}\n근거: ${match.snippet}`
    )
    .join("\n\n");

  const response = await client.responses.create({
    model: CHAT_MODEL,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: "너는 회사 문서 검색 어시스턴트다. 주어진 검색 결과만 근거로 간단하고 정확하게 한국어 답변을 작성해라. 근거가 부족하면 부족하다고 말해라.",
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `질문: ${query}\n\n검색 결과:\n${context}`,
          },
        ],
      },
    ],
  });

  return response.output_text?.trim() || "";
}
