const root = document.documentElement;
const metaColorScheme = document.querySelector('meta[name="color-scheme"]');
const themeToggle = document.querySelector("#theme-toggle");
const themeToggleLabel = document.querySelector("#theme-toggle-label");
const topnav = document.querySelector("#topnav");
const loginPanel = document.querySelector("#login-panel");
const workspace = document.querySelector("#workspace");
const headerLogin = document.querySelector("#header-login");
const identity = document.querySelector("#identity");
const userName = document.querySelector("#user-name");
const loginError = document.querySelector("#login-error");
const previewStatus = document.querySelector("#preview-status");
const serviceVersion = document.querySelector("#service-version");
const conversation = document.querySelector("#conversation");
const trace = document.querySelector("#trace");
const traceLiveState = document.querySelector("#trace-live-state");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#chat-input");
const send = document.querySelector("#send");
const logout = document.querySelector("#logout");
const readiness = document.querySelector("#readiness");
const mode = document.querySelector("#mode");
const eventList = document.querySelector("#events");
const refresh = document.querySelector("#refresh");
const refreshLabel = document.querySelector(".refresh-label");
const lastUpdated = document.querySelector("#last-updated");
const decisionTotal = document.querySelector("#decision-total");
const decisionCaption = document.querySelector("#decision-caption");
const countAllowed = document.querySelector("#count-allowed");
const countDenied = document.querySelector("#count-denied");
const countError = document.querySelector("#count-error");
const segmentAllowed = document.querySelector("#segment-allowed");
const segmentDenied = document.querySelector("#segment-denied");
const segmentError = document.querySelector("#segment-error");
const stageChart = document.querySelector("#stage-chart");
const stageCaption = document.querySelector("#stage-caption");
const activityChart = document.querySelector("#activity-chart");
const activityCaption = document.querySelector("#activity-caption");

const defaultTraceMarkup = trace.innerHTML;
const themeStorageKey = "bob-vault-demo-theme";
const allowedStatuses = new Set(["allowed", "denied", "error", "ok"]);
const toolLabels = {
  get_order_status: "주문 상태 조회",
  get_failed_payment_summary: "실패 결제 요약 조회",
};
const statusLabels = {
  allowed: "허용",
  denied: "차단",
  error: "오류",
  ok: "정상",
};
const stageLabels = {
  transport: "MCP 전송",
  identity: "Verify 신원",
  vault: "Vault 정책",
  database: "PostgreSQL",
  policy: "에이전트 정책",
};
const actionLabels = {
  mcp_user_jwt_authenticated: "MCP 사용자 JWT 인증",
  mcp_request_authenticated: "MCP 요청 인증",
  invalid_bearer_token: "잘못된 Bearer 토큰 차단",
  invalid_user_jwt: "잘못된 사용자 JWT 차단",
  verify_obo_jwt_validated: "사용자·에이전트 OBO JWT 검증",
  verify_jwt_validated: "Verify JWT 검증",
  dynamic_credentials_issued: "동적 DB 자격증명 발급",
  get_order_status: "주문 상태 조회",
  get_failed_payment_summary: "실패 결제 요약 조회",
  vault_policy_denied: "Vault 정책 거부",
  vault_policy_allowed: "Vault 정책 허용",
  pii_access_denied: "민감 정보 접근 차단",
  "database/creds/bob-payment-pii": "민감 결제 DB 역할 요청 차단",
};

const seoulTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

let csrfToken = "";
let eventsRequestInFlight = false;
let eventsInterval = null;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function preferredTheme() {
  let saved = null;
  try {
    saved = window.localStorage.getItem(themeStorageKey);
  } catch {
    // Fall back to the operating-system theme when storage is unavailable.
  }
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme) {
  root.dataset.theme = theme;
  metaColorScheme?.setAttribute(
    "content",
    theme === "dark" ? "dark light" : "light dark",
  );
  themeToggle?.setAttribute("aria-pressed", String(theme === "dark"));
  themeToggle?.setAttribute(
    "aria-label",
    theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환",
  );
  if (themeToggleLabel) {
    themeToggleLabel.textContent =
      theme === "dark" ? "라이트 모드" : "다크 모드";
  }
}

