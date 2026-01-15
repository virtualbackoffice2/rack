const baseUrl = "https://app.vbo.co.in";
let currentWindow = "ALL";
let rawRows = [];
let filtered = [];
let currentMode = "all";
let currentView = "cards"; // Default to cards
const cardContainer = document.getElementById("cardView");
const tbody = document.querySelector("#dataTable tbody");
const tableWrap = document.getElementById("tableWrap");
const spinner = document.getElementById("spinnerOverlay");
const toastEl = document.getElementById("toast");
const globalSearch = document.getElementById("globalSearch");
const powerMin = document.getElementById("powerMin");
const powerMax = document.getElementById("powerMax");
const filterPon = document.getElementById("filterPon");
const filterTeam = document.getElementById("filterTeam");
const filterMode = document.getElementById("filterMode");
const filterStatus = document.getElementById("filterStatus");
const menuToggle = document.getElementById("menuToggle");
const topMenu = document.getElementById("topMenu");
const userCount = document.getElementById("userCount");
const btnToggleView = document.getElementById("btnToggleView");

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 3000);
}

function showSpinner() { spinner.style.display = "flex"; }
function hideSpinner() { spinner.style.display = "none"; }

async function fetchWindowData(windowName) {
  const url = `${baseUrl}/${windowName}/complains`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.rows || []).map(row => ({ ...row, _window: windowName }));
  } catch (err) {
    showToast(`Failed to load ${windowName}`);
    return [];
  }
}

async function fetchData() {
  showSpinner();
  try {
    if (currentWindow === "ALL") {
      const [merotraData, sunnyData] = await Promise.all([
        fetchWindowData("MEROTRA"),
        fetchWindowData("SUNNY")
      ]);
      rawRows = [...merotraData, ...sunnyData];
    } else {
      rawRows = await fetchWindowData(currentWindow);
    }
    showToast(rawRows.length ? `${rawRows.length} users loaded` : "No users found");
    populateFilters();
    applyAllFilters();
  } catch (err) {
    showToast("Load failed");
  } finally {
    hideSpinner();
  }
}

function populateFilters() {
  const pons = [...new Set(rawRows.map(r => r.PON || "").filter(Boolean))].sort();
  filterPon.innerHTML = '<option value="">All PON</option>' + pons.map(p => `<option value="${p}">${p}</option>`).join('');

  const teams = [...new Set(rawRows.map(r => r.Team || "").filter(Boolean))];
  filterTeam.innerHTML = `
    <option value="">All Team</option>
    <option value="Sushil">Sushil</option>
    <option value="Shaan">Shaan</option>
  ` + teams.map(t => `<option value="${t}">${t}</option>`).join('');

  const modes = [...new Set(rawRows.map(r => r.Mode || "").filter(Boolean))].sort();
  filterMode.innerHTML = '<option value="">All Mode</option>' + modes.map(m => `<option value="${m}">${m}</option>`).join('');

  const statuses = [...new Set(rawRows.map(r => r["User status"] || "").filter(Boolean))].sort();
  let html = '<option value="">All Status</option>';
  statuses.forEach(s => html += `<option value="${s}">${s}</option>`);
  filterStatus.innerHTML = html;
}

function applyAllFilters() {
  let data = [...rawRows];
  if (currentMode === "complains") data = data.filter(r => r.Ticket?.trim());
  if (currentMode === "drops") data = data.filter(r => r.Drops?.trim());

  const term = globalSearch.value.trim().toLowerCase();
  if (term) data = data.filter(r => Object.values(r).some(v => String(v||'').toLowerCase().includes(term)));

  const minP = parseFloat(powerMin.value);
  const maxP = parseFloat(powerMax.value);
  if (!isNaN(minP)) data = data.filter(r => r.Power != null && Number(r.Power) >= minP);
  if (!isNaN(maxP)) data = data.filter(r => r.Power != null && Number(r.Power) <= maxP);

  if (filterPon.value) data = data.filter(r => r.PON === filterPon.value);
  if (filterTeam.value) data = data.filter(r => (r.Team || getDefaultTeam(r._window)) === filterTeam.value);
  if (filterMode.value) data = data.filter(r => r.Mode === filterMode.value);
  if (filterStatus.value) data = data.filter(r => r["User status"] === filterStatus.value);

  if (currentMode === "drops") {
    data.sort((a,b) => (new Date(b.Drops||0) - new Date(a.Drops||0)));
  }

  filtered = data;
  userCount.textContent = `(${filtered.length})`;
  if (currentView === "cards") {
    renderCards();
  } else {
    renderTable();
  }
}

