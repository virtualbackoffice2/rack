const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbz-FZM6fwvv0ruaSv-PbEG8sHNOmldJn6kXtRY6e7NZ9YlN3TJ5Oe9ECMwmGBTK-LMTnA/exec';
const TOKEN = 'abcd1234';

let oltData = {};
let dashboardA7 = null;

async function loadData() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  loadingOverlay.style.display = 'flex';
  const url = WEB_APP_URL + '?token=' + encodeURIComponent(TOKEN);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok: ' + response.statusText);
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    const rows = data.rows || [];
    dashboardA7 = data.dashboardA7 !== undefined && data.dashboardA7 !== null ? Number(data.dashboardA7) : null;

    const olts = [
      { id: 'O1I5', pons: 8 },
      { id: 'O2I6', pons: 8 },
      { id: 'O3I7', pons: 4 },
      { id: 'O4I9', pons: 4 },
      { id: 'O5I2', pons: 8 }
    ];

    for (let oltObj of olts) {
      const olt = oltObj.id;
      const maxPon = oltObj.pons;
      let total = 0, offTotal = 0, tickTotal = 0;
      for (let i = 1; i <= maxPon; i++) {
        const nmid = olt + 'P' + i;
        const filtered = rows.filter(r => r['NMID'] === nmid && r['Users']);

        const allRows = filtered;
        const offRows = filtered.filter(r => r['Downs']);
        const tickRows = filtered.filter(r => r['Ticket']);
        const dropTimes = filtered.map(r => r['Drops']).filter(v => v && v !== '');

        oltData[nmid] = { all: allRows, off: offRows, tick: tickRows, drops: dropTimes };

        document.getElementById(`pon${i}-${olt}`).textContent = allRows.length;
        document.getElementById(`off${i}-${olt}`).textContent = offRows.length;
        document.getElementById(`tick${i}-${olt}`).textContent = tickRows.length;

        let statusCell = document.getElementById(`stat${i}-${olt}`);
        let dropCount = dropTimes.length;
        if (dashboardA7 !== null && !isNaN(dashboardA7)) {
          let isOn = dropCount < dashboardA7;
          if (isOn) {
            statusCell.textContent = "🟢";
            statusCell.className = "onStatus";
          } else {
            statusCell.textContent = "🔴";
            statusCell.className = "offStatus";
          }
        } else {
          statusCell.textContent = "-";
          statusCell.className = "";
        }

        total += allRows.length;
        offTotal += offRows.length;
        tickTotal += tickRows.length;
      }

      document.getElementById(`oltTotal-${olt}`).textContent = total;
      document.getElementById(`oltOffTotal-${olt}`).textContent = offTotal;
      document.getElementById(`oltTickTotal-${olt}`).textContent = tickTotal;
    }

    // Re-attach event listeners after data load
    attachEventListeners();

  } catch (err) {
    console.error('Fetch error:', err);
    const olts = [
      { id: 'O1I5', pons: 8 },
      { id: 'O2I6', pons: 8 },
      { id: 'O3I7', pons: 4 },
      { id: 'O4I9', pons: 4 },
      { id: 'O5I2', pons: 8 }
    ];
    for (let oltObj of olts) {
      const olt = oltObj.id;
      const maxPon = oltObj.pons;
      for (let i = 1; i <= maxPon; i++) {
        document.getElementById(`pon${i}-${olt}`).textContent = 'Error';
        document.getElementById(`off${i}-${olt}`).textContent = 'Error';
        document.getElementById(`tick${i}-${olt}`).textContent = 'Error';
        document.getElementById(`stat${i}-${olt}`).textContent = '-';
      }
      document.getElementById(`oltTotal-${olt}`).textContent = 'Error';
      document.getElementById(`oltOffTotal-${olt}`).textContent = 'Error';
      document.getElementById(`oltTickTotal-${olt}`).textContent = 'Error';
    }
  } finally {
    loadingOverlay.style.display = 'none';
  }
}

function showToast() {
  const toast = document.getElementById('toast');
  toast.className = 'show';
  setTimeout(() => { toast.className = ''; }, 3000);
}

