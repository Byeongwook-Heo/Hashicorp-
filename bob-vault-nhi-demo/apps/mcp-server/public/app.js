const root = document.documentElement;
const metaColorScheme = document.querySelector('meta[name="color-scheme"]');
const themeToggle = document.querySelector("#theme-toggle");
const themeToggleLabel = document.querySelector("#theme-toggle-label");
const themeSymbol = document.querySelector(".theme-symbol");
const topnav = document.querySelector("#topnav");
const loginPanel = document.querySelector("#login-panel");
const workspace = document.querySelector("#workspace");
const headerLogin = document.querySelector("#header-login");
const identity = document.querySelector("#identity");
const userName = document.querySelector("#user-name");
const userInitial = document.querySelector("#user-initial");
const agentGreeting = document.querySelector("#agent-greeting");
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
const planningReadiness = document.querySelector("#planning-readiness");
const mode = document.querySelector("#mode");
const eventList = document.querySelector("#events");
const refresh = document.querySelector("#refresh");
const demoReset = document.querySelector("#demo-reset");
const refreshLabel = document.querySelector(".refresh-label");
const refreshAnnouncement = document.querySelector("#refresh-announcement");
const lastUpdated = document.querySelector("#last-updated");
const decisionTotal = document.querySelector("#decision-total");
const countAllowed = document.querySelector("#count-allowed");
const countDenied = document.querySelector("#count-denied");
const countError = document.querySelector("#count-error");
const decisionCounts = document.querySelector("#decision-counts");
const accessStatusRequest = document.querySelector("#access-status-request");
const accessStatusSummary = document.querySelector("#access-status-summary");
const accessStatusResult = document.querySelector("#access-status-result");
const accessStatusDescription = document.querySelector(
  "#access-status-description",
);
const accessStatusBadge = document.querySelector("#access-status-badge");
const accessStatusStage = document.querySelector("#access-status-stage");
const accessStatusPolicy = document.querySelector("#access-status-policy");
const accessStatusCredentials = document.querySelector(
  "#access-status-credentials",
);
const accessStatusAction = document.querySelector("#access-status-action");
const stageDialog = document.querySelector("#stage-dialog");
const stageDialogEyebrow = document.querySelector("#stage-dialog-eyebrow");
const stageDialogTitle = document.querySelector("#stage-dialog-title");
const stageDialogSummary = document.querySelector("#stage-dialog-summary");
const stageDialogState = document.querySelector("#stage-dialog-state");
const stageDialogTime = document.querySelector("#stage-dialog-time");
const stageDialogAction = document.querySelector("#stage-dialog-action");
const stageDialogCode = document.querySelector("#stage-dialog-code");
const stageCodeCopy = document.querySelector("#stage-code-copy");
const pathSteps = {
  verify: document.querySelector("#path-step-verify"),
  agent: document.querySelector("#path-step-agent"),
  mcp: document.querySelector("#path-step-mcp"),
  vault: document.querySelector("#path-step-vault"),
  database: document.querySelector("#path-step-database"),
};

