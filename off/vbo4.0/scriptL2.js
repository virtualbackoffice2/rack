const baseUrl = "https://app.vbo.co.in";
let currentWindow = "ALL";
let rawRows = [];
let filtered = [];
let currentMode = "all";
let currentView = "cards"; // Default to cards
// ===============================
// ✅ EMPLOYEE VIEW additions
// ===============================
// let isComplainsView = false; // duplicate removed
let currentListingRows = []; // currently displayed list in employee view

// Default list = DOWN users + OFFLINE users + Power out of safe range (< -27 OR > -12)
function isDefaultListUser(r) {
  const status = String(r["User status"] || "").toUpperCase();
  const power = r.Power != null ? Number(r.Power) : null;

  if (status === "DOWN") return true;
  if (status !== "UP" && status !== "DOWN") return true; // OFFLINE/other
  if (power != null && !isNaN(power)) {
    if (power < -27 || power > -12) return true;
  }
  return false;
}

function buildDefaultList(allRows) {
  return (allRows || []).filter(isDefaultListUser);
}

// Build Offline / Power issue / All users lists from FULL data (rawRows)
function buildOfflineList() {
  return (rawRows || []).filter(r =>
    String(r["User status"] || "").toUpperCase() === "DOWN"
  );
}


function buildPowerIssueList() {
  return (rawRows || []).filter(r => {
    const p = r.Power != null ? Number(r.Power) : null;
    if (p == null || isNaN(p)) return false;
    return (p < -28 || p > -12);
  });
}

function mergeUniqueByUserId(lists) {
  const map = new Map();
  (lists || []).flat().forEach(r => {
    const key = String(r.Users || "").trim().toLowerCase();
    if (!key) return;
    if (!map.has(key)) map.set(key, r);
  });
  return Array.from(map.values());
}

async function loadSelectedListing() {
  const v = (listSelect?.value || "complain").toLowerCase();

  if (v === "complain") {
    await loadComplainsListing();
    populatePonSelectFromCurrent();
  } else if (v === "offline") {
    isComplainsView = false;
    currentListingRows = buildOfflineList();
    populatePonSelectFromCurrent();
  } else if (v === "power") {
    isComplainsView = false;
    currentListingRows = buildPowerIssueList();
    populatePonSelectFromCurrent();
  } else if (v === "all") {
    // all = complain + offline + power issue (unique users)
    const offline = buildOfflineList();
    const power = buildPowerIssueList();
    // ensure complains list loaded (needs API)
    await loadComplainsListing();
    const complain = currentListingRows;
    isComplainsView = false; // All is general list
    currentListingRows = mergeUniqueByUserId([complain, offline, power]);
    populatePonSelectFromCurrent();
  } else {
    await loadComplainsListing();
  }
}

function populatePonSelectFromCurrent() {
  if (!ponSelect) return;
  const pons = [...new Set((currentListingRows||[]).map(r => r.PON).filter(Boolean))].sort();
  ponSelect.innerHTML = '<option value="">All PON</option>' + pons.map(p=>`<option value="${p}">${p}</option>`).join('');
}

function populateStatusFilterFromDefaultList() {}

const cardContainer = document.getElementById("cardView");
const tbody = document.querySelector("#dataTable tbody");
const tableWrap = document.getElementById("tableWrap");
const spinner = document.getElementById("spinnerOverlay");
const toastEl = document.getElementById("toast");

const globalSearch = document.getElementById("globalSearch");
// const powerRange = document.getElementById("powerRange"); // employee: disabled

const filterPon = document.getElementById("filterPon"); // (kept for safety - not used)
const filterTeam = document.getElementById("filterTeam");
const filterMode = document.getElementById("filterMode");
const listSelect = document.getElementById("listSelect");
const ponSelect = document.getElementById("ponSelect");

const menuToggle = document.getElementById("menuToggle");
const topMenu = document.getElementById("topMenu");
const userCount = document.getElementById("userCount");
const btnToggleView = document.getElementById("btnToggleView");

