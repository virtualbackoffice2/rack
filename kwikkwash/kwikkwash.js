function toggleOptions(clickedBtn) {
  const allDropdowns = document.querySelectorAll(".dropdown-options");
  allDropdowns.forEach(drop => {
    if (drop !== clickedBtn.nextElementSibling) drop.classList.remove("show");
  });
  const drop = clickedBtn.nextElementSibling;
  drop.classList.toggle("show");
}

function playErrorSound() {
  document.getElementById("errorSound").play();
  const popup = document.getElementById("popupMessage");
  popup.classList.add("show");
  setTimeout(() => popup.classList.remove("show"), 2000);
}

// Tab System
let tabIdCounter = 0;
const tabs = [];

function initTabs() {
  const homeId = tabIdCounter++;
  const homeBtn = document.createElement('div');
  homeBtn.className = 'tab-btn active';
  homeBtn.textContent = 'Home';
  homeBtn.onclick = () => switchTab(homeId);
  document.getElementById('tab-bar').appendChild(homeBtn);

  const homeContent = document.getElementById('home-content');
  homeContent.classList.add('tab-content', 'active');

  tabs.push({id: homeId, btn: homeBtn, content: homeContent, isHome: true});
}

function openTab(url, title) {
  if (url.includes('docs.google.com/spreadsheets') ||
      url.includes('del-desk.excitel.in') ||
      url.includes('partners.denonline.in')) {

    window.open(url, '_blank');
    return;
  }

  const tabId = tabIdCounter++;
  const tabBtn = document.createElement('div');
  tabBtn.className = 'tab-btn';
  tabBtn.textContent = title;

  const closeSpan = document.createElement('span');
  closeSpan.className = 'close-tab';
  closeSpan.textContent = '×';
  closeSpan.onclick = (e) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  tabBtn.appendChild(closeSpan);
  tabBtn.onclick = () => switchTab(tabId);

  document.getElementById('tab-bar').appendChild(tabBtn);

  const contentDiv = document.createElement('div');
  contentDiv.className = 'tab-content';
  contentDiv.style.position = 'absolute';
  contentDiv.style.top = '0';
  contentDiv.style.left = '0';
  contentDiv.style.width = '100%';
  contentDiv.style.height = '100%';
  contentDiv.style.display = 'none';
  contentDiv.style.overflow = 'auto';

  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.style.width = '100%';
  iframe.style.height = 'calc(100% - 30px)';
  iframe.style.border = 'none';
  iframe.style.display = 'block';

  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation allow-downloads allow-web-share');

  iframe.onload = function() {};

  iframe.onerror = function() {
    contentDiv.innerHTML = '';
    const fallbackLink = document.createElement('a');
    fallbackLink.href = url;
    fallbackLink.target = '_blank';
    fallbackLink.textContent = 'This site cannot be displayed in frame. Click to open in new tab.';
    fallbackLink.style.display = 'block';
    fallbackLink.style.padding = '20px';
    fallbackLink.style.textAlign = 'center';
    contentDiv.appendChild(fallbackLink);
  };

  contentDiv.appendChild(iframe);
  document.getElementById('tab-contents').appendChild(contentDiv);

  tabs.push({id: tabId, btn: tabBtn, content: contentDiv, isHome: false});
  switchTab(tabId);
}

function switchTab(tabId) {
  tabs.forEach(tab => {
    tab.content.style.display = 'none';
    tab.btn.classList.remove('active');
    tab.content.classList.remove('active');
  });

  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    tab.content.style.display = 'block';
    tab.btn.classList.add('active');
    tab.content.classList.add('active');
  }
}

function closeTab(tabId) {
  const index = tabs.findIndex(t => t.id === tabId);
  if (index === -1 || tabs[index].isHome) return;

  const tab = tabs[index];
  tab.content.style.opacity = '0';
  tab.content.style.transform = 'translateX(20px)';
  tab.btn.style.opacity = '0';
  tab.btn.style.transform = 'translateX(20px)';

  setTimeout(() => {
    tab.btn.remove();
    tab.content.remove();
    tabs.splice(index, 1);

    if (tabs.length > 0) {
      switchTab(tabs[Math.max(0, index - 1)].id);
    }
  }, 800);
}

function logout() {
  const domain = window.location.hostname;

  document.cookie.split(";").forEach(function(c) {
    if (c.trim().split("=")[0].includes(domain)) {
      document.cookie =
        c.trim().split("=")[0] +
        "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=" + domain;
    }
  });

  localStorage.clear();
  sessionStorage.clear();

  window.location.href = "https://vbo.co.in";
}

window.addEventListener('load', () => {
  initTabs();
});
