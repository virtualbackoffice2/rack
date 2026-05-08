const API_BASE_URL = "https://app.vbo.co.in";

const tableConfig = {
  drop_users: {
    emptyText: "No drop users found.",
    columns: [
      ["serial_no", "#"],
      ["source_window", "Window"],
      ["name", "Name"],
      ["phone_pon", "Phone / PON"],
      ["event_type", "Event / Type"],
      ["down_time", "Down Time"],
      ["address", "Address"]
    ]
  }
};

const state = {
  activeTable: "drop_users",
  data: {
    complaint_users: [],
    drop_users: []
  },
  downTimeSortDirection: ""
};

const windowInput = document.getElementById("windowInput");
const selectedWindow = document.getElementById("selectedWindow");
const dropCount = document.getElementById("dropCount");
const lastUpdated = document.getElementById("lastUpdated");
const searchInput = document.getElementById("searchInput");
const ponFilter = document.getElementById("ponFilter");
const eventFilter = document.getElementById("eventFilter");
const message = document.getElementById("message");
const tableHead = document.getElementById("tableHead");
const tableBody = document.getElementById("tableBody");
const WINDOW_STORAGE_KEY = "lidownusers.windowSelection";
const EVENT_STORAGE_KEY = "lidownusers.eventSelection";

function getInitialWindow() {
  const params = new URLSearchParams(window.location.search);
  return (params.get("window") || "MEROTRA").trim().toUpperCase();
}

function getStorageKey(filterElement) {
  if (filterElement === windowInput) {
    return WINDOW_STORAGE_KEY;
  }
  if (filterElement === eventFilter) {
    return EVENT_STORAGE_KEY;
  }
  return "";
}

function getStoredFilterValues(filterElement) {
  const storageKey = getStorageKey(filterElement);
  if (!storageKey) {
    return [];
  }
  try {
    const values = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return Array.isArray(values) ? values.filter(Boolean) : [];
  } catch (error) {
    return [];
  }
}

function setStoredFilterValues(filterElement, values) {
  const storageKey = getStorageKey(filterElement);
  if (!storageKey) {
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(values));
}

function getSelectedValues(filterElement) {
  return [...filterElement.querySelectorAll('.filter-options input[type="checkbox"]:checked')]
    .map((input) => input.value)
    .filter(Boolean);
}

function getAppliedValues(filterElement) {
  if (!filterElement.dataset.appliedValues) {
    return getSelectedValues(filterElement);
  }
  try {
    const values = JSON.parse(filterElement.dataset.appliedValues);
    const allValues = new Set(getAllFilterValues(filterElement));
    if (!Array.isArray(values)) {
      return [];
    }
    return allValues.size ? values.filter((value) => allValues.has(value)) : values.filter(Boolean);
  } catch (error) {
    return getSelectedValues(filterElement);
  }
}

function commitFilterSelection(filterElement) {
  const selectedValues = getSelectedValues(filterElement);
  filterElement.dataset.appliedValues = JSON.stringify(selectedValues);
  setStoredFilterValues(filterElement, selectedValues);
  updateFilterLabel(filterElement);
}

function restoreFilterSelection(filterElement) {
  setSelectedValues(filterElement, getAppliedValues(filterElement));
}

function setSelectedValues(filterElement, values) {
  const selectedSet = new Set(values);
  [...filterElement.querySelectorAll('.filter-options input[type="checkbox"]')].forEach((input) => {
    input.checked = selectedSet.has(input.value);
  });
  updateFilterLabel(filterElement);
}

function getAllFilterValues(filterElement) {
  return [...filterElement.querySelectorAll('.filter-options input[type="checkbox"]')]
    .map((input) => input.value)
    .filter(Boolean);
}

