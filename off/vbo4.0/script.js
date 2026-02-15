const baseUrl = "https://app.vbo.co.in";
let currentWindow = "ALL";
let rawRows = [];
let filtered = [];
let currentMode = "all";
let currentView = "cards";
let currentDownList = [];

const cardContainer = document.getElementById("cardView");
const tbody = document.querySelector("#dataTable tbody");
const tableWrap = document.getElementById("tableWrap");
const spinner = document.getElementById("spinnerOverlay");
const toastEl = document.getElementById("toast");

const globalSearch = document.getElementById("globalSearch");
const powerRange = document.getElementById("powerRange");

const filterPon = document.getElementById("filterPon");
const filterTeam = document.getElementById("filterTeam");
const filterMode = document.getElementById("filterMode");
const filterStatus = document.getElementById("filterStatus");

const menuToggle = document.getElementById("menuToggle");
const topMenu = document.getElementById("topMenu");
const userCount = document.getElementById("userCount");
const btnToggleView = document.getElementById("btnToggleView");

let isComplainsView = false;

/* ===============================
   ✅ PON Excel-style multi select
================================= */
const ponMultiWrap = document.getElementById("ponMultiWrap");
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
const modalActions = document.getElementById("modalActions");
const btnDownUsers = document.getElementById("btnDownUsers");
const modalCloseButton = document.getElementById("modalCloseButton");

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
    return (data.rows || []).map(row => ({ 
      ...row, 
      down_list: row.down_list || "",
      _window: windowName, 
      _runtime_timestamp: data.runtime_timestamp || "" 
    }));
  } catch (err) {
    showToast(`Failed to load ${windowName}`);
    return [];
  }
}

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
   ✅ Down Users Helper Functions
================================= */
function normalizeMac(m) {
  return String(m || "")
    .toLowerCase()
    .replace(/[^a-f0-9]/g, "");
}

function getDownUsersDetails() {
  const downSet = new Set(
    currentDownList.map(mac => normalizeMac(mac))
  );

  return rawRows.filter(u => {
    const userMac = normalizeMac(u.MAC);
    return userMac && downSet.has(userMac);
  });
}

function showDownUsersInModal() {
  const users = getDownUsersDetails();

  if (!users.length) {
    modalBody.innerHTML = "<div class='modalRow'>No down users found</div>";
    return;
  }

  modalBody.innerHTML = users.map((u, i) => `
    <div class="modalEntry">
      <div class="modalRow"><b>${i + 1}. ${u.Name || "N/A"}</b></div>
      <div class="modalRow"><b>📞 Phone:</b> ${u["Last called no"] || ""}</div>
      <div class="modalRow"><b>📍 Location:</b> ${u.Location || ""}</div>
      <div class="modalRow"><b>🔌 Status:</b> ${u["User status"] || ""}</div>
      <div class="modalRow"><b>🧷 MAC:</b> ${u.MAC || ""}</div>
      <div class="modalRow"><b>Window:</b> ${u._window || ""}</div>
      <div class="modalRow"><b>Power:</b> ${u.Power?.toFixed(2) || ""}</div>
      <div class="modalRow"><b>Down Count:</b> ${u.downusers || 0}</div>
      <hr style="margin:10px 0;border-color:#ddd;">
    </div>
  `).join("");
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
  modalCloseBtn.onclick = () => {
    complaintModal.style.display = "none";
    if (modalActions) modalActions.style.display = "flex";
    if (btnDownUsers) {
      btnDownUsers.textContent = "Down users list";
      btnDownUsers.style.display = "inline-flex";
    }
  };
}

if (modalCloseButton && complaintModal) {
  modalCloseButton.onclick = () => {
    complaintModal.style.display = "none";
    if (modalActions) modalActions.style.display = "flex";
    if (btnDownUsers) {
      btnDownUsers.textContent = "Down users list";
      btnDownUsers.style.display = "inline-flex";
    }
  };
}

if (complaintModal) {
  complaintModal.onclick = (e) => {
    if (e.target === complaintModal) {
      complaintModal.style.display = "none";
      if (modalActions) modalActions.style.display = "flex";
      if (btnDownUsers) {
        btnDownUsers.textContent = "Down users list";
        btnDownUsers.style.display = "inline-flex";
      }
    }
  };
}

