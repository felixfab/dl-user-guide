(function() {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     TimelineMath — pure functions for anchoring, grouping, sorting,
     and time-formatting. Zero DOM references. Node.js testable.
     ══════════════════════════════════════════════════════════════ */

  /* ── Relative time formatting ── */
  function relativeTime(timestamp, now) {
    now = now || Date.now();
    var diff = now - timestamp;
    var minutes = Math.floor(diff / 60000);
    var hours = Math.floor(diff / 3600000);
    var days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return minutes + 'm ago';
    if (hours < 24) return hours + 'h ago';
    if (days < 30) return days + 'd ago';
    return Math.floor(days / 30) + 'mo ago';
  }

  /* ── Group bucket utility ── */
  function addToGroup(groups, key, anchor) {
    if (!groups[key]) groups[key] = [];
    groups[key].push(anchor);
  }

  /* ── Day-based grouping (Today / Yesterday / This Week / Last Week / Older) ── */
  function groupByDay(anchors, groups, now, dateKeyFor) {
    now = now || new Date();
    dateKeyFor = dateKeyFor || function(ts) {
      var d = new Date(ts);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    };
    var todayStart = dateKeyFor(now);
    var yesterdayStart = todayStart - 86400000;
    var dayOfWeek = now.getDay() || 7;
    var weekStart = todayStart - (dayOfWeek - 1) * 86400000;
    var lastWeekStart = weekStart - 7 * 86400000;

    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var ts = a.lastUsed || a.createdAt;
      var dateDay = dateKeyFor(new Date(ts));

      if (dateDay >= todayStart) {
        addToGroup(groups, 'Today', a);
      } else if (dateDay >= yesterdayStart) {
        addToGroup(groups, 'Yesterday', a);
      } else if (dateDay >= weekStart) {
        addToGroup(groups, 'This Week', a);
      } else if (dateDay >= lastWeekStart) {
        addToGroup(groups, 'Last Week', a);
      } else {
        addToGroup(groups, 'Older', a);
      }
    }
  }

  /* ── Week-based grouping (by Monday label) ── */
  function groupByWeek(anchors, groups) {
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var ts = a.lastUsed || a.createdAt;
      var d = new Date(ts);
      var dow = d.getDay() || 7;
      var monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow + 1);
      var key = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      addToGroup(groups, key, a);
    }
  }

  /* ── Filter cascade (active / expiring / inactive / expired / global) ── */
  function filterAnchors(anchors, filterKey, expiringThreshold) {
    expiringThreshold = expiringThreshold || 3;
    if (filterKey === 'active') {
      return anchors.filter(function(a) { return a.active && a.turnsRemaining > 0; });
    }
    if (filterKey === 'expiring') {
      return anchors.filter(function(a) { return a.active && a.turnsRemaining > 0 && a.turnsRemaining <= expiringThreshold; });
    }
    if (filterKey === 'inactive') {
      return anchors.filter(function(a) { return !a.active; });
    }
    if (filterKey === 'expired') {
      return anchors.filter(function(a) { return a.turnsRemaining === 0; });
    }
    if (filterKey === 'global') {
      return anchors.filter(function(a) { return a.global; });
    }
    return anchors;
  }

  /* ── Sort cascade (newest / most-used / least-remaining / recently-used) ── */
  function sortAnchors(anchors, sortKey) {
    if (sortKey === 'newest') {
      return anchors.slice().sort(function(a, b) { return b.order - a.order; });
    }
    if (sortKey === 'most-used') {
      return anchors.slice().sort(function(a, b) { return (b.usageCount || 0) - (a.usageCount || 0); });
    }
    if (sortKey === 'least-remaining') {
      return anchors.slice().sort(function(a, b) { return a.turnsRemaining - b.turnsRemaining; });
    }
    // 'recently-used' (default)
    return anchors.slice().sort(function(a, b) { return (b.lastUsed || b.createdAt) - (a.lastUsed || b.createdAt); });
  }

  /* ── Stats aggregation — returns { total, active, expired, consumed } ── */
  function computeStats(anchors) {
    var total = anchors.length;
    var activeCount = 0;
    var expiredCount = 0;
    var consumed = 0;
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      if (a.active && a.turnsRemaining > 0) activeCount++;
      if (a.turnsRemaining === 0) expiredCount++;
      consumed += (a.totalTurnsConsumed || 0);
    }
    return { total: total, active: activeCount, expired: expiredCount, consumed: consumed };
  }

  if (typeof window !== 'undefined') {
    window.__ca = window.__ca || {};
    window.__ca.timelineMath = {
      relativeTime: relativeTime,
      addToGroup: addToGroup,
      groupByDay: groupByDay,
      groupByWeek: groupByWeek,
      filterAnchors: filterAnchors,
      sortAnchors: sortAnchors,
      computeStats: computeStats
    };
  }
})();
