// API Configuration
const BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:8000' 
    : 'https://app.vbo.co.in';

const API = {
  members: `${BASE}/achalmerotra/members`,
  groups: `${BASE}/achalmerotra/groups`,
  payments: `${BASE}/achalmerotra/payments`,
  bids: `${BASE}/achalmerotra/bids`,
};

// ==================== GLOBAL STATE ====================
let members = [];
let groups = [];
let payments = [];
let bids = [];
let dashboardLoaded = false;

// Sort state
let sortState = {
  members: { column: 'id', direction: 'desc' },
  groups: { column: 'id', direction: 'desc' },
  payments: { column: 'id', direction: 'desc' },
  bids: { column: 'id', direction: 'desc' }
};

// Search state
let searchTerms = {
  members: '',
  groups: '',
  payments: '',
  bids: ''
};

// Edit state
let editId = null;
let editType = null;

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
  loadGroups();
  loadMembers();
  loadPayments();
  loadBids();
  initializeDateDropdowns();
  initializeTheme();
  initializeFilterPresets();
  
  const savedTab = localStorage.getItem('activeTab') || 'groups';
  switchTab(savedTab);
});

// ==================== TAB SWITCHING ====================
function switchTab(tabName, e) {
  localStorage.setItem('activeTab', tabName);

  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  if (e) e.target.classList.add('active');

  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.getElementById(tabName + 'Tab').classList.add('active');

  if (tabName === 'reports') loadDuesReport();
  if (tabName === 'bids') loadBids();
}

// ==================== THEME TOGGLE ====================
function initializeTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  const header = document.querySelector('header');
  const toggle = document.createElement('div');
  toggle.className = 'theme-toggle';
  toggle.innerHTML = `
    <span class="${savedTheme === 'light' ? 'active' : ''}" onclick="setTheme('light')">☀️</span>
    <span class="${savedTheme === 'dark' ? 'active' : ''}" onclick="setTheme('dark')">🌙</span>
  `;
  header.appendChild(toggle);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  
  document.querySelectorAll('.theme-toggle span').forEach(span => {
    span.classList.remove('active');
    if (span.textContent.includes(theme === 'light' ? '☀️' : '🌙')) {
      span.classList.add('active');
    }
  });
}

// ==================== DYNAMIC DATE DROPDOWNS ====================
function initializeDateDropdowns() {
  const currentYear = new Date().getFullYear();
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const monthSelects = ['paymentMonth', 'bidMonth', 'filterMonth'];
  monthSelects.forEach(id => {
    const select = document.getElementById(id);
    if (select) {
      select.innerHTML = '<option value="">Select Month</option>';
      months.forEach((month, index) => {
        const option = document.createElement('option');
        option.value = index + 1;
        option.textContent = month;
        select.appendChild(option);
      });
    }
  });
  
  const yearSelects = ['paymentYear', 'bidYear', 'filterYear'];
  yearSelects.forEach(id => {
    const select = document.getElementById(id);
    if (select) {
      select.innerHTML = '<option value="">Select Year</option>';
      for (let year = currentYear - 2; year <= currentYear + 3; year++) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (year === currentYear) option.selected = true;
        select.appendChild(option);
      }
    }
  });
}

function generateMonthYearOptions(group, monthSelectId, yearSelectId) {
  const monthSelect = document.getElementById(monthSelectId);
  const yearSelect = document.getElementById(yearSelectId);

  if (!monthSelect || !yearSelect) return;

  monthSelect.innerHTML = '<option value="">Select Month</option>';
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  monthNames.forEach((name, i) => {
    const opt = document.createElement('option');
    opt.value = i + 1;
    opt.textContent = name;
    monthSelect.appendChild(opt);
  });

  yearSelect.innerHTML = '<option value="">Select Year</option>';
  if (!group || !group.start_date) {
    const cy = new Date().getFullYear();
    for (let y = cy - 2; y <= cy + 3; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    }
    return;
  }

  const start = new Date(group.start_date);
  const duration = parseInt(group.duration) || 12;
  const years = new Set();
  for (let i = 0; i < duration; i++) {
    const d = new Date(start);
    d.setMonth(start.getMonth() + i);
    years.add(d.getFullYear());
  }
  Array.from(years).sort((a,b) => a - b).forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  });
}

// ==================== FILTER PRESETS ====================
function initializeFilterPresets() {
  if (document.querySelector('.filter-presets')) return;
  
  const presets = [
    { label: 'Today', days: 0 },
    { label: 'This Week', days: 7 },
    { label: 'This Month', days: 30 },
    { label: 'This Year', days: 365 }
  ];
  
  const filterContainer = document.querySelector('.filters');
  if (filterContainer) {
    const presetDiv = document.createElement('div');
    presetDiv.className = 'filter-presets';
    presets.forEach(preset => {
      const btn = document.createElement('button');
      btn.className = 'filter-preset-btn';
      btn.textContent = preset.label;
      btn.onclick = () => applyPresetFilter(preset.days);
      presetDiv.appendChild(btn);
    });
    filterContainer.insertBefore(presetDiv, filterContainer.firstChild);
  }
}