function getDefaultTeam(windowName) {
  if (windowName === "MEROTRA") return "Sushil";
  if (windowName === "SUNNY") return "Shaan";
  return "";
}

function renderCards() {
  cardContainer.innerHTML = "";
  tableWrap.style.display = "none";
  cardContainer.style.display = "grid";
  if (!filtered.length) {
    cardContainer.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);">No users found</div>';
    return;
  }

  filtered.forEach((r, index) => {
    const card = document.createElement("div");
    card.className = "complaint-card";
    if (r["User status"] === "DOWN") card.style.background = "#fff2f0";
    if (r.Ticket) card.style.background = "#fffbe6";

    const statusEmoji = r["User status"] === "UP" ? '📶' : r["User status"] === "DOWN" ? '📵' : '💀';

    card.innerHTML = `
      <div class="card-header">
        ${r.Name || "Unknown"} <span>${statusEmoji}</span>
      </div>
      <div class="card-row"><span class="card-label">User ID:</span><span class="card-value">${r.Users || ""}</span></div>
      <div class="card-row"><span class="card-label">Mobile:</span><span class="card-value">${r["Last called no"] || ""}</span></div>
      <div class="card-row"><span class="card-label">PON:</span><span class="card-value">${r.PON || ""}</span></div>
      <div class="card-row"><span class="card-label">Location:</span><span class="card-value">${r.Location || ""}</span></div>
      <div class="card-row"><span class="card-label">Power:</span><span class="card-value">${r.Power?.toFixed(2) || ""}</span></div>
      <div class="card-row"><span class="card-label">Down:</span><span class="card-value">${r.Drops || ""}</span></div>
      <div class="card-row"><span class="card-label">MAC / Serial:</span><span class="card-value">${r.MAC || ""} / ${r.Serial || ""}</span></div>
      <div class="card-row"><span class="card-label">Remark:</span><input class="remarkInput" value="${r.Remarks || ""}"></div>
      <div class="card-row">
        <span class="card-label">Team:</span>
        <select class="teamSel">
          <option>Sushil</option><option>Shaan</option>
        </select>
      </div>
      <div class="card-row">
        <span class="card-label">Mode:</span>
        <select class="modeSel">
          <option>Manual</option><option>Auto</option>
        </select>
      </div>
      <div style="margin-top:10px;display:flex;justify-content:flex-end;gap:10px;">
        <button class="mark-btn"><i class="fas fa-check"></i></button>
        <button class="remove-btn"><i class="fas fa-trash"></i></button>
      </div>
    `;

    const teamSel = card.querySelector(".teamSel");
    teamSel.value = r.Team || getDefaultTeam(r._window);
    const modeSel = card.querySelector(".modeSel");
    modeSel.value = r.Mode || "Manual";

    card.querySelector(".mark-btn").onclick = async () => {
      const payload = {
        user_id: r.Users || "",
        name: r.Name || "",
        address: r.Location || "",
        reason: card.querySelector(".remarkInput").value || "",
        Mode: modeSel.value,
        Power: r.Power,
        Phone: r["Last called no"] || "",
        Team: teamSel.value,
        pon: r.PON || "",
        window: r._window
      };
      try {
        await fetch(`${baseUrl}/${r._window}/mark_complain`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify(payload)
        });
        showToast("Marked ?");
        fetchData();
      } catch {
        showToast("Mark failed");
      }
    };

    card.querySelector(".remove-btn").onclick = async () => {
      try {
        await fetch(`${baseUrl}/${r._window}/delete_complain`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ user_id: r.Users || "" })
        });
        showToast("Deleted ??");
        fetchData();
      } catch {
        showToast("Delete failed");
      }
    };

    cardContainer.appendChild(card);
    setTimeout(() => card.classList.add("visible"), index * 100);
  });
}

