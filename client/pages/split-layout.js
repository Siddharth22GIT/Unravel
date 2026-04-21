/* ═══════════════════════════════════════════════════
   UNRAVEL — Split Layout JS
   Drag-to-resize + Session Analysis History store
═══════════════════════════════════════════════════ */
(function () {
  'use strict';

  const overlay = document.getElementById('drag-overlay');

  /* ════════════════════════════════════
     VERTICAL DIVIDER  (left ↔ right)
  ════════════════════════════════════ */
  function initVerticalDivider(dividerEl, leftEl, containerEl) {
    let dragging = false, startX = 0, startW = 0;

    dividerEl.addEventListener('mousedown', e => {
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startW = leftEl.getBoundingClientRect().width;
      dividerEl.classList.add('dragging');
      overlay.className = 'col';
      overlay.style.display = 'block';
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const cw   = containerEl.getBoundingClientRect().width;
      const newW = Math.max(260, Math.min(startW + (e.clientX - startX), cw - 300));
      leftEl.style.width = leftEl.style.flex = '';
      leftEl.style.width = newW + 'px';
      leftEl.style.flex  = '0 0 ' + newW + 'px';
      if (window._aceEditor) window._aceEditor.resize();
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      dividerEl.classList.remove('dragging');
      overlay.style.display = 'none';
      if (window._aceEditor) window._aceEditor.resize();
    });
  }

  /* ════════════════════════════════════
     HORIZONTAL DIVIDER  (editor ↕ bottom)
  ════════════════════════════════════ */
  function initHorizontalDivider(dividerEl, editorEl, bottomEl, rightColEl) {
    let dragging = false, startY = 0, startEdH = 0;

    dividerEl.addEventListener('mousedown', e => {
      e.preventDefault();
      dragging = true;
      startY   = e.clientY;
      startEdH = editorEl.getBoundingClientRect().height;
      dividerEl.classList.add('dragging');
      overlay.className = 'row';
      overlay.style.display = 'block';
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const colH   = rightColEl.getBoundingClientRect().height;
      const newEdH = Math.max(80, Math.min(startEdH + (e.clientY - startY), colH - 90));
      editorEl.style.flex   = '0 0 ' + newEdH + 'px';
      bottomEl.style.height = Math.max(80, colH - newEdH - 12) + 'px';
      if (window._aceEditor) window._aceEditor.resize();
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      dividerEl.classList.remove('dragging');
      overlay.style.display = 'none';
      if (window._aceEditor) window._aceEditor.resize();
    });
  }

  /* ════════════════════════════════════
     TAB SWITCHER
     Looks for [data-tab] buttons and [data-panel] panels
     inside containerEl
  ════════════════════════════════════ */
  function initTabs(containerEl, defaultTab) {
    const buttons = containerEl.querySelectorAll('[data-tab]');
    const panels  = containerEl.querySelectorAll('[data-panel]');

    function activate(tabId) {
      buttons.forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
      panels.forEach(p  => p.classList.toggle('active', p.dataset.panel === tabId));
    }

    buttons.forEach(b => b.addEventListener('click', () => activate(b.dataset.tab)));
    if (defaultTab) activate(defaultTab);

    return { activate };
  }

  /* ════════════════════════════════════
     SESSION HISTORY STORE
     Stores analysis results in sessionStorage so they
     survive tab switches but reset on page close.
  ════════════════════════════════════ */
  const HISTORY_KEY = 'unravel_analysis_history';

  function getHistory() {
    try {
      return JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]');
    } catch { return []; }
  }

  function saveHistory(items) {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 50)));
  }

  function addHistoryEntry(entry) {
    /* entry = { time, space, explanation, snippet, lang, timestamp } */
    const items = getHistory();
    items.unshift({ ...entry, timestamp: Date.now() });
    saveHistory(items);
  }

  function clearHistory() {
    sessionStorage.removeItem(HISTORY_KEY);
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /* Render the history list into a container element */
  function renderHistory(containerEl, onClickEntry) {
    const items = getHistory();
    containerEl.innerHTML = '';

    if (items.length === 0) {
      containerEl.innerHTML = '<div class="history-empty">No analyses yet this session.<br>Run and Analyze some code to get started.</div>';
      return;
    }

    // Clear button
    const clearBtn = document.createElement('button');
    clearBtn.className = 'history-clear-btn';
    clearBtn.textContent = 'Clear history';
    clearBtn.addEventListener('click', () => {
      clearHistory();
      renderHistory(containerEl, onClickEntry);
    });
    containerEl.appendChild(clearBtn);

    items.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.innerHTML = `
        <div class="hi-meta">
          <span style="opacity:0.55;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;">#${items.length - idx}</span>
          <div class="hi-badges">
            <span class="hi-badge time">${item.time || '—'}</span>
            <span class="hi-badge space">${item.space || '—'}</span>
          </div>
          <span class="hi-time">${formatTime(item.timestamp)}</span>
        </div>
        <div class="hi-snippet">${escapeHtml(item.snippet || '')}</div>
      `;
      el.addEventListener('click', () => onClickEntry && onClickEntry(item));
      containerEl.appendChild(el);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ════════════════════════════════════
     PUBLIC API
  ════════════════════════════════════ */
  window.SplitLayout = {
    initVerticalDivider,
    initHorizontalDivider,
    initTabs,
    History: { add: addHistoryEntry, get: getHistory, clear: clearHistory, render: renderHistory },
  };

})();