function applyPresetFilter(days) {
  const date = new Date();
  if (days > 0) date.setDate(date.getDate() - days);
  
  document.getElementById('filterYear').value = date.getFullYear();
  if (days <= 30) document.getElementById('filterMonth').value = date.getMonth() + 1;
  
  renderPaymentsTable();
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
  try {
    const [membersRes, groupsRes, paymentsRes, bidsRes] = await Promise.all([
      fetchJson(API.members),
      fetchJson(API.groups),
      fetchJson(API.payments),
      fetchJson(API.bids)
    ]);
    
    if (membersRes.status === 'success') members = membersRes.data;
    if (groupsRes.status === 'success') groups = groupsRes.data;
    if (paymentsRes.status === 'success') payments = paymentsRes.data;
    if (bidsRes.status === 'success') bids = bidsRes.data;
    
    document.getElementById('totalMembers').textContent = members.length;
    document.getElementById('totalGroups').textContent = groups.length;
    
    const totalCollection = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    document.getElementById('totalCollection').textContent = '₹' + totalCollection.toLocaleString();
    
    const pending = calculatePendingDues();
    document.getElementById('pendingDues').textContent = '₹' + pending.toLocaleString();
    
    document.getElementById('totalBids').textContent = bids.length;
    
    const completedGroups = groups.filter(g => isGroupCompleted(g)).length;
    const completionPercent = groups.length > 0 ? (completedGroups / groups.length * 100).toFixed(0) : 0;
    
    const groupStat = document.querySelector('.stat-card:nth-child(2) div');
    if (groupStat) {
      let progress = groupStat.querySelector('.progress-bar');
      if (!progress) {
        progress = document.createElement('div');
        progress.className = 'progress-bar';
        groupStat.appendChild(progress);
      }
      progress.innerHTML = `<div class="progress-fill" style="width: ${completionPercent}%"></div>`;
    }
    
    updateMonthlySnapshot();
    dashboardLoaded = true;
    
  } catch (err) {
    console.error('Dashboard error:', err);
  }
}

function updateMonthlySnapshot() {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  
  const monthlyPayments = payments.filter(p => p.month === currentMonth && p.year === currentYear);
  const monthlyCollected = monthlyPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  
  const monthlyBids = bids.filter(b => b.month === currentMonth && b.year === currentYear);
  
  let monthlyExpected = 0;
  groups.forEach(group => {
    if (!group.members) return;
    const memberCount = group.members.split(',').length;
    monthlyExpected += (group.monthly_amount || 0) * memberCount;
  });
  
  const monthlyPending = Math.max(0, monthlyExpected - monthlyCollected);
  const monthlyPercent = monthlyExpected > 0 ? ((monthlyCollected / monthlyExpected) * 100).toFixed(1) : 0;
  
  document.getElementById('monthlyCollected').textContent = '₹' + monthlyCollected.toLocaleString();
  document.getElementById('monthlyPending').textContent = '₹' + monthlyPending.toLocaleString();
  document.getElementById('monthlyBids').textContent = monthlyBids.length;
  document.getElementById('monthlyPercent').textContent = monthlyPercent + '%';
}

// ==================== SEARCH & SORT ====================
function refreshTable(tableType) {
  switch(tableType) {
    case 'Members': renderMembersTable(); break;
    case 'Groups': renderGroupsTable(); break;
    case 'Payments': renderPaymentsTable(); break;
    case 'Bids': renderBidsTable(); break;
  }
}

function sortData(data, type) {
  const state = sortState[type];
  if (!state) return data;
  
  return [...data].sort((a, b) => {
    let valA = a[state.column];
    let valB = b[state.column];
    
    if (state.column === 'amount' || state.column === 'monthly_amount') {
      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
    } else if (state.column === 'created_at' || state.column === 'start_date') {
      valA = new Date(valA || 0).getTime();
      valB = new Date(valB || 0).getTime();
    } else {
      valA = String(valA || '').toLowerCase();
      valB = String(valB || '').toLowerCase();
    }
    
    if (valA < valB) return state.direction === 'asc' ? -1 : 1;
    if (valA > valB) return state.direction === 'asc' ? 1 : -1;
    return 0;
  });
}

function sortTable(type, column) {
  const state = sortState[type.toLowerCase()];
  if (state.column === column) {
    state.direction = state.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.column = column;
    state.direction = 'asc';
  }
  refreshTable(type);
}

// ==================== UTILITY ====================
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

function showForm(id, editData = null) {
  document.querySelectorAll('.form-container').forEach(form => form.classList.add('hidden'));
  const balanceInfo = document.getElementById('balanceInfo');
  if (balanceInfo) balanceInfo.remove();
  
  if (editData) {
    editId = editData.id;
    editType = id.replace('add', '').replace('Form', '').toLowerCase();
    document.querySelector(`#${id} button`).textContent = 'Update';
  } else {
    document.getElementById(id).querySelectorAll('input, textarea, select').forEach(field => {
      if (field.type !== 'button' && field.type !== 'submit') field.value = '';
    });
    document.querySelector(`#${id} button`).textContent = 'Save';
    editId = null;
    editType = null;
  }
  
  show(id);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  if (id === 'addPaymentForm') loadPaymentDropdowns();
  if (id === 'addMemberForm') loadMemberDropdowns();
  if (id === 'addGroupForm') loadGroupDropdowns();
  if (id === 'addBidForm') loadBidDropdowns();
}

function hideForm(id) {
  hide(id);
  editId = null;
  editType = null;
  loadDashboard(); // Safety: Dashboard stats update
}

