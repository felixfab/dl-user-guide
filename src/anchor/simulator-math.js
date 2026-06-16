(function() {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     SimulatorMath — pure functions for keyword matching, keyword
     stripping, anchor behavior block compilation, and injection
     block assembly. Zero DOM references. Node.js testable.
     ══════════════════════════════════════════════════════════════ */

  /* ── Compile a single anchor's behavioral fields into XML block ── */
  function compileBehaviorBlock(anchor) {
    if (!anchor) return null;
    var lines = ['<system_instruction>', ''];
    var hasContent = false;
    if (anchor.domainFocus && anchor.domainFocus.length > 0) {
      lines.push('## Domain Scope');
      lines.push('<domain_scope>' + anchor.domainFocus.join(', ') + '</domain_scope>');
      lines.push('');
      hasContent = true;
    }
    if (anchor.toneProfile && (anchor.toneProfile.tone || anchor.toneProfile.avoid)) {
      lines.push('## Style & Tone');
      if (anchor.toneProfile.tone) lines.push('- Tone: ' + anchor.toneProfile.tone);
      if (anchor.toneProfile.avoid) lines.push('- Avoid: ' + anchor.toneProfile.avoid);
      lines.push('');
      hasContent = true;
    }
    var criticals = [];
    if (anchor.toneProfile && anchor.toneProfile.avoid) {
      var avoidParts = anchor.toneProfile.avoid.split(/[,;]+/);
      for (var av = 0; av < avoidParts.length; av++) {
        var trimmed = avoidParts[av].trim();
        if (trimmed) {
          var lower = trimmed.toLowerCase();
          if (lower.indexOf('never ') === 0) criticals.push(trimmed);
          else criticals.push('NEVER ' + trimmed.charAt(0).toLowerCase() + trimmed.slice(1));
        }
      }
    }
    if (anchor.outputRequirements && anchor.outputRequirements.compliance) {
      var comp = anchor.outputRequirements.compliance;
      var compLower = comp.toLowerCase();
      if (compLower.indexOf('always ') === 0) criticals.push(comp);
      else criticals.push('ALWAYS ' + comp.charAt(0).toLowerCase() + comp.slice(1));
    }
    if (criticals.length > 0) {
      lines.push('### CRITICAL CONSTRAINTS');
      for (var ci = 0; ci < criticals.length; ci++) {
        lines.push((ci + 1) + '. ' + criticals[ci]);
      }
      lines.push('');
      hasContent = true;
    }
    var guardrails = [];
    if (anchor.socraticTrigger) guardrails.push(anchor.socraticTrigger);
    if (anchor.uncertaintyProtocol) guardrails.push(anchor.uncertaintyProtocol);
    if (guardrails.length > 0) {
      lines.push('## Execution Guardrails');
      for (var gi = 0; gi < guardrails.length; gi++) {
        lines.push((gi + 1) + '. ' + guardrails[gi]);
      }
      lines.push('');
      hasContent = true;
    }
    var fmt = anchor.outputRequirements && anchor.outputRequirements.format;
    var clarity = anchor.outputRequirements && anchor.outputRequirements.clarity;
    if (fmt || clarity) {
      lines.push('## Output Structure');
      if (fmt) lines.push('- Format: ' + fmt);
      if (clarity) lines.push('- Verbosity: ' + clarity);
      lines.push('');
      hasContent = true;
    }
    lines.push('</system_instruction>');
    return hasContent ? lines.join('\n') : null;
  }

  /* ── Match keywords in text → { matchedAnchors, detectedKeywords } ── */
  function matchKeywords(anchors, text) {
    var matched = [];
    var keywords = [];
    var promptLower = (text && text.length > 0) ? text.toLowerCase() : '';

    for (var i = 0; i < anchors.length; i++) {
      var item = anchors[i];
      if (!item.triggerKeywords || item.triggerKeywords.length === 0) continue;
      for (var k = 0; k < item.triggerKeywords.length; k++) {
        var kw = item.triggerKeywords[k];
        if (kw && promptLower.indexOf(kw.toLowerCase()) !== -1) {
          matched.push(item);
          keywords.push(kw);
          break;
        }
      }
    }
    return { matchedAnchors: matched, detectedKeywords: keywords };
  }

  /* ── Strip matched keywords from text ── */
  function stripKeywords(text, matchedAnchors) {
    if (!text || !matchedAnchors || matchedAnchors.length === 0) return text;
    var cleaned = text;
    for (var i = 0; i < matchedAnchors.length; i++) {
      var item = matchedAnchors[i];
      if (!item.triggerKeywords) continue;
      for (var k = 0; k < item.triggerKeywords.length; k++) {
        var kw = item.triggerKeywords[k];
        if (!kw || kw.length === 0 || kw.length > 50) continue;
        var regex = new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
        cleaned = cleaned.replace(regex, '').replace(/\s+/g, ' ').trim();
      }
    }
    return cleaned.length > 0 ? cleaned : text;
  }

  /* ── Assemble full injection block from matched anchors ── */
  function compileInjectionBlock(matchedAnchors) {
    var blocks = [];
    var behaviorBlocks = [];
    for (var i = 0; i < matchedAnchors.length; i++) {
      var bb = compileBehaviorBlock(matchedAnchors[i]);
      if (bb) behaviorBlocks.push(bb);
    }
    if (behaviorBlocks.length > 0) blocks.push(behaviorBlocks.join('\n\n'));
    var anchorTexts = [];
    for (var j = 0; j < matchedAnchors.length; j++) {
      anchorTexts.push(matchedAnchors[j].text);
    }
    if (anchorTexts.length > 0) blocks.push(anchorTexts.join('\n\n'));
    return blocks.join('\n\n');
  }

  if (typeof window !== 'undefined') {
    window.__ca = window.__ca || {};
    window.__ca.simulatorMath = {
      compileBehaviorBlock: compileBehaviorBlock,
      matchKeywords: matchKeywords,
      stripKeywords: stripKeywords,
      compileInjectionBlock: compileInjectionBlock
    };
  }
})();