const defaultTraceMarkup = trace.innerHTML;
const defaultConversationMarkup = conversation.innerHTML;
const themeStorageKey = "bob-vault-demo-theme";
const allowedStatuses = new Set(["allowed", "denied", "error", "ok"]);
const toolLabels = {
  get_order_status: "주문 상태 조회",
  get_failed_payment_summary: "실패 결제 요약 조회",
  get_recent_orders: "최근 주문 조회",
  get_failed_payment_trend: "실패 결제 통계 조회",
  get_sensitive_payment_data: "민감 정보 정책 확인",
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
  get_recent_orders: "최근 주문 조회",
  get_failed_payment_trend: "실패 결제 통계 조회",
  vault_policy_denied: "Vault 정책 거부",
  vault_policy_allowed: "Vault 정책 허용",
  pii_access_denied: "민감 정보 접근 차단",
  "database/creds/bob-payment-pii": "민감 결제 DB 역할 요청 차단",
};
const readOnlyQueries = {
  get_order_status: [
    "SELECT order_id, payment_status, delivery_status, updated_at",
    "FROM v_bob_order_status",
    "WHERE order_id = $1",
    "LIMIT 1;",
  ],
  get_failed_payment_summary: [
    "SELECT delivery_status, COUNT(*)::int AS count",
    "FROM v_bob_order_status",
    "WHERE payment_status = 'FAILED'",
    "  AND updated_at >= $1::date",
    "  AND updated_at < ($1::date + INTERVAL '1 day')",
    "GROUP BY delivery_status",
    "ORDER BY delivery_status",
    "LIMIT 20;",
  ],
  get_recent_orders: [
    "SELECT order_id, payment_status, delivery_status, updated_at",
    "FROM v_bob_order_status",
    "ORDER BY updated_at DESC",
    "LIMIT $1;",
  ],
  get_failed_payment_trend: [
    "SELECT (updated_at AT TIME ZONE 'Asia/Seoul')::date AS date,",
    "       COUNT(*)::int AS total_count,",
    "       COUNT(*) FILTER (WHERE payment_status = 'FAILED')::int AS failed_count",
    "FROM v_bob_order_status",
    "WHERE updated_at >= CURRENT_DATE - ($1::int - 1)",
    "GROUP BY 1 ORDER BY 1;",
  ],
};
const toolExampleArguments = {
  get_order_status: { orderId: "ORD-1001" },
  get_failed_payment_summary: { date: "YYYY-MM-DD" },
  get_recent_orders: { limit: 5 },
  get_failed_payment_trend: { days: 7 },
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
let latestCredential = null;
let latestTool = "";
let stageDialogTrigger = null;

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
  if (themeSymbol) themeSymbol.textContent = theme === "dark" ? "☾" : "☼";
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

function stageDetail(stage) {
  const activeTool = Object.hasOwn(toolLabels, latestTool)
    ? latestTool
    : "get_order_status";
  const catalog = {
    verify: {
      eyebrow: "01 · 사용자 신원",
      title: "IBM Verify",
      summary:
        "사용자의 로그인 세션과 JWT 서명을 검증하고, 발급자·대상·만료 시간을 확인합니다.",
      action:
        "검증이 끝난 사용자 요청만 다음 단계로 전달합니다. 토큰 원문은 화면이나 로그에 표시하지 않습니다.",
      code: [
        "GET /v1.0/endpoint/default/jwks",
        "",
        "validate(userJwt, {",
        '  issuer: "https://ceiam.verify.ibm.com/oidc/endpoint/default",',
        '  audience: "<chatbot-client-id>",',
        '  requiredClaims: ["sub", "exp", "iat"]',
        "});",
      ].join("\n"),
    },
    agent: {
      eyebrow: "02 · 에이전트 계획",
      title: "Bob AI 에이전트",
      summary:
        "사용자 문장에서 의도를 분류하고 허용된 읽기 전용 도구와 인자를 선택합니다.",
      action:
        "도구 허용 목록과 사용자 입력에 근거한 인자인지 확인합니다. 계획에 실패하면 규칙 기반 안전 모드로 전환합니다.",
      code: [
        "const plan = await planner.plan(message);",
        "",
        "assert(allowedTools.has(plan.tool));",
        "assert(isGrounded(plan.arguments, message));",
        "return plan;",
      ].join("\n"),
    },
    mcp: {
      eyebrow: "03 · 도구 실행",
      title: "MCP Server",
      summary:
        "사용자 JWT를 인증한 뒤 스키마가 고정된 MCP 도구 호출만 수락합니다.",
      action: `${toolLabels[activeTool]} 요청을 MCP tools/call 형식으로 만들고 입력 스키마를 다시 검증합니다.`,
      code: JSON.stringify(
        {
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: activeTool,
            arguments: toolExampleArguments[activeTool] ?? {},
          },
        },
        null,
        2,
      ),
    },
    vault: {
      eyebrow: "04 · 정책과 자격증명",
      title: "HashiCorp Vault",
      summary:
        "OBO JWT의 사용자·에이전트 클레임을 정책에 매핑하고 짧은 TTL의 DB 자격증명을 발급합니다.",
      action:
        "bob-orders 역할의 읽기 전용 정책만 평가합니다. 민감 정보 역할은 정책 단계에서 차단됩니다.",
      code: [
        "POST /v1/auth/jwt/login",
        "X-Vault-Namespace: demo",
        "",
        "{",
        '  "role": "bob-orders",',
        '  "jwt": "<OBO JWT>"',
        "}",
        "",
        "GET /v1/database/creds/bob-orders-readonly",
      ].join("\n"),
    },
    database: {
      eyebrow: "05 · 데이터 접근",
      title: "PostgreSQL",
      summary:
        "Vault가 발급한 임시 계정으로 사전에 정의된 읽기 전용 SQL만 실행합니다.",
      action: `${toolLabels[activeTool]}에 대응하는 매개변수화된 쿼리를 실행하고 자격증명을 즉시 반환합니다.`,
      code: (
        readOnlyQueries[activeTool] ?? readOnlyQueries.get_order_status
      ).join("\n"),
    },
  };
  return catalog[stage];
}

