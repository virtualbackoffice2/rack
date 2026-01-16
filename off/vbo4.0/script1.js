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

let isComplainsView = false; // track complains mode

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
    return (data.rows || []).map(row => ({ ...row, _window: windowName, _runtime_timestamp: data.runtime_timestamp || "" }));
  } catch (err) {
    showToast(`Failed to load ${windowName}`);
    return [];
  }
}

// fetch Open complaint users from heroesocr_latest
async function fetchOpenComplaintUsers(windowName) {
  const url = `${baseUrl}/${windowName}/heroesocr_latest?limit=5000`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // only Open
    const openRows = (data.rows || []).filter(r => String(r.status || "").toLowerCase() === "open");
    return openRows.map(r => ({ ...r, _window: windowName }));
  } catch (err) {
    showToast(`Failed to load Open Complains ${windowName}`);
    return [];
  }
}

// helper: update heading count + timestamp
function setHeadingCountAndTimestamp(count, runtimeTs) {
  if (runtimeTs) {
    userCount.textContent = `(${count}) ${runtimeTs}`;
  } else {
    userCount.textContent = `(${count})`;
  }
}

/* Helpers for complains sorting */
function safeParseDate(s) {
  const d = new Date(s || "");
  return isNaN(d.getTime()) ? new Date(0) : d;
}

function pageOrder(pageId) {
  const p = String(pageId || "").toLowerCase();
  if (p === "repairs") return 1;
  if (p === "installations") return 2;
  if (p === "collections") return 3;
  return 99;
}

function groupTitle(pageId) {
  if (!pageId) return "Others";
  return pageId;
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

  // ✅ Hide "All Team" dropdown from UI
  if (filterTeam) {
    filterTeam.style.display = "none";
  }

  const modes = [...new Set(rawRows.map(r => r.Mode || "").filter(Boolean))].sort();
  filterMode.innerHTML = '<option value="">All Mode</option>' + modes.map(m => `<option value="${m}">${m}</option>`).join('');

  const statuses = [...new Set(rawRows.map(r => r["User status"] || "").filter(Boolean))].sort();
  let html = '<option value="">All Status</option>';
  statuses.forEach(s => html += `<option value="${s}">${s}</option>`);
  filterStatus.innerHTML = html;
}

