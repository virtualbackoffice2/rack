// ===============================
// Power Variance Analysis Page
// ===============================

const baseUrl = "https://app.vbo.co.in";
let currentWindow = "ALL";

let mode = "power"; // power | event
let viewMode = "cards"; // cards | table

let powerRows = [];
let eventRows = [];

let powerUsers = [];
let eventUsers = [];

let filtered = [];

const cardContainer = document.getElementById("cardView");
const tbody = document.querySelector("#dataTable tbody");
const tableWrap = document.getElementById("tableWrap");
const spinner = document.getElementById("spinnerOverlay");
const toastEl = document.getElementById("toast");

const menuToggle = document.getElementById("menuToggle");
const topMenu = document.getElementById("topMenu");
const userCount = document.getElementById("userCount");

const btnPowerHistory = document.getElementById("btnPowerHistory");
const btnEventHistory = document.getElementById("btnEventHistory");
const btnRefresh = document.getElementById("btnRefresh");
const btnToggleView = document.getElementById("btnToggleView");

const powerGapSearch = document.getElementById("powerGapSearch");
const powerKeywordSearch = document.getElementById("powerKeywordSearch");
const eventKeywordSearch = document.getElementById("eventKeywordSearch");

const filtersPower = document.getElementById("filtersPower");
const filtersEvent = document.getElementById("filtersEvent");

const thMode = document.getElementById("thMode");

// Modal
const complaintModal = document.getElementById("complaintModal");
const modalBody = document.getElementById("modalBody");
const modalTitle = document.getElementById("modalTitle");
const modalCloseBtn = document.getElementById("modalCloseBtn");

// ---------------- Toast + Spinner ----------------
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2500);
}
function showSpinner() { spinner.style.display = "flex"; }
function hideSpinner() { spinner.style.display = "none"; }

function safeParseDate(s) {
  const d = new Date(s || "");
  return isNaN(d.getTime()) ? new Date(0) : d;
}
function norm(s) { return String(s || "").trim().toLowerCase(); }
function setHeadingCount(count) { userCount.textContent = `(${count})`; }

// ---------------- Mobile friendly menu ----------------
function setupMenu() {
  // hide menu by default on mobile
  if (window.innerWidth <= 720) {
    topMenu.classList.add("mobileHidden");
  }
}
setupMenu();

menuToggle.onclick = () => {
  topMenu.classList.toggle("mobileHidden");
};

// Auto close menu after click on mobile
topMenu.addEventListener("click", () => {
  if (window.innerWidth <= 720) topMenu.classList.add("mobileHidden");
});

// Modal events
if (modalCloseBtn && complaintModal) modalCloseBtn.onclick = () => complaintModal.style.display = "none";
if (complaintModal) {
  complaintModal.onclick = (e) => {
    if (e.target === complaintModal) complaintModal.style.display = "none";
  };
}

// ---------------- Fetchers ----------------
async function fetchWindowPower(windowName) {
  const url = `${baseUrl}/${windowName}/poworlog?limit=5000`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return (data.rows || []).map(r => ({ ...r, _window: windowName }));
  } catch {
    showToast(`Failed to load powerlog ${windowName}`);
    return [];
  }
}

async function fetchWindowEvent(windowName) {
  const url = `${baseUrl}/${windowName}/eventlog?limit=5000`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return (data.rows || []).map(r => ({ ...r, _window: windowName }));
  } catch {
    showToast(`Failed to load eventlog ${windowName}`);
    return [];
  }
}

