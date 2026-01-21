// ==================== CONFIGURATION ====================
const API_URLS = [
  "https://app.vbo.co.in/MEROTRA/heroesocr_full",
  "https://app.vbo.co.in/SUNNY/heroesocr_full"
];

const DAILY_TARGET = 4;
let ALL_DATA = [];
let CURRENT_DATA = [];
let CHARTS = {};
let MODAL_TYPE = 'all';
let MODAL_TASKS = [];

// ==================== UTILITY FUNCTIONS ====================
function showLoader(show) {
  document.getElementById('loader').style.display = show ? 'flex' : 'none';
}

function getPriority(pageId) {
  if (!pageId) return 3;
  const page = pageId.toLowerCase();
  if (page.includes('repair')) return 1;
  if (page.includes('install')) return 2;
  return 3;
}

function formatTime(minutes) {
  if (!minutes || minutes <= 0) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours/24).toFixed(1)}d`;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  try {
    if (dateStr.includes(' ')) {
      return new Date(dateStr.replace(' ', 'T'));
    } else if (dateStr.includes('-')) {
      return new Date(dateStr + 'T00:00:00');
    } else {
      return new Date(dateStr);
    }
  } catch (e) {
    console.warn('Date parse error:', dateStr, e);
    return null;
  }
}

// ==================== DATA PROCESSING FUNCTIONS ====================
function processComplaints(rawData, window) {
  // Group by user_id + page_id + reason combination
  const complaintsByKey = {};
  
  rawData.forEach(row => {
    const key = `${row.user_id}_${row.page_id}_${row.reason}`;
    
    if (!complaintsByKey[key]) {
      complaintsByKey[key] = [];
    }
    
    complaintsByKey[key].push({
      window: window,
      user_id: String(row.user_id || '').trim(),
      team: String(row.Team || 'UNKNOWN').trim(),
      page_id: String(row.page_id || 'UNKNOWN').trim(),
      reason: String(row.reason || '').trim(),
      name: String(row.name || '').trim(),
      address: String(row.address || '').trim(),
      status: String(row.status || '').toLowerCase(),
      created_at: String(row.created_at || ''),
      timestamp: parseDate(row.created_at)
    });
  });
  
  // Process each complaint group to get latest status
  const processedComplaints = [];
  
  Object.values(complaintsByKey).forEach(complaints => {
    // Sort by timestamp (oldest to newest)
    complaints.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    // Get the latest entry
    const latestComplaint = complaints[complaints.length - 1];
    
    // Calculate TAT if there was an open and then close
    let tatMinutes = null;
    let openTimestamp = null;
    let closeTimestamp = null;
    
    // Find the first open and last close
    for (const complaint of complaints) {
      if (complaint.status === 'open') {
        openTimestamp = complaint.timestamp;
      } else if (complaint.status === 'close') {
        closeTimestamp = complaint.timestamp;
      }
    }
    
    // If we have both open and close timestamps, calculate TAT
    if (openTimestamp && closeTimestamp && closeTimestamp > openTimestamp) {
      tatMinutes = (closeTimestamp - openTimestamp) / (1000 * 60);
    }
    
    // Create final complaint object with latest status
    const finalComplaint = {
      ...latestComplaint,
      tatMinutes: tatMinutes,
      priority: getPriority(latestComplaint.page_id),
      history: complaints, // Keep history for reference
      firstOpenAt: openTimestamp,
      lastCloseAt: closeTimestamp
    };
    
    processedComplaints.push(finalComplaint);
  });
  
  return processedComplaints;
}

// ==================== DATA FETCHING ====================
async function fetchAllData() {
  showLoader(true);
  
  try {
    const promises = API_URLS.map(async (url, index) => {
      try {
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        return {
          source: url.includes('MEROTRA') ? 'MEROTRA' : 'SUNNY',
          data: data.rows || []
        };
      } catch (error) {
        console.error(`Error fetching ${url}:`, error);
        return { source: url.includes('MEROTRA') ? 'MEROTRA' : 'SUNNY', data: [] };
      }
    });
    
    const results = await Promise.all(promises);
    
    // Process all data
    ALL_DATA = [];
    
    results.forEach(result => {
      const window = result.source;
      const rows = result.data;
      
      // Process complaints to get latest status for each user_id
      const processed = processComplaints(rows, window);
      ALL_DATA.push(...processed);
    });
    
    console.log('Data loaded:', {
      totalComplaints: ALL_DATA.length,
      windows: [...new Set(ALL_DATA.map(d => d.window))],
      teams: [...new Set(ALL_DATA.map(d => d.team))]
    });
    
    // Show data summary
    showDataSummary();
    
    updateFilters();
    applyFilters();
    
  } catch (error) {
    console.error('Critical error in fetchAllData:', error);
    alert('Error loading data. Please check console for details.');
  } finally {
    showLoader(false);
  }
}

// ==================== FILTER FUNCTIONS ====================
function updateFilters() {
  // Teams
  const teams = [...new Set(ALL_DATA.map(d => d.team).filter(t => t && t !== 'UNKNOWN'))].sort();
  const teamSelect = document.getElementById('filterTeam');
  teamSelect.innerHTML = '<option value="all">All Teams</option>' +
    teams.map(team => `<option value="${team}">${team}</option>`).join('');
  
  // Pages
  const pages = [...new Set(ALL_DATA.map(d => d.page_id).filter(p => p && p !== 'UNKNOWN'))].sort();
  const pageSelect = document.getElementById('filterPage');
  pageSelect.innerHTML = '<option value="all">All Pages</option>' +
    pages.map(page => `<option value="${page}">${page}</option>`).join('');
}

function applyFilters() {
  const windowFilter = document.getElementById('filterWindow').value;
  const teamFilter = document.getElementById('filterTeam').value;
  const pageFilter = document.getElementById('filterPage').value;
  const priorityFilter = document.getElementById('filterPriority').value;
  const dateRangeType = document.getElementById('filterDateRange').value;
  
  let dateRange = getDateRange(dateRangeType);
  
  // If custom range, use custom dates
  if (dateRangeType === 'custom') {
    const fromDate = document.getElementById('filterDateFrom').value;
    const toDate = document.getElementById('filterDateTo').value;
    
    if (fromDate && toDate) {
      dateRange = {
        from: new Date(fromDate),
        to: new Date(toDate)
      };
      dateRange.to.setHours(23, 59, 59, 999);
    }
  }
  
  CURRENT_DATA = ALL_DATA.filter(task => {
    // Window filter
    if (windowFilter !== 'all' && task.window !== windowFilter) return false;
    
    // Team filter
    if (teamFilter !== 'all' && task.team !== teamFilter) return false;
    
    // Page filter
    if (pageFilter !== 'all' && task.page_id !== pageFilter) return false;
    
    // Priority filter
    if (priorityFilter !== 'all' && String(task.priority) !== priorityFilter) return false;
    
    // Date filter (use latest timestamp)
    if (task.timestamp) {
      if (task.timestamp < dateRange.from || task.timestamp > dateRange.to) return false;
    }
    
    return true;
  });
  
  console.log('Filtered data:', {
    originalCount: ALL_DATA.length,
    filteredCount: CURRENT_DATA.length
  });
  
  updateDashboard();
  updateCharts();
  updateTeamTable();
}

// ==================== DATE RANGE FUNCTIONS ====================
function getDateRange(rangeType) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  switch(rangeType) {
    case 'today':
      return {
        from: new Date(today),
        to: new Date(today.setHours(23, 59, 59, 999))
      };
      
    case 'yesterday':
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return {
        from: yesterday,
        to: new Date(yesterday.setHours(23, 59, 59, 999))
      };
      
    case 'last7days':
      const last7 = new Date(today);
      last7.setDate(last7.getDate() - 6);
      return {
        from: last7,
        to: new Date(today.setHours(23, 59, 59, 999))
      };
      
    case 'last30days':
      const last30 = new Date(today);
      last30.setDate(last30.getDate() - 29);
      return {
        from: last30,
        to: new Date(today.setHours(23, 59, 59, 999))
      };
      
    case 'all':
      return {
        from: new Date('2020-01-01'),
        to: new Date('2030-12-31')
      };
      
    default:
      return {
        from: new Date('2020-01-01'),
        to: new Date('2030-12-31')
      };
  }
}

// ==================== DASHBOARD UPDATE ====================
function updateDashboard() {
  const total = CURRENT_DATA.length;
  const closed = CURRENT_DATA.filter(t => t.status === 'close').length;
  const open = CURRENT_DATA.filter(t => t.status === 'open').length;
  
  // Calculate average TAT only for closed complaints
  const closedWithTat = CURRENT_DATA.filter(t => t.status === 'close' && t.tatMinutes);
  const totalTat = closedWithTat.reduce((sum, task) => sum + task.tatMinutes, 0);
  const avgTat = closedWithTat.length > 0 ? totalTat / closedWithTat.length : 0;
  
  // Update UI
  document.getElementById('kpiTotal').textContent = total.toLocaleString();
  document.getElementById('kpiClosed').textContent = closed.toLocaleString();
  document.getElementById('kpiOpen').textContent = open.toLocaleString();
  document.getElementById('kpiTat').textContent = formatTime(avgTat);
}

// ==================== CHARTS ====================
function updateCharts() {
  // Priority Chart
  const priorityCtx = document.getElementById('chartPriority').getContext('2d');
  const priorityData = {
    'Repairs (P1)': CURRENT_DATA.filter(t => t.priority === 1).length,
    'Installation (P2)': CURRENT_DATA.filter(t => t.priority === 2).length,
    'Others (P3)': CURRENT_DATA.filter(t => t.priority === 3).length
  };
  
  if (window.priorityChart) window.priorityChart.destroy();
  
  window.priorityChart = new Chart(priorityCtx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(priorityData),
      datasets: [{
        data: Object.values(priorityData),
        backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6'],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw} tasks` } }
      }
    }
  });
  
  // Target Chart - Show today's tasks
  const today = new Date().toISOString().split('T')[0];
  const teams = [...new Set(CURRENT_DATA.map(t => t.team))].sort();
  const todayCounts = teams.map(team => {
    return CURRENT_DATA.filter(t => 
      t.team === team && 
      t.created_at && 
      t.created_at.includes(today)
    ).length;
  });
  
  const targetCtx = document.getElementById('chartTarget').getContext('2d');
  if (window.targetChart) window.targetChart.destroy();
  
  window.targetChart = new Chart(targetCtx, {
    type: 'bar',
    data: {
      labels: teams,
      datasets: [
        {
          label: "Today's Tasks",
          data: todayCounts,
          backgroundColor: todayCounts.map(count => 
            count >= DAILY_TARGET ? '#10b981' : count > 0 ? '#f59e0b' : '#ef4444'
          ),
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Number of Tasks' },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        x: { 
          grid: { display: false },
          ticks: { maxRotation: 45 }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

// ==================== TEAM TABLE ====================
function updateTeamTable() {
  const teams = [...new Set(CURRENT_DATA.map(t => t.team))].sort();
  const today = new Date().toISOString().split('T')[0];
  
  let tableHTML = '';
  
  teams.forEach(team => {
    const teamTasks = CURRENT_DATA.filter(t => t.team === team);
    const todayTasks = teamTasks.filter(t => 
      t.created_at && t.created_at.includes(today)
    ).length;
    
    // Priority counts
    const repairs = teamTasks.filter(t => t.priority === 1).length;
    const installation = teamTasks.filter(t => t.priority === 2).length;
    const others = teamTasks.filter(t => t.priority === 3).length;
    
    // Status counts (latest status only)
    const resolved = teamTasks.filter(t => t.status === 'close').length;
    const pending = teamTasks.filter(t => t.status === 'open').length;
    
    // Calculate average TAT for this team (only closed complaints)
    const closedTasks = teamTasks.filter(t => t.status === 'close' && t.tatMinutes);
    const totalTat = closedTasks.reduce((sum, task) => sum + task.tatMinutes, 0);
    const avgTeamTat = closedTasks.length > 0 ? totalTat / closedTasks.length : 0;
    
    // Target status
    const targetClass = todayTasks >= DAILY_TARGET ? 'target-met' : 'target-missed';
    const targetIcon = todayTasks >= DAILY_TARGET ? '✓' : '✗';
    const targetText = `${todayTasks}/${DAILY_TARGET}`;
    
    // Add click handlers to each cell
    tableHTML += `
      <tr>
        <td><strong>${team}</strong></td>
        <td onclick="openTeamTasks('${team}', 'today')" style="cursor: pointer;">
          <span class="target-indicator ${targetClass}">
            ${targetIcon} ${targetText}
          </span>
        </td>
        <td>${DAILY_TARGET}</td>
        <td onclick="openTeamTasks('${team}', 'repairs')" style="cursor: pointer;">
          <span class="priority-badge priority-1">${repairs}</span>
        </td>
        <td onclick="openTeamTasks('${team}', 'installation')" style="cursor: pointer;">
          <span class="priority-badge priority-2">${installation}</span>
        </td>
        <td onclick="openTeamTasks('${team}', 'others')" style="cursor: pointer;">
          <span class="priority-badge priority-3">${others}</span>
        </td>
        <td onclick="openTeamTasks('${team}', 'resolved')" style="cursor: pointer;">
          <span class="status-badge status-close">${resolved}</span>
        </td>
        <td onclick="openTeamTasks('${team}', 'pending')" style="cursor: pointer;">
          <span class="status-badge status-open">${pending}</span>
        </td>
        <td>${formatTime(avgTeamTat)}</td>
      </tr>
    `;
  });
  
  if (teams.length === 0) {
    tableHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 2rem; color: #94a3b8;">
          No data found for current filters. Try changing date range to "All Time".
        </td>
      </tr>
    `;
  }
  
  document.getElementById('teamTableBody').innerHTML = tableHTML;
}

// ==================== MODAL FUNCTIONS ====================
function openTasksModal(type) {
  MODAL_TYPE = type;
  let title = '';
  let tasks = [];
  
  switch(type) {
    case 'all':
      title = 'All Tasks (Latest Status)';
      tasks = CURRENT_DATA;
      break;
    case 'closed':
      title = 'Resolved Tasks (Closed Status)';
      tasks = CURRENT_DATA.filter(t => t.status === 'close');
      break;
    case 'open':
      title = 'Pending Tasks (Open Status)';
      tasks = CURRENT_DATA.filter(t => t.status === 'open');
      break;
    case 'tat':
      title = 'Tasks with TAT Calculation';
      tasks = CURRENT_DATA.filter(t => t.tatMinutes);
      break;
  }
  
  openModal(title, tasks);
}

function openTeamTasks(team, type) {
  let title = '';
  let tasks = [];
  
  switch(type) {
    case 'today':
      title = `${team} - Today's Tasks`;
      const today = new Date().toISOString().split('T')[0];
      tasks = CURRENT_DATA.filter(t => 
        t.team === team && 
        t.created_at && 
        t.created_at.includes(today)
      );
      break;
    case 'repairs':
      title = `${team} - Repairs (P1)`;
      tasks = CURRENT_DATA.filter(t => t.team === team && t.priority === 1);
      break;
    case 'installation':
      title = `${team} - Installation (P2)`;
      tasks = CURRENT_DATA.filter(t => t.team === team && t.priority === 2);
      break;
    case 'others':
      title = `${team} - Other Tasks (P3)`;
      tasks = CURRENT_DATA.filter(t => t.team === team && t.priority === 3);
      break;
    case 'resolved':
      title = `${team} - Resolved Tasks`;
      tasks = CURRENT_DATA.filter(t => t.team === team && t.status === 'close');
      break;
    case 'pending':
      title = `${team} - Pending Tasks`;
      tasks = CURRENT_DATA.filter(t => t.team === team && t.status === 'open');
      break;
  }
  
  openModal(title, tasks);
}

function openModal(title, tasks) {
  MODAL_TASKS = tasks;
  
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalCount').textContent = `${tasks.length} tasks`;
  
  // Get unique windows and teams for stats
  const windows = [...new Set(tasks.map(t => t.window))];
  const teams = [...new Set(tasks.map(t => t.team))];
  
  document.getElementById('modalWindow').textContent = `Windows: ${windows.join(', ')}`;
  document.getElementById('modalTeam').textContent = `Teams: ${teams.slice(0, 3).join(', ')}${teams.length > 3 ? '...' : ''}`;
  
  // Reset filters
  document.getElementById('modalSearch').value = '';
  document.getElementById('modalFilter').value = 'all';
  document.getElementById('modalSort').value = 'new';
  
  // Show modal
  document.getElementById('tasksModal').style.display = 'flex';
  
  // Load tasks
  updateModalContent();
}

function closeModal() {
  document.getElementById('tasksModal').style.display = 'none';
}

function updateModalContent() {
  if (!MODAL_TASKS) return;
  
  const searchTerm = document.getElementById('modalSearch').value.toLowerCase();
  const filter = document.getElementById('modalFilter').value;
  const sort = document.getElementById('modalSort').value;
  
  let filtered = [...MODAL_TASKS];
  
  // Apply search
  if (searchTerm) {
    filtered = filtered.filter(t => 
      (t.user_id && t.user_id.toLowerCase().includes(searchTerm)) ||
      (t.team && t.team.toLowerCase().includes(searchTerm)) ||
      (t.page_id && t.page_id.toLowerCase().includes(searchTerm)) ||
      (t.reason && t.reason.toLowerCase().includes(searchTerm)) ||
      (t.name && t.name.toLowerCase().includes(searchTerm))
    );
  }
  
  // Apply status filter
  if (filter !== 'all') {
    filtered = filtered.filter(t => t.status === filter);
  }
  
  // Apply sorting
  filtered.sort((a, b) => {
    switch(sort) {
      case 'new':
        return (b.timestamp || 0) - (a.timestamp || 0);
      case 'old':
        return (a.timestamp || 0) - (b.timestamp || 0);
      case 'tatHigh':
        return (b.tatMinutes || 0) - (a.tatMinutes || 0);
      case 'tatLow':
        return (a.tatMinutes || 0) - (b.tatMinutes || 0);
      default:
        return 0;
    }
  });
  
  // Update count
  document.getElementById('modalCount').textContent = `${filtered.length} tasks`;
  
  // Generate modal content
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = '';
  
  if (filtered.length === 0) {
    modalBody.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: #94a3b8;">
        No tasks found for the current filters.
      </div>
    `;
    return;
  }
  
  filtered.forEach((task, index) => {
    const taskCard = document.createElement('div');
    taskCard.className = 'task-card';
    
    const priorityClass = `priority-badge priority-${task.priority}`;
    const statusClass = `status-badge status-${task.status}`;
    const statusText = task.status === 'open' ? 'Pending' : 'Resolved';
    
    // Format date for display
    const dateStr = task.created_at ? 
      new Date(task.created_at.replace(' ', 'T')).toLocaleString('en-IN') : 
      'Unknown';
    
    // Calculate TAT if available
    let tatDisplay = '';
    if (task.tatMinutes) {
      tatDisplay = `<div class="task-row">
        <span class="task-label">TAT:</span>
        <span class="task-value">${formatTime(task.tatMinutes)}</span>
      </div>`;
    }
    
    // Show history if available
    let historyDisplay = '';
    if (task.history && task.history.length > 1) {
      historyDisplay = `
        <div class="task-details">
          <div><strong>History:</strong> ${task.history.length} status changes</div>
          <div style="font-size: 0.8rem; color: #64748b;">
            First open: ${task.firstOpenAt ? task.firstOpenAt.toLocaleString('en-IN') : 'N/A'}
            ${task.lastCloseAt ? `<br>Last close: ${task.lastCloseAt.toLocaleString('en-IN')}` : ''}
          </div>
        </div>
      `;
    }
    
    taskCard.innerHTML = `
      <div class="task-row">
        <span class="task-label">User ID:</span>
        <span class="task-value"><strong>${task.user_id || 'N/A'}</strong></span>
        <span class="${priorityClass}">P${task.priority}</span>
        <span class="${statusClass}">${statusText}</span>
      </div>
      
      <div class="task-row">
        <span class="task-label">Team:</span>
        <span class="task-value">${task.team}</span>
        <span class="task-label">Window:</span>
        <span class="task-value">${task.window}</span>
      </div>
      
      <div class="task-row">
        <span class="task-label">Page:</span>
        <span class="task-value">${task.page_id}</span>
        <span class="task-label">Priority:</span>
        <span class="task-value">${task.priority === 1 ? 'Repairs' : task.priority === 2 ? 'Installation' : 'Others'}</span>
      </div>
      
      <div class="task-row">
        <span class="task-label">Reason:</span>
        <span class="task-value">${task.reason || 'N/A'}</span>
      </div>
      
      ${tatDisplay}
      
      <div class="task-details">
        <div><strong>Latest Update:</strong> ${dateStr}</div>
        <div><strong>Status:</strong> ${statusText} (Latest)</div>
        ${task.name ? `<div><strong>Name:</strong> ${task.name}</div>` : ''}
        ${task.address ? `<div><strong>Address:</strong> ${task.address}</div>` : ''}
      </div>
      
      ${historyDisplay}
    `;
    
    modalBody.appendChild(taskCard);
  });
}

// ==================== DATA SUMMARY ====================
function showDataSummary() {
  const summaryDiv = document.getElementById('dataSummary');
  const totalSpan = document.getElementById('summaryTotal');
  const dateRangeSpan = document.getElementById('summaryDateRange');
  const teamsSpan = document.getElementById('summaryTeams');
  
  // Calculate date range
  const dates = ALL_DATA.map(d => d.timestamp).filter(Boolean);
  let dateRangeText = 'Unknown';
  
  if (dates.length > 0) {
    const earliest = new Date(Math.min(...dates));
    const latest = new Date(Math.max(...dates));
    dateRangeText = `${earliest.toLocaleDateString('en-IN')} to ${latest.toLocaleDateString('en-IN')}`;
  }
  
  totalSpan.textContent = ALL_DATA.length.toLocaleString();
  dateRangeText = dateRangeText;
  
  const teams = [...new Set(ALL_DATA.map(d => d.team).filter(t => t && t !== 'UNKNOWN'))];
  teamsSpan.textContent = teams.join(', ') || 'None found';
  
  summaryDiv.style.display = summaryDiv.style.display === 'none' ? 'block' : 'none';
}

// ==================== EXPORT CSV ====================
function exportCSV() {
  if (CURRENT_DATA.length === 0) {
    alert('No data to export');
    return;
  }
  
  const headers = ['window', 'team', 'user_id', 'page_id', 'priority', 'status', 'reason', 'created_at', 'name', 'address', 'tat_minutes'];
  const csvRows = [
    headers.join(','),
    ...CURRENT_DATA.map(row => 
      headers.map(header => {
        if (header === 'tat_minutes') {
          const value = row.tatMinutes || '';
          return `"${String(value)}"`;
        }
        const value = row[header] || '';
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(',')
    )
  ];
  
  const csvContent = csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `merotra_team_data_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
  // Filter changes
  ['filterWindow', 'filterTeam', 'filterPage', 'filterPriority', 'filterDateRange'].forEach(id => {
    document.getElementById(id).addEventListener('change', applyFilters);
  });
  
  // Custom date range toggle
  document.getElementById('filterDateRange').addEventListener('change', function() {
    const customGroup = document.getElementById('customDateGroup');
    customGroup.style.display = this.value === 'custom' ? 'flex' : 'none';
    applyFilters();
  });
  
  // Custom date changes
  ['filterDateFrom', 'filterDateTo'].forEach(id => {
    document.getElementById(id).addEventListener('change', function() {
      if (document.getElementById('filterDateRange').value === 'custom') {
        applyFilters();
      }
    });
  });
  
  // Refresh button
  document.getElementById('refreshBtn').addEventListener('click', fetchAllData);
  
  // Modal search and filters
  document.getElementById('modalSearch').addEventListener('input', updateModalContent);
  document.getElementById('modalFilter').addEventListener('change', updateModalContent);
  document.getElementById('modalSort').addEventListener('change', updateModalContent);
  
  // Close modal on overlay click
  document.getElementById('tasksModal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });
  
  // Close modal with Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeModal();
  });
}

// ==================== INITIALIZATION ====================
async function initialize() {
  console.log('Initializing application...');
  
  setupEventListeners();
  
  // Set default date range to "All Time"
  document.getElementById('filterDateRange').value = 'all';
  
  // Try to fetch data immediately
  try {
    await fetchAllData();
  } catch (error) {
    console.error('Initial fetch failed:', error);
    
    // Show error state
    document.getElementById('kpiTotal').textContent = 'Error';
    document.getElementById('teamTableBody').innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 2rem; color: #ef4444;">
          Failed to load data. Click Refresh to try again.
          <br><small>Error: ${error.message}</small>
        </td>
      </tr>
    `;
  }
  
  console.log('Application initialized');
}

// Start the application
document.addEventListener('DOMContentLoaded', initialize);