function applyAllFilters() {
  let data = [...rawRows];

  const term = globalSearch.value.trim().toLowerCase();
  if (term) data = data.filter(r => Object.values(r).some(v => String(v || '').toLowerCase().includes(term)));

  const minP = parseFloat(powerMin.value);
  const maxP = parseFloat(powerMax.value);
  if (!isNaN(minP)) data = data.filter(r => r.Power != null && Number(r.Power) >= minP);
  if (!isNaN(maxP)) data = data.filter(r => r.Power != null && Number(r.Power) <= maxP);

  if (filterPon.value) data = data.filter(r => r.PON === filterPon.value);
  // team filter removed (dropdown hidden)
  if (filterMode.value) data = data.filter(r => r.Mode === filterMode.value);
  if (filterStatus.value) data = data.filter(r => r["User status"] === filterStatus.value);

  filtered = data;

  const runtimeTs = (filtered[0] && filtered[0]._runtime_timestamp) ? filtered[0]._runtime_timestamp : "";
  setHeadingCountAndTimestamp(filtered.length, runtimeTs);

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

/* POPUP (Modal) Support */
const complaintModal = document.getElementById("complaintModal");
const modalBody = document.getElementById("modalBody");
const modalTitle = document.getElementById("modalTitle");
const modalCloseBtn = document.getElementById("modalCloseBtn");

if (modalCloseBtn) {
  modalCloseBtn.onclick = () => complaintModal.style.display = "none";
}
if (complaintModal) {
  complaintModal.onclick = (e) => {
    if (e.target === complaintModal) complaintModal.style.display = "none";
  };
}

async function openComplaintPopup(windowName, userId, userName) {
  try {
    showSpinner();

    const url = `${baseUrl}/${windowName}/heroesocr_user_complaints/${encodeURIComponent(userId)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed");
    const data = await res.json();
    const rows = data.rows || [];

    if (modalTitle) modalTitle.textContent = `${userName || "User"} (${userId}) - Complaints`;

    let html = "";
    if (!rows.length) {
      html = `<div class="modalRow">No complaint history found.</div>`;
    } else {
      const latest = rows[0];

      html += `
        <div class="modalEntry">
          <div class="modalRow"><b>Status:</b> ${latest.status || ""}</div>
          <div class="modalRow"><b>Page:</b> ${latest.page_id || ""}</div>
          <div class="modalRow"><b>Reason:</b> ${latest.reason || ""}</div>
          <div class="modalRow"><b>Created:</b> ${latest.created_at || ""}</div>
          <div class="modalRow"><b>Team:</b> ${latest.Team || ""}</div>
          <div class="modalRow"><b>Mode:</b> ${latest.Mode || ""}</div>
          <div class="modalRow"><b>Power:</b> ${latest.Power ?? ""}</div>
          <div class="modalRow"><b>Phone:</b> ${latest.Phone || ""}</div>
          <div class="modalRow"><b>PON:</b> ${latest.pon || ""}</div>
          <div class="modalRow"><b>Drops:</b> ${latest.drops || ""}</div>
          <div class="modalRow"><b>Down Time:</b> ${latest.down_time || ""}</div>
          <div class="modalRow"><b>Down List:</b> ${latest.down_list || ""}</div>
          <div class="modalRow"><b>StatusUpDown:</b> ${latest.statusUpDown || ""}</div>
        </div>
      `;

      html += `<div style="font-weight:800;margin-top:10px;">History</div>`;

      rows.forEach((r, idx) => {
        html += `
          <div class="modalEntry">
            <div class="modalRow"><b>#</b> ${idx + 1}</div>
            <div class="modalRow"><b>Status:</b> ${r.status || ""}</div>
            <div class="modalRow"><b>Page:</b> ${r.page_id || ""}</div>
            <div class="modalRow"><b>Reason:</b> ${r.reason || ""}</div>
            <div class="modalRow"><b>Created:</b> ${r.created_at || ""}</div>
            <div class="modalRow"><b>Team:</b> ${r.Team || ""}</div>
            <div class="modalRow"><b>Mode:</b> ${r.Mode || ""}</div>
          </div>
        `;
      });
    }

    if (modalBody) modalBody.innerHTML = html;
    if (complaintModal) complaintModal.style.display = "flex";

  } catch (e) {
    showToast("Popup load failed");
  } finally {
    hideSpinner();
  }
}

/* CARDS RENDER (with sections) */
function renderCards() {
  cardContainer.innerHTML = "";
  tableWrap.style.display = "none";

  if (!filtered.length) {
    cardContainer.style.display = "grid";
    cardContainer.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);">No users found</div>';
    return;
  }

  const hasSections = filtered.some(r => r._page_id);

  if (!hasSections) {
    cardContainer.style.display = "grid";
    filtered.forEach((r, index) => renderSingleCard(r, index, cardContainer));
    return;
  }

  cardContainer.style.display = "block";

  const groups = {};
  filtered.forEach(r => {
    const key = r._page_id || "Others";
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });

  const groupKeys = Object.keys(groups).sort((a, b) => pageOrder(a) - pageOrder(b));

  groupKeys.forEach(gk => {
    groups[gk].sort((a, b) => safeParseDate(b._created_at) - safeParseDate(a._created_at));

    const section = document.createElement("div");
    section.className = "sectionWrap";

    const head = document.createElement("div");
    head.className = "sectionHead";
    head.innerHTML = `${groupTitle(gk)} <span class="secCount">(${groups[gk].length})</span>`;
    section.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "sectionGrid";
    section.appendChild(grid);

    groups[gk].forEach((r, idx) => renderSingleCard(r, idx, grid));
    cardContainer.appendChild(section);
  });
}

function renderSingleCard(r, index, container) {
  const card = document.createElement("div");
  card.className = "complaint-card";

  // color/blink ONLY based on ACTUAL status (emoji logic)
  if (r["User status"] === "DOWN") {
    // 📵
    card.classList.add("card-complain"); // red
 } else if (r["User status"] === "UP") {
  // 📶
  if (r._complain_open) {
    card.classList.add("card-blink"); // complain + up => blink
  } else {
    card.classList.add("card-online"); // up only => green
  }
} else {
    // 💀
    card.classList.add("card-offline"); // pink
  }

  const statusEmoji = r["User status"] === "UP" ? '📶' : r["User status"] === "DOWN" ? '📵' : '💀';

  card.innerHTML = `
      <div class="card-header">
        ${r.Name || "Unknown"} <span>${statusEmoji}</span>
      </div>
      <div class="card-row"><span class="card-label">Window:</span><span class="card-value">${r._window || ""}</span></div>
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

  card.style.cursor = (isComplainsView && r._complain_open) ? "pointer" : "default";
  card.onclick = (e) => {
    if (e.target.closest("button") || e.target.closest("select") || e.target.closest("input")) return;
    if (!isComplainsView || !r._complain_open) return;
    openComplaintPopup(r._window, r.Users || "", r.Name || "");
  };

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      showToast("Marked ✅");
      fetchData();
    } catch {
      showToast("Mark failed");
    }
  };

  card.querySelector(".remove-btn").onclick = async () => {
    try {
      await fetch(`${baseUrl}/${r._window}/delete_complain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: r.Users || "" })
      });
      showToast("Deleted ✅");
      fetchData();
    } catch {
      showToast("Delete failed");
    }
  };

  container.appendChild(card);
  setTimeout(() => card.classList.add("visible"), index * 60);
}

/* TABLE RENDER (same sorting + status column + window column) */
function renderTable() {
  tbody.innerHTML = "";
  cardContainer.style.display = "none";
  tableWrap.style.display = "block";

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="15" style="text-align:center;padding:20px;color:var(--text-secondary);">No users found</td></tr>';
    return;
  }

  // ✅ enforce same sorting in table view as well
  const tableData = [...filtered];
  if (tableData.some(r => r._page_id)) {
    tableData.sort((a, b) => {
      const po = pageOrder(a._page_id) - pageOrder(b._page_id);
      if (po !== 0) return po;
      return safeParseDate(b._created_at) - safeParseDate(a._created_at);
    });
  }

  let lastGroup = "";

  tableData.forEach(r => {
    if (r._page_id) {
      const grp = r._page_id || "";
      if (grp !== lastGroup) {
        const sep = document.createElement("tr");
        sep.innerHTML = `<td colspan="15" style="font-weight:800;padding:10px;background:#f5f5f5;">${grp}</td>`;
        tbody.appendChild(sep);
        lastGroup = grp;
      }
    }

    const tr = document.createElement("tr");

    // same color codes as cards based on actual status
    const statusEmoji = r["User status"] === "UP" ? '📶' : r["User status"] === "DOWN" ? '📵' : '💀';

    if (r["User status"] === "DOWN") {
      tr.classList.add("ticket"); // red (css)
} else if (r["User status"] === "UP") {
  if (r._complain_open) {
    tr.classList.add("tr-blink"); // complain + up => blink
  } else {
    tr.classList.add("onlineRow"); // up only => green
  }
} else {
      tr.classList.add("offline"); // pink
    }

    tr.innerHTML = `
      <td>${r._window || ""}</td>
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
      <td>${statusEmoji}</td>
    `;

    tr.style.cursor = (isComplainsView && r._complain_open) ? "pointer" : "default";
    tr.onclick = (e) => {
      if (e.target.closest("button") || e.target.closest("select") || e.target.closest("input")) return;
      if (!isComplainsView || !r._complain_open) return;
      openComplaintPopup(r._window, r.Users || "", r.Name || "");
    };

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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        showToast("Marked ✅");
        fetchData();
      } catch {
        showToast("Mark failed");
      }
    };

    tr.querySelector(".remove-btn").onclick = async () => {
      try {
        await fetch(`${baseUrl}/${r._window}/delete_complain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: r.Users || "" })
        });
        showToast("Deleted ✅");
        fetchData();
      } catch {
        showToast("Delete failed");
      }
    };

    tbody.appendChild(tr);
  });
}

