// ==================== MODAL FUNCTIONS ====================
let MODAL_TASKS = [];
let CURRENT_MODAL_TYPE = '';

// KPI cards ke liye function (HTML mein onclick="openTasksModal()" hai)
function openTasksModal(type) {
  console.log('openTasksModal called with:', type);
  
  let title = '';
  let tasks = [];
  
  switch(type) {
    case 'all':
      title = 'All Tasks';
      tasks = CURRENT_DATA;
      break;
    case 'closed':
      title = 'Resolved Tasks';
      tasks = CURRENT_DATA.filter(t => t.status === 'close');
      break;
    case 'open':
      title = 'Pending Tasks';
      tasks = CURRENT_DATA.filter(t => t.status === 'open');
      break;
    case 'tat':
      title = 'Tasks by Average Time';
      // Sort by TAT (descending)
      tasks = [...CURRENT_DATA].sort((a, b) => (b.tatMinutes || 0) - (a.tatMinutes || 0));
      break;
    default:
      title = 'Task Details';
      tasks = CURRENT_DATA;
  }
  
  showModal(title, tasks);
}

function openTeamModal(team, type) {
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
  
  showModal(title, tasks);
}

function showModal(title, tasks) {
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
  
  if (modalWindow) {
    modalWindow.textContent = `Window: ${windows.join(', ')}`;
  }
  
  if (modalTeam) {
    modalTeam.textContent = `Teams: ${teams.slice(0, 3).join(', ')}${teams.length > 3 ? '...' : ''}`;
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
  }
  
  // Load tasks
  updateModalContent();
}

function closeModal() {
  const modal = document.getElementById('tasksModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
  }
}

function updateModalContent() {
  const modalBody = document.getElementById('modalBody');
  if (!modalBody) return;
  
  if (!MODAL_TASKS || MODAL_TASKS.length === 0) {
    modalBody.innerHTML = `
      <div class="no-tasks">
        <p>No tasks found for this filter.</p>
      </div>
    `;
    return;
  }
  
  const searchTerm = document.getElementById('modalSearch')?.value.toLowerCase() || '';
  const filter = document.getElementById('modalFilter')?.value || 'all';
  const sort = document.getElementById('modalSort')?.value || 'new';
  
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
  const modalCount = document.getElementById('modalCount');
  if (modalCount) {
    modalCount.textContent = `${filtered.length} tasks`;
  }
  
  // Generate modal content
  let html = '';
  
  filtered.forEach((task) => {
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
    }
    
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
          <div><strong>Team:</strong> ${task.team || 'N/A'}</div>
          <div><strong>Page:</strong> ${task.page_id || 'N/A'}</div>
          <div><strong>Window:</strong> ${task.window || 'N/A'}</div>
          <div><strong>Last Updated:</strong> ${dateStr}</div>
          
          ${task.tatMinutes ? `
            <div><strong>Time to Resolve:</strong> ${formatTime(task.tatMinutes)}</div>
          ` : ''}
          
          ${task.reason ? `<div><strong>Reason:</strong> ${task.reason}</div>` : ''}
          
          ${task.name ? `<div><strong>Name:</strong> ${task.name}</div>` : ''}
          
          ${task.address ? `<div><strong>Address:</strong> ${task.address}</div>` : ''}
        </div>
      </div>
    `;
  });
  
  modalBody.innerHTML = html;
}
