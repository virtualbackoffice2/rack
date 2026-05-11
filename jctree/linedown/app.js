const API_BASE = "https://app.vbo.co.in";
const WINDOWS = ["MEROTRA", "SUNNY"];

const state = {
  window: WINDOWS[0],
  tab: "pending",
  rows: [],
  lastUpdated: "",
};

const els = {
  windowSelect: document.getElementById("windowSelect"),
  refreshBtn: document.getElementById("refreshBtn"),
  records: document.getElementById("records"),
  summaryText: document.getElementById("summaryText"),
  windowBadge: document.getElementById("windowBadge"),
  updatedBadge: document.getElementById("updatedBadge"),
  countBadge: document.getElementById("countBadge"),
  messageBox: document.getElementById("messageBox"),
  tabs: document.querySelectorAll(".tab"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function display(value) {
  const text = String(value ?? "").trim();
  return text || "--";
}

function isRecovered(row) {
  return String(row.status || "").toUpperCase() === "UP" || Boolean(String(row.up_at || "").trim());
}

function isDone(row) {
  return String(row.Audit || "").toLowerCase() === "done";
}

function formatDate(value) {
  return display(value);
}

function currentTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function buildAuditRemark(remark) {
  const text = String(remark || "").trim();
  const timestamp = currentTimestamp();
  return text ? `${timestamp} - ${text}` : timestamp;
}

function showMessage(text, isError = false) {
  els.messageBox.hidden = !text;
  els.messageBox.textContent = text || "";
  els.messageBox.style.color = isError ? "#b42318" : "";
}

function setLoading(isLoading) {
  els.refreshBtn.disabled = isLoading;
  els.refreshBtn.textContent = isLoading ? "Loading" : "Refresh";
}

function endpoint(windowName) {
  return `${API_BASE}/${encodeURIComponent(windowName)}/linetracker`;
}

function timestampEndpoint(windowName) {
  return `${API_BASE}/${encodeURIComponent(windowName)}/usertag`;
}

async function loadData() {
  setLoading(true);
  showMessage("");
  try {
    const [response, timestampResponse] = await Promise.all([
      fetch(endpoint(state.window), { cache: "no-store" }),
      fetch(timestampEndpoint(state.window), { cache: "no-store" }),
    ]);
    if (!response.ok) throw new Error(`Fetch failed (${response.status})`);
    const data = await response.json();
    const timestampData = timestampResponse.ok ? await timestampResponse.json() : {};
    state.rows = Array.isArray(data.items) ? data.items : [];
    state.lastUpdated = timestampData.runtime_timestamp || timestampData.timestamp || "";
    render();
  } catch (error) {
    state.rows = [];
    state.lastUpdated = "";
    render();
    showMessage(error.message || "Unable to load tracker data", true);
  } finally {
    setLoading(false);
  }
}

async function saveAudit(id, audit, remark) {
  showMessage("");
  const response = await fetch(endpoint(state.window), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      Audit: audit,
      AuditRemark: remark,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || `Update failed (${response.status})`);
  }
  return data;
}

function filteredRows() {
  if (state.tab === "history") return state.rows.filter(isDone);
  return state.rows.filter((row) => !isDone(row));
}

function renderBadges(rows) {
  const pending = state.rows.filter((row) => !isDone(row)).length;
  const history = state.rows.filter(isDone).length;

  els.summaryText.textContent = `${pending} pending, ${history} history records`;
  els.windowBadge.textContent = state.window;
  els.updatedBadge.textContent = `Last updated: ${state.lastUpdated || "--"}`;
  els.countBadge.textContent = `${rows.length} visible / ${state.rows.length} total`;
}

function recordMeta(row) {
  const fields = [
    ["Point", `${display(row.point_type)} / ${display(row.point_key)}`],
    ["PON", row.pon_number],
    ["Users", `${display(row.not_up_count)} not up / ${display(row.total_user_count)} total`],
    ["JC", row.jcname],
    ["JC OTDR", row.jc_otdr],
    ["Previous JC", row.jc_previousjc],
    ["Wire", row.wire_drum],
    ["Wire Type", row.wiretype],
    ["Core", row.corecolorandnumber],
    ["Tube", row.tube],
    ["Down At", formatDate(row.down_at)],
    ["Up At", formatDate(row.up_at)],
  ];

  return fields
    .map(([label, value]) => `
      <div class="field">
        <span class="label">${escapeHtml(label)}</span>
        <span class="value">${escapeHtml(display(value))}</span>
      </div>
    `)
    .join("");
}

function renderAuditPanel(row) {
  const recovered = isRecovered(row);
  const remark = escapeHtml(row.AuditRemark || "");

  if (isDone(row)) {
    return `
      <aside class="audit-panel">
        <span class="pill up">Done</span>
        <p class="small-note">${escapeHtml(display(row.AuditRemark))}</p>
      </aside>
    `;
  }

  if (!recovered) {
    return `
      <aside class="audit-panel">
        <span class="pill waiting">Waiting for UP</span>
        <p class="small-note">Audit can be completed after this point recovers.</p>
      </aside>
    `;
  }

  return `
    <aside class="audit-panel">
      <span class="pill up">Recovered</span>
      <select data-audit="${row.id}" aria-label="Audit status">
        <option value="Pending" ${isDone(row) ? "" : "selected"}>Pending</option>
        <option value="Done" ${isDone(row) ? "selected" : ""}>Done</option>
      </select>
      <textarea data-remark="${row.id}" placeholder="Audit remark">${remark}</textarea>
      <div class="audit-actions">
        <button class="save-btn" type="button" data-save="${row.id}">Save Audit</button>
      </div>
    </aside>
  `;
}

function renderRecord(row) {
  const statusClass = isRecovered(row) ? "up" : "down";
  const statusText = isRecovered(row) ? "UP" : "DOWN";
  return `
    <article class="record">
      <section>
        <div class="record-head">
          <h2 class="record-title">${escapeHtml(display(row.jcname))}</h2>
          <span class="pill ${statusClass}">${statusText}</span>
        </div>
        <div class="meta-grid">${recordMeta(row)}</div>
      </section>
      ${renderAuditPanel(row)}
    </article>
  `;
}

function bindSaveButtons() {
  document.querySelectorAll("[data-save]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.dataset.save);
      const textarea = document.querySelector(`[data-remark="${id}"]`);
      const select = document.querySelector(`[data-audit="${id}"]`);
      button.disabled = true;
      button.textContent = "Saving";
      try {
        await saveAudit(id, select ? select.value : "Done", buildAuditRemark(textarea ? textarea.value : ""));
        await loadData();
        showMessage("Audit updated.");
      } catch (error) {
        showMessage(error.message || "Unable to update audit", true);
      } finally {
        button.disabled = false;
        button.textContent = "Save Audit";
      }
    });
  });
}

function render() {
  const rows = filteredRows();
  renderBadges(rows);
  if (!rows.length) {
    els.records.innerHTML = `<div class="empty">No ${state.tab} line tracker records.</div>`;
    return;
  }
  els.records.innerHTML = rows.map(renderRecord).join("");
  bindSaveButtons();
}

function init() {
  els.windowSelect.innerHTML = WINDOWS.map((name) => `<option value="${name}">${name}</option>`).join("");
  els.windowSelect.value = state.window;
  els.windowSelect.addEventListener("change", () => {
    state.window = els.windowSelect.value;
    loadData();
  });
  els.refreshBtn.addEventListener("click", loadData);
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      els.tabs.forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      state.tab = tab.dataset.tab;
      render();
    });
  });
  loadData();
}

init();
