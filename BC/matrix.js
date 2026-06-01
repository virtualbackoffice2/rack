const IS_LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const BASE = IS_LOCAL ? 'http://localhost:8000' : 'https://app.vbo.co.in';
const CLIENT = 'achalmerotra';
const API = `${BASE}/${CLIENT}/bc`;
const PARAMS = new URLSearchParams(window.location.search);

const state = {
  members: [],
  matrix: null,
  currentBcId: Number(PARAMS.get('bc_id')),
  memberFilterId: Number(PARAMS.get('member_id') || 0),
  memberFilterName: PARAMS.get('member_name') || '',
  expandedMonth: Number(localStorage.getItem('bcExpandedMonth') || 1),
  saving: false,
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!state.currentBcId) {
    toast('BC not selected', 'bad');
    return;
  }
  await loadMembers();
  await loadMatrix();
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

function toast(message, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast ${type}`;
  setTimeout(() => el.classList.add('hidden'), 2400);
}

function icon(name) {
  const paths = {
    save: '<path d="M4 3h10l2 2v12H4z"></path><path d="M6 3v5h7V3"></path><path d="M7 14h6"></path>',
    trash: '<path d="M3 5h14"></path><path d="M7 5V3h6v2"></path><path d="M6 7l.6 10h6.8L14 7"></path>',
    more: '<circle cx="5" cy="10" r="1.4"></circle><circle cx="10" cy="10" r="1.4"></circle><circle cx="15" cy="10" r="1.4"></circle>',
  };
  return `<svg viewBox="0 0 20 20" aria-hidden="true">${paths[name] || ''}</svg>`;
}

function setSaving(isSaving) {
  state.saving = isSaving;
  document.body.classList.toggle('is-saving', isSaving);
}

async function withScrollPreserved(work) {
  const wrap = document.querySelector('.matrix-wrap');
  const left = wrap ? wrap.scrollLeft : 0;
  const top = wrap ? wrap.scrollTop : 0;
  setSaving(true);
  try {
    await work();
  } finally {
    renderMatrix();
    requestAnimationFrame(() => {
      const nextWrap = document.querySelector('.matrix-wrap');
      if (nextWrap) {
        nextWrap.scrollLeft = left;
        nextWrap.scrollTop = top;
      }
      setSaving(false);
    });
  }
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

async function loadMatrix() {
  try {
    const res = await request(`/bcs/${state.currentBcId}/matrix`);
    state.matrix = res.data;
    renderMatrix();
  } catch (err) {
    toast(err.message, 'bad');
  }
}

function renderMatrix() {
  const data = state.matrix;
  if (!data) return;
  const bc = data.bc;
  document.getElementById('matrixName').textContent = bc.name || 'BC Matrix';
  document.getElementById('matrixMeta').textContent = `${bc.start_date || 'No date'} | ${bc.duration_months} months | Monthly total ${money(bc.monthly_total)}`;
  document.getElementById('perUnitDue').textContent = `Per unit: ${money(bc.per_unit_due)}`;
  const visibleUnits = getVisibleUnits(data);
  document.getElementById('matrixUnits').textContent = `Units: ${visibleUnits.length}/${bc.unit_count || data.units.length}`;
  const badge = document.getElementById('filterBadge');
  badge.classList.toggle('hidden', !hasMemberFilter());
  badge.textContent = hasMemberFilter() ? `Only ${state.memberFilterName || 'selected member'}` : '';
  renderMatrixHead(data.months);
  renderMatrixBody(data);
}

function renderMatrixHead(months) {
  const head = document.querySelector('#matrixTable thead');
  let monthHeads = '';
  months.forEach(month => {
    const label = monthLabel(month.month_no);
    if (state.expandedMonth === month.month_no) {
      monthHeads += `
        <th colspan="5" class="month-head expanded" onclick="toggleMonth(${month.month_no})">
          ${label}<br><small>less ${money(month.discount_share)} each</small>
        </th>`;
    } else {
      monthHeads += `
        <th class="month-head" onclick="toggleMonth(${month.month_no})">
          ${label}<br><small>Balance</small>
        </th>`;
    }
  });

  let subHeads = '<tr><th>Unit</th><th>Name</th><th>Phone</th><th>Area</th><th>Unit Note</th><th>Action</th>';
  months.forEach(month => {
    subHeads += state.expandedMonth === month.month_no
      ? `<th>Due</th>
         <th><span class="head-save">Expense <button class="mini-save" type="button" title="Save expense column" onclick="saveMonthColumn(${month.month_no}, 'expense_amount')">${icon('save')}</button></span></th>
         <th><span class="head-save">Paid <button class="mini-save" type="button" title="Save paid column" onclick="saveMonthColumn(${month.month_no}, 'paid_amount')">${icon('save')}</button></span></th>
         <th>Balance</th>
         <th><span class="head-save">Pay Remark <button class="mini-save" type="button" title="Save remark column" onclick="saveMonthColumn(${month.month_no}, 'payment_remark')">${icon('save')}</button></span></th>`
      : '<th>Balance</th>';
  });
  subHeads += '<th>Received Month</th><th>Received Amount</th></tr>';
  head.innerHTML = `<tr><th colspan="6"></th>${monthHeads}<th colspan="2">BC Received</th></tr>${subHeads}`;
}

function renderMatrixBody(data) {
  const body = document.querySelector('#matrixTable tbody');
  const visibleUnits = getVisibleUnits(data);
  const maxUnitNo = visibleUnits.reduce((max, unit) => Math.max(max, Number(unit.unit_no || 0)), 0);
  const unitTarget = hasMemberFilter() ? visibleUnits.length : Math.max(Number(data.bc.unit_count || 0), maxUnitNo, 1);
  const unitRows = hasMemberFilter()
    ? visibleUnits
    : Array.from({ length: unitTarget }, (_, idx) => data.units.find(u => Number(u.unit_no) === idx + 1) || { unit_no: idx + 1, id: '' });

  body.innerHTML = unitRows.map(unit => {
    let cells = '';
    data.months.forEach(month => {
      if (!unit.id) {
        cells += state.expandedMonth === month.month_no
          ? '<td colspan="5" class="muted-cell">Save member first</td>'
          : '<td class="muted-cell">-</td>';
        return;
      }
      const row = month.rows.find(r => r.unit_id === unit.id) || {};
      const balanceClass = Number(row.balance) > 0 ? 'pending blink-soft' : Number(row.balance) < 0 ? 'advance' : 'clear';
      if (state.expandedMonth === month.month_no) {
        cells += `
          <td class="due">${money(row.due_amount)}</td>
          <td><input class="cell-input" type="number" step="1" value="${numberValue(row.expense_amount)}" data-field="expense_amount" data-unit="${unit.id}" data-month="${month.month_no}"></td>
          <td><input class="cell-input" type="number" step="1" value="${numberValue(row.paid_amount)}" data-field="paid_amount" data-unit="${unit.id}" data-month="${month.month_no}"></td>
          <td class="${balanceClass}">${money(row.balance)}</td>
          <td><input class="remark-input" value="${text(row.payment_remark || '')}" data-field="payment_remark" data-unit="${unit.id}" data-month="${month.month_no}"></td>`;
      } else {
        cells += `<td class="${balanceClass}">${money(row.balance)}</td>`;
      }
    });

    const receipt = unit.id ? findReceiptForUnit(data.months, unit.id) : null;
    return `
      <tr>
        <td>${unit.unit_no || ''}</td>
        <td><input class="member-input" list="memberSuggestions" value="${text(unit.member_name || '')}" data-unit-detail="${unit.id || ''}" data-unit-no="${unit.unit_no}" data-field="member_name" oninput="fillMemberSuggestion(this)" placeholder="Required"></td>
        <td><input class="member-input" value="${text(unit.phone || '')}" data-unit-detail="${unit.id || ''}" data-unit-no="${unit.unit_no}" data-field="phone"></td>
        <td><input class="member-input" value="${text(unit.area || '')}" data-unit-detail="${unit.id || ''}" data-unit-no="${unit.unit_no}" data-field="area"></td>
        <td><input class="member-input" value="${text(unit.remarks || '')}" data-unit-detail="${unit.id || ''}" data-unit-no="${unit.unit_no}" data-field="remarks"></td>
        <td class="row-actions">
          <button class="icon-btn" type="button" title="Save member" onclick="saveUnitDetails('${unit.id || ''}', ${unit.unit_no})">${icon('save')}</button>
          ${unit.id ? `<button class="icon-btn danger" type="button" title="Delete unit" onclick="deleteUnit(${unit.id})">${icon('trash')}</button>` : ''}
        </td>
        ${cells}
        <td>${unit.id ? (receipt ? monthLabel(receipt.month_no) : receiptMonthSelect(unit.id, data.months)) : '-'}</td>
        <td>${unit.id ? `<div class="inline-save"><input class="received-input" type="number" step="1" value="${numberValue(receipt?.amount_received)}" data-received-unit="${unit.id}"><button class="icon-btn" type="button" title="Save received amount" onclick="saveReceipt(${unit.id})">${icon('save')}</button></div>` : '-'}</td>
      </tr>
    `;
  }).join('') + renderGrandTotalRow(data);
}

function getVisibleUnits(data) {
  if (!hasMemberFilter()) return data.units;
  const name = state.memberFilterName.trim().toLowerCase();
  return data.units.filter(unit => {
    if (state.memberFilterId && Number(unit.member_id || 0) === Number(state.memberFilterId)) return true;
    return name && String(unit.member_name || '').trim().toLowerCase() === name;
  });
}

function hasMemberFilter() {
  return Boolean(state.memberFilterId || state.memberFilterName);
}

function renderGrandTotalRow(data) {
  let dueTotal = 0, expenseTotal = 0, paidTotal = 0, balanceTotal = 0, receivedTotal = 0;
  let cells = '';
  data.months.forEach(month => {
    const rows = hasMemberFilter()
      ? month.rows.filter(row => getVisibleUnits(data).some(unit => Number(unit.id) === Number(row.unit_id)))
      : month.rows;
    const monthDue = rows.reduce((sum, row) => sum + Number(row.due_amount || 0), 0);
    const monthExpense = rows.reduce((sum, row) => sum + Number(row.expense_amount || 0), 0);
    const monthPaid = rows.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0);
    const monthBalance = rows.reduce((sum, row) => sum + Number(row.balance || 0), 0);
    dueTotal += monthDue;
    expenseTotal += monthExpense;
    paidTotal += monthPaid;
    balanceTotal += monthBalance;
    cells += state.expandedMonth === month.month_no
      ? `<td>${money(monthDue)}</td><td>${money(monthExpense)}</td><td>${money(monthPaid)}</td><td>${money(monthBalance)}</td><td></td>`
      : `<td>${money(monthBalance)}</td>`;
    if (month.receipt && (!hasMemberFilter() || getVisibleUnits(data).some(unit => Number(unit.id) === Number(month.receipt.unit_id)))) {
      receivedTotal += Number(month.receipt.amount_received || 0);
    }
  });

  return `
    <tr class="grand-total">
      <td colspan="6">Total</td>
      ${cells}
      <td>Total Received</td>
      <td>${money(receivedTotal)}</td>
    </tr>
  `;
}

function receiptMonthSelect(unitId, months) {
  const options = months.map(m => `<option value="${m.month_no}">${monthLabel(m.month_no)}</option>`).join('');
  return `<select data-received-month="${unitId}"><option value="">Select</option>${options}</select>`;
}

function findReceiptForUnit(months, unitId) {
  for (const month of months) {
    const receipt = month.receipt;
    if (receipt && Number(receipt.unit_id) === Number(unitId)) {
      return { month_no: month.month_no, amount_received: receipt.amount_received };
    }
  }
  return null;
}

function toggleMonth(monthNo) {
  state.expandedMonth = monthNo;
  localStorage.setItem('bcExpandedMonth', String(monthNo));
  renderMatrix();
}

async function saveMonthColumn(monthNo, fieldName) {
  const inputs = [...document.querySelectorAll(`[data-month="${monthNo}"][data-field="${fieldName}"]`)];
  if (!inputs.length) return;
  try {
    await withScrollPreserved(async () => {
      for (const input of inputs) {
        const unitId = input.dataset.unit;
        const rowFields = document.querySelectorAll(`[data-unit="${unitId}"][data-month="${monthNo}"]`);
        const payload = {};
        rowFields.forEach(rowInput => {
          payload[rowInput.dataset.field] = rowInput.value;
        });
        const res = await request(`/bcs/${state.currentBcId}/units/${unitId}/months/${monthNo}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        state.matrix = res.data;
      }
      notifyParent();
    });
    toast('Record saved !');
  } catch (err) {
    setSaving(false);
    toast(err.message, 'bad');
  }
}