function updateFilterLabel(filterElement) {
  const label = filterElement.querySelector(".filter-value");
  const selectedValues = getSelectedValues(filterElement);
  const allValues = getAllFilterValues(filterElement);

  if (!label) {
    return;
  }
  if (!selectedValues.length) {
    label.textContent = filterElement.dataset.emptyLabel || "All";
    return;
  }
  if (allValues.length && selectedValues.length === allValues.length) {
    label.textContent = filterElement.dataset.allLabel || "All";
    return;
  }
  if (selectedValues.length <= 2) {
    label.textContent = selectedValues.join(", ");
    return;
  }
  label.textContent = `${selectedValues.length} selected`;
}

function setMessage(text, type = "") {
  message.textContent = text;
  message.className = `message ${type}`.trim();
}

function cleanValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}

function escapeHtml(value) {
  return cleanValue(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getPhone(row) {
  return row.Phone || row.primary_phone || "-";
}

function renderCell(row, key) {
  if (key === "serial_no") {
    return escapeHtml(row.serial_no);
  }
  if (key === "phone_pon") {
    return `
      <div class="stack-cell">
        <span>PON ${escapeHtml(row.pon)}</span>
        <strong>${escapeHtml(getPhone(row))}</strong>
      </div>
    `;
  }
  if (key === "event_type") {
    return `
      <div class="stack-cell">
        <strong>${escapeHtml(row.downEvent)}</strong>
        <span>${escapeHtml(row.downEventType)}</span>
      </div>
    `;
  }
  if (key === "source_window") {
    return `<span class="data-pill">${escapeHtml(row[key])}</span>`;
  }
  return escapeHtml(row[key]);
}

function rowMatchesSearch(row, searchText) {
  if (!searchText) {
    return true;
  }
  return Object.values(row).some((value) =>
    String(value || "").toLowerCase().includes(searchText)
  );
}

function rowMatchesPon(row, selectedPonList) {
  if (!selectedPonList.length) {
    return true;
  }
  return selectedPonList.includes(String(row.pon || "").trim().toUpperCase());
}

function rowMatchesEvent(row, selectedEventList) {
  if (!selectedEventList.length) {
    return true;
  }
  return selectedEventList.includes(String(row.downEvent || "").trim());
}

function getSortedRows(rows) {
  if (!state.downTimeSortDirection) {
    return rows;
  }
  return [...rows].sort((left, right) => {
    const leftValue = String(left.down_time || "");
    const rightValue = String(right.down_time || "");
    if (!leftValue && !rightValue) {
      return 0;
    }
    if (!leftValue) {
      return 1;
    }
    if (!rightValue) {
      return -1;
    }
    const result = leftValue.localeCompare(rightValue);
    return state.downTimeSortDirection === "asc" ? result : -result;
  });
}

function getFilteredRows(excludeFilter = "") {
  const searchText = searchInput.value.trim().toLowerCase();
  const selectedPonList = excludeFilter === "pon" ? [] : getAppliedValues(ponFilter);
  const selectedEventList = excludeFilter === "event" ? [] : getAppliedValues(eventFilter);

  return state.data[state.activeTable].filter((row) =>
    rowMatchesSearch(row, searchText) &&
    rowMatchesPon(row, selectedPonList) &&
    rowMatchesEvent(row, selectedEventList)
  );
}

function buildCountMap(rows, keyGetter) {
  return rows.reduce((counts, row) => {
    const key = keyGetter(row);
    if (key) {
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, {});
}

function updateFilterCounts(filterElement, counts) {
  filterElement.querySelectorAll(".filter-options label").forEach((label) => {
    const input = label.querySelector('input[type="checkbox"]');
    const text = label.querySelector(".option-text");
    if (!input || !text) {
      return;
    }
    const count = counts[input.value] || 0;
    label.dataset.count = String(count);
    text.textContent = `${input.value} (${count})`;
    label.style.display = count === 0 ? "none" : "";
  });
}

function updateVisibleFilterCounts(rows) {
  updateFilterCounts(
    ponFilter,
    buildCountMap(rows, (row) => String(row.pon || "").trim().toUpperCase())
  );
  updateFilterCounts(
    eventFilter,
    buildCountMap(rows, (row) => String(row.downEvent || "").trim())
  );
}

function updateMultiFilter(filterElement, values) {
  const currentValues = getAppliedValues(filterElement);
  const options = filterElement.querySelector(".filter-options");
  options.innerHTML = values
    .map((value) => `
      <label>
        <input type="checkbox" value="${escapeHtml(value)}">
        <span class="option-text">${escapeHtml(value)} (0)</span>
      </label>
    `)
    .join("");
  setSelectedValues(
    filterElement,
    currentValues.filter((value) => values.includes(value))
  );
  commitFilterSelection(filterElement);
}

function selectAll(filterElement) {
  filterElement.querySelectorAll(".filter-options label").forEach((label) => {
    const input = label.querySelector('input[type="checkbox"]');
    if (input) {
      input.checked = label.style.display !== "none";
    }
  });
  updateFilterLabel(filterElement);
}

function clearAll(filterElement) {
  filterElement.querySelectorAll('.filter-options input[type="checkbox"]').forEach((input) => {
    input.checked = false;
  });
  updateFilterLabel(filterElement);
}

function closeFilterMenus(exceptElement = null) {
  document.querySelectorAll(".filter-menu.open").forEach((filterElement) => {
    if (filterElement !== exceptElement) {
      restoreFilterSelection(filterElement);
      filterElement.classList.remove("open");
    }
  });
}

function filterOptions(filterElement, searchText) {
  const query = searchText.trim().toLowerCase();
  filterElement.querySelectorAll(".filter-options label").forEach((label) => {
    const count = Number(label.dataset.count || "1");
    const shouldHide = count === 0 || (query && !label.textContent.toLowerCase().includes(query));
    label.style.display = shouldHide ? "none" : "";
  });
}

function setupFilterMenu(filterElement, onChange = null) {
  filterElement.addEventListener("click", (event) => {
    const trigger = event.target.closest(".filter-trigger");
    const action = event.target.dataset.action;

    if (trigger) {
      const isOpen = filterElement.classList.contains("open");
      closeFilterMenus(filterElement);
      filterElement.classList.toggle("open", !isOpen);
      if (!isOpen) {
        restoreFilterSelection(filterElement);
      }
      const search = filterElement.querySelector(".filter-search");
      if (!isOpen && search) {
        search.focus();
      }
      return;
    }

    if (action === "all") {
      selectAll(filterElement);
      return;
    }

    if (action === "clear") {
      clearAll(filterElement);
      commitFilterSelection(filterElement);
      filterElement.classList.remove("open");
      if (onChange) {
        onChange();
      }
      return;
    }

    if (action === "apply") {
      commitFilterSelection(filterElement);
      filterElement.classList.remove("open");
      if (onChange) {
        onChange();
      }
    }
  });

  filterElement.addEventListener("change", () => {
    updateFilterLabel(filterElement);
  });

  filterElement.addEventListener("input", (event) => {
    if (event.target.classList.contains("filter-search")) {
      filterOptions(filterElement, event.target.value);
    }
  });
}

function updatePonFilter() {
  const ponSet = new Set();
  state.data.drop_users.forEach((row) => {
    const pon = String(row.pon || "").trim().toUpperCase();
    if (pon) {
      ponSet.add(pon);
    }
  });
  updateMultiFilter(ponFilter, [...ponSet].sort());
}

function updateEventFilter() {
  const eventSet = new Set();
  state.data.drop_users.forEach((row) => {
    const eventName = String(row.downEvent || "").trim();
    if (eventName) {
      eventSet.add(eventName);
    }
  });
  updateMultiFilter(eventFilter, [...eventSet].sort());
}

function renderTable() {
  const config = tableConfig[state.activeTable];
  const rows = getSortedRows(getFilteredRows()).map((row, index) => ({
    ...row,
    serial_no: index + 1
  }));

  tableHead.innerHTML = `
    <tr>
      ${config.columns.map((column) => `<th class="cell-${column[0]}"${column[0] === "down_time" ? ' data-sort-key="down_time"' : ""}>${column[1]}${column[0] === "down_time" && state.downTimeSortDirection ? ` ${state.downTimeSortDirection === "asc" ? "▲" : "▼"}` : ""}</th>`).join("")}
    </tr>
  `;

  const downTimeHeader = tableHead.querySelector('th[data-sort-key="down_time"]');
  if (downTimeHeader) {
    downTimeHeader.innerHTML = `<button type="button" class="sort-button" data-sort-key="down_time">Down Time${state.downTimeSortDirection ? ` <span class="sort-arrow">${state.downTimeSortDirection === "asc" ? "&#9652;" : "&#9662;"}</span>` : ""}</button>`;
  }

  tableBody.innerHTML = rows
    .map((row) => `
      <tr>
        ${config.columns
          .map(([key, label]) => `<td data-label="${label}" class="cell-${key}">${renderCell(row, key)}</td>`)
          .join("")}
      </tr>
    `)
    .join("");

  if (!rows.length) {
    tableBody.innerHTML = `
      <tr>
        <td class="empty-cell" colspan="${config.columns.length}">
          ${searchInput.value.trim() ? "No matching users found." : config.emptyText}
        </td>
      </tr>
    `;
  }

  updateVisibleFilterCounts(rows);
  setMessage(`${rows.length} filtered users showing.`, rows.length ? "success" : "");
}

function latestTimestamp(payloads) {
  const timestamps = payloads
    .map((payload) => payload.last_updated)
    .filter(Boolean)
    .sort();
  return timestamps[timestamps.length - 1] || "-";
}

function updateCounts(payloads, activeWindows) {
  selectedWindow.textContent = activeWindows.join(", ");
  dropCount.textContent = state.data.drop_users.length;
  lastUpdated.textContent = latestTimestamp(payloads);
}

async function fetchWindowData(activeWindow) {
  const response = await fetch(`${API_BASE_URL}/${encodeURIComponent(activeWindow)}/lidownusers`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.detail || `Unable to load ${activeWindow}.`);
  }

  return payload;
}

async function loadUsers() {
  const activeWindows = getAppliedValues(windowInput);
  if (!activeWindows.length) {
    state.data.complaint_users = [];
    state.data.drop_users = [];
    updateCounts([], []);
    updatePonFilter();
    updateEventFilter();
    renderTable();
    setMessage("Please select at least one window.", "error");
    return;
  }

  setMessage(`Loading ${activeWindows.join(", ")} users...`);

  try {
    const payloads = await Promise.all(activeWindows.map(fetchWindowData));
    state.data.complaint_users = [];
    state.data.drop_users = payloads.flatMap((payload) =>
      (Array.isArray(payload.drop_users) ? payload.drop_users : []).map((row) => ({
        ...row,
        source_window: payload.window_name || payload.client || ""
      }))
    );

    updateCounts(payloads, activeWindows);
    updatePonFilter();
    updateEventFilter();
    renderTable();
  } catch (error) {
    state.data.complaint_users = [];
    state.data.drop_users = [];
    updateCounts([], activeWindows);
    updatePonFilter();
    updateEventFilter();
    renderTable();
    setMessage(error.message, "error");
  }
}

searchInput.addEventListener("input", renderTable);
setupFilterMenu(windowInput, loadUsers);
setupFilterMenu(ponFilter, renderTable);
setupFilterMenu(eventFilter, renderTable);
tableHead.addEventListener("click", (event) => {
  const th = event.target.closest('th[data-sort-key="down_time"]');
  if (!th) {
    return;
  }
  if (!state.downTimeSortDirection) {
    state.downTimeSortDirection = "desc";
  } else {
    state.downTimeSortDirection = state.downTimeSortDirection === "desc" ? "asc" : "desc";
  }
  renderTable();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".filter-menu")) {
    closeFilterMenus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeFilterMenus();
  }
});

const initialWindowValues = getStoredFilterValues(windowInput);
setSelectedValues(windowInput, initialWindowValues.length ? initialWindowValues : [getInitialWindow()]);
commitFilterSelection(windowInput);
eventFilter.dataset.appliedValues = JSON.stringify(getStoredFilterValues(eventFilter));
loadUsers();
