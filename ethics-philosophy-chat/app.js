const $ = (id) => document.getElementById(id);

const philosopherLabel = {
  socrates: "소크라테스",
  plato: "플라톤",
  aristotle: "아리스토텔레스",
};

const modeLabel = {
  qa: "문답형",
  debate: "찬반형",
};

const MAX_TURNS = 20; // 학생 발화 20회
const RECENT_N = 12;  // 서버로 보낼 최근 메시지 개수(간단한 비용/길이 관리)

let started = false;

let state = {
  studentId: "",
  topic: "",
  philosopher: "socrates",
  mode: "qa",
  startedAtISO: "",
  messages: [],
  summaryText: "",
  selfEval: { q1: "", q2: "", q3: "", q4: "" },
};

function nowISO() {
  return new Date().toISOString();
}

function getSelectedMode() {
  const el = document.querySelector('input[name="mode"]:checked');
  return el ? el.value : "qa";
}

function studentTurnCount() {
  return state.messages.filter(m => m.role === "user").length;
}

function updateTurnInfo() {
  $("turnInfo").textContent = `턴: ${studentTurnCount()} / ${MAX_TURNS}`;
}

function setControlsEnabled(isEnabled) {
  $("userInput").disabled = !isEnabled;
  $("sendBtn").disabled = !isEnabled;
  $("summaryBtn").disabled = !isEnabled;
  $("downloadBtn").disabled = !isEnabled;

  $("q1").disabled = !isEnabled;
  $("q2").disabled = !isEnabled;
  $("q3").disabled = !isEnabled;
  $("q4").disabled = !isEnabled;
}

function lockStartFields(lock) {
  $("studentId").disabled = lock;
  $("topic").disabled = lock;
  $("philosopher").disabled = lock;
  document.querySelectorAll('input[name="mode"]').forEach(r => r.disabled = lock);

  $("startBtn").disabled = lock;
  $("resetBtn").disabled = !lock;
}

function renderSessionInfo() {
  if (!started) {
    $("sessionInfo").textContent = "대화를 시작해 주세요.";
    return;
  }
  const p = philosopherLabel[state.philosopher] || state.philosopher;
  const m = modeLabel[state.mode] || state.mode;
  $("sessionInfo").textContent = `학번 ${state.studentId} · ${p} · ${m} · 주제: ${state.topic}`;
}

function appendMessage(role, content) {
  state.messages.push({ role, content, timeISO: nowISO() });
  renderChat();
  updateTurnInfo();

  // 턴 제한 도달 시 입력 비활성화
  if (studentTurnCount() >= MAX_TURNS) {
    $("userInput").disabled = true;
    $("sendBtn").disabled = true;
  }
}

