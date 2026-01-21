// ==================== MODAL FUNCTIONS ====================
let MODAL_TASKS = [];
let CURRENT_MODAL_TYPE = '';

function openModal(type) {
  CURRENT_MODAL_TYPE = type;
  let title = '';
  let tasks = [];
  
  switch(type) {
    case 'all':
      title = 'All Complaints (Latest Status)';
      tasks = CURRENT_DATA;
      break;
    case 'closed':
      title = 'Resolved Complaints';
      tasks = CURRENT_DATA.filter(t => t.status === 'close');
      break;
    case 'open':
      title = 'Pending Complaints';
      tasks = CURRENT_DATA.filter(t => t.status === 'open');
      break;
    case 'tat':
      title = 'Complaints with TAT';
      tasks = CURRENT_DATA.filter(t => t.tatMinutes);
      break;
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
  
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalCount').textContent = `${tasks.length} complaints`;
  
  // Get unique windows and teams for stats
  const windows = [...new Set(tasks.map(t => t.window))];
  const teams = [...new Set(tasks.map(t => t.team))];
  
  document.getElementById('modalWindow').textContent = `Windows: ${windows.join(', ')}`;
  document.getElementById('modalTeam').textContent = `Teams: ${teams.slice(0, 3).join(', ')}${teams.length > 3 ? '...' : ''}`;
  
  // Reset filters
  document.getElementById('modalSearch').value = '';
  document.getElementById('modalStatusFilter').value = 'all';
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
  if (!MODAL_TASKS || MODAL_TASKS.length === 0) {
    document.getElementById('modalBody').innerHTML = `
      <div style="text-align: center; padding: 3rem; color: #94a3b8;">
        No complaints found.
      </div>
    `;
    return;
  }
  
  const searchTerm = document.getElementById('modalSearch').value.toLowerCase();
  const filter = document.getElementById('modalStatusFilter').value;
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
  document.getElementById('modalCount').textContent = `${filtered.length} complaints`;
  
  // Generate modal content
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = '';
  
  filtered.forEach((task) => {
    const taskCard = document.createElement('div');
    taskCard.className = 'task-card';
    
    const priorityClass = `priority-badge priority-${task.priority}`;
    const statusClass = `status-badge status-${task.status}`;
    const statusText = task.status === 'open' ? 'Pending' : 'Resolved';
    
    // Format dates
    const dateStr = task.created_at ? 
      new Date(task.created_at.replace(' ', 'T')).toLocaleString('en-IN') : 'Unknown';
    
    const firstOpenStr = task.firstOpenAt ? 
      task.firstOpenAt.toLocaleString('en-IN') : 'N/A';
    
    const lastCloseStr = task.lastCloseAt ? 
      task.lastCloseAt.toLocaleString('en-IN') : 'N/A';
    
    // History badge
    const historyBadge = task.historyCount > 1 ? 
      `<span class="history-badge" title="${task.historyCount} status changes">📜 ${task.historyCount}</span>` : '';
    
    taskCard.innerHTML = `
      <div class="task-header">
        <div class="task-id">
          <strong>User ID:</strong> ${task.user_id || 'N/A'}
          ${historyBadge}
        </div>
        <div class="task-status">
          <span class="${priorityClass}">P${task.priority}</span>
          <span class="${statusClass}">${statusText}</span>
        </div>
      </div>
      
      <div class="task-info">
        <div><strong>Team:</strong> ${task.team} <small>(From first open)</small></div>
        <div><strong>Window:</strong> ${task.window}</div>
        <div><strong>Page:</strong> ${task.page_id}</div>
        <div><strong>Reason:</strong> ${task.reason || 'N/A'}</div>
      </div>
      
      <div class="task-details">
        <div><strong>Latest Update:</strong> ${dateStr}</div>
        ${task.tatMinutes ? `<div><strong>TAT:</strong> ${formatTime(task.tatMinutes)}</div>` : ''}
        ${task.name ? `<div><strong>Name:</strong> ${task.name}</div>` : ''}
        ${task.address ? `<div><strong>Address:</strong> ${task.address}</div>` : ''}
      </div>
      
      ${task.historyCount > 1 ? `
      <div class="task-history">
        <div><strong>History:</strong> ${task.historyCount} status changes</div>
        <div><strong>First Open:</strong> ${firstOpenStr}</div>
        ${lastCloseStr !== 'N/A' ? `<div><strong>Last Close:</strong> ${lastCloseStr}</div>` : ''}
      </div>
      ` : ''}
    `;
    
    modalBody.appendChild(taskCard);
  });
}