function message(id, text, type = 'success') {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = `message ${type === 'error' ? 'error' : 'success'}`;
  show(id);
  setTimeout(() => hide(id), 5000);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ==================== MODAL & WHATSAPP ====================
function showModal(title, content) {
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  modalTitle.textContent = title;
  modalBody.innerHTML = content;
  modal.classList.add('active');
}

function hideModal() {
  document.getElementById('modal').classList.remove('active');
}

function sendWhatsAppReminder(phone, name, amount, group) {
  const message = encodeURIComponent(
    `Dear ${name},\nYour BC payment of ₹${amount} for group "${group}" is pending. Please make the payment at the earliest.\n\nThank you,\nAchal Merotra BC`
  );
  window.open(`https://wa.me/91${phone}?text=${message}`, '_blank');
}

// ==================== GROUPS ====================
async function loadGroups() {
  try {
    const json = await fetchJson(API.groups);
    if (json.status !== 'success') throw new Error(json.message);
    
    groups = json.data;
    renderGroupsTable();
    updateGroupDropdowns();
    
  } catch (err) {
    message('groupsMessage', err.message, 'error');
  }
}

function renderGroupsTable() {
  const tbody = document.querySelector('#groupsTable tbody');
  tbody.innerHTML = '';
  
  let filteredGroups = [...groups];
  
  if (searchTerms.groups) {
    filteredGroups = filteredGroups.filter(g => 
      g.name.toLowerCase().includes(searchTerms.groups) ||
      String(g.id).includes(searchTerms.groups)
    );
  }
  
  filteredGroups = sortData(filteredGroups, 'groups');
  
  filteredGroups.forEach(g => {
    const memberCount = g.members ? g.members.split(',').length : 0;
    const endDate = new Date(g.start_date);
    endDate.setMonth(endDate.getMonth() + (g.duration || 0));
    
    const groupPayments = payments.filter(p => p.group_id === g.id);
    const totalCollected = groupPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const expected = (g.monthly_amount || 0) * memberCount * (g.duration || 0);
    const status = isGroupCompleted(g) ? 'Completed' : (totalCollected >= expected ? 'Fully Collected' : 'Active');
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${g.id}</td>
      <td>${g.name}</td>
      <td>₹${g.monthly_amount || 0}</td>
      <td>${memberCount}/${g.total_members || '?'}</td>
      <td>${g.duration || 12} months</td>
      <td>${formatDate(g.start_date)}</td>
      <td>${formatDate(endDate)}</td>
      <td>₹${totalCollected.toLocaleString()} / ₹${expected.toLocaleString()}</td>
      <td><span class="status-badge ${status === 'Completed' ? 'status-success' : status === 'Fully Collected' ? 'status-paid' : 'status-pending'}">${status}</span></td>
      <td class="action-buttons">
        <button class="btn-outline btn-sm" onclick="editGroup(${g.id})"><i class="fas fa-edit"></i></button>
        <button class="btn-danger btn-sm" onclick="confirmDelete('group', ${g.id})"><i class="fas fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function addGroup() {
  const name = document.getElementById('groupName').value.trim();
  const monthly = parseFloat(document.getElementById('groupMonthlyAmount').value);
  const totalMembers = parseInt(document.getElementById('groupTotalMembers').value);
  const duration = parseInt(document.getElementById('groupDuration').value);
  const startDate = document.getElementById('groupStartDate').value;
  const memberSelect = document.getElementById('groupMembers');
  const selectedMembers = Array.from(memberSelect.selectedOptions).map(opt => opt.value);

  if (!name || isNaN(monthly) || isNaN(totalMembers) || isNaN(duration) || !startDate) {
    message('groupsMessage', 'Please fill all required fields', 'error');
    return;
  }

  const payload = {
    name, monthly_amount: monthly, total_members: totalMembers,
    duration, start_date: startDate, members: selectedMembers.join(',')
  };

  const url = editId ? `${API.groups}/${editId}` : API.groups;
  const method = editId ? 'PUT' : 'POST';

  fetchJson(url, { method, body: JSON.stringify(payload) })
    .then(res => {
      if (res.status === 'success') {
        message('groupsMessage', editId ? 'Group updated!' : 'Group created!');
        loadGroups();
        loadDashboard();
        hideForm('addGroupForm');
      } else {
        message('groupsMessage', res.message || 'Error occurred', 'error');
      }
    })
    .catch(err => message('groupsMessage', err.message, 'error'));
}

function editGroup(id) {
  const group = groups.find(g => g.id === id);
  if (!group) return;

  document.getElementById('groupName').value = group.name;
  document.getElementById('groupMonthlyAmount').value = group.monthly_amount || '';
  document.getElementById('groupTotalMembers').value = group.total_members || '';
  document.getElementById('groupDuration').value = group.duration || '';
  document.getElementById('groupStartDate').value = group.start_date ? group.start_date.split('T')[0] : '';

  const select = document.getElementById('groupMembers');
  Array.from(select.options).forEach(opt => {
    opt.selected = group.members?.split(',').includes(opt.value);
  });

  showForm('addGroupForm', group);
}

// ==================== MEMBERS ====================
async function loadMembers() {
  try {
    const json = await fetchJson(API.members);
    if (json.status !== 'success') throw new Error(json.message);
    
    members = json.data;
    renderMembersTable();
    updateMemberDropdowns();
    
  } catch (err) {
    message('membersMessage', err.message, 'error');
  }
}

function renderMembersTable() {
  const tbody = document.querySelector('#membersTable tbody');
  tbody.innerHTML = '';
  
  let filteredMembers = [...members];
  
  if (searchTerms.members) {
    filteredMembers = filteredMembers.filter(m => 
      m.name.toLowerCase().includes(searchTerms.members) ||
      (m.phone && m.phone.includes(searchTerms.members)) ||
      String(m.id).includes(searchTerms.members)
    );
  }
  
  filteredMembers = sortData(filteredMembers, 'members');
  
  filteredMembers.forEach(m => {
    const memberGroups = groups.filter(g => g.members?.split(',').includes(String(m.id)));
    const groupNames = memberGroups.map(g => g.name).join(', ') || '-';
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${m.id}</td>
      <td>${m.name}</td>
      <td>${m.phone || '-'}</td>
      <td>${m.notes || '-'}</td>
      <td>${groupNames}</td>
      <td><span class="status-badge status-info">Active</span></td>
      <td class="action-buttons">
        <button class="btn-outline btn-sm" onclick="editMember(${m.id})"><i class="fas fa-edit"></i></button>
        <button class="btn-danger btn-sm" onclick="confirmDelete('member', ${m.id})"><i class="fas fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function addMember() {
  const name = document.getElementById('memberName').value.trim();
  const phone = document.getElementById('memberPhone').value.trim();
  const notes = document.getElementById('memberNotes').value.trim();
  const memberSelect = document.getElementById('memberGroups');
  const selectedGroups = Array.from(memberSelect.selectedOptions).map(opt => opt.value);

  if (!name || !phone) {
    message('membersMessage', 'Name and Phone are required', 'error');
    return;
  }

  const payload = { name, phone, notes, groups: selectedGroups.join(',') };

  const url = editId ? `${API.members}/${editId}` : API.members;
  const method = editId ? 'PUT' : 'POST';

  fetchJson(url, { method, body: JSON.stringify(payload) })
    .then(res => {
      if (res.status === 'success') {
        message('membersMessage', editId ? 'Member updated!' : 'Member added!');
        loadMembers();
        loadDashboard();
        hideForm('addMemberForm');
      } else {
        message('membersMessage', res.message || 'Error occurred', 'error');
      }
    })
    .catch(err => message('membersMessage', err.message, 'error'));
}

function editMember(id) {
  const member = members.find(m => m.id === id);
  if (!member) return;

  document.getElementById('memberName').value = member.name;
  document.getElementById('memberPhone').value = member.phone || '';
  document.getElementById('memberNotes').value = member.notes || '';

  const select = document.getElementById('memberGroups');
  Array.from(select.options).forEach(opt => {
    opt.selected = member.groups?.split(',').includes(opt.value);
  });

  showForm('addMemberForm', member);
}

// ==================== PAYMENTS ====================
async function loadPayments() {
  try {
    const json = await fetchJson(API.payments);
    if (json.status !== 'success') throw new Error(json.message);
    payments = json.data;
    renderPaymentsTable();
  } catch (err) {
    message('paymentsMessage', err.message, 'error');
  }
}

function renderPaymentsTable() {
  const tbody = document.querySelector('#paymentsTable tbody');
  tbody.innerHTML = '';

  let filteredPayments = [...payments];

  const fGroup   = document.getElementById('filterGroup')?.value;
  const fMember  = document.getElementById('filterMember')?.value;
  const fMonth   = document.getElementById('filterMonth')?.value;
  const fYear    = document.getElementById('filterYear')?.value;

  if (fGroup)   filteredPayments = filteredPayments.filter(p => String(p.group_id) === fGroup);
  if (fMember)  filteredPayments = filteredPayments.filter(p => String(p.member_id) === fMember);
  if (fMonth)   filteredPayments = filteredPayments.filter(p => String(p.month) === fMonth);
  if (fYear)    filteredPayments = filteredPayments.filter(p => String(p.year) === fYear);

  if (searchTerms.payments) {
    filteredPayments = filteredPayments.filter(p => {
      const group = groups.find(g => g.id == p.group_id);
      const member = members.find(m => m.id == p.member_id);
      return (
        group?.name?.toLowerCase().includes(searchTerms.payments) ||
        member?.name?.toLowerCase().includes(searchTerms.payments) ||
        String(p.id).includes(searchTerms.payments)
      );
    });
  }

  filteredPayments = sortData(filteredPayments, 'payments');

  filteredPayments.forEach(p => {
    const group = groups.find(g => g.id == p.group_id);
    const member = members.find(m => m.id == p.member_id);
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${p.id}</td>
      <td>${group?.name || p.group_id}</td>
      <td>${member?.name || p.member_id}</td>
      <td>₹${Number(p.amount||0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
      <td>${getMonthName(p.month)}</td>
      <td>${p.year}</td>
      <td><span class="status-badge status-paid">Paid</span></td>
      <td>${p.note || '-'}</td>
      <td>${formatDateTime(p.created_at)}</td>
      <td class="action-buttons">
        <button class="btn-outline btn-sm" onclick="editPayment(${p.id})"><i class="fas fa-edit"></i></button>
        <button class="btn-danger btn-sm" onclick="confirmDelete('payment', ${p.id})"><i class="fas fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function loadPaymentDropdowns() {
  const groupSelect = document.getElementById('paymentGroupId');
  if (groupSelect) {
    groupSelect.innerHTML = '<option value="">Select Group</option>';
    groups.forEach(g => {
      const option = document.createElement('option');
      option.value = g.id;
      option.textContent = `${g.name} (₹${g.monthly_amount || 0})`;
      groupSelect.appendChild(option);
    });
    
    groupSelect.removeEventListener('change', onPaymentGroupChange);
    groupSelect.addEventListener('change', onPaymentGroupChange);
  }
  
  const monthSelect = document.getElementById('paymentMonth');
  const yearSelect = document.getElementById('paymentYear');
  
  if (monthSelect) {
    monthSelect.removeEventListener('change', validatePaymentMonth);
    monthSelect.addEventListener('change', validatePaymentMonth);
  }
  
  if (yearSelect) {
    yearSelect.removeEventListener('change', validatePaymentMonth);
    yearSelect.addEventListener('change', validatePaymentMonth);
  }
}

function onPaymentGroupChange() {
  loadMembersForPayment();
  const groupId = document.getElementById('paymentGroupId').value;
  const group = groups.find(g => g.id == groupId);
  generateMonthYearOptions(group, 'paymentMonth', 'paymentYear');
}

function validatePaymentMonth() {
  const groupId = document.getElementById('paymentGroupId').value;
  const month = parseInt(document.getElementById('paymentMonth').value);
  const year = parseInt(document.getElementById('paymentYear').value);
  
  if (!groupId || !month || !year) {
    hide('monthWarning');
    return;
  }
  
  const group = groups.find(g => g.id == groupId);
  if (!group || !group.start_date) {
    hide('monthWarning');
    return;
  }
  
  const start = new Date(group.start_date);
  const selected = new Date(year, month - 1);
  const end = new Date(start);
  end.setMonth(start.getMonth() + (group.duration || 12));
  
  const warning = document.getElementById('monthWarning');
  if (selected < start || selected > end) {
    show('monthWarning');
  } else {
    hide('monthWarning');
  }
}

function loadMembersForPayment() {
  const groupId = document.getElementById('paymentGroupId').value;
  const memberSelect = document.getElementById('paymentMemberId');
  memberSelect.innerHTML = '<option value="">Select Member</option>';
  
  if (!groupId) return;
  
  const group = groups.find(g => g.id == groupId);
  if (!group || !group.members) return;
  
  const memberIds = group.members.split(',');
  members.filter(m => memberIds.includes(String(m.id))).forEach(m => {
    const option = document.createElement('option');
    option.value = m.id;
    option.textContent = `${m.name} (${m.phone || 'no phone'})`;
    memberSelect.appendChild(option);
  });
}

async function addPayment() {
  const groupId = document.getElementById('paymentGroupId').value;
  const memberId = document.getElementById('paymentMemberId').value;
  const amount = parseFloat(document.getElementById('paymentAmount').value);
  const month = parseInt(document.getElementById('paymentMonth').value);
  const year = parseInt(document.getElementById('paymentYear').value);
  const note = document.getElementById('paymentNote').value.trim();

  if (!groupId || !memberId || isNaN(amount) || !month || !year) {
    message('paymentsMessage', 'Please fill all required fields', 'error');
    return;
  }

  const payload = { group_id: groupId, member_id: memberId, amount, month, year, note };

  const url = editId ? `${API.payments}/${editId}` : API.payments;
  const method = editId ? 'PUT' : 'POST';

  try {
    const res = await fetchJson(url, { method, body: JSON.stringify(payload) });
    if (res.status === 'success') {
      message('paymentsMessage', editId ? 'Payment updated!' : 'Payment recorded!');
      loadPayments();
      loadDashboard();
      hideForm('addPaymentForm');
    } else {
      message('paymentsMessage', res.message || 'Error occurred', 'error');
    }
  } catch (err) {
    message('paymentsMessage', err.message, 'error');
  }
}

function editPayment(id) {
  const payment = payments.find(p => p.id === id);
  if (!payment) return;

  document.getElementById('paymentGroupId').value = payment.group_id;
  loadMembersForPayment();
  document.getElementById('paymentMemberId').value = payment.member_id;
  document.getElementById('paymentAmount').value = payment.amount || '';
  document.getElementById('paymentMonth').value = payment.month || '';
  document.getElementById('paymentYear').value = payment.year || '';
  document.getElementById('paymentNote').value = payment.note || '';

  showForm('addPaymentForm', payment);
}

// ==================== BIDS ====================
async function loadBids() {
  try {
    const json = await fetchJson(API.bids);
    if (json.status !== 'success') throw new Error(json.message);
    
    bids = json.data;
    renderBidsTable();
    
  } catch (err) {
    message('bidsMessage', err.message, 'error');
  }
}

function renderBidsTable() {
  const tbody = document.querySelector('#bidsTable tbody');
  tbody.innerHTML = '';
  
  let filteredBids = [...bids];
  
  if (searchTerms.bids) {
    filteredBids = filteredBids.filter(b => {
      const group = groups.find(g => g.id == b.group_id);
      const member = members.find(m => m.id == b.member_id);
      return (
        group?.name?.toLowerCase().includes(searchTerms.bids) ||
        member?.name?.toLowerCase().includes(searchTerms.bids) ||
        String(b.id).includes(searchTerms.bids)
      );
    });
  }
  
  filteredBids = sortData(filteredBids, 'bids');
  
  filteredBids.forEach(b => {
    const group = groups.find(g => g.id == b.group_id);
    const member = members.find(m => m.id == b.member_id);
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${b.id}</td>
      <td>${group?.name || b.group_id}</td>
      <td>${member?.name || b.member_id}</td>
      <td>₹${Number(b.amount||0).toLocaleString('en-IN')}</td>
      <td>${getMonthName(b.month)}</td>
      <td>${b.year}</td>
      <td>${b.bid_number || '-'}</td>
      <td>${b.notes || '-'}</td>
      <td>${formatDateTime(b.created_at)}</td>
      <td class="action-buttons">
        <button class="btn-outline btn-sm" onclick="editBid(${b.id})"><i class="fas fa-edit"></i></button>
        <button class="btn-danger btn-sm" onclick="confirmDelete('bid', ${b.id})"><i class="fas fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(row);
  });

  // Update summary
  const totalAmount = bids.reduce((sum, b) => sum + (b.amount || 0), 0);
  const avg = bids.length ? (totalAmount / bids.length).toFixed(0) : 0;
  document.getElementById('totalBidsCount').textContent = bids.length;
  document.getElementById('totalBidAmount').textContent = '₹' + totalAmount.toLocaleString();
  document.getElementById('averageBid').textContent = '₹' + avg;
}

function loadBidDropdowns() {
  const groupSelect = document.getElementById('bidGroupId');
  if (groupSelect) {
    groupSelect.innerHTML = '<option value="">Select Group</option>';
    groups.forEach(g => {
      const option = document.createElement('option');
      option.value = g.id;
      option.textContent = `${g.name} (₹${g.monthly_amount || 0})`;
      groupSelect.appendChild(option);
    });
    
    groupSelect.removeEventListener('change', onBidGroupChange);
    groupSelect.addEventListener('change', onBidGroupChange);
  }
}

function onBidGroupChange() {
  loadMembersForBid();
  const groupId = document.getElementById('bidGroupId').value;
  const group = groups.find(g => g.id == groupId);
  generateMonthYearOptions(group, 'bidMonth', 'bidYear');
}

function loadMembersForBid() {
  const groupId = document.getElementById('bidGroupId').value;
  const memberSelect = document.getElementById('bidMemberId');
  memberSelect.innerHTML = '<option value="">Select Member</option>';
  
  if (!groupId) return;
  
  const group = groups.find(g => g.id == groupId);
  if (!group || !group.members) return;
  
  const memberIds = group.members.split(',');
  members.filter(m => memberIds.includes(String(m.id))).forEach(m => {
    const option = document.createElement('option');
    option.value = m.id;
    option.textContent = `${m.name} (${m.phone || 'no phone'})`;
    memberSelect.appendChild(option);
  });
}

async function addBid() {
  const groupId = document.getElementById('bidGroupId').value;
  const memberId = document.getElementById('bidMemberId').value;
  const amount = parseFloat(document.getElementById('bidAmount').value);
  const month = parseInt(document.getElementById('bidMonth').value);
  const year = parseInt(document.getElementById('bidYear').value);
  const bidNumber = parseInt(document.getElementById('bidNumber').value) || 1;
  const notes = document.getElementById('bidNotes').value.trim();

  if (!groupId || !memberId || isNaN(amount) || !month || !year) {
    message('bidsMessage', 'Please fill all required fields', 'error');
    return;
  }

  const payload = { group_id: groupId, member_id: memberId, amount, month, year, bid_number: bidNumber, notes };

  const url = editId ? `${API.bids}/${editId}` : API.bids;
  const method = editId ? 'PUT' : 'POST';

  try {
    const res = await fetchJson(url, { method, body: JSON.stringify(payload) });
    if (res.status === 'success') {
      message('bidsMessage', editId ? 'Bid updated!' : 'Bid recorded!');
      loadBids();
      loadDashboard();
      hideForm('addBidForm');
    } else {
      message('bidsMessage', res.message || 'Error occurred', 'error');
    }
  } catch (err) {
    message('bidsMessage', err.message, 'error');
  }
}

function editBid(id) {
  const bid = bids.find(b => b.id === id);
  if (!bid) return;

  document.getElementById('bidGroupId').value = bid.group_id;
  loadMembersForBid();
  document.getElementById('bidMemberId').value = bid.member_id;
  document.getElementById('bidAmount').value = bid.amount || '';
  document.getElementById('bidMonth').value = bid.month || '';
  document.getElementById('bidYear').value = bid.year || '';
  document.getElementById('bidNumber').value = bid.bid_number || 1;
  document.getElementById('bidNotes').value = bid.notes || '';

  showForm('addBidForm', bid);
}

// ==================== REPORTS & DUES ====================
function loadDuesReport() {
  const groupId = document.getElementById('reportGroup').value;
  const memberId = document.getElementById('reportMember').value;
  
  const group = groups.find(g => g.id == groupId) || null;
  generateMonthYearOptions(group, "reportMonth", "reportYear");
  
  const month = document.getElementById('reportMonth').value;
  const year = document.getElementById('reportYear').value;
  
  renderDuesReport(groupId, memberId, month, year);
  
  if (group) {
    let summaryPanel = document.querySelector('.filters + .summary-panel');
    if (!summaryPanel) {
      summaryPanel = document.createElement('div');
      summaryPanel.className = 'summary-panel';
      document.querySelector('.filters').insertAdjacentElement('afterend', summaryPanel);
    }
    
    const memberCount = group.members ? group.members.split(',').length : 0;
    const currentDate = new Date();
    const startDate = new Date(group.start_date);
    const monthsPassed = Math.min(
      group.duration || 0,
      (currentDate.getFullYear() - startDate.getFullYear()) * 12 +
      (currentDate.getMonth() - startDate.getMonth()) + 1
    );
    
    const expectedTotal = (group.monthly_amount || 0) * memberCount * monthsPassed;
    const groupPayments = payments.filter(p => p.group_id === group.id);
    const collectedTotal = groupPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const pendingTotal = Math.max(0, expectedTotal - collectedTotal);
    
    summaryPanel.innerHTML = `
      <div class="summary-item"><label>Group</label><span>${group.name}</span></div>
      <div class="summary-item"><label>Monthly</label><span>₹${group.monthly_amount || 0}</span></div>
      <div class="summary-item"><label>Members</label><span>${memberCount}</span></div>
      <div class="summary-item"><label>Duration</label><span>${group.duration || 12} months</span></div>
      <div class="summary-item"><label>Expected</label><span>₹${expectedTotal.toLocaleString()}</span></div>
      <div class="summary-item"><label>Collected</label><span>₹${collectedTotal.toLocaleString()}</span></div>
      <div class="summary-item"><label>Pending</label><span class="${pendingTotal > 0 ? 'pending' : ''}">₹${pendingTotal.toLocaleString()}</span></div>
    `;
  }
}

function renderDuesReport(filterGroup, filterMember, filterMonth, filterYear) {
  const tbody = document.querySelector('#duesTable tbody');
  tbody.innerHTML = '';
  
  let totalExpected = 0;
  let totalCollected = 0;
  let totalBidAmount = 0;
  const currentDate = new Date();
  
  let filteredMembers = [...members];
  if (filterMember) filteredMembers = filteredMembers.filter(m => String(m.id) === filterMember);
  
  filteredMembers.forEach(member => {
    let memberGroups = groups.filter(g => g.members?.split(',').includes(String(member.id)));
    if (filterGroup) memberGroups = memberGroups.filter(g => String(g.id) === filterGroup);
    
    memberGroups.forEach(group => {
      const startDate = new Date(group.start_date);
      const monthlyAmount = group.monthly_amount || 0;
      const duration = group.duration || 12;
      
      let runningExpected = 0;
      let runningPaid = 0;
      let monthsToShow = [];
      
      for (let i = 0; i < duration; i++) {
        const date = new Date(startDate);
        date.setMonth(startDate.getMonth() + i);
        const m = date.getMonth() + 1;
        const y = date.getFullYear();
        
        let include = true;
        if (filterMonth && filterYear) {
          include = (m == filterMonth && y == filterYear);
        } else if (filterYear) {
          include = (y == filterYear);
        } else {
          include = (date <= currentDate);
        }
        
        if (include) monthsToShow.push({month: m, year: y});
      }
      
      monthsToShow.forEach(({ month, year }) => {
        const amount = monthlyAmount;
        runningExpected += amount;
        totalExpected += amount;
        
        const payment = payments.find(p => 
          String(p.group_id) === String(group.id) && 
          String(p.member_id) === String(member.id) && 
          p.month == month && p.year == year
        );
        
        const bid = bids.find(b => 
          String(b.group_id) === String(group.id) && 
          String(b.member_id) === String(member.id) && 
          b.month == month && b.year == year
        );
        
        if (bid) totalBidAmount += bid.amount || 0;
        if (payment) {
          runningPaid += payment.amount || 0;
          totalCollected += payment.amount || 0;
        }
        
        const balance = runningExpected - runningPaid;
        
        const status = payment ? 'Paid' : 'Pending';
        const statusClass = payment ? 'status-paid' : 'status-pending';
        const dueDate = new Date(year, month - 1, 1);
        const isOverdue = !payment && dueDate < currentDate;
        
        const row = document.createElement('tr');
        row.className = isOverdue ? 'overdue-row' : '';
        row.innerHTML = `
          <td>${member.name}</td>
          <td>${group.name}</td>
          <td>${member.phone || '-'}</td>
          <td>${getMonthName(month)}</td>
          <td>${year}</td>
          <td>₹${amount.toLocaleString('en-IN')}</td>
          <td>${payment ? '₹' + Number(payment.amount).toLocaleString('en-IN', {minimumFractionDigits:2}) : '₹0'}</td>
          <td class="balance-cell ${balance > 0 ? 'positive' : ''}">₹${balance.toLocaleString('en-IN')}</td>
          <td><span class="status-badge ${statusClass}">${status}</span></td>
          <td>${bid ? '₹' + Number(bid.amount).toLocaleString('en-IN') : '-'}</td>
          <td>
            ${!payment && member.phone ? 
              `<button class="whatsapp-btn btn-sm" onclick="sendWhatsAppReminder('${member.phone}', '${member.name.replace(/'/g,"\\'")}', ${amount}, '${group.name.replace(/'/g,"\\'")}')">
                <i class="fab fa-whatsapp"></i>
              </button>` : ''}
          </td>
        `;
        tbody.appendChild(row);
      });
    });
  });
  
  document.getElementById('totalExpected').textContent = '₹' + totalExpected.toLocaleString('en-IN');
  document.getElementById('totalCollected').textContent = '₹' + totalCollected.toLocaleString('en-IN');
  const pending = Math.max(0, totalExpected - totalCollected);
  document.getElementById('totalPending').textContent = '₹' + pending.toLocaleString('en-IN');
  const percent = totalExpected > 0 ? ((totalCollected / totalExpected) * 100).toFixed(1) : 0;
  document.getElementById('collectionPercent').textContent = percent + '%';
  document.getElementById('reportTotalBids').textContent = '₹' + totalBidAmount.toLocaleString('en-IN');
}

// ==================== DROPDOWNS & HELPERS ====================
function loadMemberDropdowns() {
  const groupSelect = document.getElementById('memberGroups');
  if (groupSelect) {
    groupSelect.innerHTML = '';
    groups.forEach(g => {
      const option = document.createElement('option');
      option.value = g.id;
      option.textContent = `${g.name} (₹${g.monthly_amount || 0})`;
      groupSelect.appendChild(option);
    });
  }
}

function loadGroupDropdowns() {
  const memberSelect = document.getElementById('groupMembers');
  if (memberSelect) {
    memberSelect.innerHTML = '';
    members.forEach(m => {
      const option = document.createElement('option');
      option.value = m.id;
      option.textContent = `${m.name} (${m.phone || 'no phone'})`;
      memberSelect.appendChild(option);
    });
  }
}

function updateMemberDropdowns() {
  ['filterMember', 'reportMember'].forEach(id => {
    const select = document.getElementById(id);
    if (select) {
      select.innerHTML = '<option value="">All Members</option>';
      members.forEach(m => {
        const option = document.createElement('option');
        option.value = m.id;
        option.textContent = m.name;
        select.appendChild(option);
      });
    }
  });
}

function updateGroupDropdowns() {
  ['filterGroup', 'reportGroup', 'paymentGroupId', 'bidGroupId'].forEach(id => {
    const select = document.getElementById(id);
    if (select) {
      select.innerHTML = '<option value="">All Groups</option>';
      groups.forEach(g => {
        const option = document.createElement('option');
        option.value = g.id;
        option.textContent = g.name;
        select.appendChild(option);
      });
    }
  });
}

function getMonthName(month) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[month - 1] || month;
}

function formatDate(date) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(date) {
  if (!date) return '-';
  return new Date(date).toLocaleString('en-IN', { 
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function clearFilters() {
  ['filterGroup','filterMember','filterMonth','filterYear'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderPaymentsTable();
}

function exportReport() {
  const rows = [];
  document.querySelectorAll('#duesTable tr').forEach(tr => {
    const row = [];
    tr.querySelectorAll('th, td').forEach(td => row.push(td.textContent.trim()));
    rows.push(row.join(','));
  });
  
  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'dues_report.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function printReport() {
  window.print();
}

function isGroupCompleted(group) {
  if (!group.start_date || !group.duration) return false;
  const end = new Date(group.start_date);
  end.setMonth(end.getMonth() + parseInt(group.duration));
  return new Date() > end;
}

function calculatePendingDues() {
  let totalDue = 0;
  const now = new Date();
  
  groups.forEach(group => {
    if (!group.members || !group.start_date) return;
    
    const start = new Date(group.start_date);
    const monthsPassed = Math.min(
      group.duration || 12,
      (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1
    );
    
    if (monthsPassed <= 0) return;
    
    const memberIds = group.members.split(',');
    const expectedPerMember = (group.monthly_amount || 0) * monthsPassed;
    const totalExpected = expectedPerMember * memberIds.length;
    
    const groupPayments = payments.filter(p => p.group_id == group.id);
    const totalPaid = groupPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    totalDue += Math.max(0, totalExpected - totalPaid);
  });
  
  return totalDue;
}

function calculateMemberDues(memberId) {
  let totalDue = 0;
  const now = new Date();
  
  groups.forEach(group => {
    if (!group.members?.split(',').includes(String(memberId))) return;
    
    const start = new Date(group.start_date);
    const monthsPassed = Math.min(
      group.duration || 12,
      (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1
    );
    
    if (monthsPassed <= 0) return;
    
    const expected = (group.monthly_amount || 0) * monthsPassed;
    
    const memberPayments = payments.filter(p => 
      p.group_id == group.id && p.member_id == memberId
    );
    const paid = memberPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    totalDue += Math.max(0, expected - paid);
  });
  
  return totalDue;
}

function confirmDelete(type, id) {
  if (!confirm(`Are you sure you want to delete this ${type}?`)) return;
  
  const url = `${API[type + 's']}/${id}`;
  fetchJson(url, { method: 'DELETE' })
    .then(res => {
      if (res.status === 'success') {
        message(`${type}Message`, `${type.charAt(0).toUpperCase() + type.slice(1)} deleted!`);
        if (type === 'group') loadGroups();
        if (type === 'member') loadMembers();
        if (type === 'payment') loadPayments();
        if (type === 'bid') loadBids();
        loadDashboard();
      } else {
        message(`${type}Message`, res.message || 'Delete failed', 'error');
      }
    })
    .catch(err => message(`${type}Message`, err.message, 'error'));
}