function toggleTheme() {
  const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
  try {
    window.localStorage.setItem(themeStorageKey, nextTheme);
  } catch {
    // The theme still changes for the current page session.
  }
  applyTheme(nextTheme);
}

function setReadinessState(state) {
  readiness?.classList.remove("ready", "error");
  if (state) readiness?.classList.add(state);
}

function formatAction(action) {
  const rawAction = String(action ?? "");
  if (Object.hasOwn(actionLabels, rawAction)) return actionLabels[rawAction];
  return (
    rawAction.replaceAll("_", " ").replaceAll("/", " › ") || "알 수 없는 조치"
  );
}

function buildSummary(events) {
  const summary = {
    total: Array.isArray(events) ? events.length : 0,
    allowed: 0,
    denied: 0,
    error: 0,
    stageCounts: {
      transport: 0,
      identity: 0,
      vault: 0,
      database: 0,
      policy: 0,
    },
  };

  if (!Array.isArray(events)) return summary;

  for (const event of events) {
    const status = String(event.status ?? "");
    if (status === "allowed" || status === "ok") {
      summary.allowed += 1;
    } else if (status === "denied") {
      summary.denied += 1;
    } else {
      summary.error += 1;
    }

    const stage = String(event.stage ?? "");
    if (Object.hasOwn(summary.stageCounts, stage)) {
      summary.stageCounts[stage] += 1;
    }
  }

  return summary;
}

