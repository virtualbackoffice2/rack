// Production Grade Configuration
const CONFIG = {
    API_BASE_URL: 'https://app.vbo.co.in',
    CURRENT_WINDOW: 'ALL',
    REFRESH_INTERVAL: 90000,
    SCREENSHOT_QUALITY: 2,
    MIN_DROPS_THRESHOLD: 3,
    MAX_PONS_PER_OLT: 16,
    PON_PATTERN: /^([A-Z0-9.-]+)P(\d+)$/i,
    WINDOWS: {
        'ALL': 'All Windows',
        'MEROTRA': 'MEROTRA',
        'SUNNY': 'SUNNY'
    },
    API_ENDPOINTS: {
        'MEROTRA': 'MEROTRA/complains',
        'SUNNY': 'SUNNY/complains'
    }
};

const state = {
    isLoading: false,
    isRefreshing: false,
    lastSyncTime: null,
    oltData: {},
    userData: [],
    selectedUsers: [],
    modalType: 'all',
    refreshIntervalId: null,
    discoveredOLTs: new Set(),
    totalStats: { users: 0, offline: 0, tickets: 0 },
    currentOltName: '',
    currentPonNumber: '',
    allWindowsData: {},
    activeWindows: [],
    pendingComplaintUser: null
};

const elements = {
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingDetails: document.getElementById('loadingDetails'),
    dataLoading: document.getElementById('dataLoading'),
    lastSyncTime: document.getElementById('lastSyncTime'),
    btnRefresh: document.getElementById('btnRefresh'),
    activeUsersStatBox: document.getElementById('activeUsersStatBox'),
    offlineStatBox: document.getElementById('offlineStatBox'),
    ticketStatBox: document.getElementById('ticketStatBox'),
    totalUsers: document.getElementById('totalUsers'),
    totalOffline: document.getElementById('totalOffline'),
    totalTickets: document.getElementById('totalTickets'),
    oltCount: document.getElementById('oltCount'),
    oltContainer: document.getElementById('oltContainer'),
    userModal: document.getElementById('userModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalSubtitle: document.getElementById('modalSubtitle'),
    modalBody: document.getElementById('modalBody'),
    currentUsersCount: document.getElementById('currentUsersCount'),
    modalTimestamp: document.getElementById('modalTimestamp'),
    btnDownloadCSV: document.getElementById('btnDownloadCSV'),
    btnModalScreenshot: document.getElementById('btnModalScreenshot'),
    btnCloseModal: document.getElementById('btnCloseModal'),
    btnQuickRefresh: document.getElementById('btnQuickRefresh'),
    btnScreenshot: document.getElementById('btnScreenshot'),
    toast: document.getElementById('toast'),
    windowSelector: document.getElementById('windowSelector'),
    mobileSearchFloat: document.getElementById('mobileSearchFloat'),
    mobileTotalUsers: document.getElementById('mobileTotalUsers'),
    mobileTotalOffline: document.getElementById('mobileTotalOffline'),
    mobileTotalTickets: document.getElementById('mobileTotalTickets'),
    mobileOltCount: document.getElementById('mobileOltCount'),
    mobileActiveUsersStatBox: document.getElementById('mobileActiveUsersStatBox'),
    mobileOfflineStatBox: document.getElementById('mobileOfflineStatBox'),
    mobileTicketStatBox: document.getElementById('mobileTicketStatBox'),
    mobileLastSyncTime: document.getElementById('mobileLastSyncTime'),
    mobileWindowSelector: document.getElementById('mobileWindowSelector'),
    globalSearchInput: document.getElementById('globalSearchInput'),
    btnGlobalSearch: document.getElementById('btnGlobalSearch'),
    mobileGlobalSearchInput: document.getElementById('mobileGlobalSearchInput'),
    mobileBtnGlobalSearch: document.getElementById('mobileBtnGlobalSearch'),
    complaintModal: document.getElementById('complaintModal'),
    complaintForm: document.getElementById('complaintForm'),
    complaintUserSummary: document.getElementById('complaintUserSummary'),
    complaintReason: document.getElementById('complaintReason'),
    complaintTeam: document.getElementById('complaintTeam'),
    complaintMode: document.getElementById('complaintMode'),
    btnCloseComplaint: document.getElementById('btnCloseComplaint'),
    btnCancelComplaint: document.getElementById('btnCancelComplaint'),
    btnSubmitComplaint: document.getElementById('btnSubmitComplaint')
};

const utils = {
    formatDateTime(date) {
        if (!date) return '--:--';
        const now = new Date();
        const syncDate = new Date(date);
        const diffMs = now - syncDate;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
        return syncDate.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    },
    formatTime(date) {
        if (!date) return '--:--';
        return new Date(date).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    },
    formatDBSyncTime(date) {
        if (!date) return '--:--';
        const parsed = new Date(date);
        if (Number.isNaN(parsed.getTime())) return '--:--';
        return parsed.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    },
    formatLastSeen(date) {
    if (!date) return 'N/A';

    const d = new Date(date);

    return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
},
    showToast(message, type = 'info', duration = 3000) {
        elements.toast.textContent = message;
        elements.toast.className = `toast ${type}`;
        elements.toast.classList.add('show');
        setTimeout(() => elements.toast.classList.remove('show'), duration);
    },
    updateLoading(show, message = 'Loading rack data...') {
        state.isLoading = show;
        if (show) {
            elements.loadingDetails.textContent = message;
            elements.loadingOverlay.style.display = 'flex';
            elements.dataLoading?.classList.add('active');
        } else {
            elements.loadingOverlay.style.display = 'none';
            elements.dataLoading?.classList.remove('active');
        }
    },
    showRefreshing(show) {
        state.isRefreshing = show;
        elements.btnRefresh?.classList.toggle('refreshing', show);
    },
    animateCounter(element, target) {
        if (!element) return;
        const current = parseInt(element.textContent) || 0;
        if (current === target) return;
        const duration = 500;
        const steps = 20;
        const increment = (target - current) / steps;
        let step = 0;
        const timer = setInterval(() => {
            step++;
            element.textContent = Math.round(current + (increment * step));
            if (step >= steps) {
                element.textContent = target;
                clearInterval(timer);
            }
        }, duration / steps);
    },
    parsePON(ponString) {
        if (!ponString || typeof ponString !== 'string') return null;
        const match = ponString.trim().match(CONFIG.PON_PATTERN);
        if (!match) return null;
        const olt = match[1].toUpperCase();
        const ponNumber = parseInt(match[2], 10);
        if (isNaN(ponNumber) || ponNumber < 1 || ponNumber > CONFIG.MAX_PONS_PER_OLT) return null;
        return { olt, ponNumber };
    },
    escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    },
    buildSearchText(user) {
        const normalized = Object.entries(user || {})
            .filter(([key, value]) => key !== 'raw' && (value === null || typeof value !== 'object'))
            .map(([, value]) => value ?? '')
            .join(' ');
        let raw = '';
        try {
            raw = JSON.stringify(user?.raw || {});
        } catch (error) {
            raw = '';
        }
        return `${normalized} ${raw}`.toLowerCase();
    },
    getTicketType(ticket) {
        const value = String(ticket || '').trim();
        const match = value.match(/^([^:]+):/);
        return match ? match[1].trim() : (value ? 'Complaint' : '');
    },
    normalizeData(user, windowName = '') {
        return {
            id: user.Users || user.user_id || '',
            name: user.Name || '',
            phone: user['Last called no'] || user.Number || '',
            power: user.Power ? Number(user.Power) : null,
            location: user.Location || user.address || '',
            status: user['User status'] || '',
            ticket: user.Ticket || '',
            drops: user.Drops || '',
            pon: user.PON || '',
            address: user.address || '',
            mac: user.MAC || '',
            window: windowName || CONFIG.CURRENT_WINDOW,
            lastSeen: user['Last Seen'] || '',
            serviceStatus: user["Service Status"] || '',
            complaintId: user.ComplaintID || user.id || '',
            remarks: user.Remarks || user.reason || '',
            team: user.Team || '',
            mode: user.Mode || '',
            downUsers: user.downusers || '',
            ticketType: this.getTicketType(user.Ticket),
            raw: user
        };
    },
    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    },
    generateOLTKey(oltName, windowName) {
        return `${windowName}_${oltName}`;
    },
    parseOLTKey(key) {
        const parts = key.split('_');
        if (parts.length >= 2) {
            return { windowName: parts[0], oltName: parts.slice(1).join('_') };
        }
        return { windowName: 'UNKNOWN', oltName: key };
    }
};