function memberByInput(value) {
  const clean = String(value || '').trim().toLowerCase();
  if (!clean) return null;
  return state.members.find(m =>
    String(m.name || '').trim().toLowerCase() === clean ||
    String(m.phone || '').trim().toLowerCase() === clean
  );
}

function fillMemberSuggestion(input) {
  const found = memberByInput(input.value);
  if (!found) return;
  const unitNo = input.dataset.unitNo;
  document.querySelectorAll(`[data-unit-no="${unitNo}"]`).forEach(el => {
    if (el.dataset.field === 'member_name') el.value = found.name || '';
    if (el.dataset.field === 'phone') el.value = found.phone || '';
    if (el.dataset.field === 'area') el.value = found.area || '';
  });
}

async function saveUnitDetails(unitId, unitNo) {
  const inputs = document.querySelectorAll(`[data-unit-no="${unitNo}"][data-unit-detail="${unitId}"]`);
  const unit = { id: unitId || undefined, unit_no: unitNo };
  inputs.forEach(input => {
    unit[input.dataset.field] = input.value.trim();
  });
  if (!unit.member_name) {
    toast('Member name is required', 'bad');
    return;
  }
  try {
    await withScrollPreserved(async () => {
      const res = await request(`/bcs/${state.currentBcId}/units`, {
        method: 'POST',
        body: JSON.stringify({ units: [unit] }),
      });
      state.matrix = res.data;
      await loadMembers();
      notifyParent();
    });
    toast('Record saved !');
  } catch (err) {
    setSaving(false);
    toast(err.message, 'bad');
  }
}

