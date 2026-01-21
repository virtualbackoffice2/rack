// ==================== MODAL FUNCTIONS ====================
let MODAL_TASKS = [];
let CURRENT_MODAL_TYPE = '';

// KPI cards ke liye function (HTML mein onclick="openTasksModal()" hai)
function openTasksModal(type) {
  console.log('=== OPEN TASKS MODAL ===');
  console.log('Type:', type);
  console.log('Global CURRENT_DATA length:', window.CURRENT_DATA ? window.CURRENT_DATA.length : 'undefined');
  console.log('Global ALL_DATA length:', window.ALL_DATA ? window.ALL_DATA.length : 'undefined');
  
  // Check if data is available
  if (!window.CURRENT_DATA || !Array.isArray(window.CURRENT_DATA) || window.CURRENT_DATA.length === 0) {
    console.error('No data available for modal');
    alert('No data available. Please check if data is loaded.');
    return;
  }
  
  let title = '';
  let tasks = [];
  
  const currentData = window.CURRENT_DATA;
  
  switch(type) {
    case 'all':
      title = 'All Tasks';
      tasks = currentData;
      break;
    case 'closed':
      title = 'Resolved Tasks';
      tasks = currentData.filter(t => t.status === 'close');
      break;
    case 'open':
      title = 'Pending Tasks';
      tasks = currentData.filter(t => t.status === 'open');
      break;
    case 'tat':
      title = 'Tasks by Average Time';
      tasks = [...currentData].sort((a, b) => (b.tatMinutes || 0) - (a.tatMinutes || 0));
      break;
    default:
      title = 'Task Details';
      tasks = currentData;
  }
  
  console.log(`Found ${tasks.length} tasks for modal`);
  
  // Debug: Check team distribution in modal data
  const teamsInModal = [...new Set(tasks.map(t => t.team))];
  console.log('Teams in modal data:', teamsInModal);
  console.log('Sample tasks in modal (first 3):', tasks.slice(0, 3));
  
  if (tasks.length === 0) {
    alert('No tasks found for this filter. Try changing filters or check if data is loaded.');
    return;
  }
  
  showModal(title, tasks);
}

function openTeamModal(team, type) {
  console.log('=== OPEN TEAM MODAL ===');
  console.log('Team:', team, 'Type:', type);
  console.log('CURRENT_DATA length:', window.CURRENT_DATA ? window.CURRENT_DATA.length : 'undefined');
  
  if (!window.CURRENT_DATA || !Array.isArray(window.CURRENT_DATA) || window.CURRENT_DATA.length === 0) {
    console.error('No data available for team modal');
    alert('No data available. Please wait for data to load.');
    return;
  }
  
  let title = '';
  let tasks = [];
  
  const currentData = window.CURRENT_DATA;
  
  switch(type) {
    case 'today':
      title = `${team} - Today's Tasks`;
      const today = new Date().toISOString().split('T')[0];
      tasks = currentData.filter(t => 
        t.team === team && 
        t.created_at && 
        t.created_at.includes(today)
      );
      break;
    case 'repairs':
      title = `${team} - Repairs (P1)`;
      tasks = currentData.filter(t => t.team === team && t.priority === 1);
      break;
    case 'installation':
      title = `${team} - Installation (P2)`;
      tasks = currentData.filter(t => t.team === team && t.priority === 2);
      break;
    case 'others':
      title = `${team} - Other Tasks (P3)`;
      tasks = currentData.filter(t => t.team === team && t.priority === 3);
      break;
    case 'resolved':
      title = `${team} - Resolved Tasks`;
      tasks = currentData.filter(t => t.team === team && t.status === 'close');
      break;
    case 'pending':
      title = `${team} - Pending Tasks`;
      tasks = currentData.filter(t => t.team === team && t.status === 'open');
      break;
  }
  
  console.log(`Found ${tasks.length} tasks for team "${team}", type ${type}`);
  
  if (tasks.length === 0) {
    alert(`No ${type} tasks found for team ${team}.`);
    return;
  }
  
  showModal(title, tasks);
}

function showModal(title, tasks) {
  console.log('=== SHOW MODAL ===');
  console.log('Title:', title, 'Tasks count:', tasks.length);
  
  MODAL_TASKS = tasks;
  
  const modalTitle = document.getElementById('modalTitle');
  const modalCount = document.getElementById('modalCount');
  const modalWindow = document.getElementById('modalWindow');
  const modalTeam = document.getElementById('modalTeam');
  
  if (!modalTitle || !modalCount) {
    console.error('Modal elements not found');
    return;
  }
  
  modalTitle.textContent = title;
  modalCount.textContent = `${tasks.length} tasks`;
  
  // Get unique windows and teams for stats
  const windows = [...new Set(tasks.map(t => t.window))];
  const teams = [...new Set(tasks.map(t => t.team))];
  
  console.log('Windows in modal:', windows);
  console.log('Teams in modal:', teams);
  
  if (modalWindow) {
    modalWindow.textContent = `Window: ${windows.join(', ') || 'None'}`;
  }
  
  if (modalTeam) {
    modalTeam.textContent = `Teams: ${teams.slice(0, 3).join(', ') || 'None'}${teams.length > 3 ? '...' : ''}`;
  }
  
  // Reset filters
  const modalSearch = document.getElementById('modalSearch');
  const modalFilter = document.getElementById('modalFilter');
  const modalSort = document.getElementById('modalSort');
  
  if (modalSearch) modalSearch.value = '';
  if (modalFilter) modalFilter.value = 'all';
  if (modalSort) modalSort.value = 'new';
  
  // Show modal
  const modal = document.getElementById('tasksModal');
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    console.log('Modal displayed');
  } else {
    console.error('Modal element not found');
  }
  
  // Load tasks
  updateModalContent();
}

