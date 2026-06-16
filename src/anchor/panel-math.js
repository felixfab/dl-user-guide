(function() {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     PanelMath — pure utility functions for panel filtering, sorting,
     grouping, validation, and anchor predicates. Zero DOM references.
     Node.js testable. Replaces duplicated inline logic in panel.js.
     ══════════════════════════════════════════════════════════════ */

  /* ── Sort comparators ── */
  function compareByCreatedAtDesc(a, b) {
    return b.createdAt - a.createdAt;
  }

  function compareByUsageCountDesc(a, b) {
    return (b.usageCount || 0) - (a.usageCount || 0);
  }

  function compareTagKeyUntaggedLast(a, b) {
    if (a === 'Untagged') return 1;
    if (b === 'Untagged') return -1;
    return a.toLowerCase().localeCompare(b.toLowerCase());
  }

  /* ── Filter predicates ── */
  function isActiveAnchor(a) {
    return a.active && a.turnsRemaining > 0;
  }

  function isInactiveAnchor(a) {
    return !a.active || a.turnsRemaining === 0;
  }

  function isExpiredAnchor(a) {
    return a.turnsRemaining === 0;
  }

  function isGlobalAnchor(a) {
    return !!a.global;
  }

  /* ── Search filter (case-insensitive match on text/name/description) ── */
  function applySearchFilter(items, search) {
    if (!search) return items;
    var term = search.toLowerCase();
    return items.filter(function(item) {
      return (item.text && item.text.toLowerCase().indexOf(term) !== -1) ||
             (item.name && item.name.toLowerCase().indexOf(term) !== -1) ||
             (item.description && item.description.toLowerCase().indexOf(term) !== -1);
    });
  }

  /* ── Tag-based grouping with deduplication ── */
  function groupByTag(items) {
    var groups = {};
    var seen = {};
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var tags = item.tags || [];
      for (var t = 0; t < tags.length; t++) {
        var key = item.id + '|' + tags[t];
        if (seen[key]) continue;
        seen[key] = true;
        if (!groups[tags[t]]) groups[tags[t]] = [];
        groups[tags[t]].push(item);
      }
      if (tags.length === 0) {
        if (!groups['Untagged']) groups['Untagged'] = [];
        groups['Untagged'].push(item);
      }
    }
    return groups;
  }

  /* ── Anchor schema validation ── */
  function validateAnchorSchema(obj) {
    return obj && typeof obj.id === 'string' && typeof obj.text === 'string' &&
      typeof obj.turnsTotal === 'number' && typeof obj.turnsRemaining === 'number' &&
      typeof obj.active === 'boolean' && typeof obj.createdAt === 'number';
  }

  if (typeof window !== 'undefined') {
    window.__ca = window.__ca || {};
    window.__ca.panelMath = {
      compareByCreatedAtDesc: compareByCreatedAtDesc,
      compareByUsageCountDesc: compareByUsageCountDesc,
      compareTagKeyUntaggedLast: compareTagKeyUntaggedLast,
      isActiveAnchor: isActiveAnchor,
      isInactiveAnchor: isInactiveAnchor,
      isExpiredAnchor: isExpiredAnchor,
      isGlobalAnchor: isGlobalAnchor,
      applySearchFilter: applySearchFilter,
      groupByTag: groupByTag,
      validateAnchorSchema: validateAnchorSchema
    };
  }
})();
