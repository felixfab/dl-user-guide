(function() {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     HostDOMAdapter — abstracts all volatile host page DOM queries
     behind a stable API. Maps selector lists → query functions.
     ══════════════════════════════════════════════════════════════ */

  var SCROLL_SELECTORS = [
    'infinite-scroller[data-test-id="chat-history-container"]',
    '.chat-history',
    '[role="feed"]',
    '[role="log"]',
    '[data-test-id="conversation-container"]',
    '.conversation-container',
    'main',
    '#chat-history',
    '[data-test-id="conversation"]'
  ];

  var USER_INDICATORS = [
    'user-query',
    '[data-role="user"]',
    '[data-message-role="user"]',
    '.user-query',
    '[data-test-id="user-query"]',
    '.user-profile-picture',
    '[data-test-id="user-input"]'
  ];

  var MSG_SELECTORS = [
    'user-query',
    'model-response',
    'ms-chat-turn',
    '[data-test-id="conversation-turn"]',
    '[data-test-id="message"]',
    '[data-message-id]',
    '[data-e2e-id]'
  ];

  var CONTENT_SELECTORS = [
    '.response-content',
    '[data-test-id="response-content"]',
    '.conversation-turn',
    '.message-content',
    'model-response > div:first-child',
    'user-query > div:first-child'
  ];

  /* ── Content script selectors — Gemini input / send button ── */
  var INPUT_SELECTORS = [
    'div[role="textbox"][aria-label="Enter a prompt for Gemini"]',
    'div[role="textbox"][aria-label="Ask Gemini"]',
    'div[role="textbox"][aria-label="Ask anything"]',
    'div[role="textbox"][contenteditable="true"]'
  ];

  var SEND_BUTTON_SELECTORS = [
    'button[aria-label="Send message"]',
    '[data-test-id="send-button-container"] button',
    '.send-button button'
  ];

  var BLOCK_SELECTORS = [
    'p',
    'pre',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'td',
    'th',
    'div[role="paragraph"]'
  ];

  /* ── Generic selector resolver (used by content.js) ── */
  function resolveSelector(selectorList) {
    for (var i = 0; i < selectorList.length; i++) {
      var el = document.querySelector(selectorList[i]);
      if (el) return el;
    }
    return null;
  }

  function resolveNodeSelector(node, selectorList) {
    for (var i = 0; i < selectorList.length; i++) {
      var el = node.querySelector(selectorList[i]);
      if (el) return el;
    }
    return null;
  }

  /* ── Scroll container detection ── */
  function findScrollContainer() {
    for (var i = 0; i < SCROLL_SELECTORS.length; i++) {
      var el = document.querySelector(SCROLL_SELECTORS[i]);
      if (el) return el;
    }
    var input = document.querySelector('[role="textbox"][contenteditable="true"]');
    if (input) {
      var parent = input.parentElement;
      while (parent && parent !== document.body) {
        var cs = window.getComputedStyle(parent);
        if (cs.overflowY === 'auto' || cs.overflowY === 'scroll' ||
            cs.overflow === 'auto' || cs.overflow === 'scroll') {
          return parent;
        }
        parent = parent.parentElement;
      }
    }
    return document.body;
  }

  /* ── Message element enumeration ── */
  function getMessageElements(scrollEl) {
    if (!scrollEl) return [];
    var selector = MSG_SELECTORS.join(', ');
    var all = scrollEl.querySelectorAll(selector);
    var results = [];
    var seen = new Set();
    for (var i = 0; i < all.length; i++) {
      if (!seen.has(all[i])) {
        seen.add(all[i]);
        results.push(all[i]);
      }
    }
    /* Remove descendants: keep an element if it IS a known custom message
       tag, or it is NOT inside any known custom message tag. This prevents
       [data-message-id] on deep <p> elements from creating spurious msgBlocks
       while preserving <user-query> inside <ms-chat-turn>. */
    return results.filter(function(el) {
      if (el.matches('user-query, model-response')) return true;
      return !el.closest('user-query, model-response');
    });
  }

  /* ── Role detection (defensive ancestor traversal) ── */
  function isUserMessage(msgEl) {
    if (!msgEl || msgEl.nodeType !== 1) return false;
    return !!msgEl.closest(USER_INDICATORS.join(', '));
  }

  /* ── Content element extraction ── */
  function getContentEl(msgEl) {
    for (var i = 0; i < CONTENT_SELECTORS.length; i++) {
      var el = msgEl.querySelector(CONTENT_SELECTORS[i]);
      if (el) return el;
    }
    var all = msgEl.querySelectorAll('*');
    var best = msgEl;
    var bestDepth = 0;
    for (var i = 0; i < all.length; i++) {
      var depth = 0;
      var cursor = all[i];
      while (cursor !== msgEl) { cursor = cursor.parentElement; depth++; }
      if (depth > bestDepth) {
        var text = (all[i].textContent || '').trim();
        if (all[i].querySelector('p, pre, li') || text.length > 20) {
          best = all[i];
          bestDepth = depth;
        }
      }
    }
    return best;
  }

  /* ── Content block decomposition (p, pre, li, h1-h6) ──
     Headings are included so that anchors targeting heading text
     (e.g. "Current Market Context (May 2026)") route to the
     correct block rather than being orphaned to the first <p>. */
  function getContentBlocks(msgEl) {
    var content = getContentEl(msgEl);
    var nodes = content.querySelectorAll('p, pre, li, h1, h2, h3, h4, h5, h6, td, th');
    if (nodes.length) {
      return buildBlockList(nodes);
    }
    var structural = walkTextBlocks(content);
    if (structural.length) return structural;
    return [{ el: content, type: 'text' }];
  }

  function buildBlockList(nodes) {
    var blocks = [];
    for (var i = 0; i < nodes.length; i++) {
      var t = (nodes[i].textContent || '').trim();
      if (!t) continue;
      blocks.push({ el: nodes[i], type: nodes[i].tagName === 'PRE' ? 'code' : 'text' });
    }
    return blocks;
  }

  function hasDirectTextNode(el) {
    var child = el.firstChild;
    while (child) {
      if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) return true;
      child = child.nextSibling;
    }
    return false;
  }

  function walkTextBlocks(root) {
    var skipTags = /^(SCRIPT|STYLE|BUTTON|INPUT|SELECT|TEXTAREA|OPTION|SVG|PATH|IFRAME)$/i;
    var all = root.querySelectorAll('*');
    var textEls = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (skipTags.test(el.tagName)) continue;
      if (hasDirectTextNode(el)) textEls.push(el);
    }
    textEls.sort(function(a, b) {
      var da = 0, db = 0, c = a;
      while (c !== root) { c = c.parentElement; da++; }
      c = b;
      while (c !== root) { c = c.parentElement; db++; }
      return db - da;
    });
    var accepted = new WeakSet();
    var blocks = [];
    for (var i = 0; i < textEls.length; i++) {
      var el = textEls[i];
      var parent = el.parentElement;
      var contained = false;
      while (parent && parent !== root) {
        if (accepted.has(parent)) { contained = true; break; }
        parent = parent.parentElement;
      }
      if (contained) continue;
      accepted.add(el);
      var t = (el.textContent || '').trim();
      if (t) blocks.push({ el: el, type: t.length > 200 ? 'code' : 'text' });
    }
    return blocks;
  }

  function findBlockElement(el) {
    for (var i = 0; i < BLOCK_SELECTORS.length; i++) {
      var block = el.closest(BLOCK_SELECTORS[i]);
      if (block) return block;
    }
    /* Catch-all: walk up to the first element that is a direct child
       of a message container. This handles Gemini blocks rendered as
       plain <div> elements without semantic role attributes. */
    var cursor = el;
    while (cursor && cursor.parentElement) {
      if (cursor.parentElement.matches(MSG_SELECTORS.join(', '))) {
        return cursor;
      }
      cursor = cursor.parentElement;
    }
    return null;
  }

  function getBlockIndex(msgEl, blockEl) {
    var blocks = getContentBlocks(msgEl);
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i].el === blockEl) return i;
    }
    return null;
  }

  /* ── Native Range-based block resolver ── */
  function getNormalizedStartNode(range) {
    var node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) {
      var child = node.childNodes[range.startOffset];
      if (child && child.nodeType === Node.TEXT_NODE) return child;
      if (child) {
        var walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT, null, false);
        var firstText = walker.nextNode();
        if (firstText) return firstText;
      }
      var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
      var firstText = walker.nextNode();
      if (firstText) return firstText;
    }
    return node;
  }

  function resolveAnchorBlock(msgEl, range) {
    var blocks = getContentBlocks(msgEl);
    for (var i = 0; i < blocks.length; i++) {
      if (range.intersectsNode(blocks[i].el)) {
        return { blockEl: blocks[i].el, blockIdx: i };
      }
    }
    return { blockEl: null, blockIdx: null };
  }

  /* ── Rect reading (host elements only) ── */
  function getBlockRect(el) {
    var r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }

  function getScrollRect(el) {
    return el.getBoundingClientRect();
  }

  /* ── Viewport dimensions ── */
  function getViewportWidth() {
    return document.documentElement.clientWidth;
  }

  function getViewportHeight() {
    return document.documentElement.clientHeight;
  }

  /* ── Attribute access ── */
  function getMessageId(el) {
    return el.getAttribute('data-message-id');
  }

  /* ── Scroll navigation ── */
  function scrollTo(el, top) {
    el.scrollTop = top;
  }

  function getScrollTop(el) {
    return el.scrollTop;
  }

  function getScrollHeight(el) {
    return el.scrollHeight;
  }

  function getClientHeight(el) {
    return el.clientHeight;
  }

  function getMaxScroll(el) {
    return el.scrollHeight - el.clientHeight;
  }

  function clampScroll(el, top) {
    var max = el.scrollHeight - el.clientHeight;
    el.scrollTop = Math.max(0, Math.min(max, top));
  }

  /* ── Flare animation on host block elements ── */
  function applyFlare(el) {
    el.style.transition = 'background-color 2s ease-out';
    el.style.backgroundColor = 'rgba(66, 133, 244, 0.4)';
  }

  function clearFlare(el) {
    el.style.transition = '';
    el.style.backgroundColor = '';
  }

  /* ── Input element detection ── */
  function getInputElement() {
    return resolveSelector(INPUT_SELECTORS);
  }

  /* ── Send button detection ── */
  function getSendButton() {
    return resolveSelector(SEND_BUTTON_SELECTORS);
  }

  /* ── Health report — audits all selector groups, returns match/total ── */
  function getHealthReport() {
    var report = {};
    var groups = [
      ['scrollContainer', SCROLL_SELECTORS],
      ['userIndicators', USER_INDICATORS],
      ['msgSelectors', MSG_SELECTORS],
      ['contentSelectors', CONTENT_SELECTORS],
      ['input', INPUT_SELECTORS],
      ['sendButton', SEND_BUTTON_SELECTORS]
    ];
    for (var g = 0; g < groups.length; g++) {
      var label = groups[g][0];
      var selectors = groups[g][1];
      var matched = 0;
      for (var i = 0; i < selectors.length; i++) {
        if (document.querySelector(selectors[i])) matched++;
      }
      report[label] = { matched: matched, total: selectors.length };
    }
    return report;
  }

  /* ── Health check — verifies expected host DOM structure exists ── */
  function checkHealth() {
    var sc = findScrollContainer();
    if (!sc || sc === document.body) return true;
    var msgs = getMessageElements(sc);
    return msgs.length > 0;
  }

  function isStreaming(scrollEl) {
    var stopBtn = document.querySelector('button[aria-label="Stop response"], button[aria-label*="Stop"]');
    if (stopBtn) return true;

    var target = scrollEl || findScrollContainer();
    if (!target) return false;

    if (target.querySelector('model-response .typing-cursor, .model-response .typing-cursor')) {
      return true;
    }

    var busy = target.querySelector(
      'model-response[aria-busy="true"], .model-response[aria-busy="true"], [aria-busy="true"] model-response, [aria-busy="true"] .model-response'
    );
    if (busy) return true;

    return false;
  }

  /* ── Extract character/token usage info from model-response footer ──
     Usage footers appear at the very end of a model-response, in their own
     element (so they follow the last newline in textContent). We restrict
     the search to the last 200 chars AND require the match to be after the
     last newline to avoid matching prose content mentioning "characters". */
  function extractUsageInfo(respEl) {
    if (!respEl || !respEl.textContent) return null;
    var text = respEl.textContent;
    var tail = text.length > 200 ? text.slice(-200) : text;
    var lastNewline = tail.lastIndexOf('\n');
    if (lastNewline < 0) return null;
    var searchZone = tail.slice(lastNewline);
    var m = searchZone.match(/([\d,]+)\s*\/\s*([\d,]+)\s*(?:characters|tokens)/i);
    if (m) return { inputChars: parseInt(m[1].replace(/,/g, ''), 10), outputChars: parseInt(m[2].replace(/,/g, ''), 10) };
    m = searchZone.match(/([\d,]+)\s*(?:characters|tokens)/i);
    if (m) return { inputChars: parseInt(m[1].replace(/,/g, ''), 10), outputChars: null };
    return null;
  }

  /* ── Watch for scroll container to appear (Angular async hydration) ── */
  var WATCH_TIMEOUT = 30000;

  function watchScrollContainer(callback) {
    if (findScrollContainer()) {
      setTimeout(callback, 0);
      return;
    }
    var observer = new MutationObserver(function() {
      if (findScrollContainer()) {
        observer.disconnect();
        clearTimeout(timer);
        callback();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    var timer = setTimeout(function() {
      observer.disconnect();
      console.warn('[CA] Scroll container not found within ' + (WATCH_TIMEOUT / 1000) + 's');
    }, WATCH_TIMEOUT);
  }

  if (typeof window !== 'undefined') {
    window.__ca = window.__ca || {};
    window.__ca.hostAdapter = {
    findScrollContainer: findScrollContainer,
    getMessageElements: getMessageElements,
    isUserMessage: isUserMessage,
    getContentEl: getContentEl,
    getContentBlocks: getContentBlocks,
    findBlockElement: findBlockElement,
    getBlockIndex: getBlockIndex,
    getNormalizedStartNode: getNormalizedStartNode,
    resolveAnchorBlock: resolveAnchorBlock,
    getBlockRect: getBlockRect,
    getScrollRect: getScrollRect,
    getViewportWidth: getViewportWidth,
    getViewportHeight: getViewportHeight,
    getMessageId: getMessageId,
    scrollTo: scrollTo,
    getScrollTop: getScrollTop,
    getScrollHeight: getScrollHeight,
    getClientHeight: getClientHeight,
    getMaxScroll: getMaxScroll,
    clampScroll: clampScroll,
    applyFlare: applyFlare,
    clearFlare: clearFlare,
    checkHealth: checkHealth,
    getHealthReport: getHealthReport,
    getInputElement: getInputElement,
    getSendButton: getSendButton,
    resolveSelector: resolveSelector,
    resolveNodeSelector: resolveNodeSelector,
    isStreaming: isStreaming,
    extractUsageInfo: extractUsageInfo,
    watchScrollContainer: watchScrollContainer
  };
  }
})();
