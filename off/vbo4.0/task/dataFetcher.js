// ==================== CONFIGURATION ====================
const API_URLS = [
  "https://app.vbo.co.in/MEROTRA/heroesocr_full",
  "https://app.vbo.co.in/SUNNY/heroesocr_full"
];

const DAILY_TARGET = 4;

// ==================== DATA FETCHING ====================
async function fetchAllData() {
  console.log('=== FETCH ALL DATA START ===');
  
  if (typeof showLoader === 'function') {
    showLoader(true);
  }
  
  try {
    console.log('Fetching from APIs:', API_URLS);
    const promises = API_URLS.map(async (url, index) => {
      try {
        console.log(`Fetching ${index + 1}/${API_URLS.length}: ${url}`);
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        let sourceName = 'UNKNOWN';
        if (url.includes('MEROTRA')) sourceName = 'MEROTRA';
        else if (url.includes('SUNNY')) sourceName = 'SUNNY';
        
        console.log(`✓ Fetched ${data.rows?.length || 0} rows from ${sourceName}`);
        
        // DEBUG: Check what fields are available in the data
        if (data.rows && data.rows.length > 0) {
          console.log(`Sample row from ${sourceName}:`, data.rows[0]);
          console.log(`Available fields in ${sourceName}:`, Object.keys(data.rows[0]));
          
          // Check if team field exists and what it contains
          const teamFields = ['team', 'team_name', 'team_id', 'assigned_to', 'group', 'department'];
          const firstRow = data.rows[0];
          teamFields.forEach(field => {
            if (firstRow[field]) {
              console.log(`Found team field "${field}" with value: "${firstRow[field]}"`);
            }
          });
        }
        
        return {
          source: sourceName,
          data: data.rows || []
        };
      } catch (error) {
        console.error(`✗ Error fetching ${url}:`, error);
        return { source: 'ERROR', data: [] };
      }
    });
    
    const results = await Promise.all(promises);
    
    // Process all data - MAKE SURE TO UPDATE GLOBAL VARIABLES
    window.ALL_DATA = [];
    
    results.forEach(result => {
      const source = result.source;
      const rows = result.data;
      
      if (rows.length > 0 && typeof processComplaints === 'function') {
        console.log(`Processing ${rows.length} rows from ${source}...`);
        
        // Process complaints to get latest status for each user_id
        const processed = processComplaints(rows, source);
        
        console.log(`Processed ${processed.length} complaints from ${source}`);
        
        // DEBUG: Check team names in processed data
        const uniqueTeams = [...new Set(processed.map(d => d.team))];
        console.log(`Unique teams found in ${source}:`, uniqueTeams);
        
        if (processed.length > 0) {
          console.log(`Sample processed complaint from ${source}:`, {
            user_id: processed[0].user_id,
            team: processed[0].team,
            window: processed[0].window,
            status: processed[0].status,
            priority: processed[0].priority
          });
        }
        
        window.ALL_DATA.push(...processed);
      } else if (rows.length > 0) {
        console.warn('processComplaints function not found, using raw data');
        console.log(`Using raw data from ${source} (${rows.length} rows)`);
        
        // Extract team from raw data if available
        const processed = rows.map(row => {
          // Try to find team field
          let team = 'UNKNOWN';
          const possibleTeamFields = ['team', 'team_name', 'team_id', 'assigned_to', 'group', 'department'];
          
          for (const field of possibleTeamFields) {
            if (row[field] && row[field] !== '' && row[field] !== 'null') {
              team = String(row[field]).trim();
              break;
            }
          }
          
          return {
            ...row,
            window: source,
            team: team,
            timestamp: row.timestamp || new Date().getTime(),
            status: row.status || 'open',
            priority: parseInt(row.priority) || 3
          };
        });
        
        window.ALL_DATA.push(...processed);
      }
    });
    
    console.log('=== DATA LOADED ===');
    console.log('Total complaints:', window.ALL_DATA.length);
    console.log('All unique teams:', [...new Set(window.ALL_DATA.map(d => d.team))]);
    console.log('Windows:', [...new Set(window.ALL_DATA.map(d => d.window))]);
    
    // Show sample of data with teams
    console.log('Sample data points with teams:');
    window.ALL_DATA.slice(0, 10).forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.user_id} - Team: "${item.team}" - Status: ${item.status} - Window: ${item.window}`);
    });
    
    // Check how many have UNKNOWN team
    const unknownTeamCount = window.ALL_DATA.filter(d => d.team === 'UNKNOWN').length;
    console.log(`Complaints with UNKNOWN team: ${unknownTeamCount}/${window.ALL_DATA.length} (${Math.round(unknownTeamCount/window.ALL_DATA.length*100)}%)`);
    
    // Make sure CURRENT_DATA is also set
    window.CURRENT_DATA = [...window.ALL_DATA];
    
    // Show data summary
    if (typeof showDataSummary === 'function') {
      showDataSummary();
    }
    
    if (typeof updateFilters === 'function') {
      updateFilters();
    }
    
    if (typeof applyFilters === 'function') {
      applyFilters();
    }
    
  } catch (error) {
    console.error('=== CRITICAL ERROR ===', error);
    alert('Error loading data. Please check console for details.');
  } finally {
    if (typeof showLoader === 'function') {
      showLoader(false);
    }
    console.log('=== FETCH ALL DATA END ===');
  }
}

// ==================== FILTER FUNCTIONS ====================
function updateFilters() {
  console.log('Updating filters...');
  
  if (!window.ALL_DATA || window.ALL_DATA.length === 0) {
    console.warn('No data available for filters');
    return;
  }
  
  // Teams - show ALL teams including UNKNOWN for debugging
  const allTeams = window.ALL_DATA.map(d => d.team);
  const teams = [...new Set(allTeams)].sort();
  
  console.log('Available teams for filter:', teams);
  console.log('Team distribution:');
  teams.forEach(team => {
    const count = allTeams.filter(t => t === team).length;
    console.log(`  ${team}: ${count} complaints`);
  });
  
  const teamSelect = document.getElementById('filterTeam');
  if (teamSelect) {
    teamSelect.innerHTML = '<option value="all">All Teams</option>' +
      teams.map(team => `<option value="${team}">${team}</option>`).join('');
  }
  
  // Pages
  const allPages = window.ALL_DATA.map(d => d.page_id);
  const pages = [...new Set(allPages.filter(p => p && p !== 'UNKNOWN'))].sort();
  
  console.log('Available pages for filter:', pages);
  
  const pageSelect = document.getElementById('filterPage');
  if (pageSelect) {
    pageSelect.innerHTML = '<option value="all">All Pages</option>' +
      pages.map(page => `<option value="${page}">${page}</option>`).join('');
  }
  
  console.log(`Found ${teams.length} teams and ${pages.length} pages`);
}

function applyFilters() {
  console.log('Applying filters...');
  
  if (!window.ALL_DATA || window.ALL_DATA.length === 0) {
    console.warn('No data to filter');
    window.CURRENT_DATA = [];
    return;
  }
  
  // Safely get filter values with null checks
  const windowFilter = document.getElementById('filterWindow')?.value || 'all';
  const teamFilter = document.getElementById('filterTeam')?.value || 'all';
  const pageFilter = document.getElementById('filterPage')?.value || 'all';
  const priorityFilter = document.getElementById('filterPriority')?.value || 'all';
  const dateRangeType = document.getElementById('filterDateRange')?.value || 'all';
  
  let dateRange = { from: 0, to: Date.now() };
  if (typeof getDateRange === 'function') {
    dateRange = getDateRange(dateRangeType);
  }
  
  window.CURRENT_DATA = window.ALL_DATA.filter(task => {
    // Window filter
    if (windowFilter !== 'all' && task.window !== windowFilter) return false;
    
    // Team filter
    if (teamFilter !== 'all' && task.team !== teamFilter) return false;
    
    // Page filter
    if (pageFilter !== 'all' && task.page_id !== pageFilter) return false;
    
    // Priority filter
    if (priorityFilter !== 'all') {
      const priorityNum = parseInt(priorityFilter);
      if (task.priority !== priorityNum) return false;
    }
    
    // Date filter (use latest timestamp)
    if (task.timestamp) {
      if (task.timestamp < dateRange.from || task.timestamp > dateRange.to) return false;
    }
    
    return true;
  });
  
  console.log('Filtered data:', {
    originalCount: window.ALL_DATA.length,
    filteredCount: window.CURRENT_DATA.length,
    openCount: window.CURRENT_DATA.filter(t => t.status === 'open').length,
    closeCount: window.CURRENT_DATA.filter(t => t.status === 'close').length
  });
  
  // Update components
  try {
    if (typeof updateDashboard === 'function') {
      updateDashboard();
    }
    
    if (typeof updateCharts === 'function') {
      updateCharts();
    }
    
    if (typeof updateTeamTable === 'function') {
      updateTeamTable();
    }
  } catch (error) {
    console.error('Error updating components:', error);
    
    // Fallback: Direct DOM update
    const kpiTotal = document.getElementById('kpiTotal');
    if (kpiTotal) kpiTotal.textContent = window.CURRENT_DATA.length;
    
    const kpiClosed = document.getElementById('kpiClosed');
    if (kpiClosed) kpiClosed.textContent = window.CURRENT_DATA.filter(t => t.status === 'close').length;
    
    const kpiOpen = document.getElementById('kpiOpen');
    if (kpiOpen) kpiOpen.textContent = window.CURRENT_DATA.filter(t => t.status === 'open').length;
  }
}

// ==================== HELPER FUNCTIONS ====================
// Add this if getDateRange function doesn't exist
if (typeof getDateRange === 'undefined') {
  window.getDateRange = function(rangeType) {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    const oneMonth = 30 * oneDay;
    
    switch(rangeType) {
      case 'today':
        return { from: now - oneDay, to: now };
      case 'week':
        return { from: now - oneWeek, to: now };
      case 'month':
        return { from: now - oneMonth, to: now };
      case 'all':
      default:
        return { from: 0, to: now };
    }
  };
}