function openStageDialog(stage, trigger) {
  const detail = stageDetail(stage);
  const step = pathSteps[stage];
  if (!detail || !step || !stageDialog) return;

  const state =
    step.querySelector(".path-state")?.textContent?.trim() || "대기";
  const time = step.querySelector("time")?.textContent?.trim() || "—";
  stageDialogTrigger = trigger;
  stageDialogEyebrow.textContent = detail.eyebrow;
  stageDialogTitle.textContent = detail.title;
  stageDialogSummary.textContent = detail.summary;
  stageDialogState.textContent = state;
  stageDialogState.className = `stage-modal-state ${
    step.classList.contains("denied")
      ? "denied"
      : step.classList.contains("active") ||
          state === "성공" ||
          state === "허용"
        ? "allowed"
        : "waiting"
  }`;
  stageDialogTime.textContent = time;
  stageDialogAction.textContent = detail.action;
  stageDialogCode.textContent = detail.code;
  stageCodeCopy.textContent = "코드 복사";
  stageDialog.showModal();
}

function closeStageDialog() {
  if (!stageDialog?.open) return;
  stageDialog.close();
}

function buildSummary(events) {
  const summary = {
    total: Array.isArray(events) ? events.length : 0,
    allowed: 0,
    denied: 0,
    error: 0,
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
  }

  return summary;
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
  const displayName = String(session.user.displayName).slice(0, 80);
  userName.textContent = displayName;
  if (userInitial) {
    userInitial.textContent = initialsFor(displayName);
  }
  if (agentGreeting) {
    agentGreeting.textContent = `안녕하세요, ${displayName}님!`;
  }
  showWorkspace();
  void runPreflight();
}

function setPlanningState(kind, label) {
  if (!planningReadiness) return;
  planningReadiness.className = `planning-chip ${kind}`;
  planningReadiness.textContent = label;
}

async function runPreflight() {
  setPlanningState("checking", "계획 점검 중");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("/api/preflight", {
        method: "POST",
        headers: {
          accept: "application/json",
          "x-csrf-token": csrfToken,
        },
        signal: window.AbortSignal.timeout(35_000),
      });
      if (response.status === 401) {
        window.location.assign("/auth/login");
        return;
      }
      if (!response.ok) throw new Error("preflight unavailable");
      const status = await response.json();
      setPlanningState(
        status.mode === "enhanced" && status.ready ? "ready" : "fallback",
        status.mode === "enhanced" && status.ready
          ? "AI 계획 준비됨"
          : "안전 모드 준비됨",
      );
      return;
    } catch {
      if (attempt === 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
    }
  }
  setPlanningState("fallback", "안전 모드 준비됨");
}

function initialsFor(displayName) {
  const words = displayName.trim().split(/\s+/u).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  }
  return (words[0]?.slice(0, 2) || "U").toUpperCase();
}

function showLogin() {
  document.body.classList.remove("authenticated");
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
  document.body.classList.add("authenticated");
  identity.hidden = false;
  topnav.hidden = true;
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
    kind === "user" ? userInitial?.textContent || "U" : undefined,
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
  const heading = element("div", "message-heading");
  heading.append(
    element(
      "span",
      "message-label",
      kind === "user" ? userName.textContent : "Bob AI 에이전트",
    ),
    element("time", "", seoulTimeFormatter.format(new Date())),
  );
  body.append(heading, element("p", "", text));
  if (metadata) {
    body.append(element("small", "message-meta", metadata));
  }
  article.append(avatar, body);
  conversation.append(article);
  article.scrollIntoView({ behavior: "smooth", block: "nearest" });
  return article;
}