let isComplainsView = false; // track complains mode

/* ===============================
   ✅ PON Excel-style multi select
================================= */
const ponMultiWrap = document.getElementById("ponMultiWrap");
if (ponMultiWrap) ponMultiWrap.style.display = "none"; // employee: disable PON filter
const ponMultiBtn = document.getElementById("ponMultiBtn");
const ponMultiDropdown = document.getElementById("ponMultiDropdown");
const ponMultiList = document.getElementById("ponMultiList");
const ponMultiSearchInput = document.getElementById("ponMultiSearchInput");
const ponClearBtn = document.getElementById("ponClearBtn");
const ponOkBtn = document.getElementById("ponOkBtn");
let selectedPonsSet = new Set();

/* ===============================
   ✅ Modal (Popup)
================================= */
const complaintModal = document.getElementById("complaintModal");
const modalBody = document.getElementById("modalBody");
const modalTitle = document.getElementById("modalTitle");
const modalCloseBtn = document.getElementById("modalCloseBtn");

/* ===============================
   ✅ Toast + Spinner
================================= */
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 3000);
}
function showSpinner() { spinner.style.display = "flex"; }
function hideSpinner() { spinner.style.display = "none"; }

/* ✅ Smooth fadeout removal */
function fadeOutAndRemove(el) {
  if (!el) return;
  el.classList.add("fade-remove");
  setTimeout(() => {
    el.remove();

    // update counter without reloading
    const cardCount = document.querySelectorAll(".complaint-card").length;
    const rowCount = document.querySelectorAll("#dataTable tbody tr").length;
    const count = currentView === "cards" ? cardCount : rowCount;

    const txt = userCount.textContent || "";
    const ts = txt.includes(")") ? txt.split(")").slice(1).join(")").trim() : "";
    userCount.textContent = ts ? `(${count}) ${ts}` : `(${count})`;
  }, 450);
}

/* ===============================
   ✅ API Fetchers
================================= */
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

/**
 * ✅ FRONTEND FIX:
 * heroesocr_latest returns recent records, not per-user latest.
 * So JS makes per-user latest record and keeps only latest Open.
 */
async function fetchOpenComplaintUsers(windowName) {
  const url = `${baseUrl}/${windowName}/heroesocr_latest?limit=5000`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rows = data.rows || [];

    const latestMap = {};
    rows.forEach(r => {
      const uid = String(r.user_id || "").trim().toLowerCase();
      if (!uid) return;

      const currTs = new Date(r.created_at || 0).getTime();
      const prev = latestMap[uid];
      const prevTs = prev ? new Date(prev.created_at || 0).getTime() : -1;

      if (!prev || currTs >= prevTs) {
        latestMap[uid] = r;
      }
    });

    const openRows = Object.values(latestMap).filter(r =>
      String(r.status || "").toLowerCase() === "open"
    );

    return openRows.map(r => ({ ...r, _window: windowName }));

  } catch (err) {
    showToast(`Failed to load Open Complains ${windowName}`);
    return [];
  }
}

/* ===============================
   ✅ Helpers
================================= */
function setHeadingCountAndTimestamp(count, runtimeTs) {
  if (runtimeTs) userCount.textContent = `(${count}) ${runtimeTs}`;
  else userCount.textContent = `(${count})`;
}

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

function getDefaultTeam(windowName) {
  if (windowName === "MEROTRA") return "Sushil";
  if (windowName === "SUNNY") return "Shaan";
  return "";
}

/* ===============================
   ✅ PON Dropdown logic
================================= */
function updatePonButtonText() {
  const cnt = selectedPonsSet.size;
  if (!ponMultiBtn) return;
  if (cnt === 0) ponMultiBtn.textContent = "All PON";
  else ponMultiBtn.textContent = `PON (${cnt} selected)`;
}