// ---------------- Grouping ----------------
function groupPowerUsers(rows) {
  const map = {};
  rows.forEach(r => {
    const key = norm(r.user_id || r.mac_address || "");
    if (!key) return;

    if (!map[key]) {
      map[key] = {
        key,
        _window: r._window,
        user_id: r.user_id || "",
        name: r.name || "",
        address: r.address || "",
        primary_phone: r.primary_phone || "",
        mac_address: r.mac_address || "",
        window_name: r.window_name || "",
        pon_number: r.pon_number || "",
        status: r.status || "",
        logs: []
      };
    }
    map[key].logs.push({
      rxPower: (r.rxPower != null ? Number(r.rxPower) : null),
      inserted_at: r.inserted_at || ""
    });
  });

  const out = Object.values(map);

  out.forEach(u => {
    u.logs.sort((a, b) => safeParseDate(a.inserted_at) - safeParseDate(b.inserted_at));
    u.last_ts = u.logs.length ? u.logs[u.logs.length - 1].inserted_at : "";

    // ✅ recent two for gap only
    const n = u.logs.length;
    if (n >= 2 && u.logs[n - 1].rxPower != null && u.logs[n - 2].rxPower != null) {
      u.varGap = Number((u.logs[n - 1].rxPower - u.logs[n - 2].rxPower).toFixed(2));
    } else {
      u.varGap = null;
    }
  });

  out.sort((a, b) => {
    const av = a.varGap == null ? -999 : Math.abs(a.varGap);
    const bv = b.varGap == null ? -999 : Math.abs(b.varGap);
    if (bv !== av) return bv - av;
    return safeParseDate(b.last_ts) - safeParseDate(a.last_ts);
  });

  return out;
}

function groupEventUsers(rows) {
  const map = {};
  rows.forEach(r => {
    const key = norm(r.user_id || r.mac_address || "");
    if (!key) return;

    if (!map[key]) {
      map[key] = {
        key,
        _window: r._window,
        user_id: r.user_id || "",
        name: r.name || "",
        address: r.address || "",
        primary_phone: r.primary_phone || "",
        mac_address: r.mac_address || "",
        window_name: r.window_name || "",
        pon_number: r.pon_number || "",
        status: r.status || "",
        logs: []
      };
    }
    map[key].logs.push({
      downEvent: r.downEvent || "",
      inserted_at: r.inserted_at || ""
    });
  });

  const out = Object.values(map);
  out.forEach(u => {
    u.logs.sort((a, b) => safeParseDate(a.inserted_at) - safeParseDate(b.inserted_at));
    u.last_ts = u.logs.length ? u.logs[u.logs.length - 1].inserted_at : "";
  });

  out.sort((a, b) => safeParseDate(b.last_ts) - safeParseDate(a.last_ts));
  return out;
}

// ---------------- Render (Cards/Table) ----------------
function render() {
  cardContainer.innerHTML = "";
  tbody.innerHTML = "";

  setHeadingCount(filtered.length);

  // update table column heading
  thMode.textContent = (mode === "power") ? "Recent Gap" : "Last Event";

  if (!filtered.length) {
    cardContainer.style.display = (viewMode === "cards") ? "grid" : "none";
    tableWrap.style.display = (viewMode === "table") ? "block" : "none";
    if (viewMode === "cards") {
      cardContainer.innerHTML =
        '<div style="text-align:center;padding:20px;color:rgba(229,231,235,.65);font-weight:900;">No users found</div>';
    }
    return;
  }

  if (viewMode === "cards") {
    cardContainer.style.display = "grid";
    tableWrap.style.display = "none";
    renderCards();
  } else {
    cardContainer.style.display = "none";
    tableWrap.style.display = "block";
    renderTable();
  }
}

function renderCards() {
  filtered.forEach(u => {
    const card = document.createElement("div");
    card.className = "complaint-card";

// ✅ Blink if recent gap <= -2 (means power down by 2 dBm or more)
if (mode === "power" && u.varGap != null && u.varGap <= -2) {
  card.classList.add("alertBlink");
}


    const statusEmoji = String(u.status || "").toUpperCase() === "DOWN" ? "📵" : "📶";

    const title = `
      <div class="card-header">
        ${u.name || "Unknown"} <span>${statusEmoji}</span>
      </div>
    `;

    const head = `
      <div class="card-row"><span class="card-label">Window:</span><span class="card-value">${u._window || u.window_name || ""}</span></div>
      <div class="card-row"><span class="card-label">User ID:</span><span class="card-value">${u.user_id || ""}</span></div>
      <div class="card-row"><span class="card-label">MAC:</span><span class="card-value">${u.mac_address || ""}</span></div>
      <div class="card-row"><span class="card-label">PON:</span><span class="card-value">${u.pon_number || ""}</span></div>
      <div class="card-row"><span class="card-label">Status:</span><span class="card-value">${u.status || ""}</span></div>
    `;

    let mid = "";
    if (mode === "power") {
      const v = (u.varGap == null) ? "N/A" : (u.varGap > 0 ? `+${u.varGap}` : `${u.varGap}`);
      mid += `<div style="margin-top:8px;"><span class="badgeVar">Recent gap: ${v} dBm</span></div>`;

      // ✅ chart uses ALL power points
      mid += buildSpark(u.logs);
    } else {
      // keep last 8 in card, full in popup
      mid += buildEvents(u.logs);
    }

    const actions = `
      <div style="margin-top:10px;">
        <span class="rowLink">Open full record</span>
      </div>
    `;

    card.innerHTML = title + head + mid + actions;

    card.querySelector(".rowLink").onclick = (e) => {
      e.stopPropagation();
      openUserPopup(u);
    };

    cardContainer.appendChild(card);

    if (mode === "power") {
      const canvas = card.querySelector("canvas");
      if (canvas) drawSpark(canvas, u.logs);
    }
  });
}

