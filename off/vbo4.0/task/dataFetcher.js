// ==================== CONFIGURATION ====================
const API_URLS = [
  "https://app.vbo.co.in/MEROTRA/heroesocr_full",
  "https://app.vbo.co.in/SUNNY/heroesocr_full"
];

const DAILY_TARGET = 4;
let ALL_DATA = [];
let CURRENT_DATA = [];

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
  const statusFilter = document.getElementById('filterStatus').value;
  const dateRangeType = document.getElementById('filterDateRange').value;
  
  let dateRange = getDateRange(dateRangeType);
  
  CURRENT_DATA = ALL_DATA.filter(task => {
    // Window filter
    if (windowFilter !== 'all' && task.window !== windowFilter) return false;
    
    // Team filter (use the team from FIRST OPEN)
    if (teamFilter !== 'all' && task.team !== teamFilter) return false;
    
    // Page filter
    if (pageFilter !== 'all' && task.page_id !== pageFilter) return false;
    
    // Status filter (use LATEST status)
    if (statusFilter !== 'all' && task.status !== statusFilter) return false;
    
    // Date filter (use latest timestamp)
    if (task.timestamp) {
      if (task.timestamp < dateRange.from || task.timestamp > dateRange.to) return false;
    }
    
    return true;
  });
  
  console.log('Filtered data:', {
    originalCount: ALL_DATA.length,
    filteredCount: CURRENT_DATA.length,
    openCount: CURRENT_DATA.filter(t => t.status === 'open').length,
    closeCount: CURRENT_DATA.filter(t => t.status === 'close').length
  });
  
  updateDashboard();
  updateCharts();
  updateTeamTable();
}
