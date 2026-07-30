const readiness = document.querySelector("#readiness");
const mode = document.querySelector("#mode");
const version = document.querySelector("#version");
const eventList = document.querySelector("#events");
const refresh = document.querySelector("#refresh");

const allowedStatuses = new Set(["allowed", "denied", "error", "ok"]);

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

async function loadStatus() {
  try {
    const response = await fetch("/api/status", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("status unavailable");
    const status = await response.json();
    readiness.textContent = status.configured ? "Enforced" : "Bootstrap";
    readiness.classList.toggle("ready", Boolean(status.configured));
    mode.textContent = status.configured
      ? "Identity path configured"
      : "Waiting for IBM Verify values";
    version.textContent = `version ${String(status.version).slice(0, 32)}`;
  } catch {
    readiness.textContent = "Unavailable";
    mode.textContent = "Status check failed";
  }
}

function renderEvents(events) {
  eventList.replaceChildren();
  if (!Array.isArray(events) || events.length === 0) {
    eventList.append(makeElement("li", "empty", "Waiting for a security decision…"));
    return;
  }

  for (const event of events) {
    const row = document.createElement("li");
    const timestamp = makeElement(
      "time",
      "",
      new Date(event.at).toLocaleTimeString([], { hour12: false }),
    );
    timestamp.dateTime = String(event.at);
    const stage = makeElement("span", "event-stage", String(event.stage).toUpperCase());
    const safeStatus = allowedStatuses.has(event.status) ? event.status : "error";
    const status = makeElement("span", `event-status ${safeStatus}`, safeStatus);
    const action = makeElement("span", "event-action", String(event.action));
    row.append(timestamp, stage, status, action);
    eventList.append(row);
  }
}

async function loadEvents() {
  refresh.disabled = true;
  try {
    const response = await fetch("/api/demo/events?limit=20", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("events unavailable");
    const payload = await response.json();
    renderEvents(payload.events);
  } catch {
    renderEvents([]);
  } finally {
    refresh.disabled = false;
  }
}

refresh.addEventListener("click", loadEvents);
await Promise.all([loadStatus(), loadEvents()]);
window.setInterval(loadEvents, 10_000);