if (ponMultiBtn && ponMultiDropdown) {
  ponMultiBtn.onclick = () => {
    ponMultiDropdown.classList.toggle("show");
    if (ponMultiSearchInput) ponMultiSearchInput.value = "";
  };

  document.addEventListener("click", (e) => {
    if (ponMultiWrap && !ponMultiWrap.contains(e.target)) {
      ponMultiDropdown.classList.remove("show");
    }
  });
}

if (ponMultiList) {
  ponMultiList.onclick = (e) => {
    const item = e.target.closest(".ponItem");
    if (!item) return;

    const pon = item.getAttribute("data-pon");
    const cb = item.querySelector("input[type='checkbox']");
    cb.checked = !cb.checked;

    if (cb.checked) selectedPonsSet.add(pon);
    else selectedPonsSet.delete(pon);

    updatePonButtonText();
  };
}

if (ponMultiSearchInput) {
  ponMultiSearchInput.oninput = () => {
    const q = ponMultiSearchInput.value.trim().toLowerCase();
    const items = ponMultiList.querySelectorAll(".ponItem");
    items.forEach(it => {
      const p = (it.getAttribute("data-pon") || "").toLowerCase();
      it.style.display = p.includes(q) ? "flex" : "none";
    });
  };
}

if (ponClearBtn) {
  ponClearBtn.onclick = () => {
    selectedPonsSet.clear();
    if (ponMultiList) {
      ponMultiList.querySelectorAll("input[type='checkbox']").forEach(cb => cb.checked = false);
    }
    updatePonButtonText();
    applyAllFilters();
  };
}

if (ponOkBtn) {
  ponOkBtn.onclick = () => {
    ponMultiDropdown.classList.remove("show");
    applyAllFilters();
  };
}

/* ===============================
   ✅ Modal events
================================= */
if (modalCloseBtn && complaintModal) {
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

async function loadComplainsListing() {
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

  const openMap = {};
  openComplaints.forEach(c => {
    const id = String(c.user_id || "").trim().toLowerCase();
    if (id) openMap[id] = c;
  });

  const complaintRows = rawRows
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

  complaintRows.sort((a, b) => {
    const po = pageOrder(a._page_id) - pageOrder(b._page_id);
    if (po !== 0) return po;
    return safeParseDate(b._created_at) - safeParseDate(a._created_at);
  });

  currentListingRows = complaintRows;
}

/* ===============================
   ✅ Main Load
================================= */
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

    showToast("Loading...");
    // Default on load: Complain view
    if (listSelect) listSelect.value = "complain";
    await loadSelectedListing();
    applyAllFilters();
    showToast(`${filtered.length} users loaded`);
  } catch (err) {
    console.error("Load failed", err);
    showToast("Load failed: " + (err?.message || err));
  } finally {
    hideSpinner();
  }
}

/* function populateFilters() {
   // employee: disabled filters
}
*/

function applyAllFilters() {
  let data = [];

  // Employee rule:
  // - Search only in User ID + Mobile
  // - Start searching only after min 7 characters
  const termRaw = (globalSearch?.value || "").trim();
  const term = termRaw.toLowerCase();
  const isSearchActive = termRaw.length >= 7;

  if (isSearchActive) {
    // Search in FULL dataset (rawRows), not only current listing
    data = [...rawRows];
    data = data.filter(r => {
      const uid = String(r.Users || "").toLowerCase();
      const mob = String(r["Last called no"] || "").toLowerCase();
      return uid.includes(term) || mob.includes(term);
    });
  } else {
    // No search: show current listing rows (complains view by default)
    data = [...currentListingRows];
  }

  // PON filter applies only to currently loaded listing (not full search)
  if (!isSearchActive && ponSelect?.value) {
    data = data.filter(r => String(r.PON || "") === String(ponSelect.value));
  }

  filtered = data;

  const runtimeTs = (filtered[0] && filtered[0]._runtime_timestamp) ? filtered[0]._runtime_timestamp : "";
  setHeadingCountAndTimestamp(filtered.length, runtimeTs);

  if (currentView === "cards") renderCards();
  else renderTable();
}