function setSegmentWidth(node, percent) {
  node.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

async function loadStatus() {
  try {
    const response = await fetch("/api/status", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("status unavailable");
    const status = await response.json();
    const safeVersion = String(status.version ?? "알 수 없음").slice(0, 32);
    serviceVersion.textContent = `버전 ${safeVersion}`;

    const isConfigured = Boolean(status.configured);
    previewStatus.textContent = isConfigured
      ? "서비스 구성 완료 · 로그인 후 챗봇과 제어 센터를 사용할 수 있습니다."
      : "초기 설정이 아직 완료되지 않았습니다.";

    readiness.textContent = isConfigured
      ? "보안 제어 적용됨"
      : "초기 설정 필요";
    setReadinessState(isConfigured ? "ready" : "");
    mode.textContent = isConfigured
      ? "신원·권한 경로 구성 완료"
      : "IBM Verify 설정값 대기 중";
  } catch {
    serviceVersion.textContent = "버전 정보를 불러올 수 없음";
    previewStatus.textContent = "서비스 상태를 확인하지 못했습니다.";
    readiness.textContent = "상태 확인 불가";
    setReadinessState("error");
    mode.textContent = "서비스 상태 확인에 실패했습니다";
  }
}

async function loadSession() {
  const response = await fetch("/api/me", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (response.status === 401) {
    showLogin();
    return;
  }
  if (!response.ok) {
    throw new Error("session unavailable");
  }
  const session = await response.json();
  csrfToken = String(session.csrfToken);
  userName.textContent = String(session.user.displayName).slice(0, 80);
  showWorkspace();
}

function showLogin() {
  workspace.hidden = true;
  identity.hidden = true;
  topnav.hidden = true;
  headerLogin.hidden = false;
  loginPanel.hidden = false;
  loginError.hidden = !new window.URLSearchParams(window.location.search).has(
    "auth_error",
  );
  if (eventsInterval) {
    window.clearInterval(eventsInterval);
    eventsInterval = null;
  }
}

function showWorkspace() {
  identity.hidden = false;
  topnav.hidden = false;
  headerLogin.hidden = true;
  loginPanel.hidden = true;
  workspace.hidden = false;
  input.focus();
  if (!eventsInterval) {
    void loadEvents();
    eventsInterval = window.setInterval(loadEvents, 10_000);
  }
  if (window.location.hash === "#control-center") {
    window.requestAnimationFrame(() => {
      document
        .querySelector("#control-center")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

function addMessage(kind, text, metadata) {
  const article = element(
    "article",
    `message ${kind === "user" ? "user-message" : "agent-message"}`,
  );
  const avatar = element(
    "div",
    `message-avatar ${kind === "user" ? "user-avatar" : "agent-avatar"}`,
    kind === "user" ? userName.textContent.slice(0, 1) || "U" : undefined,
  );
  if (kind !== "user") {
    avatar.textContent = "";
    const bob = document.createElement("img");
    bob.src = "/images/bob-head.png";
    bob.alt = "";
    bob.width = 32;
    bob.height = 32;
    avatar.append(bob);
  }
  avatar.setAttribute("aria-hidden", "true");
  const body = element("div", "message-body");
  body.append(
    element(
      "span",
      "message-label",
      kind === "user" ? userName.textContent : "보안 에이전트",
    ),
    element("p", "", text),
  );
  if (metadata) {
    body.append(element("small", "message-meta", metadata));
  }
  article.append(avatar, body);
  conversation.append(article);
  article.scrollIntoView({ behavior: "smooth", block: "nearest" });
  return article;
}

function setBusy(busy) {
  input.disabled = busy;
  send.disabled = busy;
  conversation.setAttribute("aria-busy", String(busy));
  document
    .querySelectorAll(".suggestions button")
    .forEach((button) => (button.disabled = busy));
}

function addThinking() {
  const article = addMessage("agent", "MCP 도구와 권한을 확인하고 있습니다…");
  article.classList.add("thinking");
  article.setAttribute("role", "status");
  return article;
}

function renderTrace(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    trace.innerHTML = defaultTraceMarkup;
    traceLiveState.textContent = "대기";
    traceLiveState.className = "live-state waiting";
    return;
  }

  trace.replaceChildren();
  const hasDeniedStep = steps.some((step) => step.status === "denied");
  traceLiveState.textContent = hasDeniedStep ? "정책 차단" : "검증 완료";
  traceLiveState.className = `live-state ${hasDeniedStep ? "denied" : "verified"}`;

  for (const [index, step] of steps.entries()) {
    const item = document.createElement("li");
    const copy = document.createElement("div");
    copy.append(
      element(
        "strong",
        "",
        {
          "OBO JWT": "에이전트 OBO JWT",
          "Agent 정책": "에이전트 정책",
        }[step.label] ?? String(step.label),
      ),
      element("small", "", String(step.detail)),
    );
    const stateLabel = {
      verified: "검증",
      allowed: "허용",
      issued: "발급",
      denied: "차단",
    }[step.status];
    item.append(
      element("span", "trace-index", String(index + 1).padStart(2, "0")),
      copy,
      element(
        "span",
        `trace-state ${String(step.status)}`,
        stateLabel ?? "확인",
      ),
    );
    trace.append(item);
  }
}

async function sendMessage(message) {
  const trimmed = message.trim();
  if (!trimmed) return;
  const retryValue = trimmed;
  addMessage("user", trimmed);
  input.value = "";
  input.style.height = "";
  setBusy(true);
  const thinking = addThinking();
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({ message: trimmed }),
    });
    if (response.status === 401) {
      window.location.assign("/auth/login");
      return;
    }
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message ?? "요청을 완료하지 못했습니다.");
    }
    thinking.remove();
    addMessage(
      "agent",
      String(payload.reply),
      payload.tool
        ? `MCP 도구 · ${toolLabels[String(payload.tool)] ?? String(payload.tool)} · 요청 ${String(payload.requestId).slice(0, 8)}`
        : "에이전트 정책 안내",
    );
    renderTrace(Array.isArray(payload.trace) ? payload.trace : []);
    void loadEvents();
  } catch (error) {
    thinking.remove();
    if (!input.value) input.value = retryValue;
    addMessage(
      "agent",
      error instanceof Error
        ? error.message
        : "요청을 안전하게 완료하지 못했습니다.",
      "요청 실패",
    );
  } finally {
    setBusy(false);
    input.focus();
  }
}

function renderDecisionOverview(events) {
  const summary = buildSummary(events);
  decisionTotal.textContent = `${summary.total}건`;
  countAllowed.textContent = String(summary.allowed);
  countDenied.textContent = String(summary.denied);
  countError.textContent = String(summary.error);

  const denominator = summary.total || 1;
  setSegmentWidth(segmentAllowed, (summary.allowed / denominator) * 100);
  setSegmentWidth(segmentDenied, (summary.denied / denominator) * 100);
  setSegmentWidth(segmentError, (summary.error / denominator) * 100);

  if (!summary.total) {
    decisionCaption.textContent = "표시할 보안 결정이 아직 없습니다.";
    return;
  }

  decisionCaption.textContent =
    summary.denied > 0
      ? `최근 ${summary.total}건 중 ${summary.allowed}건은 정상 흐름, ${summary.denied}건은 정책 차단으로 끝났습니다.`
      : `최근 ${summary.total}건은 모두 정상 또는 허용 흐름으로 처리되었습니다.`;
}

function renderStageChart(events) {
  stageChart.replaceChildren();
  const summary = buildSummary(events);
  const entries = Object.entries(summary.stageCounts);
  const maxCount = Math.max(...entries.map(([, count]) => count), 0);

  if (!summary.total || maxCount === 0) {
    stageCaption.textContent = "단계별 분포를 계산할 이벤트가 없습니다.";
    stageChart.append(
      element("p", "chart-caption", "표시할 단계별 데이터가 없습니다."),
    );
    return;
  }

  const [topStageKey, topStageCount] = [...entries].sort(
    (left, right) => right[1] - left[1],
  )[0];
  stageCaption.textContent = `${stageLabels[topStageKey] ?? topStageKey} 단계가 ${topStageCount}건으로 가장 많이 관측되었습니다.`;

  for (const [stageKey, count] of entries) {
    const row = document.createElement("div");
    row.className = "stage-row";

    const label = element(
      "span",
      "stage-label",
      stageLabels[stageKey] ?? stageKey,
    );
    const track = element("div", "stage-track");
    const fill = element("span", "stage-fill");
    fill.style.width = `${(count / maxCount) * 100}%`;
    track.append(fill);
    const value = element("span", "stage-value", String(count));
    row.append(label, track, value);
    row.setAttribute(
      "aria-label",
      `${label.textContent} 단계 ${String(count)}건`,
    );
    stageChart.append(row);
  }
}

function legendItem(labelText, className) {
  const label = document.createElement("span");
  const marker = document.createElement("i");
  marker.className = className;
  label.append(marker, document.createTextNode(labelText));
  return label;
}

function renderActivityChart(events) {
  activityChart.replaceChildren();

  if (!Array.isArray(events) || events.length === 0) {
    activityCaption.textContent = "최근 요청 흐름을 계산할 이벤트가 없습니다.";
    activityChart.append(
      element("p", "chart-caption", "표시할 최근 이벤트가 없습니다."),
    );
    return;
  }

  const items = events.slice(0, 10).reverse();
  const strip = element("div", "activity-strip");

  for (const event of items) {
    const safeStatus = allowedStatuses.has(event.status)
      ? String(event.status)
      : "error";
    const point = element("article", `activity-point ${safeStatus}`);
    const marker = document.createElement("span");
    const eventTime = new Date(event.at);
    const stage = element(
      "strong",
      "",
      stageLabels[String(event.stage ?? "")] ?? "기타 제어",
    );
    const time = element(
      "small",
      "",
      Number.isNaN(eventTime.getTime())
        ? "시각 정보 없음"
        : seoulTimeFormatter.format(eventTime),
    );
    const status = element(
      "small",
      "activity-status",
      statusLabels[safeStatus] ?? "오류",
    );
    point.title = formatAction(event.action);
    point.setAttribute(
      "aria-label",
      `${stage.textContent} ${time.textContent} ${statusLabels[safeStatus] ?? "오류"} ${formatAction(event.action)}`,
    );
    point.append(marker, stage, time, status);
    strip.append(point);
  }

  const latestEvent = events[0];
  activityCaption.textContent = `가장 최근 조치는 ${formatAction(latestEvent.action)}이며, 결과는 ${statusLabels[String(latestEvent.status)] ?? "오류"}입니다.`;

  const legend = element("div", "activity-legend");
  legend.append(
    legendItem("정상·허용", "allowed"),
    legendItem("차단", "denied"),
    legendItem("오류", "error"),
  );

  activityChart.append(strip, legend);
}

function renderState(kind, message) {
  eventList.replaceChildren(element("li", `state ${kind}`, message));
}

function renderEvents(events) {
  eventList.replaceChildren();
  if (!Array.isArray(events) || events.length === 0) {
    renderState("empty", "아직 기록된 보안 결정이 없습니다.");
    return;
  }

  for (const event of events) {
    const row = document.createElement("li");
    const eventDate = new Date(event.at);
    const timestamp = element(
      "time",
      "",
      Number.isNaN(eventDate.getTime())
        ? "시각 정보 없음"
        : seoulTimeFormatter.format(eventDate),
    );
    timestamp.dateTime = String(event.at);
    timestamp.dataset.label = "시각";

    const rawStage = String(event.stage ?? "");
    const stage = element(
      "span",
      "event-stage",
      stageLabels[rawStage] ?? "기타 제어",
    );
    stage.dataset.label = "통제 단계";

    const safeStatus = allowedStatuses.has(event.status)
      ? String(event.status)
      : "error";
    const status = element(
      "span",
      `event-status ${safeStatus}`,
      statusLabels[safeStatus],
    );
    status.dataset.label = "결정";

    const rawAction = String(event.action ?? "");
    const action = element("span", "event-action", formatAction(rawAction));
    action.dataset.label = "조치";
    action.title = rawAction;

    row.append(timestamp, stage, status, action);
    row.setAttribute(
      "aria-label",
      `${timestamp.textContent}, ${stage.textContent}, ${status.textContent}, ${action.textContent}`,
    );
    eventList.append(row);
  }
}

function setRefreshState(loading) {
  refresh.disabled = loading;
  refreshLabel.textContent = loading ? "불러오는 중" : "새로고침";
  eventList.setAttribute("aria-busy", String(loading));
}

async function loadEvents() {
  if (eventsRequestInFlight || workspace.hidden) return;
  eventsRequestInFlight = true;
  setRefreshState(true);
  if (eventList.querySelector(".state")) {
    renderState("loading", "보안 결정을 불러오는 중…");
  }

  try {
    const response = await fetch("/api/demo/events?limit=20", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("events unavailable");
    const payload = await response.json();
    renderEvents(payload.events);
    renderDecisionOverview(payload.events);
    renderStageChart(payload.events);
    renderActivityChart(payload.events);
    lastUpdated.textContent = `마지막 업데이트 ${seoulTimeFormatter.format(new Date())}`;
  } catch {
    renderState(
      "error",
      "보안 결정 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
    renderDecisionOverview([]);
    renderStageChart([]);
    renderActivityChart([]);
    lastUpdated.textContent = "업데이트 실패";
  } finally {
    eventsRequestInFlight = false;
    setRefreshState(false);
  }
}

themeToggle?.addEventListener("click", toggleTheme);
refresh?.addEventListener("click", () => void loadEvents());

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void sendMessage(input.value);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    const prompt = button.getAttribute("data-prompt");
    if (prompt) void sendMessage(prompt);
  });
});

logout.addEventListener("click", async () => {
  logout.disabled = true;
  try {
    await fetch("/api/logout", {
      method: "POST",
      headers: { "x-csrf-token": csrfToken },
    });
  } finally {
    window.location.assign("/");
  }
});

applyTheme(preferredTheme());
await loadStatus();

try {
  await loadSession();
} catch {
  showLogin();
  loginError.textContent =
    "인증 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  loginError.hidden = false;
}
