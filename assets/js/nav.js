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
    var idx = THEMES.indexOf(current);
    var next = THEMES[(idx + 1) % THEMES.length];
    applyTheme(next);
  }

  // Init: apply saved theme on load
  var saved = getTheme();
  if (saved !== 'system') {
    applyTheme(saved);
  }
  // If 'system', leave the attribute so CSS @media (prefers-color-scheme) handles it

  document.addEventListener('click', function (e) {
    var toggle = e.target.closest('#theme-toggle');
    if (toggle) {
      cycleTheme();
    }
  });

  /* ---- Scroll-Spy: Active Nav Highlighting ---- */
  var sidebarNav = document.querySelector('.sidebar-nav');
  if (!sidebarNav) return;

  var headings = document.querySelectorAll('.prose h2, .prose h3');
  if (!headings.length) return;

  // Build heading ID → nav link mapping
  var navLinks = sidebarNav.querySelectorAll('.nav-item, .nav-parent-link, .nav-parent--leaf');

  function getNavLinkForId(id) {
    for (var i = 0; i < navLinks.length; i++) {
      if (navLinks[i].getAttribute('href') === '#' + id) return navLinks[i];
    }
    return null;
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
      // Ensure parent <details> is open
      var section = link.closest('.nav-section');
      if (section && !section.open) {
        section.open = true;
      }
    }
  }

  // IntersectionObserver for scroll-spy
  var observerOpts = { rootMargin: '-80px 0px -70% 0px', threshold: 0 };

  var observer = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) {
        setActive(entries[i].target.id);
        break; // use the first visible heading
      }
    }
  }, observerOpts);

  for (var h = 0; h < headings.length; h++) {
    observer.observe(headings[h]);
  }
})();