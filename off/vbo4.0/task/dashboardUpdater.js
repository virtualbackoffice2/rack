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
  
  // Debug: Show some sample data
  if (CURRENT_DATA.length > 0) {
    console.log('Sample complaints:');
    CURRENT_DATA.slice(0, 3).forEach(c => {
      console.log(`User: ${c.user_id}, Team: ${c.team}, Status: ${c.status}, History: ${c.historyCount}`);
    });
  }
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
    
    tableHTML += `
      <tr>
        <td><strong>${team}</strong></td>
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