function appendQueryPreview(article, tool) {
  const lines = readOnlyQueries[tool];
  if (!lines) return;

  const result = element("section", "query-result");
  result.setAttribute("aria-label", "실행된 읽기 전용 SQL");
  const header = element("div", "query-result-header");
  header.append(element("span", "", "코드"));
  const copy = element("button", "", "복사");
  copy.type = "button";
  const query = lines.join("\n");
  copy.addEventListener("click", async () => {
    try {
      await window.navigator.clipboard.writeText(query);
      copy.textContent = "복사됨";
      window.setTimeout(() => (copy.textContent = "복사"), 1200);
    } catch {
      copy.textContent = "복사 불가";
    }
  });
  header.append(copy);
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = query;
  pre.append(code);
  result.append(header, pre);
  article.querySelector(".message-body")?.append(result);
}

function setBusy(busy) {
  input.disabled = busy;
  send.disabled = busy;
  conversation.setAttribute("aria-busy", String(busy));
  document
    .querySelectorAll(".suggestions button, .follow-up-suggestions button")
    .forEach((button) => (button.disabled = busy));
}

function addThinking() {
  const article = addMessage(
    "agent",
    "요청 의도와 허용된 권한 경로를 확인하고 있습니다…",
  );
  article.classList.add("thinking");
  article.setAttribute("role", "status");
  return article;
}

const defaultPathStates = {
  verify: { label: "성공", status: "allowed" },
  agent: { label: "준비", status: "allowed" },
  mcp: { label: "연결", status: "neutral" },
  vault: { label: "대기", status: "neutral" },
  database: { label: "대기", status: "neutral" },
};

function updatePathStep(key, label, status, time = "—", active = false) {
  const step = pathSteps[key];
  if (!step) return;
  step.classList.toggle("active", active);
  step.classList.toggle("denied", status === "denied");
  const state = step.querySelector(".path-state");
  if (state) {
    state.textContent = label;
    state.className = `path-state ${status}`;
  }
  const timestamp = step.querySelector("time");
  if (timestamp) timestamp.textContent = time;
}

function resetVisiblePath() {
  for (const [key, value] of Object.entries(defaultPathStates)) {
    updatePathStep(key, value.label, value.status);
  }
}

function renderVisiblePath(steps) {
  resetVisiblePath();
  if (!Array.isArray(steps) || steps.length === 0) return;

  const now = seoulTimeFormatter.format(new Date());
  const denied = steps.some((step) => step.status === "denied");

  for (const step of steps) {
    const label = String(step.label ?? "");
    const status = String(step.status ?? "");
    if (label.includes("사용자 JWT") || label.includes("IBM Verify")) {
      updatePathStep("verify", "성공", "allowed", now);
    } else if (label.includes("OBO JWT") || label.includes("Agent 정책")) {
      updatePathStep("agent", "위임", "allowed", now);
      updatePathStep("mcp", "성공", "allowed", now);
    } else if (label.includes("Vault")) {
      updatePathStep(
        "vault",
        status === "denied" ? "차단" : "허용",
        status === "denied" ? "denied" : "allowed",
        now,
        status === "denied",
      );
    } else if (label.includes("DB") || label.includes("자격증명")) {
      updatePathStep("database", "발급", "allowed", now, true);
    }
  }

  if (denied) {
    updatePathStep("database", "미실행", "neutral");
  }
}

