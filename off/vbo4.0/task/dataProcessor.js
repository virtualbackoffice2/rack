// ==================== DATA PROCESSING FUNCTIONS ====================
function processComplaints(rawData, window) {
  // Group by user_id + page_id + reason combination
  // We'll track the team from the FIRST OPEN entry
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
      timestamp: parseDate(row.created_at),
      id: row.id || null
    });
  });
  
  // Process each complaint group
  const processedComplaints = [];
  
  Object.values(complaintsByKey).forEach(complaints => {
    // Sort by timestamp (oldest to newest)
    complaints.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    // Find the FIRST OPEN entry - this determines the team
    const firstOpen = complaints.find(c => c.status === 'open');
    const finalTeam = firstOpen ? firstOpen.team : complaints[0].team;
    
    // Get the LATEST entry for current status
    const latestComplaint = complaints[complaints.length - 1];
    
    // Calculate TAT: find first open and last close
    let openTimestamp = null;
    let closeTimestamp = null;
    
    for (const complaint of complaints) {
      if (complaint.status === 'open' && !openTimestamp) {
        openTimestamp = complaint.timestamp;
      } else if (complaint.status === 'close') {
        closeTimestamp = complaint.timestamp;
      }
    }
    
    // Calculate TAT if we have both
    let tatMinutes = null;
    if (openTimestamp && closeTimestamp && closeTimestamp > openTimestamp) {
      tatMinutes = (closeTimestamp - openTimestamp) / (1000 * 60);
    }
    
    // Create final complaint object
    const finalComplaint = {
      ...latestComplaint,
      team: finalTeam, // Always use the team from FIRST OPEN
      tatMinutes: tatMinutes,
      priority: getPriority(latestComplaint.page_id),
      history: complaints,
      historyCount: complaints.length,
      firstOpenAt: openTimestamp,
      lastCloseAt: closeTimestamp,
      firstOpenTeam: finalTeam
    };
    
    processedComplaints.push(finalComplaint);
  });
  
  return processedComplaints;
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
