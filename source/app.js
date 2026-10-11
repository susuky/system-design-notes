(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const meta = JSON.parse($('course-meta').textContent);
  const validChapters = new Set(meta.map(ch => ch.id));
  const storageKey = 'system-design-textbook-v1';
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  let current = null, toastTimer, saveTimer, storageAvailable = true;
  let state = {theme: 'system', bookmarks: [], completed: [], progress: {}, last: null};
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved === 'object') {
      if (['system', 'light', 'dark'].includes(saved.theme)) state.theme = saved.theme;
      for (const key of ['bookmarks', 'completed']) if (Array.isArray(saved[key])) state[key] = [...new Set(saved[key].filter(id => validChapters.has(id)))];
      if (saved.progress && typeof saved.progress === 'object') {
        for (const id of validChapters) {
          const value = saved.progress[id];
          if (typeof value === 'number' && Number.isFinite(value)) state.progress[id] = Math.max(0, Math.min(100, value));
        }
      }
      // Keep the original reader's state key and {chapter, anchor} resume shape.
      const last = typeof saved.last === 'string' ? {chapter: $(saved.last)?.closest('article')?.id, anchor: saved.last} : saved.last;
      if (last && validChapters.has(last.chapter)) {
        const anchor = typeof last.anchor === 'string' && $(last.anchor)?.closest('article')?.id === last.chapter ? last.anchor : last.chapter;
        state.last = {chapter: last.chapter, anchor};
      }
    }
  } catch (_) { storageAvailable = false; }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); storageAvailable = true; }
    catch (_) { storageAvailable = false; }
    if (!storageAvailable) $('storage-note').textContent = '瀏覽器無法保存資料；目前操作仍有效，但關閉後可能遺失。';
  }
  function toast(text) {
    clearTimeout(toastTimer);
    $('toast').textContent = text; $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000);
  }
  function setTheme() {
    document.documentElement.dataset.theme = state.theme === 'system' ? (systemDark.matches ? 'dark' : 'light') : state.theme;
    $('theme-select').value = state.theme;
  }
  function refreshProgress() {
    const count = state.completed.length;
    $('course-progress').value = count;
    $('course-progress').textContent = `${count} / ${meta.length}`;
    $('course-progress-text').textContent = `${count} / ${meta.length}`;
    $('bookmark-count').textContent = state.bookmarks.length;
    document.querySelectorAll('.chapter-link[data-chapter]').forEach(link => {
      const completed = state.completed.includes(link.dataset.chapter);
      link.classList.toggle('is-complete', completed);
      link.querySelector('.nav-done').textContent = completed ? '✓' : '';
      link.setAttribute('aria-label', `${link.textContent.replace('✓', '').trim()}${completed ? '，已完成' : ''}`);
    });
    if (current) {
      const bookmarked = state.bookmarks.includes(current.id), complete = state.completed.includes(current.id);
      $('bookmark-button').setAttribute('aria-pressed', String(bookmarked));
      $('bookmark-button').querySelector('span').textContent = bookmarked ? '已加入書籤' : '加入書籤';
      $('complete-button').setAttribute('aria-pressed', String(complete));
      $('complete-button').querySelector('span').textContent = complete ? '已完成' : '標記完成';
    }
    if (state.last) {
      const chapter = meta.find(c => c.id === state.last.chapter);
      if (chapter) {
        $('resume-link').hidden = false;
        $('resume-link').href = '#' + state.last.anchor;
        $('resume-link').textContent = `繼續上次閱讀：${chapter.number} ${chapter.short}`;
      }
    }
  }
  function toggleProgress(key) {
    if (!current) return;
    const index = state[key].indexOf(current.id);
    if (index === -1) state[key].push(current.id); else state[key].splice(index, 1);
    save(); refreshProgress();
    toast(key === 'bookmarks' ? (index === -1 ? '已收藏本章' : '已移除本章書籤') : (index === -1 ? '本章已標記完成' : '已取消完成標記'));
  }
  function setDrawer(open, restoreFocus = true) {
    $('sidebar').classList.toggle('is-open', open);
    $('drawer-backdrop').hidden = !open;
    $('menu-button').setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('drawer-open', open);
    const lock = open && window.matchMedia('(max-width: 900px)').matches;
    $('main-content').inert = lock;
    document.querySelector('.topbar').inert = lock;
    if (open) { $('sidebar').setAttribute('role', 'dialog'); $('sidebar').setAttribute('aria-modal', 'true'); $('sidebar-close').focus(); } else { $('sidebar').removeAttribute('role'); $('sidebar').removeAttribute('aria-modal'); }
    if (!open && restoreFocus) $('menu-button').focus();
  }
  function safeHash() {
    try { return decodeURIComponent(location.hash.slice(1)); } catch (_) { return ''; }
  }
  function updateReadingProgress() {
    if (!current) { $('reading-progress').style.width = '0%'; return; }
    const article = $(current.id), top = article.getBoundingClientRect().top + window.scrollY;
    const length = Math.max(1, article.offsetHeight - window.innerHeight * 0.65);
    const percentage = Math.max(0, Math.min(100, (window.scrollY - top + 110) / length * 100));
    $('reading-progress').style.width = percentage + '%';
    state.progress[current.id] = Math.max(state.progress[current.id] || 0, percentage);
    clearTimeout(saveTimer); saveTimer = setTimeout(save, 250);
  }
  function trackReading() {
    updateReadingProgress();
    if (!current) return;
    let anchor = current.id;
    for (const topic of current.topics) {
      if ($(topic.id).getBoundingClientRect().top <= 150) anchor = topic.id;
    }
    state.last = {chapter: current.id, anchor};
  }
  function route() {
    const hash = safeHash();
    let target = $(hash || 'course-home');
    if (!target || target.closest('dialog')) target = $('course-home');
    const article = target.closest('article');
    current = article ? meta.find(ch => ch.id === article.id) || null : null;
    if (article && !current && !target.closest('#course-home')) target = $('course-home');
    $('course-home').hidden = !!current;
    $('reader').hidden = !current;
    meta.forEach(ch => {$(ch.id).hidden = current ? ch.id !== current.id : true;});
    document.querySelectorAll('.chapter-link[data-chapter]').forEach(link => {
      const active = link.dataset.chapter === current?.id;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    if (current) {
      document.title = `${current.short}｜系統設計`;
      $('reader-position').textContent = `${current.number} / ${meta.length}`;
      $('topic-count').textContent = `（${current.topics.length}）`;
      $('topic-list').replaceChildren(...current.topics.map(topic => {
        const li = document.createElement('li'), a = document.createElement('a');
        a.href = '#' + topic.id; a.textContent = topic.text; li.append(a); return li;
      }));
      const position = meta.indexOf(current);
      for (const [id, next] of [['prev-chapter', meta[position - 1]], ['next-chapter', meta[position + 1]]]) {
        const link = $(id);
        link.href = '#' + (next?.id || 'course-home');
        link.querySelector('strong').textContent = next ? `${next.number} ${next.short}` : '學習路線圖';
        link.querySelector('span').textContent = next ? (id === 'prev-chapter' ? '上一章' : '下一章') : '回到首頁';
      }
      state.last = {chapter: current.id, anchor: target.id}; save();
    } else document.title = '系統設計：讓架構回應需求';
    refreshProgress();
    if ($('sidebar').classList.contains('is-open')) setDrawer(false, false);
    if (target.id === 'course-home') window.scrollTo({top: 0, behavior: 'instant'});
    else {
      // Reveal an anchored answer if a deep link points inside a closed details element.
      let ancestor = target.parentElement;
      while (ancestor && ancestor !== document.body) { if (ancestor.tagName === 'DETAILS') ancestor.open = true; ancestor = ancestor.parentElement; }
      window.SystemDesignVisuals?.reveal(target);
      requestAnimationFrame(() => {
        target.scrollIntoView({block: 'start'});
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({preventScroll: true});
      });
    }
    updateReadingProgress();
  }
  const searchIndex = [];
  for (const chapter of meta) {
    const article = $(chapter.id);
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_ELEMENT);
    let node, section = {id: chapter.id, chapter: chapter.short, title: chapter.title, text: '', keywords: chapter.keywords, nodes: []};
    while ((node = walker.nextNode())) {
      if (node.tagName === 'H3' && node.id) { searchIndex.push(section); section = {id: node.id, chapter: chapter.short, title: node.textContent.trim(), text: '', keywords: chapter.keywords, nodes: []}; }
      if (['P', 'LI', 'PRE', 'FIGCAPTION', 'TD', 'TH', 'SUMMARY', 'H2', 'H4'].includes(node.tagName)) { section.text += ' ' + node.textContent.trim(); section.nodes.push(node); }
    }
    searchIndex.push(section);
  }
  function search() {
    const query = $('search-input').value.trim().toLocaleLowerCase();
    $('search-results').replaceChildren();
    if (!query) { $('search-status').textContent = '輸入關鍵字，從全書找出相關小節。'; return; }
    const terms = query.split(/\s+/).filter(Boolean);
    const results = searchIndex.filter(s => terms.every(term => (s.title + ' ' + s.text + ' ' + s.keywords).toLocaleLowerCase().includes(term))).map(s => ({...s, score: terms.reduce((n, t) => n + (s.title.toLocaleLowerCase().includes(t) ? 10 : 0), 0)})).sort((a, b) => b.score - a.score);
    $('search-status').textContent = results.length ? `找到 ${results.length} 個小節${results.length > 40 ? '，顯示前 40 個' : ''}。` : '沒有找到相符內容。試試較短的中文關鍵字或英文名詞。';
    for (const result of results.slice(0, 40)) {
      const li = document.createElement('li'), a = document.createElement('a'), small = document.createElement('small'), strong = document.createElement('strong'), p = document.createElement('p');
      a.className = 'search-result'; a.href = '#' + result.id;
      small.textContent = result.chapter; strong.textContent = result.title;
      const text = result.text.replace(/\s+/g, ' ').trim(), found = Math.max(0, text.toLocaleLowerCase().indexOf(terms[0])), start = Math.max(0, found - 35);
      p.textContent = (start ? '…' : '') + text.slice(start, start + 160) + (text.length > start + 160 ? '…' : '');
      a.append(small, strong, p); li.append(a); $('search-results').append(li);
      a.addEventListener('click', () => {
        for (const node of result.nodes) if (terms.every(term => node.textContent.toLocaleLowerCase().includes(term))) { let ancestor = node.closest('details'); while (ancestor) { ancestor.open = true; ancestor = ancestor.parentElement?.closest('details'); } }
        $('search-dialog').close(); if (safeHash() === result.id) route();
      });
    }
  }
  function openDialog(dialog, focusTarget) {
    if (dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    focusTarget?.focus();
  }
  function showBookmarks() {
    $('bookmark-list').replaceChildren();
    const saved = meta.filter(ch => state.bookmarks.includes(ch.id));
    $('empty-bookmarks').hidden = saved.length > 0;
    for (const ch of saved) {
      const li = document.createElement('li'), a = document.createElement('a');
      a.className = 'bookmark-result'; a.href = '#' + ch.id; a.textContent = `${ch.number}　${ch.short}`;
      a.addEventListener('click', () => { $('bookmark-dialog').close(); if (safeHash() === ch.id) route(); });
      li.append(a); $('bookmark-list').append(li);
    }
    openDialog($('bookmark-dialog'), $('close-bookmarks'));
  }
  const printDetails = [];
  function beforePrint() {
    printDetails.length = 0;
    document.querySelectorAll('#chapters details').forEach(detail => { if (!detail.open) { printDetails.push(detail); detail.open = true; } });
  }
  function afterPrint() { printDetails.splice(0).forEach(detail => { detail.open = false; }); }
  document.querySelector('.skip-link').addEventListener('click', event => { event.preventDefault(); $('main-content').focus({preventScroll: true}); });
  $('search-button').addEventListener('click', () => openDialog($('search-dialog'), $('search-input')));
  $('close-search').addEventListener('click', () => $('search-dialog').close());
  $('search-input').addEventListener('input', search);
  $('show-bookmarks').addEventListener('click', showBookmarks);
  $('close-bookmarks').addEventListener('click', () => $('bookmark-dialog').close());
  $('bookmark-button').addEventListener('click', () => toggleProgress('bookmarks'));
  $('complete-button').addEventListener('click', () => toggleProgress('completed'));
  $('theme-select').addEventListener('change', event => {state.theme = event.target.value; setTheme(); save();});
  systemDark.addEventListener('change', () => { if (state.theme === 'system') setTheme(); });
  $('menu-button').addEventListener('click', () => setDrawer(true));
  $('sidebar-close').addEventListener('click', () => setDrawer(false));
  $('sidebar').addEventListener('click', event => { const link = event.target.closest('a[href^="#"]'); if (link && $('sidebar').classList.contains('is-open')) { setDrawer(false, false); if (link.hash === location.hash) route(); } });
  $('drawer-backdrop').addEventListener('click', () => setDrawer(false));
  for (const id of ['print-button', 'sidebar-print']) $(id).addEventListener('click', () => window.print());
  for (const dialog of [$('search-dialog'), $('bookmark-dialog')]) dialog.addEventListener('click', event => {if (event.target === dialog) {const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();}});
  document.addEventListener('keydown', event => {
    const editing = event.target.matches('input, textarea, select, [contenteditable="true"]');
    if (event.key === '/' && !editing && !$('bookmark-dialog').open) { event.preventDefault(); openDialog($('search-dialog'), $('search-input')); }
    if (event.key === 'Escape' && $('sidebar').classList.contains('is-open')) setDrawer(false);
    if (event.key === 'Tab' && $('sidebar').classList.contains('is-open')) {
      const focusable = [...$('sidebar').querySelectorAll('a, button')].filter(el => el.offsetParent !== null);
      if (event.shiftKey && document.activeElement === focusable[0]) {event.preventDefault(); focusable.at(-1).focus();}
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {event.preventDefault(); focusable[0].focus();}
    }
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('scroll', trackReading, {passive: true});
  window.addEventListener('pagehide', save);
  window.addEventListener('resize', () => {if (!window.matchMedia('(max-width: 900px)').matches && $('sidebar').classList.contains('is-open')) setDrawer(false, false);});
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);
  document.body.classList.remove('no-js'); document.body.classList.add('js');
  setTheme(); save(); route();
  window.SystemDesignLabs.init(document);
})();