async function deleteUnit(unitId) {
  showMatrixConfirm({
    title: 'Delete Unit',
    text: 'Remove this member unit from this BC matrix?',
    onYes: async () => {
      try {
        await request(`/bcs/${state.currentBcId}/units/${unitId}`, { method: 'DELETE' });
        await loadMatrix();
        notifyParent();
        toast('Unit deleted');
      } catch (err) {
        toast(err.message, 'bad');
      }
    },
  });
}

async function saveReceipt(unitId) {
  const existing = findReceiptForUnit(state.matrix.months, unitId);
  const monthEl = document.querySelector(`[data-received-month="${unitId}"]`);
  const amountEl = document.querySelector(`[data-received-unit="${unitId}"]`);
  const monthNo = existing?.month_no || Number(monthEl?.value);
  if (!monthNo) {
    toast('Select received month', 'bad');
    return;
  }
  try {
    await withScrollPreserved(async () => {
      const res = await request(`/bcs/${state.currentBcId}/receipt`, {
        method: 'PUT',
        body: JSON.stringify({
          unit_id: unitId,
          month_no: monthNo,
          amount_received: amountEl.value || 0,
        }),
      });
      state.matrix = res.data;
      notifyParent();
    });
    toast('Record saved !');
  } catch (err) {
    setSaving(false);
    toast(err.message, 'bad');
  }
}

