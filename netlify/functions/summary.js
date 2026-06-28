const MODEL = "gemini-1.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

function toGeminiContents(messages) {
  return (messages || []).map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "") }]
  }));
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: "Server misconfigured: missing GEMINI_API_KEY" };
    }

    const body = JSON.parse(event.body || "{}");
    const { topic, philosopher, mode, messages } = body;

    if (!topic || typeof topic !== "string") return { statusCode: 400, body: "Invalid topic" };
    if (!["socrates", "plato", "aristotle"].includes(philosopher)) return { statusCode: 400, body: "Invalid philosopher" };
    if (!["qa", "debate"].includes(mode)) return { statusCode: 400, body: "Invalid mode" };

    const systemInstruction = [
      "당신은 고등학교 윤리 수업의 정리 도우미입니다.",
      "아래 대화(학생-철학자 토론)를 바탕으로 한국어로 요약을 작성하세요.",
      "지나치게 길지 않게 정리하세요.",
      "형식은 반드시 다음 순서를 지키세요:",
      "1) 핵심 쟁점 3개(불릿)",
      "2) 학생의 입장 요약(2~3문장)",
      "3) 철학자 관점에서의 평가(2~3문장)",
      "4) 남는 질문 2개(불릿)",
      "5) 윤리 키워드 5개(쉼표로 나열)",
      "각 철학자의 사상과 관점을 바탕으로 답변해 주세요."
    ].join("\n");

    const contents = [
      {
        role: "user",
        parts: [{ text: `토론 주제: ${topic}\n철학자: ${philosopher}\n모드: ${mode}\n아래는 대화 기록입니다.` }]
      },
      ...toGeminiContents(messages || [])
    ];

    const url = `${API_BASE}/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const payload = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: {
        temperature: 0.4,
        topP: 0.9,
        maxOutputTokens: 700
      }
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const t = await resp.text();
      return { statusCode: resp.status, body: t || "Gemini API error" };
    }

    const data = await resp.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("")?.trim()
      || "요약을 생성하지 못했습니다. 다시 시도해 주세요.";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ text })
    };
  } catch (e) {
    return { statusCode: 500, body: `Server error: ${e.message}` };
  }
};