function renderTrace(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    trace.innerHTML = defaultTraceMarkup;
    traceLiveState.textContent = "대기";
    traceLiveState.className = "live-state waiting";
    resetVisiblePath();
    return;
  }

  trace.replaceChildren();
  const hasDeniedStep = steps.some((step) => step.status === "denied");
  traceLiveState.textContent = hasDeniedStep ? "정책 차단" : "검증 완료";
  traceLiveState.className = `live-state ${hasDeniedStep ? "denied" : "verified"}`;
  renderVisiblePath(steps);

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
    const responseMessage = addMessage(
      "agent",
      String(payload.reply),
      payload.tool
        ? `MCP 도구 · ${toolLabels[String(payload.tool)] ?? String(payload.tool)} · 요청 ${String(payload.requestId).slice(0, 8)}`
        : "에이전트 정책 안내",
    );
    latestTool = String(payload.tool ?? "");
    appendQueryPreview(responseMessage, String(payload.tool ?? ""));
    appendFollowUpSuggestions(responseMessage, payload.suggestions);
    renderTrace(Array.isArray(payload.trace) ? payload.trace : []);
    if (payload.credential?.state === "released") {
      const ttl = Number(payload.credential.initialTtlSeconds);
      if (Number.isFinite(ttl) && ttl > 0) {
        latestCredential = `사용 종료 · 최초 TTL ${String(ttl)}초`;
        accessStatusCredentials.textContent = latestCredential;
      }
    } else if (payload.tool === "get_sensitive_payment_data") {
      latestCredential = null;
    }
    void loadEvents();
  } catch (error) {
    thinking.remove();
    if (!input.value) input.value = retryValue;
    const failureMessage = addMessage(
      "agent",
      error instanceof Error
        ? error.message
        : "요청을 안전하게 완료하지 못했습니다.",
      "요청 실패",
    );
    appendFollowUpSuggestions(failureMessage, [
      { label: "다시 시도", prompt: retryValue },
    ]);
  } finally {
    setBusy(false);
    input.focus();
  }
}

function appendFollowUpSuggestions(article, values) {
  if (!Array.isArray(values) || values.length === 0) return;
  const suggestions = element("div", "follow-up-suggestions");
  suggestions.setAttribute("aria-label", "후속 질문");
  for (const value of values.slice(0, 3)) {
    const label = String(value?.label ?? "")
      .trim()
      .slice(0, 40);
    const prompt = String(value?.prompt ?? "")
      .trim()
      .slice(0, 500);
    if (!label || !prompt) continue;
    const button = element("button", "", label);
    button.type = "button";
    button.dataset.prompt = prompt;
    suggestions.append(button);
  }
  if (suggestions.childElementCount > 0) {
    article.querySelector(".message-body")?.append(suggestions);
  }
}

function latestRequestEvents(events) {
  if (!Array.isArray(events) || events.length === 0) return [];
  const latestRequestId = String(events[0]?.requestId ?? "");
  return latestRequestId
    ? events.filter(
        (event) => String(event.requestId ?? "") === latestRequestId,
      )
    : events.slice(0, 1);
}

