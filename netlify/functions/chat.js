const MODEL = process.env.GEMINI_MODEL_CHAT || "gemini-2.5-flash-lite"; // 오류가 나면 "gemini-1.5-flash-latest" 등으로 변경하세요.
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

function buildSystemInstruction({ philosopher, mode }) {
  const commonRules = [
    "당신은 고등학교 윤리 수업의 토론 파트너입니다.",
    "반드시 한국어로 답변하세요.",
    "반드시 1인칭으로 말하세요(나는/내가).",
    "절대 제3자 설명체로 말하지 마세요. (예: '소크라테스는 ~' 금지, '플라톤의 관점에서' 금지)",
    "학생을 '당신'으로 부르세요.",
    "답변은 500자 이내로 간결하게 작성하세요.",
    "답변 형식: (1) 내 주장 2~3문장 (2) 근거 1~2문장 (3) 질문 1개",
    "공격적/차별적 표현을 피하고 토론 예절을 지키세요.",
    "학생의 개인정보(이름/연락처/학교 등)를 묻거나 추정하지 마세요.",
    mode === "qa"
      ? "반드시 마지막에 학생에게 질문 1개를 남기세요."
      : "반드시 마지막에 학생에게 확인 질문 1개를 남기세요."
  ].join("\n");

  const persona = {
    socrates: [
      "너는 소크라테스다.",
      "나는 정의를 요구하고, 상대의 전제를 질문으로 드러내며, 반례로 모순 가능성을 점검한다.",
      mode === "qa"
        ? "나는 결론을 단정하지 않고, 짧은 질문으로 당신이 스스로 생각을 정교화하게 이끈다."
        : "나는 당신 주장의 핵심 개념을 재확인한 뒤, 전제를 질문으로 시험한다."
    ].join("\n"),

    plato: [
      "너는 플라톤이다.",
      "나는 사례에서 출발해 보편적 기준(정의/선)을 묻고, 더 높은 기준으로 이끈다. 필요하면 짧은 비유를 사용한다.",
      mode === "qa"
        ? "나는 당신의 사례를 보편적 기준으로 끌어올리는 질문을 한다."
        : "나는 찬반을 다루되, 그 기준이 보편적인지와 겉모습-참기준의 차이를 중심으로 논증한다."
    ].join("\n"),

    aristotle: [
      "너는 아리스토텔레스다.",
      "나는 목적(텔로스), 덕, 습관, 중용, 실천적 지혜의 관점에서 평가한다.",
      mode === "qa"
        ? "나는 극단(과도/부족)을 짚고, 현실에서의 실천적 판단을 묻는다."
        : "나는 찬반의 장점/위험을 좋은 삶과 공동체 관점에서 비교하고, 어떤 덕과 습관을 기르는지로 연결한다."
    ].join("\n"),
  };

  return `${commonRules}\n\n${persona[philosopher] || persona.socrates}`;
}

function toGeminiContents(messages) {
  // Gemini: role은 user / model 사용
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
    const { topic, philosopher, mode, turnCount, messages } = body;

    if (!topic || typeof topic !== "string") {
      return { statusCode: 400, body: "Invalid topic" };
    }
    if (!["socrates", "plato", "aristotle"].includes(philosopher)) {
      return { statusCode: 400, body: "Invalid philosopher" };
    }
    if (!["qa", "debate"].includes(mode)) {
      return { statusCode: 400, body: "Invalid mode" };
    }
    if (typeof turnCount !== "number") {
      return { statusCode: 400, body: "Invalid turnCount" };
    }
    if (turnCount >= 20) {
      return { statusCode: 400, body: "Turn limit reached (20)" };
    }

    const systemInstruction = buildSystemInstruction({ philosopher, mode });

    // 대화 컨텍스트 앞에 주제 고정(짧게)
    const contents = [
      {
        role: "user",
        parts: [{ text: `토론 주제: ${topic}\n(이 주제를 벗어나지 말고 토론을 이어가세요.)` }]
      },
      ...toGeminiContents(messages || [])
    ];

    const url = `${API_BASE}/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const payload = {
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents,
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 320
      }
      // safetySettings는 필요하면 추가 가능(기본도 동작)
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
      || "응답을 생성하지 못했습니다. 다시 시도해 주세요.";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ text })
    };
  } catch (e) {
    return { statusCode: 500, body: `Server error: ${e.message}` };
  }
};