function attachEventListeners() {
  const olts = [
    { id: 'O1I5', pons: 8 },
    { id: 'O2I6', pons: 8 },
    { id: 'O3I7', pons: 4 },
    { id: 'O4I9', pons: 4 },
    { id: 'O5I2', pons: 8 }
  ];
  for (let oltObj of olts) {
    const olt = oltObj.id;
    const maxPon = oltObj.pons;
    for (let i = 1; i <= maxPon; i++) {
      const ponElement = document.getElementById(`pon${i}-${olt}`);
      const offElement = document.getElementById(`off${i}-${olt}`);
      const tickElement = document.getElementById(`tick${i}-${olt}`);
      if (ponElement) {
        ponElement.addEventListener('click', () => {
          if (ponElement.textContent === '0') {
            showToast();
          } else {
            showUsers('all', `${olt}P${i}`, olt, `P${i}`);
          }
        });
      }
      if (offElement) {
        offElement.addEventListener('click', () => {
          if (offElement.textContent === '0') {
            showToast();
          } else {
            showUsers('off', `${olt}P${i}`, olt, `P${i}`);
          }
        });
      }
      if (tickElement) {
        tickElement.addEventListener('click', () => {
          if (tickElement.textContent === '0') {
            showToast();
          } else {
            showUsers('tick', `${olt}P${i}`, olt, `P${i}`);
          }
        });
      }
    }
    const totalElement = document.getElementById(`oltTotal-${olt}`);
    const offTotalElement = document.getElementById(`oltOffTotal-${olt}`);
    const tickTotalElement = document.getElementById(`oltTickTotal-${olt}`);
    if (totalElement) {
      totalElement.addEventListener('click', () => {
        if (totalElement.textContent === '0') {
          showToast();
        } else {
          showOltUsers('all', olt, maxPon);
        }
      });
    }
    if (offTotalElement) {
      offTotalElement.addEventListener('click', () => {
        if (offTotalElement.textContent === '0') {
          showToast();
        } else {
          showOltUsers('off', olt, maxPon);
        }
      });
    }
    if (tickTotalElement) {
      tickTotalElement.addEventListener('click', () => {
        if (tickTotalElement.textContent === '0') {
          showToast();
        } else {
          showOltUsers('tick', olt, maxPon);
        }
      });
    }
  }
}

// Modal for PON
function showUsers(type, nmid, olt, pon) {
  let title = "Users Details";
  if (type === "off") title = "Offline Users Details";
  if (type === "tick") title = "Ticket Users Details";

  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalSubTitle').textContent = `OLT: ${olt} PON: ${pon}`;

  const currentUsers = (oltData[nmid] && oltData[nmid][type]) || [];

  if (currentUsers.length === 0) {
    showToast();
    return;
  }

  const userDetails = document.getElementById('userDetails');
  userDetails.innerHTML = '<table><thead><tr><th>Sn</th><th>Name</th><th>Number</th><th>Location</th><th>Address</th><th>Power</th><th>Remarks</th></tr></thead><tbody></tbody></table>';
  const tbody = userDetails.querySelector('tbody');

  currentUsers.forEach((r, index) => {
    const tr = document.createElement('tr');
    if (r['Ticket']) {
      tr.classList.add('red', 'blink');
    } else if (r['Downs']) {
      tr.classList.add('pink', 'blink');
    }
    const lastCalledNo = r['Last called no'];
    const number = (typeof lastCalledNo === 'string' && lastCalledNo.trim()) ? lastCalledNo.trim() : (r['Number'] || '');
    tr.innerHTML = `<td>${index + 1}</td><td>${r['Name'] || ''}</td><td>${number}</td><td>${r['Location'] || ''}</td><td>${r['Address'] || ''}</td><td>${r['Power'] || ''}</td><td>${r['Remarks'] || ''}</td>`;
    tbody.appendChild(tr);
  });

  const modalButtons = document.getElementById('modalButtons');
  modalButtons.innerHTML = '';

  const downloadBtn = document.createElement('button');
  downloadBtn.textContent = 'Download CSV';
  downloadBtn.style.marginRight = '10px';
  downloadBtn.onclick = () => {
    try {
      let csv = 'Sn,Name,Number,Location,Address,Power,Remarks\n';
      currentUsers.forEach((r, index) => {
        const lastCalledNo = r['Last called no'];
        const number = (typeof lastCalledNo === 'string' && lastCalledNo.trim()) ? lastCalledNo.trim() : (r['Number'] || '');
        const row = [
          index + 1,
          r['Name'] || '',
          number,
          r['Location'] || '',
          r['Address'] || '',
          r['Power'] || '',
          r['Remarks'] || ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        csv += row + '\n';
      });
      const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'users.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV download error:', err);
      alert('Failed to download CSV. Please check the console for details.');
    }
  };
  modalButtons.appendChild(downloadBtn);

  const shareBtn = document.createElement('button');
  shareBtn.textContent = 'Share Screenshot on WhatsApp';
  shareBtn.onclick = () => {
    html2canvas(document.getElementById('screenshotContent'), {scale: 2}).then(canvas => {
      canvas.toBlob(blob => {
        const file = new File([blob], 'screenshot.png', {type: 'image/png'});
        if (navigator.canShare && navigator.canShare({files: [file]})) {
          navigator.share({files: [file]}).catch(err => {
            console.error('Share failed:', err);
            alert('Sharing failed. Downloading screenshot instead.');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'screenshot.png';
            a.click();
            URL.revokeObjectURL(url);
          });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'screenshot.png';
          a.click();
          URL.revokeObjectURL(url);
        }
      });
    }).catch(err => {
      console.error('Screenshot error:', err);
      alert('Failed to capture screenshot. Please check the console for details.');
    });
  };
  modalButtons.appendChild(shareBtn);

  document.getElementById('userModal').style.display = 'flex';
}