function renderCurrentAccessStatus(events, loadFailed = false) {
  const summary = buildSummary(events);
  decisionTotal.textContent = `${summary.total}건`;
  countAllowed.textContent = String(summary.allowed);
  countDenied.textContent = String(summary.denied);
  countError.textContent = String(summary.error);
  decisionCounts.setAttribute(
    "aria-label",
    `최근 보안 이벤트 ${String(summary.total)}건, 허용 ${String(summary.allowed)}건, 차단 ${String(summary.denied)}건, 오류 ${String(summary.error)}건`,
  );

  const requestEvents = latestRequestEvents(events);
  if (loadFailed || requestEvents.length === 0) {
    const kind = loadFailed ? "error" : "waiting";
    accessStatusSummary.className = `access-status-summary ${kind}`;
    accessStatusBadge.className = `access-status-badge ${kind}`;
    accessStatusRequest.textContent = loadFailed
      ? "상태 확인 실패"
      : "요청 대기";
    accessStatusResult.textContent = loadFailed
      ? "접근 상태를 확인하지 못했습니다"
      : "요청 대기 중";
    accessStatusDescription.textContent = loadFailed
      ? "보안 이벤트를 불러오지 못했습니다. 잠시 후 새로고침해 주세요."
      : "요청을 보내면 현재 신원·권한·데이터베이스 접근 상태를 표시합니다.";
    accessStatusBadge.textContent = loadFailed ? "오류" : "대기";
    accessStatusStage.textContent = loadFailed ? "확인 필요" : "대기";
    accessStatusPolicy.textContent = loadFailed ? "확인 필요" : "평가 전";
    accessStatusCredentials.textContent = loadFailed ? "확인 필요" : "미발급";
    accessStatusAction.textContent = loadFailed
      ? "이벤트 조회 실패"
      : "기록 없음";
    accessStatusAction.removeAttribute("title");
    accessStatusSummary.setAttribute(
      "aria-label",
      `${accessStatusResult.textContent}. ${accessStatusDescription.textContent}`,
    );
    return;
  }

  const terminalEvent =
    requestEvents.find((event) => {
      const status = String(event.status ?? "");
      return status === "denied" || (status !== "allowed" && status !== "ok");
    }) ?? requestEvents[0];
  const terminalStatus = String(terminalEvent?.status ?? "");
  const deniedEvent = terminalStatus === "denied" ? terminalEvent : null;
  const errorEvent =
    terminalStatus !== "allowed" &&
    terminalStatus !== "ok" &&
    terminalStatus !== "denied"
      ? terminalEvent
      : null;
  const databaseSuccess = requestEvents.some((event) => {
    const status = String(event.status ?? "");
    return (
      String(event.stage ?? "") === "database" &&
      (status === "allowed" || status === "ok")
    );
  });
  const credentialsIssued = requestEvents.some(
    (event) =>
      String(event.action ?? "") === "dynamic_credentials_issued" ||
      (String(event.stage ?? "") === "database" &&
        ["allowed", "ok"].includes(String(event.status ?? ""))),
  );
  const stageKey = String(terminalEvent?.stage ?? "");
  const stage = stageLabels[stageKey] ?? "보안 제어";
  const requestId = String(requestEvents[0]?.requestId ?? "");
  const eventDate = new Date(requestEvents[0]?.at);
  const eventTime = Number.isNaN(eventDate.getTime())
    ? "시각 정보 없음"
    : seoulTimeFormatter.format(eventDate);

  let kind = "active";
  if (deniedEvent) kind = "denied";
  else if (errorEvent) kind = "error";
  else if (databaseSuccess) kind = "allowed";

  const deniedResultByStage = {
    transport: "MCP 인증 단계에서 접근 차단",
    identity: "Verify 신원 검증에서 접근 차단",
    policy: "에이전트 정책으로 요청 차단",
    vault: "Vault 최소 권한 정책으로 접근 차단",
    database: "PostgreSQL 접근 단계에서 요청 차단",
  };
  const deniedDescriptionByStage = {
    transport:
      "MCP가 사용자 토큰을 검증하지 못해 요청을 중단했습니다. Vault와 PostgreSQL에는 도달하지 않았습니다.",
    identity:
      "IBM Verify 신원 또는 OBO 토큰 검증에 실패해 요청을 중단했습니다. Vault 권한은 평가되지 않았습니다.",
    policy:
      "에이전트 정책이 요청 범위를 허용하지 않아 중단했습니다. Vault와 PostgreSQL에는 도달하지 않았습니다.",
    vault: credentialsIssued
      ? "Vault 정책이 요청을 차단했습니다. 발급된 자격증명은 데이터 접근에 사용되지 않았습니다."
      : "Vault 정책이 요청을 차단했습니다. PostgreSQL 자격증명은 발급되지 않았습니다.",
    database: credentialsIssued
      ? "PostgreSQL 접근 단계에서 요청을 차단했습니다. 발급된 자격증명은 데이터 조회에 사용되지 않았습니다."
      : "PostgreSQL 접근 단계에서 요청을 차단했습니다. 자격증명은 발급되지 않았습니다.",
  };
  const preVaultStages = new Set(["transport", "identity", "policy"]);
  const deniedPolicy = preVaultStages.has(stageKey)
    ? "평가 전"
    : stageKey === "vault"
      ? "정책 차단"
      : "평가 완료";
  const errorPolicy = preVaultStages.has(stageKey)
    ? "평가 전"
    : stageKey === "vault"
      ? "평가 오류"
      : "평가 완료";

  const copyByKind = {
    active: {
      result: "접근 요청 처리 중",
      description: `${stage} 단계에서 요청을 처리하고 있습니다. 완료되면 권한과 자격증명 상태가 갱신됩니다.`,
      badge: "처리 중",
      policy: requestEvents.some(
        (event) => String(event.stage ?? "") === "vault",
      )
        ? "평가 중"
        : "평가 전",
      credentials: credentialsIssued ? "발급 완료" : "발급 전",
    },
    allowed: {
      result: "PostgreSQL 읽기 접근 허용",
      description:
        "Verify 사용자와 Bob OBO 신원이 검증되었고, Vault가 읽기 전용 데이터 접근을 허용했습니다.",
      badge: "허용",
      policy: "읽기 전용 허용",
      credentials: "발급·사용 완료",
    },
    denied: {
      result: deniedResultByStage[stageKey] ?? `${stage} 단계에서 접근 차단`,
      description:
        deniedDescriptionByStage[stageKey] ??
        `${stage} 단계에서 요청을 차단했습니다. 이후 데이터 접근은 수행되지 않았습니다.`,
      badge: "차단",
      policy: deniedPolicy,
      credentials: credentialsIssued ? "발급 후 사용 차단" : "미발급",
    },
    error: {
      result: "접근 처리 중 오류 발생",
      description: `${stage} 단계에서 처리 오류가 발생했습니다. 최근 보안 결정을 확인해 주세요.`,
      badge: "오류",
      policy: errorPolicy,
      credentials: credentialsIssued ? "발급 여부 확인" : "미발급",
    },
  };
  const copy = copyByKind[kind];
  const action = formatAction(requestEvents[0]?.action);

  accessStatusSummary.className = `access-status-summary ${kind}`;
  accessStatusBadge.className = `access-status-badge ${kind}`;
  accessStatusRequest.textContent = `${requestId ? `요청 ${requestId.slice(0, 8)}` : "최근 요청"} · ${eventTime}`;
  accessStatusResult.textContent = copy.result;
  accessStatusDescription.textContent = copy.description;
  accessStatusBadge.textContent = copy.badge;
  accessStatusStage.textContent = stage;
  accessStatusPolicy.textContent = copy.policy;
  accessStatusCredentials.textContent = copy.credentials;
  if (kind === "allowed" && latestCredential) {
    accessStatusCredentials.textContent = latestCredential;
  }
  accessStatusAction.textContent = action;
  accessStatusAction.title = action;
  accessStatusSummary.setAttribute(
    "aria-label",
    `${copy.result}. ${copy.description}`,
  );
}