/* ===============================
   ✅ Cards Render
================================= */
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

  // ✅ status-based colors
  if (r["User status"] === "DOWN") {
    // 📵
    card.classList.add("card-complain"); // red
  } else if (r["User status"] === "UP") {
    // 📶
    if (r._complain_open) card.classList.add("card-blink"); // complain + up => blink
    else card.classList.add("card-online"); // only up => green
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
      <div class="card-row"><span class="card-label">Remark:</span><input class="remarkInput" value="${r.Remarks || ""}" disabled></div>
      <div class="card-row">
        <span class="card-label">Team:</span>
        <select class="teamSel" disabled>
          <option>Sushil</option><option>Shaan</option>
        </select>
      </div>
      <div class="card-row">
        <span class="card-label">Mode:</span>
        <select class="modeSel" disabled>
          <option>Manual</option><option>Auto</option>
        </select>
      </div>
      <div style="margin-top:10px;display:flex;justify-content:flex-end;gap:10px;">
      
      

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
  // employee: mark/remove disabled

  container.appendChild(card);
  setTimeout(() => card.classList.add("visible"), index * 60);
}

/* ===============================
   ✅ Table Render
================================= */
function renderTable() {
  tbody.innerHTML = "";
  cardContainer.style.display = "none";
  tableWrap.style.display = "block";

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="15" style="text-align:center;padding:20px;color:var(--text-secondary);">No users found</td></tr>';
    return;
  }

  const tableData = [...filtered];

  // same sorting in table for complains view
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
    const statusEmoji = r["User status"] === "UP" ? '📶' : r["User status"] === "DOWN" ? '📵' : '💀';

    // status based row colors
    if (r["User status"] === "DOWN") {
      tr.classList.add("ticket"); // red
    } else if (r["User status"] === "UP") {
      if (r._complain_open) tr.classList.add("tr-blink");
      else tr.classList.add("onlineRow");
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
      <td><input class="remarkInput remarkCol" value="${r.Remarks || ""}" disabled></td>
      <td class="teamCol resizableCol">
        <select class="teamSel" disabled>
          <option>Sushil</option>
          <option>Shaan</option>
        </select>
      </td>
      <td class="modeCol resizableCol">
        <select class="modeSel" disabled>
          <option>Manual</option>
          <option>Auto</option>
        </select>
      </td>
      <td>${r.Power != null ? Number(r.Power).toFixed(2) : ""}</td>
      <td>


        
      </td>
      <td>${r.Location || ""}</td>
      <td>${statusEmoji}</td>
    `;

    // popup on row click (only complains)
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
    // employee: mark/remove disabled

    tbody.appendChild(tr);
  });
}

/* ===============================
   ✅ UI events
================================= */
menuToggle.onclick = () => {
  topMenu.classList.toggle("show");
};

document.addEventListener("click", (e) => {
  if (!topMenu.contains(e.target) && !menuToggle.contains(e.target)) {
    topMenu.classList.remove("show");
  }
});

btnToggleView.onclick = () => {
  currentView = currentView === "cards" ? "table" : "cards";
  btnToggleView.textContent = currentView === "cards" ? "Switch to Table" : "Switch to Cards";
  applyAllFilters();
};

// screenshot and csv disabled for employee

// window select
document.getElementById("windowSelect").onchange = (e) => {
  currentWindow = e.target.value;
  isComplainsView = false;
  fetchData();
};

// refresh
document.getElementById("btnRefresh").onclick = () => {
  // Employee: refresh reloads data and keeps complains view as default
  fetchData();
};

// filter events
globalSearch.oninput = applyAllFilters;
// powerRange disabled
// filterMode.onchange = applyAllFilters; // employee: disabled
// listSelect drives listing
if (listSelect) listSelect.onchange = async () => { showSpinner(); try { await loadSelectedListing(); applyAllFilters(); showToast(`${filtered.length} users loaded`);} finally { hideSpinner(); } };
if (ponSelect) ponSelect.onchange = applyAllFilters;

// init
fetchData();