/* Menu toggle */
menuToggle.onclick = () => {
  topMenu.classList.toggle("show");
};

document.addEventListener("click", (e) => {
  if (!topMenu.contains(e.target) && !menuToggle.contains(e.target)) {
    topMenu.classList.remove("show");
  }
});

/* Toggle view */
btnToggleView.onclick = () => {
  currentView = currentView === "cards" ? "table" : "cards";
  btnToggleView.textContent = currentView === "cards" ? "Switch to Table" : "Switch to Cards";
  applyAllFilters();
};

/* Screenshot (RULE: if >100 users, skip) */
document.getElementById("btnScreenshot").onclick = () => {
  if (filtered.length > 100) {
    showToast("Too many users for screenshot!");
    return;
  }

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

/* CSV */
document.getElementById("btnCsv").onclick = () => {
  if (!filtered.length) {
    showToast("No data to export");
    return;
  }
  const headers = ["Window", "PON", "User ID", "Mobile", "Name", "Mac / Serial", "Down", "Remark", "Team", "Mode", "Power", "Location", "Status"];
  const csvContent = [headers.join(","), ...filtered.map(r => [
    r._window || "",
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

/* Events */
document.getElementById("windowSelect").onchange = (e) => {
  currentWindow = e.target.value;
  isComplainsView = false;
  fetchData();
};

document.getElementById("btnComplains").onclick = async () => {
  showSpinner();
  try {
    isComplainsView = true;

    let openComplaints = [];
    if (currentWindow === "ALL") {
      const [m, s] = await Promise.all([
        fetchOpenComplaintUsers("MEROTRA"),
        fetchOpenComplaintUsers("SUNNY"),
      ]);
      openComplaints = [...m, ...s];
    } else {
      openComplaints = await fetchOpenComplaintUsers(currentWindow);
    }

    await fetchData();

    const openMap = {};
    openComplaints.forEach(c => {
      const id = String(c.user_id || "").trim().toLowerCase();
      if (id) openMap[id] = c;
    });

    rawRows = rawRows
      .filter(r => openMap[String(r.Users || "").trim().toLowerCase()])
      .map(r => {
        const c = openMap[String(r.Users || "").trim().toLowerCase()];
        return {
          ...r,
          _complain_open: true,
          _page_id: c.page_id || "Others",
          _created_at: c.created_at || ""
        };
      });

    rawRows.sort((a, b) => {
      const po = pageOrder(a._page_id) - pageOrder(b._page_id);
      if (po !== 0) return po;
      return safeParseDate(b._created_at) - safeParseDate(a._created_at);
    });

    showToast(rawRows.length ? `${rawRows.length} open complains users loaded` : "No open complains found");
    populateFilters();
    applyAllFilters();

  } catch (e) {
    showToast("Failed to load complains");
  } finally {
    hideSpinner();
  }
};

document.getElementById("btnDrops").onclick = () => { currentMode = "drops"; applyAllFilters(); };

document.getElementById("btnRefresh").onclick = () => {
  isComplainsView = false;
  fetchData();
};

globalSearch.oninput = applyAllFilters;
powerMin.oninput = applyAllFilters;
powerMax.oninput = applyAllFilters;
filterPon.onchange = applyAllFilters;
// filterTeam removed
filterMode.onchange = applyAllFilters;
filterStatus.onchange = applyAllFilters;

fetchData();
