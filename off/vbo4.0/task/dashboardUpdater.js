// ==================== DASHBOARD UPDATE ====================
function updateDashboard() {
  const total = CURRENT_DATA.length;
  const closed = CURRENT_DATA.filter(t => t.status === 'close').length;
  const open = CURRENT_DATA.filter(t => t.status === 'open').length;
  
  // Calculate average TAT only for closed complaints
  const closedWithTat = CURRENT_DATA.filter(t => t.status === 'close' && t.tatMinutes);
  const totalTat = closedWithTat.reduce((sum, task) => sum + task.tatMinutes, 0);
  const avgTat = closedWithTat.length > 0 ? totalTat / closedWithTat.length : 0;
  
  // Get carry forward stats
  const carryForwardTasks = CURRENT_DATA.filter(t => t.carryForward);
  const highPriorityPending = CURRENT_DATA.filter(t => 
    t.status === 'open' && (t.priority === 1 || t.priority === 2)
  );
  
  // Update UI
  document.getElementById('kpiTotal').textContent = total.toLocaleString();
  document.getElementById('kpiClosed').textContent = closed.toLocaleString();
  document.getElementById('kpiOpen').textContent = open.toLocaleString();
  document.getElementById('kpiTat').textContent = formatTime(avgTat);
  
  // Show carry forward warning if any
  if (carryForwardTasks.length > 0) {
    console.warn(`⚠️ ${carryForwardTasks.length} tasks carried forward`);
    
    // You can add a notification badge or tooltip here
    const openKpi = document.getElementById('kpiOpen');
    if (openKpi) {
      openKpi.title = `${carryForwardTasks.length} tasks carried forward`;
      openKpi.style.position = 'relative';
      
      // Add a small badge
      const badge = document.createElement('span');
      badge.textContent = `⚠️${carryForwardTasks.length}`;
      badge.style.position = 'absolute';
      badge.style.top = '-8px';
      badge.style.right = '-8px';
      badge.style.background = '#f59e0b';
      badge.style.color = 'white';
      badge.style.borderRadius = '50%';
      badge.style.width = '20px';
      badge.style.height = '20px';
      badge.style.fontSize = '10px';
      badge.style.display = 'flex';
      badge.style.alignItems = 'center';
      badge.style.justifyContent = 'center';
      openKpi.appendChild(badge);
    }
  }
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
    
    // Check for carry forward tasks in this team
    const carryForwardTasks = teamTasks.filter(t => t.carryForward);
    const hasCarryForward = carryForwardTasks.length > 0;
    
    // Target status with carry forward indicator
    const targetClass = todayTasks >= DAILY_TARGET ? 'target-met' : 'target-missed';
    const targetIcon = todayTasks >= DAILY_TARGET ? '✓' : '✗';
    let targetText = `${todayTasks}/${DAILY_TARGET}`;
    
    // Add carry forward indicator
    if (hasCarryForward) {
      targetText += ` ⚠️${carryForwardTasks.length}`;
    }
    
    tableHTML += `
      <tr ${hasCarryForward ? 'class="carry-forward-row"' : ''}>
        <td>
          <strong>${team}</strong>
          ${hasCarryForward ? '<span class="carry-forward-indicator" title="Has carried forward tasks">⚠️</span>' : ''}
        </td>
        <td onclick="openTeamModal('${team}', 'today')" style="cursor: pointer;">
          <span class="target-indicator ${targetClass}">
            ${targetIcon} ${targetText}
          </span>
        </td>
        <td>${DAILY_TARGET}</td>
        <td onclick="openTeamModal('${team}', 'repairs')" style="cursor: pointer;">
          <span class="priority-badge priority-1">${repairs}</span>
        </td>
        <td onclick="openTeamModal('${team}', 'installation')" style="cursor: pointer;">
          <span class="priority-badge priority-2">${installation}</span>
        </td>
        <td onclick="openTeamModal('${team}', 'others')" style="cursor: pointer;">
          <span class="priority-badge priority-3">${others}</span>
        </td>
        <td onclick="openTeamModal('${team}', 'resolved')" style="cursor: pointer;">
          <span class="status-badge status-close">${resolved}</span>
        </td>
        <td onclick="openTeamModal('${team}', 'pending')" style="cursor: pointer;">
          <span class="status-badge status-open">${pending}</span>
          ${hasCarryForward ? `<span class="carry-forward-count">⚠️${carryForwardTasks.length}</span>` : ''}
        </td>
        <td>${formatTime(avgTeamTat)}</td>
      </tr>
    `;
  });
  
  if (teams.length === 0) {
    tableHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 2rem; color: #94a3b8;">
          No data found for current filters.
        </td>
      </tr>
    `;
  }
  
  document.getElementById('teamTableBody').innerHTML = tableHTML;
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
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw} complaints` } }
      }
    }
  });
  
  // Team Performance Chart
  const teams = [...new Set(CURRENT_DATA.map(t => t.team))].sort();
  const today = new Date().toISOString().split('T')[0];
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

// Add formatTime function if not defined elsewhere
if (typeof formatTime === 'undefined') {
  function formatTime(minutes) {
    if (!minutes || minutes <= 0) return '—';
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = minutes / 60;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours/24).toFixed(1)}d`;
  }
}
