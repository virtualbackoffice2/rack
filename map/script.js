(function () {
  "use strict";

  const API_BASE = (function () {
    if (window.location.hostname === "localhost") {
      return "http://localhost:8000/api/v1/location";
    }
    return "https://app.vbo.co.in/api/v1/location";
  })();
  const IST_OFFSET = "+05:30";
  const DEFAULT_MAP_CENTER = [80.9462, 26.8467];
  const DEFAULT_MAP_ZOOM = 12;
  const ONLINE_MARKER_COLOR = "#1B69FF";
  const OFFLINE_MARKER_COLOR = "#F44336";
  const ROUTE_COLORS = [
    "#0F7F78",
    "#EF7A42",
    "#1B69FF",
    "#8E44AD",
    "#D35400",
    "#16A085",
    "#C0392B",
    "#2980B9"
  ];

  const state = {
    map: null,
    mapReady: false,
    infoWindow: null,
    popupEmployeeId: null,
    employees: [],
    employeeMap: new Map(),
    visibleEmployees: new Set(),
    selectedEmployeeId: null,
    markers: new Map(),
    polylines: new Map(),
    latestLocations: new Map(),
    routes: new Map(),
    routeSummaries: new Map(),
    statusLogs: new Map(),
    refreshTimer: null,
    refreshSeconds: 10,
    showRoutes: true,
    lastSyncAt: null,
    allRoutesSummaryLoadedAt: 0,
    routeSummaryLoading: false
  };

  const els = {
    mapOverlay: document.getElementById("map-overlay"),
    mapStatusText: document.getElementById("map-status-text"),
    employeeList: document.getElementById("employee-list"),
    employeeCount: document.getElementById("employee-count"),
    statusSummary: document.getElementById("status-summary"),
    lastSyncLabel: document.getElementById("last-sync-label"),
    dateSelector: document.getElementById("date-selector"),
    refreshSelector: document.getElementById("refresh-selector"),
    routeToggle: document.getElementById("route-toggle"),
    centerSelected: document.getElementById("center-selected"),
    clearMap: document.getElementById("clear-map"),
    toastHost: document.getElementById("toast-host"),
    infoPanel: document.querySelector(".info-panel"),
    infoToggle: document.getElementById("info-toggle"),
    infoToggleText: document.getElementById("info-toggle-text"),
    infoEmployeeName: document.getElementById("info-employee-name"),
    infoEmployeeSubtitle: document.getElementById("info-employee-subtitle"),
    statDistance: document.getElementById("stat-distance"),
    statTime: document.getElementById("stat-time"),
    statSpeed: document.getElementById("stat-speed"),
    statChanges: document.getElementById("stat-changes"),
    routePointsCount: document.getElementById("route-points-count"),
    routeEmptyNote: document.getElementById("route-empty-note"),
    detailCurrentStatus: document.getElementById("detail-current-status"),
    detailLastSeen: document.getElementById("detail-last-seen"),
    detailLastPosition: document.getElementById("detail-last-position"),
    detailBattery: document.getElementById("detail-battery"),
    timelineList: document.getElementById("timeline-list"),
    timelineCount: document.getElementById("timeline-count")
  };

  function init() {
    configureStaticControls();
    renderEmptyState();
    initMap();
    loadEmployees({ initial: true });
    setupAutoRefresh(Number(els.refreshSelector.value || state.refreshSeconds));
  }

  function configureStaticControls() {
    const today = formatDateInputValue(new Date());
    els.dateSelector.value = today;
    els.dateSelector.min = today;
    els.dateSelector.max = today;
    els.dateSelector.title = "Only today's route data is available in this dashboard.";

    els.refreshSelector.addEventListener("change", () => {
      const seconds = Number(els.refreshSelector.value || 0);
      setupAutoRefresh(seconds);
      showToast("Refresh updated", seconds ? `Live location sync will run every ${seconds} seconds.` : "Auto-refresh is turned off.", "success");
    });

    els.routeToggle.addEventListener("click", () => {
      state.showRoutes = !state.showRoutes;
      els.routeToggle.setAttribute("aria-pressed", String(state.showRoutes));
      const label = els.routeToggle.querySelector(".toggle-label");
      if (label) {
        label.textContent = state.showRoutes ? "Shown" : "Hidden";
      }
      syncPolylineVisibility();
      if (state.showRoutes && state.selectedEmployeeId) {
        loadEmployeeRoute(state.selectedEmployeeId, { forceRefresh: true }).catch(handleSilentError);
      }
      calculateBounds();
    });

    els.centerSelected.addEventListener("click", () => {
      if (!state.selectedEmployeeId) {
        showToast("Select an employee", "Choose an employee first so the map can center on them.", "error");
        return;
      }
      focusEmployeeOnMap(state.selectedEmployeeId, true);
    });

    els.clearMap.addEventListener("click", clearAllSelections);

    els.infoToggle.addEventListener("click", () => {
      const isExpanded = els.infoPanel.classList.toggle("is-expanded");
      els.infoToggle.setAttribute("aria-expanded", String(isExpanded));
      els.infoToggleText.textContent = isExpanded ? "Collapse" : "Expand";
    });
  }

  function renderEmptyState() {
    els.employeeList.innerHTML = '<div class="empty-state">Loading employees and status data...</div>';
    resetInfoPanel();
  }

  function initMap() {
    if (state.map) {
      return;
    }

    if (!window.maplibregl) {
      updateMapOverlay("Map failed to load", "MapLibre could not be found. Check that the OpenFreeMap assets are loading correctly.");
      showToast("Map load failed", "OpenFreeMap could not initialize. The employee list will still refresh.", "error");
      return;
    }

    state.infoWindow = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      offset: 18,
      maxWidth: "320px"
    });
    state.infoWindow.on("close", () => {
      state.popupEmployeeId = null;
    });

    state.map = new maplibregl.Map({
      container: "map",
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM
    });
    state.map.addControl(new maplibregl.NavigationControl(), "top-right");
    state.map.on("load", () => {
      state.mapReady = true;
      updateMapOverlay("Map ready", "Select employees from the left panel to display their live location and route.");
      els.mapOverlay.classList.add("is-hidden");
      refreshVisibleEmployees().catch(handleSilentError);
    });
    state.map.on("error", () => {
      updateMapOverlay("Map failed to load", "OpenFreeMap tiles could not be loaded. Check network access and try again.");
    });

    updateMapOverlay("Loading OpenFreeMap...", "Preparing the OpenFreeMap canvas and controls.");
  }

  function updateMapOverlay(title, message) {
    const titleNode = els.mapOverlay.querySelector("h3");
    if (titleNode) {
      titleNode.textContent = title;
    }
    els.mapStatusText.textContent = message;
  }

  async function loadEmployees(options = {}) {
    const { initial = false } = options;

    try {
      if (initial) {
        updateMapOverlay("Fetching employees...", "Pulling live employee status and last known positions.");
      }

      const response = await apiFetch("/status", {
        cacheKey: "employee-statuses",
        friendlyName: "employee status"
      });
      const statuses = Array.isArray(response?.statuses) ? response.statuses : [];
      state.employees = statuses.map(normalizeEmployeeStatus).filter((item) => item.id).sort(compareEmployees);
      state.employeeMap = new Map(state.employees.map((employee) => [employee.id, employee]));
      state.lastSyncAt = new Date();
      renderEmployeeList();
      updateHeaderSummary();

      if (!state.selectedEmployeeId && state.employees.length) {
        selectEmployee(state.employees[0].id, { focusMap: false, keepVisibility: false });
      } else if (state.selectedEmployeeId && !state.employeeMap.has(state.selectedEmployeeId)) {
        state.selectedEmployeeId = null;
        resetInfoPanel();
      } else {
        refreshSelectedEmployeePanel();
      }

      await refreshVisibleEmployees();
      syncAllMarkerAppearances();
      syncPolylineVisibility();
      maybeLoadAllRouteSummaries().catch(handleSilentError);
    } catch (error) {
      console.error(error);
      renderErrorState(error.message || "Unable to load employee statuses.");
      showToast("Status API unavailable", "Employee status could not be loaded. Cached data will be used if available.", "error");
    }
  }

  function updateHeaderSummary() {
    const total = state.employees.length;
    const onlineCount = state.employees.filter((employee) => employee.isOnline).length;
    els.employeeCount.textContent = String(total);
    els.statusSummary.textContent = total ? `${onlineCount} online | ${total - onlineCount} offline` : "No employees available";
    els.lastSyncLabel.textContent = state.lastSyncAt ? `Last sync ${formatRelativeTime(state.lastSyncAt)}` : "Waiting for first sync...";
  }

  function renderErrorState(message) {
    els.employeeList.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function renderEmployeeList() {
    if (!state.employees.length) {
      els.employeeList.innerHTML = '<div class="empty-state">No employees were returned by <code>/status</code>.</div>';
      return;
    }

    const markup = state.employees.map((employee) => {
      const summary = state.routeSummaries.get(employee.id);
      const isSelected = state.selectedEmployeeId === employee.id;
      const isVisible = state.visibleEmployees.has(employee.id);
      const lastCoords = formatCoordinates(employee.lastLat, employee.lastLon);
      const distance = summary ? formatDistance(summary.totalDistanceMeters) : "Loading...";
      const lastSeen = formatDateTime(employee.updatedAt);
      const statusClass = employee.isOnline ? "online" : "offline";
      const statusText = employee.isOnline ? "ONLINE" : "OFFLINE";

      return `
        <article class="employee-card ${isSelected ? "is-selected" : ""} ${isVisible ? "is-visible" : ""}" data-employee-id="${escapeHtml(employee.id)}">
          <div class="employee-meta">
            <div class="employee-title">
              <h3 class="employee-name">${escapeHtml(employee.displayName)}</h3>
              <p class="employee-email">${escapeHtml(employee.id)}</p>
            </div>
            <span class="status-chip ${statusClass}">
              <i class="status-dot"></i>
              ${statusText}
            </span>
          </div>

          <div class="employee-body">
            <div class="label-row">
              <span>Last Seen</span>
              <strong>${escapeHtml(lastSeen)}</strong>
            </div>
            <div class="label-row">
              <span>Last Position</span>
              <strong>${escapeHtml(lastCoords)}</strong>
            </div>
            <div class="label-row">
              <span>Today's Distance</span>
              <strong>${escapeHtml(distance)}</strong>
            </div>
          </div>

          <div class="employee-actions">
            <button type="button" class="employee-action-btn ${isVisible ? "is-active" : ""}" data-action="toggle-visibility" data-employee-id="${escapeHtml(employee.id)}">
              ${isVisible ? "Hide from map" : "Show on map"}
            </button>
            <button type="button" class="employee-action-btn" data-action="center" data-employee-id="${escapeHtml(employee.id)}">Center</button>
          </div>
        </article>
      `;
    }).join("");

    els.employeeList.innerHTML = markup;

    els.employeeList.querySelectorAll(".employee-card").forEach((card) => {
      card.addEventListener("click", (event) => {
        if (event.target.closest("button")) {
          return;
        }
        selectEmployee(card.dataset.employeeId, { focusMap: true, keepVisibility: true });
      });
    });

    els.employeeList.querySelectorAll("[data-action='toggle-visibility']").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleEmployeeVisibility(button.dataset.employeeId);
      });
    });

    els.employeeList.querySelectorAll("[data-action='center']").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        selectEmployee(button.dataset.employeeId, { focusMap: true, keepVisibility: true });
      });
    });
  }

  function selectEmployee(employeeId, options = {}) {
    const { focusMap = true, keepVisibility = true } = options;
    const employee = state.employeeMap.get(employeeId);
    if (!employee) {
      return;
    }

    state.selectedEmployeeId = employeeId;
    if (!keepVisibility || !state.visibleEmployees.has(employeeId)) {
      state.visibleEmployees.add(employeeId);
    }

    renderEmployeeList();
    refreshSelectedEmployeePanel();
    syncAllMarkerAppearances();
    syncPolylineVisibility();
    loadEmployeeRoute(employeeId, { forceRefresh: true }).catch(handleSilentError);
    loadEmployeeStatusLogs(employeeId).catch(handleSilentError);
    const latestLocationPromise = loadLatestLocation(employeeId, { forceRefresh: true }).catch(handleSilentError);
    refreshVisibleEmployees().catch(handleSilentError);

    if (focusMap) {
      Promise.resolve(latestLocationPromise).finally(() => {
        focusEmployeeOnMap(employeeId, true);
      });
    }
  }

  function toggleEmployeeVisibility(employeeId) {
    if (state.visibleEmployees.has(employeeId)) {
      state.visibleEmployees.delete(employeeId);
      hideEmployeeOverlays(employeeId);
      if (state.selectedEmployeeId === employeeId) {
        refreshSelectedEmployeePanel();
      }
    } else {
      state.visibleEmployees.add(employeeId);
      loadLatestLocation(employeeId, { forceRefresh: true }).catch(handleSilentError);
      if (state.showRoutes) {
        loadEmployeeRoute(employeeId).catch(handleSilentError);
      }
    }

    renderEmployeeList();
    syncAllMarkerAppearances();
    syncPolylineVisibility();
    refreshVisibleEmployees().catch(handleSilentError);
    calculateBounds();
  }

  function hideEmployeeOverlays(employeeId) {
    const markerBundle = state.markers.get(employeeId);
    if (markerBundle?.marker) {
      detachMarker(markerBundle.marker);
    }
    hideRouteLayer(employeeId);
    if (state.popupEmployeeId === employeeId) {
      state.infoWindow?.remove();
      state.popupEmployeeId = null;
    }
  }

  function clearAllSelections() {
    state.visibleEmployees.clear();
    state.selectedEmployeeId = null;
    state.markers.forEach((bundle) => {
      if (bundle?.marker) {
        detachMarker(bundle.marker);
      }
    });
    state.polylines.forEach((_, employeeId) => hideRouteLayer(employeeId));
    state.infoWindow?.remove();
    state.popupEmployeeId = null;
    renderEmployeeList();
    resetInfoPanel();
    syncAllMarkerAppearances();
    syncPolylineVisibility();
    calculateBounds();
    showToast("Map cleared", "All live markers and route overlays were hidden.", "success");
  }

  function resetInfoPanel() {
    els.infoEmployeeName.textContent = "No employee selected";
    els.infoEmployeeSubtitle.textContent = "Choose an employee from the left panel to load route and activity details.";
    els.statDistance.textContent = "--";
    els.statTime.textContent = "--";
    els.statSpeed.textContent = "--";
    els.statChanges.textContent = "--";
    els.routePointsCount.textContent = "0 points";
    els.routeEmptyNote.textContent = "";
    els.detailCurrentStatus.textContent = "--";
    els.detailLastSeen.textContent = "--";
    els.detailLastPosition.textContent = "--";
    els.detailBattery.textContent = "--";
    els.timelineCount.textContent = "0 events";
    els.timelineList.className = "timeline-list empty-state";
    els.timelineList.textContent = "Status change history will appear here once an employee is selected.";
  }

  function refreshSelectedEmployeePanel() {
    const employeeId = state.selectedEmployeeId;
    if (!employeeId) {
      resetInfoPanel();
      return;
    }

    const employee = state.employeeMap.get(employeeId);
    if (!employee) {
      resetInfoPanel();
      return;
    }

    const latest = state.latestLocations.get(employeeId);
    const route = state.routes.get(employeeId) || state.routeSummaries.get(employeeId);
    const logs = state.statusLogs.get(employeeId) || [];
    const stats = buildRouteStats(route);

    els.infoEmployeeName.textContent = employee.displayName;
    els.infoEmployeeSubtitle.textContent = `${employee.id} | ${employee.isOnline ? "Currently online" : "Currently offline"}`;
    els.statDistance.textContent = stats.distance;
    els.statTime.textContent = stats.duration;
    els.statSpeed.textContent = stats.averageSpeed;
    els.statChanges.textContent = String(logs.length);
    els.routePointsCount.textContent = `${stats.pointCount} points`;
    els.routeEmptyNote.textContent = route && !stats.pointCount ? "No data for today." : "";
    els.detailCurrentStatus.textContent = employee.isOnline ? "ONLINE" : "OFFLINE";
    els.detailLastSeen.textContent = formatDateTime(employee.updatedAt);
    els.detailLastPosition.textContent = formatCoordinates(latest?.latitude ?? employee.lastLat, latest?.longitude ?? employee.lastLon);
    els.detailBattery.textContent = formatBattery(latest?.battery);
    renderTimeline(logs);
  }

  function renderTimeline(logs) {
    els.timelineCount.textContent = `${logs.length} events`;
    if (!logs.length) {
      els.timelineList.className = "timeline-list empty-state";
      els.timelineList.textContent = "No status changes were returned for the selected employee today.";
      return;
    }

    els.timelineList.className = "timeline-list";
    els.timelineList.innerHTML = logs.map((entry) => `
      <article class="timeline-item">
        <strong>${escapeHtml(entry.label)}</strong>
        <time>${escapeHtml(formatDateTime(entry.timestamp))}</time>
        <span>${escapeHtml(entry.subtitle)}</span>
      </article>
    `).join("");
  }

  async function maybeLoadAllRouteSummaries(force = false) {
    const shouldRefresh = force || !state.allRoutesSummaryLoadedAt || Date.now() - state.allRoutesSummaryLoadedAt > 60_000;
    if (!shouldRefresh || state.routeSummaryLoading || !state.employees.length) {
      return;
    }

    state.routeSummaryLoading = true;

    try {
      await runConcurrencyPool(state.employees, 4, async (employee) => {
        if (!force && state.routeSummaries.has(employee.id)) {
          return;
        }
        try {
          await loadEmployeeRoute(employee.id, { summaryOnly: true, forceRefresh: force });
        } catch (error) {
          console.warn("Route summary unavailable for", employee.id, error);
        }
      });

      state.allRoutesSummaryLoadedAt = Date.now();
      renderEmployeeList();
      refreshSelectedEmployeePanel();
    } finally {
      state.routeSummaryLoading = false;
    }
  }

  async function loadEmployeeRoute(employeeId, options = {}) {
    const { summaryOnly = false, forceRefresh = false } = options;
    const cachedRoute = state.routes.get(employeeId);
    const cachedSummary = state.routeSummaries.get(employeeId);

    if (!forceRefresh) {
      if (summaryOnly && cachedSummary) {
        return cachedSummary;
      }
      if (!summaryOnly && cachedRoute) {
        syncRouteForEmployee(employeeId, cachedRoute);
        return cachedRoute;
      }
    }

    const response = await apiFetch(`/mapdata/${encodeURIComponent(employeeId)}`, {
      cacheKey: `route-${employeeId}`,
      friendlyName: `route data for ${employeeId}`
    });
    const normalized = normalizeRouteData(response);
    state.routeSummaries.set(employeeId, normalized);

    if (!summaryOnly) {
      state.routes.set(employeeId, normalized);
      syncRouteForEmployee(employeeId, normalized);
      refreshSelectedEmployeePanel();
    }

    return normalized;
  }

  function syncRouteForEmployee(employeeId, routeData) {
    if (!state.map || !state.mapReady || !routeData) {
      return;
    }

    const existing = state.polylines.get(employeeId);
    const coordinates = routeData.points.map((point) => [point.longitude, point.latitude]);

    if (!coordinates.length) {
      hideRouteLayer(employeeId);
      return;
    }

    const strokeColor = getEmployeeColor(employeeId);
    const sourceId = existing?.sourceId || `route-source-${sanitizeMapLayerId(employeeId)}`;
    const layerId = existing?.layerId || `route-layer-${sanitizeMapLayerId(employeeId)}`;
    const feature = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates
      },
      properties: {
        employeeId
      }
    };
    const isVisible = state.showRoutes && state.visibleEmployees.has(employeeId);

    if (state.map.getSource(sourceId)) {
      state.map.getSource(sourceId).setData(feature);
    } else {
      state.map.addSource(sourceId, {
        type: "geojson",
        data: feature
      });
    }

    if (!state.map.getLayer(layerId)) {
      state.map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        layout: {
          "line-cap": "round",
          "line-join": "round",
          visibility: isVisible ? "visible" : "none"
        },
        paint: {
          "line-color": strokeColor,
          "line-width": state.selectedEmployeeId === employeeId ? 5 : 4,
          "line-opacity": 0.85
        }
      });
    } else {
      state.map.setPaintProperty(layerId, "line-color", strokeColor);
      state.map.setPaintProperty(layerId, "line-width", state.selectedEmployeeId === employeeId ? 5 : 4);
      state.map.setPaintProperty(layerId, "line-opacity", 0.85);
      state.map.setLayoutProperty(layerId, "visibility", isVisible ? "visible" : "none");
    }

    state.polylines.set(employeeId, { sourceId, layerId });

    if (isVisible) {
      calculateBounds();
    }
  }

  function hideRouteLayer(employeeId) {
    if (!state.map || !state.mapReady) {
      return;
    }

    const routeLayer = state.polylines.get(employeeId);
    if (!routeLayer?.layerId || !state.map.getLayer(routeLayer.layerId)) {
      return;
    }

    state.map.setLayoutProperty(routeLayer.layerId, "visibility", "none");
  }

  async function loadEmployeeStatusLogs(employeeId) {
    try {
      const response = await apiFetch(`/status/logs/${encodeURIComponent(employeeId)}`, {
        cacheKey: `status-logs-${employeeId}`,
        friendlyName: `status log for ${employeeId}`
      });
      const logs = normalizeStatusLogs(response);
      state.statusLogs.set(employeeId, logs);
      if (state.selectedEmployeeId === employeeId) {
        renderTimeline(logs);
        els.statChanges.textContent = String(logs.length);
      }
      return logs;
    } catch (error) {
      console.warn(error);
      state.statusLogs.set(employeeId, []);
      if (state.selectedEmployeeId === employeeId) {
        renderTimeline([]);
      }
      return [];
    }
  }

  async function refreshVisibleEmployees() {
    if (!state.visibleEmployees.size) {
      calculateBounds();
      return;
    }

    const visibleIds = Array.from(state.visibleEmployees);
    await Promise.allSettled(visibleIds.map((employeeId) => loadLatestLocation(employeeId)));

    if (state.showRoutes) {
      const routeIds = visibleIds.filter((employeeId) => employeeId === state.selectedEmployeeId || state.routes.has(employeeId));
      await Promise.allSettled(routeIds.map((employeeId) => loadEmployeeRoute(employeeId)));
    }

    calculateBounds();
  }

  async function loadLatestLocation(employeeId, options = {}) {
    const { forceRefresh = false } = options;
    const employee = state.employeeMap.get(employeeId);
    if (!employee) {
      return null;
    }

    if (!forceRefresh) {
      const known = state.latestLocations.get(employeeId);
      if (known && Date.now() - known.cachedAt < 8_000) {
        addLiveMarker(employeeId, known.latitude, known.longitude, known);
        return known;
      }
    }

    try {
      const response = await apiFetch(`/locations/${encodeURIComponent(employeeId)}?limit=1`, {
        cacheKey: `latest-location-${employeeId}`,
        friendlyName: `latest location for ${employeeId}`
      });
      const latest = normalizeLatestLocation(response, employee);
      state.latestLocations.set(employeeId, latest);
      addLiveMarker(employeeId, latest.latitude, latest.longitude, latest);
      if (state.selectedEmployeeId === employeeId) {
        refreshSelectedEmployeePanel();
      }
      return latest;
    } catch (error) {
      console.warn(error);
      const fallback = {
        latitude: employee.lastLat,
        longitude: employee.lastLon,
        speed: null,
        accuracy: null,
        battery: null,
        timestamp: employee.updatedAt,
        cachedAt: Date.now()
      };
      state.latestLocations.set(employeeId, fallback);
      addLiveMarker(employeeId, fallback.latitude, fallback.longitude, fallback);
      return fallback;
    }
  }

  function addLiveMarker(employeeId, lat, lng, details) {
    if (!state.map || !state.visibleEmployees.has(employeeId) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    const employee = state.employeeMap.get(employeeId);
    const markerColor = employee?.isOnline ? ONLINE_MARKER_COLOR : OFFLINE_MARKER_COLOR;
    const markerBundle = state.markers.get(employeeId);

    if (markerBundle?.marker) {
      updateMarker(markerBundle.marker, lng, lat);
      syncMarkerElement(markerBundle.marker.getElement(), markerColor, employee?.isOnline, state.selectedEmployeeId === employeeId);
    } else {
      const marker = createMarker(lng, lat, markerColor, employee?.isOnline, state.selectedEmployeeId === employeeId);
      const open = createMarkerInfoHandler(employeeId, marker);
      attachMarkerEvents(marker, open);
      state.markers.set(employeeId, {
        marker,
        open
      });
    }

    if (details && state.selectedEmployeeId === employeeId) {
      refreshSelectedEmployeePanel();
    }
  }

  function createMarker(lng, lat, color, isOnline, isSelected) {
    const element = createMarkerElement(color, isOnline, isSelected);
    return new maplibregl.Marker({ element })
      .setLngLat([lng, lat])
      .addTo(state.map);
  }

  function updateMarker(marker, lng, lat) {
    marker.setLngLat([lng, lat]);
    if (!marker.getElement().isConnected) {
      marker.addTo(state.map);
    }
  }

  function detachMarker(marker) {
    marker.remove();
  }

  function createMarkerInfoHandler(employeeId, marker) {
    return () => {
      const employee = state.employeeMap.get(employeeId);
      const latest = state.latestLocations.get(employeeId);
      if (!employee || !latest) {
        return;
      }

      const content = `
        <div class="info-window">
          <p class="section-kicker">Live Marker</p>
          <h3>${escapeHtml(employee.displayName)}</h3>
          <ul>
            <li><span>Time</span><strong>${escapeHtml(formatDateTime(latest.timestamp || employee.updatedAt))}</strong></li>
            <li><span>Speed</span><strong>${escapeHtml(formatSpeed(latest.speed))}</strong></li>
            <li><span>Accuracy</span><strong>${escapeHtml(formatAccuracy(latest.accuracy))}</strong></li>
            <li><span>Battery</span><strong>${escapeHtml(formatBattery(latest.battery))}</strong></li>
          </ul>
        </div>
      `;

      const currentPosition = marker.getLngLat();
      state.infoWindow
        .setLngLat([currentPosition.lng, currentPosition.lat])
        .setHTML(content)
        .addTo(state.map);
      state.popupEmployeeId = employeeId;
      selectEmployee(employeeId, { focusMap: false, keepVisibility: true });
    };
  }

  function attachMarkerEvents(marker, openHandler) {
    const element = marker.getElement();
    element.addEventListener("click", openHandler);
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openHandler();
      }
    });
  }

  function createMarkerElement(color, isOnline, isSelected) {
    const root = document.createElement("div");
    const pulse = document.createElement("span");
    pulse.className = "pulse-ring";
    const core = document.createElement("span");
    core.className = "core-dot";

    root.appendChild(pulse);
    root.appendChild(core);
    syncMarkerElement(root, color, isOnline, isSelected);
    return root;
  }

  function syncMarkerElement(element, color, isOnline, isSelected) {
    element.className = `employee-marker ${isOnline ? "" : "is-offline"} ${isSelected ? "is-selected" : ""}`.trim();
    element.style.setProperty("--marker-color", color);
    element.setAttribute("role", "button");
    element.setAttribute("tabindex", "0");
    element.setAttribute("aria-label", "Employee location marker");
  }

  function syncAllMarkerAppearances() {
    state.markers.forEach((bundle, employeeId) => {
      if (!bundle?.marker) {
        return;
      }

      const employee = state.employeeMap.get(employeeId);
      if (!employee) {
        return;
      }

      const markerColor = employee.isOnline ? ONLINE_MARKER_COLOR : OFFLINE_MARKER_COLOR;
      syncMarkerElement(bundle.marker.getElement(), markerColor, employee.isOnline, state.selectedEmployeeId === employeeId);
    });
  }

  function calculateBounds() {
    if (!state.map || !state.mapReady) {
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    let count = 0;

    state.visibleEmployees.forEach((employeeId) => {
      const latest = state.latestLocations.get(employeeId);
      if (latest && Number.isFinite(latest.latitude) && Number.isFinite(latest.longitude)) {
        bounds.extend([latest.longitude, latest.latitude]);
        count += 1;
      }

      if (state.showRoutes) {
        const route = state.routes.get(employeeId);
        route?.points?.forEach((point) => {
          bounds.extend([point.longitude, point.latitude]);
          count += 1;
        });
      }
    });

    if (!count) {
      state.map.easeTo({
        center: DEFAULT_MAP_CENTER,
        zoom: DEFAULT_MAP_ZOOM,
        duration: 600
      });
      return;
    }

    if (count === 1) {
      const center = bounds.getCenter();
      state.map.easeTo({
        center: [center.lng, center.lat],
        zoom: 15,
        duration: 600
      });
      return;
    }

    state.map.fitBounds(bounds, {
      padding: 80,
      duration: 700,
      maxZoom: 15
    });
  }

  function focusEmployeeOnMap(employeeId, openInfoWindow) {
    const latest = state.latestLocations.get(employeeId);
    const markerBundle = state.markers.get(employeeId);
    if (!state.map || !latest || !markerBundle?.marker) {
      return;
    }

    state.map.easeTo({
      center: [latest.longitude, latest.latitude],
      zoom: Math.max(state.map.getZoom(), 15),
      duration: 700
    });

    if (openInfoWindow && typeof markerBundle.open === "function") {
      markerBundle.open();
    }
  }

  function syncPolylineVisibility() {
    if (!state.map || !state.mapReady) {
      return;
    }

    state.polylines.forEach((routeLayer, employeeId) => {
      if (!routeLayer?.layerId || !state.map.getLayer(routeLayer.layerId)) {
        return;
      }

      state.map.setLayoutProperty(routeLayer.layerId, "visibility", state.showRoutes && state.visibleEmployees.has(employeeId) ? "visible" : "none");
      state.map.setPaintProperty(routeLayer.layerId, "line-width", state.selectedEmployeeId === employeeId ? 5 : 4);
    });
  }

  function setupAutoRefresh(seconds) {
    state.refreshSeconds = seconds;
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }

    if (!seconds) {
      return;
    }

    state.refreshTimer = window.setInterval(() => {
      updateLiveLocations().catch(handleSilentError);
    }, seconds * 1000);
  }

  async function updateLiveLocations() {
    await loadEmployees();
    const visibleIds = Array.from(state.visibleEmployees);
    if (!visibleIds.length) {
      return;
    }

    await Promise.allSettled(visibleIds.map((employeeId) => loadLatestLocation(employeeId, { forceRefresh: true })));

    if (state.selectedEmployeeId) {
      await Promise.allSettled([
        loadEmployeeRoute(state.selectedEmployeeId, { forceRefresh: true }),
        loadEmployeeStatusLogs(state.selectedEmployeeId)
      ]);
    }

    maybeLoadAllRouteSummaries().catch(handleSilentError);
    calculateBounds();
  }

  async function apiFetch(path, options = {}) {
    const { cacheKey, friendlyName = "request" } = options;
    const url = `${API_BASE}${path}`;
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(url, {
          headers: {
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          throw new Error(`${friendlyName} failed with status ${response.status}`);
        }

        const data = await response.json();
        if (cacheKey) {
          setCache(cacheKey, data);
        }
        return data;
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          await delay(350 * attempt);
        }
      }
    }

    if (cacheKey) {
      const cached = getCache(cacheKey);
      if (cached) {
        showToast("Using cached data", `${friendlyName} is unavailable, so cached data is being shown.`, "error");
        return cached;
      }
    }

    throw lastError || new Error(`${friendlyName} failed.`);
  }

  function normalizeEmployeeStatus(item) {
    const employeeId = String(item.employee_id || item.id || item.email || "");
    const updatedAt = parseApiDateTime(item.updated_at || item.ist_datetime || item.timestamp);
    return {
      id: employeeId,
      displayName: prettifyEmployeeName(employeeId),
      status: String(item.status || "").toLowerCase(),
      isOnline: Boolean(item.is_online) || String(item.status || "").toLowerCase() === "on",
      lastLat: coerceNumber(item.last_lat ?? item.latitude ?? item.lat),
      lastLon: coerceNumber(item.last_lon ?? item.longitude ?? item.lon ?? item.lng),
      updatedAt
    };
  }

  function normalizeRouteData(data) {
    const pointsRaw = Array.isArray(data?.points) ? data.points : [];
    const points = pointsRaw
      .map((point) => ({
        latitude: coerceNumber(point.latitude ?? point.lat),
        longitude: coerceNumber(point.longitude ?? point.lon ?? point.lng),
        accuracy: coerceNumber(point.accuracy),
        speed: coerceNumber(point.speed),
        battery: point.battery ?? point.battery_level ?? point.batteryPercentage ?? null,
        timestamp: parseApiDateTime(point.ist_datetime || point.timestamp || point.updated_at)
      }))
      .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));

    return {
      employeeId: String(data?.employee_id || ""),
      date: data?.date || formatDateInputValue(new Date()),
      totalPoints: Number(data?.total_points || points.length || 0),
      totalDistanceMeters: Number(data?.total_distance_meters || 0),
      points
    };
  }

  function normalizeLatestLocation(data, employee) {
    const source = extractLatestLocationObject(data) || {};
    return {
      latitude: coerceNumber(source.latitude ?? source.lat ?? source.last_lat ?? employee?.lastLat),
      longitude: coerceNumber(source.longitude ?? source.lon ?? source.lng ?? source.last_lon ?? employee?.lastLon),
      accuracy: coerceNumber(source.accuracy),
      speed: coerceNumber(source.speed),
      battery: source.battery ?? source.battery_level ?? source.batteryPercentage ?? null,
      timestamp: parseApiDateTime(source.ist_datetime || source.updated_at || source.timestamp || employee?.updatedAt),
      cachedAt: Date.now()
    };
  }

  function normalizeStatusLogs(data) {
    const raw = Array.isArray(data)
      ? data
      : Array.isArray(data?.logs)
        ? data.logs
        : Array.isArray(data?.status_logs)
          ? data.status_logs
          : Array.isArray(data?.entries)
            ? data.entries
            : [];

    return raw
      .map((entry) => {
        const status = String(entry.status || entry.to_status || entry.state || "Unknown").toUpperCase();
        const fromStatus = entry.from_status ? `from ${String(entry.from_status).toUpperCase()}` : null;
        return {
          label: status,
          timestamp: parseApiDateTime(entry.changed_at || entry.ist_datetime || entry.timestamp || entry.updated_at),
          subtitle: fromStatus || String(entry.note || entry.reason || "Status updated")
        };
      })
      .filter((entry) => Boolean(entry.timestamp))
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  function extractLatestLocationObject(data) {
    if (Array.isArray(data)) {
      return data[0] || null;
    }
    if (Array.isArray(data?.locations)) {
      return data.locations[0] || null;
    }
    if (Array.isArray(data?.data)) {
      return data.data[0] || null;
    }
    if (data?.location && typeof data.location === "object") {
      return data.location;
    }
    return data;
  }

  function buildRouteStats(route) {
    const points = Array.isArray(route?.points) ? route.points : [];
    const totalDistanceMeters = Number(route?.totalDistanceMeters || route?.total_distance_meters || 0);
    const firstTimestamp = points[0]?.timestamp || null;
    const lastTimestamp = points[points.length - 1]?.timestamp || null;
    const durationMs = firstTimestamp && lastTimestamp ? Math.max(lastTimestamp - firstTimestamp, 0) : 0;
    const averageSpeedKmph = durationMs > 0
      ? (totalDistanceMeters / 1000) / (durationMs / 3_600_000)
      : averagePositiveSpeed(points);

    return {
      distance: totalDistanceMeters ? formatDistance(totalDistanceMeters) : "--",
      duration: durationMs ? formatDuration(durationMs) : "--",
      averageSpeed: Number.isFinite(averageSpeedKmph) && averageSpeedKmph > 0 ? `${averageSpeedKmph.toFixed(1)} km/h` : "--",
      pointCount: points.length || Number(route?.totalPoints || 0)
    };
  }

  function averagePositiveSpeed(points) {
    const speeds = points.map((point) => Number(point.speed)).filter((value) => Number.isFinite(value) && value > 0);
    if (!speeds.length) {
      return NaN;
    }
    const avgMetersPerSecond = speeds.reduce((total, value) => total + value, 0) / speeds.length;
    return avgMetersPerSecond * 3.6;
  }

  function getEmployeeColor(employeeId) {
    let hash = 0;
    for (let index = 0; index < employeeId.length; index += 1) {
      hash = employeeId.charCodeAt(index) + ((hash << 5) - hash);
    }
    return ROUTE_COLORS[Math.abs(hash) % ROUTE_COLORS.length];
  }

  function sanitizeMapLayerId(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "employee";
  }

  function prettifyEmployeeName(employeeId) {
    const localPart = employeeId.split("@")[0] || employeeId;
    return localPart
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function compareEmployees(a, b) {
    if (a.isOnline !== b.isOnline) {
      return a.isOnline ? -1 : 1;
    }
    return a.displayName.localeCompare(b.displayName);
  }

  function formatCoordinates(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return "--";
    }
    return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }

  function formatDistance(distanceMeters) {
    if (!Number.isFinite(distanceMeters)) {
      return "--";
    }
    if (distanceMeters >= 1000) {
      return `${(distanceMeters / 1000).toFixed(2)} km`;
    }
    return `${distanceMeters.toFixed(0)} m`;
  }

  function formatDuration(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return "--";
    }
    const hours = Math.floor(durationMs / 3_600_000);
    const minutes = Math.floor((durationMs % 3_600_000) / 60_000);
    if (hours && minutes) {
      return `${hours}h ${minutes}m`;
    }
    if (hours) {
      return `${hours}h`;
    }
    return `${minutes}m`;
  }

  function formatSpeed(speedMetersPerSecond) {
    if (!Number.isFinite(speedMetersPerSecond)) {
      return "--";
    }
    return `${(speedMetersPerSecond * 3.6).toFixed(1)} km/h`;
  }

  function formatAccuracy(accuracyMeters) {
    if (!Number.isFinite(accuracyMeters)) {
      return "--";
    }
    return `${accuracyMeters.toFixed(1)} m`;
  }

  function formatBattery(battery) {
    const numeric = Number(battery);
    if (Number.isFinite(numeric)) {
      return `${numeric}%`;
    }
    return "--";
  }

  function formatDateTime(value) {
    const date = value instanceof Date ? value : parseApiDateTime(value);
    if (!date || Number.isNaN(date.getTime())) {
      return "--";
    }
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function formatRelativeTime(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "--";
    }
    const deltaMs = date.getTime() - Date.now();
    const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    const minutes = Math.round(deltaMs / 60_000);
    if (Math.abs(minutes) < 60) {
      return formatter.format(minutes, "minute");
    }
    const hours = Math.round(deltaMs / 3_600_000);
    if (Math.abs(hours) < 24) {
      return formatter.format(hours, "hour");
    }
    const days = Math.round(deltaMs / 86_400_000);
    return formatter.format(days, "day");
  }

  function parseApiDateTime(value) {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return value;
    }

    const text = String(value).trim();
    const hasTimeZone = /[zZ]|[+-]\d{2}:\d{2}$/.test(text);
    const normalized = text.includes("T") ? text : text.replace(" ", "T");
    const finalValue = hasTimeZone ? normalized : `${normalized}${IST_OFFSET}`;
    const parsed = new Date(finalValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function coerceNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
  }

  function setCache(key, value) {
    try {
      localStorage.setItem(`vboattendance:${key}`, JSON.stringify({
        timestamp: Date.now(),
        value
      }));
    } catch (error) {
      console.warn("Unable to cache data", error);
    }
  }

  function getCache(key) {
    try {
      const raw = localStorage.getItem(`vboattendance:${key}`);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return parsed?.value ?? null;
    } catch (error) {
      console.warn("Unable to read cache", error);
      return null;
    }
  }

  function showToast(title, message, tone = "success") {
    const toast = document.createElement("article");
    toast.className = `toast is-${tone}`;
    toast.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p>`;
    els.toastHost.appendChild(toast);
    window.setTimeout(() => {
      toast.remove();
    }, 3800);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function delay(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  async function runConcurrencyPool(items, limit, iterator) {
    const queue = [...items];
    const workerCount = Math.min(limit, items.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (item) {
          await iterator(item);
        }
      }
    });
    await Promise.all(workers);
  }

  function handleSilentError(error) {
    console.error(error);
  }

  window.loadEmployees = loadEmployees;
  window.loadEmployeeRoute = loadEmployeeRoute;
  window.updateLiveLocations = updateLiveLocations;
  window.drawEmployeeRoute = syncRouteForEmployee;
  window.addLiveMarker = addLiveMarker;
  window.calculateBounds = calculateBounds;
  window.setupAutoRefresh = setupAutoRefresh;

  init();
})();
