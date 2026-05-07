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
        "5,Grey",
        "6,White",
        "7,Red",
        "8,Black",
        "9,Yellow",
        "10,Purple",
        "11,Pink",
        "12,Aqua"
    ];
    const jointOptions = [
        "Core to core",
        "Core interchange",
        "Splitter"
    ];
    const colorOptionsHtml = coreOptions.map((option) => `<option value="${option}">${option}</option>`).join("");
    const tubeOptionsHtml = coreOptions.map((option) => `<option value="${option}">${option} tube</option>`).join("");

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
        visibleRows: [],
        allRows: [],
        rows: [],
        searchTerm: "",
        ponOptions: [],
        ponStats: {},
        userStatusMap: {},
        ponUserMap: {},
        ponPicker: null,
        jcMap: null,
        jcMapMarkers: []
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
            inout: "",
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
            joint: "",
            ponMode: "full",
            oltpon: "",
            partialpon: "",
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
                    <button id="jcDownloadCsvBtn" type="button">Download CSV</button>
                    <button id="jcShowMapBtn" type="button" title="Show visible JCs on map"><span class="map-btn-icon"></span><span>Map</span></button>
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
                                    <option value="6 Core">6 Core</option>
                                    <option value="12 Core">12 Core</option>
                                    <option value="24 Core">24 Core</option>
                                    <option value="48 Core">48 Core</option>
                                    <option value="96 Core">96 Core</option>
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
                                    <option value="" disabled selected>Tube color</option>
                                    ${tubeOptionsHtml}
                                </select>
                            </div>
                            <div class="field" id="jcCoreOltponWrap">
                                <button type="button" id="jcCoreOltponTrigger" class="pon-picker-trigger">Select OLT PON</button>
                                <select id="jcCoreOltpon" required class="pon-picker-select hidden">
                                    <option value="" disabled selected>Select OLT PON</option>
                                </select>
                            </div>
                            <div class="field hidden" id="jcCoreJointWrap">
                                <select id="jcCoreJoint">
                                    <option value="" disabled selected>Select Joint Name</option>
                                    ${jointOptions.map((option) => `<option value="${option}">${option}</option>`).join("")}
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
                <div class="jc-note-inner-modal" id="jcPartialPonModal">
                    <div class="modal-card jc-partialpon-card">
                        <div class="modal-head">
                            <div>
                                <h2 id="jcPartialPonTitle">Partial PON Detector</h2>
                                <div class="modal-sub" id="jcPartialPonSub">Track users for selected core</div>
                            </div>
                            <button class="close-btn" id="jcClosePartialPonBtn">Close</button>
                        </div>
                        <div class="partialpon-time" id="jcPartialPonTimestamp">Timestamp: -</div>
                        <div class="partialpon-status" id="jcPartialPonStatus">Select partial PON and start detection.</div>
                        <div class="partialpon-actions">
                            <button class="save-btn" id="jcPartialPonActionBtn">Fetch users</button>
                            <button class="close-btn" id="jcPartialPonManualBtn">Manual user entry</button>
                        </div>
                        <div class="partialpon-manual hidden" id="jcPartialPonManualWrap">
                            <textarea id="jcPartialPonManualInput" placeholder="Paste MAC addresses here"></textarea>
                        </div>
                    </div>
                </div>
                <div class="jc-note-inner-modal" id="jcUsersModal">
                    <div class="modal-card jc-users-card">
                        <div class="modal-head">
                            <div>
                                <h2 id="jcUsersModalTitle">Users</h2>
                                <div class="modal-sub" id="jcUsersModalSub"></div>
                            </div>
                            <button class="close-btn" id="jcCloseUsersModalBtn">Close</button>
                        </div>
                        <div class="jc-users-list" id="jcUsersList"></div>
                    </div>
                </div>
                <div class="jc-note-inner-modal" id="jcPonPickerModal">
                    <div class="modal-card jc-pon-picker-card">
                        <div class="modal-head">
                            <div>
                                <h2 id="jcPonPickerTitle">Select OLT PON</h2>
                                <div class="modal-sub">Search and expand one category at a time</div>
                            </div>
                            <button class="close-btn" id="jcClosePonPickerBtn">Close</button>
                        </div>
                        <div class="pon-picker-search-wrap">
                            <input id="jcPonPickerSearch" type="search" placeholder="Search PON">
                        </div>
                        <div class="pon-picker-groups">
                            <button type="button" class="pon-picker-group-toggle" id="jcPonPickerFullToggle" data-mode="full">Full pon</button>
                            <div class="pon-picker-group-list hidden" id="jcPonPickerFullList"></div>
                            <button type="button" class="pon-picker-group-toggle" id="jcPonPickerPartialToggle" data-mode="partial">Partial pon</button>
                            <div class="pon-picker-group-list hidden" id="jcPonPickerPartialList"></div>
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
                <div class="jc-note-inner-modal" id="jcMapModal">
                    <div class="modal-card jc-map-card">
                        <div class="modal-head">
                            <div>
                                <h2>JC Map View</h2>
                                <div class="modal-sub" id="jcMapModalSub">Visible JCs on map</div>
                            </div>
                            <button class="close-btn" id="jcCloseMapModalBtn">Close</button>
                        </div>
                        <div id="jcLeafletMap" class="jc-map-view"></div>
                        <div class="jc-map-jc-modal" id="jcMapJcModal">
                            <div class="jc-map-jc-card">
                                <div class="jc-map-jc-head">
                                    <div>
                                        <h2 id="jcMapJcTitle">JC Details</h2>
                                        <div class="modal-sub" id="jcMapJcSub">Interactive JC view</div>
                                    </div>
                                    <button class="close-btn" id="jcCloseMapJcBtn">Close</button>
                                </div>
                                <div id="jcMapJcMount" class="jc-map-jc-mount"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        state.root = elements.mount.querySelector(".jc-note-root");
        elements.row = state.root.querySelector("#jcRow");
        elements.searchInput = state.root.querySelector("#jcSearchInput");
        elements.showMapBtn = state.root.querySelector("#jcShowMapBtn");
        elements.downloadCsvBtn = state.root.querySelector("#jcDownloadCsvBtn");
        
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
        elements.coreOltponWrap = state.root.querySelector("#jcCoreOltponWrap");
        elements.coreOltponTrigger = state.root.querySelector("#jcCoreOltponTrigger");
        elements.coreOltpon = state.root.querySelector("#jcCoreOltpon");
        elements.coreJointWrap = state.root.querySelector("#jcCoreJointWrap");
        elements.coreJoint = state.root.querySelector("#jcCoreJoint");
        elements.corePower = state.root.querySelector("#jcCorePower");
        elements.coreRemark = state.root.querySelector("#jcCoreRemark");
        elements.saveCoreBtn = state.root.querySelector("#jcSaveCoreBtn");
        elements.deleteCoreBtn = state.root.querySelector("#jcDeleteCoreBtn");
        elements.closeCoreModalBtn = state.root.querySelector("#jcCloseCoreModalBtn");
        elements.cancelCoreModalBtn = state.root.querySelector("#jcCancelCoreModalBtn");
        elements.partialPonModal = state.root.querySelector("#jcPartialPonModal");
        elements.partialPonTitle = state.root.querySelector("#jcPartialPonTitle");
        elements.partialPonSub = state.root.querySelector("#jcPartialPonSub");
        elements.partialPonTimestamp = state.root.querySelector("#jcPartialPonTimestamp");
        elements.partialPonStatus = state.root.querySelector("#jcPartialPonStatus");
        elements.partialPonActionBtn = state.root.querySelector("#jcPartialPonActionBtn");
        elements.closePartialPonBtn = state.root.querySelector("#jcClosePartialPonBtn");
        elements.partialPonManualBtn = state.root.querySelector("#jcPartialPonManualBtn");
        elements.partialPonManualWrap = state.root.querySelector("#jcPartialPonManualWrap");
        elements.partialPonManualInput = state.root.querySelector("#jcPartialPonManualInput");
        elements.usersModal = state.root.querySelector("#jcUsersModal");
        elements.usersModalTitle = state.root.querySelector("#jcUsersModalTitle");
        elements.usersModalSub = state.root.querySelector("#jcUsersModalSub");
        elements.usersList = state.root.querySelector("#jcUsersList");
        elements.closeUsersModalBtn = state.root.querySelector("#jcCloseUsersModalBtn");
        elements.ponPickerModal = state.root.querySelector("#jcPonPickerModal");
        elements.ponPickerTitle = state.root.querySelector("#jcPonPickerTitle");
        elements.closePonPickerBtn = state.root.querySelector("#jcClosePonPickerBtn");
        elements.ponPickerSearch = state.root.querySelector("#jcPonPickerSearch");
        elements.ponPickerFullToggle = state.root.querySelector("#jcPonPickerFullToggle");
        elements.ponPickerPartialToggle = state.root.querySelector("#jcPonPickerPartialToggle");
        elements.ponPickerFullList = state.root.querySelector("#jcPonPickerFullList");
        elements.ponPickerPartialList = state.root.querySelector("#jcPonPickerPartialList");
        
        // Confirm Modal
        elements.confirmModal = state.root.querySelector("#jcConfirmModal");
        elements.confirmTitle = state.root.querySelector("#jcConfirmTitle");
        elements.confirmMessage = state.root.querySelector("#jcConfirmMessage");
        elements.confirmCancelBtn = state.root.querySelector("#jcConfirmCancelBtn");
        elements.confirmOkBtn = state.root.querySelector("#jcConfirmOkBtn");
        elements.mapModal = state.root.querySelector("#jcMapModal");
        elements.mapModalSub = state.root.querySelector("#jcMapModalSub");
        elements.closeMapModalBtn = state.root.querySelector("#jcCloseMapModalBtn");
        elements.leafletMap = state.root.querySelector("#jcLeafletMap");
        elements.mapJcModal = state.root.querySelector("#jcMapJcModal");
        elements.mapJcTitle = state.root.querySelector("#jcMapJcTitle");
        elements.mapJcSub = state.root.querySelector("#jcMapJcSub");
        elements.closeMapJcBtn = state.root.querySelector("#jcCloseMapJcBtn");
        elements.mapJcMount = state.root.querySelector("#jcMapJcMount");
        
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

    function getActiveClient(preferredWindow) {
        const normalizedPreferred = String(preferredWindow || "").trim().toUpperCase();
        if (ALL_WINDOWS.includes(normalizedPreferred)) {
            return normalizedPreferred;
        }
        const modalWindow = elements.jcModalWindowName ? String(elements.jcModalWindowName.value || "").trim().toUpperCase() : "";
        if (elements.jcModal && elements.jcModal.classList.contains("show") && ALL_WINDOWS.includes(modalWindow)) {
            return modalWindow;
        }
        const activeWindow = getActiveWindowName();
        if (ALL_WINDOWS.includes(activeWindow)) {
            return activeWindow;
        }
        const filterWindow = getWindowFilterValue();
        if (ALL_WINDOWS.includes(filterWindow)) {
            return filterWindow;
        }
        const contextClient = String(state.context && state.context.client || "").trim().toUpperCase();
        if (ALL_WINDOWS.includes(contextClient)) {
            return contextClient;
        }
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

    function createJcBadgeHtml(data) {
        const name = String((data && data.jcName) || "JC").trim() || "JC";
        const otdrDistance = String((data && data.otdrDistance) || "").trim();
        return otdrDistance ? `${name}<br>(${otdrDistance})` : name;
    }

    function createAfterLabelHtml(previousLabel) {
        const label = String(previousLabel || "").trim();
        return label ? `After<br>${label}` : "After";
    }

    function normalizePonValue(value) {
        return String(value || "").trim().toUpperCase();
    }

    function normalizeMacValue(value) {
        return String(value || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
    }

    function getMacMatchKey(value) {
        return normalizeMacValue(value).slice(0, 11);
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function normalizePonMode(value) {
        return String(value || "full").trim().toLowerCase() === "partial" ? "partial" : "full";
    }

    function buildPonOptionValue(ponValue, ponMode) {
        return `${normalizePonMode(ponMode)}::${normalizePonValue(ponValue)}`;
    }

    function parsePonSelection(value, fallbackMode) {
        const rawValue = String(value || "").trim();
        if (!rawValue) {
            return { ponMode: normalizePonMode(fallbackMode), oltpon: "" };
        }
        const parts = rawValue.split("::");
        if (parts.length === 2) {
            return {
                ponMode: normalizePonMode(parts[0]),
                oltpon: normalizePonValue(parts[1])
            };
        }
        return {
            ponMode: normalizePonMode(fallbackMode),
            oltpon: normalizePonValue(rawValue)
        };
    }

    function getPonOptionLabel(ponValue, ponMode) {
        const prefix = normalizePonMode(ponMode) === "partial" ? "Partial pon" : "Full pon";
        return `${prefix} ${normalizePonValue(ponValue)}`;
    }

    function formatPowerValue(value) {
        const text = String(value ?? "").trim();
        return text || "-";
    }

    function extractNormalizedMacAddresses(value) {
        const text = String(value || "");
        const uniqueValues = [];
        const seen = new Set();
        const matches = text.match(/(?:[0-9A-Fa-f]{2}[^0-9A-Fa-f]?){5}[0-9A-Fa-f]{2}/g) || text.split(/[\s,;]+/);
        matches.forEach((item) => {
            const normalizedValue = normalizeMacValue(item);
            if (normalizedValue.length !== 12 || seen.has(normalizedValue)) {
                return;
            }
            seen.add(normalizedValue);
            uniqueValues.push(normalizedValue);
        });
        return uniqueValues;
    }

    function escapeCsvValue(value) {
        const text = String(value ?? "");
        if (/[",\n]/.test(text)) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    }

    function createPonOptionsHtml(selectedValue, selectedPonMode) {
        const normalizedSelected = normalizePonValue(selectedValue);
        const normalizedPonMode = normalizePonMode(selectedPonMode);
        const options = state.ponOptions.slice();
        if (normalizedSelected && !options.includes(normalizedSelected)) {
            options.unshift(normalizedSelected);
        }
        const selectedOptionValue = normalizedSelected ? buildPonOptionValue(normalizedSelected, normalizedPonMode) : "";
        const placeholderOption = `<option value="" disabled ${selectedOptionValue ? "" : "selected"}>Select OLT PON</option>`;
        const optionHtml = options.map((option) => {
            const fullValue = buildPonOptionValue(option, "full");
            const partialValue = buildPonOptionValue(option, "partial");
            return `<option value="${fullValue}" ${fullValue === selectedOptionValue ? "selected" : ""}>${getPonOptionLabel(option, "full")}</option><option value="${partialValue}" ${partialValue === selectedOptionValue ? "selected" : ""}>${getPonOptionLabel(option, "partial")}</option>`;
        }).join("");
        return `${placeholderOption}${optionHtml}`;
    }

    function getPonTriggerLabel(selectedValue, selectedPonMode) {
        const normalizedSelected = normalizePonValue(selectedValue);
        if (!normalizedSelected) {
            return "Select OLT PON";
        }
        return getPonOptionLabel(normalizedSelected, selectedPonMode || "full");
    }

    function syncPonTrigger(selectElement, triggerElement) {
        if (!selectElement || !triggerElement) return;
        const selection = parsePonSelection(selectElement.value, selectElement.dataset.ponMode || "full");
        triggerElement.textContent = getPonTriggerLabel(selection.oltpon, selection.ponMode);
        triggerElement.dataset.ponMode = selection.ponMode;
        triggerElement.dataset.ponValue = selection.oltpon;
    }

    function renderPonPickerGroups() {
        if (!state.ponPicker || !elements.ponPickerFullList || !elements.ponPickerPartialList) return;
        const searchTerm = String(state.ponPicker.search || "").trim().toUpperCase();
        const options = state.ponOptions.filter((option) => !searchTerm || String(option).includes(searchTerm));
        const selectedValue = state.ponPicker.selectElement ? String(state.ponPicker.selectElement.value || "") : "";

        const renderGroup = (mode, host) => {
            if (!host) return;
            const isOpen = state.ponPicker.openMode === mode;
            host.classList.toggle("hidden", !isOpen);
            if (!isOpen) {
                host.innerHTML = "";
                return;
            }
            if (!options.length) {
                host.innerHTML = `<div class="pon-picker-empty">No PON found.</div>`;
                return;
            }
            host.innerHTML = options.map((option) => {
                const value = buildPonOptionValue(option, mode);
                return `<button type="button" class="pon-picker-option ${value === selectedValue ? "active" : ""}" data-value="${value}">${getPonOptionLabel(option, mode)}</button>`;
            }).join("");
            host.querySelectorAll(".pon-picker-option").forEach((button) => {
                button.addEventListener("click", () => {
                    if (!state.ponPicker || !state.ponPicker.selectElement) return;
                    state.ponPicker.selectElement.value = button.dataset.value || "";
                    const triggerElement = state.ponPicker.triggerElement;
                    syncPonTrigger(state.ponPicker.selectElement, triggerElement);
                    state.ponPicker.selectElement.dispatchEvent(new Event("change", { bubbles: true }));
                    closePonPicker();
                });
            });
        };

        elements.ponPickerFullToggle?.classList.toggle("active", state.ponPicker.openMode === "full");
        elements.ponPickerPartialToggle?.classList.toggle("active", state.ponPicker.openMode === "partial");
        renderGroup("full", elements.ponPickerFullList);
        renderGroup("partial", elements.ponPickerPartialList);
    }

    function openPonPicker(selectElement, triggerElement, title) {
        if (!selectElement || !triggerElement) return;
        const selection = parsePonSelection(selectElement.value, triggerElement.dataset.ponMode || selectElement.dataset.ponMode || "full");
        state.ponPicker = {
            selectElement,
            triggerElement,
            title: title || "Select OLT PON",
            openMode: selection.oltpon ? selection.ponMode : "",
            search: ""
        };
        if (elements.ponPickerTitle) elements.ponPickerTitle.textContent = title || "Select OLT PON";
        if (elements.ponPickerSearch) elements.ponPickerSearch.value = "";
        renderPonPickerGroups();
        elements.ponPickerModal?.classList.add("show");
        elements.ponPickerSearch?.focus();
    }

    function closePonPicker() {
        elements.ponPickerModal?.classList.remove("show");
        state.ponPicker = null;
    }

    function createJointOptionsHtml(selectedValue) {
        const normalizedSelected = String(selectedValue || "").trim();
        const options = jointOptions.slice();
        if (normalizedSelected && !options.includes(normalizedSelected)) {
            options.unshift(normalizedSelected);
        }
        return createSelectOptionsHtml(options, "Select Joint Name", normalizedSelected);
    }

    function createTubeOptionsHtml(selectedValue) {
        const normalizedSelected = normalizeCoreOptionValue(selectedValue);
        const placeholderOption = `<option value="" disabled ${normalizedSelected ? "" : "selected"}>Tube color</option>`;
        const options = coreOptions.slice();
        if (normalizedSelected && !options.includes(normalizedSelected)) {
            options.unshift(normalizedSelected);
        }
        const optionHtml = options.map((option) => `<option value="${option}" ${option === normalizedSelected ? "selected" : ""}>${option} tube</option>`).join("");
        return `${placeholderOption}${optionHtml}`;
    }

    function getCoreSortValue(value) {
        const text = String(value || "").trim();
        const match = text.match(/^(\d+)/);
        return {
            number: match ? Number(match[1]) : Number.POSITIVE_INFINITY,
            text: text.toLowerCase()
        };
    }

    function sortCoreDetails(coreData) {
        if (!Array.isArray(coreData) || !coreData.length) return Array.isArray(coreData) ? coreData : [];
        return coreData.slice().sort((left, right) => {
            const leftTubeValue = getCoreSortValue(left && left.tube);
            const rightTubeValue = getCoreSortValue(right && right.tube);
            if (leftTubeValue.number !== rightTubeValue.number) {
                return leftTubeValue.number - rightTubeValue.number;
            }
            if (leftTubeValue.text !== rightTubeValue.text) {
                return leftTubeValue.text.localeCompare(rightTubeValue.text);
            }
            const leftValue = getCoreSortValue(left && (left.coreColor || left.coreColorAndNumber));
            const rightValue = getCoreSortValue(right && (right.coreColor || right.coreColorAndNumber));
            if (leftValue.number !== rightValue.number) {
                return leftValue.number - rightValue.number;
            }
            return leftValue.text.localeCompare(rightValue.text);
        });
    }

    function createTubeGroup(title, tubeStyle) {
        const group = document.createElement("div");
        group.className = "tube-group";
        group.style.borderColor = tubeStyle.background;
        group.style.boxShadow = `0 0 0 3px ${tubeStyle.background}, 0 14px 28px rgba(34,76,102,.10), 0 0 20px ${tubeStyle.background}`;
        group.innerHTML = `
            <div class="tube-group-head">
                <span class="tube-group-swatch"></span>
                <span class="tube-group-title"></span>
            </div>
            <div class="tube-group-body"></div>
        `;
        const swatch = group.querySelector(".tube-group-swatch");
        const titleNode = group.querySelector(".tube-group-title");
        if (swatch) swatch.style.background = tubeStyle.background;
        if (titleNode) titleNode.textContent = title;
        return group;
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

    function getPartialPonStats(coreData) {
        const partialUsers = String(coreData && coreData.partialpon || "")
            .split(",")
            .map((item) => normalizeMacValue(item))
            .filter(Boolean);
        if (!partialUsers.length) {
            return { level: "gray", label: "No Data", percentage: null, onlineUsers: 0, activeUsers: 0 };
        }

        let activeUsers = 0;
        let onlineUsers = 0;
        partialUsers.forEach((macAddress) => {
            const userInfo = getUserStatusByMac(macAddress);
            if (!userInfo) return;
            if (String(userInfo.service_status || "").trim().toLowerCase() !== "active") return;
            activeUsers += 1;
            if (String(userInfo.status || "").trim().toUpperCase() === "UP") {
                onlineUsers += 1;
            }
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

    function getUserStatusByMac(macAddress) {
        const normalizedMac = getMacMatchKey(macAddress);
        if (!normalizedMac) return null;
        if (state.userStatusMap[normalizedMac]) {
            return state.userStatusMap[normalizedMac];
        }

        const keys = Object.keys(state.userStatusMap || {});
        for (const key of keys) {
            if (!key) continue;
            if (key.includes(normalizedMac) || normalizedMac.includes(key)) {
                return state.userStatusMap[key];
            }
        }
        return null;
    }

    function getCoreHealthMeta(coreData) {
        if (normalizePonMode(coreData && coreData.ponMode) === "partial") {
            return getPartialPonStats(coreData);
        }
        return getPonHealthMeta(coreData && coreData.oltpon);
    }

    function getCoreHealthKey(coreData) {
        if (normalizePonMode(coreData && coreData.ponMode) === "partial") {
            return `partial:${String(coreData && coreData.cuid || "")}:${String(coreData && coreData.partialpon || "")}`;
        }
        return `full:${normalizePonValue(coreData && coreData.oltpon)}`;
    }

    function getJcHealthMeta(boxData) {
        const ponSet = new Set();
        const wires = [...(boxData.inputWires || [])];
        let fullTotalPon = 0;
        let fullLivePon = 0;
        let partialTotalPon = 0;
        let partialLivePon = 0;
        wires.forEach((wire) => {
            (wire.coreDetails || []).forEach((core) => {
                const healthKey = getCoreHealthKey(core);
                if (healthKey) ponSet.add(healthKey);
            });
        });

        let totalPon = 0;
        let livePon = 0;
        Array.from(ponSet).forEach((healthKey) => {
            const coreData = wires.flatMap((wire) => wire.coreDetails || []).find((core) => getCoreHealthKey(core) === healthKey);
            const stats = getCoreHealthMeta(coreData || {});
            if (!stats || !stats.activeUsers) return;
            const isPartial = normalizePonMode(coreData && coreData.ponMode) === "partial";
            totalPon += 1;
            if (Number(stats.onlineUsers || 0) > 0) {
                livePon += 1;
            }
            if (isPartial) {
                partialTotalPon += 1;
                if (Number(stats.onlineUsers || 0) > 0) partialLivePon += 1;
            } else {
                fullTotalPon += 1;
                if (Number(stats.onlineUsers || 0) > 0) fullLivePon += 1;
            }
        });

        if (!totalPon) {
            return {
                level: "gray",
                label: "Pon 0/0",
                totalPon: 0,
                livePon: 0,
                fullPon: { level: "gray", totalPon: 0, livePon: 0 },
                partialPon: { level: "gray", totalPon: 0, livePon: 0 }
            };
        }

        const label = `Pon ${totalPon}/${livePon}`;
        const getSegmentLevel = (segmentTotal, segmentLive) => {
            if (!segmentTotal) return "gray";
            if (segmentLive === segmentTotal) return "green";
            if (segmentLive === 0) return "red";
            return "orange";
        };
        if (livePon === totalPon) {
            return {
                level: "green",
                label,
                totalPon,
                livePon,
                fullPon: { level: getSegmentLevel(fullTotalPon, fullLivePon), totalPon: fullTotalPon, livePon: fullLivePon },
                partialPon: { level: getSegmentLevel(partialTotalPon, partialLivePon), totalPon: partialTotalPon, livePon: partialLivePon }
            };
        }
        if (livePon === 0) {
            return {
                level: "red",
                label,
                totalPon,
                livePon,
                fullPon: { level: getSegmentLevel(fullTotalPon, fullLivePon), totalPon: fullTotalPon, livePon: fullLivePon },
                partialPon: { level: getSegmentLevel(partialTotalPon, partialLivePon), totalPon: partialTotalPon, livePon: partialLivePon }
            };
        }
        return {
            level: "green",
            label,
            totalPon,
            livePon,
            fullPon: { level: getSegmentLevel(fullTotalPon, fullLivePon), totalPon: fullTotalPon, livePon: fullLivePon },
            partialPon: { level: getSegmentLevel(partialTotalPon, partialLivePon), totalPon: partialTotalPon, livePon: partialLivePon }
        };
    }

    function createJcHealthLabelHtml(jcHealthMeta) {
        const fullPon = jcHealthMeta && jcHealthMeta.fullPon ? jcHealthMeta.fullPon : { level: "gray", totalPon: 0, livePon: 0 };
        const partialPon = jcHealthMeta && jcHealthMeta.partialPon ? jcHealthMeta.partialPon : { level: "gray", totalPon: 0, livePon: 0 };
        const segments = [];
        if (fullPon.totalPon > 0 || partialPon.totalPon === 0) {
            segments.push(`
                <span class="jc-health-segment">
                    <span class="core-led ${fullPon.level}"></span>
                    <span>FP- ${fullPon.totalPon}/${fullPon.livePon}</span>
                </span>
            `);
        }
        if (partialPon.totalPon > 0 || fullPon.totalPon === 0) {
            segments.push(`
                <span class="jc-health-segment">
                    <span class="core-led ${partialPon.level}"></span>
                    <span>PP- ${partialPon.totalPon}/${partialPon.livePon}</span>
                </span>
            `);
        }
        return segments.join("");
    }

    function getJcAlertLevel(boxData) {
        const jcHealthMeta = getJcHealthMeta(boxData);
        if (jcHealthMeta.level === "red") return "danger";
        if (jcHealthMeta.level === "orange") return "warning";
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
        const ponUserMap = {};
        const userStatusMap = {};
        users.forEach((item) => {
            const userdb = item && item.userdb ? item.userdb : {};
            const netsense = item && item.netsense ? item.netsense : {};
            const serviceStatus = String(userdb.service_status || "").trim().toLowerCase();
            const ponValue = normalizePonValue(netsense.pon_number);
            const normalizedMac = getMacMatchKey(userdb.normalized_mac_address || userdb.mac_address || netsense.normalized_mac_address || netsense.mac_address);
            if (normalizedMac) {
                userStatusMap[normalizedMac] = {
                    user_id: userdb.user_id || "",
                    name: userdb.name || "",
                    mobile: userdb.primary_phone || "",
                    address: userdb.address || "",
                    service_status: userdb.service_status || "",
                    status: netsense.status || "",
                    pon_number: netsense.pon_number || "",
                    window_name: netsense.window_name || "",
                    mac_address: userdb.mac_address || netsense.mac_address || "",
                    power: netsense.rxPower ?? netsense.txPower ?? ""
                };
            }
            if (serviceStatus !== "active" || !ponValue) return;
            if (!ponStats[ponValue]) {
                ponStats[ponValue] = { pon: ponValue, activeUsers: 0, onlineUsers: 0 };
            }
            if (!ponUserMap[ponValue]) {
                ponUserMap[ponValue] = [];
            }
                ponUserMap[ponValue].push({
                    user_id: userdb.user_id || "",
                    name: userdb.name || "",
                    mobile: userdb.primary_phone || "",
                    address: userdb.address || "",
                power: netsense.rxPower ?? netsense.txPower ?? "",
                status: netsense.status || "",
                mac_address: userdb.mac_address || netsense.mac_address || "",
                    normalized_mac_address: normalizedMac
                });
            ponStats[ponValue].activeUsers += 1;
            if (String(netsense.status || "").trim().toUpperCase() === "UP") {
                ponStats[ponValue].onlineUsers += 1;
            }
        });

        state.ponStats = ponStats;
        state.userStatusMap = userStatusMap;
        state.ponUserMap = ponUserMap;
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

    function getVisibleMapNodes() {
        return flattenJcNodes(state.visibleRows || [])
            .filter((node) => node && node.lat !== null && node.lng !== null)
            .map((node) => Object.assign({}, node, {
                jcName: String(node.jcName || "").trim(),
                previousJc: String(node.previousJc || "").trim(),
                otdrDistance: String(node.otdrDistance || "").trim(),
                healthMeta: getJcHealthMeta(node),
                lat: Number(node.lat),
                lng: Number(node.lng)
            }))
            .filter((node) => Number.isFinite(node.lat) && Number.isFinite(node.lng));
    }

    function createMapMarkerHtml(node) {
        const healthMeta = node && node.healthMeta ? node.healthMeta : { level: "gray", label: "Pon 0/0" };
        const titleHtml = node && node.otdrDistance
            ? `${String(node.jcName || "JC")}<br><span class="map-marker-otdr">(${String(node.otdrDistance)})</span>`
            : String(node && node.jcName || "JC");
        const previousHtml = node && node.previousJc ? `After ${String(node.previousJc)}` : "";
        return `
            <div class="map-jc-marker">
                <div class="map-jc-badge">${titleHtml}</div>
                <div class="map-jc-box">
                    <div class="map-jc-side left"></div>
                    <div class="map-jc-side right"></div>
                </div>
                <div class="map-jc-health"><span class="core-led ${healthMeta.level}"></span><span>${healthMeta.label}</span></div>
                ${previousHtml ? `<div class="map-jc-after">${previousHtml}</div>` : ""}
            </div>
        `;
    }

    function ensureLeafletMap() {
        if (state.jcMap || !elements.leafletMap || typeof window.L === "undefined") return state.jcMap;
        state.jcMap = window.L.map(elements.leafletMap, { zoomControl: true });
        window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors"
        }).addTo(state.jcMap);
        return state.jcMap;
    }

    function closeMapModal() {
        if (elements.mapModal) elements.mapModal.classList.remove("show");
        closeMapJcModal();
    }

    function closeMapJcModal() {
        if (elements.mapJcModal) elements.mapJcModal.classList.remove("show");
        if (elements.mapJcMount) elements.mapJcMount.innerHTML = "";
    }

    function openMapJcModal(node) {
        if (!elements.mapJcModal || !elements.mapJcMount) return;
        elements.mapJcMount.innerHTML = "";
        const host = document.createElement("div");
        host.className = "jc-note-root jc-map-popup-root";
        const box = createBox(node);
        host.appendChild(box);
        elements.mapJcMount.appendChild(host);
        if (elements.mapJcTitle) elements.mapJcTitle.textContent = node && node.jcName ? node.jcName : "JC Details";
        if (elements.mapJcSub) elements.mapJcSub.textContent = node && node.otdrDistance ? `OTDR ${node.otdrDistance}` : "Interactive JC view";
        elements.mapJcModal.classList.add("show");
        window.setTimeout(() => {
            const container = host.querySelector(".container");
            const wrapper = host.querySelector(".jc-wrapper");
            const left = container ? container.querySelector(".left") : null;
            const right = container ? container.querySelector(".right") : null;
            const leftPanel = container ? container.querySelector(".panel-left") : null;
            const rightPanel = container ? container.querySelector(".panel-right") : null;
            if (container && wrapper) {
                container.classList.add("active");
                wrapper.classList.add("active-box");
                if (left) left.classList.add("open");
                if (right) right.classList.add("open");
                if (leftPanel) leftPanel.classList.add("show");
                if (rightPanel) rightPanel.classList.add("show");
            }
        }, 0);
    }

    function openMapModal() {
        const nodes = getVisibleMapNodes();
        if (!nodes.length) {
            showNotice("Map View", "Visible JCs me location data available nahi hai.");
            return;
        }
        if (typeof window.L === "undefined") {
            showNotice("Map View", "Leaflet map library load nahi hui.");
            return;
        }
        const map = ensureLeafletMap();
        if (!map) return;

        state.jcMapMarkers.forEach((marker) => marker.remove());
        state.jcMapMarkers = nodes.map((node) => {
            const marker = window.L.marker([node.lat, node.lng], {
                icon: window.L.divIcon({
                    className: "jc-map-div-icon",
                    html: createMapMarkerHtml(node),
                    iconSize: [118, 92],
                    iconAnchor: [59, 70],
                    popupAnchor: [0, -64]
                })
            }).addTo(map);
            marker.on("click", () => {
                openMapJcModal(node);
            });
            return marker;
        });

        const bounds = window.L.latLngBounds(nodes.map((node) => [node.lat, node.lng]));
        if (elements.mapModalSub) {
            elements.mapModalSub.textContent = `${nodes.length} visible JC${nodes.length === 1 ? "" : "s"} plotted on OpenStreetMap`;
        }
        if (elements.mapModal) elements.mapModal.classList.add("show");
        window.setTimeout(() => {
            map.invalidateSize();
            if (nodes.length === 1) {
                map.setView([nodes[0].lat, nodes[0].lng], 16);
                state.jcMapMarkers[0].openPopup();
            } else {
                map.fitBounds(bounds.pad(0.18));
            }
        }, 0);
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
            core && core.joint,
            core && core.oltpon,
            core && core.ponMode,
            core && core.partialpon,
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
            blue: { background: "#2563eb", color: "#ffffff", border: "rgba(255,255,255,0.24)", fieldBackground: "rgba(255,255,255,0.16)", fieldBorder: "rgba(255,255,255,0.35)", buttonBackground: "#111827", buttonColor: "#ffffff" },
            orange: { background: "#f97316", color: "#ffffff", border: "rgba(255,255,255,0.24)", fieldBackground: "rgba(255,255,255,0.16)", fieldBorder: "rgba(255,255,255,0.35)", buttonBackground: "#111827", buttonColor: "#ffffff" },
            green: { background: "#16a34a", color: "#ffffff", border: "rgba(255,255,255,0.24)", fieldBackground: "rgba(255,255,255,0.16)", fieldBorder: "rgba(255,255,255,0.35)", buttonBackground: "#111827", buttonColor: "#ffffff" },
            brown: { background: "#8b5e3c", color: "#ffffff", border: "rgba(255,255,255,0.24)", fieldBackground: "rgba(255,255,255,0.16)", fieldBorder: "rgba(255,255,255,0.35)", buttonBackground: "#111827", buttonColor: "#ffffff" },
            grey: { background: "#64748b", color: "#ffffff", border: "rgba(255,255,255,0.24)", fieldBackground: "rgba(255,255,255,0.16)", fieldBorder: "rgba(255,255,255,0.35)", buttonBackground: "#111827", buttonColor: "#ffffff" },
            slate: { background: "#64748b", color: "#ffffff", border: "rgba(255,255,255,0.24)", fieldBackground: "rgba(255,255,255,0.16)", fieldBorder: "rgba(255,255,255,0.35)", buttonBackground: "#111827", buttonColor: "#ffffff" },
            white: { background: "#ffffff", color: "#0f172a", border: "#cbd5e1", fieldBackground: "#f8fafc", fieldBorder: "#94a3b8", buttonBackground: "#e2e8f0", buttonColor: "#0f172a" },
            red: { background: "#dc2626", color: "#ffffff", border: "rgba(255,255,255,0.24)", fieldBackground: "rgba(255,255,255,0.16)", fieldBorder: "rgba(255,255,255,0.35)", buttonBackground: "#111827", buttonColor: "#ffffff" },
            black: { background: "#111827", color: "#ffffff", border: "rgba(255,255,255,0.24)", fieldBackground: "rgba(255,255,255,0.16)", fieldBorder: "rgba(255,255,255,0.35)", buttonBackground: "#e5e7eb", buttonColor: "#111827" },
            yellow: { background: "#facc15", color: "#1f2937", border: "#eab308", fieldBackground: "rgba(255,255,255,0.46)", fieldBorder: "rgba(120,53,15,0.22)", buttonBackground: "#111827", buttonColor: "#ffffff" },
            purple: { background: "#7c3aed", color: "#ffffff", border: "rgba(255,255,255,0.24)", fieldBackground: "rgba(255,255,255,0.16)", fieldBorder: "rgba(255,255,255,0.35)", buttonBackground: "#111827", buttonColor: "#ffffff" },
            pink: { background: "#ec4899", color: "#ffffff", border: "rgba(255,255,255,0.24)", fieldBackground: "rgba(255,255,255,0.16)", fieldBorder: "rgba(255,255,255,0.35)", buttonBackground: "#111827", buttonColor: "#ffffff" },
            aqua: { background: "#7dd3fc", color: "#0f172a", border: "#38bdf8", fieldBackground: "rgba(255,255,255,0.52)", fieldBorder: "rgba(14,116,144,0.22)", buttonBackground: "#0f172a", buttonColor: "#ffffff" },
            "light blue": { background: "#7dd3fc", color: "#0f172a", border: "#38bdf8", fieldBackground: "rgba(255,255,255,0.52)", fieldBorder: "rgba(14,116,144,0.22)", buttonBackground: "#0f172a", buttonColor: "#ffffff" }
        };
        return palette[label] || { background: "#dbeafe", color: "#1e3a8a", border: "#93c5fd", fieldBackground: "rgba(255,255,255,0.42)", fieldBorder: "rgba(30,58,138,0.2)", buttonBackground: "#111827", buttonColor: "#ffffff" };
    }

    function normalizeCoreOptionValue(value) {
        const text = String(value || "").trim();
        if (!text) return "";
        if (text.endsWith(",Slate")) return `${text.slice(0, text.lastIndexOf(",") + 1)}Grey`;
        if (text.endsWith(",Light Blue")) return `${text.slice(0, text.lastIndexOf(",") + 1)}Aqua`;
        return text;
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
                const wireSide = String(child && child.inout || "").trim().toLowerCase() || getStoredWireSide(wireId) || "input";
                const cores = Array.isArray(child && child.children) ? child.children : Array.isArray(child && child.cores) ? child.cores : [];
                const coreDetails = cores
                    .filter((core) => {
                        const coreType = String(core && core.type || "").trim().toLowerCase();
                        return !coreType || coreType === "core";
                    })
                    .map((core) => ({
                        cuid: String(core && (core.CUID || core.cuid || core.id) || ""),
                        coreColor: normalizeCoreOptionValue(core && (core.corecolorandnumber || core.coreColorAndNumber || core.coreColor) ? String(core.corecolorandnumber || core.coreColorAndNumber || core.coreColor) : ""),
                        joint: core && core.joint ? String(core.joint) : "",
                        tube: normalizeCoreOptionValue(core && core.tube ? String(core.tube) : ""),
                        ponMode: normalizePonMode(core && (core.pon_mode || core.ponMode)),
                        oltpon: core && core.oltpon ? String(core.oltpon) : "",
                        partialpon: core && core.partialpon ? String(core.partialpon) : "",
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
                    inout: wireSide,
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

    function getOtdrDistanceSortValue(node) {
        const value = String(node && node.otdrDistance || "").trim();
        const match = value.match(/-?\d+(\.\d+)?/);
        return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
    }

    function sortTreeNodesByOtdr(nodes) {
        if (!Array.isArray(nodes) || !nodes.length) return nodes;

        nodes.forEach((node) => {
            if (Array.isArray(node && node.children) && node.children.length) {
                sortTreeNodesByOtdr(node.children);
            }
        });

        nodes.sort((left, right) => {
            const distanceDiff = getOtdrDistanceSortValue(left) - getOtdrDistanceSortValue(right);
            if (distanceDiff !== 0) return distanceDiff;
            return String(left && left.jcName || "").localeCompare(String(right && right.jcName || ""));
        });

        return nodes;
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

    function askModalConfirm(title, message, okLabel) {
        return new Promise((resolve) => {
            elements.confirmTitle.textContent = title;
            elements.confirmMessage.classList.remove("core-info-grid");
            elements.confirmMessage.textContent = message;
            elements.confirmModal.classList.add("show");
            elements.confirmCancelBtn.style.display = "";
            elements.confirmOkBtn.textContent = okLabel || "OK";

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
                elements.confirmOkBtn.textContent = "Delete";
                elements.confirmCancelBtn.removeEventListener("click", handleCancel);
                elements.confirmOkBtn.removeEventListener("click", handleOk);
                elements.confirmModal.removeEventListener("click", handleBackdrop);
            }

            elements.confirmCancelBtn.addEventListener("click", handleCancel);
            elements.confirmOkBtn.addEventListener("click", handleOk);
            elements.confirmModal.addEventListener("click", handleBackdrop);
        });
    }

    function getUsersForCore(coreData) {
        if (normalizePonMode(coreData && coreData.ponMode) === "partial") {
            return String(coreData && coreData.partialpon || "")
                .split(",")
                .map((item) => normalizeMacValue(item))
                .filter(Boolean)
                .map((macAddress) => getUserStatusByMac(macAddress))
                .filter(Boolean)
                .map((user) => ({
                    name: user.name || "",
                    user_id: user.user_id || "",
                    mobile: user.mobile || "",
                    address: user.address || "",
                    mac_address: user.mac_address || "",
                    power: user.power ?? "",
                    status: user.status || ""
                }));
        }
        return (state.ponUserMap[normalizePonValue(coreData && coreData.oltpon)] || []).slice();
    }

    function showCoreUsers(coreData) {
        const users = getUsersForCore(coreData);
        if (elements.usersModalTitle) {
            elements.usersModalTitle.textContent = coreData && coreData.oltpon ? getPonOptionLabel(coreData.oltpon, coreData.ponMode || "full") : "Users";
        }
        if (elements.usersModalSub) {
            elements.usersModalSub.textContent = `${users.length} user${users.length === 1 ? "" : "s"} loaded`;
        }
        if (elements.usersList) {
            if (!users.length) {
                elements.usersList.innerHTML = `<div class="jc-users-empty">No users found.</div>`;
            } else {
                elements.usersList.innerHTML = users.map((user) => `
                    <div class="jc-user-card ${String(user.status || "").trim().toUpperCase() === "DOWN" ? "is-down" : String(user.status || "").trim().toUpperCase() === "UP" ? "is-up" : ""}">
                        <div class="jc-user-row"><span>User Name</span><strong>${escapeHtml(user.name || "-")}</strong></div>
                        <div class="jc-user-row"><span>User ID</span><strong>${escapeHtml(user.user_id || "-")}</strong></div>
                        <div class="jc-user-row"><span>Mobile</span><strong>${escapeHtml(user.mobile || "-")}</strong></div>
                        <div class="jc-user-row"><span>Address</span><strong>${escapeHtml(user.address || "-")}</strong></div>
                        <div class="jc-user-row"><span>MAC Address</span><strong>${escapeHtml(user.mac_address || "-")}</strong></div>
                        <div class="jc-user-row"><span>Power</span><strong>${escapeHtml(formatPowerValue(user.power))}</strong></div>
                    </div>
                `).join("");
            }
        }
        elements.usersModal?.classList.add("show");
    }

    function closeUsersModal() {
        if (elements.usersModal) elements.usersModal.classList.remove("show");
        if (elements.usersList) elements.usersList.innerHTML = "";
    }

    function collectCsvRows(nodes, rows = []) {
        (nodes || []).forEach((node) => {
            const jcBase = {
                window: node.window || "",
                jc_name: node.jcName || "",
                previous_jc: node.previousJc || "",
                otdr_distance: node.otdrDistance || "",
                jc_remark: node.remark || "",
                jc_timestamp: node.timestamp || ""
            };
            [...(node.inputWires || []), ...(node.outputWires || [])].forEach((wire) => {
                if (!(wire.coreDetails || []).length) {
                    rows.push({
                        ...jcBase,
                        wire_side: wire.side || "",
                        wire_type: wire.wireType || "",
                        wire_drum: wire.wireDrum || "",
                        wire_live_cores: wire.liveCores || "",
                        wire_remark: wire.remark || "",
                        core_color: "",
                        core_tube: "",
                        core_joint: "",
                        pon_mode: "",
                        oltpon: "",
                        partialpon: "",
                        core_power: "",
                        core_remark: ""
                    });
                    return;
                }
                (wire.coreDetails || []).forEach((core) => {
                    rows.push({
                        ...jcBase,
                        wire_side: wire.side || "",
                        wire_type: wire.wireType || "",
                        wire_drum: wire.wireDrum || "",
                        wire_live_cores: wire.liveCores || "",
                        wire_remark: wire.remark || "",
                        core_color: core.coreColor || "",
                        core_tube: core.tube || "",
                        core_joint: core.joint || "",
                        pon_mode: core.ponMode || "",
                        oltpon: core.oltpon || "",
                        partialpon: core.partialpon || "",
                        core_power: core.power || "",
                        core_remark: core.remark || ""
                    });
                });
            });
            collectCsvRows(node.children || [], rows);
        });
        return rows;
    }

    function downloadCsvExport() {
        const rows = collectCsvRows(state.visibleRows || []);
        if (!rows.length) {
            showNotice("CSV Export", "No data available to download.");
            return;
        }
        const headers = [
            "window",
            "jc_name",
            "previous_jc",
            "otdr_distance",
            "jc_remark",
            "jc_timestamp",
            "wire_side",
            "wire_type",
            "wire_drum",
            "wire_live_cores",
            "wire_remark",
            "core_color",
            "core_tube",
            "core_joint",
            "pon_mode",
            "oltpon",
            "partialpon",
            "core_power",
            "core_remark"
        ];
        const lines = [
            headers.join(","),
            ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(","))
        ];
        const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const windowName = String(state.context && state.context.windowName || "ALL").trim().toUpperCase();
        link.href = url;
        link.download = `jc-tree-${windowName.toLowerCase()}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
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
                ${state.selectedFiber && state.selectedFiber.dataset.side === "output" ? `
                <div class="core-info-item">
                    <span class="core-info-label">Joint</span>
                    <strong>${coreData.joint || "-"}</strong>
                </div>
                ` : `
                <div class="core-info-item">
                    <span class="core-info-label">PON Mode</span>
                    <strong>${normalizePonMode(coreData.ponMode) === "partial" ? "Partial pon" : "Full pon"}</strong>
                </div>
                <div class="core-info-item">
                    <span class="core-info-label">OLT PON</span>
                    <strong>${coreData.oltpon ? getPonOptionLabel(coreData.oltpon, coreData.ponMode || "full") : "-"}</strong>
                </div>
                <div class="core-info-item">
                    <span class="core-info-label">PON Status</span>
                    <strong>${getCoreHealthMeta(coreData).label}</strong>
                </div>
                ${normalizePonMode(coreData.ponMode) === "partial" ? `
                <div class="core-info-item core-info-item-full">
                    <span class="core-info-label">Partial Users</span>
                    <strong>${coreData.partialpon ? escapeHtml(coreData.partialpon) : "-"}</strong>
                </div>
                ` : ""}
                `}
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
                joint: card.querySelector(".core-joint") ? card.querySelector(".core-joint").value : (meta.joint || ""),
                ponMode: card.querySelector(".core-pon") ? parsePonSelection(card.querySelector(".core-pon").value, meta.ponMode || "full").ponMode : (meta.ponMode || "full"),
                oltpon: card.querySelector(".core-pon") ? parsePonSelection(card.querySelector(".core-pon").value, meta.ponMode || "full").oltpon : (meta.oltpon || ""),
                partialpon: meta.partialpon || "",
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
            joint: card.querySelector(".core-joint") ? String(card.querySelector(".core-joint").value || "").trim() : (meta.joint || ""),
            ponMode: card.querySelector(".core-pon") ? parsePonSelection(card.querySelector(".core-pon").value, meta.ponMode || "full").ponMode : (meta.ponMode || "full"),
            oltpon: card.querySelector(".core-pon") ? parsePonSelection(card.querySelector(".core-pon").value, meta.ponMode || "full").oltpon : (meta.oltpon || ""),
            partialpon: meta.partialpon || "",
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
        const ponField = card.querySelector(".core-pon");
        const ponTrigger = card.querySelector(".core-pon-trigger");
        if (!colorField) return;

        const allowedColors = getAllowedCoreOptions(card, tubeField ? tubeField.value : "");
        colorField.innerHTML = createSelectOptionsHtml(allowedColors, "Core Color and Number", currentData.coreColorAndNumber);
        if (currentData.coreColorAndNumber && allowedColors.includes(currentData.coreColorAndNumber)) {
            colorField.value = currentData.coreColorAndNumber;
        }

        if (tubeField) {
            tubeField.innerHTML = createTubeOptionsHtml(currentData.tube);
            if (currentData.tube) {
                tubeField.value = normalizeCoreOptionValue(currentData.tube);
            }
        }

        if (ponField) {
            ponField.innerHTML = createPonOptionsHtml(currentData.oltpon, currentData.ponMode);
            if (currentData.oltpon) {
                ponField.value = buildPonOptionValue(currentData.oltpon, currentData.ponMode);
            }
            ponField.dataset.ponMode = currentData.ponMode || "full";
            syncPonTrigger(ponField, ponTrigger);
        }
    }

    function refreshAllCoreCardOptions() {
        getCoreFormRows().forEach((card) => refreshCoreCardOptions(card));
    }

    async function validateInlineCoreSelection(card) {
        const needsTube = getWireTypeCoreCount() > 12;
        const isOutputSide = state.selectedFiber ? (state.selectedFiber.dataset.side === "output") : false;
        const coreData = getCoreCardData(card);
        if (!coreData.coreColorAndNumber) {
            await showNotice("Save Core", "Select core color and number.");
            return false;
        }
        if (needsTube && !coreData.tube) {
            await showNotice("Save Core", "Select tube.");
            return false;
        }
        if (isOutputSide) {
            if (!coreData.joint) {
                await showNotice("Save Core", "Select Joint Name.");
                return false;
            }
        } else if (!coreData.oltpon) {
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
                inout: state.selectedFiber.dataset.inout || state.selectedFiber.dataset.side || "input",
                wiretype: state.selectedFiber.dataset.wireType || "12 Core",
                livecores: nextLiveCoreCount,
                remark: state.selectedFiber.dataset.remark || ""
            });
            const createdCuid = await createCore({
                wuid: state.selectedFiber.dataset.wireUuid,
                juid: state.selectedFiber.dataset.juid,
                corecolorandnumber: coreData.coreColorAndNumber,
                joint: coreData.joint || "",
                tube: coreData.tube,
                pon_mode: coreData.ponMode || "full",
                oltpon: coreData.oltpon,
                partialpon: coreData.partialpon || "",
                power: coreData.power,
                remark: coreData.remark
            });
            if (normalizePonMode(coreData.ponMode) === "partial") {
                setBusy(false);
                await runPartialPonWorkflow({
                    cuid: createdCuid,
                    oltpon: coreData.oltpon,
                    windowName: getActiveWindowName()
                });
                setBusy(true);
            }
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
        const isOutputSide = state.selectedFiber ? (state.selectedFiber.dataset.side === "output") : (state.pendingWireCreation ? state.pendingWireCreation.side === "output" : false);
        const sortedCoreData = sortCoreDetails(coreData);
        const tubeGroups = new Map();
        for (let i = 1; i <= count; i++) {
            const currentCore = (sortedCoreData && sortedCoreData[i - 1]) || {};
            const hasSavedCore = Boolean(currentCore.cuid);
            const healthMeta = getCoreHealthMeta(currentCore);
            const tubeStyle = getCoreVisualStyle(currentCore.tube);
            const card = document.createElement("div");
            card.className = "core-card";
            card.dataset.coreMeta = JSON.stringify({
                cuid: currentCore.cuid || "",
                tube: currentCore.tube || "",
                joint: currentCore.joint || "",
                ponMode: currentCore.ponMode || "full",
                oltpon: currentCore.oltpon || "",
                partialpon: currentCore.partialpon || ""
            });
            card.innerHTML = `
                <div class="title-row">
                    <div class="core-title-left">
                        ${isOutputSide ? "" : `<span class="core-led ${healthMeta.level}" title="${healthMeta.label}"></span>`}
                        <h4>Live Core ${i}</h4>
                        ${isOutputSide ? "" : `<button type="button" class="core-led-label core-users-trigger">${healthMeta.label}</button>`}
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
                    ${needsTube ? `<div class="field"><select class="core-tube" ${hasSavedCore ? "disabled" : ""}>${createTubeOptionsHtml(currentCore.tube || "")}</select></div>` : ""}
                    ${isOutputSide ? `<div class="field"><select class="core-joint" ${hasSavedCore ? "disabled" : ""}>${createJointOptionsHtml(currentCore.joint || "")}</select></div>` : `<div class="field"><button type="button" class="core-pon-trigger pon-picker-trigger" ${hasSavedCore ? "disabled" : ""}>Select OLT PON</button><select class="core-pon hidden" ${hasSavedCore ? "disabled" : ""}>${createPonOptionsHtml(currentCore.oltpon || "", currentCore.ponMode || "full")}</select></div>`}
                    <div class="field">
                        <input class="core-power" type="text" placeholder="Power" ${hasSavedCore ? "disabled" : ""}>
                    </div>
                    <div class="field">
                        <input class="core-remark" type="text" placeholder="${isOutputSide ? "Remarks if any" : "Area"}" ${hasSavedCore ? "disabled" : ""}>
                    </div>
                </div>
            `;
            const colorField = card.querySelector(".core-color");
            const tubeField = card.querySelector(".core-tube");
            const jointField = card.querySelector(".core-joint");
            const ponField = card.querySelector(".core-pon");
            const ponTrigger = card.querySelector(".core-pon-trigger");
            const powerField = card.querySelector(".core-power");
            const remarkField = card.querySelector(".core-remark");
            refreshCoreCardOptions(card);
            if (currentCore.coreColor) colorField.value = currentCore.coreColor;
            if (tubeField && currentCore.tube) tubeField.value = currentCore.tube;
            if (jointField && currentCore.joint) jointField.value = currentCore.joint;
            if (ponField && currentCore.oltpon) ponField.value = buildPonOptionValue(currentCore.oltpon, currentCore.ponMode || "full");
            if (ponField) ponField.dataset.ponMode = currentCore.ponMode || "full";
            if (powerField) powerField.value = currentCore.power || "";
            if (remarkField) remarkField.value = currentCore.remark || "";
            const coreStyle = getCoreVisualStyle(currentCore.coreColor);
            card.style.background = coreStyle.background;
            card.style.color = coreStyle.color;
            card.style.borderColor = coreStyle.border || "rgba(255,255,255,0.24)";
            card.style.borderWidth = "1px";
            card.style.boxShadow = "0 8px 18px rgba(34,76,102,.06)";
            card.querySelectorAll("h4, input, select").forEach((node) => {
                node.style.color = coreStyle.color;
            });
            card.querySelectorAll(".core-led-label").forEach((node) => {
                node.style.color = coreStyle.color;
            });
            card.querySelectorAll("input, select").forEach((node) => {
                node.style.borderColor = coreStyle.fieldBorder || "rgba(255,255,255,0.35)";
                node.style.background = coreStyle.fieldBackground || "rgba(255,255,255,0.16)";
            });
            card.querySelectorAll(".delete-core, .edit-core").forEach((button) => {
                button.style.background = coreStyle.buttonBackground || "#111827";
                button.style.color = coreStyle.buttonColor || "#ffffff";
                button.style.border = `1px solid ${coreStyle.buttonBackground || "rgba(17, 24, 39, 0.9)"}`;
            });
            const usersTrigger = card.querySelector(".core-users-trigger");
            if (usersTrigger) {
                usersTrigger.addEventListener("click", (event) => {
                    event.stopPropagation();
                    showCoreUsers(currentCore);
                });
            }
            if (ponTrigger && ponField && !hasSavedCore) {
                syncPonTrigger(ponField, ponTrigger);
                ponTrigger.addEventListener("click", (event) => {
                    event.stopPropagation();
                    openPonPicker(ponField, ponTrigger, "Select OLT PON");
                });
            }
            
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
                                inout: state.selectedFiber.dataset.inout || state.selectedFiber.dataset.side || "input",
                                wiretype: state.selectedFiber.dataset.wireType || "12 Core",
                                livecores: nextLiveCoreCount,
                                remark: state.selectedFiber.dataset.remark || ""
                            });
                            await requestJson(apiUrlFor(getActiveClient(getActiveWindowName()), `core/${cuid}`), { method: "DELETE" });
                            await refreshAndReopenWireModal(state.selectedFiber ? state.selectedFiber.dataset.wireUuid : "", state.selectedFiber ? state.selectedFiber.dataset.side : "", state.selectedFiber ? state.selectedFiber.dataset.juid : "");
                        } catch (error) {
                            showError(error);
                        } finally {
                            setBusy(false);
                        }
                    }
                } else {
                    const nextData = getCurrentCoreDataFromForm();
                    nextData[i - 1] = { cuid: "", coreColor: "", joint: "", tube: "", ponMode: "full", oltpon: "", partialpon: "", power: "", remark: "" };
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
                openCoreModal(Object.assign({}, currentCore, { joint: currentCore.joint || "" }), i);
            });
            if (!hasSavedCore) {
                colorField?.addEventListener("change", () => refreshAllCoreCardOptions());
                tubeField?.addEventListener("change", () => refreshAllCoreCardOptions());
                jointField?.addEventListener("change", () => {
                    const nextData = getCurrentCoreDataFromForm();
                    if (nextData[i - 1]) {
                        nextData[i - 1].joint = jointField.value;
                    }
                    buildCoreFields(Number(elements.liveCoresCountSelect.value), nextData);
                });
            }
            card.addEventListener("click", (event) => {
                if (event.target.closest("button, input, select, .field")) return;
                if (!hasSavedCore) return;
                showCoreDetails(currentCore);
            });
            
            if (needsTube) {
                const tubeValue = normalizeCoreOptionValue(currentCore.tube || "");
                const tubeKey = tubeValue || "__no_tube__";
                let tubeGroup = tubeGroups.get(tubeKey);
                if (!tubeGroup) {
                    tubeGroup = createTubeGroup(tubeValue ? `${tubeValue} tube` : "Tube not selected", tubeValue ? tubeStyle : { background: "#cfe0eb" });
                    tubeGroups.set(tubeKey, tubeGroup);
                    elements.coreList.appendChild(tubeGroup);
                }
                tubeGroup.querySelector(".tube-group-body")?.appendChild(card);
            } else {
                elements.coreList.appendChild(card);
            }
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
            const parts = [type, side === "input" ? `Live Pon ${live}` : `Live Core ${live}`];
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
        line.dataset.inout = data.inout || data.side || line.dataset.inout || "";
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
            inout: line.dataset.inout || line.dataset.side || "",
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
            inout: state.selectedFiber ? (state.selectedFiber.dataset.inout || state.selectedFiber.dataset.side || "") : (state.pendingWireCreation ? state.pendingWireCreation.side : ""),
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
        const isOutputSide = state.selectedFiber ? (state.selectedFiber.dataset.side === "output") : false;
        elements.coreColor.value = normalizeCoreOptionValue(data.coreColorAndNumber || data.coreColor || "");
        if (elements.coreTube) {
            elements.coreTube.innerHTML = createTubeOptionsHtml(data.tube || "");
            elements.coreTube.value = normalizeCoreOptionValue(data.tube || "");
        }
        elements.coreOltpon.innerHTML = createPonOptionsHtml(data.oltpon || "", data.ponMode || "full");
        elements.coreOltpon.value = data.oltpon ? buildPonOptionValue(data.oltpon || "", data.ponMode || "full") : "";
        elements.coreOltpon.dataset.ponMode = data.ponMode || "full";
        syncPonTrigger(elements.coreOltpon, elements.coreOltponTrigger);
        if (elements.coreJoint) {
            elements.coreJoint.innerHTML = createJointOptionsHtml(data.joint || "");
            elements.coreJoint.value = String(data.joint || "").trim();
        }
        elements.corePower.value = data.power || "";
        elements.coreRemark.value = data.remark || "";
        elements.coreRemark.placeholder = isOutputSide ? "Remarks if any" : "Area";
        
        const needsTube = state.selectedFiber ? (parseInt(state.selectedFiber.dataset.wireType, 10) > 12) : false;
        elements.coreTubeWrap.classList.toggle("hidden", !needsTube);
        if (elements.coreOltponWrap) elements.coreOltponWrap.classList.toggle("hidden", isOutputSide);
        if (elements.coreJointWrap) elements.coreJointWrap.classList.toggle("hidden", !isOutputSide);
        
        elements.coreModalTitle.textContent = `Core ${index}`;
        elements.coreModalSub.textContent = data.cuid ? "Edit existing core" : "Create new core";
        
        if (elements.deleteCoreBtn) {
            elements.deleteCoreBtn.style.display = data.cuid ? "" : "none";
        }
        
        state.pendingCoreCreation = {
            cuid: data.cuid || null,
            wuid: wuid,
            juid: juid,
            index: index,
            ponMode: data.ponMode || "full",
            partialpon: data.partialpon || ""
        };
    }

    function getCoreModalData() {
        return {
            cuid: state.pendingCoreCreation ? state.pendingCoreCreation.cuid : null,
            wuid: state.pendingCoreCreation ? state.pendingCoreCreation.wuid : "",
            juid: state.pendingCoreCreation ? state.pendingCoreCreation.juid : "",
            coreColorAndNumber: elements.coreColor.value,
            joint: elements.coreJoint ? elements.coreJoint.value : "",
            tube: elements.coreTube ? elements.coreTube.value : "",
            ponMode: parsePonSelection(elements.coreOltpon.value, state.pendingCoreCreation && state.pendingCoreCreation.ponMode).ponMode,
            oltpon: parsePonSelection(elements.coreOltpon.value, state.pendingCoreCreation && state.pendingCoreCreation.ponMode).oltpon,
            partialpon: state.pendingCoreCreation ? (state.pendingCoreCreation.partialpon || "") : "",
            power: elements.corePower.value,
            remark: elements.coreRemark.value
        };
    }

    function validateCoreModalData(data) {
        const isOutputSide = state.selectedFiber ? (state.selectedFiber.dataset.side === "output") : false;
        if (!data.coreColorAndNumber) {
            alert("Select core color and number");
            return false;
        }
        const needsTube = state.selectedFiber ? (parseInt(state.selectedFiber.dataset.wireType, 10) > 12) : false;
        if (needsTube && !data.tube) {
            alert("Select tube");
            return false;
        }
        if (isOutputSide) {
            if (!data.joint) {
                alert("Select Joint Name");
                return false;
            }
        } else if (!data.oltpon) {
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
            ${hasLocation ? `<a class="jc-badge" href="${mapLink}" target="_blank" rel="noopener noreferrer">${createJcBadgeHtml(boxData)}</a>` : `<div class="jc-badge">${createJcBadgeHtml(boxData)}</div>`}
            <div class="jc-link"></div>
            <div class="jc-health-label">${createJcHealthLabelHtml(jcHealthMeta)}</div>
            <div class="jc-after-label">${createAfterLabelHtml(previousLabel)}</div>
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
        const response = await requestJson(apiUrlFor(getActiveClient(payload && payload.window), "jc/create"), {
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
        await requestJson(apiUrlFor(getActiveClient(payload && payload.window), `jc/${juid}`), {
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
        const response = await requestJson(apiUrlFor(getActiveClient(getActiveWindowName()), "wire/create"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                JUID: payload.juid,
                drum: payload.drum,
                otdrdistance: "",
                inout: payload.inout || payload.side || "input",
                wiretype: payload.wiretype,
                livecores: payload.livecores,
                remark: payload.remark || ""
            })
        });
        return response.WUID;
    }

    async function updateWire(wuid, payload) {
        await requestJson(apiUrlFor(getActiveClient(getActiveWindowName()), `wire/${wuid}`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                drum: payload.drum,
                otdrdistance: "",
                inout: payload.inout || payload.side || "input",
                wiretype: payload.wiretype,
                livecores: payload.livecores,
                remark: payload.remark || ""
            })
        });
    }

    async function deleteWire(wuid) {
        await requestJson(apiUrlFor(getActiveClient(getActiveWindowName()), `wire/${wuid}`), {
            method: "DELETE"
        });
    }

    async function deleteJc(juid) {
        const selectedWindow = state.selectedBox ? String(state.selectedBox.dataset.window || "").trim().toUpperCase() : "";
        await requestJson(apiUrlFor(getActiveClient(selectedWindow), `jc/${juid}`), {
            method: "DELETE"
        });
    }

    async function createCore(payload) {
        const response = await requestJson(apiUrlFor(getActiveClient(getActiveWindowName()), "core/create"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                WUID: payload.wuid,
                JUID: payload.juid,
                corecolorandnumber: payload.corecolorandnumber,
                joint: payload.joint || "",
                tube: payload.tube || "",
                pon_mode: payload.pon_mode || "full",
                oltpon: payload.oltpon,
                partialpon: payload.partialpon || "",
                power: payload.power,
                remark: payload.remark || ""
            })
        });
        return response.CUID;
    }

    async function updateCore(cuid, payload, preferredWindow) {
        await requestJson(apiUrlFor(getActiveClient(preferredWindow || getActiveWindowName()), `core/${cuid}`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                corecolorandnumber: payload.corecolorandnumber,
                joint: payload.joint || "",
                tube: payload.tube || "",
                pon_mode: payload.pon_mode || "full",
                oltpon: payload.oltpon,
                partialpon: payload.partialpon || "",
                power: payload.power,
                remark: payload.remark || ""
            })
        });
    }

    async function deleteCore(cuid) {
        await requestJson(apiUrlFor(getActiveClient(getActiveWindowName()), `core/${cuid}`), {
            method: "DELETE"
        });
    }

    async function getPartialPonContext(windowName) {
        return requestJson(`${apiUrlFor(windowName, "partialpon/context")}?window=${encodeURIComponent(windowName)}`);
    }

    async function fetchPartialPonUsers(payload) {
        return requestJson(apiUrlFor(payload.window, "partialpon/fetch-users"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    }

    async function linkPartialPonUsers(payload) {
        return requestJson(apiUrlFor(payload.window, "partialpon/link-users"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    }

    function getActiveWindowName() {
        if (state.selectedFiber) {
            const container = state.selectedFiber.closest(".container");
            const windowName = container ? container.dataset.window : "";
            if (windowName) return String(windowName).trim().toUpperCase();
        }
        return String(state.context && state.context.windowName || "").trim().toUpperCase();
    }

    function updatePartialPonModalState(timestamp, message, buttonText, disabled, helperText) {
        if (elements.partialPonTimestamp) elements.partialPonTimestamp.textContent = `Timestamp: ${timestamp || "-"}`;
        if (elements.partialPonStatus) {
            const safeMessage = escapeHtml(message || "");
            const safeHelper = escapeHtml(helperText || "");
            elements.partialPonStatus.innerHTML = `<div class="partialpon-status-main">${safeMessage}</div>${safeHelper ? `<div class="partialpon-status-meta">${safeHelper}</div>` : ""}`;
            elements.partialPonStatus.classList.toggle("is-waiting", !!disabled);
        }
        if (elements.partialPonActionBtn) {
            elements.partialPonActionBtn.textContent = buttonText || "Fetch users";
            elements.partialPonActionBtn.disabled = !!disabled;
        }
    }

    async function waitForNewPartialPonTimestamp(windowName, previousTimestamp, waitingMessage) {
        let attempts = 0;
        while (attempts < 300) {
            await new Promise((resolve) => window.setTimeout(resolve, 2000));
            const response = await getPartialPonContext(windowName);
            const latestTimestamp = String(response && response.latest_timestamp || "").trim();
            const elapsedSeconds = (attempts + 1) * 2;
            const elapsedMinutes = Math.floor(elapsedSeconds / 60);
            const elapsedRemainder = elapsedSeconds % 60;
            const elapsedLabel = `${String(elapsedMinutes).padStart(2, "0")}:${String(elapsedRemainder).padStart(2, "0")}`;
            updatePartialPonModalState(
                latestTimestamp,
                waitingMessage,
                waitingMessage,
                true,
                `Live sync running. Elapsed ${elapsedLabel}. This can take up to 10 minutes.`
            );
            if (latestTimestamp && latestTimestamp !== String(previousTimestamp || "").trim()) {
                return latestTimestamp;
            }
            attempts += 1;
        }
        throw new Error("New timestamp not received within 10 minutes.");
    }

    function runPartialPonWorkflow(config) {
        return new Promise(async (resolve, reject) => {
            const windowName = String(config && config.windowName || "").trim().toUpperCase();
            const oltpon = normalizePonValue(config && config.oltpon);
            const cuid = String(config && config.cuid || "").trim();
            if (!windowName || !oltpon || !cuid) {
                reject(new Error("Partial PON workflow needs saved core, window and OLT PON."));
                return;
            }

            let fetchResult = null;
            let currentTimestamp = "";
            let manualEntryMode = false;

            const setManualEntryState = (showButton, showInput) => {
                if (elements.partialPonManualBtn) {
                    elements.partialPonManualBtn.classList.toggle("hidden", !showButton);
                }
                if (elements.partialPonManualWrap) {
                    elements.partialPonManualWrap.classList.toggle("hidden", !showInput);
                }
            };

            const closeModal = () => {
                if (elements.partialPonModal) elements.partialPonModal.classList.remove("show");
                if (elements.partialPonActionBtn) elements.partialPonActionBtn.disabled = false;
                if (elements.closePartialPonBtn) elements.closePartialPonBtn.disabled = false;
                if (elements.partialPonManualInput) elements.partialPonManualInput.value = "";
                setManualEntryState(true, false);
                elements.partialPonActionBtn?.removeEventListener("click", handleAction);
                elements.partialPonManualBtn?.removeEventListener("click", handleManualEntry);
                elements.closePartialPonBtn?.removeEventListener("click", handleClose);
                elements.partialPonModal?.removeEventListener("click", handleBackdrop);
            };

            const handleClose = async () => {
                if (elements.partialPonActionBtn && elements.partialPonActionBtn.disabled) {
                    const shouldClose = await askModalConfirm("Close Partial PON", "Partial PON detection is still running. Close this popup anyway?", "Close");
                    if (!shouldClose) {
                        return;
                    }
                }
                closeModal();
                resolve(null);
            };

            const handleBackdrop = (event) => {
                if (event.target === elements.partialPonModal) {
                    handleClose();
                }
            };

            const handleManualEntry = () => {
                manualEntryMode = true;
                setManualEntryState(false, true);
                updatePartialPonModalState(
                    currentTimestamp,
                    "Paste MAC addresses and save manual users.",
                    "Save manual users",
                    false,
                    "MAC list will be normalized and stored as comma-separated values."
                );
                elements.partialPonManualInput?.focus();
            };

            const handleAction = async () => {
                try {
                    if (manualEntryMode) {
                        const macAddresses = extractNormalizedMacAddresses(elements.partialPonManualInput ? elements.partialPonManualInput.value : "");
                        if (!macAddresses.length) {
                            await showNotice("Manual user entry", "Paste at least one valid MAC address.");
                            return;
                        }
                        await updateCore(cuid, {
                            pon_mode: "partial",
                            oltpon: oltpon,
                            partialpon: macAddresses.join(",")
                        }, windowName);
                        closeModal();
                        await showNotice("Partial PON", `${macAddresses.length} manual user${macAddresses.length === 1 ? "" : "s"} saved successfully.`);
                        resolve({
                            status: "success",
                            window: windowName,
                            oltpon: oltpon,
                            CUID: Number(cuid),
                            latest_timestamp: currentTimestamp,
                            partialpon: macAddresses.join(","),
                            users: [],
                            mac_addresses: macAddresses,
                            count: macAddresses.length
                        });
                        return;
                    }

                    if (!fetchResult) {
                        setManualEntryState(false, false);
                        updatePartialPonModalState(
                            currentTimestamp,
                            "Fetching please wait",
                            "Fetching please wait",
                            true,
                            "Waiting for a fresh timestamp after core break."
                        );
                        const changedTimestamp = await waitForNewPartialPonTimestamp(windowName, currentTimestamp, "Fetching please wait");
                        fetchResult = await fetchPartialPonUsers({
                            window: windowName,
                            oltpon: oltpon,
                            since_timestamp: currentTimestamp
                        });
                        currentTimestamp = String(fetchResult && fetchResult.latest_timestamp || changedTimestamp || "").trim();
                        updatePartialPonModalState(
                            currentTimestamp,
                            `${Number(fetchResult && fetchResult.count || 0)} users captured. Join core and continue.`,
                            "Link live users on this core",
                            false
                        );
                        return;
                    }

                    updatePartialPonModalState(
                        currentTimestamp,
                        "Linking live users..",
                        "Linking live users..",
                        true,
                        "Waiting for a fresh timestamp after core joint."
                    );
                    const changedTimestamp = await waitForNewPartialPonTimestamp(windowName, currentTimestamp, "Linking live users..");
                    if (!Array.isArray(fetchResult && fetchResult.mac_addresses) || !fetchResult.mac_addresses.length) {
                        await updateCore(cuid, {
                            pon_mode: "partial",
                            oltpon: oltpon,
                            partialpon: ""
                        }, windowName);
                        currentTimestamp = String(changedTimestamp || "").trim();
                        closeModal();
                        await showNotice("Partial PON", "Zero users found. Partial PON saved successfully.");
                        resolve({
                            status: "success",
                            window: windowName,
                            oltpon: oltpon,
                            CUID: Number(cuid),
                            latest_timestamp: currentTimestamp,
                            partialpon: "",
                            users: [],
                            mac_addresses: [],
                            count: 0
                        });
                        return;
                    }
                    const linkResult = await linkPartialPonUsers({
                        CUID: Number(cuid),
                        window: windowName,
                        oltpon: oltpon,
                        since_timestamp: currentTimestamp,
                        mac_addresses: Array.isArray(fetchResult && fetchResult.mac_addresses) ? fetchResult.mac_addresses : []
                    });
                    currentTimestamp = String(linkResult && linkResult.latest_timestamp || changedTimestamp || "").trim();
                    closeModal();
                    await showNotice("Partial PON", "User linked successfully.");
                    resolve(linkResult);
                } catch (error) {
                    closeModal();
                    reject(error);
                }
            };

            try {
                const contextResponse = await getPartialPonContext(windowName);
                currentTimestamp = String(contextResponse && contextResponse.latest_timestamp || "").trim();
                if (elements.partialPonTitle) elements.partialPonTitle.textContent = getPonOptionLabel(oltpon, "partial");
                if (elements.partialPonSub) elements.partialPonSub.textContent = `Window ${windowName} | Core ${cuid}`;
                setManualEntryState(true, false);
                updatePartialPonModalState(
                    currentTimestamp,
                    "Break selected core and click Fetch users.(Instantly)",
                    "Fetch users",
                    false,
                    "The modal can stay open for long-running sync."
                );
                elements.partialPonActionBtn?.addEventListener("click", handleAction);
                elements.partialPonManualBtn?.addEventListener("click", handleManualEntry);
                elements.closePartialPonBtn?.addEventListener("click", handleClose);
                elements.partialPonModal?.addEventListener("click", handleBackdrop);
                elements.partialPonModal?.classList.add("show");
            } catch (error) {
                closeModal();
                reject(error);
            }
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
                    joint: core.joint || "",
                    tube: core.tube || "",
                    pon_mode: core.ponMode || "full",
                    oltpon: core.oltpon || "",
                    partialpon: core.partialpon || "",
                    power: core.power || "",
                    remark: core.remark || ""
                });
                existingCoreMap.delete(core.coreColor);
            } else {
                await createCore({
                    wuid: wireId,
                    juid: wireData.juid,
                    corecolorandnumber: core.coreColor,
                    joint: core.joint || "",
                    tube: core.tube || "",
                    pon_mode: core.ponMode || "full",
                    oltpon: core.oltpon || "",
                    partialpon: core.partialpon || "",
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
                state.userStatusMap = {};
            }
            let url = apiUrlFor(getActiveClient(state.context && state.context.windowName), "jctree");
            url += `?windows=${encodeURIComponent(getWindowQueryValue(state.context.windowName))}`;
            const response = await requestJson(url);
            const tree = Array.isArray(response.tree) ? response.tree : [];
            state.allRows = tree.map(normalizeTreeNode);
            sortTreeNodesByOtdr(state.allRows);
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
        state.visibleRows = visibleRows;

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
                    inout: wireData.inout || wireData.side || "input",
                    wiretype: wireData.wireType || "12 Core",
                    livecores: liveCores,
                    remark: wireData.remark || ""
                });
            } else {
                wireId = await createWire({
                    juid: wireData.juid,
                    drum: wireData.wireDrum || "",
                    inout: wireData.inout || wireData.side || "input",
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
                    inout: state.selectedFiber ? (state.selectedFiber.dataset.inout || state.selectedFiber.dataset.side || "input") : "input",
                    wiretype: state.selectedFiber ? state.selectedFiber.dataset.wireType || "12 Core" : "12 Core",
                    livecores: nextLiveCoreCount,
                    remark: state.selectedFiber ? state.selectedFiber.dataset.remark || "" : ""
                });
            }
            if (coreData.cuid) {
                await updateCore(coreData.cuid, {
                    corecolorandnumber: coreData.coreColorAndNumber,
                    joint: coreData.joint,
                    tube: coreData.tube,
                    pon_mode: coreData.ponMode || "full",
                    oltpon: coreData.oltpon,
                    partialpon: normalizePonMode(coreData.ponMode) === "partial" ? (coreData.partialpon || "") : "",
                    power: coreData.power,
                    remark: coreData.remark
                });
                if (normalizePonMode(coreData.ponMode) === "partial") {
                    setBusy(false);
                    await runPartialPonWorkflow({
                        cuid: coreData.cuid,
                        oltpon: coreData.oltpon,
                        windowName: getActiveWindowName()
                    });
                    setBusy(true);
                }
            } else {
                const createdCuid = await createCore({
                    wuid: coreData.wuid,
                    juid: coreData.juid,
                    corecolorandnumber: coreData.coreColorAndNumber,
                    joint: coreData.joint,
                    tube: coreData.tube,
                    pon_mode: coreData.ponMode || "full",
                    oltpon: coreData.oltpon,
                    partialpon: normalizePonMode(coreData.ponMode) === "partial" ? (coreData.partialpon || "") : "",
                    power: coreData.power,
                    remark: coreData.remark
                });
                if (normalizePonMode(coreData.ponMode) === "partial") {
                    setBusy(false);
                    await runPartialPonWorkflow({
                        cuid: createdCuid,
                        oltpon: coreData.oltpon,
                        windowName: getActiveWindowName()
                    });
                    setBusy(true);
                }
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
        if (elements.downloadCsvBtn) {
            elements.downloadCsvBtn.addEventListener("click", downloadCsvExport);
        }
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
        if (elements.coreOltponTrigger && elements.coreOltpon) {
            elements.coreOltponTrigger.addEventListener("click", () => openPonPicker(elements.coreOltpon, elements.coreOltponTrigger, "Select OLT PON"));
        }
        if (elements.closeUsersModalBtn) {
            elements.closeUsersModalBtn.addEventListener("click", closeUsersModal);
        }
        if (elements.usersModal) {
            elements.usersModal.addEventListener("click", (event) => {
                if (event.target === elements.usersModal) closeUsersModal();
            });
        }
        if (elements.closePonPickerBtn) {
            elements.closePonPickerBtn.addEventListener("click", closePonPicker);
        }
        if (elements.ponPickerModal) {
            elements.ponPickerModal.addEventListener("click", (event) => {
                if (event.target === elements.ponPickerModal) closePonPicker();
            });
        }
        if (elements.ponPickerSearch) {
            elements.ponPickerSearch.addEventListener("input", () => {
                if (!state.ponPicker) return;
                state.ponPicker.search = elements.ponPickerSearch.value || "";
                renderPonPickerGroups();
            });
        }
        if (elements.ponPickerFullToggle) {
            elements.ponPickerFullToggle.addEventListener("click", () => {
                if (!state.ponPicker) return;
                state.ponPicker.openMode = state.ponPicker.openMode === "full" ? "" : "full";
                renderPonPickerGroups();
            });
        }
        if (elements.ponPickerPartialToggle) {
            elements.ponPickerPartialToggle.addEventListener("click", () => {
                if (!state.ponPicker) return;
                state.ponPicker.openMode = state.ponPicker.openMode === "partial" ? "" : "partial";
                renderPonPickerGroups();
            });
        }
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
                                    inout: state.selectedFiber ? (state.selectedFiber.dataset.inout || state.selectedFiber.dataset.side || "input") : "input",
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
        if (elements.showMapBtn) {
            elements.showMapBtn.addEventListener("click", openMapModal);
        }
        if (elements.closeMapModalBtn) {
            elements.closeMapModalBtn.addEventListener("click", closeMapModal);
        }
        if (elements.closeMapJcBtn) {
            elements.closeMapJcBtn.addEventListener("click", closeMapJcModal);
        }
        if (elements.mapModal) {
            elements.mapModal.addEventListener("click", (event) => {
                if (event.target === elements.mapModal) closeMapModal();
            });
        }
        if (elements.mapJcModal) {
            elements.mapJcModal.addEventListener("click", (event) => {
                if (event.target === elements.mapJcModal) closeMapJcModal();
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
