const IS_LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const BASE = IS_LOCAL ? 'http://localhost:8000' : 'https://app.vbo.co.in';
const CLIENT = 'achalmerotra';
const API = `${BASE}/${CLIENT}/bc`;

const state = {
  bcs: [],
  members: [],
  matrix: null,
  currentBcId: null,
  expandedMonth: null,
  editBcId: null,
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('bcForm').addEventListener('submit', createBc);
  document.getElementById('globalSearch').addEventListener('input', () => loadBcs());
  window.addEventListener('message', handleMatrixMessage);
  loadMembers();
  loadBcs().then(restoreMatrixFromHash);
});

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.message || 'Action failed');
  return data;
}

function money(value) {
  return 'Rs. ' + Math.round(Number(value || 0)).toLocaleString('en-IN');
}

function numberValue(value) {
  const n = Math.round(Number(value || 0));
  return n ? String(n) : '';
}

function text(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function icon(name) {
  const paths = {
    edit: '<path d="M4 13.5V17h3.5L16.8 7.7l-3.5-3.5L4 13.5z"></path><path d="M12.6 4.9l1.5-1.5a1.4 1.4 0 0 1 2 0l.5.5a1.4 1.4 0 0 1 0 2l-1.5 1.5"></path>',
    trash: '<path d="M3 5h14"></path><path d="M7 5V3h6v2"></path><path d="M6 7l.6 10h6.8L14 7"></path>',
  };
  return `<svg viewBox="0 0 20 20" aria-hidden="true">${paths[name] || ''}</svg>`;
}

function toast(message, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast ${type}`;
  setTimeout(() => el.classList.add('hidden'), 2400);
}

let confirmTimer = null;

function showConfirm({ title, text: message, onYes, critical = false, waitSeconds = 0, yesText = 'Yes' }) {
  const modal = document.getElementById('confirmModal');
  const titleEl = document.getElementById('confirmTitle');
  const textEl = document.getElementById('confirmText');
  const criticalEl = document.getElementById('confirmCritical');
  const yesBtn = document.getElementById('confirmYes');

  clearInterval(confirmTimer);
  titleEl.textContent = title;
  textEl.textContent = message;
  criticalEl.classList.toggle('hidden', !critical);
  criticalEl.textContent = critical ? 'Critical action. Please wait before confirming.' : '';
  yesBtn.textContent = yesText;
  yesBtn.disabled = waitSeconds > 0;
  yesBtn.classList.toggle('danger', critical);
  modal.classList.remove('hidden');

  if (waitSeconds > 0) {
    let remaining = waitSeconds;
    yesBtn.textContent = `${yesText} (${remaining})`;
    confirmTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(confirmTimer);
        yesBtn.disabled = false;
        yesBtn.textContent = yesText;
        criticalEl.textContent = 'Now you can delete, if you are sure.';
      } else {
        yesBtn.textContent = `${yesText} (${remaining})`;
      }
    }, 1000);
  }

  yesBtn.onclick = async () => {
    if (yesBtn.disabled) return;
    closeConfirm();
    await onYes();
  };
}

function closeConfirm() {
  clearInterval(confirmTimer);
  document.getElementById('confirmModal').classList.add('hidden');
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function toggleBcForm() {
  const form = document.getElementById('bcForm');
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) {
    if (!form.elements.start_date.value) {
      form.elements.start_date.value = new Date().toISOString().slice(0, 10);
    }
    syncBcNameFromDate();
    form.elements.start_date.focus();
  }
}

function resetBcForm() {
  const form = document.getElementById('bcForm');
  form.reset();
  form.elements.duration_months.value = 12;
  form.classList.add('hidden');
  state.editBcId = null;
  document.getElementById('bcSubmitBtn').textContent = 'Create BC';
}

function syncBcNameFromDate() {
  const form = document.getElementById('bcForm');
  const date = form.elements.start_date.value;
  if (!date) return;
  const generated = dateLabelFromDate(date);
  if (!form.elements.name.value || form.elements.name.dataset.auto === '1') {
    form.elements.name.value = generated;
    form.elements.name.dataset.auto = '1';
  }
  form.elements.name.addEventListener('input', () => {
    form.elements.name.dataset.auto = '0';
  }, { once: true });
}

async function loadMembers() {
  try {
    const res = await request('/members');
    state.members = res.data || [];
    const list = document.getElementById('memberSuggestions');
    list.innerHTML = state.members.map(m => `
      <option value="${text(m.name)}">${text([m.phone, m.area].filter(Boolean).join(' - '))}</option>
      ${m.phone ? `<option value="${text(m.phone)}">${text([m.name, m.area].filter(Boolean).join(' - '))}</option>` : ''}
    `).join('');
  } catch (err) {
    toast(err.message, 'bad');
  }
}

async function loadBcs() {
  try {
    const q = document.getElementById('globalSearch').value.trim();
    const res = await request(`/bcs${q ? `?search=${encodeURIComponent(q)}` : ''}`);
    state.bcs = res.data || [];
    document.getElementById('bcListHint').textContent = q ? `Search result for "${q}"` : 'All BCs';
    renderBcs();
    renderPersonalLedger(q);
  } catch (err) {
    toast(err.message, 'bad');
  }
}

async function renderPersonalLedger(query) {
  const panel = document.getElementById('personalLedgerPanel');
  const bcListPanel = document.getElementById('bcListPanel');
  const tbody = document.querySelector('#personalLedgerTable tbody');
  if (!query) {
    panel.classList.add('hidden');
    bcListPanel.classList.remove('hidden');
    tbody.innerHTML = '';
    return;
  }

  bcListPanel.classList.add('hidden');
  const q = query.toLowerCase();
  const rows = [];
  const currentLabel = new Date().toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  document.getElementById('ledgerDueHead').textContent = `${currentLabel} Due`;
  document.getElementById('ledgerPaidHead').textContent = `${currentLabel} Paid`;
  document.getElementById('ledgerBalanceHead').textContent = `${currentLabel} Balance`;
  let totalDue = 0;
  let totalPaid = 0;
  let totalBalance = 0;
  let totalReceived = 0;
  for (const bc of state.bcs) {
    try {
      const res = await request(`/bcs/${bc.id}/matrix`);
      const matrix = res.data;
      matrix.units.forEach(unit => {
        const haystack = [unit.member_name, unit.phone, unit.area].join(' ').toLowerCase();
        if (!haystack.includes(q)) return;
        const current = currentMonthEntry(matrix, unit.id);
        const due = Number(current?.due_amount || 0);
        const paid = Number(current?.paid_amount || 0);
        const balance = Number(current?.balance || 0);
        let received = 0;
        matrix.months.forEach(month => {
          const entry = month.rows.find(row => Number(row.unit_id) === Number(unit.id));
          if (entry?.is_receiver) received += Number(entry.amount_received || 0);
        });
        totalDue += due;
        totalPaid += paid;
        totalBalance += balance;
        totalReceived += received;
        rows.push({ bc, unit, due, paid, balance, received });
      });
    } catch (err) {
      // Keep search usable even if one matrix fails.
    }
  }

  document.getElementById('personalLedgerHint').textContent = rows.length
    ? `All matching units for "${query}"`
    : `No unit found for "${query}"`;
  tbody.innerHTML = rows.length ? rows.map(row => `
    <tr>
      <td>${text(row.unit.member_name || '-')}</td>
      <td>${text(row.unit.phone || '-')}</td>
      <td>${text(row.unit.area || '-')}</td>
      <td>${text(row.bc.name || '-')}</td>
      <td>${row.unit.unit_no || '-'}</td>
      <td>${money(row.due)}</td>
      <td>${money(row.paid)}</td>
      <td class="${row.balance > 0 ? 'pending' : row.balance < 0 ? 'advance' : 'clear'}">${money(row.balance)}</td>
      <td>${row.received ? money(row.received) : '-'}</td>
      <td><button class="link-btn" type="button" title="Open member ledger" onclick="openBc(${row.bc.id}, ${row.unit.member_id || 0}, decodeURIComponent('${encodeURIComponent(row.unit.member_name || '')}'))">${text(row.bc.name || 'Open')}</button></td>
    </tr>
  `).join('') + `
    <tr class="grand-total">
      <td colspan="5">Total</td>
      <td>${money(totalDue)}</td>
      <td>${money(totalPaid)}</td>
      <td>${money(totalBalance)}</td>
      <td>${money(totalReceived)}</td>
      <td></td>
    </tr>
  ` : '<tr><td colspan="10" class="empty">No matching member unit found.</td></tr>';
  panel.classList.remove('hidden');
}

function currentMonthEntry(matrix, unitId) {
  const bc = matrix.bc;
  if (!bc.start_date) return null;
  const start = new Date(`${bc.start_date}T00:00:00`);
  const now = new Date();
  let monthNo = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1;
  monthNo = Math.max(1, Math.min(Number(bc.duration_months || 1), monthNo));
  const month = matrix.months.find(item => Number(item.month_no) === monthNo);
  return month?.rows.find(row => Number(row.unit_id) === Number(unitId)) || null;
}

function renderBcs() {
  const tbody = document.querySelector('#bcTable tbody');
  if (!state.bcs.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">No BC found. Press + BC to create one.</td></tr>';
    return;
  }
  tbody.innerHTML = state.bcs.map(bc => `
    <tr class="clickable" onclick="openBc(${bc.id})">
      <td><strong>${text(bc.name)}</strong></td>
      <td>${text(bc.start_date || '-')}</td>
      <td>${bc.duration_months || 0} months</td>
      <td>${money(bc.monthly_total)}</td>
      <td>${money(bc.per_unit_due)}</td>
      <td>${bc.units_added || 0}/${bc.unit_count || 0}</td>
      <td>${money(bc.paid_total)}</td>
      <td>${text(bc.remarks || '-')}</td>
      <td class="row-actions" onclick="event.stopPropagation()">
        <button class="icon-btn" type="button" title="Edit BC" onclick="editBc(${bc.id})">${icon('edit')}</button>
        <button class="icon-btn danger" type="button" title="Delete BC" onclick="deleteBc(${bc.id})">${icon('trash')}</button>
      </td>
    </tr>
  `).join('');
}

async function createBc(event) {
  event.preventDefault();
  const form = event.target;
  const payload = formData(form);
  if (!payload.name && payload.start_date) payload.name = payload.start_date;
  try {
    const wasEditing = Boolean(state.editBcId);
    const path = wasEditing ? `/bcs/${state.editBcId}` : '/bcs';
    const method = wasEditing ? 'PUT' : 'POST';
    const res = await request(path, { method, body: JSON.stringify(payload) });
    const openId = state.editBcId || res.data?.id;
    resetBcForm();
    await loadBcs();
    toast(wasEditing ? 'BC updated' : 'BC created');
    if (openId && !wasEditing) openBc(openId);
  } catch (err) {
    toast(err.message, 'bad');
  }
}

function editBc(id) {
  const bc = state.bcs.find(item => Number(item.id) === Number(id));
  if (!bc) return;
  showConfirm({
    title: 'Edit BC',
    text: `Edit "${bc.name}" details?`,
    yesText: 'Edit',
    onYes: () => openBcEditForm(bc),
  });
}

function openBcEditForm(bc) {
  const form = document.getElementById('bcForm');
  form.classList.remove('hidden');
  state.editBcId = bc.id;
  form.elements.name.value = bc.name || '';
  form.elements.start_date.value = bc.start_date || '';
  form.elements.duration_months.value = bc.duration_months || 12;
  form.elements.monthly_total.value = numberValue(bc.monthly_total);
  form.elements.unit_count.value = bc.unit_count || '';
  form.elements.remarks.value = bc.remarks || '';
  document.getElementById('bcSubmitBtn').textContent = 'Update BC';
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function deleteBc(id) {
  const bc = state.bcs.find(item => Number(item.id) === Number(id));
  if (!bc) return;
  showConfirm({
    title: 'Critical Delete',
    text: `Delete whole BC "${bc.name}"? All matrix entries for this BC will be removed.`,
    critical: true,
    waitSeconds: 5,
    yesText: 'Delete BC',
    onYes: async () => {
      try {
        await request(`/bcs/${id}`, { method: 'DELETE' });
        if (Number(state.currentBcId) === Number(id)) showHome();
        await loadBcs();
        toast('BC deleted');
      } catch (err) {
        toast(err.message, 'bad');
      }
    },
  });
}

async function openBc(id, memberId = 0, memberName = '') {
  state.currentBcId = id;
  const hash = new URLSearchParams();
  hash.set('bc', id);
  if (memberId) hash.set('member_id', memberId);
  if (memberName) hash.set('member_name', memberName);
  window.location.hash = hash.toString();
  document.getElementById('homeView').classList.add('hidden');
  document.getElementById('matrixView').classList.remove('hidden');
  document.getElementById('backBtn').classList.remove('hidden');
  const url = new URL('matrix.html', window.location.href);
  url.searchParams.set('bc_id', id);
  if (memberId) url.searchParams.set('member_id', memberId);
  if (memberName) url.searchParams.set('member_name', memberName);
  document.getElementById('matrixFrame').src = url.href;
}

function showHome() {
  state.matrix = null;
  state.currentBcId = null;
  history.replaceState('', document.title, window.location.pathname + window.location.search);
  document.getElementById('homeView').classList.remove('hidden');
  document.getElementById('matrixView').classList.add('hidden');
  document.getElementById('backBtn').classList.add('hidden');
  document.getElementById('matrixFrame').src = 'about:blank';
  loadBcs();
}

function restoreMatrixFromHash() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const bcId = Number(params.get('bc'));
  if (bcId) openBc(bcId, Number(params.get('member_id') || 0), params.get('member_name') || '');
}

function handleMatrixMessage(event) {
  if (!event.data || !event.data.type) return;
  if (event.data.type === 'close-matrix') showHome();
  if (event.data.type === 'matrix-updated') loadBcs();
}

function monthLabelFromDate(dateText, offset) {
  const date = dateText ? new Date(`${dateText}T00:00:00`) : new Date();
  date.setMonth(date.getMonth() + Number(offset || 0));
  return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

function dateLabelFromDate(dateText) {
  const date = dateText ? new Date(`${dateText}T00:00:00`) : new Date();
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}