const apiService = {
    async fetchWindowData(windowName) {
        if (!CONFIG.API_ENDPOINTS[windowName]) return [];
        const url = `${CONFIG.API_BASE_URL}/${CONFIG.API_ENDPOINTS[windowName]}`;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            const response = await fetch(url, {
                headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return {
                window: windowName,
                data: Array.isArray(data.rows) ? data.rows : [],
                timestamp: data.runtime_timestamp || new Date().toISOString()
            };
        } catch (error) {
            console.error(`API Fetch Error for ${windowName}:`, error);
            return { window: windowName, data: [], timestamp: new Date().toISOString(), error: error.message };
        }
    },
    async fetchAllWindowsData(silent = false) {
        if (!silent) utils.updateLoading(true, `Fetching data from all windows...`);
        try {
            const windowNames = Object.keys(CONFIG.API_ENDPOINTS);
            const promises = windowNames.map(w => this.fetchWindowData(w));
            const results = await Promise.allSettled(promises);
            const successfulWindows = [];
            const allUsers = [];
            const syncTimestamps = [];
            results.forEach((result, index) => {
                const windowName = windowNames[index];
                if (result.status === 'fulfilled' && result.value.data.length > 0) {
                    successfulWindows.push(windowName);
                    const windowUsers = result.value.data.map(user => utils.normalizeData(user, windowName));
                    allUsers.push(...windowUsers);
                    state.allWindowsData[windowName] = {
                        users: windowUsers,
                        timestamp: result.value.timestamp,
                        count: windowUsers.length
                    };
                    if (result.value.timestamp) syncTimestamps.push(result.value.timestamp);
                } else {
                    state.allWindowsData[windowName] = { users: [], timestamp: new Date().toISOString(), count: 0 };
                }
            });
            state.activeWindows = successfulWindows;
            state.lastSyncTime = syncTimestamps.reduce((latest, value) => {
                const valueTime = new Date(value).getTime();
                const latestTime = new Date(latest || 0).getTime();
                return Number.isFinite(valueTime) && valueTime > latestTime ? value : latest;
            }, null);
            if (!silent) {
                utils.showToast(`Loaded ${successfulWindows.length} windows`, successfulWindows.length ? 'success' : 'error');
            }
            return allUsers;
        } catch (error) {
            if (!silent) utils.showToast('Failed to fetch some data', 'error');
            return [];
        } finally {
            if (!silent) utils.updateLoading(false);
        }
    },
    async fetchSingleWindowData(windowName, silent = false) {
        if (!silent) utils.updateLoading(true, `Fetching data from ${CONFIG.WINDOWS[windowName] || windowName}...`);
        try {
            const result = await this.fetchWindowData(windowName);
            if (result.error) throw new Error(result.error);
            state.activeWindows = [windowName];
            state.allWindowsData[windowName] = {
                users: result.data.map(user => utils.normalizeData(user, windowName)),
                timestamp: result.timestamp,
                count: result.data.length
            };
            state.lastSyncTime = result.timestamp;
            return state.allWindowsData[windowName].users;
        } catch (error) {
            if (!silent) utils.showToast(`Failed to fetch ${windowName} data`, 'error');
            throw error;
        } finally {
            if (!silent) utils.updateLoading(false);
        }
    },
    async fetchComplaintsData(silent = false) {
        return CONFIG.CURRENT_WINDOW === 'ALL' 
            ? this.fetchAllWindowsData(silent) 
            : this.fetchSingleWindowData(CONFIG.CURRENT_WINDOW, silent);
    },
    async hasOpenComplaint(user) {
        const windowName = String(user?.window || '').toUpperCase();
        if (!windowName || !user?.id) throw new Error('Complaint user details are incomplete');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch(
                `${CONFIG.API_BASE_URL}/${encodeURIComponent(windowName)}/heroesocr_user_complaints/${encodeURIComponent(user.id)}`,
                { headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' }, signal: controller.signal }
            );
            if (!response.ok) throw new Error(`Complaint check failed (HTTP ${response.status})`);
            const data = await response.json();
            return (Array.isArray(data.rows) ? data.rows : []).some(
                complaint => String(complaint.status || '').toLowerCase() === 'open'
            );
        } finally {
            clearTimeout(timeoutId);
        }
    },
    async markComplaint(user, details) {
        const windowName = String(user?.window || '').toUpperCase();
        if (!CONFIG.API_ENDPOINTS[windowName]) throw new Error('Invalid complaint window');

        const payload = {
            user_id: user.id || '',
            name: user.name || '',
            address: user.location || user.address || '',
            reason: details.reason || '',
            Mode: details.mode || 'Manual',
            Power: user.power,
            Phone: user.phone || '',
            Team: details.team || '()',
            pon: user.pon || '',
            window: windowName,
            statusUpDown: user.status || '',
            CreatedBy: 'User'
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/${encodeURIComponent(windowName)}/mark_complain`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || result.status !== 'ok') {
                throw new Error(result.message || `HTTP ${response.status}`);
            }
            return result;
        } finally {
            clearTimeout(timeoutId);
        }
    }
};

const dataProcessor = {
    processOLTData(users) {
        const oltData = {};
        const stats = { users: 0, offline: 0, tickets: 0 };
        const discoveredOLTs = new Set();

        users.forEach(user => {
            if (!user?.pon) return;
            const ponInfo = utils.parsePON(user.pon);
            if (!ponInfo) return;
            const { olt, ponNumber } = ponInfo;
            const oltKey = utils.generateOLTKey(olt, user.window);
            discoveredOLTs.add(oltKey);

            if (!oltData[oltKey]) {
                const { windowName, oltName } = utils.parseOLTKey(oltKey);
                oltData[oltKey] = {
                    key: oltKey,
                    name: oltName,
                    window: windowName,
                    displayName: `${oltName} (${CONFIG.WINDOWS[windowName] || windowName})`,
                    total: 0,
                    offline: 0,
                    tickets: 0,
                    pons: {}
                };
                for (let i = 1; i <= CONFIG.MAX_PONS_PER_OLT; i++) {
                    oltData[oltKey].pons[i] = { number: i, users: [], offline: [], tickets: [], drops: 0, hasProblems: false };
                }
            }
        });

        users.forEach(user => {
            const isActive = (user.serviceStatus || '').toLowerCase() === 'active';
            const hasTicket = !!user.ticket && user.ticket.trim() !== '';
            if (!isActive && !hasTicket) return;
            if (!user?.pon) return;
            const ponInfo = utils.parsePON(user.pon);
            if (!ponInfo) return;
            const oltKey = utils.generateOLTKey(ponInfo.olt, user.window);
            const oltObj = oltData[oltKey];
            const ponObj = oltObj?.pons[ponInfo.ponNumber];
            if (!oltObj || !ponObj) return;

            if (isActive) {
                oltObj.total++;
                stats.users++;
                ponObj.users.push(user);

                if (user.status === 'DOWN') {
                    oltObj.offline++;
                    stats.offline++;
                    ponObj.offline.push(user);
                }
                if (user.drops) {
                    ponObj.drops++;
                    if (ponObj.drops >= CONFIG.MIN_DROPS_THRESHOLD) ponObj.hasProblems = true;
                }
            }
            if (hasTicket) {
                oltObj.tickets++;
                stats.tickets++;
                ponObj.tickets.push(user);
            }
        });

        state.oltData = oltData;
        state.discoveredOLTs = discoveredOLTs;
        state.totalStats = stats;
        state.userData = users;

        elements.oltCount.textContent = `${discoveredOLTs.size} OLT${discoveredOLTs.size !== 1 ? 's' : ''}`;

        [elements.totalUsers, elements.mobileTotalUsers].forEach(el => utils.animateCounter(el, stats.users));
        [elements.totalOffline, elements.mobileTotalOffline].forEach(el => utils.animateCounter(el, stats.offline));
        [elements.totalTickets, elements.mobileTotalTickets].forEach(el => utils.animateCounter(el, stats.tickets));
        [elements.mobileOltCount].forEach(el => el && (el.textContent = discoveredOLTs.size));

        const syncTime = utils.formatDBSyncTime(state.lastSyncTime);
        [elements.lastSyncTime, elements.mobileLastSyncTime].forEach(el => el && (el.textContent = syncTime));

        return oltData;
    }
};

const uiRenderer = {
    initializeWindowSelector() {
        const populate = (selector) => {
            if (!selector) return;
            selector.innerHTML = '';
            const allOption = document.createElement('option');
            allOption.value = 'ALL';
            allOption.textContent = CONFIG.WINDOWS.ALL;
            selector.appendChild(allOption);
            Object.entries(CONFIG.WINDOWS).forEach(([key, value]) => {
                if (key !== 'ALL') {
                    const option = document.createElement('option');
                    option.value = key;
                    option.textContent = value;
                    selector.appendChild(option);
                }
            });
            selector.value = CONFIG.CURRENT_WINDOW;
        };
        populate(elements.windowSelector);
        populate(elements.mobileWindowSelector);
    },
    renderOLTCards(oltData) {
        elements.oltContainer.innerHTML = '';
        const oltKeys = Object.keys(oltData);
        if (oltKeys.length === 0) {
            elements.oltContainer.innerHTML = `<div class="no-data">
                <i class="fas fa-database"></i>
                <h3>No Rack Data Available</h3>
                <p>No OLTs found.</p>
            </div>`;
            return;
        }
        const sortedOltKeys = oltKeys.sort((a, b) => {
            const oa = oltData[a], ob = oltData[b];
            if (oa.window < ob.window) return -1;
            if (oa.window > ob.window) return 1;
            return oa.name.localeCompare(ob.name);
        });
        if (CONFIG.CURRENT_WINDOW === 'ALL') {
            let currentWindow = '';
            sortedOltKeys.forEach((key) => {
                const olt = oltData[key];
                if (olt.window !== currentWindow) {
                    currentWindow = olt.window;
                    elements.oltContainer.appendChild(this.createWindowHeader(olt.window));
                }
                elements.oltContainer.appendChild(this.createOLTCard(olt));
            });
        } else {
            elements.oltContainer.appendChild(this.createWindowHeader(CONFIG.CURRENT_WINDOW));
            sortedOltKeys.forEach(key => elements.oltContainer.appendChild(this.createOLTCard(oltData[key])));
        }
        setTimeout(() => {
            elements.oltContainer.querySelectorAll('.clickable-cell').forEach(cell => {
                cell.addEventListener('click', eventHandlers.handleCellClick);
            });
        }, 100);
    },
    createWindowHeader(windowName) {
        const header = document.createElement('div');
        header.className = 'window-header';
        const displayName = CONFIG.WINDOWS[windowName] || windowName;
        const data = state.allWindowsData[windowName];
        header.innerHTML = `
            <div class="window-header-content">
                <i class="fas fa-window-restore"></i>
                <div>
                    <h3>${displayName}</h3>
                    <div class="window-header-subtitle">
                        ${data?.count || 0} users • ${data ? 'Last updated: ' + utils.formatDateTime(data.timestamp) : 'No data'}
                    </div>
                </div>
            </div>
        `;
        return header;
    },
    createOLTCard(olt) {
        const card = document.createElement('div');
        card.className = 'olt-card';
        const activePons = Object.values(olt.pons).filter(p => p.users.length > 0).length;
        const windowBadge = CONFIG.CURRENT_WINDOW === 'ALL' ? `<span class="window-badge">${olt.window}</span>` : '';
        card.innerHTML = `
            <div class="olt-card-header">
                <div class="olt-name">
                    <i class="fas fa-server"></i>
                    <div>
                        <span>${olt.name} ${windowBadge}</span>
                        <div class="subtitle">
                            ${activePons} active PON${activePons !== 1 ? 's' : ''} • ${olt.total} Users
                        </div>
                    </div>
                </div>
                <div class="olt-stats">
                    <div class="olt-stat"><span class="olt-stat-label">Total</span><span class="olt-stat-value">${olt.total}</span></div>
                    <div class="olt-stat"><span class="olt-stat-label">Offline</span><span class="olt-stat-value">${olt.offline}</span></div>
                    <div class="olt-stat"><span class="olt-stat-label">Tickets</span><span class="olt-stat-value">${olt.tickets}</span></div>
                </div>
            </div>
            <div class="olt-card-body">
                <table class="olt-table">
                    <thead>
                        <tr>
                            <th>PON No</th>
                            <th>Live</th>
                            <th>Off</th>
                            <th>Comp</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Array.from({ length: CONFIG.MAX_PONS_PER_OLT }, (_, i) => {
                            const num = i + 1;
                            const pon = olt.pons[num];
                            if (pon.users.length === 0 && pon.tickets.length === 0 && !pon.hasProblems) return '';
                            const hasProblems = pon.hasProblems;
                            const statusIcon = hasProblems ? '<span class="status-problem" title="Multiple drops">🔴</span>' : '<span class="green-circle" title="Normal"></span>';
                            return `
                                <tr>
                                    <td class="pon-number-cell">
                                        <strong>PON ${num}</strong>
                                        <div class="pon-status-indicator ${hasProblems ? 'problem' : 'normal'}"></div>
                                        ${pon.drops > 0 ? `<span class="pon-details">${pon.drops} drop${pon.drops > 1 ? 's' : ''}</span>` : ''}
                                    </td>
                                    <td class="clickable-cell" data-olt="${olt.key}" data-pon="${num}" data-type="all">${pon.users.length}</td>
                                    <td class="clickable-cell" data-olt="${olt.key}" data-pon="${num}" data-type="offline">${pon.offline.length}</td>
                                    <td class="clickable-cell" data-olt="${olt.key}" data-pon="${num}" data-type="ticket">${pon.tickets.length}</td>
                                    <td class="status-cell ${hasProblems ? 'status-problem' : ''}">${statusIcon}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td class="pon-number-cell"><strong>${olt.name} Total</strong></td>
                            <td class="clickable-cell" data-olt="${olt.key}" data-type="olt-all">${olt.total}</td>
                            <td class="clickable-cell" data-olt="${olt.key}" data-type="olt-offline">${olt.offline}</td>
                            <td class="clickable-cell" data-olt="${olt.key}" data-type="olt-ticket">${olt.tickets}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
        return card;
    },
    renderUserModal(users, title, subtitle, oltKey = '', ponNumber = '') {
        elements.userModal?.querySelector('.modal-content')?.classList.remove('complaint-detail-modal');
        elements.modalTitle.textContent = title;
        elements.modalSubtitle.textContent = subtitle;
        elements.currentUsersCount.textContent = users.length;
        elements.modalTimestamp.textContent = utils.formatTime(new Date());
        state.selectedUsers = users;
        if (oltKey) {
            const parsed = utils.parseOLTKey(oltKey);
            state.currentOltName = parsed.oltName;
            state.currentPonNumber = ponNumber;
        }
        if (!users.length) {
            elements.modalBody.innerHTML = `<div class="no-data">
                <i class="fas fa-users-slash"></i>
                <h3>No Users Found</h3>
                <p>No users match this selection.</p>
            </div>`;
            elements.userModal.style.display = 'flex';
            document.body.classList.add('rack-modal-open');
            return;
        }

        const complaintOnlyTypes = new Set(['ticket', 'tickets', 'ticket-details']);
        const showComplaintAction = !complaintOnlyTypes.has(state.modalType);
        let tableHTML = `<table class="user-table"><thead><tr>
            <th>#</th><th>Name</th><th>User ID</th><th>Phone</th><th>Power</th><th>Location</th><th>Status</th><th>PON</th><th class="last-seen-column">Last Seen</th>${showComplaintAction ? '<th>MarkComp</th>' : ''}
        </tr></thead><tbody>`;

        users.forEach((user, index) => {
            const isOffline = user.status === 'DOWN';
            const hasTicket = !!user.ticket && user.ticket.trim() !== '';
            const rowClass = hasTicket ? 'highlight-ticket' : isOffline ? 'highlight-offline' : '';
            const ticketAttrs = hasTicket
                ? ` ticket-badge" role="button" tabindex="0" data-user-index="${index}" title="Show complaint details`
                : '';
            const badgeClass = hasTicket ? 'badge-ticket' : isOffline ? 'badge-danger' : 'badge-success';
            const statusBadge = `<span class="badge ${badgeClass}${ticketAttrs}">${isOffline ? 'Offline' : 'Online'}${hasTicket ? '<i class="fas fa-ticket-alt"></i>' : ''}</span>`;
            const location = String(user.location || 'N/A');
            const truncated = location.length > 40 ? `${location.substring(0, 37)}...` : location;
            const action = hasTicket
                ? '<span class="new-complaint-link inactive" aria-disabled="true" title="Complaint already open"><i class="fas fa-flag"></i></span>'
                : `<button type="button" class="new-complaint-link" data-user-index="${index}" title="Mark complaint" aria-label="Mark complaint for ${utils.escapeHTML(user.name || user.id)}"><i class="fas fa-flag"></i></button>`;

            tableHTML += `<tr class="${rowClass}">
                <td><strong>${index + 1}</strong></td>
                <td>${utils.escapeHTML(user.name || 'N/A')}</td>
                <td><code>${utils.escapeHTML(user.id || 'N/A')}</code></td>
                <td>${utils.escapeHTML(user.phone || 'N/A')}</td>
                <td>${Number.isFinite(user.power) ? user.power.toFixed(2) : 'N/A'}</td>
                <td title="${utils.escapeHTML(location)}">${utils.escapeHTML(truncated)}</td>
                <td>${statusBadge}</td>
                <td><code>${utils.escapeHTML(user.pon || 'N/A')}</code></td>
                <td class="last-seen-column">${user.lastSeen ? utils.escapeHTML(utils.formatLastSeen(user.lastSeen)) : 'N/A'}</td>
                ${showComplaintAction ? `<td class="mark-complaint-cell">${action}</td>` : ''}
            </tr>`;
        });
        tableHTML += `</tbody></table>`;
        elements.modalBody.innerHTML = tableHTML;
        elements.userModal.style.display = 'flex';
        document.body.classList.add('rack-modal-open');
    },
    renderComplaintDetailsModal(user) {
        const details = [
            ['Complaint ID', user.complaintId],
            ['Complaint', user.ticket],
            ['Remark', user.remarks],
            ['Type', user.ticketType],
            ['Team', user.team],
            ['Mode', user.mode],
            ['Window', user.window],
            ['PON', user.pon],
            ['User status', user.status],
            ['Service status', user.serviceStatus],
            ['Power', Number.isFinite(user.power) ? `${user.power.toFixed(2)} dBm` : ''],
            ['MAC', user.mac],
            ['Last Seen', user.lastSeen ? utils.formatLastSeen(user.lastSeen) : ''],
            ['Down users', user.downUsers],
            ['Location', user.location]
        ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');

        elements.userModal?.querySelector('.modal-content')?.classList.add('complaint-detail-modal');
        elements.modalTitle.textContent = `${user.name || 'N/A'} (${user.id || 'N/A'})`;
        elements.modalSubtitle.textContent = `Open complaint details • ${user.phone || 'No phone'}`;
        elements.currentUsersCount.textContent = '1';
        elements.modalTimestamp.textContent = utils.formatTime(new Date());
        state.selectedUsers = [user];
        state.modalType = 'ticket-details';
        elements.modalBody.innerHTML = `<table class="complaint-detail-table"><tbody>${details.map(([label, value]) => `
            <tr><th>${utils.escapeHTML(label)}</th><td>${utils.escapeHTML(value)}</td></tr>
        `).join('')}</tbody></table>`;
        elements.userModal.style.display = 'flex';
        document.body.classList.add('rack-modal-open');
    }
};

const screenshotService = {
    async captureElement(element, filename, tableSelector, info = {}) {
        utils.showToast('Capturing full screenshot...', 'info');

        const tempContainer = document.createElement('div');
        tempContainer.style.cssText = `
            position: fixed;
            left: -9999px;
            top: 0;
            width: 1400px;
            background: #ffffff;
            padding: 24px;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            z-index: 10000;
            overflow: visible;
            font-family: 'Inter', sans-serif;
        `;
        document.body.appendChild(tempContainer);

        const header = document.createElement('div');
        header.style.marginBottom = '20px';
        header.style.paddingBottom = '16px';
        header.style.borderBottom = '2px solid #3b82f6';
        header.innerHTML = `
            <h3 style="margin:0; color:#1e293b; font-size:20px;">${filename}</h3>
            <p style="margin:8px 0 0; color:#64748b; font-size:13px;">
                ${new Date().toLocaleString('en-IN')} | ${CONFIG.WINDOWS[CONFIG.CURRENT_WINDOW] || CONFIG.CURRENT_WINDOW}
            </p>
        `;
        tempContainer.appendChild(header);

        const contentToClone = element.querySelector(tableSelector || 'table') || element;
        const clonedContent = contentToClone.cloneNode(true);

        clonedContent.style.cssText = `
            width: 100% !important;
            max-width: 1350px !important;
            border-collapse: collapse !important;
            font-family: 'Inter', sans-serif !important;
            font-size: 13px !important;
            background: #ffffff !important;
            color: #1e293b !important;
            table-layout: auto !important;
        `;

        const allCells = clonedContent.querySelectorAll('td, th');
        allCells.forEach(cell => {
            if (cell.cellIndex === 5 || cell.textContent.includes('Location')) {
                cell.style.cssText = `
                    max-width: 220px !important;
                    min-width: 140px !important;
                    white-space: normal !important;
                    word-wrap: break-word !important;
                    word-break: break-word !important;
                    line-height: 1.4 !important;
                    padding: 10px 12px !important;
                    text-align: left !important;
                `;
            } else {
                cell.style.cssText = `
                    padding: 10px 12px !important;
                    white-space: nowrap !important;
                    text-align: center !important;
                `;
            }
        });

        const headerCells = clonedContent.querySelectorAll('th');
        headerCells.forEach(th => {
            th.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb) !important';
            th.style.color = 'white !important';
            th.style.fontWeight = '600 !important';
            th.style.textTransform = 'uppercase !important';
            th.style.letterSpacing = '0.05em !important';
        });

        const badges = clonedContent.querySelectorAll('.badge');
        badges.forEach(badge => {
            badge.style.padding = '4px 10px !important';
            badge.style.fontSize = '11px !important';
            badge.style.borderRadius = '20px !important';
        });

        tempContainer.appendChild(clonedContent);

        await new Promise(resolve => setTimeout(resolve, 100));

        const canvas = await html2canvas(tempContainer, {
            scale: CONFIG.SCREENSHOT_QUALITY || 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            windowWidth: tempContainer.scrollWidth,
            windowHeight: tempContainer.scrollHeight,
            scrollX: 0,
            scrollY: 0
        });

        const link = document.createElement('a');
        const safeName = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.download = `${safeName}-${timestamp}.png`;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();

        document.body.removeChild(tempContainer);
        utils.showToast('Full screenshot saved!', 'success');
    },

    captureDashboard() {
        this.captureElement(document.querySelector('.dashboard-container'), 
            `rack-dashboard-${CONFIG.CURRENT_WINDOW.toLowerCase()}`, 
            '.olt-container');
    },

    captureModal() {
        if (!state.selectedUsers.length) return utils.showToast('No users to capture', 'warning');
        this.captureElement(document.querySelector('.modal-content'), 
            `rack-users-${CONFIG.CURRENT_WINDOW.toLowerCase()}-${state.modalType}`, 
            '.user-table');
    }
};

const eventHandlers = {
    closeMobileSidebar() {
        document.getElementById('mobileSidebar')?.classList.remove('open');
        const toggle = document.getElementById('mobileMenuToggle');
        if (toggle) toggle.style.opacity = '1';
    },
    handleGlobalSearch(source = 'desktop') {
        const input = source === 'mobile' ? elements.mobileGlobalSearchInput : elements.globalSearchInput;
        const query = (input?.value || '').trim();
        if (query.length < 2) {
            utils.showToast('Type at least 2 characters to search', 'warning');
            return;
        }
        if (!state.userData.length) {
            utils.showToast('Data not loaded yet', 'warning');
            return;
        }

        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        const users = state.userData.filter(user => {
            const searchText = utils.buildSearchText(user);
            return terms.every(term => searchText.includes(term));
        });

        if (!users.length) {
            utils.showToast(`No users found for "${query}"`, 'warning');
            return;
        }

        state.modalType = 'search';
        uiRenderer.renderUserModal(
            users,
            'Search Results',
            `${users.length} user${users.length !== 1 ? 's' : ''} matched "${query}"`
        );
        if (source === 'mobile') this.closeMobileSidebar();
    },
    handleActiveUsersStatClick() {
        const users = state.userData.filter(user =>
            (user.serviceStatus || '').toLowerCase() === 'active' && utils.parsePON(user.pon)
        );
        state.modalType = 'active';
        uiRenderer.renderUserModal(users, 'Active Users', `${users.length} active users in the current selection`);
    },
    handleOfflineStatClick() {
        const users = state.userData.filter(user =>
            (user.serviceStatus || '').toLowerCase() === 'active' && user.status === 'DOWN' && utils.parsePON(user.pon)
        );
        state.modalType = 'offline';
        uiRenderer.renderUserModal(users, 'Offline Users', `${users.length} offline users in the current selection`);
    },
    handleTicketStatClick() {
        const users = state.userData.filter(user =>
            user.ticket && user.ticket.trim() !== '' && utils.parsePON(user.pon)
        );
        state.modalType = 'tickets';
        uiRenderer.renderUserModal(users, 'All Open Complaints', `${users.length} open complaints in the current selection`);
    },
    handleTicketBadgeOpen(event) {
        const badge = event.target.closest('.ticket-badge');
        if (!badge) return;
        const user = state.selectedUsers[Number(badge.dataset.userIndex)];
        if (!user) return;
        event.preventDefault();
        event.stopPropagation();
        uiRenderer.renderComplaintDetailsModal(user);
    },
    handleMarkComplaintClick(event) {
        const trigger = event.target.closest('.new-complaint-link');
        if (!trigger || trigger.classList.contains('inactive')) return;
        const user = state.selectedUsers[Number(trigger.dataset.userIndex)];
        if (!user || (user.ticket && user.ticket.trim() !== '')) return;
        event.preventDefault();
        event.stopPropagation();

        state.pendingComplaintUser = user;
        elements.complaintUserSummary.textContent = `${user.name || 'N/A'} • ${user.id || 'N/A'} • ${user.window || 'N/A'}`;
        elements.complaintReason.value = user.remarks || '';
        elements.complaintTeam.value = user.team || '()';
        elements.complaintMode.value = user.mode === 'Auto' ? 'Auto' : 'Manual';
        elements.complaintModal.hidden = false;
        document.body.classList.add('complaint-modal-open');
        window.setTimeout(() => elements.complaintReason?.focus(), 0);
    },
    closeComplaintModal() {
        elements.complaintModal.hidden = true;
        document.body.classList.remove('complaint-modal-open');
        state.pendingComplaintUser = null;
        elements.complaintForm?.reset();
        if (elements.complaintTeam) elements.complaintTeam.value = '()';
    },
    async handleComplaintSubmit(event) {
        event.preventDefault();
        const user = state.pendingComplaintUser;
        if (!user || elements.btnSubmitComplaint.disabled) return;

        elements.btnSubmitComplaint.disabled = true;
        elements.btnSubmitComplaint.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Marking...';
        try {
            if (await apiService.hasOpenComplaint(user)) {
                this.closeComplaintModal();
                this.handleCloseModal();
                utils.showToast('Complaint is already open for this user', 'warning', 5000);
                await this.handleRefresh(true);
                return;
            }
            await apiService.markComplaint(user, {
                reason: elements.complaintReason.value.trim(),
                team: elements.complaintTeam.value.trim() || '()',
                mode: elements.complaintMode.value
            });
            this.closeComplaintModal();
            this.handleCloseModal();
            utils.showToast('Complaint marked successfully', 'success');
            await this.handleRefresh(true);
        } catch (error) {
            console.error('Complaint mark failed:', error);
            utils.showToast(error.name === 'AbortError' ? 'Complaint request timed out' : (error.message || 'Complaint mark failed'), 'error', 5000);
        } finally {
            elements.btnSubmitComplaint.disabled = false;
            elements.btnSubmitComplaint.innerHTML = '<i class="fas fa-flag"></i> Mark Complaint';
        }
    },
    handleCellClick(event) {
        const cell = event.currentTarget;
        const oltKey = cell.dataset.olt;
        const pon = cell.dataset.pon;
        const type = cell.dataset.type;
        if (!oltKey || !type) return;

        let users = [];
        let title = '';
        let subtitle = '';

        const olt = state.oltData[oltKey];
        if (!olt) return;

        const { oltName, windowName } = utils.parseOLTKey(oltKey);
        const windowDisplay = CONFIG.WINDOWS[windowName] || windowName;

        if (type.startsWith('olt-')) {
            const filter = type.replace('olt-', '');
            if (filter === 'ticket') {
                // Sirf Repairs open complaints wale users (Ticket non-empty)
                users = Object.values(olt.pons).flatMap(ponData => 
                    ponData.tickets.filter(user => user.ticket && user.ticket.trim() !== '')
                );
                title = `Open Complaints - ${oltName}`;
                subtitle = `${users.length} users with open complaints in ${oltName} (${windowDisplay})`;
            } else {
                users = Object.values(olt.pons).flatMap(p => p[filter] || p.users);
                title = `${oltName} - ${filter.charAt(0).toUpperCase() + filter.slice(1)} Users`;
                subtitle = `${users.length} users in ${oltName} (${windowDisplay})`;
            }
            state.modalType = filter;
        } else {
            const ponNumber = parseInt(pon);
            const ponData = olt.pons[ponNumber];
            if (!ponData) return;

            if (type === 'ticket') {
                users = ponData.tickets.filter(user => user.ticket && user.ticket.trim() !== '');
                title = `${oltName}P${pon} - Open Complaints`;
                subtitle = `${users.length} users with open complaints in PON ${pon} (${windowDisplay})`;
            } else {
                users = ponData[type] || ponData.users;
                title = `${oltName}P${pon} - ${type.charAt(0).toUpperCase() + type.slice(1)} Users`;
                subtitle = `${users.length} users in PON ${pon} (${windowDisplay})`;
            }
            state.modalType = type;
        }

        uiRenderer.renderUserModal(users, title, subtitle, oltKey, pon);
    },
    async handleRefresh(silent = false) {
        if (state.isRefreshing) return;
        state.isRefreshing = true;
        utils.showRefreshing(true);
        if (!silent) utils.showToast('Refreshing data...', 'info');
        try {
            const users = await apiService.fetchComplaintsData(silent);
            const oltData = dataProcessor.processOLTData(users);
            elements.oltContainer.style.opacity = '0.7';
            setTimeout(() => {
                uiRenderer.renderOLTCards(oltData);
                elements.oltContainer.style.opacity = '1';
            }, 150);
            if (!silent) utils.showToast(`Loaded ${state.discoveredOLTs.size} OLTs`, 'success');
        } catch (error) {
            if (!silent) utils.showToast('Refresh failed', 'error');
        } finally {
            state.isRefreshing = false;
            utils.showRefreshing(false);
        }
    },
    handleDownloadCSV() {
        if (!state.selectedUsers.length) return utils.showToast('No users to export', 'warning');
        const headers = ['#', 'Name', 'User ID', 'Phone', 'Power (dBm)', 'Location', 'Status', 'Service Status', 'PON', 'Drops', 'Complaint ID', 'Complaint', 'Remark', 'Team', 'Mode', 'Window'];
        const rows = state.selectedUsers.map((u, i) => [
            i + 1,
            u.name || '',
            u.id || '',
            u.phone || '',
            Number.isFinite(u.power) ? u.power.toFixed(2) : '',
            u.location || '',
            u.status === 'DOWN' ? 'Offline' : 'Online',
            u.serviceStatus || '',
            u.pon || '',
            u.drops || '',
            u.complaintId || '',
            u.ticket || '',
            u.remarks || '',
            u.team || '',
            u.mode || '',
            u.window || ''
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `rack-users-${CONFIG.CURRENT_WINDOW.toLowerCase()}-${state.modalType}-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        utils.showToast('CSV exported', 'success');
    },
    handleCloseModal() {
        elements.userModal.style.display = 'none';
        document.body.classList.remove('rack-modal-open');
        elements.userModal?.querySelector('.modal-content')?.classList.remove('complaint-detail-modal');
        state.selectedUsers = [];
        state.currentOltName = '';
        state.currentPonNumber = '';
    }
};

const app = {
    async initialize() {
        uiRenderer.initializeWindowSelector();
        this.setupEventListeners();
        await eventHandlers.handleRefresh(false);
        state.refreshIntervalId = setInterval(() => eventHandlers.handleRefresh(true), CONFIG.REFRESH_INTERVAL);
        setTimeout(() => utils.showToast('Dashboard Ready', 'success', 2000), 1000);
    },
    setupEventListeners() {
        elements.windowSelector?.addEventListener('change', e => {
            CONFIG.CURRENT_WINDOW = e.target.value;
            elements.mobileWindowSelector.value = e.target.value;
            document.title = `Rack Dashboard | ${CONFIG.WINDOWS[CONFIG.CURRENT_WINDOW] || CONFIG.CURRENT_WINDOW}`;
            state.oltData = {};
            state.discoveredOLTs.clear();
            state.totalStats = { users: 0, offline: 0, tickets: 0 };
            elements.oltCount.textContent = '0 OLTs';
            elements.totalUsers.textContent = '0';
            elements.totalOffline.textContent = '0';
            elements.totalTickets.textContent = '0';
            elements.oltContainer.innerHTML = '';
            [elements.mobileTotalUsers, elements.mobileTotalOffline, elements.mobileTotalTickets, elements.mobileOltCount].forEach(el => el && (el.textContent = '0'));
            utils.showToast(`Switched to ${CONFIG.WINDOWS[CONFIG.CURRENT_WINDOW] || CONFIG.CURRENT_WINDOW}`, 'info');
            eventHandlers.handleRefresh(false);
        });
        elements.btnRefresh?.addEventListener('click', () => eventHandlers.handleRefresh(false));
        elements.btnQuickRefresh?.addEventListener('click', () => eventHandlers.handleRefresh(false));
        elements.btnDownloadCSV?.addEventListener('click', eventHandlers.handleDownloadCSV);
        elements.btnModalScreenshot?.addEventListener('click', () => screenshotService.captureModal());
        elements.btnCloseModal?.addEventListener('click', eventHandlers.handleCloseModal);
        elements.btnScreenshot?.addEventListener('click', () => screenshotService.captureDashboard());
        elements.btnGlobalSearch?.addEventListener('click', () => eventHandlers.handleGlobalSearch('desktop'));
        elements.globalSearchInput?.addEventListener('keydown', e => {
            if (e.key === 'Enter') eventHandlers.handleGlobalSearch('desktop');
        });
        const bindAccessibleStat = (element, handler) => {
            element?.addEventListener('click', handler);
            element?.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handler();
                }
            });
        };
        bindAccessibleStat(elements.activeUsersStatBox, eventHandlers.handleActiveUsersStatClick);
        bindAccessibleStat(elements.offlineStatBox, eventHandlers.handleOfflineStatClick);
        bindAccessibleStat(elements.ticketStatBox, eventHandlers.handleTicketStatClick);
        elements.modalBody?.addEventListener('click', eventHandlers.handleMarkComplaintClick);
        elements.modalBody?.addEventListener('click', eventHandlers.handleTicketBadgeOpen);
        elements.modalBody?.addEventListener('keydown', e => {
            if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.ticket-badge')) {
                eventHandlers.handleTicketBadgeOpen(e);
            }
        });
        elements.userModal?.addEventListener('click', e => {
            if (e.target === elements.userModal) eventHandlers.handleCloseModal();
        });
        elements.complaintForm?.addEventListener('submit', e => eventHandlers.handleComplaintSubmit(e));
        elements.btnCloseComplaint?.addEventListener('click', () => eventHandlers.closeComplaintModal());
        elements.btnCancelComplaint?.addEventListener('click', () => eventHandlers.closeComplaintModal());
        elements.complaintModal?.addEventListener('click', e => {
            if (e.target === elements.complaintModal) eventHandlers.closeComplaintModal();
        });
        document.getElementById('mobileMenuToggle')?.addEventListener('click', () => {
            document.getElementById('mobileSidebar').classList.add('open');
            document.getElementById('mobileMenuToggle').style.opacity = '0';
        });
        document.getElementById('mobileSidebarClose')?.addEventListener('click', () => {
            eventHandlers.closeMobileSidebar();
        });
        document.getElementById('mobileWindowSelector')?.addEventListener('change', e => {
            CONFIG.CURRENT_WINDOW = e.target.value;
            elements.windowSelector.value = e.target.value;
            utils.showToast(`Switched to ${CONFIG.WINDOWS[CONFIG.CURRENT_WINDOW] || CONFIG.CURRENT_WINDOW}`, 'info');
            eventHandlers.handleRefresh(false);
            eventHandlers.closeMobileSidebar();
        });
        document.getElementById('mobileBtnRefresh')?.addEventListener('click', () => {
            eventHandlers.handleRefresh(false);
            eventHandlers.closeMobileSidebar();
        });
        const syncMobileSearchFloat = () => {
            const hasValue = (elements.mobileGlobalSearchInput?.value || '').trim().length > 0;
            const hasFocus = document.activeElement === elements.mobileGlobalSearchInput;
            elements.mobileSearchFloat?.classList.toggle('expanded', hasValue || hasFocus);
        };
        elements.mobileBtnGlobalSearch?.addEventListener('click', () => {
            const query = (elements.mobileGlobalSearchInput?.value || '').trim();
            if (query.length < 2 && document.activeElement !== elements.mobileGlobalSearchInput) {
                elements.mobileSearchFloat?.classList.add('expanded');
                elements.mobileGlobalSearchInput?.focus();
                return;
            }
            eventHandlers.handleGlobalSearch('mobile');
        });
        elements.mobileGlobalSearchInput?.addEventListener('focus', syncMobileSearchFloat);
        elements.mobileGlobalSearchInput?.addEventListener('input', syncMobileSearchFloat);
        elements.mobileGlobalSearchInput?.addEventListener('blur', () => window.setTimeout(syncMobileSearchFloat, 120));
        elements.mobileGlobalSearchInput?.addEventListener('keydown', e => {
            if (e.key === 'Enter') eventHandlers.handleGlobalSearch('mobile');
        });
        const bindMobileStat = (element, handler) => {
            bindAccessibleStat(element, () => {
                handler();
                eventHandlers.closeMobileSidebar();
            });
        };
        bindMobileStat(elements.mobileActiveUsersStatBox, eventHandlers.handleActiveUsersStatClick);
        bindMobileStat(elements.mobileOfflineStatBox, eventHandlers.handleOfflineStatClick);
        bindMobileStat(elements.mobileTicketStatBox, eventHandlers.handleTicketStatClick);
        document.getElementById('mobileBtnScreenshot')?.addEventListener('click', () => {
            screenshotService.captureDashboard();
            eventHandlers.closeMobileSidebar();
        });
        document.getElementById('mobileBtnFullscreen')?.addEventListener('click', () => {
            if (!document.fullscreenElement) document.documentElement.requestFullscreen();
            else document.exitFullscreen();
            eventHandlers.closeMobileSidebar();
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && !elements.complaintModal.hidden) {
                eventHandlers.closeComplaintModal();
                return;
            }
            if (e.key === 'Escape' && elements.userModal.style.display === 'flex') eventHandlers.handleCloseModal();
            if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
                e.preventDefault();
                eventHandlers.handleRefresh(false);
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                screenshotService.captureDashboard();
            }
        });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && !state.isRefreshing) setTimeout(() => eventHandlers.handleRefresh(true), 1000);
        });
        window.addEventListener('resize', utils.debounce(() => {
            if (Object.keys(state.oltData).length > 0) uiRenderer.renderOLTCards(state.oltData);
        }, 250));
    },
    cleanup() {
        if (state.refreshIntervalId) clearInterval(state.refreshIntervalId);
    }
};

document.addEventListener('DOMContentLoaded', () => app.initialize());

window.addEventListener('beforeunload', () => app.cleanup());


