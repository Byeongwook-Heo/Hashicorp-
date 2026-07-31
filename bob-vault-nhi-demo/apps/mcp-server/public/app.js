const loginPanel = document.querySelector("#login-panel");
const workspace = document.querySelector("#workspace");
const identity = document.querySelector("#identity");
const userName = document.querySelector("#user-name");
const loginError = document.querySelector("#login-error");
const serviceVersion = document.querySelector("#service-version");
const conversation = document.querySelector("#conversation");
const trace = document.querySelector("#trace");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#chat-input");
const send = document.querySelector("#send");
const logout = document.querySelector("#logout");
let csrfToken = "";

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function loadStatus() {
  try {
    const response = await fetch("/api/status", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return;
    const status = await response.json();
    serviceVersion.textContent = `version ${String(status.version).slice(0, 32)}`;
  } catch {
    serviceVersion.textContent = "version unavailable";
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
  identity.hidden = false;
  loginPanel.hidden = true;
  workspace.hidden = false;
  input.focus();
}

function showLogin() {
  workspace.hidden = true;
  identity.hidden = true;
  loginPanel.hidden = false;
  loginError.hidden = !new window.URLSearchParams(window.location.search).has(
    "auth_error",
  );
}

function addMessage(kind, text, metadata) {
  const article = element(
    "article",
    `message ${kind === "user" ? "user-message" : "agent-message"}`,
  );
  const avatar = element(
    "div",
    `message-avatar ${kind === "user" ? "user-avatar" : "agent-avatar"}`,
    kind === "user" ? userName.textContent.slice(0, 1) || "U" : "A",
  );
  avatar.setAttribute("aria-hidden", "true");
  const body = element("div", "message-body");
  body.append(
    element(
      "span",
      "message-label",
      kind === "user" ? userName.textContent : "Security Agent",
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
  document
    .querySelectorAll(".suggestions button")
    .forEach((button) => (button.disabled = busy));
}

function addThinking() {
  const article = addMessage("agent", "MCP 도구와 권한을 확인하고 있습니다…");
  article.classList.add("thinking");
  return article;
}

function renderTrace(steps) {
  trace.replaceChildren();
  for (const [index, step] of steps.entries()) {
    const item = document.createElement("li");
    const copy = document.createElement("div");
    copy.append(
      element("strong", "", String(step.label)),
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
  addMessage("user", trimmed);
  input.value = "";
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
        ? `MCP · ${String(payload.tool)} · request ${String(payload.requestId).slice(0, 8)}`
        : "Agent 정책 안내",
    );
    renderTrace(Array.isArray(payload.trace) ? payload.trace : []);
  } catch (error) {
    thinking.remove();
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

await loadStatus();
try {
  await loadSession();
} catch {
  showLogin();
  loginError.textContent =
    "인증 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  loginError.hidden = false;
}
