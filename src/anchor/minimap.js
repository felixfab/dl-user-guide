(function() {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     Module State
     ══════════════════════════════════════════════════════════════ */

  var container = null;
  var canvasEl = null;
  var ctx = null;
  var dpr = 1;
  var slider = null;
  var hoverPortal = null;
  var isVisible = false;
  var scrollEl = null;
  var scrollRaf = null;
  var barData = [];
  var shared = null;
  var adapter = null;
  var math = null;
  var errorEl = null;
  var observer = null;
  var matchCache = null;
  var hoveredBarIdx = -1;
  var _flaredEl = null;
  var _flareTimer = null;
  var _navObserver = null;
  var _navTimeout = null;
  var anchorToBar = {};
  var _nativeFlareTimer = null;
  var _modeBtnRef = null;
  var _toggleBtn = null;
  var _turnFallbackTriggered = false;
  var _knownMsgIds = null;
  var _retryPending = false;
  var _retryCount = 0;
  var anchorWeakMap = new WeakMap();
  var _groupedModal = null;
  var _groupedBarIdx = null;
  var _groupedModalPinned = false;
  var _groupedDismissTimer = null;
  var _groupedOutsideHandler = null;
  var _groupedKeyHandler = null;

  /* ══════════════════════════════════════════════════════════════
     Constants
     ══════════════════════════════════════════════════════════════ */

  var MIN_BAR_HEIGHT = 1;
  var MIN_SLIDER_HEIGHT = 12;
  var HIT_EXPAND_PX = 5;
  var FOOTER_BUFFER = 32;
  var CONTEXT_BUFFER = 150;
  var HOVER_DEBOUNCE_MS = 200;
  var HIDE_DEBOUNCE_MS = 300;
  var OBSERVER_DEBOUNCE_MS = 100;

  /* Cached regexes for text normalization performance */
  var CA_QUOTE_REGEX = /[\u2018\u2019\u201C\u201D"']/g;
  var CA_DASH_REGEX = /[\u2010\u2011\u2012\u2013\u2014\u2015-]/g;
  var CA_WS_GLOBAL_REGEX = /\s+/g;
  var CA_WS_TEST_REGEX = /\s/;

  /* ── Structural UI element filter (class-agnostic, semantic rules) ──
     Uses a Content Scope Lock — once the ancestor walk enters a
     verified content block (<p>, <li>, heading), layout-containers
     above it cannot override or reject the text stream.  This
     prevents macro-container cascading failures where a message-
     wrapper toggle button or a section <div> before a <pre> block
     wipes the entire paragraph forest. */

  var CA_CONTENT_BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, [role="paragraph"]';

  function caRejectUIText(node) {
    var ancestor = node.parentElement;
    if (!ancestor) return false;

    /* Content Scope Lock: once the walk passes a known content block,
       Rules 3–5 stand down — outer layout divs cannot override a
       legitimate text container that was already accepted. */
    var insideContentBlock = false;

    while (ancestor) {
      var tag = ancestor.tagName;

      /* Rule 0: Content delimiter — code blocks are always content */
      if (tag === 'PRE' || tag === 'CODE') return false;

      /* Rule 1: Metadata elements */
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return true;

      /* Rule 2a: Collapsible UI sections — <details> elements (Gemini
         "Sources" sections) are UI chrome, not content.  Reject before
         the content scope lock since details are never content. */
      if (tag === 'DETAILS') return true;

      /* Rule 2b: Empty message shells — data-message-author-role="" on
         an ancestor indicates a templated container with no actual role. */
      if (ancestor.getAttribute && ancestor.getAttribute('data-message-author-role') === '') return true;

      /* Rule 3: Hidden elements & font-ligature icon noise.
         aria-hidden containers and icon classes like 'google-symbols'
         / 'material-symbols' are stripped unconditionally before they
         can corrupt the filtered text stream length. */
      var className = typeof ancestor.className === 'string' ? ancestor.className : '';
      if ((ancestor.getAttribute('aria-hidden') === 'true' && className.indexOf('katex') === -1) ||
          className.indexOf('google-symbols') !== -1 ||
          className.indexOf('material-symbols') !== -1) {
        return true;
      }

      /* ── Content Scope Lock ──
         Assert content baseline BEFORE structural Rules 3–5 so that
         macros (message wrapper divs, section containers) above a
         verified content block are shielded. */
      if (ancestor.matches && ancestor.matches(CA_CONTENT_BLOCK_SELECTOR)) {
        insideContentBlock = true;
      }

      /* ── Content-scoped structural rules (3–5) ──
         Suppressed when insideContentBlock is true — outer layout
         containers lose their veto power over verified content. */

      /* Rule 3: Interactive elements contextual guard.  Buttons and
         ARIA link/button roles are UI chrome when floating standalone
         (Copy / Thumbs-up buttons), but are inline content when
         nested inside a content block — Gemini wraps grounded "Double-
         Check" text in <button> tags inside <p>. */
      var role = ancestor.getAttribute('role');
      var isInteractive = tag === 'BUTTON' || role === 'button';
      if (isInteractive && !insideContentBlock && !ancestor.closest(CA_CONTENT_BLOCK_SELECTOR)) {
        return true;
      }

      /* Rule 4: Code block language labels — reject a non-content
         label container that immediately precedes a <pre>.  Content
         blocks (<p>, <li>, headings) that happen to precede a code
         block are protected by the scope lock. */
      var nextSib = ancestor.nextElementSibling;
      if (nextSib && nextSib.tagName === 'PRE' && !insideContentBlock) {
        return true;
      }

      /* Rule 5: UI subtrees — first child is a button = entire block
         is chrome (collapsible thought-process sections, action
         footers).  Only fires when we are AT a DIV and not inside a
         content block (scope lock protects paragraph containers). */
      if (tag === 'DIV' && !insideContentBlock) {
        if (ancestor.firstElementChild && ancestor.firstElementChild.tagName === 'BUTTON') {
          return true;
        }
      }

      ancestor = ancestor.parentElement;
    }

    /* Inline elements (A, SUP, SPAN, STRONG, and contextual BUTTON)
       interleaved inside <p> or <li> are safely accepted — the user
       may have selected across them */
    return false;
  }

  /* Builds filtered text + bidirectional byte-position index maps.
     Walks all text nodes with the UI-exclusion filter, returning:
       text        — concatenated textContent of accepted nodes
       indexMap    — maps filtered position → raw textContent byte offset
       rawToFiltered — maps raw textContent offset → filtered position
     Used by calculatePreciseRange to ensure the matching phase sees
     the same filtered text that the TreeWalker will traverse. */
  function getFilteredTextAndMap(container) {
    var text = '';
    var indexMap = [];
    var rawToFiltered = [];
    var allWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    var uiFilter = { acceptNode: function(node) {
      if (!node.nodeValue || !node.nodeValue.trim().length) return NodeFilter.FILTER_REJECT;
      if (caRejectUIText(node)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }};
    var filteredWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, uiFilter, false);
    var acceptedSet = new Set();
    var fNode;
    while ((fNode = filteredWalker.nextNode())) {
      acceptedSet.add(fNode);
    }
    var node;
    var rawOffset = 0;
    var filteredOffset = 0;
    while ((node = allWalker.nextNode())) {
      var val = node.nodeValue;
      if (acceptedSet.has(node)) {
        for (var ci = 0; ci < val.length; ci++) {
          indexMap.push(rawOffset + ci);
          while (rawToFiltered.length <= rawOffset + ci) rawToFiltered.push(filteredOffset);
          filteredOffset++;
          text += val.charAt(ci);
        }
      } else {
        for (var ci = 0; ci < val.length; ci++) {
          while (rawToFiltered.length <= rawOffset + ci) rawToFiltered.push(filteredOffset);
        }
      }
      rawOffset += val.length;
    }
    while (rawToFiltered.length <= rawOffset) rawToFiltered.push(filteredOffset);
    return { text: text, indexMap: indexMap, rawToFiltered: rawToFiltered };
  }

  
  var hoverHideTimer = null;
  var hoverRAF = null;
  var sliderLocked = false;
  var dragActive = false;
  var dragStartY = 0;
  var dragStartTop = 0;
  var rebuildTimer = null;
  var resizeTimer = null;
  var cachedMinimapRect = null;
  var snapMode = 'block';

  /* ══════════════════════════════════════════════════════════════
     CSS CUSTOM HIGHLIGHT — injects document-scope ::highlight rules
     ══════════════════════════════════════════════════════════════ */

  function injectHighlightStyles() {
    if (document.getElementById('ca-highlight-style')) return;
    var style = document.createElement('style');
    style.id = 'ca-highlight-style';
    style.textContent = '::highlight(ca-flare){background-color:rgba(0,120,255,0.4);color:inherit;border-radius:2px}';
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════════════════════════════════
     INIT
     ══════════════════════════════════════════════════════════════ */

  function init() {
    if (!window.__ca || !window.__ca.shared) {
      setTimeout(init, 100);
      return;
    }
    if (!window.__ca.hostAdapter || !window.__ca.minimapMath) {
      setTimeout(init, 50);
      return;
    }
    shared = window.__ca.shared;
    adapter = window.__ca.hostAdapter;
    math = window.__ca.minimapMath;
    injectHighlightStyles();
    createMinimap();
    /* Self-healing: if scroll container isn't mounted yet (Angular async
       hydration), wait for it and then initialise. */
    adapter.watchScrollContainer(function() {
      if (isVisible) {
        rebuildBars();
        attachListeners();
      }
    });
    setupHoverEvents();
    window.addEventListener('resize', function() {
      if (!container) return;
      cachedMinimapRect = container.getBoundingClientRect();
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        resizeTimer = null;
        rebuildBars();
      }, OBSERVER_DEBOUNCE_MS);
    });
    window.__ca.events.on('anchors:changed', function() {
      matchCache = null;
      hideHover();
      if (!isVisible) return;
      if (rebuildTimer) clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(function() {
        rebuildTimer = null;
        rebuildBars();
      }, 50);
    });
    window.__ca.events.on('health:changed', function(state) {
      if (state === 'live' && isVisible) {
        if (rebuildTimer) clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(function() {
          rebuildTimer = null;
          rebuildBars();
        }, 100);
      }
    });

    /* Delayed second pass: Gemini SPA can take ~1-2s to fully render
       message content after page load. The first rebuildBars may run
       before DOM children (<p>, <pre>) are populated, causing hash
       mismatches. A single re-rebuild after 2s catches settled DOM. */
    setTimeout(function() {
      if (scrollEl && barData.length === 0) rebuildBars();
    }, 2000);
  }

  /* ══════════════════════════════════════════════════════════════
     HEALTH — verify host DOM structure, show error if missing
     ══════════════════════════════════════════════════════════════ */

  function checkMinimapHealth() {
    var healthy = adapter.checkHealth();
    if (!healthy) {
      showError();
      if (window.__ca.events) {
        window.__ca.events.emit('health:failed', { component: 'minimap', reason: 'Host DOM structure changed' });
      }
    }
    return healthy;
  }

  function showError() {
    if (!errorEl) return;
    errorEl.classList.remove('hidden');
    if (canvasEl) canvasEl.style.display = 'none';
    if (slider) slider.classList.add('hidden');
  }

  function hideError() {
    if (!errorEl) return;
    errorEl.classList.add('hidden');
    if (canvasEl) canvasEl.style.display = '';
  }

  /* ══════════════════════════════════════════════════════════════
     DOM — create and destroy the minimap container
     ══════════════════════════════════════════════════════════════ */

  /* ── Slider drag handlers ── */
  function _onSliderMove(ev) {
    if (!dragActive || !slider || !scrollEl || !container) return;
    var deltaY = ev.clientY - dragStartY;
    var minimapH = (container.clientHeight || adapter.getViewportHeight()) - FOOTER_BUFFER;
    var sliderH = parseFloat(slider.style.height) || Math.max(MIN_SLIDER_HEIGHT, (adapter.getClientHeight(scrollEl) / adapter.getScrollHeight(scrollEl)) * minimapH);
    var trackH = minimapH - sliderH;
    var newTop = Math.max(0, Math.min(trackH, dragStartTop + deltaY));
    slider.style.top = newTop + 'px';
    if (trackH > 0) {
      adapter.scrollTo(scrollEl, (newTop / trackH) * (adapter.getScrollHeight(scrollEl) - adapter.getClientHeight(scrollEl)));
    }
  }

  function _onSliderUp() {
    if (!dragActive) return;
    dragActive = false;
    slider.classList.remove('dragging');
    document.removeEventListener('mousemove', _onSliderMove);
    document.removeEventListener('mouseup', _onSliderUp);
  }

  function createMinimap() {
    destroy();

    container = shared.$create('div', {
      id: 'ca-minimap',
      className: 'ca-minimap hidden'
    });

    canvasEl = shared.$create('canvas', {
      className: 'ca-minimap-canvas',
      'data-action': 'minimap-navigate'
    });
    container.appendChild(canvasEl);
    dpr = window.devicePixelRatio || 1;
    sizingCanvas();
    ctx = canvasEl.getContext('2d');

    slider = shared.$create('div', { className: 'ca-minimap-slider hidden' });
    container.appendChild(slider);

    /* Slider drag — mousedown starts, mousemove scrolls chat in sync */
    slider.addEventListener('mousedown', function(e) {
      e.stopPropagation();
      if (!scrollEl) return;
      dragActive = true;
      dragStartY = e.clientY;
      dragStartTop = parseFloat(slider.style.top) || 0;
      sliderLocked = true;
      slider.classList.add('dragging');
      document.addEventListener('mousemove', _onSliderMove);
      document.addEventListener('mouseup', _onSliderUp);
    });

    /* Grouped modal toggle button (#) */
    var toggleBtn = shared.$create('div', {
      'data-action': 'toggle-grouped-modal',
      textContent: '#',
      title: 'Show all anchors'
    });
    toggleBtn.style.cssText = 'position:absolute;bottom:4px;left:4px;width:16px;height:20px;background:rgba(255,255,255,0.10);color:#e8eaed;border:1px solid rgba(255,255,255,0.25);border-radius:4px;font-size:12px;font-weight:700;line-height:20px;text-align:center;cursor:pointer;pointer-events:auto;z-index:3;';
    container.appendChild(toggleBtn);
    _toggleBtn = toggleBtn;

    /* Snap mode toggle button: Block (A) / Bar (B) / Focus (F) */
    var modeBtn = shared.$create('div', {
      'data-action': 'toggle-anchor-mode',
      textContent: 'A',
      title: 'Switch snap mode: Block (A) / Bar (B) / Focus (F)'
    });
    modeBtn.style.cssText = 'position:absolute;bottom:4px;right:4px;width:16px;height:20px;background:rgba(255,255,255,0.10);color:#e8eaed;border:1px solid rgba(255,255,255,0.25);border-radius:4px;font-size:12px;font-weight:600;line-height:20px;text-align:center;cursor:pointer;pointer-events:auto;z-index:3;font-family:system-ui,-apple-system,sans-serif;';
    container.appendChild(modeBtn);
    var _modeBtn = modeBtn;
    _modeBtnRef = modeBtn;

    shared.$append(container);

    /* Hover portal — sibling in Shadow DOM (not child of minimap, so
       it won't be clipped by overflow:hidden on the minimap) */
    hoverPortal = shared.$create('div', {
      id: 'ca-minimap-hover',
      className: 'ca-minimap-hover hidden'
    });
    var portalHeader = shared.$create('div', { className: 'ca-minimap-hover-header' });
    var portalBody = shared.$create('div', { className: 'ca-minimap-hover-body' });
    hoverPortal.appendChild(portalHeader);
    hoverPortal.appendChild(portalBody);
    shared.$append(hoverPortal);

    /* ── Health error banner (hidden until health:failed) ── */
    errorEl = shared.$create('div', { className: 'ca-minimap-error hidden' });
    var errorMsg = shared.$create('div', { className: 'ca-minimap-error-msg' });
    errorMsg.textContent = shared.esc('Extension update required — host page structure changed.');
    errorEl.appendChild(errorMsg);
    var errorDismiss = shared.$create('button', {
      className: 'ca-minimap-error-dismiss',
      'data-action': 'dismiss-minimap-error',
      textContent: 'Dismiss'
    });
    errorEl.appendChild(errorDismiss);
    container.appendChild(errorEl);

    /* Click delegation — single listener on container */
    container.addEventListener('click', function(e) {
      var errTarget = e.target.closest('[data-action="dismiss-minimap-error"]');
      if (errTarget) { hideError(); return; }
      var modeTarget = e.target.closest('[data-action="toggle-anchor-mode"]');
      if (modeTarget) {
        var next = { block: 'bar', bar: 'focus', focus: 'block' };
        snapMode = next[snapMode];
        _modeBtn.textContent = snapMode === 'block' ? 'A' : snapMode === 'bar' ? 'B' : 'F';
        _modeBtn.classList.toggle('ca-mode-btn-active', snapMode === 'focus');
        rebuildBars();
        return;
      }
      var toggleModal = e.target.closest('[data-action="toggle-grouped-modal"]');
      if (toggleModal) {
        if (_groupedModal) {
          dismissGroupedModal();
        } else {
          autoShowGroupedModal();
          if (_groupedModal) {
            _groupedModalPinned = true;
            var pinBtn = _groupedModal.querySelector('[data-action="toggle-pin"]');
            if (pinBtn) {
              pinBtn.classList.add('active');
              pinBtn.title = 'Unpin modal';
            }
            centerGroupedModal();
          }
        }
        return;
      }
      if (!scrollEl) return;
      var nav = e.target.closest('[data-action="minimap-navigate"]');
      if (!nav) return;
      var cRect = container.getBoundingClientRect();
      var minimapH = (container.clientHeight || adapter.getViewportHeight()) - FOOTER_BUFFER;
      var relY = Math.max(0, Math.min(minimapH, e.clientY - cRect.top));
      for (var i = 0; i < barData.length; i++) {
        if (relY >= barData[i].top - HIT_EXPAND_PX && relY <= barData[i].top + barData[i].height + HIT_EXPAND_PX) {
          if (snapMode === 'focus' && !barData[i].anchored) continue;
          var liveEl = barData[i]._el && document.body.contains(barData[i]._el) ? barData[i]._el : null;
          var barMatch = barData[i].matchedAnchors && barData[i].matchedAnchors.length > 0 ? barData[i].matchedAnchors[0] : null;
          var barText = barMatch ? barMatch.text : null;
          var barOffset = barMatch && barMatch.textOffset != null ? barMatch.textOffset : null;
          if (liveEl) scrollBlockTo(liveEl, barData[i].top, CONTEXT_BUFFER, barText, barOffset, true);
          updateSliderPosition(barData[i].top, barData[i].height);
          return;
        }
      }
      /* Blank-area click — snap to nearest bar, else proportional scroll */
      var searchBars = barData;
      var nearest = math.findNearestBar(relY, searchBars, minimapH);
      if (nearest >= 0) {
        var entry = searchBars[nearest];
        var liveEntry = entry._el && document.body.contains(entry._el) ? entry._el : null;
        var entryMatch = entry.matchedAnchors && entry.matchedAnchors.length > 0 ? entry.matchedAnchors[0] : null;
        var entryText = entryMatch ? entryMatch.text : null;
        var entryOffset = entryMatch && entryMatch.textOffset != null ? entryMatch.textOffset : null;
        if (liveEntry) scrollBlockTo(liveEntry, entry.top, CONTEXT_BUFFER, entryText, entryOffset, true);
        updateSliderPosition(entry.top, entry.height);
      } else {
        updateSliderPosition(relY);
        adapter.scrollTo(scrollEl, math.proportionalScroll(relY, minimapH, adapter.getScrollHeight(scrollEl)));
      }
    });

    /* Mouse wheel inside minimap — scrolls chat in sync */
    container.addEventListener('wheel', function(e) {
      if (!scrollEl) return;
      e.preventDefault();

      var st = adapter.getScrollTop(scrollEl);
      adapter.clampScroll(scrollEl, st + e.deltaY);
    }, { passive: false });
  }

  /* ══════════════════════════════════════════════════════════════
     CANVAS — sizing and drawing
     ══════════════════════════════════════════════════════════════ */

  function sizingCanvas() {
    if (!canvasEl || !container) return;
    dpr = window.devicePixelRatio || 1;
    var w = container.clientWidth;
    var h = (container.clientHeight || adapter.getViewportHeight()) - FOOTER_BUFFER;
    if (h < 10) h = adapter.getViewportHeight() - FOOTER_BUFFER;
    canvasEl.width = w * dpr;
    canvasEl.height = h * dpr;
  }

  function drawCanvas() {
    if (!ctx || !canvasEl) return;
    var w = container.clientWidth;
    var h = (container.clientHeight || adapter.getViewportHeight()) - FOOTER_BUFFER;
    if (h < 10) h = adapter.getViewportHeight() - FOOTER_BUFFER;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    /* Focus mode — individual anchored bars at proportional positions */
    if (snapMode === 'focus') {
      for (var i = 0; i < barData.length; i++) {
        var b = barData[i];
        if (!b.anchored) continue;
        if (i === hoveredBarIdx) {
          var minH = Math.max(b.height, 8);
          var exTop = b.top - (minH - b.height) / 2;
          ctx.fillStyle = 'rgba(255, 160, 50, 0.9)';
          ctx.fillRect(0, exTop, w, minH);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 1;
          ctx.strokeRect(0.5, exTop + 0.5, w - 1, minH - 1);
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.fillRect(0, exTop, 2, minH);
        } else {
          ctx.fillStyle = 'rgba(255, 160, 50, 0.7)';
          ctx.fillRect(0, b.top, 3, Math.max(3, b.height));
        }
        var color = i === hoveredBarIdx ? 'rgba(255, 160, 50, 0.9)' : 'rgba(255, 160, 50, 0.7)';
        var sl = b.sentenceWidths;
        if (!sl || !sl.length) {
          ctx.fillStyle = color;
          ctx.fillRect(0, b.top, w, Math.max(3, b.height));
        } else {
          var numN = 0;
          for (var sj = 0; sj < sl.length; sj++) {
            if (!sl[sj].empty) numN++;
          }
          if (numN === 0) {
            ctx.fillStyle = color;
            ctx.fillRect(0, b.top, w, Math.max(3, b.height));
          } else {
            ctx.fillStyle = color;
            var lh = Math.max(1, Math.floor(b.height / numN));
            var yj = b.top;
            for (var sj = 0; sj < sl.length && yj < b.top + b.height - 1; sj++) {
              var l = sl[sj];
              if (l.empty) continue;
              var x = l.indent ? Math.round(w * 0.08) : 0;
              var maxW = l.indent ? Math.round(w * 0.92) : w;
              ctx.fillRect(x, yj, Math.min(l.px, maxW), lh);
              yj += lh;
            }
          }
        }
      }
      return;
    }

    /* Pass 1 — hover backgrounds + anchored left-edge markers */
    for (var i = 0; i < barData.length; i++) {
      var b = barData[i];
      if (snapMode === 'focus' && !b.anchored) continue;
      if (b.anchored) {
        if (i === hoveredBarIdx) {
          var minH = snapMode === 'focus' ? Math.max(b.height, 24) : Math.max(b.height, 8);
          var exTop = b.top - (minH - b.height) / 2;
          ctx.fillStyle = 'rgba(255, 160, 50, 0.9)';
          ctx.fillRect(0, exTop, w, minH);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 1;
          ctx.strokeRect(0.5, exTop + 0.5, w - 1, minH - 1);
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.fillRect(0, exTop, 2, minH);
        } else {
          ctx.fillStyle = 'rgba(255, 160, 50, 0.7)';
          ctx.fillRect(0, b.top, 3, Math.max(3, b.height));
        }
      }
    }

    /* Pass 2 — collect micro-lines from all visible bars */
    var collected = [];
    for (var i = 0; i < barData.length; i++) {
      var b = barData[i];
      if (snapMode === 'focus' && !b.anchored) continue;
      var color;
      if (b.anchored) {
        color = i === hoveredBarIdx ? 'rgba(255, 160, 50, 0.9)' : 'rgba(255, 160, 50, 0.7)';
      } else if (b.type === 'code') {
        color = 'rgba(95,99,104,0.6)';
      } else if (b.isUser) {
        color = '#4285f4';
      } else {
        color = 'rgba(154,160,166,0.7)';
      }
      if (b.sentenceWidths && b.sentenceWidths.length) {
        for (var j = 0; j < b.sentenceWidths.length; j++) {
          if (!b.sentenceWidths[j].empty) {
            collected.push({ px: b.sentenceWidths[j].px, indent: b.sentenceWidths[j].indent, color: color });
          }
        }
      } else {
        collected.push({ px: w, indent: false, color: color });
      }
    }

    /* Pass 3 — continuous draw, all lines evenly distributed */
    if (!collected.length) return;
    var lineH = Math.max(1, Math.floor(h / collected.length));
    var yi = 0;
    for (var si = 0; si < collected.length && yi < h - 1; si++) {
      var l = collected[si];
      ctx.fillStyle = l.color;
      var x = l.indent ? Math.round(w * 0.08) : 0;
      var maxW = l.indent ? Math.round(w * 0.92) : w;
      ctx.fillRect(x, yi, Math.min(l.px, maxW), lineH);
      yi += lineH;
    }
  }

  /* ══════════════════════════════════════════════════════════════
     HOVER — portal shows message preview on bar hover
     ══════════════════════════════════════════════════════════════ */

  function setupHoverEvents() {
    if (!container || !hoverPortal || !canvasEl) return;

    container.addEventListener('mousemove', function(e) {
      if (e.target.closest('[data-action="toggle-anchor-mode"],[data-action="dismiss-minimap-error"],[data-action="toggle-grouped-modal"]')) return;
      if (hoverHideTimer) { clearTimeout(hoverHideTimer); hoverHideTimer = null; }
      if (hoverRAF) return;
      hoverRAF = requestAnimationFrame(function() {
        hoverRAF = null;
        if (!barData.length) { hideHover(); return; }
        var rect = cachedMinimapRect || container.getBoundingClientRect();
        var relY = e.clientY - rect.top;
        var found = -1;
        for (var i = 0; i < barData.length; i++) {
          if (relY >= barData[i].top - HIT_EXPAND_PX && relY <= barData[i].top + barData[i].height + HIT_EXPAND_PX) {
            found = i; break;
          }
        }
        if (hoveredBarIdx !== found) {
          hoveredBarIdx = found;
          drawCanvas();
        }
        if (found >= 0) {
          var entryFound = barData[found];
          if (entryFound && entryFound.anchored && entryFound.matchedAnchors && entryFound.matchedAnchors.length) {
            hideHover();
            if (_groupedModal) {
              updateGroupedHighlight(found);
            } else {
              showGroupedModal(found, e.clientY);
            }
          } else {
            if (_groupedModalPinned) return;
            dismissGroupedModal();
            showHoverAt(found, e.clientY);
          }
        } else {
          if (_groupedModalPinned) return;
          dismissGroupedModal();
          var minimapH = (container.clientHeight || adapter.getViewportHeight()) - FOOTER_BUFFER;
          var searchBars = barData;
          var nearest = math.findNearestBar(relY, searchBars, minimapH);
          if (nearest >= 0) {
            var entryNearest = barData[nearest];
            if (entryNearest && entryNearest.anchored) {
              hideHover();
              if (_groupedModal) {
                updateGroupedHighlight(nearest);
              } else {
                showGroupedModal(nearest, e.clientY);
              }
            } else {
              if (_groupedModalPinned) return;
              showHoverAt(nearest, e.clientY);
            }
          } else {
            hideHover();
          }
        }
      });
    });

    container.addEventListener('mouseleave', function() {
      if (hoverRAF) { cancelAnimationFrame(hoverRAF); hoverRAF = null; }
      hoveredBarIdx = -1;
      drawCanvas();
      if (_groupedDismissTimer) clearTimeout(_groupedDismissTimer);
      hoverHideTimer = setTimeout(function() {
        hideHover();
        if (!_groupedModalPinned) dismissGroupedModal();
      }, HIDE_DEBOUNCE_MS);
    });
  }

  function showHoverAt(idx, clientY) {
    if (!hoverPortal || idx >= barData.length) return;
    var entry = barData[idx];
    if (snapMode === 'focus' && !entry.anchored) { hideHover(); return; }
    if (entry.anchored) { hideHover(); return; }
    var showAnchor = entry.anchored;

    hoverPortal.style.height = '';
    hoverPortal.style.maxHeight = '';

    var vw = adapter.getViewportWidth();
    var modalWidth = Math.max(250, Math.min(Math.round(vw * 0.333), 500));

    var pRect = cachedMinimapRect || container.getBoundingClientRect();
    hoverPortal.style.width = modalWidth + 'px';
    hoverPortal.style.left = Math.max(8, pRect.left - modalWidth - 10) + 'px';

    var headerEl = hoverPortal.querySelector('.ca-minimap-hover-header');
    var bodyEl = hoverPortal.querySelector('.ca-minimap-hover-body');
    /* Remove old tags row if present */
    var oldTags = hoverPortal.querySelector('.ca-minimap-hover-tags');
    if (oldTags) oldTags.parentNode.removeChild(oldTags);
    if (headerEl) {
      headerEl.className = 'ca-minimap-hover-header' + (showAnchor ? ' anchored' : '');
      if (showAnchor && entry.matchedAnchors && entry.matchedAnchors.length) {
        var firstText = entry.matchedAnchors[0].text || '';
        headerEl.textContent = firstText.length > 60 ? firstText.substring(0, 57) + '...' : firstText;
      } else {
        headerEl.textContent = entry.isUser ? 'You' : 'Gemini';
      }
    }
    /* Tags row — separate element below header */
    if (showAnchor && entry.tags && entry.tags.length && headerEl && bodyEl) {
      var tagRow = shared.$create('div', { className: 'ca-minimap-hover-tags' });
      tagRow.textContent = entry.tags.map(function(t) { return '#' + t; }).join(' ');
      hoverPortal.insertBefore(tagRow, bodyEl);
    }
    var liveEl = resolveBlockTarget(entry);
    var blkText = liveEl ? (liveEl.textContent || '') : '';
    if (blkText.length > 500) blkText = blkText.substring(0, 497) + '...';
    if (bodyEl) {
      while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);
      if (showAnchor && entry.matchedAnchors && entry.matchedAnchors.length) {
        for (var ai = 0; ai < entry.matchedAnchors.length; ai++) {
          var aItem = entry.matchedAnchors[ai];
          var injEl = shared.$create('div', { className: 'ca-minimap-hover-injection' });
          injEl.textContent = aItem.text;
          bodyEl.appendChild(injEl);
          if (aItem.description) {
            var dEl = shared.$create('div', { className: 'ca-minimap-hover-desc' });
            dEl.textContent = aItem.description;
            bodyEl.appendChild(dEl);
          }
        }
        var sepEl = shared.$create('div', { className: 'ca-minimap-hover-sep' });
        bodyEl.appendChild(sepEl);
        var msgPreview = shared.$create('div', { className: 'ca-minimap-hover-msg' });
        msgPreview.textContent = blkText
          .replace(/\s*You said\s*/gi, ' ')
          .replace(/\s*Gemini said\s*/gi, ' ')
          .replace(/(Edit|Copy|Regenerate|Delete|Share|Report|Rate|Upvote|Downvote)\s*/g, '')
          .trim();
        bodyEl.appendChild(msgPreview);
      } else {
        bodyEl.textContent = blkText
          .replace(/\s*You said\s*/gi, ' ')
          .replace(/\s*Gemini said\s*/gi, ' ')
          .replace(/(Edit|Copy|Regenerate|Delete|Share|Report|Rate|Upvote|Downvote)\s*/g, '')
          .trim();
      }
    }

    hoverPortal.classList.remove('hidden');

    var vh = adapter.getViewportHeight();
    hoverPortal.style.maxHeight = Math.round(vh * 0.5) + 'px';
    var modalH = hoverPortal.offsetHeight || Math.round(vh * 0.4);
    var portalTop = Math.max(8, clientY - 10);
    if (portalTop + modalH > vh - 8) {
      portalTop = vh - modalH - 8;
    }
    hoverPortal.style.top = '';
    hoverPortal.style.transform = 'translateY(' + portalTop + 'px)';
  }

  function hideHover() {
    if (!hoverPortal) return;
    if (hoverHideTimer) { clearTimeout(hoverHideTimer); hoverHideTimer = null; }
    hoverPortal.classList.add('hidden');
  }

  function destroy() {
    if (observer) { observer.disconnect(); observer = null; }
    if (dragActive) {
      dragActive = false;
      document.removeEventListener('mousemove', _onSliderMove);
      document.removeEventListener('mouseup', _onSliderUp);
    }
    if (hoverHideTimer) { clearTimeout(hoverHideTimer); hoverHideTimer = null; }
    if (hoverRAF) { cancelAnimationFrame(hoverRAF); hoverRAF = null; }
    if (rebuildTimer) { clearTimeout(rebuildTimer); rebuildTimer = null; }
    if (resizeTimer) { clearTimeout(resizeTimer); resizeTimer = null; }
    if (_flareTimer) { clearTimeout(_flareTimer); _flareTimer = null; }
    clearNativeHighlight();
    clearNavigationTracking();
    if (_flaredEl) {
      adapter.clearFlare(_flaredEl);
      _flaredEl = null;
    }
    errorEl = null;
    dismissGroupedModal();
    detachListeners();
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    if (hoverPortal && hoverPortal.parentNode) {
      hoverPortal.parentNode.removeChild(hoverPortal);
    }
    container = null;
    if (canvasEl) { canvasEl = null; ctx = null; }
    slider = null;
    hoverPortal = null;
    scrollEl = null;
    barData = [];
    cachedMinimapRect = null;
    isVisible = false;
  }

  /* ══════════════════════════════════════════════════════════════
     TOGGLE — show / hide via CSS class
     ══════════════════════════════════════════════════════════════ */

  function toggle() {
    if (!container) return;
    isVisible = !isVisible;
    container.classList.toggle('hidden', !isVisible);
    if (isVisible) {
      if (!checkMinimapHealth()) return;
      rebuildBars();
      attachListeners();
    } else {
      dismissGroupedModal();
      hideHover();
      hideError();
      detachListeners();
    }
  }

  /* ══════════════════════════════════════════════════════════════
     BAR RENDERING — walk chat DOM via HostDOMAdapter,
     compute proportional bars via MinimapMath
     ══════════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════════
     ANCHOR MARKERS — detect injected anchor content in messages
     ══════════════════════════════════════════════════════════════ */

  function hasAnchorContent(msgEl, anchorMap, activeItems, needsKeyword) {
    if (matchCache && matchCache.has(msgEl)) return matchCache.get(msgEl);
    var result = _anchorsByDom(msgEl, anchorMap, activeItems);
    if (!result && needsKeyword) result = _anchorsByKeyword(msgEl, activeItems);
    if (matchCache) matchCache.set(msgEl, result);
    return result;
  }

  function _anchorsByDom(msgEl, anchorMap, activeItems) {
    if (!anchorMap) return false;
    var msgId = adapter.getMessageId(msgEl);
    if (!msgId && window.__ca.shared && window.__ca.shared.findMessageContext) {
      var ancestorId = window.__ca.shared.findMessageContext(msgEl);
      if (ancestorId) {
        msgId = ancestorId;
      }
    }
    if (msgId) {
      var matched = anchorMap[msgId];
      if (matched) {
        var matchedTags = [];
        for (var i = 0; i < matched.length; i++) {
          var itemTags = matched[i].tags || [];
          for (var t = 0; t < itemTags.length; t++) {
            if (matchedTags.indexOf(itemTags[t]) === -1) {
              matchedTags.push(itemTags[t]);
            }
          }
        }
        return { tags: matchedTags, items: matched };
      }
    }

    /* WeakMap check: each content block may have a direct entry from
       anchor creation time, bypassing hash-based fallback entirely. */
    if (activeItems && activeItems.length) {
      var wmBlocks = adapter.getContentBlocks(msgEl);
      if (wmBlocks && wmBlocks.length) {
        var wmMatched = [];
        var wmTags = [];
        for (var wi = 0; wi < wmBlocks.length; wi++) {
          var we = anchorWeakMap.get(wmBlocks[wi].el);
          if (we && we.ids && we.ids.length) {
            var liveHash = shared.simpleHash((wmBlocks[wi].el.textContent || '').trim(), 16);
            if (liveHash === we.blockTextHash) {
              for (var wi2 = 0; wi2 < activeItems.length; wi2++) {
                if (we.ids.indexOf(activeItems[wi2].id) !== -1) {
                  if (wmMatched.indexOf(activeItems[wi2]) === -1) wmMatched.push(activeItems[wi2]);
                  var at2 = activeItems[wi2].tags || [];
                  for (var t2 = 0; t2 < at2.length; t2++) {
                    if (wmTags.indexOf(at2[t2]) === -1) wmTags.push(at2[t2]);
                  }
                }
              }
            }
          }
        }
        if (wmMatched.length) return { tags: wmTags, items: wmMatched };
      }
    }

    /* Fallback: hash-based matching for anchors with stale messageId
       but valid blockTextHash. Scans this msgEl's blocks for hash
       matches among all activeItems. */
    if (!activeItems || !adapter) return false;
    var blocks = adapter.getContentBlocks(msgEl);
    if (!blocks || !blocks.length) return false;
    var matchedByHash = [];
    var matchedTagsByHash = [];
    for (var ai = 0; ai < activeItems.length; ai++) {
      var a = activeItems[ai];
      if (!a.blockTextHash) continue;
      if (msgId && anchorMap[msgId] && anchorMap[msgId].indexOf(a) !== -1) continue;
      for (var bi = 0; bi < blocks.length; bi++) {
        var liveHash = shared.simpleHash((blocks[bi].el.textContent || '').trim(), 16);
        if (liveHash === a.blockTextHash) {
          if (!fuzzyVerifyText(blocks[bi].el.textContent || '', a.text || '')) continue;
          matchedByHash.push(a);
          var at = a.tags || [];
          for (var t = 0; t < at.length; t++) {
            if (matchedTagsByHash.indexOf(at[t]) === -1) matchedTagsByHash.push(at[t]);
          }
          break;
        }
      }
    }
    return matchedByHash.length ? { tags: matchedTagsByHash, items: matchedByHash } : false;
  }

  function buildAnchorMap(activeItems) {
    var map = {};
    try {
      for (var i = 0; i < activeItems.length; i++) {
        var mId = activeItems[i].messageId;
        if (mId) {
          if (!map[mId]) map[mId] = [];
          map[mId].push(activeItems[i]);
        }
      }
    } catch(e) { /* ignore */ }
    return map;
  }

  function _anchorsByKeyword(msgEl, activeItems) {
    var msgText = (msgEl.textContent || '').replace(/[^a-z0-9]/g, ' ');
    if (!msgText.replace(/\s/g, '')) return false;
    msgText = msgText.toLowerCase();

    try {
      var items = activeItems;
      var matchedTags = [];
      var matchedItems = [];
      for (var i = 0; i < items.length; i++) {
        var itemTags = items[i].tags || [];
        var matched = false;
        for (var t = 0; t < itemTags.length; t++) {
          var tag = itemTags[t].toLowerCase();
          if ((' ' + msgText + ' ').indexOf(' ' + tag + ' ') !== -1) {
            if (matchedTags.indexOf(tag) === -1) matchedTags.push(tag);
            matched = true;
          }
        }
        if (matched) matchedItems.push(items[i]);
      }
      return matchedItems.length ? { tags: matchedTags, items: matchedItems } : false;
    } catch(e) {
      return false;
    }
  }

  function clearNativeHighlight() {
    if (_nativeFlareTimer) { clearTimeout(_nativeFlareTimer); _nativeFlareTimer = null; }
    if (window.CSS && window.CSS.highlights) {
      if (CSS.highlights.has('ca-flare')) {
        CSS.highlights.delete('ca-flare');
      }
    }
  }

  /* ── Map raw-text offset to normalized-text offset (whitespace-collapsed space) ── */
  function rawToNormOffset(rawText, rawOff) {
    var norm = 0, inWs = false;
    for (var i = 0; i < rawText.length && i < rawOff; i++) {
      if (/\s/.test(rawText[i])) {
        if (!inWs) { norm++; inWs = true; }
      } else { norm++; inWs = false; }
    }
    return norm;
  }

  /* ── Text normalizer for anchor matching: canonicalize quotes, dashes, whitespace, markdown artifacts ── */
  function normalizeForMatch(str) {
    if (!str) return '';
    return str
      .replace(/\u2026/g, '...')
      .replace(/[\u2018\u2019`']/g, "'")
      .replace(/[\u201C\u201D"]/g, "'")
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-')
      .replace(/\u00A0/g, ' ')
      .replace(/\*\*|\*|__/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ── Fuzzy text verifier: sequential word matching bypasses DOM serialization artifacts ── */
  function fuzzyVerifyText(domText, anchorText) {
    if (!domText || !anchorText) return false;

    /* Fast path: strict normalized match */
    if (normalizeForMatch(domText).indexOf(normalizeForMatch(anchorText)) !== -1) {
      return true;
    }

    /* Continuous-string normalization fallback */
    var sanitize = function(str) {
      return str
        .replace(/\u2026/g, '...')
        .toLowerCase()
        .replace(CA_QUOTE_REGEX, "'")
        .replace(CA_DASH_REGEX, "-")
        .replace(CA_WS_GLOBAL_REGEX, "");
    };

    var cleanDom = sanitize(domText);
    var cleanAnchor = sanitize(anchorText);
    if (cleanDom.indexOf(cleanAnchor) !== -1) return true;

    /* Chunk-based fallback: bypass layout phantoms injected by textContent */
    var chunks = [];
    var lines = anchorText.split('\n');
    for (var li = 0; li < lines.length; li++) {
      var trimmed = sanitize(lines[li]);
      if (trimmed.length > 15) chunks.push(trimmed);
    }
    if (chunks.length === 0) {
      var chunkSize = 30;
      for (var ci = 0; ci < cleanAnchor.length; ci += chunkSize) {
        var chunk = cleanAnchor.substring(ci, ci + chunkSize);
        if (chunk.length >= 15) chunks.push(chunk);
      }
    }
    if (chunks.length > 0) {
      var matchedCount = 0;
      for (var i = 0; i < chunks.length; i++) {
        if (cleanDom.indexOf(chunks[i]) !== -1) matchedCount++;
      }
      if ((matchedCount / chunks.length) >= 0.75) return true;
    }

    return false;
  }

  /* ── Recursive DOM range builder: walks physical text nodes through inline elements ── */
  function createDirectDOMRange(container, start, end) {
    var doc = container.ownerDocument || document;
    var range = doc.createRange();
    var currentOffset = 0;

    var startNode = null;
    var startNodeOffset = 0;
    var endNode = null;
    var endNodeOffset = 0;

    function walk(node) {
      if (node.nodeType === 3) {
        var len = node.nodeValue.length;

        if (!startNode && currentOffset + len > start) {
          startNode = node;
          startNodeOffset = start - currentOffset;
        }
        if (!endNode && currentOffset + len >= end) {
          endNode = node;
          endNodeOffset = end - currentOffset;
          return true;
        }
        currentOffset += len;
      } else {
        for (var i = 0; i < node.childNodes.length; i++) {
          if (walk(node.childNodes[i])) return true;
        }
      }
      return false;
    }

    walk(container);

    if (startNode && endNode) {
      range.setStart(startNode, startNodeOffset);
      range.setEnd(endNode, endNodeOffset);
      return range;
    }
    return null;
  }

  function calculatePreciseRange(container, searchText, textOffset) {
    if (!searchText || !container) return null;

    var searchNorm = normalizeForMatch(searchText);
    if (!searchNorm) return null;

    /* Build filtered text to exclude Gemini citation/UI nodes */
    var filtered = getFilteredTextAndMap(container);
    var aggNorm = normalizeForMatch(filtered.text || '');

    /* Try standard match with collapsed whitespace */
    var matchStart = -1;
    if (textOffset != null && textOffset >= 0) {
      var filteredOff = textOffset < filtered.rawToFiltered.length ? filtered.rawToFiltered[textOffset] : filtered.text.length;
      var normOff = rawToNormOffset(filtered.text || '', filteredOff);
      matchStart = aggNorm.indexOf(searchNorm, normOff);
      var baseMatch = aggNorm.indexOf(searchNorm);
      if (matchStart !== -1 && baseMatch !== -1 && matchStart !== baseMatch
          && Math.abs(baseMatch - normOff) < Math.abs(matchStart - normOff)) {
        matchStart = baseMatch;
      }
    }
    if (matchStart === -1) matchStart = aggNorm.indexOf(searchNorm);

    /* Fallback: whitespace-stripped match for cross-element text that
       omits inter-block whitespace entirely (e.g. "AccumulatorThe" vs
       "Accumulator\nThe" — selection.toString() strips the block gap) */
    if (matchStart === -1) {
      var aggStripped = aggNorm.replace(/\s/g, '');
      var searchStripped = searchNorm.replace(/\s/g, '');
      var strippedIdx = aggStripped.indexOf(searchStripped);
      if (strippedIdx !== -1) {
        var count = 0;
        for (var ci = 0; ci < aggNorm.length; ci++) {
          if (/\s/.test(aggNorm[ci])) continue;
          if (count === strippedIdx) { matchStart = ci; break; }
          count++;
        }
      }
    }

    /* Fallback: continuous-character matching — strips whitespace but preserves
       all punctuation/symbols for pixel-precise Range boundaries. */
    if (matchStart === -1) {
      var cleanDom = '';
      var cleanToFilteredMap = [];
      var content = filtered.text || '';

      var normalizeChar = function(ch) {
        var lower = ch.toLowerCase();
        return lower.replace(CA_QUOTE_REGEX, "'").replace(CA_DASH_REGEX, "-");
      };

      for (var ci = 0; ci < content.length; ci++) {
        var chDom = content.charAt(ci);
        if (!CA_WS_TEST_REGEX.test(chDom)) {
          cleanDom += normalizeChar(chDom);
          cleanToFilteredMap.push(ci);
        }
      }

      var cleanSearch = '';
      for (var si = 0; si < searchNorm.length; si++) {
        var chSearch = searchNorm.charAt(si);
        if (!CA_WS_TEST_REGEX.test(chSearch)) {
          cleanSearch += normalizeChar(chSearch);
        }
      }

      if (cleanSearch) {
        var cleanIdx = cleanDom.indexOf(cleanSearch);
        if (cleanIdx !== -1 && (cleanIdx + cleanSearch.length - 1) < cleanToFilteredMap.length) {
          var startPos = filtered.indexMap[cleanToFilteredMap[cleanIdx]];
          var endPos = filtered.indexMap[cleanToFilteredMap[cleanIdx + cleanSearch.length - 1]] + 1;
          /* 3-step boundary clamping on raw container.textContent */
          var contentText = container.textContent || '';
          var contentLen = contentText.length;
          var searchLen = searchNorm.length;
          var punctRegex = /[.,!?;:"'"\u2026]/;
          while (startPos > 0 && /\w/.test(contentText[startPos - 1])) startPos--;
          while (endPos < contentLen && /\w/.test(contentText[endPos])) endPos++;
          while (endPos < contentLen && punctRegex.test(contentText[endPos]) && (endPos - startPos) < (searchLen + 3)) endPos++;
          while (endPos < contentLen && /\s/.test(contentText[endPos])) endPos++;
          var directRange = createDirectDOMRange(container, startPos, endPos);
          if (directRange) return directRange;
        }

        /* Chunk-based fallback for texts spanning multiple layout blocks */
        if (cleanSearch.length > 40) {
          var chunks = [];
          var chunkSize = 30;
          for (var dci = 0; dci < cleanSearch.length; dci += chunkSize) {
            var end = Math.min(dci + chunkSize, cleanSearch.length);
            if (end - dci >= 10) chunks.push(cleanSearch.substring(dci, end));
          }
          if (chunks.length > 0) {
            var firstChunk = chunks[0], lastChunk = chunks[chunks.length - 1];
            var pIdx = cleanDom.indexOf(firstChunk);
            var sIdx = cleanDom.lastIndexOf(lastChunk);
            if (pIdx !== -1 && sIdx !== -1 && sIdx >= pIdx + firstChunk.length) {
              var chunkMatchCount = 0;
              for (var cmi = 0; cmi < chunks.length; cmi++) {
                var foundAt = cleanDom.indexOf(chunks[cmi], pIdx);
                if (foundAt !== -1 && foundAt <= sIdx + lastChunk.length) chunkMatchCount++;
              }
              var chunkReq = chunks.length < 4 ? 0.60 : 0.75;
              if ((chunkMatchCount / chunks.length) >= chunkReq) {
                var startPos = filtered.indexMap[cleanToFilteredMap[pIdx]];
                var endPos = filtered.indexMap[cleanToFilteredMap[sIdx + lastChunk.length - 1]] + 1;
                /* 3-step boundary clamping on raw container.textContent */
                var contentText = container.textContent || '';
                var contentLen = contentText.length;
                var searchLen = searchNorm.length;
                var punctRegex = /[.,!?;:"'"\u2026]/;
                while (startPos > 0 && /\w/.test(contentText[startPos - 1])) startPos--;
                while (endPos < contentLen && /\w/.test(contentText[endPos])) endPos++;
                while (endPos < contentLen && punctRegex.test(contentText[endPos]) && (endPos - startPos) < (searchLen + 3)) endPos++;
                while (endPos < contentLen && /\s/.test(contentText[endPos])) endPos++;
                var directRange = createDirectDOMRange(container, startPos, endPos);
                if (directRange) return directRange;
              }
            }
          }
        }
      }
    }

    if (matchStart === -1) return null;
    var matchEnd = matchStart + searchNorm.length;

    /* ── Character-by-character stream mapping ──
       Walk each raw text node character-by-character, tracking both
       normalized and raw positions.  Whitespace sequences (any length)
       consume 1 normalised step, so currentNorm stays in sync with the
       normalised search space while ri tracks the raw DOM offset.
       Gemini citation / UI text nodes are excluded so the character
       stream matches the filtered text used during the matching phase. */
    var walkerFilter = { acceptNode: function(node) {
      if (!node.nodeValue || !node.nodeValue.trim().length) return NodeFilter.FILTER_REJECT;
      if (caRejectUIText(node)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }};
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, walkerFilter, false);
    var currentNorm = 0;
    var startNode = null, startOffset = 0, endNode = null, endOffset = 0;
    var node;

    while ((node = walker.nextNode())) {
      var rawText = node.nodeValue;
      if (!rawText.length) continue;

      /* Check if matchEnd falls at the start of this text node */
      if (startNode && !endNode && currentNorm === matchEnd) {
        endNode = node;
        endOffset = 0;
        break;
      }

      var ri = 0;
      while (ri < rawText.length) {
        var remaining = rawText.substring(ri);
        var consumed = 1;
        var advance = 1;

        /* Skip markdown formatting markers to keep currentNorm in sync
           with the normalized search space (normalizeForMatch strips
           **, *, __ at line 784). */
        var mdMatch = remaining.match(/^(\*\*|\*|__)/);
        if (mdMatch) {
          ri += mdMatch[0].length;
          continue;
        }

        if (/^[\s\u00A0\r\n]/.test(remaining)) {
          var wsMatch = remaining.match(/^[\s\u00A0\r\n]+/);
          consumed = wsMatch ? wsMatch[0].length : 1;
          advance = 1;
        }

        if (!startNode && currentNorm === matchStart) {
          startNode = node;
          startOffset = ri;
        }

        /* Predict where we land after this step — if it hits matchEnd,
           set end boundary AFTER the current character/whitespace
           so the range includes the boundary character */
        var nextNorm = currentNorm + advance;
        if (startNode && !endNode && nextNorm === matchEnd) {
          endNode = node;
          endOffset = ri + consumed;
          break;
        }

        currentNorm = nextNorm;
        ri += consumed;
      }

      if (startNode && endNode) break;
    }

    if (!startNode || !endNode) return null;

    /* Clamp offsets to safe bounds */
    startOffset = Math.min(startOffset, startNode.nodeValue.length);
    endOffset = Math.min(endOffset, endNode.nodeValue.length);

    try {
      var range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      return range;
    } catch(e) {
      return null;
    }
  }

  function triggerNativeTextFlare(containerEl, anchorText, textOffset) {
    if (_nativeFlareTimer) { clearTimeout(_nativeFlareTimer); _nativeFlareTimer = null; }
    if (window.CSS && window.CSS.highlights) {
      if (CSS.highlights.has('ca-flare')) {
        CSS.highlights.delete('ca-flare');
      }
    }

    /* Fast-path for table cells: TreeWalker can desync on inline
       elements (<strong>) inside <td>/<th>.  Use direct textContent
       matching with a DOM Range instead. */
    if (containerEl && (containerEl.tagName === 'TD' || containerEl.tagName === 'TH')) {
      var cellText = containerEl.textContent || '';
      var searchIdx = cellText.indexOf(anchorText);
      if (searchIdx !== -1) {
        var cellRange = document.createRange();
        var cellStart = searchIdx;
        var cellEnd = searchIdx + anchorText.length;
        /* Walk only immediate child text nodes to set range */
        var cellChild = containerEl.firstChild;
        var cellOffset = 0;
        var cellStartNode = null, cellStartOff = 0;
        var cellEndNode = null, cellEndOff = 0;
        while (cellChild) {
          if (cellChild.nodeType === 3) {
            var len = cellChild.nodeValue.length;
            if (!cellStartNode && cellOffset + len > cellStart) {
              cellStartNode = cellChild;
              cellStartOff = cellStart - cellOffset;
            }
            if (!cellEndNode && cellOffset + len >= cellEnd) {
              cellEndNode = cellChild;
              cellEndOff = cellEnd - cellOffset;
              break;
            }
            cellOffset += len;
          }
          cellChild = cellChild.nextSibling;
        }
        if (cellStartNode && cellEndNode) {
          try {
            cellRange.setStart(cellStartNode, Math.min(cellStartOff, cellStartNode.nodeValue.length));
            cellRange.setEnd(cellEndNode, Math.min(cellEndOff, cellEndNode.nodeValue.length));
            var flareHighlight = new Highlight(cellRange);
            CSS.highlights.set('ca-flare', flareHighlight);
            if (_flaredEl) { adapter.clearFlare(_flaredEl); _flaredEl = null; }
            _nativeFlareTimer = setTimeout(function() {
              if (window.CSS && window.CSS.highlights) {
                CSS.highlights.delete('ca-flare');
              }
              _nativeFlareTimer = null;
            }, 2000);
            return cellRange;
          } catch(e) {
            /* Range construction failed — fall through to normal paths */
          }
        }
      }
    }

    /* 1. Block-scoped search (primary) — prevents Match Collision with
       other paragraphs in the same message. The anchor text and
       textOffset are both relative to this block element. */
    var preciseRange = calculatePreciseRange(containerEl, anchorText, textOffset);
    var blockScopedMatch = preciseRange !== null;

    /* 2. Message-scoped search (fallback) — handles cross-element anchor
        text where the selection spans block boundaries or whitespace
        normalization diverges between the anchor text and a single
        block element's textContent. */
    if (!preciseRange && scrollEl) {
      var _msgs = adapter.getMessageElements(scrollEl);
      for (var _i = 0; _i < _msgs.length; _i++) {
        if (_msgs[_i].contains(containerEl)) {
          preciseRange = calculatePreciseRange(_msgs[_i], anchorText, textOffset);
          break;
        }
      }
    }

    /* Guard: when the block-scoped search found the text in the correct
       block, verify the range intersects that block element to prevent
       Match Collision (same text matched a different paragraph).  When
       the block-scoped search returned null, the message-scope fallback
       is our only option — accept it even if the range spans beyond the
       single block (cross-block anchor text, heading routed to sibling
       <p>, etc.). */
    if (blockScopedMatch && preciseRange && !preciseRange.intersectsNode(containerEl)) {
      preciseRange = null;
    }

    if (preciseRange && window.CSS && window.CSS.highlights) {
      var flareHighlight = new Highlight(preciseRange);
      CSS.highlights.set('ca-flare', flareHighlight);
      if (_flaredEl) { adapter.clearFlare(_flaredEl); _flaredEl = null; }
      _nativeFlareTimer = setTimeout(function() {
        if (window.CSS && window.CSS.highlights) {
          CSS.highlights.delete('ca-flare');
        }
        _nativeFlareTimer = null;
      }, 2000);
      return preciseRange;
    } else {
      if (_flaredEl) { adapter.clearFlare(_flaredEl); }
      adapter.applyFlare(containerEl);
      _flaredEl = containerEl;
      if (_flareTimer) { clearTimeout(_flareTimer); _flareTimer = null; }
      _flareTimer = setTimeout(function() {
        adapter.clearFlare(containerEl);
        if (_flaredEl === containerEl) _flaredEl = null;
        _flareTimer = null;
      }, 2000);
      return null;
    }
  }

  function scrollBlockTo(blockEl, minimapY, contextBuffer, anchorText, textOffset, isDirectClick) {
    if (!scrollEl || !blockEl || !container) return;
    if (!anchorText && _flaredEl && _flaredEl !== blockEl) {
      adapter.clearFlare(_flaredEl);
    }
    if (_flareTimer) { clearTimeout(_flareTimer); _flareTimer = null; }
    var bRect = adapter.getBlockRect(blockEl);
    if (bRect.width === 0 && bRect.height === 0) {
      var flSh = adapter.getScrollHeight(scrollEl);
      var flMh = (container.clientHeight || adapter.getViewportHeight()) - FOOTER_BUFFER;
      adapter.clampScroll(scrollEl, math.proportionalScroll(minimapY, flMh, flSh) - (contextBuffer || 0));
      sliderLocked = true;
      scrollEl.dispatchEvent(new Event('scroll'));
      if (anchorText) {
        triggerNativeTextFlare(blockEl, anchorText, textOffset);
      } else {
        adapter.applyFlare(blockEl);
        _flaredEl = blockEl;
      }
      return;
    }
    if (!anchorText) {
      var delta = bRect.top - (contextBuffer || 0);
      var st = adapter.getScrollTop(scrollEl);
      adapter.clampScroll(scrollEl, st + delta);
      sliderLocked = true;
      scrollEl.dispatchEvent(new Event('scroll'));
      adapter.applyFlare(blockEl);
      _flaredEl = blockEl;
      _flareTimer = setTimeout(function() {
        adapter.clearFlare(blockEl);
        if (_flaredEl === blockEl) _flaredEl = null;
        _flareTimer = null;
      }, 2000);
      return;
    }
    var vh = adapter.getViewportHeight();
    var preciseRange = triggerNativeTextFlare(blockEl, anchorText, textOffset);
    if (isDirectClick || bRect.top < 80 || bRect.top + bRect.height > vh - 80) {
      if (preciseRange) {
        var rangeRect = preciseRange.getBoundingClientRect();
        /* Table cell content: getBoundingClientRect on a Range inside
           <td>/<th> may return unreliable coordinates.  Center on the
           block element's own rect instead. */
        if (blockEl.closest('td,th')) {
          _centerOnBlock(blockEl, vh, minimapY, contextBuffer);
        } else if (rangeRect.width > 0 || rangeRect.height > 0) {
          var targetDelta = rangeRect.top - vh / 2 + rangeRect.height / 2;
          adapter.clampScroll(scrollEl, adapter.getScrollTop(scrollEl) + targetDelta);
          sliderLocked = true;
          scrollEl.dispatchEvent(new Event('scroll'));
        } else {
          _centerOnBlock(blockEl, vh, minimapY, contextBuffer);
        }
      } else {
        _centerOnBlock(blockEl, vh, minimapY, contextBuffer);
      }
    }
    /* Direct click fallback: browser-native scrollIntoView resolves the
       correct scrollable ancestor for nested scroll containers (Gemini's
       cdk-virtual-scroll-viewport) where clampScroll on scrollEl may
       target the wrong element. */
    if (isDirectClick && anchorText) {
      try { blockEl.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch(e) {}
    }
    sliderLocked = false;
  }

  /* Center a block element in the viewport using explicit clampScroll
     (not scrollIntoView, which targets the wrong scrollable ancestor
     for table cells and other non-standard block elements). Falls back
     to proportional scroll from minimap position if the rect is off-screen. */
  function _centerOnBlock(blockEl, vh, minimapY, contextBuffer) {
    var fbRect = adapter.getBlockRect(blockEl);
    if (fbRect.width > 0 || fbRect.height > 0) {
      var fbDelta = fbRect.top - vh / 2 + fbRect.height / 2;
      adapter.clampScroll(scrollEl, adapter.getScrollTop(scrollEl) + fbDelta);
      sliderLocked = true;
      scrollEl.dispatchEvent(new Event('scroll'));
      return;
    }
    /* Block rect is degenerate — fall back to proportional scroll */
    var flSh = adapter.getScrollHeight(scrollEl);
    var flMh = (container.clientHeight || vh) - FOOTER_BUFFER;
    adapter.clampScroll(scrollEl, math.proportionalScroll(minimapY, flMh, flSh) - (contextBuffer || 0));
    sliderLocked = true;
    scrollEl.dispatchEvent(new Event('scroll'));
  }

  /* ── Shared fuzzy-match helper for resolveBlockTarget strategies ──
     Returns true when the block element's textContent fuzzy-matches at
     least one of bd's matchedAnchors (or when there are none, meaning
     any block counts as a match — used by strategies 2/3 for the
     matchedAnchors.length === 0 branch). */
  function _blockMatches(bd, el) {
    if (!bd.matchedAnchors || !bd.matchedAnchors.length) return true;
    var _content = el.textContent || '';
    for (var _ai = 0; _ai < bd.matchedAnchors.length; _ai++) {
      if (fuzzyVerifyText(_content, bd.matchedAnchors[_ai].text || '')) return true;
    }
    return false;
  }

  /* Resolve stable messageId for an element, matching the same fallback
     logic used in _anchorsByDom (data-message-id → findMessageContext). */
  function _resolveMessageId(el) {
    var id = adapter.getMessageId(el);
    if (!id && window.__ca.shared && window.__ca.shared.findMessageContext) {
      id = window.__ca.shared.findMessageContext(el);
    }
    return id;
  }

  /* Resolve a live block element from stateless barData using
     adapter queries. Returns null if the element is virtual-scrolled away.
     Strategy A: search all messages for block with matching content hash.
     Strategy B: stable messageId + blockIndex (existing fallback). */
  function resolveBlockTarget(bd) {
    /* 1. Deterministic Cache: element reference captured at build time.
       O(1), zero re-resolution. document.body.contains guards against
       Gemini virtual-scrolling the element away.
       Verify the element actually contains at least one matched anchor's
       text before returning — guards against fallback-routed barData entries
       where _el points to block 0 but the anchor text lives in a deeper block. */
    if (bd._el && document.body.contains(bd._el)) {
      if (bd.matchedAnchors && bd.matchedAnchors.length) {
        for (var _vi = 0; _vi < bd.matchedAnchors.length; _vi++) {
          if (fuzzyVerifyText(bd._el.textContent || '', bd.matchedAnchors[_vi].text || '')) {
            return bd._el;
          }
        }
        /* None of the anchors fuzzy-verify against this _el — content
           regenerated.  For multi-block anchors (text contains \n), the
           anchor spans block boundaries and no single block's textContent
           will ever pass fuzzyVerifyText.  Return null immediately so
           navigateToPopupAnchor uses its message-level fallback with
           calculatePreciseRange's chunk-based multi-block search. */
        var _isMultiBlock = false;
        for (var _mbi = 0; _mbi < (bd.matchedAnchors || []).length; _mbi++) {
          if ((bd.matchedAnchors[_mbi].text || '').indexOf('\n') !== -1) { _isMultiBlock = true; break; }
        }
        if (_isMultiBlock) return null;
        bd._el = null;
      } else {
        return bd._el;
      }
    }

    var msgs = adapter.getMessageElements(scrollEl);
    var msgEl, blocks;

    /* 2. stored msgIndex + blockIndex with fuzzyVerifyText guard */
    if (bd.msgIndex != null && bd.msgIndex >= 0 && bd.msgIndex < msgs.length) {
        msgEl = msgs[bd.msgIndex];
        if (msgEl && bd.blockIndex != null) {
            blocks = adapter.getContentBlocks(msgEl);
            var targetBlock = blocks[bd.blockIndex];
            if (targetBlock && _blockMatches(bd, targetBlock.el)) {
              return targetBlock.el;
            }
            /* Intra-message block scan: content regeneration may shift
               blockIndex.  Scan all blocks in this message for a text
               match before falling through to strategies 3-5. */
            if (blocks && blocks.length && bd.matchedAnchors && bd.matchedAnchors.length) {
                for (var si = 0; si < blocks.length; si++) {
                    if (targetBlock && blocks[si].el === targetBlock.el) continue;
                    if (_blockMatches(bd, blocks[si].el)) {
                      return blocks[si].el;
                    }
                }
            }
        }
    }

    /* 3. messageId + blockIndex with fuzzyVerifyText guard */
    if (bd.messageId) {
      for (var mi = 0; mi < msgs.length; mi++) {
        if (_resolveMessageId(msgs[mi]) === bd.messageId) {
          msgEl = msgs[mi];
          break;
        }
      }
      if (msgEl) {
        blocks = adapter.getContentBlocks(msgEl);
        if (bd.blockIndex != null && blocks[bd.blockIndex] && _blockMatches(bd, blocks[bd.blockIndex].el)) {
          return blocks[bd.blockIndex].el;
        }
      }
    }

    /* 4. Full-block text scan (last resort heuristic) */
    if (!msgEl) msgEl = msgs[bd.msgIndex];
    if (msgEl) {
      blocks = adapter.getContentBlocks(msgEl);
      if (bd.matchedAnchors && bd.matchedAnchors.length) {
        for (var bi = 0; bi < blocks.length; bi++) {
          if (blocks[bi] && _blockMatches(bd, blocks[bi].el)) {
            return blocks[bi].el;
          }
        }
      }
    }

    /* 5. blockTextHash (absolute last resort for re-rendered DOM) */
    if (bd.blockTextHash) {
      for (var mi = 0; mi < msgs.length; mi++) {
        blocks = adapter.getContentBlocks(msgs[mi]);
        for (var bi = 0; bi < blocks.length; bi++) {
          var h = shared.simpleHash((blocks[bi].el.textContent || '').trim(), 16);
          if (h === bd.blockTextHash && _blockMatches(bd, blocks[bi].el)) {
            return blocks[bi].el;
          }
        }
      }
    }

    /* 6. Blind cross-message scan — brute-force fuzzy text match across ALL
       messages and ALL blocks.  Catches anchors with null blockIndex/msgIndex
       (selection spanned block boundaries during creation) or stale metadata
       that doesn't match any specific message index.
       Abort after 200 blocks (≈ 40 messages × 5 blocks) to prevent UI jank
       on large chats with imported anchors.  Null return cascades to the
       caller's message-level fallback or MutationObserver retry. */
    var _s6count = 0;
    for (var mi = 0; mi < msgs.length; mi++) {
      blocks = adapter.getContentBlocks(msgs[mi]);
      for (var bi = 0; bi < blocks.length; bi++) {
        if (++_s6count > 200) return null;
        if (bd.matchedAnchors && bd.matchedAnchors.length) {
          if (_blockMatches(bd, blocks[bi].el)) {
            return blocks[bi].el;
          }
        } else if (fuzzyVerifyText(blocks[bi].el.textContent || '', bd.text || '')) {
          return blocks[bi].el;
        }
      }
    }

    return null;
  }

  function clearNavigationTracking() {
    if (_navObserver) { _navObserver.disconnect(); _navObserver = null; }
    if (_navTimeout) { clearTimeout(_navTimeout); _navTimeout = null; }
  }

  function navigateToPopupAnchor(bd, anchorId) {
    clearNavigationTracking();
    if (!scrollEl) return;

    var anchorText = null;
    var anchorTextOffset = null;
    if (anchorId && bd.matchedAnchors) {
      for (var i = 0; i < bd.matchedAnchors.length; i++) {
        if (bd.matchedAnchors[i].id === anchorId) {
          anchorText = bd.matchedAnchors[i].text;
          anchorTextOffset = bd.matchedAnchors[i].textOffset != null ? bd.matchedAnchors[i].textOffset : null;
          break;
        }
      }
    }
    if (!anchorText && bd.matchedAnchors && bd.matchedAnchors.length) {
      anchorText = bd.matchedAnchors[0].text;
      anchorTextOffset = bd.matchedAnchors[0].textOffset != null ? bd.matchedAnchors[0].textOffset : null;
    }

    var liveEl = resolveBlockTarget(bd);
    if (liveEl && anchorText && !fuzzyVerifyText(liveEl.textContent || '', anchorText)) {
      liveEl = null;
    }
    if (liveEl) {
      scrollBlockTo(liveEl, bd.top, CONTEXT_BUFFER, anchorText, anchorTextOffset, true);
      return;
    }

    /* Fallback: scroll to message by msgIndex when block target can't be
       resolved (anchor text no longer matches any block in the DOM due to
       content regeneration or virtual-scroll recycling).
       Note: does NOT return early — falls through to the MutationObserver
       retry below so that once Gemini attaches the block element via virtual
       scroll, scrollBlockTo executes with full block-level precision. */
    if (bd.msgIndex != null) {
      var _fbMsgs = adapter.getMessageElements(scrollEl);
      var _fbMsg = _fbMsgs[bd.msgIndex];
      if (_fbMsg) {
        /* For multi-block anchors (text contains \n), block-relative textOffset
           is meaningless at message scope.  Pass null so calculatePreciseRange
           uses its chunk-based fallback which searches the full message text
           from offset 0 — the only way to find text spanning multiple blocks. */
        var _flareOffset = (anchorText && anchorText.indexOf('\n') !== -1) ? null : anchorTextOffset;
        var _preciseRange = triggerNativeTextFlare(_fbMsg, anchorText, _flareOffset);
        _flaredEl = _fbMsg;
        if (_preciseRange) {
          var _rr = _preciseRange.getBoundingClientRect();
          if (_rr.width > 0 || _rr.height > 0) {
            var _td = _rr.top - adapter.getViewportHeight() / 2 + _rr.height / 2;
            adapter.clampScroll(scrollEl, adapter.getScrollTop(scrollEl) + _td);
            sliderLocked = true;
            scrollEl.dispatchEvent(new Event('scroll'));
            return;
          }
        } else {
          var _sh = adapter.getScrollHeight(scrollEl);
          var _mh = (container.clientHeight || adapter.getViewportHeight()) - FOOTER_BUFFER;
          adapter.clampScroll(scrollEl, math.proportionalScroll(bd.top, _mh, _sh) - CONTEXT_BUFFER);
        }
      }
    }

    /* Element virtual-scrolled away — pre-scroll, then wait for DOM attachment */
    var sh = adapter.getScrollHeight(scrollEl);
    var mh = (container.clientHeight || adapter.getViewportHeight()) - FOOTER_BUFFER;
    var estTop = math.proportionalScroll(bd.top, mh, sh) - CONTEXT_BUFFER;
    adapter.clampScroll(scrollEl, estTop);

    _navObserver = new MutationObserver(function() {
      var el = resolveBlockTarget(bd);
      if (el && anchorText && !fuzzyVerifyText(el.textContent || '', anchorText)) {
        return;
      }
      if (el) {
        scrollBlockTo(el, bd.top, CONTEXT_BUFFER, anchorText, anchorTextOffset, true);
        clearNavigationTracking();
      }
    });
    _navObserver.observe(scrollEl, { childList: true, subtree: true });

    _navTimeout = setTimeout(function() {
      clearNavigationTracking();
    }, 500);
  }

  function updateSliderPosition(topY, optHeight) {
    if (!slider || !scrollEl || !container) return;
    var minimapH = (container.clientHeight || adapter.getViewportHeight()) - FOOTER_BUFFER;
    if (minimapH < 10) minimapH = adapter.getViewportHeight() - FOOTER_BUFFER;
    slider.style.top = topY + 'px';
    var sh = adapter.getScrollHeight(scrollEl);
    var ch = adapter.getClientHeight(scrollEl);
    var baseH = (ch / sh) * minimapH;
    slider.style.height = (optHeight != null ? Math.max(MIN_SLIDER_HEIGHT, optHeight) : Math.max(MIN_SLIDER_HEIGHT, baseH)) + 'px';
    var _mt = Math.max(0, minimapH - parseFloat(slider.style.height));
    if (parseFloat(slider.style.top) > _mt) slider.style.top = _mt + 'px';
    sliderLocked = true;
  }

  /* ── Shared bar construction: deduplicates the barData-push logic
     between rebuildBars and incrementalUpdate.  All coordinate math
     is delegated to minimapMath. */
  function _pushBarToData(barData, block, msgIndex, blockIndex, turnIndex, msgEl, maxBlockLen, isUser, blockResult) {
    var bEl = block.el;
    var bRect = adapter.getBlockRect(bEl);
    var _sr = adapter.getScrollRect(scrollEl);
    var _st = adapter.getScrollTop(scrollEl);
    var _sh = adapter.getScrollHeight(scrollEl) || 1;
    var _mh = (container.clientHeight || adapter.getViewportHeight()) - FOOTER_BUFFER;
    if (_mh < 10) _mh = adapter.getViewportHeight() - FOOTER_BUFFER;
    var barT = math.computeBlockTop(bRect.top, _sr.top, _st, _sh, _mh);
    var barH = math.computeBlockHeight(bRect.height, _sh, _mh);
    var textLen = (bEl.textContent || '').length;
    barData.push({
      id: 'msg-' + msgIndex + '-block-' + blockIndex,
      top: barT,
      height: barH,
      type: block.type,
      msgIndex: msgIndex,
      blockIndex: blockIndex,
      turnIndex: turnIndex,
      messageId: _resolveMessageId(msgEl),
      blockTextHash: (bEl.textContent || '').trim()
        ? shared.simpleHash((bEl.textContent || '').trim(), 16)
        : null,
      textLen: textLen,
      isUser: isUser,
      anchored: blockResult.anchored,
      tags: blockResult.tags,
      matchedAnchors: blockResult.matched,
      source: blockResult.source,
      width: math.computeBlockWidth(textLen, maxBlockLen),
      sentenceWidths: math.computeSentenceWidths((bEl.textContent || ''), 80, container.clientWidth, 8),
      _el: bEl
    });
  }

  /* ── Shared anchor routing: extracted from rebuildBars/incrementalUpdate ──
     Routes matchedAnchors to specific blockResults using blockIndex (with
     fuzzyVerifyText), legacy offset matching, orphan fallback, and block-0
     fallback.  Mutates anchorToBar as a side effect. */
  function _routeAnchorsToBlocks(blocks, matchedAnchors, anchored, msgIndex, isUser, msgEl, directRouted, fallbackLabel) {
    var blockResults = [];
    for (var j = 0; j < blocks.length; j++) {
      blockResults.push({ anchored: false, tags: [], matched: [], source: 'offset' });
    }
    if (!anchored || !matchedAnchors.length || !blocks.length) return blockResults;

    var legacyAnchors = [];
    for (var ai = 0; ai < matchedAnchors.length; ai++) {
      var a = matchedAnchors[ai];

      if (directRouted && directRouted[a.id]) {
        var dr = directRouted[a.id];
        if (anchorToBar[a.id] != null) continue;
        var br = blockResults[dr.blockIndex];
        br.anchored = true;
        br.matched.push(a);
        br.source = 'direct';
        anchorToBar[a.id] = dr;
        var at = a.tags || [];
        for (var t2 = 0; t2 < at.length; t2++) {
          if (br.tags.indexOf(at[t2]) === -1) br.tags.push(at[t2]);
        }
        continue;
      }

      var bi = a.blockIndex;
      if (bi != null && bi >= 0 && bi < blockResults.length) {
        var isAnchorModel = (a.messageId && a.messageId.indexOf('MODEL-RESPONSE') !== -1);
        var isBlockModel = !isUser;
        if (isAnchorModel !== isBlockModel) {
          legacyAnchors.push(a);
          continue;
        }
        if (!fuzzyVerifyText(blocks[bi].el.textContent || '', a.text || '')) {
          var hashMatchedIndex = -1;
          if (a.blockTextHash) {
            for (var bIdx = 0; bIdx < blocks.length; bIdx++) {
              if (shared.simpleHash((blocks[bIdx].el.textContent || '').trim(), 16) === a.blockTextHash) {
                hashMatchedIndex = bIdx;
                break;
              }
            }
          }
          if (hashMatchedIndex !== -1) {
            bi = hashMatchedIndex;
          } else {
            var found = false;
            for (var si = 0; si < blocks.length; si++) {
              if (si !== bi && fuzzyVerifyText(blocks[si].el.textContent || '', a.text || '')) {
                var br_s = blockResults[si];
                br_s.anchored = true;
                if (anchorToBar[a.id] == null) {
                  br_s.matched.push(a);
                  br_s.source = 'scan';
                  anchorToBar[a.id] = { msgIndex: msgIndex, blockIndex: si, messageId: _resolveMessageId(msgEl) };
                }
                found = true;
                break;
              }
            }
            if (found) continue;
            legacyAnchors.push(a);
            continue;
          }
        }
        var br = blockResults[bi];
        br.anchored = true;
        if (anchorToBar[a.id] != null) continue;
        br.matched.push(a);
        br.source = 'blockIndex';
        anchorToBar[a.id] = { msgIndex: msgIndex, blockIndex: bi, messageId: _resolveMessageId(msgEl) };
        var at = a.tags || [];
        for (var t2 = 0; t2 < at.length; t2++) {
          if (br.tags.indexOf(at[t2]) === -1) br.tags.push(at[t2]);
        }
      } else {
        legacyAnchors.push(a);
      }
    }

    if (legacyAnchors.length > 0) {
      var unifiedText = '';
      var mappings = [];
      for (var j = 0; j < blocks.length; j++) {
        var blockText = (blocks[j].el.textContent || '').replace(/[^a-z0-9]/g, '').toLowerCase();
        var s = unifiedText.length > 0 ? ' ' : '';
        mappings.push({ idx: j, start: unifiedText.length + s.length, end: unifiedText.length + s.length + blockText.length });
        unifiedText += s + blockText;
      }

      for (var ai = 0; ai < legacyAnchors.length; ai++) {
        var aText = (legacyAnchors[ai].text || '').replace(/[^a-z0-9]/g, '').toLowerCase();
        if (!aText) continue;
        var matchIdx = unifiedText.indexOf(aText);
        if (matchIdx === -1) continue;
        var matchEnd = matchIdx + aText.length;
        for (var mj = 0; mj < mappings.length; mj++) {
          var m = mappings[mj];
          if (matchIdx < m.end && matchEnd > m.start) {
            var br = blockResults[m.idx];
            if (anchorToBar[legacyAnchors[ai].id] != null) continue;
            br.anchored = true;
            br.matched.push(legacyAnchors[ai]);
            anchorToBar[legacyAnchors[ai].id] = { msgIndex: msgIndex, blockIndex: m.idx, messageId: _resolveMessageId(msgEl) };
            var at = legacyAnchors[ai].tags || [];
            for (var t2 = 0; t2 < at.length; t2++) {
              if (br.tags.indexOf(at[t2]) === -1) br.tags.push(at[t2]);
            }
          }
        }
      }

      if (blocks.length > 0) {
        for (var ai = 0; ai < legacyAnchors.length; ai++) {
          var found = false;
          for (var j = 0; j < blockResults.length; j++) {
            var bm = blockResults[j].matched;
            for (var mj = 0; mj < bm.length; mj++) {
              if (bm[mj].id === legacyAnchors[ai].id) { found = true; break; }
            }
            if (found) break;
          }
          if (!found) {
            blockResults[0].source = 'orphan';
            blockResults[0].anchored = true;
            blockResults[0].matched.push(legacyAnchors[ai]);
            anchorToBar[legacyAnchors[ai].id] = { msgIndex: msgIndex, blockIndex: 0, messageId: _resolveMessageId(msgEl) };
            var at = legacyAnchors[ai].tags || [];
            for (var t2 = 0; t2 < at.length; t2++) {
              if (blockResults[0].tags.indexOf(at[t2]) === -1) blockResults[0].tags.push(at[t2]);
            }
          }
        }
      }
    }

    if (anchored && blockResults.length > 0 && !blockResults.some(function(br) { return br.anchored; })) {
      var fb = blockResults[0];
      fb.anchored = true;
      fb.source = fallbackLabel || 'fallback';
      for (var ai = 0; ai < matchedAnchors.length; ai++) {
        fb.matched.push(matchedAnchors[ai]);
        anchorToBar[matchedAnchors[ai].id] = { msgIndex: msgIndex, blockIndex: 0, messageId: _resolveMessageId(msgEl) };
        var tags2 = matchedAnchors[ai].tags || [];
        for (var t2i = 0; t2i < tags2.length; t2i++) {
          if (fb.tags.indexOf(tags2[t2i]) === -1) fb.tags.push(tags2[t2i]);
        }
      }
    }

    return blockResults;
  }

  function rebuildBars() {
    scrollEl = adapter.findScrollContainer();
    if (!container || !canvasEl || !scrollEl) return;
    if (hoverRAF) { cancelAnimationFrame(hoverRAF); hoverRAF = null; }

    /* Self-heal: if previous barData has real heights but _retryCount is
       stuck from a prior zero-height cycle, reset it so the guard below
       doesn't block retries and Phase B can match imported anchors. */
    if (_retryCount >= 2 && barData.length > 0) {
      var anyLive = false;
      for (var _ci = 0; _ci < barData.length; _ci++) {
        if (barData[_ci]._el && barData[_ci].height > MIN_BAR_HEIGHT) {
          anyLive = true; break;
        }
      }
      if (anyLive) _retryCount = 0;
    }

    var msgElements = adapter.getMessageElements(scrollEl);
    var scrollHeight = adapter.getScrollHeight(scrollEl) || 1;
    var minimapHeight = (container.clientHeight || adapter.getViewportHeight()) - FOOTER_BUFFER;
    if (minimapHeight < 10) minimapHeight = adapter.getViewportHeight() - FOOTER_BUFFER;

    var scrollRect = adapter.getScrollRect(scrollEl);
    var scrollTop = adapter.getScrollTop(scrollEl);
    if (!_groupedModalPinned) dismissGroupedModal();
    barData = [];
    anchorToBar = {};

    /* Hoist storage reads — single fetch for all sub-functions */
    var activeItems = [];
    try {
      if (window.__ca.storage && window.__ca.storage.getActive) {
        activeItems = window.__ca.storage.getActive();
      }
      if (window.__ca.storage && window.__ca.storage.getActiveTemplates) {
        activeItems = activeItems.concat(window.__ca.storage.getActiveTemplates());
      }
    } catch(e) { /* ignore */ }

    matchCache = new WeakMap();

    /* Pre-pass: direct coordinate routing for anchors with stored msgIndex.
       Anchors with verified msgIndex+blockIndex skip the heuristic scanning
       in _anchorsByDom / _anchorsByKeyword, preventing hash-collision misrouting
       when multiple messages have duplicate block text. */
    var directRouted = {};
    var remainingItems = [];
    for (var di = 0; di < activeItems.length; di++) {
      var da = activeItems[di];
      if (da.msgIndex != null && da.msgIndex >= 0 && da.msgIndex < msgElements.length) {
        var targetMsg = msgElements[da.msgIndex];
        if (da.blockIndex != null) {
          var targetBlocks = adapter.getContentBlocks(targetMsg);
          var tb = targetBlocks[da.blockIndex];
          if (tb && fuzzyVerifyText(tb.el.textContent || '', da.text || '')) {
            directRouted[da.id] = { msgIndex: da.msgIndex, blockIndex: da.blockIndex, messageId: _resolveMessageId(targetMsg) };
            continue;
          }
        }
      }
      remainingItems.push(da);
    }

    /* First pass: compute block metadata + find max length for skyline */
    var anchorMap = buildAnchorMap(remainingItems);
    var needsKeyword = false;
    for (var ni = 0; ni < remainingItems.length; ni++) {
      if (!remainingItems[ni].messageId && !remainingItems[ni].blockTextHash) { needsKeyword = true; break; }
    }
    var msgBlocks = [];
    var maxBlockLen = 1;
    for (var i = 0; i < msgElements.length; i++) {
      var msgEl = msgElements[i];
      var blocks = adapter.getContentBlocks(msgEl);
      var isUser = adapter.isUserMessage(msgEl);
      var matchResult = hasAnchorContent(msgEl, anchorMap, remainingItems, needsKeyword);
      var anchored = matchResult !== false;
      var tags = anchored ? matchResult.tags : [];
      var matchedAnchors = anchored ? matchResult.items : [];
      msgBlocks.push({ msgEl: msgEl, isUser: isUser, anchored: anchored, tags: tags, matchedAnchors: matchedAnchors, blocks: blocks });
      for (var j = 0; j < blocks.length; j++) {
        var blen = (blocks[j].el.textContent || '').length;
        if (blen > maxBlockLen) maxBlockLen = blen;
      }
    }

    /* Guard: if msgBlocks populated but isUser metadata missing, retry after render */
    if (msgBlocks.length > 0 && typeof msgBlocks[0].isUser === 'undefined') {
      setTimeout(rebuildBars, 100);
      return;
    }

    /* Assign turnIndex: group user→model exchanges into turns */
    var currentTurn = 0;
    var lastSender = null;
    for (var ti = 0; ti < msgBlocks.length; ti++) {
      var sender = msgBlocks[ti].isUser ? 'user' : 'model';
      if (sender === 'user' && lastSender !== 'user') currentTurn++;
      msgBlocks[ti].turnIndex = currentTurn;
      lastSender = sender;
    }
    /* Confidence check: if isUser classification is heavily skewed, fall back to bar mode */
    if (!_turnFallbackTriggered && msgBlocks.length > 4) {
      var userCount = 0;
      for (var ci = 0; ci < msgBlocks.length; ci++) {
        if (msgBlocks[ci].isUser) userCount++;
      }
      var minClass = Math.min(userCount, msgBlocks.length - userCount);
      if (minClass / msgBlocks.length < 0.1) {
        _turnFallbackTriggered = true;
        snapMode = 'bar';
        if (_modeBtnRef) {
          _modeBtnRef.textContent = 'B';
          _modeBtnRef.classList.remove('ca-mode-btn-active');
        }
        console.warn('[CA] Turn detection low confidence (' + minClass + '/' + msgBlocks.length + '). Falling back to bar mode.');
      }
    }

    /* Safety Valve: if turn detection collapsed to one value, fall back to sequential pairing */
    var uniqueTurns = msgBlocks.reduce(function(acc, m) {
      if (acc.indexOf(m.turnIndex) === -1) acc.push(m.turnIndex);
      return acc;
    }, []);
    if (uniqueTurns.length <= 1 && msgBlocks.length > 1) {
      for (var ti = 0; ti < msgBlocks.length; ti++) {
        msgBlocks[ti].turnIndex = Math.floor(ti / 2);
      }
    }

    /* Merge direct-routed anchors into their target msgBlocks */
    for (var di in directRouted) {
      if (directRouted.hasOwnProperty(di)) {
        var dr = directRouted[di];
        if (dr.msgIndex >= 0 && dr.msgIndex < msgBlocks.length) {
          var mb = msgBlocks[dr.msgIndex];
          mb.anchored = true;
          for (var si = 0; si < activeItems.length; si++) {
            if (activeItems[si].id === di) {
              mb.matchedAnchors.push(activeItems[si]);
              var at = activeItems[si].tags || [];
              for (var ti = 0; ti < at.length; ti++) {
                if (mb.tags.indexOf(at[ti]) === -1) mb.tags.push(at[ti]);
              }
              break;
            }
          }
        }
      }
    }

    /* Second pass: build barData from blocks using MinimapMath */
    for (var i = 0; i < msgBlocks.length; i++) {
      var mb = msgBlocks[i];
      var blocks = mb.blocks;
      var isUser = mb.isUser;
      var anchored = mb.anchored;
      var matchedAnchors = mb.matchedAnchors;

      var blockResults = _routeAnchorsToBlocks(blocks, matchedAnchors, anchored, i, msgBlocks[i].isUser, msgBlocks[i].msgEl, directRouted, 'fallback');

      for (var j = 0; j < blocks.length; j++) {
        _pushBarToData(barData, blocks[j], i, j, msgBlocks[i].turnIndex, msgBlocks[i].msgEl, maxBlockLen, isUser, blockResults[j]);
      }
    }

    /* ── Phase B: Global fallback for orphaned/imported anchors ──
       Anchors with stale messageId (import/export, conversation reload)
       bypass hasAnchorContent → _anchorsByDom.  Scan all barData entries
       by fuzzy text match and route them here.  When block-scoped match
       fails (heading text routed to wrong <p>, cross-block anchor text),
       fall back to message-scoped fuzzy match. */
    for (var fi = 0; fi < activeItems.length; fi++) {
      var fa = activeItems[fi];
      if (!fa || anchorToBar[fa.id] || !fa.text) continue;
      for (var bj = 0; bj < barData.length; bj++) {
        var bd = barData[bj];
        if (!bd._el) continue;
        var liveText = bd._el.textContent || '';
        if (fuzzyVerifyText(liveText, fa.text)) {
          if (!bd.matchedAnchors) bd.matchedAnchors = [];
          bd.matchedAnchors.push(fa);
          bd.anchored = true;
          bd.tags = bd.tags || [];
          var aTags = fa.tags || [];
          for (var tgi = 0; tgi < aTags.length; tgi++) {
            if (bd.tags.indexOf(aTags[tgi]) === -1) bd.tags.push(aTags[tgi]);
          }
          anchorToBar[fa.id] = {
            msgIndex: bd.msgIndex,
            blockIndex: bd.blockIndex,
            messageId: bd.messageId
          };
          break;
        }
      }
      /* Message-scoped fallback: the anchor text doesn't match any
         single block but exists in the full message.  Route to the
         first bar of the matching message and flag for message-level
         flare scope. */
      if (!anchorToBar[fa.id]) {
        for (var mk = 0; mk < msgBlocks.length; mk++) {
          var msgEl = msgBlocks[mk].msgEl;
          if (fuzzyVerifyText(msgEl.textContent || '', fa.text)) {
            for (var bj = 0; bj < barData.length; bj++) {
              if (barData[bj].msgIndex === mk) {
                var mbd = barData[bj];
                if (!mbd.matchedAnchors) mbd.matchedAnchors = [];
                fa._flareScope = 'message';
                mbd.matchedAnchors.push(fa);
                mbd.anchored = true;
                mbd.tags = mbd.tags || [];
                var aTags = fa.tags || [];
                for (var tgi = 0; tgi < aTags.length; tgi++) {
                  if (mbd.tags.indexOf(aTags[tgi]) === -1) mbd.tags.push(aTags[tgi]);
                }
                anchorToBar[fa.id] = {
                  msgIndex: mk,
                  blockIndex: mbd.blockIndex,
                  messageId: mbd.messageId,
                  scope: 'message'
                };
                break;
              }
            }
            break;
          }
        }
      }
    }

    /* Guard against empty canvas when Gemini mid-render detaches elements */
    if (barData.length > 0 && barData.every(function(bar) { return bar.height <= MIN_BAR_HEIGHT; })) {
      if (msgElements.length > 0) return;
      if (!_retryPending && _retryCount < 5) {
        _retryPending = true;
        _retryCount++;
        requestAnimationFrame(function() {
          setTimeout(function() {
            _retryPending = false;
            rebuildBars();
          }, 100 + 150 * _retryCount);
        });
      }
      return;
    }
    _retryCount = 0;

    _knownMsgIds = [];
    var _allMsgEls = adapter.getMessageElements(scrollEl);
    for (var _mei = 0; _mei < _allMsgEls.length; _mei++) {
      _knownMsgIds[_mei] = _resolveMessageId(_allMsgEls[_mei]);
    }

    cachedMinimapRect = container.getBoundingClientRect();
    sizingCanvas();
    drawCanvas();

    updateSlider();
  }

  /* ══════════════════════════════════════════════════════════════
     MUTATION OBSERVER — Intel: update buffer only on DOM change
     ══════════════════════════════════════════════════════════════ */

  function incrementalUpdate() {
    scrollEl = adapter.findScrollContainer();
    if (!scrollEl || !canvasEl) return;
    if (adapter.isStreaming(scrollEl)) return;
    /* Detect DOM element shift (Gemini virtual scrolling recycles elements
       at different indices but the same count — the WeakSet approach failed
       because Gemini reuses DOM node references. Compare resolved messageId
       strings instead of element identity). */
    var currentEls = adapter.getMessageElements(scrollEl);
    if (_knownMsgIds) {
      var _needsRebuild = _knownMsgIds.length !== currentEls.length;
      if (!_needsRebuild) {
        for (var _cei = 0; _cei < currentEls.length; _cei++) {
          if (_resolveMessageId(currentEls[_cei]) !== _knownMsgIds[_cei]) {
            _needsRebuild = true; break;
          }
        }
      }
      if (_needsRebuild) { rebuildBars(); return; }
    }
    var known = new Set();
    for (var i = 0; i < barData.length; i++) known.add(barData[i].msgIndex);
    var newEls = [];
    for (var i = 0; i < currentEls.length; i++) {
      if (!known.has(i)) newEls.push(currentEls[i]);
    }
    if (!newEls.length) return;
    var firstKnownIdx = barData.length > 0 ? barData[0].msgIndex : 0;
    if (firstKnownIdx > 0 || newEls.length > 3) {
      rebuildBars();
      return;
    }
    /* Append new bars */
    var scrollHeight = adapter.getScrollHeight(scrollEl) || 1;
    var minimapHeight = (container.clientHeight || adapter.getViewportHeight()) - FOOTER_BUFFER;
    if (minimapHeight < 10) minimapHeight = adapter.getViewportHeight() - FOOTER_BUFFER;
    var scrollRect = adapter.getScrollRect(scrollEl);
    var scrollTop = adapter.getScrollTop(scrollEl);
    /* Find actual max text length across all bars (existing + new) */
    var actualMax = 1;
    for (var i = 0; i < barData.length; i++) {
      if (barData[i].textLen > actualMax) actualMax = barData[i].textLen;
    }
    /* Hoist storage reads for incremental additions */
    var activeItems = [];
    try {
      if (window.__ca.storage && window.__ca.storage.getActive) {
        activeItems = window.__ca.storage.getActive();
      }
      if (window.__ca.storage && window.__ca.storage.getActiveTemplates) {
        activeItems = activeItems.concat(window.__ca.storage.getActiveTemplates());
      }
    } catch(e) { /* ignore */ }
    matchCache = new WeakMap();
    var anchorMap = buildAnchorMap(activeItems);
    var needsKeyword = false;
    for (var ni = 0; ni < activeItems.length; ni++) {
      if (!activeItems[ni].messageId && !activeItems[ni].blockTextHash) { needsKeyword = true; break; }
    }
    var newBlocks = [];
    for (var i = 0; i < newEls.length; i++) {
      var msgEl = newEls[i];
      var blocks = adapter.getContentBlocks(msgEl);
      var isUser = adapter.isUserMessage(msgEl);
      var matchResult = hasAnchorContent(msgEl, anchorMap, activeItems, needsKeyword);
      var anchored = matchResult !== false;
      var tags = anchored ? matchResult.tags : [];
      var matchedAnchors = anchored ? matchResult.items : [];
      newBlocks.push({ msgEl: msgEl, isUser: isUser, anchored: anchored, tags: tags, matchedAnchors: matchedAnchors, blocks: blocks });
      for (var j = 0; j < blocks.length; j++) {
        var blen = (blocks[j].el.textContent || '').length;
        if (blen > actualMax) actualMax = blen;
      }
    }
    /* Recompute widths for all bars with updated max */
    for (var i = 0; i < barData.length; i++) {
      barData[i].width = math.computeBlockWidth(barData[i].textLen, actualMax);
    }

    /* Compute turnIndex for new messages based on last known turn */
    var _lastTurn = -1, _lastSender = null;
    for (var idx = barData.length - 1; idx >= 0; idx--) {
      if (barData[idx].turnIndex != null) {
        _lastTurn = barData[idx].turnIndex;
        _lastSender = barData[idx].isUser ? 'user' : 'model';
        break;
      }
    }
    var _currentTurn = _lastTurn >= 0 ? _lastTurn : 0;
    var _sender = _lastSender;
    for (var ni = 0; ni < newBlocks.length; ni++) {
      var _msgSender = newBlocks[ni].isUser ? 'user' : 'model';
      if (_msgSender === 'user' && _sender === 'model') _currentTurn++;
      newBlocks[ni].turnIndex = _currentTurn;
      _sender = _msgSender;
    }

    for (var i = 0; i < newBlocks.length; i++) {
      var mb = newBlocks[i];
      var blocks = mb.blocks;
      var isUser = mb.isUser;
      var anchored = mb.anchored;
      var matchedAnchors = mb.matchedAnchors;

      var blockResults = _routeAnchorsToBlocks(blocks, matchedAnchors, anchored, currentEls.indexOf(msgEl), adapter.isUserMessage(msgEl), msgEl, null, 'incremental-fallback');

      for (var j = 0; j < blocks.length; j++) {
        _pushBarToData(barData, blocks[j], currentEls.indexOf(msgEl), j, mb.turnIndex, msgEl, actualMax, isUser, blockResults[j]);
      }
    }
    /* Guard against empty canvas when Gemini mid-render detaches elements */
    if (barData.length > 0 && barData.every(function(bar) { return bar.height <= MIN_BAR_HEIGHT; })) {
      if (currentEls.length > 0) return;
      if (!_retryPending && _retryCount < 5) {
        _retryPending = true;
        _retryCount++;
        requestAnimationFrame(function() {
          setTimeout(function() {
            _retryPending = false;
            rebuildBars();
          }, 100 + 150 * _retryCount);
        });
      }
      return;
    }
    _retryCount = 0;
    drawCanvas();
    updateSlider();
  }

  /* ══════════════════════════════════════════════════════════════
     SCROLL HANDLING — throttled viewport slider update
     ══════════════════════════════════════════════════════════════ */

  function attachListeners() {
    detachListeners();
    if (!scrollEl) return;
    scrollEl.addEventListener('scroll', onScrollThrottled);
    observer = new MutationObserver(function() {
      if (rebuildTimer) clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(function() {
        rebuildTimer = null;
        incrementalUpdate();
      }, OBSERVER_DEBOUNCE_MS);
    });
    observer.observe(scrollEl, { childList: true, subtree: true });
  }

  function detachListeners() {
    if (observer) { observer.disconnect(); observer = null; }
    if (scrollEl) {
      scrollEl.removeEventListener('scroll', onScrollThrottled);
    }
    if (scrollRaf) {
      cancelAnimationFrame(scrollRaf);
      scrollRaf = null;
    }
  }

  function onScrollThrottled() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(function() {
      scrollRaf = null;
      updateSlider();
    });
  }

  function updateSlider() {
    if (!slider || !scrollEl || !container) return;
    if (sliderLocked) { sliderLocked = false; return; }
    var sh = adapter.getScrollHeight(scrollEl);
    var ch = adapter.getClientHeight(scrollEl);
    var st = adapter.getScrollTop(scrollEl);
    if (sh <= ch) {
      slider.classList.add('hidden');
      return;
    }
    slider.classList.remove('hidden');
    var minimapHeight = (container.clientHeight || adapter.getViewportHeight()) - FOOTER_BUFFER;
    if (minimapHeight < 10) minimapHeight = adapter.getViewportHeight() - FOOTER_BUFFER;

    var metrics = math.computeSliderMetrics(st, sh, ch, minimapHeight);
    var sliderTop = metrics.top;
    var sliderH = metrics.height;

    if (snapMode === 'block') {
      /* Snap to message-group boundaries */
      if (barData.length) {
        var bd = barData;
        var snapTop = sliderTop, snapBottom = sliderTop + sliderH;
        var firstIdx = -1, lastIdx = -1;
        for (var i = 0; i < bd.length; i++) {
          if (firstIdx === -1 && bd[i].top + bd[i].height > snapTop) {
            firstIdx = i;
            while (firstIdx > 0 && bd[firstIdx - 1].turnIndex === bd[firstIdx].turnIndex) firstIdx--;
            snapTop = bd[firstIdx].top;
          }
          if (bd[i].top < snapBottom) lastIdx = i;
        }
        if (lastIdx >= 0) {
          while (lastIdx < bd.length - 1 && bd[lastIdx + 1].turnIndex === bd[lastIdx].turnIndex) lastIdx++;
          snapBottom = bd[lastIdx].top + bd[lastIdx].height;
          var groupHeight = snapBottom - snapTop;
          if (groupHeight <= minimapHeight) {
            sliderH = Math.max(MIN_SLIDER_HEIGHT, groupHeight);
            sliderTop = snapTop;
          }
        }
      }
    } else if (snapMode === 'bar' || snapMode === 'focus') {
      /* Snap to nearest bar by scroll ratio */
      if (barData.length) {
        var scrollRatio = sh > 0 ? st / sh : 0;
        var closestIdx = -1, closestDist = Infinity;
        for (var i = 0; i < barData.length; i++) {
          var barRatio = minimapHeight > 0 ? barData[i].top / minimapHeight : 0;
          var dist = Math.abs(scrollRatio - barRatio);
          if (dist < closestDist) { closestDist = dist; closestIdx = i; }
        }
        if (closestIdx >= 0) {
          sliderTop = barData[closestIdx].top;
          sliderH = Math.max(MIN_SLIDER_HEIGHT, barData[closestIdx].height);
        }
      }
    }
    var maxTop = Math.max(0, minimapHeight - sliderH);
    if (sliderTop > maxTop) sliderTop = maxTop;
    slider.style.top = sliderTop + 'px';
    slider.style.height = sliderH + 'px';
  }

  /* ══════════════════════════════════════════════════════════════
     GROUPED MODAL — show all anchors in a message cluster on hover
     ══════════════════════════════════════════════════════════════ */

  function centerGroupedModal() {
    if (!_groupedModal || !container) return;
    var pRect = cachedMinimapRect || container.getBoundingClientRect();
    var vh = adapter.getViewportHeight();
    var modalH = Math.min(_groupedModal.offsetHeight || 300, vh - 16);
    var centerTop = pRect.top + (pRect.height - modalH) / 2;
    _groupedModal.style.top = Math.max(8, Math.round(centerTop)) + 'px';
  }

  function autoShowGroupedModal() {
    if (_groupedModal) return;
    for (var i = 0; i < barData.length; i++) {
      if (barData[i].anchored && barData[i].matchedAnchors && barData[i].matchedAnchors.length) {
        showGroupedModal(i, 0);
        break;
      }
    }
  }

  function showGroupedModal(barIdx, clientY) {
    dismissGroupedModal();

    /* Collect unique tagged anchors from storage (source of truth).
       No barData dependency — each anchor carries its own routing metadata
       (msgIndex, blockIndex, blockTextHash, messageId) for live resolution
       at click time via resolveBlockTarget. */
    var activeItems = [];
    try {
      if (window.__ca.storage && window.__ca.storage.getActive) {
        activeItems = window.__ca.storage.getActive();
      }
    } catch(e) { /* ignore */ }

    var items = [];
    for (var si = 0; si < activeItems.length; si++) {
      var a = activeItems[si];
      if (a.tags && a.tags.length) {
        items.push({ anchor: a });
      }
    }
    /* Include untagged anchors as "Untagged" group */
    for (var ui = 0; ui < activeItems.length; ui++) {
      var ua = activeItems[ui];
      if (!ua.tags || !ua.tags.length) {
        items.push({ anchor: ua });
      }
    }
    if (!items.length) return;

    /* Sort by tag (alphabetical), untagged last, then by createdAt descending */
    items.sort(function(a, b) {
      var at = (a.anchor.tags && a.anchor.tags[0]) || '\uffff';
      var bt = (b.anchor.tags && b.anchor.tags[0]) || '\uffff';
      if (at < bt) return -1;
      if (at > bt) return 1;
      return (b.anchor.createdAt || 0) - (a.anchor.createdAt || 0);
    });

    /* Build tag counts */
    var tagCounts = {};
    for (var si = 0; si < items.length; si++) {
      var key = (items[si].anchor.tags && items[si].anchor.tags[0]) || 'Untagged';
      tagCounts[key] = (tagCounts[key] || 0) + 1;
    }

    _groupedBarIdx = barIdx;
    if (_toggleBtn) _toggleBtn.classList.add('ca-mode-btn-active');

    /* Build modal DOM */
    _groupedModal = shared.$create('div', {
      className: 'ca-cmd-dropdown'
    });

    var header = shared.$create('div', { className: 'ca-cmd-header' });
    var headerSpan = shared.$create('span', {
      textContent: items.length + ' Anchor' + (items.length !== 1 ? 's' : '') + ' in chat'
    });
    header.appendChild(headerSpan);
    var pinBtn = shared.$create('button', {
      'data-action': 'toggle-pin',
      className: 'ca-btn-pin',
      title: 'Pin modal'
    });
    pinBtn.appendChild(shared.$icon('0 0 24 24', [
      { tag: 'rect', attrs: { x: '3', y: '11', width: '18', height: '11', rx: '2' } },
      { tag: 'path', attrs: { d: 'M7 11V7a5 5 0 0110 0v4' } }
    ]));
    header.appendChild(pinBtn);
    var closeBtn = shared.$create('button', {
      'data-action': 'grouped-modal-close',
      className: 'ca-modal-close',
      textContent: '\u00D7'
    });
    header.appendChild(closeBtn);
    _groupedModal.appendChild(header);

    /* Build highlight set from the triggering bar (canvas hover) */
    var hlAnchorIds = {};
    if (barIdx >= 0 && barIdx < barData.length) {
      var hEntry = barData[barIdx];
      if (hEntry && hEntry.matchedAnchors) {
        for (var hi = 0; hi < hEntry.matchedAnchors.length; hi++) {
          hlAnchorIds[hEntry.matchedAnchors[hi].id] = true;
        }
      }
    }

    var collapsedGroups = window.__ca.state.collapsedGroups || {};
    var list = shared.$create('div', { className: 'ca-cmd-list' });
    var currentTag = undefined;
    for (var gi = 0; gi < items.length; gi++) {
      var item = items[gi];
      var anchor = item.anchor;
      var groupTag = anchor.tags && anchor.tags[0] ? anchor.tags[0] : '';
      if (groupTag !== currentTag) {
        currentTag = groupTag;
        var label = groupTag || 'Untagged';
        list.appendChild(
          shared.buildTagGroupHeader(label, !!collapsedGroups[label], tagCounts[label])
        );
      }
      if (collapsedGroups[currentTag]) continue;

      var hl = !!hlAnchorIds[anchor.id];
      var row = shared.$create('div', {
        className: 'ca-cmd-item' + (hl ? ' highlighted' : ''),
        'data-action': 'grouped-jump',
        'data-anchor-id': anchor.id
      });

      /* Text snippet */
      var descText = anchor.description || anchor.text || '(untitled)';
      var textEl = shared.$create('div', {
        className: 'ca-cmd-text',
        textContent: descText
      });
      row.appendChild(textEl);

      /* Turns remaining */
      var isExpired = anchor.turnsRemaining === 0;
      var isExpiring = !isExpired && anchor.turnsRemaining <= 3;
      var turnsClass = 'ca-anchor-turns';
      if (isExpiring) turnsClass += ' expiring';
      if (isExpired) turnsClass += ' expired';
      var turnsSpan = shared.$create('span', {
        className: turnsClass,
        textContent: (anchor.turnsRemaining != null ? anchor.turnsRemaining + '/' + anchor.turnsTotal : '')
      });
      row.appendChild(turnsSpan);

      list.appendChild(row);
    }
    _groupedModal.appendChild(list);

    var footer = shared.$create('div', {
      className: 'ca-cmd-footer',
      textContent: '\u2191\u2193 navigate  \u21b5 jump  esc dismiss'
    });
    _groupedModal.appendChild(footer);

    /* Store anchor list for grouped-jump click delegation */
    _groupedModal._anchorList = items;

    /* Position — left of minimap, vertically centered at cursor */
    var pRect = cachedMinimapRect || (container ? container.getBoundingClientRect() : null);
    if (!pRect) { dismissGroupedModal(); return; }
    var vw = adapter.getViewportWidth();
    var pw = Math.max(220, Math.min(Math.round(vw * 0.3), 360));
    _groupedModal.style.width = pw + 'px';
    _groupedModal.style.left = Math.max(8, pRect.left - pw - 10) + 'px';
    var vh = adapter.getViewportHeight();
    var modalH = Math.min(_groupedModal.offsetHeight || 300, vh - 16);
    var modalTop = Math.max(8, clientY - Math.round(modalH / 2));
    if (modalTop + modalH > vh - 8) {
      modalTop = vh - modalH - 8;
    }
    _groupedModal.style.top = Math.round(modalTop) + 'px';
    shared.$append(_groupedModal);

    /* Cancel hover dismiss timer when cursor enters modal (mouse left
       the container, triggering the debounced dismiss).  Lets the user
       reach the pin button and anchor rows before the modal closes. */
    _groupedModal.addEventListener('mouseenter', function() {
      if (hoverHideTimer) { clearTimeout(hoverHideTimer); hoverHideTimer = null; }
    });

    /* ── Shared grouped-modal navigation ──
       Extracted to avoid duplicating the resolveBlockTarget → scrollBlockTo →
       anchorToBar → navigateToPopupAnchor fallback chain in both the click
       and keyboard Enter handlers below. */
    function _navigateFromGroupedModal(anchorId) {
      if (!anchorId || !scrollEl || !_groupedModal) return;
      var anchor = null;
      var listItems = _groupedModal._anchorList;
      if (listItems) {
        for (var ji = 0; ji < listItems.length; ji++) {
          if (listItems[ji].anchor.id === anchorId) { anchor = listItems[ji].anchor; break; }
        }
      }
      if (!anchor) return;

      var routing = {
        msgIndex: anchor.msgIndex != null ? anchor.msgIndex : null,
        blockIndex: anchor.blockIndex != null ? anchor.blockIndex : null,
        blockTextHash: anchor.blockTextHash || null,
        messageId: anchor.messageId || null,
        matchedAnchors: [anchor],
        top: 0
      };

      clearNavigationTracking();

      var liveEl = resolveBlockTarget(routing);
      if (liveEl) {
        scrollBlockTo(liveEl, 0, CONTEXT_BUFFER, anchor.text, anchor.textOffset, true);
        return;
      }

      /* Fallback: anchorToBar routing (anchor was bound to a bar in a
         prior rebuild — use its stored msgIndex/blockIndex) */
      var e = anchorToBar[anchorId];
      if (e) {
        for (var kk = 0; kk < barData.length; kk++) {
          if (barData[kk].msgIndex === e.msgIndex && barData[kk].blockIndex === e.blockIndex) {
            navigateToPopupAnchor(barData[kk], anchorId);
            break;
          }
        }
      } else {
        navigateToPopupAnchor(routing, anchorId);
      }
    }

    /* Click delegation — modal-level: pin toggle, group toggle, anchor jump */
    _groupedModal.addEventListener('click', function(me) {
      var pinTarget = me.target.closest('[data-action="toggle-pin"]');
      if (pinTarget) {
        _groupedModalPinned = !_groupedModalPinned;
        pinTarget.classList.toggle('active', _groupedModalPinned);
        pinTarget.title = _groupedModalPinned ? 'Unpin modal' : 'Pin modal';
        if (_groupedModalPinned) centerGroupedModal();
        return;
      }
      var closeTarget = me.target.closest('[data-action="grouped-modal-close"]');
      if (closeTarget) {
        dismissGroupedModal();
        return;
      }
      var toggleTarget = me.target.closest('[data-action="tag-popup-toggle-group"]');
      if (toggleTarget && toggleTarget.dataset.group) {
        var group = toggleTarget.dataset.group;
        if (!window.__ca.state.collapsedGroups) window.__ca.state.collapsedGroups = {};
        window.__ca.state.collapsedGroups[group] = !window.__ca.state.collapsedGroups[group];
        if (_groupedBarIdx != null) {
          var wasPinned = _groupedModalPinned;
          var validIdx = (_groupedBarIdx < barData.length && barData[_groupedBarIdx].anchored)
            ? _groupedBarIdx : -1;
          if (validIdx >= 0) {
            showGroupedModal(validIdx, clientY);
          } else {
            autoShowGroupedModal();
          }
          if (wasPinned && _groupedModal) {
            _groupedModalPinned = true;
            var pinBtn = _groupedModal.querySelector('[data-action="toggle-pin"]');
            if (pinBtn) { pinBtn.classList.add('active'); pinBtn.title = 'Unpin modal'; }
            centerGroupedModal();
          }
        }
        return;
      }
      var jumpTarget = me.target.closest('[data-action="grouped-jump"]');
      if (!jumpTarget) return;
      var anchorId = jumpTarget.dataset.anchorId;
      if (!anchorId) return;
      _navigateFromGroupedModal(anchorId);
      /* Persistent click indicator — sync .selected with clicked item */
      if (_groupedModal && _groupedModal._items) {
        var ci = Array.prototype.indexOf.call(_groupedModal._items, jumpTarget);
        if (ci >= 0) { _groupedModal._selIdx = ci; _updateGroupedSelection(); }
      }
    });

    /* Outside-click dismiss */
    _groupedOutsideHandler = function(me) {
      if (_groupedModalPinned) return;
      if (_groupedModal && !_groupedModal.contains(me.target) && !container.contains(me.target)) {
        dismissGroupedModal();
      }
    };
    window.__ca.ROOT.addEventListener('mousedown', _groupedOutsideHandler, true);

    /* Store items for keyboard nav */
    _groupedModal._items = list.querySelectorAll('.ca-cmd-item');
    _groupedModal._anchorList = items;
    _groupedModal._selIdx = -1;

    /* Set initial selection to the highlighted item (search via DOM
       anchorId to stay aligned with visible items; collapsed groups
       skip rendering so logical items index won't match). */
    var targetAnchors = barData[barIdx] && barData[barIdx].matchedAnchors;
    if (targetAnchors) {
      var targetIds = {};
      for (var si = 0; si < targetAnchors.length; si++) {
        targetIds[targetAnchors[si].id] = true;
      }
      var _itemsArr = _groupedModal._items;
      for (var si = 0; si < _itemsArr.length; si++) {
        if (targetIds[_itemsArr[si].dataset.anchorId]) {
          _groupedModal._selIdx = si;
          _updateGroupedSelection();
          break;
        }
      }
    }

    /* Keyboard navigation */
    _groupedKeyHandler = function(ke) {
      if (!_groupedModal) return;
      if (ke.key === 'ArrowDown') {
        ke.preventDefault();
        if (_groupedModal._selIdx < _groupedModal._items.length - 1) {
          _groupedModal._selIdx++;
          _updateGroupedSelection();
        }
      } else if (ke.key === 'ArrowUp') {
        ke.preventDefault();
        if (_groupedModal._selIdx > 0) {
          _groupedModal._selIdx--;
          _updateGroupedSelection();
        }
      } else if (ke.key === 'Enter') {
        ke.preventDefault();
        var selItem = _groupedModal._items[_groupedModal._selIdx];
        if (!selItem) return;
        var id = selItem.dataset.anchorId;
        if (!id) return;
        _navigateFromGroupedModal(id);
      } else if (ke.key === 'Escape') {
        ke.preventDefault();
        dismissGroupedModal();
      }
    };
    document.addEventListener('keydown', _groupedKeyHandler, true);
  }

  function updateGroupedHighlight(barIdx) {
    if (!_groupedModal) return;
    var entry = barData[barIdx];
    if (!entry) return;

    /* Build set of anchor IDs from the hovered bar */
    var hlIds = {};
    if (entry.matchedAnchors) {
      for (var hi = 0; hi < entry.matchedAnchors.length; hi++) {
        hlIds[entry.matchedAnchors[hi].id] = true;
      }
    }

    /* Update highlight classes on existing items */
    var items_ = _groupedModal._items;
    if (!items_) return;
    for (var hi = 0; hi < items_.length; hi++) {
      var cn_ = items_[hi].className;
      var id_ = items_[hi].dataset.anchorId;
      if (hlIds[id_]) {
        if (cn_.indexOf(' highlighted') === -1) {
          items_[hi].className = cn_ + ' highlighted';
        }
      } else {
        items_[hi].className = cn_.replace(/\s?highlighted/g, '').trim();
      }
    }

    /* Update keyboard selection to first highlighted item */
    for (var si = 0; si < items_.length; si++) {
      if (hlIds[items_[si].dataset.anchorId]) {
        _groupedModal._selIdx = si;
        _updateGroupedSelection();
        break;
      }
    }
  }

  function dismissGroupedModal() {
    if (_groupedDismissTimer) { clearTimeout(_groupedDismissTimer); _groupedDismissTimer = null; }
    clearNativeHighlight();
    if (_flaredEl) { adapter.clearFlare(_flaredEl); _flaredEl = null; }
    if (_groupedKeyHandler) {
      document.removeEventListener('keydown', _groupedKeyHandler, true);
      _groupedKeyHandler = null;
    }
    if (_groupedOutsideHandler) {
      window.__ca.ROOT.removeEventListener('mousedown', _groupedOutsideHandler, true);
      _groupedOutsideHandler = null;
    }
    if (_groupedModal && _groupedModal.parentNode) {
      _groupedModal.parentNode.removeChild(_groupedModal);
    }
    if (_toggleBtn) _toggleBtn.classList.remove('ca-mode-btn-active');
    _groupedModal = null;
    _groupedBarIdx = null;
    _groupedModalPinned = false;
  }

  function _updateGroupedSelection() {
    if (!_groupedModal || !_groupedModal._items) return;
    var items_ = _groupedModal._items;
    var sel_ = _groupedModal._selIdx;
    for (var si = 0; si < items_.length; si++) {
      if (si === sel_) {
        if (items_[si].className.indexOf(' selected') === -1) {
          items_[si].className += ' selected';
        }
      } else {
        items_[si].className = items_[si].className.replace(/\s?selected/g, '').trim();
      }
    }
  }

  /* ══════════════════════════════════════════════════════════════
     EXPORTS
     ══════════════════════════════════════════════════════════════ */

  window.__ca = window.__ca || {};
  window.__ca.minimap = {
    init: init,
    toggle: toggle,
    destroy: destroy,
    update: rebuildBars,
    debugSanity: function() {
      var failures = [];
      for (var i = 0; i < barData.length; i++) {
        var b = barData[i];
        if (b.top < 0) failures.push('Bar ' + i + ': negative top=' + b.top);
        if (b.width < 0) failures.push('Bar ' + i + ': negative width=' + b.width);
        if (b.anchored && (!b.matchedAnchors || b.matchedAnchors.length === 0)) {
          failures.push('Bar ' + i + ': anchored=true but no matchedAnchors');
        }
      }
      if (failures.length > 0) {
        console.error('[MINIMAP SANITY] ' + failures.length + ' failures');
        for (var j = 0; j < failures.length; j++) {
          console.log('  ' + failures[j]);
        }
      } else {
        console.log('[MINIMAP SANITY] Clean — ' + barData.length + ' bars');
      }
      return failures;
    },
    debugDiagnose: function(anchorId) {
      if (!window.__ca.state.debugDiagnose) return;
      console.log('[DIAGNOSE] anchor: ' + anchorId);
      if (!window.__ca.storage || !window.__ca.storage.getActive) {
        console.error('[DIAGNOSE] storage unavailable'); return;
      }
      var items = window.__ca.storage.getActive().concat(window.__ca.storage.getActiveTemplates());
      var anchor = null;
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === anchorId) { anchor = items[i]; break; }
      }
      if (!anchor) { console.error('[DIAGNOSE] anchor not found in storage'); return; }
      console.log('[DIAGNOSE] text: "' + (anchor.text || '').substring(0, 80) + '"');

      /* Find bar entries for this anchor */
      var bars = [];
      for (var i = 0; i < barData.length; i++) {
        if (!barData[i].matchedAnchors) continue;
        for (var j = 0; j < barData[i].matchedAnchors.length; j++) {
          if (barData[i].matchedAnchors[j].id === anchorId) {
            bars.push({ barIdx: i, msgIndex: barData[i].msgIndex, blockIndex: barData[i].blockIndex, messageId: barData[i].messageId, source: barData[i].source, anchored: barData[i].anchored });
          }
        }
      }
      console.log('[DIAGNOSE] found in ' + bars.length + ' bar(s):');
      for (var i = 0; i < bars.length; i++) {
        console.log('  bar:' + bars[i].barIdx + ' msgIdx:' + bars[i].msgIndex + ' blockIdx:' + bars[i].blockIndex + ' msgId:' + (bars[i].messageId || '?') + ' source:' + bars[i].source);
      }
      if (bars.length === 0) { console.error('[DIAGNOSE] anchor not found in barData at all'); return; }

      /* Resolve live message and decompose blocks */
      var msgs = adapter.getMessageElements(scrollEl);
      var msgEl = null;
      if (bars[0].messageId) {
        for (var di = 0; di < msgs.length; di++) {
          if (_resolveMessageId(msgs[di]) === bars[0].messageId) { msgEl = msgs[di]; break; }
        }
      }
      if (!msgEl) msgEl = msgs[bars[0].msgIndex];
      if (!msgEl) { console.error('[DIAGNOSE] message ' + bars[0].msgIndex + ' not in live DOM'); return; }
      console.log('[DIAGNOSE] msg tag: ' + msgEl.tagName + ' isUser: ' + adapter.isUserMessage(msgEl));

      var blocks = adapter.getContentBlocks(msgEl);
      console.log('[DIAGNOSE] blocks: ' + blocks.length);
      if (blocks.length === 0) {
        console.error('[DIAGNOSE] getContentBlocks returned 0 — selector may not match this message type');
        return;
      }

      /* Build unified text — same logic as rebuildBars offset mapping */
      var normalize = function(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
      var normAnchor = normalize(anchor.text);
      console.log('[DIAGNOSE] norm anchor: "' + normAnchor + '"');

      var unified = '';
      var mappings = [];
      for (var i = 0; i < blocks.length; i++) {
        var raw = blocks[i].el.textContent || '';
        var norm = normalize(raw);
        var s = unified.length > 0 ? ' ' : '';
        mappings.push({ idx: i, start: unified.length + s.length, end: unified.length + s.length + norm.length, norm: norm, rawLen: raw.length, normLen: norm.length });
        unified += s + norm;
        console.log('[DIAGNOSE] block ' + i + ' tag:<' + blocks[i].el.tagName + '> rawLen:' + raw.length + ' normLen:' + norm.length + (norm.length === 0 && raw.trim().length > 0 ? ' WARNING: normalization wiped content' : ''));
      }
      console.log('[DIAGNOSE] unified text (' + unified.length + ' chars): "' + unified.substring(0, 120) + '..."');

      var matchIdx = unified.indexOf(normAnchor);
      if (matchIdx === -1) {
        console.error('[DIAGNOSE] anchor NOT found in unified text');
        var rawUnified = '';
        for (var i = 0; i < blocks.length; i++) { rawUnified += (rawUnified ? ' ' : '') + (blocks[i].el.textContent || '').toLowerCase(); }
        if (rawUnified.indexOf((anchor.text || '').toLowerCase()) !== -1) {
          console.log('[DIAGNOSE] raw lowercase comparison PASSES — normalization is stripping needed characters');
        } else {
          console.log('[DIAGNOSE] even raw lowercase comparison fails — DOM text differs from stored anchor text');
        }
        return;
      }
      console.log('[DIAGNOSE] match found at offset ' + matchIdx);
      var matchEnd = matchIdx + normAnchor.length;
      for (var i = 0; i < mappings.length; i++) {
        if (matchIdx < mappings[i].end && matchEnd > mappings[i].start) {
          console.log('[DIAGNOSE] intersects block ' + i);
        }
      }
      console.log('[DIAGNOSE] anchorToBar entry: ' + (anchorToBar[anchorId] ? 'msgIdx:' + anchorToBar[anchorId].msgIndex + ' blockIdx:' + anchorToBar[anchorId].blockIndex : 'NONE'));
    },
    recordAnchorBlock: function(blockEl, anchorId, blockTextHash) {
      if (!blockEl || !anchorId) return;
      var entry = anchorWeakMap.get(blockEl);
      if (entry) {
        if (entry.ids.indexOf(anchorId) === -1) entry.ids.push(anchorId);
      } else {
        anchorWeakMap.set(blockEl, { ids: [anchorId], blockTextHash: blockTextHash || null });
      }
    },
    _test: {
      barData: function() { return barData; },
      anchorToBar: function() { return anchorToBar; },
      triggerNativeTextFlare: triggerNativeTextFlare,
      clearNativeHighlight: clearNativeHighlight,
      calculatePreciseRange: calculatePreciseRange,
      resolveBlockTarget: resolveBlockTarget,
      navigateToPopupAnchor: navigateToPopupAnchor,
      scrollBlockTo: scrollBlockTo,
      scrollEl: function() { return scrollEl; },
      container: function() { return container; },
      init: init,
      anchorWeakMap: function() { return anchorWeakMap; },
      normalizeForMatch: normalizeForMatch
    }
  };
})();