function renderState(kind, message) {
  eventList.replaceChildren(element("li", `state ${kind}`, message));
}

function updatePathFromEvents(events) {
  if (!Array.isArray(events) || events.length === 0) {
    resetTelemetryPath();
    return;
  }
  resetVisiblePath();
  Object.values(pathSteps).forEach((step) => step?.classList.remove("active"));
  const pathByStage = {
    identity: "verify",
    policy: "agent",
    transport: "mcp",
    vault: "vault",
    database: "database",
  };
  const updated = new Set();
  const requestEvents = latestRequestEvents(events);
  const terminalEvent = requestEvents.find((event) => {
    const status = String(event.status ?? "");
    return status === "denied" || (status !== "allowed" && status !== "ok");
  });
  const terminalStatus = String(terminalEvent?.status ?? "");
  const databaseComplete = requestEvents.some((event) => {
    const status = String(event.status ?? "");
    return (
      String(event.stage ?? "") === "database" &&
      (status === "allowed" || status === "ok")
    );
  });
  const traceState =
    terminalStatus === "denied"
      ? { label: "요청 차단", kind: "denied" }
      : terminalEvent
        ? { label: "요청 오류", kind: "error" }
        : databaseComplete
          ? { label: "접근 완료", kind: "verified" }
          : { label: "처리 중", kind: "active" };

  traceLiveState.textContent = traceState.label;
  traceLiveState.className = `live-state ${traceState.kind}`;

  for (const [index, event] of requestEvents.entries()) {
    const key = pathByStage[String(event.stage ?? "")];
    if (!key || updated.has(key)) continue;
    updated.add(key);
    const eventDate = new Date(event.at);
    const time = Number.isNaN(eventDate.getTime())
      ? "—"
      : seoulTimeFormatter.format(eventDate);
    const rawStatus = String(event.status ?? "error");
    const status =
      key === "agent"
        ? "allowed"
        : rawStatus === "allowed" || rawStatus === "ok"
          ? "allowed"
          : rawStatus === "denied"
            ? "denied"
            : "error";
    const label =
      key === "agent" && rawStatus === "denied"
        ? "정책 적용"
        : status === "allowed"
          ? key === "vault"
            ? "허용"
            : "성공"
          : rawStatus === "denied"
            ? "차단"
            : "오류";
    updatePathStep(key, label, status, time, index === 0);
  }
}