function renderChat() {
  const log = $("chatLog");
  log.innerHTML = "";
  for (const m of state.messages) {
    const div = document.createElement("div");
    div.className = `msg ${m.role === "user" ? "user" : "assistant"}`;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${m.role === "user" ? "학생" : philosopherLabel[state.philosopher]} · ${new Date(m.timeISO).toLocaleString()}`;

    const body = document.createElement("div");
    body.textContent = m.content;

    div.appendChild(meta);
    div.appendChild(body);
    log.appendChild(div);
  }
  log.scrollTop = log.scrollHeight;
}

function validateStart() {
  const sid = $("studentId").value.trim();
  const topic = $("topic").value.trim();
  if (!/^\d{5}$/.test(sid)) {
    $("studentIdHelp").textContent = "학번은 숫자 5자리로 입력해 주세요.";
    $("studentIdHelp").style.color = "var(--danger)";
    return false;
  }
  $("studentIdHelp").textContent = "숫자 5자리만 입력하세요.";
  $("studentIdHelp").style.color = "var(--muted)";

  if (!topic) {
    alert("주제를 입력해 주세요.");
    return false;
  }
  return true;
}

function buildRecentMessages() {
  // 최근 N개만 전송(너무 길어지는 것 방지)
  return state.messages.slice(-RECENT_N);
}

async function callChatAPI() {
  const res = await fetch("/.netlify/functions/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: state.topic,
      philosopher: state.philosopher,
      mode: state.mode,
      turnCount: studentTurnCount(),
      messages: buildRecentMessages(),
    }),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `요청 실패(${res.status})`);
  }
  const data = await res.json();
  return data.text;
}

async function callSummaryAPI() {
  const res = await fetch("/.netlify/functions/summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: state.topic,
      philosopher: state.philosopher,
      mode: state.mode,
      messages: state.messages, // 요약은 전체 대화를 보내도 OK(20턴 한정)
    }),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `요약 요청 실패(${res.status})`);
  }
  const data = await res.json();
  return data.text;
}

function formatTxt() {
  const p = philosopherLabel[state.philosopher] || state.philosopher;
  const m = modeLabel[state.mode] || state.mode;

  const startedAt = state.startedAtISO ? new Date(state.startedAtISO).toLocaleString() : new Date().toLocaleString();
  const turns = studentTurnCount();

  const lines = [];
  lines.push("[윤리 학기말 탐구활동 - 철학자 토론 기록]");
  lines.push("");
  lines.push(`- 학번: ${state.studentId}`);
  lines.push(`- 날짜/시각: ${startedAt}`);
  lines.push(`- 주제: ${state.topic}`);
  lines.push(`- 철학자: ${p}`);
  lines.push(`- 토론 모드: ${m}`);
  lines.push(`- 학생 발화 턴수: ${turns} / ${MAX_TURNS}`);
  lines.push("");
  lines.push("[대화 기록]");

  let idx = 0;
  for (const msg of state.messages) {
    if (msg.role === "user") idx += 1;
    const speaker = msg.role === "user" ? "학생" : p;
    const prefix = msg.role === "user" ? `(${idx}) ${speaker}: ` : `    ${speaker}: `;
    lines.push(prefix + msg.content.replace(/\n/g, "\n    "));
  }

  lines.push("");
  lines.push("[마무리 요약]");
  lines.push(state.summaryText ? state.summaryText : "(요약이 아직 생성되지 않았습니다.)");
  lines.push("");
  lines.push("[자기평가]");
  lines.push("1) 내 최종 입장(3~5줄):");
  lines.push(state.selfEval.q1 || "-");
  lines.push("");
  lines.push("2) 근거 2가지:");
  lines.push(state.selfEval.q2 || "-");
  lines.push("");
  lines.push("3) 가장 설득력 있던 질문/반론 1개와 내 응답:");
  lines.push(state.selfEval.q3 || "-");
  lines.push("");
  lines.push("4) 다음에 더 탐구할 질문 1개:");
  lines.push(state.selfEval.q4 || "-");
  lines.push("");

  return lines.join("\n");
}

function downloadTxt() {
  state.selfEval.q1 = $("q1").value.trim();
  state.selfEval.q2 = $("q2").value.trim();
  state.selfEval.q3 = $("q3").value.trim();
  state.selfEval.q4 = $("q4").value.trim();

  const text = formatTxt();
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  // 파일명에는 학번을 굳이 넣지 않되, 원하시면 아래에 추가 가능
  const safeTopic = state.topic.replace(/[\\/:*?"<>|]/g, "").slice(0, 20);
  a.download = `윤리토론_${state.philosopher}_${safeTopic || "주제"}.txt`;

  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function resetAll() {
  started = false;
  state = {
    studentId: "",
    topic: "",
    philosopher: "socrates",
    mode: "qa",
    startedAtISO: "",
    messages: [],
    summaryText: "",
    selfEval: { q1: "", q2: "", q3: "", q4: "" },
  };

  $("studentId").value = "";
  $("topic").value = "";
  $("philosopher").value = "socrates";
  document.querySelector('input[name="mode"][value="qa"]').checked = true;

  $("userInput").value = "";
  $("summaryText").value = "";
  $("q1").value = "";
  $("q2").value = "";
  $("q3").value = "";
  $("q4").value = "";

  lockStartFields(false);
  setControlsEnabled(false);
  renderSessionInfo();
  renderChat();
  updateTurnInfo();
}

$("startBtn").addEventListener("click", () => {
  if (!validateStart()) return;

  state.studentId = $("studentId").value.trim();
  state.topic = $("topic").value.trim();
  state.philosopher = $("philosopher").value;
  state.mode = getSelectedMode();
  state.startedAtISO = nowISO();

  started = true;
  lockStartFields(true);
  setControlsEnabled(true);

  renderSessionInfo();
  updateTurnInfo();

  // 시작 메시지(선택): 첫 안내를 띄우고 싶으면 사용
  appendMessage("assistant",
    `${philosopherLabel[state.philosopher]}입니다. 주제 "${state.topic}"에 대해 ${modeLabel[state.mode]}로 토론하겠습니다. 먼저 당신의 생각을 간단히 말해 줄래요?`
  );
});

$("resetBtn").addEventListener("click", () => resetAll());

$("sendBtn").addEventListener("click", async () => {
  if (!started) return;

  const text = $("userInput").value.trim();
  if (!text) return;

  if (studentTurnCount() >= MAX_TURNS) {
    alert("턴 제한(20회)에 도달했습니다. 마무리(요약 생성) 후 TXT 다운로드를 진행해 주세요.");
    return;
  }

  $("sendBtn").disabled = true;
  $("userInput").disabled = true;

  appendMessage("user", text);
  $("userInput").value = "";

  try {
    const reply = await callChatAPI();
    appendMessage("assistant", reply);
  } catch (e) {
    appendMessage("assistant", `오류가 발생했습니다. 잠시 후 다시 시도해 주세요.\n(${e.message})`);
  } finally {
    // 턴 제한 체크 후 재활성화
    if (studentTurnCount() < MAX_TURNS) {
      $("userInput").disabled = false;
      $("sendBtn").disabled = false;
      $("userInput").focus();
    }
  }
});

$("summaryBtn").addEventListener("click", async () => {
  if (!started) return;
  if (state.messages.length < 2) {
    alert("대화를 조금 진행한 뒤 요약을 생성해 주세요.");
    return;
  }

  $("summaryBtn").disabled = true;
  try {
    const s = await callSummaryAPI();
    state.summaryText = s;
    $("summaryText").disabled = false;
    $("summaryText").value = s;
  } catch (e) {
    alert(`요약 생성 실패: ${e.message}`);
  } finally {
    $("summaryBtn").disabled = false;
    $("downloadBtn").disabled = false;
    $("q1").disabled = false;
    $("q2").disabled = false;
    $("q3").disabled = false;
    $("q4").disabled = false;
  }
});

$("downloadBtn").addEventListener("click", () => {
  if (!started) return;
  downloadTxt();
});

// 초기 상태
resetAll();