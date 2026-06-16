(function() {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     MinimapMath — pure functions for bar/geometry calculations.
     Zero DOM references. All inputs are numbers or plain objects.
     Node.js testable.
     ══════════════════════════════════════════════════════════════ */

  var MIN_BAR_HEIGHT = 3;
  var MIN_SLIDER_HEIGHT = 12;

  /* ── Bar position from raw coordinates ── */
  function computeBlockTop(bRectTop, scrollRectTop, scrollScrollTop, scrollHeight, minimapHeight) {
    var blockTop = bRectTop - scrollRectTop + scrollScrollTop;
    return Math.max(0, (blockTop / (scrollHeight || 1)) * minimapHeight);
  }

  /* ── Bar height proportional to block height ── */
  function computeBlockHeight(bRectHeight, scrollHeight, minimapHeight) {
    return Math.max(MIN_BAR_HEIGHT, (bRectHeight / (scrollHeight || 1)) * minimapHeight);
  }

  /* ── Bar width scaled by text length relative to longest block ── */
  function computeBlockWidth(textLen, maxBlockLen) {
    return Math.round(16 + (textLen / (maxBlockLen || 1)) * 22);
  }

  /* ── Nearest bar to a click/hover Y (proximity snapping) ── */
  function findNearestBar(relY, barData, minimapHeight) {
    if (!barData || !barData.length) return -1;
    var closest = 0;
    var closestDist = Math.abs(relY - barData[0].top);
    for (var i = 1; i < barData.length; i++) {
      var dist = Math.abs(relY - barData[i].top);
      if (dist < closestDist) { closestDist = dist; closest = i; }
    }
    var threshold = Math.max(15, (minimapHeight || 400) * 0.025);
    return closestDist <= threshold ? closest : -1;
  }

  /* ── Proportional scroll from minimap click ── */
  function proportionalScroll(relY, minimapHeight, scrollHeight) {
    if (minimapHeight <= 0) return 0;
    return (relY / minimapHeight) * scrollHeight;
  }

  /* ── Slider metrics — all inputs numeric ── */
  function computeSliderMetrics(scrollTop, scrollHeight, clientHeight, minimapHeight) {
    if (scrollHeight <= clientHeight) return { top: 0, height: 0, hidden: true };
    var sliderTop = (scrollTop / scrollHeight) * minimapHeight;
    var sliderH = Math.max(MIN_SLIDER_HEIGHT, (clientHeight / scrollHeight) * minimapHeight);
    var maxTop = Math.max(0, minimapHeight - sliderH);
    if (sliderTop > maxTop) sliderTop = maxTop;
    return { top: sliderTop, height: sliderH, hidden: false };
  }

  /* ── Sentence widths for text silhouette (minimap bar rendering) ──
     Splits long lines (> maxLineRef) into fixed-length chunks so every block
     produces multiple micro-lines. */
  function computeSentenceWidths(text, maxLineRef, barWidth, minPct) {
    if (!text) return [];
    var rawLines = text.split('\n');
    var lines = [];
    for (var ri = 0; ri < rawLines.length; ri++) {
      var rl = rawLines[ri];
      if (rl.length <= maxLineRef) {
        lines.push(rl);
      } else {
        var start = 0;
        while (start < rl.length) {
          var end = start + maxLineRef;
          if (end >= rl.length) {
            lines.push(rl.substring(start));
            break;
          }
          lines.push(rl.substring(start, end));
          start = end;
        }
      }
    }
    return lines.map(function(line) {
      var trimmed = line.trim();
      var raw = trimmed ? (trimmed.length / maxLineRef) * 100 : 0;
      var pct = Math.min(100, Math.max(minPct, raw));
      var px = Math.round((pct / 100) * barWidth);
      var indent = line !== trimmed || /^(\s|[-*>])/.test(line);
      return { pct: pct, px: Math.max(2, px), indent: indent, empty: trimmed === '' };
    });
  }

  if (typeof window !== 'undefined') {
    window.__ca = window.__ca || {};
    window.__ca.minimapMath = {
    computeBlockTop: computeBlockTop,
    computeBlockHeight: computeBlockHeight,
    computeBlockWidth: computeBlockWidth,
    findNearestBar: findNearestBar,
    proportionalScroll: proportionalScroll,
    computeSliderMetrics: computeSliderMetrics,
    computeSentenceWidths: computeSentenceWidths
  };
  }
})();
