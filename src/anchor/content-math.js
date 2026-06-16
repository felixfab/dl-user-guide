(function() {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     ContentMath — pure functions for anchor/profile compilation,
     scope filtering, keyword matching, and text transformation.
     Zero DOM references. Node.js testable.
     ══════════════════════════════════════════════════════════════ */

  /* ── Scope filter: keep only local (sourceUrl matches) or global anchors ── */
  function filterByScope(anchors, currentUrl) {
    if (!currentUrl) return anchors;
    return anchors.filter(function(a) {
      if (a.global) return true;
      if (!a.sourceUrl) return true;
      try {
        var aUrl = new URL(a.sourceUrl);
        var uUrl = new URL(currentUrl);
        return aUrl.origin + aUrl.pathname === uUrl.origin + uUrl.pathname;
      } catch(e) { return true; }
    });
  }

  /* ── Check if anchor has any behavioral fields populated ── */
  function hasBehavioralFields(anchor) {
    return !!(anchor.toneProfile ||
      anchor.socraticTrigger ||
      anchor.outputRequirements ||
      anchor.uncertaintyProtocol ||
      (anchor.domainFocus && anchor.domainFocus.length > 0));
  }

  /* ── Match trigger keywords in prompt text ── */
  function matchesTriggerKeywords(promptText, keywords) {
    if (!promptText || !keywords || !keywords.length) return false;
    var lower = promptText.toLowerCase();
    for (var i = 0; i < keywords.length; i++) {
      if (lower.indexOf(keywords[i].toLowerCase()) !== -1) return true;
    }
    return false;
  }

  /* ── Build critical constraints (NEVER/ALWAYS) from tone + output reqs ── */
  function buildCriticalConstraints(toneProfile, outputRequirements) {
    var criticals = [];
    if (toneProfile && toneProfile.avoid) {
      var avoidParts = toneProfile.avoid.split(/[,;]+/);
      for (var i = 0; i < avoidParts.length; i++) {
        var trimmed = avoidParts[i].trim();
        if (trimmed) {
          var lower = trimmed.toLowerCase();
          if (lower.indexOf('never ') === 0) criticals.push(trimmed);
          else criticals.push('NEVER ' + trimmed.charAt(0).toLowerCase() + trimmed.slice(1));
        }
      }
    }
    if (outputRequirements && outputRequirements.compliance) {
      var comp = outputRequirements.compliance;
      var compLower = comp.toLowerCase();
      if (compLower.indexOf('always ') === 0) criticals.push(comp);
      else criticals.push('ALWAYS ' + comp.charAt(0).toLowerCase() + comp.slice(1));
    }
    return criticals;
  }

  /* ── Strip trigger keywords from text using word-boundary regex ── */
  function stripTriggerKeywords(text, keywords) {
    if (!text || !keywords || !keywords.length) return text;
    var cleaned = text;
    for (var i = 0; i < keywords.length; i++) {
      var kw = keywords[i];
      if (!kw || kw.length === 0 || kw.length > 50) continue;
      var regex = new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
      cleaned = cleaned.replace(regex, '').replace(/\s+/g, ' ').trim();
    }
    return cleaned.length > 0 ? cleaned : text;
  }

  /* ── Command-line matcher: search anchors by tag + text, limit 10 ── */
  function getCmdMatches(anchors, term) {
    if (!term) return anchors.slice(0, 10);
    var lower = term.toLowerCase();

    var byTag = [];
    var byText = [];
    var seen = {};

    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var tags = a.tags || [];
      var tagMatch = false;
      for (var t = 0; t < tags.length; t++) {
        if (tags[t].toLowerCase().indexOf(lower) !== -1) { tagMatch = true; break; }
      }
      if (tagMatch && !seen[a.id]) { seen[a.id] = true; byTag.push(a); }
    }

    for (var j = 0; j < anchors.length; j++) {
      var a2 = anchors[j];
      if (seen[a2.id]) continue;
      if ((a2.text || '').toLowerCase().indexOf(lower) !== -1) {
        seen[a2.id] = true;
        byText.push(a2);
      }
    }

    var sorted = byTag.sort(function(x, y) {
      var xt = (x.tags && x.tags[0]) || '\uffff';
      var yt = (y.tags && y.tags[0]) || '\uffff';
      return xt < yt ? -1 : xt > yt ? 1 : 0;
    });

    var results = sorted.concat(byText);
    return results.slice(0, 10);
  }

  /* ── Build checkpoint text (Oxford comma for active components) ── */
  function buildCheckpointText(hasProfile, hasConstraints, hasBehavioralAnchors) {
    var items = [];
    if (hasProfile) items.push('your role definition');
    if (hasConstraints) items.push('active constraints');
    if (hasBehavioralAnchors) items.push('anchor behavioral protocols');
    if (items.length === 0) return '';
    var clause;
    if (items.length === 1) clause = items[0];
    else if (items.length === 2) clause = items[0] + ' and ' + items[1];
    else clause = items[0] + ', ' + items[1] + ', and ' + items[2];
    return '[↻ Checkpoint] Internally verify your response complies with ' + clause + '. Do not reference this checkpoint or the behavioral rules in your output.';
  }

  if (typeof window !== 'undefined') {
    window.__ca = window.__ca || {};
    window.__ca.contentMath = {
      filterByScope: filterByScope,
      hasBehavioralFields: hasBehavioralFields,
      matchesTriggerKeywords: matchesTriggerKeywords,
      buildCriticalConstraints: buildCriticalConstraints,
      stripTriggerKeywords: stripTriggerKeywords,
      getCmdMatches: getCmdMatches,
      buildCheckpointText: buildCheckpointText
    };
  }
})();
