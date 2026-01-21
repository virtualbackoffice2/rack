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
      // Add loading state to button
      const originalHTML = this.innerHTML;
      this.innerHTML = '⏳ Refreshing...';
      this.disabled = true;
      
      if (typeof fetchAllData === 'function') {
        fetchAllData().finally(() => {
          // Restore button state
          setTimeout(() => {
            this.innerHTML = originalHTML;
            this.disabled = false;
          }, 500);
        });
      } else {
        console.error('fetchAllData function not available');
        alert('Please wait, functions are still loading...');
        this.innerHTML = originalHTML;
        this.disabled = false;
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
    modalSearch.addEventListener('input', debounce(function() {
      console.log('Modal search:', this.value);
      if (typeof updateModalContent === 'function') {
        updateModalContent();
      }
    }, 300));
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
  
  // Custom date range toggle
  const dateRangeSelect = document.getElementById('filterDateRange');
  if (dateRangeSelect) {
    dateRangeSelect.addEventListener('change', function() {
      const customGroup = document.getElementById('customDateGroup');
      if (customGroup) {
        customGroup.style.display = this.value === 'custom' ? 'flex' : 'none';
      }
    });
  }
  
  // KPI cards accessibility - add keyboard support
  document.querySelectorAll('.kpi-card').forEach(card => {
    card.setAttribute('tabindex', '0');
    card.addEventListener('keypress', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.click();
      }
    });
  });
  
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
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
      summaryDiv.style.display = 'none';
    }, 10000);
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

// Debounce function for search
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ==================== EXPORT CSV ====================
function exportCSV() {
  console.log('exportCSV called, CURRENT_DATA length:', CURRENT_DATA.length);
  
  if (!CURRENT_DATA || CURRENT_DATA.length === 0) {
    alert('No data to export');
    return;
  }
  
  // Show loading state on button
  const exportBtn = document.querySelector('.btn-success');
  const originalText = exportBtn ? exportBtn.innerHTML : '';
  if (exportBtn) {
    exportBtn.innerHTML = '⏳ Preparing...';
    exportBtn.disabled = true;
  }
  
  try {
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
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    console.log('CSV exported successfully');
    
    // Show success message
    alert(`CSV file downloaded successfully!\n\nFilename: merotra_complaints_${new Date().toISOString().split('T')[0]}.csv\nRows: ${CURRENT_DATA.length}`);
    
  } catch (error) {
    console.error('Export error:', error);
    alert('Error exporting CSV. Please check console for details.');
  } finally {
    // Restore button state
    if (exportBtn) {
      setTimeout(() => {
        exportBtn.innerHTML = originalText;
        exportBtn.disabled = false;
      }, 1000);
    }
  }
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
        if (kpiTotal) kpiTotal.textContent = 'Error';
        
        const teamTableBody = document.getElementById('teamTableBody');
        if (teamTableBody) {
          teamTableBody.innerHTML = `
            <tr>
              <td colspan="9" style="text-align: center; padding: 2rem; color: #ef4444;">
                <div style="margin-bottom: 0.5rem;">⚠️ Functions not loaded</div>
                <div style="font-size: 0.85rem;">Click Refresh to try again</div>
              </td>
            </tr>
          `;
        }
        
        // Hide loader
        showLoader(false);
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
              <div style="margin-bottom: 0.5rem;">❌ Failed to load data</div>
              <div style="font-size: 0.85rem;">Error: ${error.message}</div>
              <div style="font-size: 0.85rem; margin-top: 0.5rem;">Click Refresh to try again</div>
            </td>
          </tr>
        `;
      }
      
      // Hide loader
      showLoader(false);
    }
  }, 500); // Wait 500ms for all scripts to load
  
  console.log('Application initialized');
}

// Start the application
document.addEventListener('DOMContentLoaded', initialize);
