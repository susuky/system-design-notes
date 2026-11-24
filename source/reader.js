/* Unit navigation shared by the two standalone courses. */
(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const chapters = JSON.parse(byId('course-meta').textContent);
  const topics = chapters.flatMap(chapter => chapter.topics.map(topic => ({...topic, chapter})));
  const gallery = byId(document.body.dataset.course === 'sd' ? 'system-labs' : 'algorithm-labs');
  let mode = 'unit', activeChapter = null, activeTarget = null;
  let activeLab = gallery?.querySelector('[data-sd-simulation], [data-sd-lab], [data-lab]')?.id;
  const sublists = new Map();

  const sceneLinks = document.createElement('nav');
  sceneLinks.className = 'scenario-directory';
  sceneLinks.setAttribute('aria-label', '章內互動');
  const galleryKeys = new Set([...gallery.querySelectorAll('[data-lab]')].map(node => node.dataset.lab));
  const listed = new Set();
  for (const panel of document.querySelectorAll('#chapters [data-sd-scene], #chapters [data-lab]')) {
    const key = panel.dataset.sdScene || panel.dataset.lab;
    if (listed.has(key) || galleryKeys.has(key)) continue;
    listed.add(key);
    if (!panel.id) panel.id = 'scene-' + key;
    const definition = window.SystemDesignScenes?.definitions[key];
    const heading = panel.querySelector('h4, h3');
    const link = document.createElement('a');
    link.href = '#' + panel.id;
    link.textContent = definition?.title || heading?.textContent || key;
    sceneLinks.append(link);
  }
  if (listed.size) {
    const section = document.createElement('section'), heading = document.createElement('h3');
    section.className = 'more-experiments';
    heading.textContent = '章內互動';
    section.append(heading, sceneLinks);
    gallery.append(section);
  }

  for (const chapter of chapters) {
    const link = document.querySelector('.chapter-link[data-chapter="' + chapter.id + '"]');
    if (!link) continue;
    const list = document.createElement('ol');
    list.className = 'unit-nav';
    list.hidden = true;
    list.setAttribute('aria-label', chapter.short + '單元');
    for (const [index, topic] of chapter.topics.entries()) {
      const item = document.createElement('li'), anchor = document.createElement('a');
      const number = document.createElement('span'), title = document.createElement('span');
      anchor.href = '#' + topic.id;
      anchor.dataset.unit = topic.id;
      number.className = 'unit-number';
      number.textContent = String(index + 1).padStart(2, '0');
      title.textContent = topic.text.replace(/^\d+[.．、]\s*/, '');
      anchor.append(number, title);
      item.append(anchor);
      list.append(item);
    }
    link.parentElement.append(list);
    sublists.set(chapter.id, list);
  }

  function setPagination(id, topic, label) {
    const link = byId(id);
    link.href = '#' + (topic?.id || 'course-home');
    link.querySelector('span').textContent = topic ? label : '課程地圖';
    link.querySelector('strong').textContent = topic ? topic.text.replace(/^\d+[.．、]\s*/, '') : '全部章節';
  }

  function show(chapter, target) {
    activeChapter = chapter;
    document.body.classList.toggle('is-reading', !!chapter);
    document.body.dataset.readingView = mode;
    for (const [id, list] of sublists) list.hidden = !chapter || id !== chapter.id;
    document.querySelectorAll('button[data-reading-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.readingView === mode)));

    if (!chapter) {
      const lab = target.closest('[data-sd-simulation], [data-sd-lab], [data-lab]');
      if (lab && gallery.contains(lab)) activeLab = lab.id;
      const inGallery = gallery === target || gallery.contains(target);
      document.querySelectorAll('[data-home-overview]').forEach(node => { node.hidden = inGallery; });
      gallery.hidden = !inGallery;
      gallery.querySelectorAll('[data-sd-simulation], [data-sd-lab], [data-lab]').forEach(panel => { panel.hidden = panel.id !== activeLab; });
      gallery.querySelectorAll('.sim-index a, .lab-index a').forEach(link => {
        if (link.getAttribute('href') === '#' + activeLab) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
      document.querySelectorAll('.sidebar-links a').forEach(link => {
        const active = inGallery ? link.hash === '#' + gallery.id : link.hash === '#course-home';
        if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
      });
      return target;
    }

    document.querySelectorAll('.sidebar-links a').forEach(link => link.removeAttribute('aria-current'));
    const article = byId(chapter.id);
    const units = [...article.querySelectorAll(':scope > .lesson-unit')];
    let unit = target.closest('.lesson-unit');
    if (!unit || !article.contains(unit)) unit = units[0];
    const topicId = unit?.dataset.lesson || chapter.topics[0]?.id;
    const index = Math.max(0, chapter.topics.findIndex(topic => topic.id === topicId));
    const topic = chapter.topics[index];
    activeTarget = byId(topic?.id) || article;
    document.title = (topic?.text || chapter.short) + '｜' + (document.body.dataset.course === 'sd' ? '系統設計' : '資料結構與演算法');
    for (const panel of units) panel.hidden = mode === 'unit' && panel !== unit;
    article.dataset.readingView = mode;
    for (const node of article.children) {
      if (node.matches('.lesson-unit')) continue;
      node.classList.add('chapter-overview');
      node.hidden = mode === 'unit' && !node.matches('.references, .sources, .lesson-sources');
    }
    if (target === article) target = activeTarget;

    byId('reader-context').textContent = chapter.short;
    byId('unit-position').textContent = mode === 'unit' ? (index + 1) + ' / ' + chapter.topics.length : '全章';
    document.querySelectorAll('.unit-nav a, #topic-list a').forEach(link => {
      if (link.hash === '#' + topic?.id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });

    const steps = byId('unit-steps');
    steps.replaceChildren(...chapter.topics.map((item, itemIndex) => {
      const link = document.createElement('a');
      link.href = '#' + item.id;
      link.title = item.text;
      link.setAttribute('aria-label', (itemIndex + 1) + '：' + item.text);
      link.textContent = String(itemIndex + 1).padStart(2, '0');
      if (item.id === topic?.id) link.setAttribute('aria-current', 'step');
      return link;
    }));
    steps.hidden = mode === 'chapter';
    if (mode === 'chapter') {
      const chapterIndex = chapters.findIndex(item => item.id === chapter.id);
      setPagination('prev-chapter', chapters[chapterIndex - 1] && {id: chapters[chapterIndex - 1].id, text: chapters[chapterIndex - 1].short}, '上一章');
      setPagination('next-chapter', chapters[chapterIndex + 1] && {id: chapters[chapterIndex + 1].id, text: chapters[chapterIndex + 1].short}, '下一章');
    } else {
      const topicIndex = topics.findIndex(item => item.id === topic?.id);
      setPagination('prev-chapter', topics[topicIndex - 1], '上一節');
      setPagination('next-chapter', topics[topicIndex + 1], '下一節');
    }
    byId('topic-toc').open = false;
    document.dispatchEvent(new CustomEvent('course:route', {detail: {chapter: chapter.id, unit: topicId}}));
    return target;
  }

  document.querySelectorAll('button[data-reading-view]').forEach(button => {
    button.addEventListener('click', () => {
      const nextMode = button.dataset.readingView;
      if (!activeChapter) return;
      if (mode === 'chapter' && nextMode === 'unit') {
        const units = [...byId(activeChapter.id).querySelectorAll(':scope > .lesson-unit')];
        const edge = document.querySelector('.reader-tools').getBoundingClientRect().bottom + 8;
        const currentUnit = units.find(unit => unit.getBoundingClientRect().bottom > edge) || units.at(-1);
        if (currentUnit) activeTarget = byId(currentUnit.dataset.lesson);
      }
      mode = nextMode;
      show(activeChapter, activeTarget);
      activeTarget.scrollIntoView({block: 'start'});
      if (mode === 'unit' && location.hash !== '#' + activeTarget.id) location.hash = activeTarget.id;
    });
  });
  document.addEventListener('click', event => {
    const target = event.target.closest('a[href^="#"]');
    if (target && target.closest('.unit-nav, #topic-list, #unit-steps')) byId('topic-toc').open = false;
  });

  window.CourseReader = {show};
})();
