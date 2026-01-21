// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
  console.log('Setting up event listeners...');
  
  // Filter changes
  ['filterWindow', 'filterTeam', 'filterPage', 'filterPriority', 'filterDateRange'].forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('change', function() {
        console.log(`Filter ${id} changed to:`, this.value);
        // Call applyFilters only if it exists
        if (typeof applyFilters === 'function') {
          applyFilters();
        } else {
          console.warn('applyFilters function not available yet');
        }
      });
    } else {
      console.warn(`Element #${id} not found`);
    }
  });
  
  // Refresh button
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function() {
      console.log('Refresh button clicked');
      if (typeof fetchAllData === 'function') {
        fetchAllData();
      } else {
        console.error('fetchAllData function not available');
        alert('Please wait, functions are still loading...');
      }
    });
  } else {
    console.warn('Refresh button not found');
  }
  
  // Modal search and filters
  const modalSearch = document.getElementById('modalSearch');
  const modalFilter = document.getElementById('modalFilter');
  const modalSort = document.getElementById('modalSort');
  
  if (modalSearch) {
    modalSearch.addEventListener('input', function() {
      console.log('Modal search:', this.value);
      if (typeof updateModalContent === 'function') {
        updateModalContent();
      }
    });
  }
  if (modalFilter) {
    modalFilter.addEventListener('change', function() {
      console.log('Modal filter:', this.value);
      if (typeof updateModalContent === 'function') {
        updateModalContent();
      }
    });
  }
  if (modalSort) {
    modalSort.addEventListener('change', function() {
      console.log('Modal sort:', this.value);
      if (typeof updateModalContent === 'function') {
        updateModalContent();
      }
    });
  }
  
  // Close modal on overlay click
  const tasksModal = document.getElementById('tasksModal');
  if (tasksModal) {
    tasksModal.addEventListener('click', function(e) {
      if (e.target === this && typeof closeModal === 'function') {
        closeModal();
      }
    });
  }
  
  // Close modal with Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && typeof closeModal === 'function') {
      closeModal();
    }
  });
  
  // Custom date range toggle
  const dateRangeSelect = document.getElementById('filterDateRange');
  if (dateRangeSelect) {
    dateRangeSelect.addEventListener('change', function() {
      const customGroup = document.getElementById('customDateGroup');
      if (customGroup) {
        customGroup.style.display = this.value === 'custom' ? 'block' : 'none';
      }
    });
  }
  
  console.log('Event listeners setup complete');
}

// ==================== DATA SUMMARY ====================
function showDataSummary() {
  console.log('showDataSummary called, ALL_DATA length:', ALL_DATA.length);
  
  const totalSpan = document.getElementById('summaryTotal');
  const teamsSpan = document.getElementById('summaryTeams');
  const dateRangeSpan = document.getElementById('summaryDateRange');
  
  if (!totalSpan || !teamsSpan || !dateRangeSpan) {
    console.error('Data summary elements not found');
    return;
  }
  
  // Calculate date range
  const dates = ALL_DATA.map(d => d.timestamp).filter(Boolean);
  let dateRangeText = 'Unknown';
  
  if (dates.length > 0) {
    const earliest = new Date(Math.min(...dates));
    const latest = new Date(Math.max(...dates));
    dateRangeText = `${earliest.toLocaleDateString('en-IN')} to ${latest.toLocaleDateString('en-IN')}`;
  }
  
  totalSpan.textContent = ALL_DATA.length.toLocaleString();
  
  const teams = [...new Set(ALL_DATA.map(d => d.team).filter(t => t && t !== 'UNKNOWN'))];
  teamsSpan.textContent = teams.join(', ') || 'None found';
  
  dateRangeSpan.textContent = dateRangeText;
  
  // Show the summary
  const summaryDiv = document.getElementById('dataSummary');
  if (summaryDiv) {
    summaryDiv.style.display = 'block';
  }
}

// ==================== UTILITY FUNCTIONS ====================
function showLoader(show) {
  const loader = document.getElementById('loader');
  if (loader) {
    loader.style.display = show ? 'flex' : 'none';
    console.log('Loader:', show ? 'shown' : 'hidden');
  }
}

// ==================== EXPORT CSV ====================
function exportCSV() {
  console.log('exportCSV called, CURRENT_DATA length:', CURRENT_DATA.length);
  
  if (!CURRENT_DATA || CURRENT_DATA.length === 0) {
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
        if (header === 'priority') {
          const value = row.priority === 1 ? 'Repairs (P1)' : row.priority === 2 ? 'Installation (P2)' : 'Others (P3)';
          return `"${value}"`;
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
  a.download = `merotra_complaints_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
  
  console.log('CSV exported successfully');
}

// ==================== INITIALIZATION ====================
async function initialize() {
  console.log('Initializing application...');
  
  setupEventListeners();
  
  // Set default date range to "All Time"
  const dateRangeSelect = document.getElementById('filterDateRange');
  if (dateRangeSelect) {
    dateRangeSelect.value = 'all';
  }
  
  // Try to fetch data immediately - but wait a bit for all scripts to load
  setTimeout(async () => {
    try {
      console.log('Attempting to fetch initial data...');
      
      if (typeof fetchAllData === 'function') {
        console.log('fetchAllData function is available, calling it...');
        await fetchAllData();
      } else {
        console.error('fetchAllData function not available yet');
        console.log('Available functions:', {
          fetchAllData: typeof fetchAllData,
          showLoader: typeof showLoader,
          applyFilters: typeof applyFilters,
          updateDashboard: typeof updateDashboard
        });
        
        // Show error state
        const kpiTotal = document.getElementById('kpiTotal');
        if (kpiTotal) kpiTotal.textContent = 'Loading...';
        
        const teamTableBody = document.getElementById('teamTableBody');
        if (teamTableBody) {
          teamTableBody.innerHTML = `
            <tr>
              <td colspan="9" style="text-align: center; padding: 2rem; color: #ef4444;">
                Functions not loaded. Click Refresh to try again.
              </td>
            </tr>
          `;
        }
      }
    } catch (error) {
      console.error('Initial fetch failed:', error);
      
      // Show error state
      const kpiTotal = document.getElementById('kpiTotal');
      if (kpiTotal) kpiTotal.textContent = 'Error';
      
      const teamTableBody = document.getElementById('teamTableBody');
      if (teamTableBody) {
        teamTableBody.innerHTML = `
          <tr>
            <td colspan="9" style="text-align: center; padding: 2rem; color: #ef4444;">
              Failed to load data. Click Refresh to try again.
              <br><small>Error: ${error.message}</small>
            </td>
          </tr>
        `;
      }
    }
  }, 500); // Wait 500ms for all scripts to load
  
  console.log('Application initialized');
}

// Start the application
document.addEventListener('DOMContentLoaded', initialize);
