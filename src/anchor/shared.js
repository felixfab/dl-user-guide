(function() {
  'use strict';

  // ============================================================
  // PHASE 1: Synchronous — initialize namespace immediately
  // so all other scripts (loaded at document_start) can depend
  // on window.__ca.events, esc/escAttr, and window.__ca.state
  // without entering infinite retry loops.
  // ============================================================

  window.__ca = window.__ca || {};

  // --- Event system (synchronous, no DOM needed) ---
  var eventListeners = {};

  function eventOn(event, fn) {
    if (!eventListeners[event]) eventListeners[event] = [];
    eventListeners[event].push(fn);
  }

  function eventOff(event, fn) {
    if (!eventListeners[event]) return;
    if (!fn) {
      eventListeners[event] = [];
      return;
    }
    eventListeners[event] = eventListeners[event].filter(function(l) { return l !== fn; });
  }

  function eventEmit(event, data) {
    if (!eventListeners[event]) return;
    for (var i = 0; i < eventListeners[event].length; i++) {
      eventListeners[event][i](data);
    }
  }

  window.__ca.events = { on: eventOn, off: eventOff, emit: eventEmit };

  // --- XSS sanitizers (synchronous, pure functions) ---
  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escAttr(val) {
    if (val == null) return '';
    return String(val).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

function formatTTL(minutes) {
  if (minutes === null || minutes === undefined) return null;
  if (minutes < 60) return minutes + 'm';
  if (minutes < 1440) {
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
  }
  var d = Math.floor(minutes / 1440);
  var rh = Math.floor((minutes % 1440) / 60);
  return rh > 0 ? d + 'd ' + rh + 'h' : d + 'd';
}

  function dateKeyFor(ts) {
    var d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function simpleHash(str, hexLen) {
    hexLen = hexLen || 6;
    var hash = 5381;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    var result = (hash >>> 0).toString(16);
    if (hexLen > 8) {
      var hash2 = 709607;
      for (var i = 0; i < str.length; i++) {
        hash2 = ((hash2 << 5) + hash2) + str.charCodeAt(i);
        hash2 = hash2 & hash2;
      }
      result += (hash2 >>> 0).toString(16);
    }
    return result.slice(0, hexLen).padStart(hexLen, '0');
  }

  function findMessageContext(node) {
    var current = (node && node.nodeType === Node.ELEMENT_NODE) ? node : (node && node.parentElement);
    while (current && current !== document.body) {
      if (current.hasAttribute && current.hasAttribute('data-message-id')) {
        return current.getAttribute('data-message-id');
      }
      if (current.tagName === 'USER-QUERY' || current.tagName === 'MODEL-RESPONSE') {
        var textLen = (current.textContent || '').length;
        return current.tagName + '-' + simpleHash(window.location.href, 6) + '-' + textLen + '-' + simpleHash('msg-' + textLen, 6);
      }
      current = current.parentElement;
    }
    return null;
  }

  function buildTagGroupHeader(label, isCollapsed, count) {
    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;
    var header = $create('div', {
      className: 'ca-cmd-group-header' + (isCollapsed ? ' collapsed' : ''),
      'data-action': 'tag-popup-toggle-group',
      'data-group': label
    });
    header.appendChild($create('span', {
      className: 'ca-cmd-group-label',
      textContent: esc((isCollapsed ? '\u25B8 ' : '\u25BE ') + label)
    }));
    header.appendChild($create('span', {
      className: 'ca-cmd-group-count',
      textContent: esc(count)
    }));
    return header;
  }

  function appendTagChips(container, tags, maxTags) {
    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;
    maxTags = maxTags || 2;
    if (!tags || !tags.length) return;
    var shown = 0;
    for (var t = 0; t < tags.length && shown < maxTags; t++) {
      container.appendChild($create('span', {
        className: 'ca-cmd-tag',
        textContent: esc(tags[t])
      }));
      shown++;
    }
    if (tags.length > maxTags) {
      container.appendChild($create('span', {
        className: 'ca-cmd-tag ca-cmd-tag-overflow',
        textContent: '+' + (tags.length - maxTags)
      }));
    }
  }

  // --- Platform detection (synchronous, no DOM needed) ---
  function detectPlatform() {
    return 'gemini';
  }

  // --- Session ID extraction (synchronous, no DOM needed) ---
  function extractGeminiSessionId() {
    var m = window.location.pathname.match(/\/(?:c|app|chat)(?:\/chat)?\/([a-zA-Z0-9_-]+)$/);
    return m ? m[1] : null;
  }

  function buildExportMeta() {
    var sessionId = extractGeminiSessionId();
    return {
      version: chrome.runtime.getManifest().version,
      exportTimestamp: Date.now(),
      sessionId: sessionId || '',
      sessionUrl: sessionId ? window.location.href : ''
    };
  }

  // --- Shared state (synchronous) ---
  window.__ca.state = { theme: 'dark', panelOpen: false, anchors: [], health: 'offline', expiringThreshold: 3, bulk: { enabled: false, selectedIds: [], entityType: 'anchor' }, constraints: { activeIds: [], sessionId: null }, profileSystemInstruction: null, dashboard: { isOpen: false }, analytics: { prompts: 0, turns: [], sessionId: null } };
  window.__ca.detectPlatform = detectPlatform;

  // ============================================================
  // PHASE 2: Deferred — create Shadow DOM and DOM-dependent
  // utilities. These need the document body to exist, so they
  // run on DOMContentLoaded (or immediately if already ready).
  // ============================================================

  function createRoot() {
    try {
      var root = document.createElement('div');
      root.id = 'ca-root';
      root.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;';
      document.documentElement.appendChild(root);
      root.setAttribute('platform', detectPlatform());

      var shadow = root.attachShadow({ mode: 'closed' });

      window.__ca.ROOT = shadow;
      window.__ca.HOST = root;

      function $id(id) { return shadow.getElementById(id); }
      function $one(sel) { return shadow.querySelector(sel); }

      function $create(tag, attrs, children) {
        var el = document.createElement(tag);
        if (attrs) {
          for (var key in attrs) {
            if (attrs.hasOwnProperty(key)) {
              if (key === 'className') {
                el.className = attrs[key];
              } else if (key === 'textContent') {
                el.textContent = attrs[key];
              } else if (key === 'style' && typeof attrs[key] === 'object') {
                Object.assign(el.style, attrs[key]);
              } else if (key.indexOf('on') === 0) {
                el.addEventListener(key.substring(2).toLowerCase(), attrs[key]);
              } else {
                el.setAttribute(key, attrs[key]);
              }
            }
          }
        }
        if (children) {
          for (var i = 0; i < children.length; i++) {
            if (children[i]) {
              if (typeof children[i] === 'string') {
                el.appendChild(document.createTextNode(children[i]));
              } else {
                el.appendChild(children[i]);
              }
            }
          }
        }
        return el;
      }

      function $append(el) {
        shadow.appendChild(el);
      }

      function $icon(viewBox, paths) {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', viewBox);
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        for (var i = 0; i < paths.length; i++) {
          var el = document.createElementNS('http://www.w3.org/2000/svg', paths[i].tag);
          for (var key in paths[i].attrs) {
            el.setAttribute(key, paths[i].attrs[key]);
          }
          svg.appendChild(el);
        }
        return svg;
      }

      var style = document.createElement('style');
      $append(style);
      try {
        fetch(chrome.runtime.getURL('src/anchor/anchor.css'))
          .then(function(r) { return r.text(); })
          .then(function(css) { style.textContent = css; })
          .catch(function() {});
      } catch(e) {}

      function detectTheme() {
        var pref = window.__ca.storage && window.__ca.storage.getSetting('theme');
        if (pref === 'dark') return 'dark';
        if (pref === 'light') return 'light';
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }

      window.__ca.shared = {
        esc: esc,
        escAttr: escAttr,
        formatTTL: formatTTL,
        dateKeyFor: dateKeyFor,
        simpleHash: simpleHash,
        findMessageContext: findMessageContext,
        buildTagGroupHeader: buildTagGroupHeader,
        appendTagChips: appendTagChips,
        detectPlatform: detectPlatform,
        extractGeminiSessionId: extractGeminiSessionId,
        buildExportMeta: buildExportMeta,
        $id: $id,
        $one: $one,
        $create: $create,
        $append: $append,
        $icon: $icon,
        detectTheme: detectTheme
      };
    } catch(e) {
      console.error('[CA] ERROR:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createRoot);
  } else {
    createRoot();
  }
})();