/* ===============================
   ✅ Down Users Button Logic
================================= */
if (btnDownUsers) {
  btnDownUsers.onclick = () => {
    if (btnDownUsers.textContent === "Down users list") {
      showDownUsersInModal();
      btnDownUsers.textContent = "← Back to complaint";
    } else {
      if (modalBody && modalBody._originalHtml) {
        modalBody.innerHTML = modalBody._originalHtml;
      }
      btnDownUsers.textContent = "Down users list";
    }
  };
}

/* ===============================
   ✅ UPDATED: Complaint Popup with fixed grouping and edge cases
================================= */
async function openComplaintPopup(windowName, userId, userName) {
  try {
    showSpinner();
    const url = `${baseUrl}/${windowName}/complaint_history/${userId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed");
    const data = await res.json();
    
    const current = data.current_complaints || [];
    const logs = data.complaint_logs || [];
    const latest = current[0] || null;

    if (modalTitle) modalTitle.textContent = `${userName || "User"} (${userId}) - Complaints`;

    let html = "";
    if (!latest && logs.length === 0) {
      html = `<div class="modalRow">No complaint history found.</div>`;
    } else {
      currentDownList = latest?.down_list
        ? latest.down_list.split(",").map(x => x.trim()).filter(Boolean)
        : [];
      
      if (btnDownUsers) {
        if (currentDownList.length === 0) {
          btnDownUsers.style.display = "none";
        } else {
          btnDownUsers.style.display = "inline-flex";
        }
      }

      if (latest) {
        html += `
          <div class="modalEntry">
            <div class="modalRow"><b>Complaint ID:</b> ${latest.id || "N/A"}</div>
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
            <div class="modalRow"><b>Down List:</b> ${latest.down_list || "None"}</div>
            <div class="modalRow"><b>StatusUpDown:</b> ${latest.statusUpDown || ""}</div>
          </div>
        `;
      }

      if (logs.length > 0) {
        // ✅ FIX 1: Group by user_id + reason (same user + same reason = same ticket)
        const ticketMap = {};
        logs.forEach(l => {
          const key = (l.user_id || "") + "|" + (l.reason || "");
          if (!ticketMap[key]) ticketMap[key] = [];
          ticketMap[key].push(l);
        });

        html += `<div style="font-weight:800;margin-top:10px;">History</div>`;
        
        // ✅ Track if we actually show any history
        let hasHistory = false;

        // ✅ FIX 2: Only show valid OPEN + CLOSE pairs with proper handling
        Object.values(ticketMap).forEach(group => {
          // ✅ Match exact database values: "Open" and "Close" (case insensitive)
          const opens = group.filter(x => String(x.status).toLowerCase() === "open");
          const closes = group.filter(x => String(x.status).toLowerCase() === "close");
          
          // ✅ Skip if no opens or no closes
          if (!opens.length || !closes.length) return;
          
          // ✅ Get latest open and latest close (using copy to avoid modifying original)
          const open = [...opens].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
          const close = [...closes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
          
          // ✅ RULE 1: Skip if no close (redundant check but safe)
          if (!open || !close) return;
          
          // ✅ RULE 2: Skip if latest entry is OPEN (already shown in current complaints)
          const sorted = [...group].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          if (String(sorted[0].status).toLowerCase() === "open") return;

          // ✅ We have a valid history entry
          hasHistory = true;

          const openTime = open?.created_at || "";
          const closeTime = close?.created_at || "";

          let duration = "-";
          if (openTime && closeTime) {
            const diff = new Date(closeTime) - new Date(openTime);
            const mins = Math.floor(diff / 60000);
            const hrs = Math.floor(mins / 60);
            const remMin = mins % 60;
            duration = `${hrs}h ${remMin}m`;
          }

          html += `
            <div class="modalEntry" style="margin-bottom: 12px; border-left: 3px solid #4caf50; padding-left: 10px;">
              <div class="modalRow"><b>Ticket Status:</b> Closed</div>
              <div class="modalRow"><b>Opened:</b> ${openTime}</div>
              <div class="modalRow"><b>Closed:</b> ${closeTime}</div>
              <div class="modalRow"><b>Duration:</b> ${duration}</div>
              <div class="modalRow"><b>Reason:</b> ${open?.reason || ""}</div>
              <div class="modalRow"><b>Page:</b> ${open?.page_id || ""}</div>
            </div>
          `;
        });
        
        // ✅ FIX 3: Show message if no history found
        if (!hasHistory) {
          html += `<div class="modalRow" style="color: var(--text-secondary); padding: 10px;">No closed complaint history found</div>`;
        }
      } else {
        // ✅ No logs at all
        html += `<div class="modalRow" style="color: var(--text-secondary); padding: 10px;">No complaint history found</div>`;
      }
    }

    if (modalBody) {
      modalBody.innerHTML = html;
      modalBody._originalHtml = html;
    }
    
    if (btnDownUsers) {
      btnDownUsers.textContent = "Down users list";
    }
    
    if (modalActions) {
      modalActions.style.display = "flex";
    }
    
    if (complaintModal) complaintModal.style.display = "flex";

    return latest?.id || null;

  } catch (e) {
    showToast("Popup load failed");
    return null;
  } finally {
    hideSpinner();
  }
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

  if (ponMultiList) {
    ponMultiList.innerHTML = pons.map(p => `
      <div class="ponItem" data-pon="${p}">
        <input type="checkbox" ${selectedPonsSet.has(p) ? "checked" : ""}/>
        <span>${p}</span>
      </div>
    `).join("");
  }
  updatePonButtonText();

  if (filterTeam) filterTeam.style.display = "none";

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
  if (term) {
    data = data.filter(r =>
      Object.values(r).some(v => String(v || '').toLowerCase().includes(term))
    );
  }

  const pr = (powerRange?.value || "").trim();
  if (pr.includes("-")) {
    const parts = pr.split("-").map(x => x.trim()).filter(Boolean);
    if (parts.length === 2) {
      const a = parseFloat(parts[0]);
      const b = parseFloat(parts[1]);
      if (!isNaN(a) && !isNaN(b)) {
        const minAbs = Math.min(a, b);
        const maxAbs = Math.max(a, b);
        const minVal = -maxAbs;
        const maxVal = -minAbs;
        data = data.filter(r => r.Power != null && Number(r.Power) >= minVal && Number(r.Power) <= maxVal);
      }
    }
  }

  if (selectedPonsSet.size > 0) {
    data = data.filter(r => selectedPonsSet.has(r.PON));
  }

  if (filterMode.value) data = data.filter(r => r.Mode === filterMode.value);
  if (filterStatus.value) data = data.filter(r => r["User status"] === filterStatus.value);

  filtered = data;

  const runtimeTs = (filtered[0] && filtered[0]._runtime_timestamp) ? filtered[0]._runtime_timestamp : "";
  setHeadingCountAndTimestamp(filtered.length, runtimeTs);

  if (currentView === "cards") renderCards();
  else renderTable();
}

/* ===============================
   ✅ Cards Render (with remark fallback)
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
  let downCount = r.downusers || 0;

  const card = document.createElement("div");
  card.className = "complaint-card";

  if (r["User status"] === "DOWN") {
    card.classList.add("card-complain");
  } else if (r["User status"] === "UP") {
    if (r._complain_open) card.classList.add("card-blink");
    else card.classList.add("card-online");
  } else {
    card.classList.add("card-offline");
  }

  const statusEmoji = r["User status"] === "UP" ? '📶' : r["User status"] === "DOWN" ? '📵' : '💀';

  // ✅ FIX 3: Remark with fallback to reason
  const remarkValue = r.Remarks || r.reason || "";

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
      <div class="card-row"><span class="card-label">Down users:</span><span class="card-value">${downCount}</span></div>
      <div class="card-row"><span class="card-label">MAC / Serial:</span><span class="card-value">${r.MAC || ""} / ${r.Serial || ""}</span></div>
      <div class="card-row"><span class="card-label">Remark:</span><input class="remarkInput" value="${remarkValue}"></div>
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
      <button class="mark-btn"><i class="fa-solid fa-thumbtack"></i></button>
      <button class="remove-btn"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;

  card.style.cursor = (isComplainsView && r._complain_open) ? "pointer" : "default";
  card.onclick = async (e) => {
    if (e.target.closest("button") || e.target.closest("select") || e.target.closest("input")) return;
    if (!isComplainsView || !r._complain_open) return;
    const complaintId = await openComplaintPopup(r._window, r.Users || "", r.Name || "");
    if (complaintId) {
      r._complaint_id = complaintId;
    }
  };

  const teamSel = card.querySelector(".teamSel");
  teamSel.value = r.Team || getDefaultTeam(r._window);

  const modeSel = card.querySelector(".modeSel");
  modeSel.value = r.Mode || "Manual";

  // MARK BUTTON
  card.querySelector(".mark-btn").onclick = async (e) => {
    e.stopPropagation();
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
      const response = await fetch(`${baseUrl}/${r._window}/mark_complain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (result.status === "ok") {
        showToast("Marked !");
        fadeOutAndRemove(card);
      } else {
        showToast(result.message || "Mark failed");
      }
    } catch {
      showToast("Mark failed");
    }
  };

  // REMOVE BUTTON
  card.querySelector(".remove-btn").onclick = async (e) => {
    e.stopPropagation();
    
    let complaintId = r._complaint_id;
    
    if (!complaintId && r.Users) {
      showToast("Fetching complaint details...");
      try {
        showSpinner();
        const url = `${baseUrl}/${r._window}/heroesocr_user_complaints/${encodeURIComponent(r.Users)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const openComplaints = (data.rows || []).filter(c => c.status?.toLowerCase() === "open");
          if (openComplaints.length > 0) {
            complaintId = openComplaints[0].id;
            r._complaint_id = complaintId;
          }
        }
      } catch (error) {
        console.error("Error fetching complaint ID:", error);
      } finally {
        hideSpinner();
      }
    }
    
    if (!complaintId || complaintId === "" || isNaN(Number(complaintId))) {
      showToast("No open complaint found for this user!");
      return;
    }
    
    try {
      const payload = {
        complaint_id: complaintId,
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
      
      const response = await fetch(`${baseUrl}/${r._window}/remove_complain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      const result = await response.json();
      
      if (result.status === "ok") {
        showToast("Removed !");
        fadeOutAndRemove(card);
      } else {
        showToast(result.message || "Remove failed");
      }
    } catch (error) {
      console.error("Delete error:", error);
      showToast("Remove failed");
    }
  };

  container.appendChild(card);
  setTimeout(() => card.classList.add("visible"), index * 60);
}

