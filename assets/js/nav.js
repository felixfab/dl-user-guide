(function () {
  'use strict';

  /* ---- Theme Switcher ---- */
  var THEMES = ['system', 'light', 'dark'];

  function getTheme() {
    return localStorage.getItem('dl-theme') || 'system';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('dl-theme', theme);
    var toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.setAttribute('title', 'Theme: ' + theme.charAt(0).toUpperCase() + theme.slice(1));
    }
  }

  function cycleTheme() {
    var current = getTheme();
    var next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
    applyTheme(next);
  }

  var saved = getTheme();
  if (saved !== 'system') {
    applyTheme(saved);
  }

  document.addEventListener('click', function (e) {
    var toggle = e.target.closest('#theme-toggle');
    if (toggle) cycleTheme();
  });

  /* ---- Scroll-Spy: Active Nav Highlighting ---- */
  var sidebarNav = document.querySelector('.sidebar-nav');
  if (!sidebarNav) return;

  var headings = document.querySelectorAll('.prose h2, .prose h3, .prose h4');
  if (!headings.length) return;

  var navLinks = sidebarNav.querySelectorAll('.nav-item, .nav-parent-link, .nav-parent--leaf');
  var clickLock = false;

  function getNavLinkForId(id) {
    for (var i = 0; i < navLinks.length; i++) {
      if (navLinks[i].getAttribute('href') === '#' + id) return navLinks[i];
    }
    return null;
  }

  // Map h4 headings to their nearest preceding h3 (or h2) for nav lookup
  function getNavIdForHeading(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === 'h2' || tag === 'h3') return el.id;
    var elem = el;
    while (elem) {
      elem = elem.previousElementSibling;
      if (!elem) break;
      var pt = elem.tagName.toLowerCase();
      if (pt === 'h3' || pt === 'h2') return elem.id;
    }
    return el.id;
  }

  function clearActive() {
    for (var i = 0; i < navLinks.length; i++) {
      navLinks[i].classList.remove('active');
    }
  }

  function setActive(id) {
    clearActive();
    var link = getNavLinkForId(id);
    if (link) {
      link.classList.add('active');
      var section = link.closest('.nav-section');
      if (section && !section.open) section.open = true;
    }
  }

  // Click handler: direct highlight, lock scroll-spy for 1s
  sidebarNav.addEventListener('click', function (e) {
    var link = e.target.closest('.nav-item, .nav-parent-link, .nav-parent--leaf');
    if (!link) return;
    var href = link.getAttribute('href');
    if (!href || href.charAt(0) !== '#') return;
    var id = href.slice(1);
    setActive(id);
    clickLock = true;
    setTimeout(function () { clickLock = false; }, 1000);
  });

  // IntersectionObserver for scroll-spy
  var observedIds = {};
  for (var h = 0; h < headings.length; h++) {
    observedIds[headings[h].id] = getNavIdForHeading(headings[h]);
  }

  var observerOpts = { rootMargin: '-80px 0px -70% 0px', threshold: 0 };

  var observer = new IntersectionObserver(function (entries) {
    if (clickLock) return;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) {
        var navId = observedIds[entries[i].target.id] || entries[i].target.id;
        setActive(navId);
        break;
      }
    }
  }, observerOpts);

  for (var j = 0; j < headings.length; j++) {
    observer.observe(headings[j]);
  }
})();