function closeModal() {
  const modal = document.getElementById('tasksModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    console.log('Modal closed');
  }
}

function updateModalContent() {
  console.log('=== UPDATE MODAL CONTENT ===');
  console.log('MODAL_TASKS count:', MODAL_TASKS.length);
  
  const modalBody = document.getElementById('modalBody');
  if (!modalBody) {
    console.error('Modal body not found');
    return;
  }
  
  if (!MODAL_TASKS || MODAL_TASKS.length === 0) {
    modalBody.innerHTML = `
      <div class="no-tasks">
        <p>No tasks found for this filter.</p>
        <p><small>Try adjusting your search or check if data is loaded.</small></p>
      </div>
    `;
    return;
  }
  
  const searchTerm = document.getElementById('modalSearch')?.value.toLowerCase() || '';
  const filter = document.getElementById('modalFilter')?.value || 'all';
  const sort = document.getElementById('modalSort')?.value || 'new';
  
  console.log('Filters - search:', searchTerm, 'filter:', filter, 'sort:', sort);
  
  let filtered = [...MODAL_TASKS];
  
  // Apply search
  if (searchTerm) {
    filtered = filtered.filter(t => 
      (t.user_id && t.user_id.toString().toLowerCase().includes(searchTerm)) ||
      (t.team && t.team.toString().toLowerCase().includes(searchTerm)) ||
      (t.page_id && t.page_id.toString().toLowerCase().includes(searchTerm)) ||
      (t.reason && t.reason.toString().toLowerCase().includes(searchTerm)) ||
      (t.name && t.name.toString().toLowerCase().includes(searchTerm))
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
  
  console.log('After filtering:', filtered.length, 'tasks');
  
  // Update count
  const modalCount = document.getElementById('modalCount');
  if (modalCount) {
    modalCount.textContent = `${filtered.length} tasks`;
  }
  
  // Use formatTime function if available
  const formatTimeFn = window.formatTime || function(minutes) {
    if (!minutes || minutes <= 0) return '—';
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = minutes / 60;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours/24).toFixed(1)}d`;
  };
  
  // Generate modal content
  let html = '';
  
  filtered.forEach((task, index) => {
    const priorityClass = `priority-${task.priority}`;
    const statusClass = task.status === 'open' ? 'status-open' : 'status-close';
    const statusText = task.status === 'open' ? 'Pending' : 'Resolved';
    
    // Format dates
    const dateStr = task.timestamp ? 
      new Date(task.timestamp).toLocaleString('en-IN') : 'Unknown';
    
    // Check if task is carry forward
    const carryForwardBadge = task.carryForward ? 
      `<span class="carry-forward-badge" title="Carried forward for ${task.daysPending} days">↻ ${task.daysPending}d</span>` : '';
    
    // Priority text
    let priorityText = '';
    switch(task.priority) {
      case 1: priorityText = 'Repairs (P1)'; break;
      case 2: priorityText = 'Installation (P2)'; break;
      case 3: priorityText = 'Others (P3)'; break;
      default: priorityText = `Priority ${task.priority}`;
    }
    
    // Team display - highlight if UNKNOWN
    const teamDisplay = task.team === 'UNKNOWN' ? 
      `<span style="color: #ef4444; font-weight: bold;">${task.team}</span>` : 
      task.team;
    
    html += `
      <div class="task-card ${task.status}">
        <div class="task-header">
          <div class="task-id">
            <strong>${task.user_id || 'N/A'}</strong>
            ${carryForwardBadge}
          </div>
          <div class="task-status">
            <span class="task-priority ${priorityClass}">${priorityText}</span>
            <span class="task-status-badge ${statusClass}">${statusText}</span>
          </div>
        </div>
        
        <div class="task-body">
          <div><strong>Team:</strong> ${teamDisplay}</div>
          <div><strong>Page:</strong> ${task.page_id || 'N/A'}</div>
          <div><strong>Window:</strong> ${task.window || 'N/A'}</div>
          <div><strong>Last Updated:</strong> ${dateStr}</div>
          
          ${task.tatMinutes ? `
            <div><strong>Time to Resolve:</strong> ${formatTimeFn(task.tatMinutes)}</div>
          ` : ''}
          
          ${task.reason ? `<div><strong>Reason:</strong> ${task.reason}</div>` : ''}
          
          ${task.name ? `<div><strong>Name:</strong> ${task.name}</div>` : ''}
          
          ${task.address ? `<div><strong>Address:</strong> ${task.address}</div>` : ''}
          
          ${task.historyCount > 1 ? `<div><small>This complaint has ${task.historyCount} entries</small></div>` : ''}
        </div>
      </div>
    `;
  });
  
  modalBody.innerHTML = html;
  console.log('Modal content updated with', filtered.length, 'tasks');
}