function resetTelemetryPath() {
  resetVisiblePath();
  traceLiveState.textContent = "대기";
  traceLiveState.className = "live-state waiting";
}

function renderEvents(events) {
  eventList.replaceChildren();
  if (!Array.isArray(events) || events.length === 0) {
    resetTelemetryPath();
    renderState("empty", "아직 기록된 보안 결정이 없습니다.");
    return;
  }

  updatePathFromEvents(events);

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

    row.append(status, action, timestamp, stage);
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

async function loadEvents(announce = false) {
  if (eventsRequestInFlight || workspace.hidden) return;
  eventsRequestInFlight = true;
  setRefreshState(true);
  if (announce && refreshAnnouncement) refreshAnnouncement.textContent = "";
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
    renderCurrentAccessStatus(payload.events);
    lastUpdated.textContent = `마지막 업데이트 ${seoulTimeFormatter.format(new Date())}`;
    if (announce && refreshAnnouncement) {
      refreshAnnouncement.textContent = `보안 결정 ${String(payload.events.length)}건을 새로고침했습니다.`;
    }
  } catch {
    resetTelemetryPath();
    renderState(
      "error",
      "보안 결정 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
    renderCurrentAccessStatus([], true);
    lastUpdated.textContent = "업데이트 실패";
    if (announce && refreshAnnouncement) {
      refreshAnnouncement.textContent =
        "보안 결정을 새로고침하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    }
  } finally {
    eventsRequestInFlight = false;
    setRefreshState(false);
  }
}

themeToggle?.addEventListener("click", toggleTheme);
refresh?.addEventListener("click", () => void loadEvents(true));
demoReset?.addEventListener("click", () => void resetDemoSession());

async function resetDemoSession() {
  demoReset.disabled = true;
  try {
    const response = await fetch("/api/demo/reset-session", {
      method: "POST",
      headers: { "x-csrf-token": csrfToken },
    });
    if (response.status === 401) {
      window.location.assign("/auth/login");
      return;
    }
    if (!response.ok) throw new Error("reset unavailable");
    latestCredential = null;
    latestTool = "";
    conversation.innerHTML = defaultConversationMarkup;
    renderTrace([]);
    renderEvents([]);
    renderCurrentAccessStatus([]);
    lastUpdated.textContent = "데모 세션이 초기화되었습니다";
    input.value = "";
    input.focus();
    void runPreflight();
  } catch {
    addMessage(
      "agent",
      "현재 데모 세션을 초기화하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      "초기화 실패",
    );
  } finally {
    demoReset.disabled = false;
  }
}

document.querySelector("#identity-path")?.addEventListener("click", (event) => {
  const step = event.target.closest?.("[data-stage]");
  if (!step) return;
  openStageDialog(step.dataset.stage, step);
});

document
  .querySelector("#identity-path")
  ?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const step = event.target.closest?.("[data-stage]");
    if (!step) return;
    event.preventDefault();
    openStageDialog(step.dataset.stage, step);
  });

document.querySelectorAll("[data-stage-dialog-close]").forEach((button) => {
  button.addEventListener("click", closeStageDialog);
});

stageDialog?.addEventListener("click", (event) => {
  if (event.target === stageDialog) closeStageDialog();
});

stageDialog?.addEventListener("close", () => {
  if (stageDialogTrigger?.isConnected) stageDialogTrigger.focus();
  stageDialogTrigger = null;
});

stageCodeCopy?.addEventListener("click", async () => {
  try {
    await window.navigator.clipboard.writeText(stageDialogCode.textContent);
    stageCodeCopy.textContent = "복사됨";
    window.setTimeout(() => (stageCodeCopy.textContent = "코드 복사"), 1200);
  } catch {
    stageCodeCopy.textContent = "복사 불가";
  }
});

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

document.addEventListener("click", (event) => {
  const button = event.target.closest?.("button[data-prompt]");
  if (!button || button.disabled) return;
  const prompt = button.getAttribute("data-prompt");
  if (prompt) void sendMessage(prompt);
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