// Modal for OLT totals
function showOltUsers(type, olt, maxPon) {
  let title = "All Users Details";
  if (type === "off") title = "All Offline Users Details";
  if (type === "tick") title = "All Ticket Users Details";

  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalSubTitle').textContent = `OLT: ${olt}`;

  let currentUsers = [];
  for (let i = 1; i <= maxPon; i++) {
    const nmid = olt + 'P' + i;
    if (oltData[nmid] && oltData[nmid][type]) {
      currentUsers.push(...oltData[nmid][type]);
    }
  }

  if (currentUsers.length === 0) {
    showToast();
    return;
  }

  const userDetails = document.getElementById('userDetails');
  userDetails.innerHTML = '<table><thead><tr><th>Sn</th><th>Name</th><th>Number</th><th>Location</th><th>Address</th><th>Power</th><th>Remarks</th></tr></thead><tbody></tbody></table>';
  const tbody = userDetails.querySelector('tbody');

  currentUsers.forEach((r, index) => {
    const tr = document.createElement('tr');
    if (r['Ticket']) {
      tr.classList.add('red', 'blink');
    } else if (r['Downs']) {
      tr.classList.add('pink', 'blink');
    }
    const lastCalledNo = r['Last called no'];
    const number = (typeof lastCalledNo === 'string' && lastCalledNo.trim()) ? lastCalledNo.trim() : (r['Number'] || '');
    tr.innerHTML = `<td>${index + 1}</td><td>${r['Name'] || ''}</td><td>${number}</td><td>${r['Location'] || ''}</td><td>${r['Address'] || ''}</td><td>${r['Power'] || ''}</td><td>${r['Remarks'] || ''}</td>`;
    tbody.appendChild(tr);
  });

  const modalButtons = document.getElementById('modalButtons');
  modalButtons.innerHTML = '';

  const downloadBtn = document.createElement('button');
  downloadBtn.textContent = 'Download CSV';
  downloadBtn.style.marginRight = '10px';
  downloadBtn.onclick = () => {
    try {
      let csv = 'Sn,Name,Number,Location,Address,Power,Remarks\n';
      currentUsers.forEach((r, index) => {
        const lastCalledNo = r['Last called no'];
        const number = (typeof lastCalledNo === 'string' && lastCalledNo.trim()) ? lastCalledNo.trim() : (r['Number'] || '');
        const row = [
          index + 1,
          r['Name'] || '',
          number,
          r['Location'] || '',
          r['Address'] || '',
          r['Power'] || '',
          r['Remarks'] || ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        csv += row + '\n';
      });
      const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'users.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV download error:', err);
      alert('Failed to download CSV. Please check the console for details.');
    }
  };
  modalButtons.appendChild(downloadBtn);

  const shareBtn = document.createElement('button');
  shareBtn.textContent = 'Share Screenshot on WhatsApp';
  shareBtn.onclick = () => {
    html2canvas(document.getElementById('screenshotContent'), {scale: 2}).then(canvas => {
      canvas.toBlob(blob => {
        const file = new File([blob], 'screenshot.png', {type: 'image/png'});
        if (navigator.canShare && navigator.canShare({files: [file]})) {
          navigator.share({files: [file]}).catch(err => {
            console.error('Share failed:', err);
            alert('Sharing failed. Downloading screenshot instead.');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'screenshot.png';
            a.click();
            URL.revokeObjectURL(url);
          });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'screenshot.png';
          a.click();
          URL.revokeObjectURL(url);
        }
      });
    }).catch(err => {
      console.error('Screenshot error:', err);
      alert('Failed to capture screenshot. Please check the console for details.');
    });
  };
  modalButtons.appendChild(shareBtn);

  document.getElementById('userModal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('userModal').style.display = 'none';
}

window.addEventListener('load', loadData);
