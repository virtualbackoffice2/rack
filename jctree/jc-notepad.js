(() => {
    const API_BASE_URL = "https://app.vbo.co.in";
    const DEFAULT_CLIENT = "MEROTRA";
    const WIRE_SIDE_STORAGE_KEY = "jc-notepad-wire-sides";
    const ROOT_PREVIOUS_JC = "OLT/RACK";
    const coreOptions = [
        "1,Blue",
        "2,Orange",
        "3,Green",
        "4,Brown",
        "5,Slate",
        "6,White",
        "7,Red",
        "8,Black",
        "9,Yellow",
        "10,Purple",
        "11,Pink",
        "12,Light Blue"
    ];
    const colorOptionsHtml = coreOptions.map((option) => `<option value="${option}">${option}</option>`).join("");

    const state = {
        context: null,
        root: null,
        selectedBox: null,
        selectedFiber: null,
        pendingJcCreation: null,
        pendingWireCreation: null,
        pendingCoreCreation: null,
        editingJcId: "",
        jcModalMode: "create",
        isLoading: false,
        location: null,
        allRows: [],
        rows: [],
        searchTerm: "",
        ponOptions: [],
        ponStats: {}
    };

    const elements = {};
    const ALL_WINDOWS = ["MEROTRA", "SUNNY"];

    function apiUrlFor(client, endpoint) {
        return `${API_BASE_URL}/${encodeURIComponent(client)}/${endpoint}`;
    }

    function requestJson(url, options) {
        return fetch(url, options).then(async (response) => {
            let payload = {};
            try {
                payload = await response.json();
            } catch (error) {
                payload = {};
            }
            if (!response.ok) {
                throw new Error(payload.detail || payload.message || `HTTP ${response.status}`);
            }
            return payload;
        });
    }

    function readWireSideMap() {
        try {
            const raw = window.localStorage.getItem(WIRE_SIDE_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    function getStoredWireSide(wuid) {
        if (!wuid) return "";
        const side = readWireSideMap()[String(wuid)];
        return side === "output" ? "output" : side === "input" ? "input" : "";
    }

    function storeWireSide(wuid, side) {
        if (!wuid || (side !== "input" && side !== "output")) return;
        try {
            const map = readWireSideMap();
            map[String(wuid)] = side;
            window.localStorage.setItem(WIRE_SIDE_STORAGE_KEY, JSON.stringify(map));
        } catch (error) {}
    }

    function clearStoredWireSide(wuid) {
        if (!wuid) return;
        try {
            const map = readWireSideMap();
            delete map[String(wuid)];
            window.localStorage.setItem(WIRE_SIDE_STORAGE_KEY, JSON.stringify(map));
        } catch (error) {}
    }

    function getDefaultWireData() {
        return {
            recordId: "",
            wireUuid: "",
            juid: "",
            jcName: "",
            windowName: "",
            oltName: "",
            ponNumber: "",
            side: "",
            wireType: "12 Core",
            wireDrum: "",
            liveCores: 0,
            remark: "",
            coreDetails: []
        };
    }

    function getDefaultJcData() {
        return {
            recordId: "",
            juid: "",
            jcName: "",
            previousJc: ROOT_PREVIOUS_JC,
            lat: null,
            lng: null,
            otdrDistance: "",
            remark: "",
            window: "",
            timestamp: "",
            inputWires: [],
            outputWires: []
        };
    }

    function getDefaultCoreData() {
        return {
            cuid: "",
            wuid: "",
            juid: "",
            coreColorAndNumber: "",
            oltpon: "",
            power: "",
            remark: ""
        };
    }

    function createShell() {
        elements.mount.innerHTML = `
            <div class="jc-note-root">
                <div class="controls">
                    <button id="jcAddBoxBtn" type="button">Add JC</button>
                    <button id="jcDeleteBoxBtn" type="button">Delete JC</button>
                    <input id="jcSearchInput" type="search" placeholder="Search JC, OTDR, After JC, Area...">
                </div>
                <div class="row" id="jcRow"></div>
                <div class="jc-note-inner-modal" id="jcJcModal">
                    <div class="modal-card">
                        <div class="modal-head">
                            <div>
                                <h2 id="jcModalInnerTitle">JC Details</h2>
                                <div class="modal-sub" id="jcModalInnerSub"></div>
                            </div>
                            <button class="close-btn" id="jcCloseModalBtn">Close</button>
                        </div>
                        <div class="form-grid">
                            <div class="field full">
                                <input id="jcNameField" type="text" placeholder="JC Name" required>
                            </div>
                            <div class="field full">
                                <select id="jcModalWindowName" required>
                                    <option value="">Select Window</option>
                                    <option value="MEROTRA">Merotra</option>
                                    <option value="SUNNY">Sunny</option>
                                </select>
                            </div>
                            <div class="field full">
                                <select id="jcPreviousJcField" required>
                                    <option value="">Select Previous JC</option>
                                </select>
                            </div>
                            <div class="field">
                                <input id="jcOtdrField" type="text" placeholder="OTDR Distance">
                            </div>
                            <div class="field">
                                <input id="jcRemarkField" type="text" placeholder="Remark">
                            </div>
                            <div class="field" id="jcLocationModeWrap">
                                <select id="jcLocationMode">
                                    <option value="auto">Auto Location</option>
                                    <option value="manual">Manual Location</option>
                                </select>
                            </div>
                            <div class="field" id="jcManualLatWrap">
                                <input id="jcManualLat" type="text" placeholder="Latitude">
                            </div>
                            <div class="field" id="jcManualLngWrap">
                                <input id="jcManualLng" type="text" placeholder="Longitude">
                            </div>
                        </div>
                        <div class="modal-actions">
                            <button class="close-btn" id="jcCancelModalBtn">Cancel</button>
                            <button class="save-btn" id="jcSaveJcBtn">Create JC</button>
                        </div>
                    </div>
                </div>
                <div class="jc-note-inner-modal" id="jcWireModal">
                    <div class="modal-card">
                        <div class="modal-head">
                            <div>
                                <h2 id="jcWireModalTitle">Wire Details</h2>
                                <div class="modal-sub" id="jcWireModalSub"></div>
                            </div>
                            <button class="close-btn" id="jcCloseWireModalBtn">Close</button>
                        </div>
                        <div class="form-grid">
                            <div class="field full hidden" id="jcWireJuidFieldWrap">
                                <input id="jcWireJuid" type="text" placeholder="JC ID" readonly>
                            </div>
                            <div class="field">
                                <select id="jcWireType" required>
                                    <option value="" disabled selected>Wire Type</option>
                                    <option value="1 Core">1 Core</option>
                                    <option value="2 Core">2 Core</option>
                                    <option value="4 Core">4 Core</option>
                                    <option value="12 Core">12 Core</option>
                                    <option value="24 Core">24 Core</option>
                                    <option value="48 Core">48 Core</option>
                                    <option value="98 Core">98 Core</option>
                                </select>
                            </div>
                            <div class="field full">
                                <input id="jcWireDrum" type="text" placeholder="Wire Drum No / Name">
                            </div>
                            <div class="field">
                                <select id="jcLiveCoresCount" required></select>
                                <div class="field-error" id="jcLiveCoreError"></div>
                            </div>
                        </div>
                        <div class="cores-wrap">
                            <div class="cores-title">
                                <h3>Live Core Details</h3>
                            </div>
                            <div class="core-list" id="jcCoreList"></div>
                        </div>
                        <div class="modal-actions">
                            <button class="close-btn danger-btn" id="jcDeleteWireBtn">Delete Wire</button>
                            <button class="close-btn" id="jcCancelWireModalBtn">Cancel</button>
                            <button class="save-btn" id="jcSaveWireBtn">Save Wire</button>
                        </div>
                    </div>
                </div>
                <div class="jc-note-inner-modal" id="jcCoreModal">
                    <div class="modal-card">
                        <div class="modal-head">
                            <div>
                                <h2 id="jcCoreModalTitle">Core Details</h2>
                                <div class="modal-sub" id="jcCoreModalSub"></div>
                            </div>
                            <button class="close-btn" id="jcCloseCoreModalBtn">Close</button>
                        </div>
                        <div class="form-grid">
                            <div class="field full">
                                <select id="jcCoreColor" required>
                                    <option value="" disabled selected>Core Color and Number</option>
                                    ${colorOptionsHtml}
                                </select>
                            </div>
                            <div class="field full" id="jcCoreTubeWrap">
                                <select id="jcCoreTube">
                                    <option value="" disabled selected>Tube</option>
                                    ${colorOptionsHtml}
                                </select>
                            </div>
                            <div class="field">
                                <select id="jcCoreOltpon" required>
                                    <option value="" disabled selected>Select OLT PON</option>
                                </select>
                            </div>
                            <div class="field">
                                <input id="jcCorePower" type="text" placeholder="Power">
                            </div>
                            <div class="field full">
                                <input id="jcCoreRemark" type="text" placeholder="Area">
                            </div>
                        </div>
                        <div class="modal-actions">
                            <button class="close-btn danger-btn" id="jcDeleteCoreBtn">Delete Core</button>
                            <button class="close-btn" id="jcCancelCoreModalBtn">Cancel</button>
                            <button class="save-btn" id="jcSaveCoreBtn">Save Core</button>
                        </div>
                    </div>
                </div>
                <div class="jc-note-inner-modal" id="jcConfirmModal">
                    <div class="modal-card jc-confirm-card">
                        <div class="modal-head">
                            <div>
                                <h2 id="jcConfirmTitle">Confirm</h2>
                                <div class="modal-sub" id="jcConfirmMessage"></div>
                            </div>
                        </div>
                        <div class="modal-actions">
                            <button class="close-btn" id="jcConfirmCancelBtn">Cancel</button>
                            <button class="close-btn danger-btn confirm" id="jcConfirmOkBtn">Delete</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        state.root = elements.mount.querySelector(".jc-note-root");
        elements.row = state.root.querySelector("#jcRow");
        elements.searchInput = state.root.querySelector("#jcSearchInput");
        
        // JC Modal
        elements.jcModal = state.root.querySelector("#jcJcModal");
        elements.jcModalSub = state.root.querySelector("#jcModalInnerSub");
        elements.jcNameField = state.root.querySelector("#jcNameField");
        elements.jcModalWindowName = state.root.querySelector("#jcModalWindowName");
        elements.jcPreviousJcField = state.root.querySelector("#jcPreviousJcField");
        elements.jcOtdrField = state.root.querySelector("#jcOtdrField");
        elements.jcRemarkField = state.root.querySelector("#jcRemarkField");
        elements.locationMode = state.root.querySelector("#jcLocationMode");
        elements.manualLatWrap = state.root.querySelector("#jcManualLatWrap");
        elements.manualLngWrap = state.root.querySelector("#jcManualLngWrap");
        elements.manualLat = state.root.querySelector("#jcManualLat");
        elements.manualLng = state.root.querySelector("#jcManualLng");
        elements.saveJcBtn = state.root.querySelector("#jcSaveJcBtn");
        elements.closeModalBtn = state.root.querySelector("#jcCloseModalBtn");
        elements.cancelModalBtn = state.root.querySelector("#jcCancelModalBtn");
        
        // Wire Modal
        elements.wireModal = state.root.querySelector("#jcWireModal");
        elements.wireModalTitle = state.root.querySelector("#jcWireModalTitle");
        elements.wireModalSub = state.root.querySelector("#jcWireModalSub");
        elements.jcWireJuid = state.root.querySelector("#jcWireJuid");
        elements.wireTypeSelect = state.root.querySelector("#jcWireType");
        elements.wireDrum = state.root.querySelector("#jcWireDrum");
        elements.liveCoresCountSelect = state.root.querySelector("#jcLiveCoresCount");
        elements.liveCoreError = state.root.querySelector("#jcLiveCoreError");
        elements.coreList = state.root.querySelector("#jcCoreList");
        elements.saveWireBtn = state.root.querySelector("#jcSaveWireBtn");
        elements.deleteWireBtn = state.root.querySelector("#jcDeleteWireBtn");
        elements.closeWireModalBtn = state.root.querySelector("#jcCloseWireModalBtn");
        elements.cancelWireModalBtn = state.root.querySelector("#jcCancelWireModalBtn");
        
        // Core Modal
        elements.coreModal = state.root.querySelector("#jcCoreModal");
        elements.coreModalTitle = state.root.querySelector("#jcCoreModalTitle");
        elements.coreModalSub = state.root.querySelector("#jcCoreModalSub");
        elements.coreColor = state.root.querySelector("#jcCoreColor");
        elements.coreTubeWrap = state.root.querySelector("#jcCoreTubeWrap");
        elements.coreTube = state.root.querySelector("#jcCoreTube");
        elements.coreOltpon = state.root.querySelector("#jcCoreOltpon");
        elements.corePower = state.root.querySelector("#jcCorePower");
        elements.coreRemark = state.root.querySelector("#jcCoreRemark");
        elements.saveCoreBtn = state.root.querySelector("#jcSaveCoreBtn");
        elements.deleteCoreBtn = state.root.querySelector("#jcDeleteCoreBtn");
        elements.closeCoreModalBtn = state.root.querySelector("#jcCloseCoreModalBtn");
        elements.cancelCoreModalBtn = state.root.querySelector("#jcCancelCoreModalBtn");
        
        // Confirm Modal
        elements.confirmModal = state.root.querySelector("#jcConfirmModal");
        elements.confirmTitle = state.root.querySelector("#jcConfirmTitle");
        elements.confirmMessage = state.root.querySelector("#jcConfirmMessage");
        elements.confirmCancelBtn = state.root.querySelector("#jcConfirmCancelBtn");
        elements.confirmOkBtn = state.root.querySelector("#jcConfirmOkBtn");
        
        elements.addBoxBtn = state.root.querySelector("#jcAddBoxBtn");
        elements.deleteBoxBtn = state.root.querySelector("#jcDeleteBoxBtn");
    }

    function setBusy(isBusy) {
        state.isLoading = isBusy;
        if (elements.mount) {
            elements.mount.style.pointerEvents = isBusy ? "none" : "";
            elements.mount.style.opacity = isBusy ? "0.7" : "";
        }
    }

    function getActiveClient() {
        return DEFAULT_CLIENT;
    }

    function showError(error) {
        const message = error instanceof Error ? error.message : String(error || "Request failed");
        window.alert(message);
    }

    function parseCoordinate(value) {
        if (value === null || value === undefined || String(value).trim() === "") return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function getJcDisplayName(data) {
        const name = String((data && data.jcName) || "JC").trim() || "JC";
        const otdrDistance = String((data && data.otdrDistance) || "").trim();
        return otdrDistance ? `${name} (${otdrDistance})` : name;
    }

    function normalizePonValue(value) {
        return String(value || "").trim().toUpperCase();
    }

    function createPonOptionsHtml(selectedValue) {
        const normalizedSelected = normalizePonValue(selectedValue);
        const options = state.ponOptions.slice();
        if (normalizedSelected && !options.includes(normalizedSelected)) {
            options.unshift(normalizedSelected);
        }
        return createSelectOptionsHtml(options, "Select OLT PON", normalizedSelected);
    }

    function getPonStatsForValue(ponValue) {
        const key = normalizePonValue(ponValue);
        return key ? state.ponStats[key] || null : null;
    }

    function getPonHealthMeta(ponValue) {
        const stats = getPonStatsForValue(ponValue);
        if (!stats || !stats.activeUsers) {
            return { level: "gray", label: "No Data", percentage: null, onlineUsers: 0, activeUsers: 0 };
        }
        const percentage = Math.round((stats.onlineUsers / stats.activeUsers) * 100);
        const label = `${percentage}% ${stats.activeUsers}/${stats.onlineUsers}`;
        if (percentage > 90) {
            return { level: "green", label, percentage, onlineUsers: stats.onlineUsers, activeUsers: stats.activeUsers };
        }
        if (percentage >= 20) {
            return { level: "orange", label, percentage, onlineUsers: stats.onlineUsers, activeUsers: stats.activeUsers };
        }
        return { level: "red", label, percentage, onlineUsers: stats.onlineUsers, activeUsers: stats.activeUsers };
    }

    function getJcHealthMeta(boxData) {
        const ponSet = new Set();
        const wires = [...(boxData.inputWires || []), ...(boxData.outputWires || [])];
        wires.forEach((wire) => {
            (wire.coreDetails || []).forEach((core) => {
                const ponValue = normalizePonValue(core.oltpon);
                if (ponValue) ponSet.add(ponValue);
            });
        });

        let activeUsers = 0;
        let onlineUsers = 0;
        Array.from(ponSet).forEach((pon) => {
            const stats = getPonStatsForValue(pon);
            if (!stats) return;
            activeUsers += Number(stats.activeUsers || 0);
            onlineUsers += Number(stats.onlineUsers || 0);
        });

        if (!activeUsers) {
            return { level: "gray", label: "No Data", percentage: null, onlineUsers: 0, activeUsers: 0 };
        }

        const percentage = Math.round((onlineUsers / activeUsers) * 100);
        const label = `${percentage}% ${activeUsers}/${onlineUsers}`;
        if (percentage > 90) {
            return { level: "green", label, percentage, onlineUsers, activeUsers };
        }
        if (percentage >= 20) {
            return { level: "orange", label, percentage, onlineUsers, activeUsers };
        }
        return { level: "red", label, percentage, onlineUsers, activeUsers };
    }

    function getJcAlertLevel(boxData) {
        const ponSet = new Set();
        const wires = [...(boxData.inputWires || []), ...(boxData.outputWires || [])];
        wires.forEach((wire) => {
            (wire.coreDetails || []).forEach((core) => {
                const ponValue = normalizePonValue(core.oltpon);
                if (ponValue) ponSet.add(ponValue);
            });
        });
        const ponLevels = Array.from(ponSet)
            .map((pon) => getPonHealthMeta(pon).level)
            .filter((level) => level !== "gray");
        if (!ponLevels.length) return "";
        if (ponLevels.every((level) => level === "red")) return "danger";
        if (ponLevels.some((level) => level === "red")) return "warning";
        return "";
    }

    async function fetchWindowPonStats(windowName) {
        const normalizedWindow = String(windowName || "").trim().toUpperCase();
        if (!normalizedWindow) {
            state.ponOptions = [];
            state.ponStats = {};
            return;
        }
        const users = [];
        let page = 1;
        let totalPages = 1;
        while (page <= totalPages) {
            const response = await requestJson(`${apiUrlFor(normalizedWindow, "userinfo")}?page=${page}&page_size=500`);
            totalPages = Number(response && response.pagination && response.pagination.total_pages) || 0;
            if (Array.isArray(response && response.users)) {
                users.push(...response.users);
            }
            if (!totalPages) break;
            page += 1;
        }

        const ponStats = {};
        users.forEach((item) => {
            const userdb = item && item.userdb ? item.userdb : {};
            const netsense = item && item.netsense ? item.netsense : {};
            const serviceStatus = String(userdb.service_status || "").trim().toLowerCase();
            const ponValue = normalizePonValue(netsense.pon_number);
            if (serviceStatus !== "active" || !ponValue) return;
            if (!ponStats[ponValue]) {
                ponStats[ponValue] = { pon: ponValue, activeUsers: 0, onlineUsers: 0 };
            }
            ponStats[ponValue].activeUsers += 1;
            if (String(netsense.status || "").trim().toUpperCase() === "UP") {
                ponStats[ponValue].onlineUsers += 1;
            }
        });

        state.ponStats = ponStats;
        state.ponOptions = Object.keys(ponStats).sort((left, right) => left.localeCompare(right));
    }

    function flattenJcNodes(nodes, result = []) {
        (nodes || []).forEach((node) => {
            result.push(node);
            if (node && Array.isArray(node.children) && node.children.length) {
                flattenJcNodes(node.children, result);
            }
        });
        return result;
    }

    function buildPreviousJcOptions(windowName) {
        const normalizedWindow = String(windowName || "").trim().toUpperCase();
        const options = [{ value: ROOT_PREVIOUS_JC, label: ROOT_PREVIOUS_JC }];
        flattenJcNodes(state.allRows && state.allRows.length ? state.allRows : state.rows)
            .filter((row) => String(row.window || "").trim().toUpperCase() === normalizedWindow)
            .sort((left, right) => (left.jcName || "").localeCompare(right.jcName || ""))
            .forEach((row) => {
                options.push({ value: row.jcName, label: row.jcName });
            });
        return options;
    }

    function normalizeSearchValue(value) {
        return String(value || "").trim().toLowerCase();
    }

    function getWireSearchText(wire) {
        return [
            wire && wire.wireType,
            wire && wire.wireDrum,
            wire && wire.remark,
            wire && wire.otdrDistance,
            wire && wire.liveCores
        ].join(" ");
    }

    function getCoreSearchText(core) {
        return [
            core && core.coreColor,
            core && core.coreColorAndNumber,
            core && core.tube,
            core && core.oltpon,
            core && core.power,
            core && core.remark
        ].join(" ");
    }

    function getNodeSearchText(node) {
        const wireText = [...(node.inputWires || []), ...(node.outputWires || [])]
            .map((wire) => [getWireSearchText(wire), ...(wire.coreDetails || []).map(getCoreSearchText)].join(" "))
            .join(" ");
        return normalizeSearchValue([
            node && node.jcName,
            node && node.previousJc,
            node && node.otdrDistance,
            node && node.remark,
            node && node.window,
            node && node.timestamp,
            wireText
        ].join(" "));
    }

    function filterTreeNodes(nodes, term) {
        if (!term) return nodes || [];
        return (nodes || []).reduce((result, node) => {
            const childMatches = filterTreeNodes(node.children || [], term);
            if (getNodeSearchText(node).includes(term) || childMatches.length) {
                result.push(Object.assign({}, node, { children: childMatches }));
            }
            return result;
        }, []);
    }

    function syncPreviousJcOptions(selectedValue) {
        if (!elements.jcPreviousJcField) return;
        const options = buildPreviousJcOptions(elements.jcModalWindowName ? elements.jcModalWindowName.value : "");
        elements.jcPreviousJcField.innerHTML = '<option value="">Select Previous JC</option>';
        options.forEach((option) => {
            const element = document.createElement("option");
            element.value = option.value;
            element.textContent = option.label;
            elements.jcPreviousJcField.appendChild(element);
        });
        if (selectedValue && options.some((option) => option.value === selectedValue)) {
            elements.jcPreviousJcField.value = selectedValue;
        } else if (options.length === 1) {
            elements.jcPreviousJcField.value = ROOT_PREVIOUS_JC;
        }
    }

    function getCoreVisualStyle(coreColorValue) {
        const label = String(coreColorValue || "").split(",").pop().trim().toLowerCase();
        const palette = {
            blue: { background: "#2563eb", color: "#ffffff" },
            orange: { background: "#f97316", color: "#ffffff" },
            green: { background: "#16a34a", color: "#ffffff" },
            brown: { background: "#8b5e3c", color: "#ffffff" },
            slate: { background: "#64748b", color: "#ffffff" },
            white: { background: "#f8fafc", color: "#1f2937" },
            red: { background: "#dc2626", color: "#ffffff" },
            black: { background: "#111827", color: "#ffffff" },
            yellow: { background: "#facc15", color: "#1f2937" },
            purple: { background: "#7c3aed", color: "#ffffff" },
            pink: { background: "#ec4899", color: "#ffffff" },
            "light blue": { background: "#7dd3fc", color: "#0f172a" }
        };
        return palette[label] || { background: "#dbeafe", color: "#1e3a8a" };
    }

    function isRootJc(previousJc) {
        const normalized = String(previousJc || "").trim().toLowerCase();
        return normalized === "olt/rack" || normalized === "oltrrack";
    }

    function normalizeCoordinate(value) {
        return value === null || value === undefined || value === "" ? null : value;
    }

    function normalizeTreeNode(node) {
        const juid = String(node && (node.JUID || node.juid || node.id) || "");
        const rawChildren = Array.isArray(node && node.children) ? node.children : [];
        const inputWires = [];
        const outputWires = [];
        const jcChildren = [];

        rawChildren.forEach((child) => {
            const childType = String(child && child.type || "").trim().toLowerCase();
            if (childType === "wire" || child && (child.WUID || child.wiretype || child.drum)) {
                const wireId = String(child && (child.WUID || child.wuid || child.id) || "");
                const wireSide = getStoredWireSide(wireId) || "input";
                const cores = Array.isArray(child && child.children) ? child.children : Array.isArray(child && child.cores) ? child.cores : [];
                const coreDetails = cores
                    .filter((core) => {
                        const coreType = String(core && core.type || "").trim().toLowerCase();
                        return !coreType || coreType === "core";
                    })
                    .map((core) => ({
                        cuid: String(core && (core.CUID || core.cuid || core.id) || ""),
                        coreColor: core && (core.corecolorandnumber || core.coreColorAndNumber || core.coreColor) ? String(core.corecolorandnumber || core.coreColorAndNumber || core.coreColor) : "",
                        tube: core && core.tube ? String(core.tube) : "",
                        oltpon: core && core.oltpon ? String(core.oltpon) : "",
                        power: core && core.power ? String(core.power) : "",
                        remark: core && core.remark ? String(core.remark) : ""
                    }));
                const liveCoreCount = Math.max(Number(child && child.livecores || 0), coreDetails.length);
                const wireData = {
                    recordId: wireId,
                    wireUuid: wireId,
                    juid: juid,
                    jcName: node && node.jcname ? String(node.jcname) : "",
                    side: wireSide,
                    wireType: child && child.wiretype ? String(child.wiretype) : "12 Core",
                    wireDrum: child && child.drum ? String(child.drum) : "",
                    remark: child && child.remark ? String(child.remark) : "",
                    liveCores: liveCoreCount,
                    coreDetails: coreDetails
                };
                if (wireSide === "output") {
                    outputWires.push(wireData);
                } else {
                    inputWires.push(wireData);
                }
                return;
            }

            if (!childType || childType === "jc" || child && child.jcname) {
                jcChildren.push(normalizeTreeNode(child));
            }
        });

        return {
            recordId: juid,
            juid: juid,
            jcName: node && node.jcname ? String(node.jcname) : "",
            previousJc: node && node.previousjc ? String(node.previousjc) : ROOT_PREVIOUS_JC,
            lat: normalizeCoordinate(node ? node.lat : null),
            lng: normalizeCoordinate(node ? node.lng : null),
            otdrDistance: node && node.otdr ? String(node.otdr) : "",
            remark: node && node.remark ? String(node.remark) : "",
            window: node && node.window ? String(node.window) : "",
            timestamp: node && node.timestamp ? String(node.timestamp) : "",
            inputWires: inputWires,
            outputWires: outputWires,
            children: jcChildren
        };
    }

    function buildJcTree(jcs) {
        const jcMap = new Map();
        jcs.forEach(jc => {
            jcMap.set(jc.jcName, { ...jc, children: [] });
        });

        const roots = [];

        jcs.forEach(jc => {
            const parentName = String(jc.previousJc || "").trim() || ROOT_PREVIOUS_JC;
            const current = jcMap.get(jc.jcName);

            if (isRootJc(parentName)) {
                roots.push(current);
            } else if (jcMap.has(parentName)) {
                jcMap.get(parentName).children.push(current);
            } else {
                roots.push(current);
            }
        });

        roots.sort((a, b) => a.jcName.localeCompare(b.jcName));
        jcMap.forEach(jc => {
            jc.children.sort((a, b) => a.jcName.localeCompare(b.jcName));
        });

        return roots;
    }

    function createOfficeNode() {
        const office = document.createElement("div");
        office.className = "olt";
        office.textContent = `${ROOT_PREVIOUS_JC}${state.context && state.context.windowName ? ` (${state.context.windowName})` : ""}`;
        return office;
    }

    function applyBranchConnector(branch) {
        if (!branch) return;
        const line = branch.firstElementChild;
        if (!line) return;
        const wrapper = line.querySelector(":scope > .jc-wrapper");
        if (!wrapper) return;

        const link = wrapper.querySelector(".jc-link");
        const wire = link ? link.querySelector(".wire") : null;
        if (!link || !wire) return;

        wrapper.classList.remove("jc-inline-connector");

        if (wire.classList.contains("wire")) {
            wrapper.classList.add("jc-inline-connector");
        }
    }

    function syncLocationMode() {
        const isManual = elements.locationMode && elements.locationMode.value === "manual";
        if (elements.manualLatWrap) elements.manualLatWrap.classList.toggle("hidden", !isManual);
        if (elements.manualLngWrap) elements.manualLngWrap.classList.toggle("hidden", !isManual);
    }

    function getModalLocation() {
        const isManual = elements.locationMode && elements.locationMode.value === "manual";
        if (isManual) {
            const manualLat = parseCoordinate(elements.manualLat ? elements.manualLat.value : "");
            const manualLng = parseCoordinate(elements.manualLng ? elements.manualLng.value : "");
            return { lat: manualLat, lng: manualLng };
        }
        if (state.location) {
            return { lat: state.location.lat, lng: state.location.lng };
        }
        return { lat: null, lng: null };
    }

    function getWindowFilterValue() {
        if (!state.context) return "";
        return String(state.context.windowName || "").trim().toUpperCase();
    }

    function getWindowQueryValue(windowName) {
        const normalized = String(windowName || "").trim().toUpperCase();
        return normalized;
    }

    function askConfirm(title, message) {
        return new Promise((resolve) => {
            elements.confirmTitle.textContent = title;
            elements.confirmMessage.textContent = message;
            elements.confirmModal.classList.add("show");
            elements.confirmCancelBtn.style.display = "";
            elements.confirmOkBtn.textContent = "Delete";

            const handleCancel = () => {
                cleanup();
                resolve(false);
            };

            const handleOk = () => {
                cleanup();
                resolve(true);
            };

            const handleBackdrop = (event) => {
                if (event.target === elements.confirmModal) {
                    handleCancel();
                }
            };

            function cleanup() {
                elements.confirmModal.classList.remove("show");
                elements.confirmCancelBtn.removeEventListener("click", handleCancel);
                elements.confirmOkBtn.removeEventListener("click", handleOk);
                elements.confirmModal.removeEventListener("click", handleBackdrop);
            }

            elements.confirmCancelBtn.addEventListener("click", handleCancel);
            elements.confirmOkBtn.addEventListener("click", handleOk);
            elements.confirmModal.addEventListener("click", handleBackdrop);
        });
    }

    function showNotice(title, message) {
        return new Promise((resolve) => {
            elements.confirmTitle.textContent = title;
            elements.confirmMessage.textContent = message;
            elements.confirmMessage.classList.remove("core-info-grid");
            elements.confirmModal.classList.add("show");
            elements.confirmCancelBtn.style.display = "none";
            elements.confirmOkBtn.textContent = "OK";

            const handleOk = () => {
                cleanup();
                resolve();
            };

            const handleBackdrop = (event) => {
                if (event.target === elements.confirmModal) {
                    handleOk();
                }
            };

            function cleanup() {
                elements.confirmModal.classList.remove("show");
                elements.confirmCancelBtn.style.display = "";
                elements.confirmOkBtn.textContent = "Delete";
                elements.confirmOkBtn.removeEventListener("click", handleOk);
                elements.confirmModal.removeEventListener("click", handleBackdrop);
            }

            elements.confirmOkBtn.addEventListener("click", handleOk);
            elements.confirmModal.addEventListener("click", handleBackdrop);
        });
    }

    function hasSavedWireSelection() {
        return Boolean(state.selectedFiber && state.selectedFiber.dataset.wireUuid);
    }

    async function showSaveWireFirstNotice() {
        await showNotice("Save Wire", "Please save wire to add cores!");
    }

    function showCoreDetails(coreData) {
        return new Promise((resolve) => {
            elements.confirmTitle.textContent = "Core Details";
            elements.confirmMessage.classList.add("core-info-grid");
            elements.confirmMessage.innerHTML = `
                <div class="core-info-item">
                    <span class="core-info-label">Color</span>
                    <strong>${coreData.coreColor || "-"}</strong>
                </div>
                <div class="core-info-item">
                    <span class="core-info-label">Tube</span>
                    <strong>${coreData.tube || "-"}</strong>
                </div>
                <div class="core-info-item">
                    <span class="core-info-label">OLT PON</span>
                    <strong>${coreData.oltpon || "-"}</strong>
                </div>
                <div class="core-info-item">
                    <span class="core-info-label">PON Status</span>
                    <strong>${getPonHealthMeta(coreData.oltpon).label}</strong>
                </div>
                <div class="core-info-item">
                    <span class="core-info-label">Power</span>
                    <strong>${coreData.power || "-"}</strong>
                </div>
                <div class="core-info-item core-info-item-full">
                    <span class="core-info-label">Remark</span>
                    <strong>${coreData.remark || "-"}</strong>
                </div>
            `;
            elements.confirmModal.classList.add("show");
            elements.confirmCancelBtn.style.display = "none";
            elements.confirmOkBtn.textContent = "Close";

            const handleOk = () => {
                cleanup();
                resolve();
            };

            const handleBackdrop = (event) => {
                if (event.target === elements.confirmModal) {
                    handleOk();
                }
            };

            function cleanup() {
                elements.confirmModal.classList.remove("show");
                elements.confirmMessage.classList.remove("core-info-grid");
                elements.confirmMessage.textContent = "";
                elements.confirmCancelBtn.style.display = "";
                elements.confirmOkBtn.textContent = "Delete";
                elements.confirmOkBtn.removeEventListener("click", handleOk);
                elements.confirmModal.removeEventListener("click", handleBackdrop);
            }

            elements.confirmOkBtn.addEventListener("click", handleOk);
            elements.confirmModal.addEventListener("click", handleBackdrop);
        });
    }

    function setBoxEditMode(container, enabled) {
        if (!container) return;
        container.dataset.editMode = "true";
        const wrapper = container.closest(".jc-wrapper");
        const toggleBtn = wrapper ? wrapper.querySelector(".jc-edit-toggle") : null;
        if (toggleBtn) toggleBtn.style.display = "none";
        container.querySelectorAll(".panel .add").forEach((button) => {
            button.disabled = false;
            button.style.opacity = "1";
        });
    }

    function closeBox(container) {
        container.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("show"));
        container.querySelectorAll(".left,.right").forEach((side) => side.classList.remove("open"));
    }

    function toggle(container, side) {
        const sideEl = container.querySelector("." + side);
        const panel = container.querySelector(".panel-" + side);
        sideEl.classList.toggle("open");
        panel.classList.toggle("show");
    }

    function getWireTypeCoreCount() {
        return parseInt(elements.wireTypeSelect.value, 10) || 12;
    }

    function syncLiveCoreLimit() {
        const maxCores = getWireTypeCoreCount();
        const currentValue = Math.min(Number(elements.liveCoresCountSelect.value) || 0, maxCores);
        elements.liveCoresCountSelect.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select live cores";
        placeholder.disabled = true;
        elements.liveCoresCountSelect.appendChild(placeholder);
        for (let i = 0; i <= maxCores; i++) {
            const opt = document.createElement("option");
            opt.value = i;
            opt.textContent = i;
            elements.liveCoresCountSelect.appendChild(opt);
        }
        elements.liveCoresCountSelect.value = currentValue > 0 ? String(currentValue) : "";
        elements.liveCoreError.textContent = "";
    }

    function getCurrentCoreDataFromForm() {
        return Array.from(elements.coreList.querySelectorAll(".core-card")).map((card) => {
            let meta = {};
            try {
                meta = JSON.parse(card.dataset.coreMeta || "{}");
            } catch (error) {
                meta = {};
            }
            return {
                cuid: meta.cuid || "",
                coreColor: card.querySelector(".core-color") ? card.querySelector(".core-color").value : "",
                tube: card.querySelector(".core-tube") ? card.querySelector(".core-tube").value : (meta.tube || ""),
                oltpon: card.querySelector(".core-pon") ? card.querySelector(".core-pon").value : (meta.oltpon || ""),
                power: card.querySelector(".core-power") ? card.querySelector(".core-power").value : "",
                remark: card.querySelector(".core-remark") ? card.querySelector(".core-remark").value : ""
            };
        });
    }

    function getCoreCardData(card) {
        let meta = {};
        try {
            meta = JSON.parse(card.dataset.coreMeta || "{}");
        } catch (error) {
            meta = {};
        }
        return {
            cuid: meta.cuid || "",
            coreColorAndNumber: card.querySelector(".core-color") ? String(card.querySelector(".core-color").value || "").trim() : "",
            tube: card.querySelector(".core-tube") ? String(card.querySelector(".core-tube").value || "").trim() : (meta.tube || ""),
            oltpon: card.querySelector(".core-pon") ? String(card.querySelector(".core-pon").value || "").trim() : (meta.oltpon || ""),
            power: card.querySelector(".core-power") ? String(card.querySelector(".core-power").value || "").trim() : "",
            remark: card.querySelector(".core-remark") ? String(card.querySelector(".core-remark").value || "").trim() : ""
        };
    }

    function createSelectOptionsHtml(options, placeholder, selectedValue) {
        const placeholderOption = `<option value="" disabled ${selectedValue ? "" : "selected"}>${placeholder}</option>`;
        const optionHtml = options.map((option) => `<option value="${option}" ${option === selectedValue ? "selected" : ""}>${option}</option>`).join("");
        return `${placeholderOption}${optionHtml}`;
    }

    function getCoreFormRows() {
        return Array.from(elements.coreList.querySelectorAll(".core-card"));
    }

    function collectExistingCoreSelections(excludeCard) {
        return getCoreFormRows()
            .filter((card) => card !== excludeCard)
            .map((card) => getCoreCardData(card));
    }

    function getAllowedCoreOptions(card, selectedTube) {
        const needsTube = getWireTypeCoreCount() > 12;
        const currentData = getCoreCardData(card);
        const otherSelections = collectExistingCoreSelections(card);

        if (!needsTube) {
            const usedColors = new Set(otherSelections.map((item) => item.coreColorAndNumber).filter(Boolean));
            return coreOptions.filter((option) => option === currentData.coreColorAndNumber || !usedColors.has(option));
        }

        const activeTube = selectedTube || currentData.tube || "";
        if (!activeTube) return coreOptions.slice();

        const usedColorsInTube = new Set(
            otherSelections
                .filter((item) => item.tube === activeTube)
                .map((item) => item.coreColorAndNumber)
                .filter(Boolean)
        );
        return coreOptions.filter((option) => option === currentData.coreColorAndNumber || !usedColorsInTube.has(option));
    }

    function refreshCoreCardOptions(card) {
        const currentData = getCoreCardData(card);
        const colorField = card.querySelector(".core-color");
        const tubeField = card.querySelector(".core-tube");
        if (!colorField) return;

        const allowedColors = getAllowedCoreOptions(card, tubeField ? tubeField.value : "");
        colorField.innerHTML = createSelectOptionsHtml(allowedColors, "Core Color and Number", currentData.coreColorAndNumber);
        if (currentData.coreColorAndNumber && allowedColors.includes(currentData.coreColorAndNumber)) {
            colorField.value = currentData.coreColorAndNumber;
        }

        if (tubeField) {
            tubeField.innerHTML = createSelectOptionsHtml(coreOptions, "Tube", currentData.tube);
            if (currentData.tube) {
                tubeField.value = currentData.tube;
            }
        }
    }

    function refreshAllCoreCardOptions() {
        getCoreFormRows().forEach((card) => refreshCoreCardOptions(card));
    }

    async function validateInlineCoreSelection(card) {
        const needsTube = getWireTypeCoreCount() > 12;
        const coreData = getCoreCardData(card);
        if (!coreData.coreColorAndNumber) {
            await showNotice("Save Core", "Select core color and number.");
            return false;
        }
        if (needsTube && !coreData.tube) {
            await showNotice("Save Core", "Select tube.");
            return false;
        }
        if (!coreData.oltpon) {
            await showNotice("Save Core", "Select OLT PON.");
            return false;
        }

        const otherSelections = collectExistingCoreSelections(card);
        const duplicate = otherSelections.some((item) => {
            if (!item.coreColorAndNumber) return false;
            if (!needsTube) {
                return item.coreColorAndNumber === coreData.coreColorAndNumber;
            }
            return item.tube === coreData.tube && item.coreColorAndNumber === coreData.coreColorAndNumber;
        });
        if (duplicate) {
            await showNotice("Save Core", needsTube ? "This core color is already used in the selected tube." : "This core color is already used in this wire.");
            return false;
        }
        return true;
    }

    async function saveInlineCore(card) {
        if (!state.selectedFiber || !state.selectedFiber.dataset.wireUuid || !state.selectedFiber.dataset.juid) {
            await showNotice("Save Core", "Open a saved wire first.");
            return false;
        }
        const coreData = getCoreCardData(card);
        if (!await validateInlineCoreSelection(card)) {
            return false;
        }

        try {
            setBusy(true);
            const nextLiveCoreCount = Number(elements.liveCoresCountSelect.value) || 0;
            await updateWire(state.selectedFiber.dataset.wireUuid, {
                drum: state.selectedFiber.dataset.wireDrum || "",
                wiretype: state.selectedFiber.dataset.wireType || "12 Core",
                livecores: nextLiveCoreCount,
                remark: state.selectedFiber.dataset.remark || ""
            });
            await createCore({
                wuid: state.selectedFiber.dataset.wireUuid,
                juid: state.selectedFiber.dataset.juid,
                corecolorandnumber: coreData.coreColorAndNumber,
                tube: coreData.tube,
                oltpon: coreData.oltpon,
                power: coreData.power,
                remark: coreData.remark
            });
            await refreshAndReopenWireModal(
                state.selectedFiber.dataset.wireUuid || "",
                state.selectedFiber.dataset.side || "",
                state.selectedFiber.dataset.juid || ""
            );
            return true;
        } catch (error) {
            showError(error);
            return false;
        } finally {
            setBusy(false);
        }
    }

    function buildCoreFields(count, coreData) {
        elements.coreList.innerHTML = "";
        const needsTube = getWireTypeCoreCount() > 12;
        for (let i = 1; i <= count; i++) {
            const currentCore = (coreData && coreData[i - 1]) || {};
            const hasSavedCore = Boolean(currentCore.cuid);
            const hasCoreValue = Boolean(currentCore.coreColor || currentCore.coreColorAndNumber);
            const healthMeta = getPonHealthMeta(currentCore.oltpon);
            const card = document.createElement("div");
            card.className = "core-card";
            card.dataset.coreMeta = JSON.stringify({
                cuid: currentCore.cuid || "",
                tube: currentCore.tube || "",
                oltpon: currentCore.oltpon || ""
            });
            card.innerHTML = `
                <div class="title-row">
                    <div class="core-title-left">
                        <span class="core-led ${healthMeta.level}" title="${healthMeta.label}"></span>
                        <h4>Live Core ${i}</h4>
                        <span class="core-led-label">${healthMeta.label}</span>
                    </div>
                    <div class="panel-controls">
                        <button type="button" class="delete-core">${hasSavedCore ? "Delete" : "Clear"}</button>
                        <button type="button" class="edit-core">${hasSavedCore ? "Edit" : "Save"}</button>
                    </div>
                </div>
                <div class="core-grid" style="grid-template-columns:${needsTube ? "repeat(5,minmax(0,1fr))" : "repeat(4,minmax(0,1fr))"};">
                    <div class="field">
                        <select class="core-color" ${hasSavedCore ? "disabled" : ""}>
                            <option value="" disabled selected>Core Color and Number</option>
                            ${colorOptionsHtml}
                        </select>
                    </div>
                    ${needsTube ? `<div class="field"><select class="core-tube" ${hasSavedCore ? "disabled" : ""}><option value="" disabled selected>Tube</option>${colorOptionsHtml}</select></div>` : ""}
                    <div class="field">
                        <select class="core-pon" ${hasSavedCore ? "disabled" : ""}>
                            ${createPonOptionsHtml(currentCore.oltpon || "")}
                        </select>
                    </div>
                    <div class="field">
                        <input class="core-power" type="text" placeholder="Power" ${hasSavedCore ? "disabled" : ""}>
                    </div>
                    <div class="field">
                        <input class="core-remark" type="text" placeholder="Area" ${hasSavedCore ? "disabled" : ""}>
                    </div>
                </div>
            `;
            const colorField = card.querySelector(".core-color");
            const tubeField = card.querySelector(".core-tube");
            const ponField = card.querySelector(".core-pon");
            const powerField = card.querySelector(".core-power");
            const remarkField = card.querySelector(".core-remark");
            refreshCoreCardOptions(card);
            if (currentCore.coreColor) colorField.value = currentCore.coreColor;
            if (tubeField && currentCore.tube) tubeField.value = currentCore.tube;
            if (ponField && currentCore.oltpon) ponField.value = normalizePonValue(currentCore.oltpon);
            if (powerField) powerField.value = currentCore.power || "";
            if (remarkField) remarkField.value = currentCore.remark || "";
            const coreStyle = getCoreVisualStyle(currentCore.coreColor);
            card.style.background = coreStyle.background;
            card.style.color = coreStyle.color;
            card.style.borderColor = "rgba(15, 23, 42, 0.12)";
            card.querySelectorAll("h4, input, select").forEach((node) => {
                node.style.color = coreStyle.color;
            });
            card.querySelectorAll("input, select").forEach((node) => {
                node.style.borderColor = "rgba(255,255,255,0.35)";
                node.style.background = "rgba(255,255,255,0.16)";
            });
            card.querySelectorAll(".delete-core, .edit-core").forEach((button) => {
                button.style.background = "#111827";
                button.style.color = "#ffffff";
                button.style.border = "1px solid rgba(17, 24, 39, 0.9)";
            });
            
            card.querySelector(".delete-core").addEventListener("click", async (event) => {
                event.stopPropagation();
                const cuid = currentCore.cuid;
                if (cuid) {
                    const confirmed = await askConfirm("Delete Core", "Delete this core?");
                    if (confirmed) {
                        try {
                            setBusy(true);
                            const nextLiveCoreCount = Math.max((Number(elements.liveCoresCountSelect.value) || 0) - 1, 0);
                            await updateWire(state.selectedFiber.dataset.wireUuid, {
                                drum: state.selectedFiber.dataset.wireDrum || "",
                                wiretype: state.selectedFiber.dataset.wireType || "12 Core",
                                livecores: nextLiveCoreCount,
                                remark: state.selectedFiber.dataset.remark || ""
                            });
                            await requestJson(apiUrlFor(getActiveClient(), `core/${cuid}`), { method: "DELETE" });
                            await refreshAndReopenWireModal(state.selectedFiber ? state.selectedFiber.dataset.wireUuid : "", state.selectedFiber ? state.selectedFiber.dataset.side : "", state.selectedFiber ? state.selectedFiber.dataset.juid : "");
                        } catch (error) {
                            showError(error);
                        } finally {
                            setBusy(false);
                        }
                    }
                } else {
                    const nextData = getCurrentCoreDataFromForm();
                    nextData[i - 1] = { cuid: "", coreColor: "", tube: "", oltpon: "", power: "", remark: "" };
                    buildCoreFields(Number(elements.liveCoresCountSelect.value), nextData);
                }
            });
            
            card.querySelector(".edit-core").addEventListener("click", async (event) => {
                event.stopPropagation();
                if (!state.selectedFiber || !state.selectedFiber.dataset.wireUuid) {
                    await showNotice("Save Wire", "Save the wire first, then add or edit its core details.");
                    return;
                }
                if (!hasSavedCore) {
                    await saveInlineCore(card);
                    return;
                }
                openCoreModal(currentCore, i);
            });
            if (!hasSavedCore) {
                colorField?.addEventListener("change", () => refreshAllCoreCardOptions());
                tubeField?.addEventListener("change", () => refreshAllCoreCardOptions());
            }
            card.addEventListener("click", (event) => {
                if (event.target.closest("button, input, select, .field")) return;
                if (!hasSavedCore) return;
                showCoreDetails(currentCore);
            });
            
            elements.coreList.appendChild(card);
        }
        refreshAllCoreCardOptions();
    }

    function updateFiberLabel(line) {
        if (!line) return;
        const type = line.dataset.wireType || "12 Core";
        const live = line.dataset.liveCores || "0";
        const side = line.dataset.side || "input";
        const otdrDistance = line.dataset.otdrDistance || "";
        const label = line.querySelector(".fiber-label");
        if (label) {
            const parts = [type, `Live ${live}`];
            if (side === "input" && otdrDistance) parts.push(`OTDR ${otdrDistance}`);
            label.textContent = parts.join(" | ");
        }
    }

    function applyFiberData(line, data) {
        if (!line || !data) return;
        line.dataset.recordId = data.recordId || "";
        line.dataset.wireUuid = data.wireUuid || "";
        line.dataset.juid = data.juid || "";
        line.dataset.jcName = data.jcName || line.dataset.jcName || "";
        line.dataset.side = data.side || line.dataset.side || "";
        line.dataset.wireType = data.wireType || "12 Core";
        line.dataset.otdrDistance = data.otdrDistance || "";
        line.dataset.wireDrum = data.wireDrum || "";
        line.dataset.remark = data.remark || "";
        line.dataset.liveCores = String(Number(data.liveCores) || 0);
        line.dataset.coreDetails = JSON.stringify(data.coreDetails || []);
        updateFiberLabel(line);
    }

    function readFiberData(line) {
        const fallback = getDefaultWireData();
        if (!line) return fallback;
        let coreDetails = fallback.coreDetails;
        try {
            coreDetails = JSON.parse(line.dataset.coreDetails || "[]");
        } catch (error) {
            coreDetails = fallback.coreDetails;
        }
        return {
            recordId: line.dataset.recordId || "",
            wireUuid: line.dataset.wireUuid || "",
            juid: line.dataset.juid || "",
            jcName: line.dataset.jcName || "",
            side: line.dataset.side || "",
            wireType: line.dataset.wireType || fallback.wireType,
            otdrDistance: line.dataset.otdrDistance || "",
            wireDrum: line.dataset.wireDrum || "",
            remark: line.dataset.remark || "",
            liveCores: Number(line.dataset.liveCores || fallback.liveCores),
            coreDetails: Array.isArray(coreDetails) ? coreDetails : fallback.coreDetails
        };
    }

    function fillWireModal(data, juid, side) {
        const safeData = data || getDefaultWireData();
        elements.jcWireJuid.value = juid || "";
        elements.wireTypeSelect.value = safeData.wireType || "12 Core";
        elements.wireDrum.value = safeData.wireDrum || "";
        syncLiveCoreLimit();
        const normalizedLiveCores = Math.min(Math.max(Number(safeData.liveCores || 0), 0), getWireTypeCoreCount());
        const liveCoreValue = safeData.wireUuid ? String(normalizedLiveCores) : (normalizedLiveCores > 0 ? String(normalizedLiveCores) : "");
        elements.liveCoresCountSelect.value = liveCoreValue;
        buildCoreFields(Number(liveCoreValue) || 0, safeData.coreDetails || []);
        
        elements.wireModalTitle.textContent = side === "input" ? "Input Wire Details" : "Output Wire Details";
        elements.wireModalSub.textContent = data && data.wireUuid ? "Edit existing wire" : "Create new wire";
    }

    function getWireModalData() {
        return {
            recordId: state.selectedFiber ? (state.selectedFiber.dataset.recordId || "") : "",
            wireUuid: state.selectedFiber ? (state.selectedFiber.dataset.wireUuid || "") : "",
            juid: elements.jcWireJuid.value || "",
            side: state.selectedFiber ? (state.selectedFiber.dataset.side || "") : (state.pendingWireCreation ? state.pendingWireCreation.side : ""),
            wireType: elements.wireTypeSelect.value || "12 Core",
            wireDrum: elements.wireDrum.value.trim(),
            liveCores: Number(elements.liveCoresCountSelect.value) || 0,
            remark: state.selectedFiber ? (state.selectedFiber.dataset.remark || "") : "",
            coreDetails: getCurrentCoreDataFromForm()
        };
    }

    function validateWireModalData(data) {
        if (!data.juid) {
            alert("JC ID not found");
            return false;
        }
        elements.liveCoreError.textContent = "";
        return true;
    }

    function openWireModal(line, juid, side) {
        if (state.selectedFiber) state.selectedFiber.classList.remove("selected");
        state.selectedFiber = line || null;
        if (state.selectedFiber) state.selectedFiber.classList.add("selected");
        fillWireModal(readFiberData(line), juid, side);
        elements.wireModal.classList.add("show");
    }

    function closeWireModal() {
        elements.wireModal.classList.remove("show");
        state.pendingWireCreation = null;
        if (state.selectedFiber) {
            state.selectedFiber.classList.remove("selected");
            state.selectedFiber = null;
        }
    }

    function fillCoreModal(data, index, wuid, juid) {
        elements.coreColor.value = data.coreColorAndNumber || data.coreColor || "";
        if (elements.coreTube) elements.coreTube.value = data.tube || "";
        elements.coreOltpon.innerHTML = createPonOptionsHtml(data.oltpon || "");
        elements.coreOltpon.value = normalizePonValue(data.oltpon || "");
        elements.corePower.value = data.power || "";
        elements.coreRemark.value = data.remark || "";
        
        const needsTube = state.selectedFiber ? (parseInt(state.selectedFiber.dataset.wireType, 10) > 12) : false;
        elements.coreTubeWrap.classList.toggle("hidden", !needsTube);
        
        elements.coreModalTitle.textContent = `Core ${index}`;
        elements.coreModalSub.textContent = data.cuid ? "Edit existing core" : "Create new core";
        
        if (elements.deleteCoreBtn) {
            elements.deleteCoreBtn.style.display = data.cuid ? "" : "none";
        }
        
        state.pendingCoreCreation = { cuid: data.cuid || null, wuid: wuid, juid: juid, index: index };
    }

    function getCoreModalData() {
        return {
            cuid: state.pendingCoreCreation ? state.pendingCoreCreation.cuid : null,
            wuid: state.pendingCoreCreation ? state.pendingCoreCreation.wuid : "",
            juid: state.pendingCoreCreation ? state.pendingCoreCreation.juid : "",
            coreColorAndNumber: elements.coreColor.value,
            tube: elements.coreTube ? elements.coreTube.value : "",
            oltpon: elements.coreOltpon.value,
            power: elements.corePower.value,
            remark: elements.coreRemark.value
        };
    }

    function validateCoreModalData(data) {
        if (!data.coreColorAndNumber) {
            alert("Select core color and number");
            return false;
        }
        const needsTube = state.selectedFiber ? (parseInt(state.selectedFiber.dataset.wireType, 10) > 12) : false;
        if (needsTube && !data.tube) {
            alert("Select tube");
            return false;
        }
        if (!data.oltpon) {
            alert("Select OLT PON");
            return false;
        }
        if (!data.wuid || !data.juid) {
            alert("Save the wire first");
            return false;
        }
        let existingCores = [];
        try {
            existingCores = state.selectedFiber ? JSON.parse(state.selectedFiber.dataset.coreDetails || "[]") : [];
        } catch (error) {
            existingCores = [];
        }
        const duplicate = existingCores.some((core) => {
            if (!core || !core.coreColor || String(core.cuid || "") === String(data.cuid || "")) return false;
            if (!needsTube) {
                return core.coreColor === data.coreColorAndNumber;
            }
            return String(core.tube || "") === String(data.tube || "") && core.coreColor === data.coreColorAndNumber;
        });
        if (duplicate) {
            alert(needsTube ? "This core color is already used in the selected tube" : "This core color is already used in this wire");
            return false;
        }
        return true;
    }

    function openCoreModal(coreData, index) {
        const wuid = state.selectedFiber ? state.selectedFiber.dataset.wireUuid : "";
        const juid = state.selectedFiber ? state.selectedFiber.dataset.juid : "";
        fillCoreModal(coreData, index, wuid, juid);
        elements.coreModal.classList.add("show");
    }

    function closeCoreModal() {
        elements.coreModal.classList.remove("show");
        state.pendingCoreCreation = null;
    }

    function createFiberLine(data) {
        const line = document.createElement("div");
        line.className = "fiber-line";
        line.innerHTML = '<div class="light"></div><span class="fiber-label"></span>';
        applyFiberData(line, data || getDefaultWireData());
        line.addEventListener("click", (event) => {
            event.stopPropagation();
            openWireModal(line, line.dataset.juid, line.dataset.side);
        });
        return line;
    }

    function createBox(data) {
        const boxData = Object.assign(getDefaultJcData(), data || {});
        const hasLocation = boxData.lat !== null && boxData.lng !== null;
        const mapLink = hasLocation ? `https://www.google.com/maps?q=${boxData.lat},${boxData.lng}` : "";
        const previousLabel = String(boxData.previousJc || ROOT_PREVIOUS_JC).trim() || ROOT_PREVIOUS_JC;
        const jcHealthMeta = getJcHealthMeta(boxData);
        const wrapper = document.createElement("div");
        wrapper.className = "jc-wrapper";
        wrapper.innerHTML = `
            ${hasLocation ? `<a class="jc-badge" href="${mapLink}" target="_blank" rel="noopener noreferrer">${getJcDisplayName(boxData)}</a>` : `<div class="jc-badge">${getJcDisplayName(boxData)}</div>`}
            <div class="jc-link"></div>
            <div class="jc-health-label"><span class="core-led ${jcHealthMeta.level}"></span><span>${jcHealthMeta.label}</span></div>
            <div class="jc-after-label">After ${previousLabel}</div>
            <button type="button" class="jc-edit-toggle">Edit JC</button>
        `;
        const link = wrapper.querySelector(".jc-link");
        const wire = document.createElement("div");
        wire.className = "wire";
        wire.innerHTML = '<div class="flow"></div>';
        const container = document.createElement("div");
        container.className = "container";
        container.dataset.recordId = boxData.recordId || "";
        container.dataset.juid = boxData.juid || "";
        container.dataset.jcName = boxData.jcName || "";
        container.dataset.previousJc = boxData.previousJc || ROOT_PREVIOUS_JC;
        container.dataset.otdrDistance = boxData.otdrDistance || "";
        container.dataset.remark = boxData.remark || "";
        container.dataset.lat = boxData.lat || "";
        container.dataset.lng = boxData.lng || "";
        container.dataset.window = boxData.window || "";
        container.dataset.editMode = "false";
        container.innerHTML = `
            <div class="box">
                <div class="side left"></div>
                <div class="side right"></div>
            </div>
            <div class="panel panel-left">
                <div class="title-row"><div class="title">INPUT</div><div class="panel-controls"><button class="add" type="button">+</button></div></div>
                <div class="fiber-container"></div>
            </div>
            <div class="panel panel-right">
                <div class="title-row"><div class="title">OUTPUT</div><div class="panel-controls"><button class="add" type="button">+</button></div></div>
                <div class="fiber-container"></div>
            </div>
        `;
        const fiberContainers = container.querySelectorAll(".fiber-container");
        (boxData.inputWires || []).forEach((wireData) => fiberContainers[0].appendChild(createFiberLine(Object.assign({}, wireData, { side: "input", juid: boxData.juid, jcName: boxData.jcName, otdrDistance: boxData.otdrDistance }))));
        (boxData.outputWires || []).forEach((wireData) => fiberContainers[1].appendChild(createFiberLine(Object.assign({}, wireData, { side: "output", juid: boxData.juid, jcName: boxData.jcName, otdrDistance: boxData.otdrDistance }))));
        const jcAlertLevel = getJcAlertLevel(boxData);
        if (jcAlertLevel) {
            container.classList.add(`jc-alert-${jcAlertLevel}`);
        }
        
        container.addEventListener("click", (event) => {
            event.stopPropagation();
            if (state.selectedBox && state.selectedBox !== container) {
                closeBox(state.selectedBox);
                state.selectedBox.classList.remove("active");
                state.selectedBox.closest(".jc-wrapper")?.classList.remove("active-box");
            }
            state.selectedBox = container;
            container.classList.add("active");
            wrapper.classList.add("active-box");
        });
        
        container.querySelector(".left").onclick = (event) => { event.stopPropagation(); toggle(container, "left"); };
        container.querySelector(".right").onclick = (event) => { event.stopPropagation(); toggle(container, "right"); };
        
        container.querySelectorAll(".panel").forEach((panel) => {
            panel.onclick = (event) => event.stopPropagation();
            panel.querySelector(".add").onclick = (event) => {
                event.stopPropagation();
                const side = panel.classList.contains("panel-left") ? "input" : "output";
                const juid = container.dataset.juid;
                if (!juid) {
                    showNotice("Error", "JC ID not found");
                    return;
                }
                state.pendingWireCreation = { side: side, juid: juid, container: container };
                openWireModal(null, juid, side);
            };
        });
        const editButton = wrapper.querySelector(".jc-edit-toggle");
        if (editButton) {
            editButton.addEventListener("click", (event) => {
                event.stopPropagation();
                openEditJcModal(container);
            });
        }
        
        setBoxEditMode(container, true);
        link.appendChild(wire);
        link.appendChild(container);
        return wrapper;
    }

    async function createJc(payload) {
        const response = await requestJson(apiUrlFor(getActiveClient(), "jc/create"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jcname: payload.jcname,
                previousjc: payload.previousjc,
                lat: payload.lat,
                lng: payload.lng,
                otdr: payload.otdr,
                remark: payload.remark,
                window: payload.window
            })
        });
        return response.JUID;
    }

    async function updateJc(juid, payload) {
        await requestJson(apiUrlFor(getActiveClient(), `jc/${juid}`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jcname: payload.jcname,
                previousjc: payload.previousjc,
                lat: payload.lat,
                lng: payload.lng,
                otdr: payload.otdr,
                remark: payload.remark,
                window: payload.window
            })
        });
    }

    async function createWire(payload) {
        const response = await requestJson(apiUrlFor(getActiveClient(), "wire/create"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                JUID: payload.juid,
                drum: payload.drum,
                otdrdistance: "",
                wiretype: payload.wiretype,
                livecores: payload.livecores,
                remark: payload.remark || ""
            })
        });
        return response.WUID;
    }

    async function updateWire(wuid, payload) {
        await requestJson(apiUrlFor(getActiveClient(), `wire/${wuid}`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                drum: payload.drum,
                otdrdistance: "",
                wiretype: payload.wiretype,
                livecores: payload.livecores,
                remark: payload.remark || ""
            })
        });
    }

    async function deleteWire(wuid) {
        await requestJson(apiUrlFor(getActiveClient(), `wire/${wuid}`), {
            method: "DELETE"
        });
    }

    async function deleteJc(juid) {
        await requestJson(apiUrlFor(getActiveClient(), `jc/${juid}`), {
            method: "DELETE"
        });
    }

    async function createCore(payload) {
        const response = await requestJson(apiUrlFor(getActiveClient(), "core/create"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                WUID: payload.wuid,
                JUID: payload.juid,
                corecolorandnumber: payload.corecolorandnumber,
                tube: payload.tube || "",
                oltpon: payload.oltpon,
                power: payload.power,
                remark: payload.remark || ""
            })
        });
        return response.CUID;
    }

    async function updateCore(cuid, payload) {
        await requestJson(apiUrlFor(getActiveClient(), `core/${cuid}`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                corecolorandnumber: payload.corecolorandnumber,
                tube: payload.tube || "",
                oltpon: payload.oltpon,
                power: payload.power,
                remark: payload.remark || ""
            })
        });
    }

    async function deleteCore(cuid) {
        await requestJson(apiUrlFor(getActiveClient(), `core/${cuid}`), {
            method: "DELETE"
        });
    }

    async function refreshAndReopenWireModal(wireUuid, side, juid) {
        await loadData();
        if (!wireUuid || !state.root) return;
        const safeWireUuid = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(String(wireUuid)) : String(wireUuid).replace(/"/g, '\\"');
        const safeSide = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(String(side || "")) : String(side || "").replace(/"/g, '\\"');
        let line = state.root.querySelector(`.fiber-line[data-wire-uuid="${safeWireUuid}"][data-side="${safeSide}"]`);
        if (!line) {
            line = state.root.querySelector(`.fiber-line[data-wire-uuid="${safeWireUuid}"]`);
        }
        if (line) {
            openWireModal(line, juid || line.dataset.juid || "", side || line.dataset.side || "");
        }
    }

    async function saveWireAndCores(wireData, wireId, existingCores) {
        const newCores = wireData.coreDetails || [];
        const existingCoreMap = new Map();
        existingCores.forEach(core => {
            if (core.cuid) existingCoreMap.set(core.coreColor, core);
        });
        
        for (const core of newCores) {
            const existingCore = existingCoreMap.get(core.coreColor);
            if (existingCore && existingCore.cuid) {
                await updateCore(existingCore.cuid, {
                    corecolorandnumber: core.coreColor,
                    tube: core.tube || "",
                    oltpon: core.oltpon || "",
                    power: core.power || "",
                    remark: core.remark || ""
                });
                existingCoreMap.delete(core.coreColor);
            } else {
                await createCore({
                    wuid: wireId,
                    juid: wireData.juid,
                    corecolorandnumber: core.coreColor,
                    tube: core.tube || "",
                    oltpon: core.oltpon || "",
                    power: core.power || "",
                    remark: core.remark || ""
                });
            }
        }
        
        for (const remainingCore of existingCoreMap.values()) {
            if (remainingCore.cuid) {
                await deleteCore(remainingCore.cuid);
            }
        }
    }

    async function loadData() {
        if (!state.context) return;
        setBusy(true);
        try {
            try {
                await fetchWindowPonStats(state.context.windowName);
            } catch (error) {
                state.ponOptions = [];
                state.ponStats = {};
            }
            let url = apiUrlFor(getActiveClient(), "jctree");
            url += `?windows=${encodeURIComponent(getWindowQueryValue(state.context.windowName))}`;
            const response = await requestJson(url);
            const tree = Array.isArray(response.tree) ? response.tree : [];
            state.allRows = tree.map(normalizeTreeNode);
            state.rows = state.allRows.slice();
            renderRows();
        } catch (error) {
            showError(error);
        } finally {
            setBusy(false);
        }
    }

    function renderRows() {
        state.selectedBox = null;
        state.selectedFiber = null;
        elements.row.innerHTML = "";
        const visibleRows = filterTreeNodes(state.rows, normalizeSearchValue(state.searchTerm));

        if (!visibleRows.length) {
            elements.row.innerHTML = "<div style='padding:20px'>No data found</div>";
            return;
        }

        const tree = document.createElement("div");
        tree.className = "jc-tree";

        const officeBranch = document.createElement("div");
        officeBranch.className = "jc-branch jc-office-branch";

        const officeLine = document.createElement("div");
        officeLine.className = "jc-line jc-line-root";
        officeLine.appendChild(createOfficeNode());
        officeBranch.appendChild(officeLine);

        const rootChildren = document.createElement("div");
        rootChildren.className = "jc-children jc-children-root";
        visibleRows.forEach((root, index) => {
            rootChildren.appendChild(renderTree(root, 0));
        });
        officeBranch.appendChild(rootChildren);

        tree.appendChild(officeBranch);
        elements.row.appendChild(tree);
    }

    function renderTree(jc, level) {
        const branch = document.createElement("div");
        branch.className = "jc-branch";

        const line = document.createElement("div");
        line.className = "jc-line";

        const box = createBox(jc);
        line.appendChild(box);
        branch.appendChild(line);

        if (jc.children && jc.children.length) {
            const rightColumn = document.createElement("div");
            rightColumn.className = "jc-right-column";

            const firstChild = jc.children[0];
            const firstChildNode = renderTree(firstChild, level);
            firstChildNode.classList.add("jc-inline-child");
            applyBranchConnector(firstChildNode);
            rightColumn.appendChild(firstChildNode);

            if (jc.children.length > 1) {
                rightColumn.classList.add("jc-right-column-stacked");
                jc.children.slice(1).forEach(child => {
                    const childNode = renderTree(child, level + 1);
                    childNode.classList.add("jc-stacked-child");
                    if (child.children && child.children.length) {
                        childNode.classList.add("jc-stacked-parent");
                    }
                    applyBranchConnector(childNode);
                    rightColumn.appendChild(childNode);
                });
            }

            line.appendChild(rightColumn);
        }

        return branch;
    }

    function getJcModalData() {
        const location = getModalLocation();
        return {
            juid: state.editingJcId || "",
            jcname: elements.jcNameField.value.trim(),
            window: elements.jcModalWindowName.value,
            previousjc: elements.jcPreviousJcField ? elements.jcPreviousJcField.value : "",
            lat: location.lat,
            lng: location.lng,
            otdr: elements.jcOtdrField ? elements.jcOtdrField.value.trim() : "",
            remark: elements.jcRemarkField ? elements.jcRemarkField.value.trim() : ""
        };
    }

    async function saveJc() {
        const jcName = elements.jcNameField.value.trim();
        const window = elements.jcModalWindowName.value;
        const previousJc = elements.jcPreviousJcField ? elements.jcPreviousJcField.value : "";
        const location = getModalLocation();
        const jcData = getJcModalData();
        const isEditMode = state.jcModalMode === "edit" && jcData.juid;
        
        if (!jcName) {
            alert("Enter JC name");
            return false;
        }
        if (!window) {
            alert("Select window");
            return false;
        }
        if (!previousJc) {
            alert("Select Previous JC");
            return false;
        }
        if (location.lat === null || location.lng === null) {
            if (elements.locationMode && elements.locationMode.value === "auto") {
                alert("Auto location unavailable. Allow location access or switch to Manual Location.");
            } else {
                alert("Enter valid manual latitude and longitude");
            }
            return false;
        }
        
        try {
            setBusy(true);
            if (isEditMode) {
                await updateJc(jcData.juid, jcData);
            } else {
                await createJc(jcData);
            }
            await loadData();
            closeJcModal();
            return true;
        } catch (error) {
            showError(error);
            return false;
        } finally {
            setBusy(false);
        }
    }

    async function saveNewWire() {
        const wireData = getWireModalData();
        if (!validateWireModalData(wireData)) return false;
        
        try {
            setBusy(true);
            let wireId = wireData.wireUuid;
            const liveCores = Math.max(0, Number(wireData.liveCores) || 0);
            
            if (wireId) {
                await updateWire(wireId, {
                    drum: wireData.wireDrum || "",
                    wiretype: wireData.wireType || "12 Core",
                    livecores: liveCores,
                    remark: wireData.remark || ""
                });
            } else {
                wireId = await createWire({
                    juid: wireData.juid,
                    drum: wireData.wireDrum || "",
                    wiretype: wireData.wireType || "12 Core",
                    livecores: liveCores,
                    remark: wireData.remark || ""
                });
            }
            
            storeWireSide(wireId, wireData.side || "input");
            await loadData();
            closeWireModal();
            return true;
        } catch (error) {
            showError(error);
            return false;
        } finally {
            setBusy(false);
        }
    }

    async function saveNewCore() {
        const coreData = getCoreModalData();
        if (!validateCoreModalData(coreData)) return false;
        
        try {
            setBusy(true);
            const activeWireUuid = coreData.wuid;
            const activeWireSide = state.selectedFiber ? state.selectedFiber.dataset.side || "" : "";
            const activeJuid = coreData.juid;
            const nextLiveCoreCount = Number(elements.liveCoresCountSelect.value) || 0;
            if (activeWireUuid) {
                await updateWire(activeWireUuid, {
                    drum: state.selectedFiber ? state.selectedFiber.dataset.wireDrum || "" : "",
                    wiretype: state.selectedFiber ? state.selectedFiber.dataset.wireType || "12 Core" : "12 Core",
                    livecores: nextLiveCoreCount,
                    remark: state.selectedFiber ? state.selectedFiber.dataset.remark || "" : ""
                });
            }
            if (coreData.cuid) {
                await updateCore(coreData.cuid, {
                    corecolorandnumber: coreData.coreColorAndNumber,
                    tube: coreData.tube,
                    oltpon: coreData.oltpon,
                    power: coreData.power,
                    remark: coreData.remark
                });
            } else {
                await createCore({
                    wuid: coreData.wuid,
                    juid: coreData.juid,
                    corecolorandnumber: coreData.coreColorAndNumber,
                    tube: coreData.tube,
                    oltpon: coreData.oltpon,
                    power: coreData.power,
                    remark: coreData.remark
                });
            }
            closeCoreModal();
            await refreshAndReopenWireModal(activeWireUuid, activeWireSide, activeJuid);
            return true;
        } catch (error) {
            showError(error);
            return false;
        } finally {
            setBusy(false);
        }
    }

    async function deleteSelectedBox() {
        if (!state.selectedBox) {
            await showNotice("Delete JC", "Select a JC first");
            return;
        }
        const juid = state.selectedBox.dataset.juid || "";
        if (!juid) {
            await showNotice("Delete JC", "This JC cannot be deleted right now");
            return;
        }
        const confirmed = await askConfirm("Delete JC", "Delete selected JC?");
        if (!confirmed) return;
        
        setBusy(true);
        try {
            await deleteJc(juid);
            await loadData();
        } catch (error) {
            showError(error);
        } finally {
            setBusy(false);
        }
    }

    async function deleteSelectedWire() {
        if (!state.selectedFiber) return;
        const wireUuid = state.selectedFiber.dataset.wireUuid || "";
        if (!wireUuid) {
            await showNotice("Delete Wire", "This wire cannot be deleted right now");
            return;
        }
        const confirmed = await askConfirm("Delete Wire", "Delete selected wire?");
        if (!confirmed) return;
        
        try {
            setBusy(true);
            await deleteWire(wireUuid);
            clearStoredWireSide(wireUuid);
            closeWireModal();
            await loadData();
        } catch (error) {
            showError(error);
        } finally {
            setBusy(false);
        }
    }

    function openJcModal() {
        state.jcModalMode = "create";
        state.editingJcId = "";
        elements.jcNameField.value = "";
        elements.jcModalWindowName.value = getWindowFilterValue() || "";
        if (elements.jcOtdrField) elements.jcOtdrField.value = "";
        if (elements.jcRemarkField) elements.jcRemarkField.value = "";
        if (elements.jcPreviousJcField) elements.jcPreviousJcField.innerHTML = '<option value="">Select Previous JC</option>';
        if (elements.locationMode) {
            elements.locationMode.value = state.location ? "auto" : "manual";
        }
        if (elements.manualLat) elements.manualLat.value = "";
        if (elements.manualLng) elements.manualLng.value = "";
        syncPreviousJcOptions();
        syncLocationMode();
        elements.jcModalSub.textContent = "Create new JC";
        elements.saveJcBtn.textContent = "Create JC";
        elements.jcModal.classList.add("show");
    }

    function openEditJcModal(container) {
        if (!container) return;
        state.jcModalMode = "edit";
        state.editingJcId = container.dataset.juid || "";
        elements.jcNameField.value = container.dataset.jcName || "";
        elements.jcModalWindowName.value = container.dataset.window || getWindowFilterValue() || "";
        if (elements.jcOtdrField) elements.jcOtdrField.value = container.dataset.otdrDistance || "";
        if (elements.jcRemarkField) elements.jcRemarkField.value = container.dataset.remark || "";
        if (elements.jcPreviousJcField) syncPreviousJcOptions(container.dataset.previousJc || ROOT_PREVIOUS_JC);
        if (elements.locationMode) elements.locationMode.value = "manual";
        if (elements.manualLat) elements.manualLat.value = container.dataset.lat || "";
        if (elements.manualLng) elements.manualLng.value = container.dataset.lng || "";
        syncLocationMode();
        elements.jcModalSub.textContent = "Edit selected JC details";
        elements.saveJcBtn.textContent = "Update JC";
        elements.jcModal.classList.add("show");
    }

    function closeJcModal() {
        elements.jcModal.classList.remove("show");
        state.jcModalMode = "create";
        state.editingJcId = "";
    }

    function openWindowPicker() {
        if (elements.windowModal) {
            elements.windowModal.classList.add("show");
        }
    }

    function closeWindowPicker(force = false) {
        if (elements.windowModal && (force || (state.context && state.context.windowName))) {
            elements.windowModal.classList.remove("show");
        }
    }

    async function applyWindowSelection(windowName) {
        const normalizedWindow = String(windowName || "").trim().toUpperCase();
        if (!ALL_WINDOWS.includes(normalizedWindow)) return;
        if (elements.windowPickerTrigger) {
            elements.windowPickerTrigger.textContent = normalizedWindow;
        }
        closeWindowPicker(true);
        await open({
            client: normalizedWindow,
            windowName: normalizedWindow,
            oltName: "",
            ponNumber: ""
        });
    }

    function requestCurrentLocation() {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (position) => {
                state.location = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: new Date().toISOString()
                };
            },
            () => {
                state.location = null;
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    }

    function bindEvents() {
        elements.addBoxBtn.addEventListener("click", openJcModal);
        elements.deleteBoxBtn.addEventListener("click", deleteSelectedBox);
        if (elements.locationMode) elements.locationMode.addEventListener("change", syncLocationMode);
        if (elements.jcModalWindowName) {
            elements.jcModalWindowName.addEventListener("change", () => syncPreviousJcOptions());
        }
        if (elements.windowPickerTrigger) {
            elements.windowPickerTrigger.addEventListener("click", openWindowPicker);
        }
        if (elements.windowOptions) {
            elements.windowOptions.forEach((button) => {
                button.addEventListener("click", () => applyWindowSelection(button.dataset.window));
            });
        }
        elements.saveJcBtn.addEventListener("click", saveJc);
        elements.closeModalBtn.addEventListener("click", closeJcModal);
        elements.cancelModalBtn.addEventListener("click", closeJcModal);
        elements.jcModal.addEventListener("click", (event) => {
            if (event.target === elements.jcModal) closeJcModal();
        });
        
        elements.saveWireBtn.addEventListener("click", saveNewWire);
        elements.closeWireModalBtn.addEventListener("click", closeWireModal);
        elements.cancelWireModalBtn.addEventListener("click", closeWireModal);
        elements.wireModal.addEventListener("click", (event) => {
            if (event.target === elements.wireModal) closeWireModal();
        });
        elements.deleteWireBtn.addEventListener("click", deleteSelectedWire);
        
        elements.saveCoreBtn.addEventListener("click", saveNewCore);
        elements.closeCoreModalBtn.addEventListener("click", closeCoreModal);
        elements.cancelCoreModalBtn.addEventListener("click", closeCoreModal);
        elements.coreModal.addEventListener("click", (event) => {
            if (event.target === elements.coreModal) closeCoreModal();
        });
        if (elements.deleteCoreBtn) {
            elements.deleteCoreBtn.addEventListener("click", async () => {
                if (state.pendingCoreCreation && state.pendingCoreCreation.cuid) {
                    const confirmed = await askConfirm("Delete Core", "Delete this core?");
                    if (confirmed) {
                        try {
                            setBusy(true);
                            const wireUuid = state.pendingCoreCreation.wuid;
                            const juid = state.pendingCoreCreation.juid;
                            const side = state.selectedFiber ? state.selectedFiber.dataset.side || "" : "";
                            const nextLiveCoreCount = Math.max((Number(elements.liveCoresCountSelect.value) || 0) - 1, 0);
                            if (wireUuid) {
                                await updateWire(wireUuid, {
                                    drum: state.selectedFiber ? state.selectedFiber.dataset.wireDrum || "" : "",
                                    wiretype: state.selectedFiber ? state.selectedFiber.dataset.wireType || "12 Core" : "12 Core",
                                    livecores: nextLiveCoreCount,
                                    remark: state.selectedFiber ? state.selectedFiber.dataset.remark || "" : ""
                                });
                            }
                            await deleteCore(state.pendingCoreCreation.cuid);
                            closeCoreModal();
                            await refreshAndReopenWireModal(wireUuid, side, juid);
                        } catch (error) {
                            showError(error);
                        } finally {
                            setBusy(false);
                        }
                    }
                }
            });
        }
        
        // Click on OLT/RACK node to deselect
        const oltNode = state.root.querySelector(".olt");
        if (oltNode) {
            oltNode.addEventListener("click", () => {
                if (!state.selectedBox) return;
                closeBox(state.selectedBox);
                state.selectedBox.classList.remove("active");
                state.selectedBox.closest(".jc-wrapper")?.classList.remove("active-box");
                state.selectedBox = null;
            });
        }
        
        elements.liveCoresCountSelect.addEventListener("change", () => {
            const coreData = getCurrentCoreDataFromForm();
            syncLiveCoreLimit();
            if (state.selectedFiber) {
                state.selectedFiber.dataset.liveCores = elements.liveCoresCountSelect.value;
                updateFiberLabel(state.selectedFiber);
            }
            buildCoreFields(Number(elements.liveCoresCountSelect.value), coreData);
        });
        elements.liveCoresCountSelect.addEventListener("pointerdown", async (event) => {
            if (hasSavedWireSelection()) return;
            event.preventDefault();
            event.stopPropagation();
            await showSaveWireFirstNotice();
        });
        elements.liveCoresCountSelect.addEventListener("focus", async (event) => {
            if (hasSavedWireSelection()) return;
            event.target.blur();
            await showSaveWireFirstNotice();
        }, true);

        if (elements.searchInput) {
            elements.searchInput.addEventListener("input", () => {
                state.searchTerm = elements.searchInput.value || "";
                renderRows();
            });
        }
        
        elements.wireTypeSelect.addEventListener("change", () => {
            const coreData = getCurrentCoreDataFromForm();
            if (state.selectedFiber) {
                state.selectedFiber.dataset.wireType = elements.wireTypeSelect.value;
                updateFiberLabel(state.selectedFiber);
            }
            syncLiveCoreLimit();
            if (state.selectedFiber) {
                state.selectedFiber.dataset.liveCores = elements.liveCoresCountSelect.value;
                updateFiberLabel(state.selectedFiber);
            }
            buildCoreFields(Number(elements.liveCoresCountSelect.value), coreData);
        });

        document.addEventListener("click", (event) => {
            if (!event.target.closest(".container")) {
                if (state.selectedBox) {
                    closeBox(state.selectedBox);
                    state.selectedBox.classList.remove("active");
                    state.selectedBox.closest(".jc-wrapper")?.classList.remove("active-box");
                    state.selectedBox = null;
                }
            }
        });
    }

    function init() {
        elements.mount = document.getElementById("jcNotepadMount");
        elements.title = document.getElementById("jcModalTitle") || document.querySelector(".jc-page-head h1");
        elements.subtitle = document.getElementById("jcModalSubtitle") || document.querySelector(".jc-page-subtitle");
        elements.windowPickerTrigger = document.getElementById("jcWindowPickerTrigger");
        elements.windowModal = document.getElementById("jcWindowModal");
        elements.windowOptions = Array.from(document.querySelectorAll(".jc-window-option"));
        if (!elements.mount) return;
        createShell();
        bindEvents();
        syncLiveCoreLimit();
        requestCurrentLocation();
        openWindowPicker();
    }

    async function open(context) {
        const wn = String(context.windowName || "").trim().toUpperCase();
        state.context = {
            client: String(context.client || wn || DEFAULT_CLIENT).trim(),
            windowName: wn || "",
            oltName: String(context.oltName || "").trim(),
            ponNumber: String(context.ponNumber || "").trim()
        };
        if (elements.title) {
            elements.title.textContent = "JC Fiber Tree View";
        }
        if (elements.subtitle) {
            elements.subtitle.textContent = state.context.windowName ? `${state.context.windowName} JCs` : "Select a window to load JCs";
        }
        if (elements.windowPickerTrigger) {
            elements.windowPickerTrigger.textContent = state.context.windowName || "Select Window";
        }
        state.searchTerm = "";
        if (elements.searchInput) {
            elements.searchInput.value = "";
        }
        try {
            await loadData();
        } catch (error) {
            showError(error);
        }
    }

    function close() {
        if (elements.mount) {
            elements.mount.innerHTML = "";
        }
        state.context = null;
        state.root = null;
        state.selectedBox = null;
        state.selectedFiber = null;
        state.pendingJcCreation = null;
        state.pendingWireCreation = null;
        state.pendingCoreCreation = null;
        state.editingJcId = "";
        state.jcModalMode = "create";
        state.isLoading = false;
        state.location = null;
        state.allRows = [];
        state.rows = [];
        state.searchTerm = "";
        state.ponOptions = [];
        state.ponStats = {};
    }

    document.addEventListener("DOMContentLoaded", init);
    window.jcNotepad = {
        open,
        close,
        isOpen: () => Boolean(state.root)
    };
})();