function renderTable() {
  filtered.forEach(u => {
    const tr = document.createElement("tr");

    const varText = (() => {
      if (mode === "event") {
        const last = u.logs.length ? u.logs[u.logs.length - 1] : null;
        return last ? last.downEvent : "";
      }
      if (u.varGap == null) return "";
      return (u.varGap > 0 ? `+${u.varGap}` : `${u.varGap}`) + " dBm";
    })();

    tr.innerHTML = `
      <td>${u._window || ""}</td>
      <td><span class="rowLink">${u.user_id || ""}</span></td>
      <td>${u.name || ""}</td>
      <td>${u.mac_address || ""}</td>
      <td>${u.pon_number || ""}</td>
      <td>${u.status || ""}</td>
      <td>${varText}</td>
      <td>${u.last_ts || ""}</td>
    `;

    tr.querySelector(".rowLink").onclick = (e) => {
      e.stopPropagation();
      openUserPopup(u);
    };

    tbody.appendChild(tr);
  });
}

function buildSpark(logs) {
  const last = logs.length ? logs[logs.length - 1] : null;
  const first = logs.length ? logs[0] : null;
  return `
    <div class="sparkWrap">
      <div class="sparkMeta">
        <span>${first ? first.inserted_at : ""}</span>
        <span>${last ? last.inserted_at : ""}</span>
      </div>
      <canvas class="sparkCanvas" width="600" height="120"></canvas>
    </div>
  `;
}