/* ===============================
   ✅ Table Render (with remark fallback)
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

    let downCount = r.downusers || 0;

    const tr = document.createElement("tr");
    const statusEmoji = r["User status"] === "UP" ? '📶' : r["User status"] === "DOWN" ? '📵' : '💀';

    if (r["User status"] === "DOWN") {
      tr.classList.add("ticket");
    } else if (r["User status"] === "UP") {
      if (r._complain_open) tr.classList.add("tr-blink");
      else tr.classList.add("onlineRow");
    } else {
      tr.classList.add("offline");
    }

    // ✅ FIX 3: Remark with fallback to reason
    const remarkValue = r.Remarks || r.reason || "";

    tr.innerHTML = `
      <td>${r._window || ""}</td>
      <td>${r.PON || ""}</td>
      <td>${r.Users || ""}</td>
      <td>${r["Last called no"] || ""}</td>
      <td>${r.Name || ""}</td>
      <td>${r.MAC || ""}<br><small>${r.Serial || ""}</small></td>
      <td>${downCount}</td>
      <td><input class="remarkInput remarkCol" value="${remarkValue}"></td>
      <td class="teamCol resizableCol">
        <select class="teamSel">
          <option>Sushil</option>
          <option>Shaan</option>
        </select>
      </td>
      <td class="modeCol resizableCol">
        <select class="modeSel">
          <option>Manual</option>
          <option>Auto</option>
        </select>
      </td>
      <td>${r.Power != null ? Number(r.Power).toFixed(2) : ""}</td>
      <td>
<button class="mark-btn"><i class="fa-solid fa-thumbtack"></i></button>
        <button class="remove-btn"><i class="fas fa-trash"></i></button>
      </td>
      <td>${r.Location || ""}</td>
      <td>${statusEmoji}</td>
    `;

    tr.style.cursor = (isComplainsView && r._complain_open) ? "pointer" : "default";
    tr.onclick = async (e) => {
      if (e.target.closest("button") || e.target.closest("select") || e.target.closest("input")) return;
      if (!isComplainsView || !r._complain_open) return;
      const complaintId = await openComplaintPopup(r._window, r.Users || "", r.Name || "");
      if (complaintId) {
        r._complaint_id = complaintId;
      }
    };

    const teamSelect = tr.querySelector(".teamSel");
    teamSelect.value = r.Team || getDefaultTeam(r._window);

    const modeSelect = tr.querySelector(".modeSel");
    modeSelect.value = r.Mode || "Manual";

    // MARK BUTTON
    tr.querySelector(".mark-btn").onclick = async (e) => {
      e.stopPropagation();
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
        const response = await fetch(`${baseUrl}/${r._window}/mark_complain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.status === "ok") {
          showToast("Marked !");
          fadeOutAndRemove(tr);
        } else {
          showToast(result.message || "Mark failed");
        }
      } catch {
        showToast("Mark failed");
      }
    };

    // REMOVE BUTTON
    tr.querySelector(".remove-btn").onclick = async (e) => {
      e.stopPropagation();

      let complaintId = r._complaint_id;

      if (!complaintId && r.Users) {
        showToast("Fetching complaint details...");
        try {
          showSpinner();
          const url = `${baseUrl}/${r._window}/heroesocr_user_complaints/${encodeURIComponent(r.Users)}`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            const openComplaints = (data.rows || []).filter(c => c.status?.toLowerCase() === "open");
            if (openComplaints.length > 0) {
              complaintId = openComplaints[0].id;
              r._complaint_id = complaintId;
            }
          }
        } catch (error) {
          console.error(error);
        } finally {
          hideSpinner();
        }
      }

      if (!complaintId || isNaN(Number(complaintId))) {
        showToast("No open complaint found for this user!");
        return;
      }

      try {
        const payload = {
          complaint_id: complaintId,
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

        const response = await fetch(`${baseUrl}/${r._window}/remove_complain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.status === "ok") {
          showToast("Removed !");
          fadeOutAndRemove(tr);
        } else {
          showToast(result.message || "Remove failed");
        }
      } catch (err) {
        showToast("Remove failed");
      }
    };

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

document.getElementById("btnCsv").onclick = () => {
  if (!filtered.length) {
    showToast("No data to export");
    return;
  }

  const headers = [
    "Window", "PON", "User ID", "Mobile", "Name",
    "Mac / Serial", "Power", "Location"
  ];

  const rows = filtered.map(r => {
    return [
      r._window || "",
      r.PON || "",
      r.Users || "",
      r["Last called no"] || "",
      r.Name || "",
      `${r.MAC || ""} / ${r.Serial || ""}`,
      r.Power != null ? Number(r.Power).toFixed(2) : "",
      r.Location || ""
    ];
  });

  const csvContent = [
    headers.map(h => `"${h}"`).join(","),
    ...rows.map(row =>
      row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
    )
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = "complain-manager.csv";
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV downloaded");
};

document.getElementById("windowSelect").onchange = (e) => {
  currentWindow = e.target.value;
  isComplainsView = false;
  fetchData();
};

document.getElementById("btnComplains").onclick = async () => {
  showSpinner();
  try {
    isComplainsView = true;

    let allData = [];

    if (currentWindow === "ALL") {
      const [m, s] = await Promise.all([
        fetch(`${baseUrl}/MEROTRA/heroesocr_latest`).then(r => r.json()),
        fetch(`${baseUrl}/SUNNY/heroesocr_latest`).then(r => r.json())
      ]);

      allData = [
        ...(m.rows || []).map(r => ({ ...r, _window: "MEROTRA" })),
        ...(s.rows || []).map(r => ({ ...r, _window: "SUNNY" }))
      ];
    } else {
      const res = await fetch(`${baseUrl}/${currentWindow}/heroesocr_latest`);
      const data = await res.json();
      allData = (data.rows || []).map(r => ({ ...r, _window: currentWindow }));
    }

    rawRows = allData.map(r => ({
      ...r,
      Users: r.user_id,
      Name: r.name,
      Location: r.address,
      "Last called no": r.Phone || "",
      PON: r.pon || "",
      "User status": r.statusUpDown || "DOWN",
      down_list: r.down_list || "",
      downusers: r.downusers || 0,
      _complaint_id: r.id,
      _complain_open: true
    }));

    showToast(rawRows.length ? `${rawRows.length} complaints loaded` : "No complaints found");

    populateFilters();
    applyAllFilters();

  } catch (e) {
    showToast("Failed to load complaints");
  } finally {
    hideSpinner();
  }
};

document.getElementById("btnRefresh").onclick = () => {
  isComplainsView = false;
  fetchData();
};

globalSearch.oninput = applyAllFilters;
if (powerRange) powerRange.oninput = applyAllFilters;
filterMode.onchange = applyAllFilters;
filterStatus.onchange = applyAllFilters;

// init
fetchData();
