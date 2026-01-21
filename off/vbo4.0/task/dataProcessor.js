// ==================== DATA PROCESSING ====================
function processComplaints(rows, window) {
  const complaintsByUser = {};
  
  rows.forEach(row => {
    if (!row.user_id) return;
    
    const user_id = row.user_id.toString().trim();
    const timestamp = row.created_at ? new Date(row.created_at.replace(' ', 'T')).getTime() : Date.now();
    
    if (!complaintsByUser[user_id]) {
      complaintsByUser[user_id] = [];
    }
    
    // IMPORTANT: Check both "Team" (capital T) and "team" (lowercase)
    const team = row.Team || row.team || 'UNKNOWN';
    
    complaintsByUser[user_id].push({
      ...row,
      window: window,
      timestamp: timestamp,
      status: (row.status || 'open').toLowerCase(), // Ensure lowercase
      priority: parseInt(row.priority) || getPriority(row.page_id),
      team: team
    });
  });
  
  // For each user, find latest status and calculate TAT if applicable
  const processed = [];
  
  Object.keys(complaintsByUser).forEach(user_id => {
    const userComplaints = complaintsByUser[user_id];
    
    // Sort by timestamp (newest first)
    userComplaints.sort((a, b) => b.timestamp - a.timestamp);
    
    const latest = userComplaints[0];
    
    // Find first open complaint
    const openComplaints = userComplaints.filter(c => c.status === 'open');
    const firstOpen = openComplaints.length > 0 ? 
      openComplaints[openComplaints.length - 1] : null;
    
    // Find last close complaint (if any)
    const closeComplaints = userComplaints.filter(c => c.status === 'close');
    const lastClose = closeComplaints.length > 0 ? 
      closeComplaints[0] : null;
    
    // Calculate TAT (in minutes) if closed
    let tatMinutes = null;
    if (lastClose && firstOpen) {
      const openTime = firstOpen.timestamp;
      const closeTime = lastClose.timestamp;
      tatMinutes = Math.round((closeTime - openTime) / (1000 * 60));
    }
    
    // Determine team - use latest complaint's team
    let team = latest.team || 'UNKNOWN';
    
    // If team is still UNKNOWN, try other complaints
    if (team === 'UNKNOWN') {
      const complaintWithTeam = userComplaints.find(c => c.team && c.team !== 'UNKNOWN');
      if (complaintWithTeam) {
        team = complaintWithTeam.team;
      }
    }
    
    // Clean up team name
    if (team && typeof team === 'string') {
      team = team.trim();
      if (team === '') team = 'UNKNOWN';
    }
    
    // Determine page_id
    let page_id = latest.page_id || 'UNKNOWN';
    if (!page_id || page_id === 'null' || page_id === 'NULL') {
      page_id = 'UNKNOWN';
    }
    
    // Check if task should be carried forward
    const shouldCarryForward = checkCarryForward(latest, firstOpen);
    
    processed.push({
      user_id: user_id,
      window: window,
      team: team,
      page_id: page_id,
      priority: latest.priority || 3,
      status: latest.status || 'open',
      reason: latest.reason || '',
      created_at: latest.created_at || '',
      name: latest.name || '',
      address: latest.address || '',
      timestamp: latest.timestamp,
      historyCount: userComplaints.length,
      firstOpenAt: firstOpen ? firstOpen.timestamp : null,
      lastCloseAt: lastClose ? lastClose.timestamp : null,
      tatMinutes: tatMinutes,
      // Carry forward properties
      carryForward: shouldCarryForward.carryForward,
      daysPending: shouldCarryForward.daysPending,
      highPriority: shouldCarryForward.highPriority
    });
  });
  
  console.log(`Processed ${processed.length} complaints for window ${window}`);
  console.log('Unique teams found:', [...new Set(processed.map(p => p.team))]);
  
  return processed;
}

// ==================== CARRY FORWARD LOGIC ====================
function checkCarryForward(latestTask, firstOpen) {
  const result = {
    carryForward: false,
    daysPending: 0,
    highPriority: false
  };
  
  // Only check for open tasks with priority 1 or 2
  if (latestTask.status === 'open' && (latestTask.priority === 1 || latestTask.priority === 2)) {
    result.highPriority = true;
    
    if (firstOpen) {
      const now = new Date();
      const openDate = new Date(firstOpen.timestamp);
      const diffTime = Math.abs(now - openDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      result.daysPending = diffDays;
      
      // Mark as carry forward if pending for more than 1 day
      if (diffDays > 1) {
        result.carryForward = true;
      }
    }
  }
  
  return result;
}

// Helper function to get carry forward tasks
function getCarryForwardTasks() {
  return window.ALL_DATA.filter(task => task.carryForward === true);
}

// Helper function to get high priority pending tasks
function getHighPriorityPending() {
  return window.ALL_DATA.filter(task => 
    task.status === 'open' && 
    (task.priority === 1 || task.priority === 2)
  );
}

// ==================== UTILITY FUNCTIONS ====================
function getPriority(pageId) {
  if (!pageId) return 3;
  const page = pageId.toLowerCase();
  if (page.includes('repair')) return 1;
  if (page.includes('install')) return 2;
  return 3;
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

function formatTime(minutes) {
  if (!minutes || minutes <= 0) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours/24).toFixed(1)}d`;
}

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
