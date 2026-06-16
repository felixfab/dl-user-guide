(function() {
  'use strict';

  /* ==================================================================
     DashboardMath — pure functions for token estimation, TTL decay,
     context health scoring, and session stat aggregation.
     Zero DOM references. Node.js testable.
     ================================================================== */

  /* ── Token estimation: text length (chars) (div) tokens-per-char ── */
  function estimateTokens(text, isCode) {
    if (typeof text !== 'string' || !text) return 0;
    var divisor = isCode ? 2.5 : 4;
    return Math.ceil(text.length / divisor);
  }

  /* ── Anchor TTL percentage from turnsRemaining vs originalTurns ── */
  function calculateTTL(anchor) {
    if (!anchor) return 100;
    var remaining = anchor.turnsRemaining;
    if (typeof remaining !== 'number') return 100;
    var total = anchor.originalTurns || anchor.turnsTotal || 1;
    var pct = Math.max(0, (remaining / (total || 1)) * 100);
    return Math.min(100, Math.round(pct));
  }

  /* ── Aggregate context health (average of all anchor TTLs) ── */
  function computeAnchorHealth(ttlValues) {
    if (!ttlValues || !ttlValues.length) return 100;
    var sum = 0;
    for (var i = 0; i < ttlValues.length; i++) {
      sum += ttlValues[i].ttl;
    }
    return Math.round(sum / ttlValues.length);
  }

  /* ── Session stats from turn ledger ── */
  function computeSessionStats(turns) {
    if (!turns || !turns.length) {
      return {
        prompts: 0,
        turns: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        healthPct: 100
      };
    }
    var inputSum = 0;
    var outputSum = 0;
    for (var i = 0; i < turns.length; i++) {
      inputSum += turns[i].inputTokens || 0;
      outputSum += turns[i].outputTokens || 0;
    }
    return {
      prompts: turns.length,
      turns: turns.length,
      inputTokens: inputSum,
      outputTokens: outputSum,
      totalTokens: inputSum + outputSum,
      healthPct: 100
    };
  }

  if (typeof window !== 'undefined') {
    window.__ca = window.__ca || {};
    window.__ca.dashboardMath = {
      estimateTokens: estimateTokens,
      calculateTTL: calculateTTL,
      computeAnchorHealth: computeAnchorHealth,
      computeSessionStats: computeSessionStats
    };
  }
})();