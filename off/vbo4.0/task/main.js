// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
  console.log('Setting up event listeners...');
  
  // Filter changes - CORRECT IDs
  ['filterWindow', 'filterTeam', 'filterPage', 'filterPriority', 'filterDateRange'].forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('change', applyFilters);
    } else {
      console.warn(`Element #${id} not found`);
    }
  });
  
  // Refresh button
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', fetchAllData);
  } else {
    console.warn('Refresh button not found');
  }
  
  // Modal search and filters - ONLY IF MODAL ELEMENTS EXIST
  const modalSearch = document.getElementById('modalSearch');
  const modalFilter = document.getElementById('modalFilter'); // NOT modalStatusFilter
  const modalSort = document.getElementById('modalSort');
  
  if (modalSearch) {
    modalSearch.addEventListener('input', updateModalContent);
  }
  if (modalFilter) {
    modalFilter.addEventListener('change', updateModalContent);
  }
  if (modalSort) {
    modalSort.addEventListener('change', updateModalContent);
  }
  
  // Close modal on overlay click
  const tasksModal = document.getElementById('tasksModal');
  if (tasksModal) {
    tasksModal.addEventListener('click', function(e) {
      if (e.target === this) closeModal();
    });
  }
  
  // Close modal with Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeModal();
  });
  
  // REMOVE THIS LINE - dataSummary shouldn't have click listener
  // document.getElementById('dataSummary').addEventListener('click', showDataSummary);
  
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
  const totalSpan = document.getElementById('summaryTotal');
  const teamsSpan = document.getElementById('summaryTeams');
  const dateRangeSpan = document.getElementById('summaryDateRange');
  
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
}

// ==================== UTILITY FUNCTIONS ====================
function showLoader(show) {
  document.getElementById('loader').style.display = show ? 'flex' : 'none';
}

// ==================== EXPORT CSV ====================
function exportCSV() {
  if (CURRENT_DATA.length === 0) {
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
}

// ==================== INITIALIZATION ====================
async function initialize() {
  console.log('Initializing application...');
  
  setupEventListeners();
  
  // Set default date range to "All Time"
  document.getElementById('filterDateRange').value = 'all';
  
  // Try to fetch data immediately
  try {
    await fetchAllData();
  } catch (error) {
    console.error('Initial fetch failed:', error);
    
    // Show error state
    document.getElementById('kpiTotal').textContent = 'Error';
    document.getElementById('teamTableBody').innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 2rem; color: #ef4444;">
          Failed to load data. Click Refresh to try again.
        </td>
      </tr>
    `;
  }
  
  console.log('Application initialized');
}

// Start the application
document.addEventListener('DOMContentLoaded', initialize);