function monthLabel(monthNo) {
  const startDate = state.matrix?.bc?.start_date;
  return monthLabelFromDate(startDate, Number(monthNo || 1) - 1);
}

function monthLabelFromDate(dateText, offset) {
  const date = dateText ? new Date(`${dateText}T00:00:00`) : new Date();
  date.setMonth(date.getMonth() + Number(offset || 0));
  return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

function closeMatrix() {
  window.parent.postMessage({ type: 'close-matrix' }, '*');
}

function notifyParent() {
  window.parent.postMessage({ type: 'matrix-updated' }, '*');
}

function showMatrixConfirm({ title, text: message, onYes }) {
  document.getElementById('matrixConfirmTitle').textContent = title;
  document.getElementById('matrixConfirmText').textContent = message;
  document.getElementById('matrixConfirmModal').classList.remove('hidden');
  document.getElementById('matrixConfirmYes').onclick = async () => {
    closeMatrixConfirm();
    await onYes();
  };
}

function closeMatrixConfirm() {
  document.getElementById('matrixConfirmModal').classList.add('hidden');
}

function downloadCsv() {
  const data = state.matrix;
  const rows = [['Unit', 'Member', 'Phone', 'Area', 'BC', 'Month', 'Due', 'Expense', 'Paid', 'Balance', 'Remark', 'Received']];
  getVisibleUnits(data).forEach(unit => {
    data.months.forEach(month => {
      const entry = month.rows.find(row => Number(row.unit_id) === Number(unit.id));
      if (!entry) return;
      rows.push([
        unit.unit_no || '',
        unit.member_name || '',
        unit.phone || '',
        unit.area || '',
        data.bc.name || '',
        monthLabel(month.month_no),
        Math.round(entry.due_amount || 0),
        Math.round(entry.expense_amount || 0),
        Math.round(entry.paid_amount || 0),
        Math.round(entry.balance || 0),
        entry.payment_remark || '',
        entry.is_receiver ? Math.round(entry.amount_received || 0) : '',
      ]);
    });
  });
  const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(data.bc.name || 'bc-matrix').replace(/[^a-z0-9]+/gi, '_')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