function drawSpark(canvas, logs) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const values = logs.map(x => x.rxPower).filter(v => v != null);

  // No enough data
  if (values.length < 2) {
    ctx.font = "22px Arial";
    ctx.fillStyle = "#64748b";
    ctx.fillText("No graph data", 20, 60);
    return;
  }

  // -------------------------------
  // ✅ Line color logic (recent two)
  // power down => red
  // power up => green
  // otherwise => blue
  // -------------------------------
  let lineColor = "#2563eb"; // default BLUE

  if (logs.length >= 2) {
    const last = logs[logs.length - 1].rxPower;
    const prev = logs[logs.length - 2].rxPower;

    if (last != null && prev != null) {
      const diff = last - prev;
      if (diff < 0) lineColor = "#dc2626";       // RED (down)
      else if (diff > 0) lineColor = "#16a34a";  // GREEN (up)
    }
  }

  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const pad = 10;

  const points = logs
    .filter(x => x.rxPower != null)
    .map((x, i, arr) => {
      const t = i / (arr.length - 1 || 1);
      const xPix = pad + t * (W - pad * 2);
      const v = x.rxPower;
      const yPix = (maxV === minV)
        ? H / 2
        : (H - pad) - ((v - minV) / (maxV - minV)) * (H - pad * 2);

      return { x: xPix, y: yPix };
    });

  // Draw line
  ctx.strokeStyle = lineColor;
  ctx.fillStyle = lineColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  points.forEach((p, idx) => {
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  // Draw points
  ctx.beginPath();
  points.forEach(p => {
    ctx.moveTo(p.x + 3, p.y);
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
  });
  ctx.fill();

  // Labels (min/max)
  ctx.font = "20px Arial";
  ctx.fillStyle = "#334155";
  ctx.fillText(`${maxV.toFixed(2)} dBm`, 10, 24);
  ctx.fillText(`${minV.toFixed(2)} dBm`, 10, H - 10);
}


function buildEvents(logs) {
  if (!logs.length) return `<div class="eventList">No events</div>`;
  const lastN = logs.slice(-8).reverse();
  return `
    <div class="eventList">
      ${lastN.map(ev => `
        <div class="eventItem">
          <div>${ev.downEvent || ""}</div>
          <div class="eventTime">${ev.inserted_at || ""}</div>
        </div>
      `).join("")}
    </div>
  `;
}

// ---------------- Popup (FULL history) ----------------
function openUserPopup(u) {
  if (modalTitle) modalTitle.textContent = `${u.name || "User"} (${u.user_id || u.mac_address || ""})`;

  let html = `
    <div class="modalEntry">
      <div class="modalRow"><b>Window:</b> ${u._window || u.window_name || ""}</div>
      <div class="modalRow"><b>User ID:</b> ${u.user_id || ""}</div>
      <div class="modalRow"><b>Name:</b> ${u.name || ""}</div>
      <div class="modalRow"><b>Address:</b> ${u.address || ""}</div>
      <div class="modalRow"><b>Primary Phone:</b> ${u.primary_phone || ""}</div>
      <div class="modalRow"><b>MAC:</b> ${u.mac_address || ""}</div>
      <div class="modalRow"><b>PON:</b> ${u.pon_number || ""}</div>
      <div class="modalRow"><b>Status:</b> ${u.status || ""}</div>
    </div>
  `;

  if (mode === "power") {
    html += `<div style="font-weight:1000;margin-top:10px;">Power History (All)</div>`;
    const list = [...u.logs].reverse(); // newest first
    list.forEach((r, idx) => {
      html += `
        <div class="modalEntry">
          <div class="modalRow"><b>#</b> ${idx + 1}</div>
          <div class="modalRow"><b>rxPower:</b> ${r.rxPower != null ? Number(r.rxPower).toFixed(2) : ""}</div>
          <div class="modalRow"><b>Inserted:</b> ${r.inserted_at || ""}</div>
        </div>
      `;
    });
  } else {
    html += `<div style="font-weight:1000;margin-top:10px;">Event History (All)</div>`;
    const list = [...u.logs].reverse();
    list.forEach((r, idx) => {
      html += `
        <div class="modalEntry">
          <div class="modalRow"><b>#</b> ${idx + 1}</div>
          <div class="modalRow"><b>downEvent:</b> ${r.downEvent || ""}</div>
          <div class="modalRow"><b>Inserted:</b> ${r.inserted_at || ""}</div>
        </div>
      `;
    });
  }

  modalBody.innerHTML = html;
  complaintModal.style.display = "flex";
}

// ---------------- Filters ----------------
function applyFilters() {
  if (mode === "power") {
    const gapText = String(powerGapSearch.value || "").trim();
    const kw = norm(powerKeywordSearch.value || "");
    let data = [...powerUsers];

    // keyword filter 3 letters
    if (kw.length >= 3) {
      data = data.filter(u => {
        const blob = [u.user_id, u.name, u.address, u.mac_address].map(norm).join(" | ");
        return blob.includes(kw);
      });
    }

    // gap filter: sign + digit typed
    if (/^[+-]\d/.test(gapText)) {
      const sign = gapText[0];
      const num = parseFloat(gapText.slice(1));
      if (!isNaN(num)) {
        if (sign === "+") {
          // decrease >= num -> latest - prev <= -num
          data = data.filter(u => {
            if (u.logs.length < 2) return false;
            const n = u.logs.length;
            const latest = u.logs[n - 1].rxPower;
            const prev = u.logs[n - 2].rxPower;
            if (latest == null || prev == null) return false;
            const diff = latest - prev;
            return diff <= (-num);
          });
        } else {
          // increase >= num -> latest - prev >= num
          data = data.filter(u => {
            if (u.logs.length < 2) return false;
            const n = u.logs.length;
            const latest = u.logs[n - 1].rxPower;
            const prev = u.logs[n - 2].rxPower;
            if (latest == null || prev == null) return false;
            const diff = latest - prev;
            return diff >= num;
          });
        }
      }
    }

    filtered = data;
  } else {
    const kw = norm(eventKeywordSearch.value || "");
    let data = [...eventUsers];

    if (kw.length >= 3) {
      data = data.filter(u => {
        const blob = [u.user_id, u.name, u.address, u.mac_address].map(norm).join(" | ");
        return blob.includes(kw);
      });
    }
    filtered = data;
  }

  render();
}

// ---------------- Buttons / events ----------------
document.getElementById("windowSelect").onchange = (e) => {
  currentWindow = e.target.value;
  loadAll();
};

btnPowerHistory.onclick = () => {
  mode = "power";
  filtersPower.style.display = "";
  filtersEvent.style.display = "none";
  powerGapSearch.value = "";
  powerKeywordSearch.value = "";
  eventKeywordSearch.value = "";
  applyFilters();
};

btnEventHistory.onclick = () => {
  mode = "event";
  filtersPower.style.display = "none";
  filtersEvent.style.display = "";
  powerGapSearch.value = "";
  powerKeywordSearch.value = "";
  eventKeywordSearch.value = "";
  applyFilters();
};

btnRefresh.onclick = () => loadAll();

// Toggle cards/table
btnToggleView.onclick = () => {
  viewMode = (viewMode === "cards") ? "table" : "cards";
  btnToggleView.innerHTML = (viewMode === "cards")
    ? '<i class="fa-solid fa-table"></i> Table'
    : '<i class="fa-solid fa-grip"></i> Cards';
  render();
};

// live search
powerGapSearch.oninput = () => applyFilters();
powerKeywordSearch.oninput = () => {
  const kw = norm(powerKeywordSearch.value || "");
  if (kw.length === 0 || kw.length >= 3) applyFilters();
};
eventKeywordSearch.oninput = () => {
  const kw = norm(eventKeywordSearch.value || "");
  if (kw.length === 0 || kw.length >= 3) applyFilters();
};

// screenshot
document.getElementById("btnScreenshot").onclick = () => {
  html2canvas(document.getElementById("contentWrap"), {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: null
  }).then(canvas => {
    const link = document.createElement("a");
    link.download = (mode === "power" ? "power-history" : "event-history") + "-screenshot.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    showToast("Screenshot downloaded");
  }).catch(() => showToast("Screenshot failed"));
};

// CSV
document.getElementById("btnCsv").onclick = () => {
  if (!filtered.length) return showToast("No data to export");

  let headers = [];
  let lines = [];

  if (mode === "power") {
    headers = ["Window", "User ID", "Name", "MAC", "PON", "Status", "RecentGap(dBm)", "LastUpdated"];
    lines = filtered.map(u => [
      u._window || "",
      u.user_id || "",
      u.name || "",
      u.mac_address || "",
      u.pon_number || "",
      u.status || "",
      (u.varGap == null ? "" : u.varGap),
      u.last_ts || ""
    ]);
  } else {
    headers = ["Window", "User ID", "Name", "MAC", "PON", "Status", "LastEvent", "LastUpdated"];
    lines = filtered.map(u => {
      const last = u.logs.length ? u.logs[u.logs.length - 1] : null;
      return [
        u._window || "",
        u.user_id || "",
        u.name || "",
        u.mac_address || "",
        u.pon_number || "",
        u.status || "",
        last ? last.downEvent : "",
        u.last_ts || ""
      ];
    });
  }

  const csvContent = [headers.join(","), ...lines.map(arr =>
    arr.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
  )].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = (mode === "power" ? "power-history" : "event-history") + ".csv";
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV downloaded");
};

// ---------------- Main load ----------------
async function loadAll() {
  showSpinner();
  try {
    if (currentWindow === "ALL") {
      const [pM, pS, eM, eS] = await Promise.all([
        fetchWindowPower("MEROTRA"),
        fetchWindowPower("SUNNY"),
        fetchWindowEvent("MEROTRA"),
        fetchWindowEvent("SUNNY")
      ]);
      powerRows = [...pM, ...pS];
      eventRows = [...eM, ...eS];
    } else {
      powerRows = await fetchWindowPower(currentWindow);
      eventRows = await fetchWindowEvent(currentWindow);
    }

    powerUsers = groupPowerUsers(powerRows);
    eventUsers = groupEventUsers(eventRows);

    applyFilters();
    showToast("Loaded");
  } catch {
    showToast("Load failed");
  } finally {
    hideSpinner();
  }
}

// init
loadAll();