function renderTable() {
  tbody.innerHTML = "";
  cardContainer.style.display = "none";
  tableWrap.style.display = "block";
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:20px;color:var(--text-secondary);">No users found</td></tr>';
    return;
  }
  filtered.forEach(r => {
    const tr = document.createElement("tr");
    if (r["User status"] === "DOWN") tr.classList.add("offline");
    if (r.Ticket) tr.classList.add("ticket");

    const statusHtml = r["User status"] === "UP" ? '<span class="status-indicator status-up"></span>' :
                      r["User status"] === "DOWN" ? '<span class="status-indicator status-down"></span>' : '';

    tr.innerHTML = `
      <td>${r.PON || ""}</td>
      <td>${r.Users || ""}</td>
      <td>${r["Last called no"] || ""}</td>
      <td>${r.Name || ""}</td>
      <td>${r.MAC || ""}<br><small>${r.Serial || ""}</small></td>
      <td>${r.Drops || ""}</td>
      <td><input class="remarkInput" value="${r.Remarks || ""}"></td>
      <td>
        <select class="teamSel">
          <option>Sushil</option>
          <option>Shaan</option>
        </select>
      </td>
      <td>
        <select class="modeSel">
          <option>Manual</option>
          <option>Auto</option>
        </select>
      </td>
      <td>${r.Power != null ? Number(r.Power).toFixed(2) : ""}</td>
      <td>
        <button class="mark-btn"><i class="fas fa-check"></i></button>
        <button class="remove-btn"><i class="fas fa-trash"></i></button>
      </td>
      <td>${r.Location || ""}</td>
      <td>${statusHtml}</td>
    `;

    const teamSelect = tr.querySelector(".teamSel");
    teamSelect.value = r.Team || getDefaultTeam(r._window);
    const modeSelect = tr.querySelector(".modeSel");
    modeSelect.value = r.Mode || "Manual";
    tr.querySelector(".mark-btn").onclick = async () => {
      const payload = {
        user_id: r.Users || "",
        name: r.Name || "",
        address: r.Location || "",
        reason: tr.querySelector(".remarkInput").value || "",
        Mode: modeSelect.value,
        Power: r.Power,
        Phone: r["Last called no"] || "",
        Team: teamSelect.value,
        pon: r.PON || "",
        window: r._window
      };
      try {
        await fetch(`${baseUrl}/${r._window}/mark_complain`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify(payload)
        });
        showToast("Marked ?");
        fetchData();
      } catch {
        showToast("Mark failed");
      }
    };
    tr.querySelector(".remove-btn").onclick = async () => {
      try {
        await fetch(`${baseUrl}/${r._window}/delete_complain`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({ user_id: r.Users || "" })
        });
        showToast("Deleted ??");
        fetchData();
      } catch {
        showToast("Delete failed");
      }
    };
    tbody.appendChild(tr);
  });
}

// Hamburger menu toggle
menuToggle.onclick = () => {
  topMenu.classList.toggle("show");
};

// Close menu on outside click
document.addEventListener("click", (e) => {
  if (!topMenu.contains(e.target) && !menuToggle.contains(e.target)) {
    topMenu.classList.remove("show");
  }
});

// Toggle view
btnToggleView.onclick = () => {
  currentView = currentView === "cards" ? "table" : "cards";
  btnToggleView.textContent = currentView === "cards" ? "Switch to Table" : "Switch to Cards";
  applyAllFilters();
};

// Screenshot
document.getElementById("btnScreenshot").onclick = () => {
  html2canvas(document.getElementById("contentWrap"), {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff"
  }).then(canvas => {
    const link = document.createElement("a");
    link.download = "complain-manager-screenshot.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    showToast("Screenshot downloaded");
  }).catch(() => showToast("Screenshot failed"));
};

// CSV
document.getElementById("btnCsv").onclick = () => {
  if (!filtered.length) {
    showToast("No data to export");
    return;
  }
  const headers = ["PON", "User ID", "Mobile", "Name", "Mac / Serial", "Down", "Remark", "Team", "Mode", "Power", "Location", "Status"];
  const csvContent = [headers.join(","), ...filtered.map(r => [
    r.PON || "",
    r.Users || "",
    r["Last called no"] || "",
    r.Name || "",
    `${r.MAC || ""} / ${r.Serial || ""}`,
    r.Drops || "",
    r.Remarks || "",
    r.Team || getDefaultTeam(r._window),
    r.Mode || "Manual",
    r.Power?.toFixed(2) || "",
    r.Location || "",
    r["User status"] || ""
  ].map(v => `"${v}"`).join(","))].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = "complain-manager.csv";
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV downloaded");
};

// Events
document.getElementById("windowSelect").onchange = (e) => {
  currentWindow = e.target.value;
  fetchData();
};
document.getElementById("btnComplains").onclick = () => { currentMode = "complains"; applyAllFilters(); };
document.getElementById("btnDrops").onclick = () => { currentMode = "drops"; applyAllFilters(); };
document.getElementById("btnRefresh").onclick = fetchData;
globalSearch.oninput = applyAllFilters;
powerMin.oninput = applyAllFilters;
powerMax.oninput = applyAllFilters;
filterPon.onchange = applyAllFilters;
filterTeam.onchange = applyAllFilters;
filterMode.onchange = applyAllFilters;
filterStatus.onchange = applyAllFilters;

fetchData();
