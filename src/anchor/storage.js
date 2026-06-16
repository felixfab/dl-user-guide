(function(root) {
  'use strict';

  var CACHE_KEY = '__ca_anchors_cache';
  var TEMPLATE_KEY = '__ca_templates_cache';
  var SETTINGS_KEY = '__ca_settings';
  var HEATMAP_KEY = '__ca_heatmap';
  var SYNC_HEATMAP_KEY = '__ca_heatmap_sync';
  var BUNDLE_KEY = '__ca_bundles_cache';
  var CONSTRAINT_KEY = '__ca_constraints_cache';
  var ANALYTICS_KEY = '__ca_analytics';
  var PENDING_IMPORT_KEY = '__ca_pending_import';
  var WRITE_DELAY = 500;
  var ACTIVE_SESSION = '';

  function setSessionId(sid) {
    ACTIVE_SESSION = sid || '';
  }

  function sk(key) {
    return ACTIVE_SESSION ? key + '_' + ACTIVE_SESSION : key;
  }
  var DEBOUNCE_TIMER = null;
  var templateDebounceTimer = null;
  var bundleDebounceTimer = null;
  var syncDebounceTimer = null;
  var constraintDebounceTimer = null;
  var analyticsDebounceTimer = null;

  var cache = [];
  var cacheMap = {};
  var activeCache = [];
  var activeCacheDirty = true;
  var tagIndex = {};
  var templateCache = [];
  var settings = { injectionMode: 'prepend', inlineSlash: false, defaultTTL: null, syncHeatmapEnabled: false };
  var heatmapCache = {};
  var analyticsCache = null;
  var bundleCache = [];
  var constraintCache = [];
  var constraintCacheMap = {};
  var profileCache = [];
  var profileCacheMap = {};
  var profileDebounceTimer = null;

  // --- Cache Rebuild Utilities ---

  function rebuildCacheMap() {
    cacheMap = {};
    for (var i = 0; i < cache.length; i++) {
      cacheMap[cache[i].id] = cache[i];
    }
  }

  function rebuildTagIndex() {
    tagIndex = {};
    for (var i = 0; i < cache.length; i++) {
      if (cache[i].tags) {
        for (var j = 0; j < cache[i].tags.length; j++) {
          var t = cache[i].tags[j].toLowerCase();
          if (!tagIndex[t]) tagIndex[t] = [];
          if (tagIndex[t].indexOf(cache[i].id) === -1) tagIndex[t].push(cache[i].id);
        }
      }
    }
    for (var i = 0; i < templateCache.length; i++) {
      if (!templateCache[i].deleted && templateCache[i].tags) {
        for (var j = 0; j < templateCache[i].tags.length; j++) {
          var t = templateCache[i].tags[j].toLowerCase();
          if (!tagIndex[t]) tagIndex[t] = [];
          if (tagIndex[t].indexOf(templateCache[i].id) === -1) tagIndex[t].push(templateCache[i].id);
        }
      }
    }
  }

  function rebuildTemplateTagIndex(tpl) {
    if (!tpl || !tpl.tags) return;
    for (var j = 0; j < tpl.tags.length; j++) {
      var t = tpl.tags[j].toLowerCase();
      if (!tagIndex[t]) tagIndex[t] = [];
      if (tagIndex[t].indexOf(tpl.id) === -1) tagIndex[t].push(tpl.id);
    }
  }

  function rebuildConstraintCacheMap() {
    constraintCacheMap = {};
    for (var i = 0; i < constraintCache.length; i++) {
      constraintCacheMap[constraintCache[i].id] = constraintCache[i];
    }
  }

  // --- ID, Date & Storage Utilities ---

  function dateKey(ts) {
    var d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function generateId() {
    return 'anchor_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  function getStorageKey() {
    return sk(CACHE_KEY);
  }

  // --- Storage Load ---

  function loadFromStorage(callback) {
    var scopedAnchors = getStorageKey();
    var scopedTemplates = sk(TEMPLATE_KEY);
    var scopedHeatmap = sk(HEATMAP_KEY);
    var scopedBundles = sk(BUNDLE_KEY);
    var scopedConstraints = sk(CONSTRAINT_KEY);
    var scopedAnalytics = sk(ANALYTICS_KEY);

    chrome.storage.local.get([scopedAnchors, scopedTemplates, SETTINGS_KEY, scopedHeatmap, scopedBundles, scopedConstraints, scopedAnalytics], function(data) {
      var anchors = data[scopedAnchors] || [];
      var templates = data[scopedTemplates] || [];
      var savedSettings = data[SETTINGS_KEY] || {};
      var savedHeatmap = data[scopedHeatmap] || {};
      var savedBundles = data[scopedBundles] || [];
      var savedConstraints = data[scopedConstraints] || [];
      var savedAnalytics = data[scopedAnalytics] || null;

      function applyLoadedData(continueCb) {
        cache = anchors;
        activeCacheDirty = true;
        rebuildCacheMap();
        rebuildTagIndex();
        templateCache = templates;
        settings = Object.assign(settings, savedSettings);
        heatmapCache = savedHeatmap;
        if (Object.keys(heatmapCache).length > 0) {
          heatmapCache = migrateHeatmapToLocal(heatmapCache);
        }
        for (var mi = 0; mi < cache.length; mi++) {
          if (cache[mi].ttlHours !== undefined) {
            cache[mi].ttlMinutes = cache[mi].ttlHours === null ? null : cache[mi].ttlHours * 60;
            delete cache[mi].ttlHours;
          }
        }
        for (var mj = 0; mj < templates.length; mj++) {
          if (templates[mj].ttlHours !== undefined) {
            templates[mj].ttlMinutes = templates[mj].ttlHours === null ? null : templates[mj].ttlHours * 60;
            delete templates[mj].ttlHours;
          }
          if (!templates[mj].active) templates[mj].active = true;
        }
        bundleCache = savedBundles;
        constraintCache = savedConstraints;
        rebuildConstraintCacheMap();
        analyticsCache = savedAnalytics;

        if (Object.keys(heatmapCache).length === 0 && settings.syncHeatmapEnabled) {
          chrome.storage.sync.get(SYNC_HEATMAP_KEY, function(syncData) {
            if (syncData && syncData[SYNC_HEATMAP_KEY] && Object.keys(syncData[SYNC_HEATMAP_KEY]).length > 0) {
              heatmapCache = syncData[SYNC_HEATMAP_KEY];
            }
            migrateHeatmap();
            syncHeatmap();
            purgeDeleted('all');
            if (continueCb) continueCb(anchors);
          });
        } else {
          migrateHeatmap();
          syncHeatmap();
          purgeDeleted('all');
          if (continueCb) continueCb(anchors);
        }
      }

      if (anchors.length === 0 && ACTIVE_SESSION) {
        chrome.storage.local.get([CACHE_KEY, TEMPLATE_KEY, HEATMAP_KEY, BUNDLE_KEY, CONSTRAINT_KEY], function(fb) {
          var fbAnchors = fb[CACHE_KEY];
          if (fbAnchors && Array.isArray(fbAnchors) && fbAnchors.length > 0) {
            anchors = fbAnchors;
            templates = fb[TEMPLATE_KEY] || [];
            savedHeatmap = fb[HEATMAP_KEY] || {};
            savedBundles = fb[BUNDLE_KEY] || [];
            savedConstraints = fb[CONSTRAINT_KEY] || [];
            var migrateObj = {};
            migrateObj[scopedAnchors] = anchors;
            migrateObj[scopedTemplates] = templates;
            migrateObj[scopedHeatmap] = savedHeatmap;
            migrateObj[scopedBundles] = savedBundles;
            migrateObj[scopedConstraints] = savedConstraints;
            chrome.storage.local.set(migrateObj, function() {
              chrome.storage.local.remove([CACHE_KEY, TEMPLATE_KEY, HEATMAP_KEY, BUNDLE_KEY, CONSTRAINT_KEY], function() {
                applyLoadedData(callback);
              });
            });
          } else {
            applyLoadedData(callback);
          }
        });
      } else {
        applyLoadedData(callback);
      }
    });
  }

  // --- Error Emission ---

  function emitTypedError(code, context, message) {
    if (typeof window !== 'undefined' && window.__ca && window.__ca.shared && window.__ca.shared.emitError) {
      window.__ca.shared.emitError(code, context, message);
    } else {
      console.error('[CA] ' + code + ':', message, context ? JSON.stringify(context) : '');
    }
    if (typeof window !== 'undefined' && window.__ca && window.__ca.events) {
      window.__ca.events.emit('storage:error', code + ': ' + message);
    }
  }

  // --- Validation Schemas ---

  var SCHEMAS = {
    anchor: {
      text: { type: 'string', required: true },
      sourceUrl: { type: 'string' },
      turnsTotal: { type: 'number', default: 10, min: 0 },
      isGlobal: { type: 'boolean', default: false },
      order: { type: 'number' },
      description: { type: 'string', maxLength: 80 },
      turnsRemaining: { type: 'number', min: 0 },
      active: { type: 'boolean' },
      ttlMinutes: { type: 'number', min: 0 },
      ttlExpiresAt: { type: 'number' },
      usageHistory: { type: 'array' },
      usageCount: { type: 'number', min: 0 },
      lastUsed: { type: 'number' },
      originalTurns: { type: 'number', min: 0 },
      totalTurnsConsumed: { type: 'number', min: 0 },
      versionHistory: { type: 'array' },
      toneProfile: { type: 'object' },
      domainFocus: { type: 'array' },
      socraticTrigger: { type: 'string' },
      uncertaintyProtocol: { type: 'string' },
      outputRequirements: { type: 'object' },
      outputFormatChoice: { type: 'string' }
    },
    template: {
      name: { type: 'string', required: true },
      text: { type: 'string' },
      tags: { type: 'array' },
      description: { type: 'string', maxLength: 80 },
      triggerKeywords: { type: 'array' },
      usageCount: { type: 'number', min: 0 },
      ttlMinutes: { type: 'number', min: 0 },
      ttlExpiresAt: { type: 'number' },
      defaultTurns: { type: 'number', min: 0 }
    },
    bundle: {
      name: { type: 'string', required: true },
      anchorIds: { type: 'array' },
      keyword: { type: 'string' },
      description: { type: 'string', maxLength: 80 }
    },
    constraint: {
      name: { type: 'string', required: true },
      text: { type: 'string', required: true },
      priority: { type: 'string', default: 'low' },
      active: { type: 'boolean', default: false },
      sessionId: { type: 'string' }
    },
    profile: {
      name: { type: 'string', required: true },
      promptAssembly: { type: 'object', required: true },
      active: { type: 'boolean', default: false },
      createdAt: { type: 'number' },
      versionHistory: { type: 'array' },
      personaRole: { type: 'string' },
      reasoningProtocol: { type: 'string' },
      outputVerbosity: { type: 'string' },
      outputFormatChoice: { type: 'string' },
      thinkingEffort: { type: 'string' },
      groundingMode: { type: 'string' }
    }
  };

  // --- Validation Helpers ---

  function getType(val) {
    if (Array.isArray(val)) return 'array';
    return typeof val;
  }

  function validate(entity, data) {
    var schema = SCHEMAS[entity];
    if (!schema) {
      emitTypedError('INVALID_INPUT', { entity: entity }, 'Unknown entity type: ' + entity);
      return null;
    }
    var result = {};
    for (var key in schema) {
      if (!schema.hasOwnProperty(key)) continue;
      var rule = schema[key];
      var val = data.hasOwnProperty(key) ? data[key] : undefined;

      if (val === undefined && rule.hasOwnProperty('default')) {
        val = rule.default;
      }

      if (rule.required) {
        if (val === undefined || val === null || (rule.type === 'string' && val === '')) {
          emitTypedError('INVALID_INPUT', { entity: entity, field: key }, key + ' is required for ' + entity);
          return null;
        }
      }

      if (val === undefined || val === null) {
        result[key] = val;
        continue;
      }

      if (getType(val) !== rule.type) {
        emitTypedError('INVALID_INPUT', { entity: entity, field: key, expected: rule.type, actual: getType(val) }, key + ' must be of type ' + rule.type);
        return null;
      }

      if (rule.min !== undefined && val < rule.min) {
        emitTypedError('INVALID_INPUT', { entity: entity, field: key, min: rule.min }, key + ' must be at least ' + rule.min);
        return null;
      }
      if (rule.maxLength !== undefined && val.length > rule.maxLength) {
        emitTypedError('INVALID_INPUT', { entity: entity, field: key, maxLength: rule.maxLength }, key + ' exceeds maximum length of ' + rule.maxLength);
        return null;
      }

      result[key] = val;
    }

    for (var key in data) {
      if (data.hasOwnProperty(key) && !schema.hasOwnProperty(key)) {
        console.warn('[CA] Unknown key "' + key + '" in ' + entity + ' data');
      }
    }

    return result;
  }

  // --- Persistence (Debounced Writes) ---

  function saveConstraintToStorage(callback) {
    clearTimeout(constraintDebounceTimer);
    constraintDebounceTimer = setTimeout(function() {
      var obj = {};
      obj[sk(CONSTRAINT_KEY)] = constraintCache;
      try {
        chrome.storage.local.set(obj, function() {
          if (chrome.runtime.lastError) {
            var msg = chrome.runtime.lastError.message;
            var code = msg.indexOf('QUOTA') !== -1 ? 'STORAGE_QUOTA' : 'STORAGE_WRITE';
            emitTypedError(code, { operation: 'saveConstraintToStorage' }, msg);
          }
          if (callback) callback();
        });
      } catch (e) {
        console.warn('[CA] Extension context invalidated, constraint storage write skipped');
        emitTypedError('STORAGE_WRITE', { operation: 'saveConstraintToStorage' }, 'Extension context invalidated: ' + e.message);
      }
    }, WRITE_DELAY);
  }

  function saveToStorage(anchors, callback) {
    activeCacheDirty = true;
    clearTimeout(DEBOUNCE_TIMER);
    DEBOUNCE_TIMER = setTimeout(function() {
      var obj = {};
      obj[getStorageKey()] = anchors;
      obj[sk(TEMPLATE_KEY)] = templateCache;
      obj[SETTINGS_KEY] = settings;
      obj[sk(HEATMAP_KEY)] = heatmapCache;
      obj[sk(BUNDLE_KEY)] = bundleCache;
      obj[sk(CONSTRAINT_KEY)] = constraintCache;
      try {
        chrome.storage.local.set(obj, function() {
          if (chrome.runtime.lastError) {
            var msg = chrome.runtime.lastError.message;
            console.error('[CA] Storage write error:', msg);
            var code = msg.indexOf('QUOTA') !== -1 ? 'STORAGE_QUOTA' : 'STORAGE_WRITE';
            emitTypedError(code, { operation: 'saveToStorage', key: getStorageKey() }, msg);
          }
          if (callback) callback();
        });
      } catch (e) {
        console.warn('[CA] Extension context invalidated, storage write skipped');
        emitTypedError('STORAGE_WRITE', { operation: 'saveToStorage', key: getStorageKey() }, 'Extension context invalidated: ' + e.message);
      }
    }, WRITE_DELAY);
  }

  function saveTemplates(callback) {
    clearTimeout(templateDebounceTimer);
    templateDebounceTimer = setTimeout(function() {
      var obj = {};
      obj[getStorageKey()] = cache;
      obj[sk(TEMPLATE_KEY)] = templateCache;
      obj[SETTINGS_KEY] = settings;
      obj[sk(HEATMAP_KEY)] = heatmapCache;
      obj[sk(BUNDLE_KEY)] = bundleCache;
      obj[sk(CONSTRAINT_KEY)] = constraintCache;
      try {
        chrome.storage.local.set(obj, function() {
          if (chrome.runtime.lastError) {
            var msg = chrome.runtime.lastError.message;
            console.error('[CA] Templates write error:', msg);
            var code = msg.indexOf('QUOTA') !== -1 ? 'STORAGE_QUOTA' : 'STORAGE_WRITE';
            emitTypedError(code, { operation: 'saveTemplates' }, msg);
          }
          if (callback) callback();
        });
      } catch (e) {
        console.warn('[CA] Extension context invalidated, templates write skipped');
        emitTypedError('STORAGE_WRITE', { operation: 'saveTemplates' }, 'Extension context invalidated: ' + e.message);
      }
    }, WRITE_DELAY);
  }

  function saveBundles(callback) {
    clearTimeout(bundleDebounceTimer);
    bundleDebounceTimer = setTimeout(function() {
      var obj = {};
      obj[getStorageKey()] = cache;
      obj[sk(TEMPLATE_KEY)] = templateCache;
      obj[SETTINGS_KEY] = settings;
      obj[sk(HEATMAP_KEY)] = heatmapCache;
      obj[sk(BUNDLE_KEY)] = bundleCache;
      obj[sk(CONSTRAINT_KEY)] = constraintCache;
      try {
        chrome.storage.local.set(obj, function() {
          if (chrome.runtime.lastError) {
            var errMsg = chrome.runtime.lastError.message;
            console.error('[CA] Bundles write error:', errMsg);
            var code = errMsg.indexOf('QUOTA') !== -1 ? 'STORAGE_QUOTA' : 'STORAGE_WRITE';
            emitTypedError(code, { operation: 'saveBundles' }, errMsg);
          }
          if (callback) callback();
        });
      } catch (e) {
        console.warn('[CA] Extension context invalidated, bundles write skipped');
        emitTypedError('STORAGE_WRITE', { operation: 'saveBundles' }, 'Extension context invalidated: ' + e.message);
      }
    }, WRITE_DELAY);
  }

  function syncHeatmap() {
    if (!settings.syncHeatmapEnabled) return;
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(function() {
      if (!chrome || !chrome.storage || !chrome.storage.sync) return;
      var obj = {};
      obj[SYNC_HEATMAP_KEY] = heatmapCache;
      chrome.storage.sync.set(obj, function() {
        if (chrome.runtime.lastError) {
          console.warn('[CA] Heatmap sync error:', chrome.runtime.lastError.message);
          emitTypedError('STORAGE_WRITE', { operation: 'syncHeatmap' }, 'Heatmap sync error: ' + chrome.runtime.lastError.message);
        }
      });
    }, 2000);
  }

  function migrateHeatmapToLocal(heatmap) {
    // Convert heatmap keys from UTC midnight to local midnight timestamps.
    // This runs once when heatmapCache is first loaded, ensuring consistency
    // with the timeline which uses local time for date grouping.
    var offset = new Date().getTimezoneOffset() * 60 * 1000;
    var result = {};
    for (var key in heatmap) {
      if (heatmap.hasOwnProperty(key)) {
        var utcTs = parseInt(key, 10);
        var d = new Date(utcTs + offset);
        var localTs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        result[localTs] = (result[localTs] || 0) + heatmap[key];
      }
    }
    return result;
  }

  function setUsageHeatmap(heatmap) {
    heatmapCache = {};
    for (var key in heatmap) {
      if (heatmap.hasOwnProperty(key)) {
        heatmapCache[key] = heatmap[key];
      }
    }
    syncHeatmap();
    saveToStorage(cache);
  }

  function generateBundleId() {
    return 'bun_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  function saveSettings(callback) {
    activeCacheDirty = true;
    clearTimeout(DEBOUNCE_TIMER);
    DEBOUNCE_TIMER = setTimeout(function() {
      var obj = {};
      obj[getStorageKey()] = cache;
      obj[sk(TEMPLATE_KEY)] = templateCache;
      obj[SETTINGS_KEY] = settings;
      obj[sk(HEATMAP_KEY)] = heatmapCache;
      obj[sk(BUNDLE_KEY)] = bundleCache;
      obj[sk(CONSTRAINT_KEY)] = constraintCache;
      try {
        chrome.storage.local.set(obj, function() {
          if (chrome.runtime.lastError) {
            var msg = chrome.runtime.lastError.message;
            console.error('[CA] Settings write error:', msg);
            var code = msg.indexOf('QUOTA') !== -1 ? 'STORAGE_QUOTA' : 'STORAGE_WRITE';
            emitTypedError(code, { operation: 'saveSettings' }, msg);
          }
          if (callback) callback();
        });
      } catch (e) {
        console.warn('[CA] Extension context invalidated, settings write skipped');
        emitTypedError('STORAGE_WRITE', { operation: 'saveSettings' }, 'Extension context invalidated: ' + e.message);
      }
    }, WRITE_DELAY);
  }

  // --- Anchor CRUD ---

  function createAnchor(text, sourceUrl, turnsTotal, isGlobal, opts) {
    var data = validate('anchor', { text: text, sourceUrl: sourceUrl, turnsTotal: turnsTotal, isGlobal: isGlobal });
    if (!data) return null;
    if (!opts) opts = {};
    var anchor = {
      id: generateId(),
      text: data.text,
      sourceUrl: data.sourceUrl || '',
      createdAt: Date.now(),
      turnsTotal: data.turnsTotal,
      turnsRemaining: data.turnsTotal,
      originalTurns: data.turnsTotal,
      active: data.turnsTotal > 0,
      order: Date.now(),
      global: data.isGlobal,
      description: '',
      triggerKeywords: [],
      usageHistory: [],
      ttlMinutes: settings.defaultTTL > 0 ? settings.defaultTTL : null,
      ttlExpiresAt: settings.defaultTTL > 0 ? Date.now() + (settings.defaultTTL * 60000) : null,
      deleted: false,
      deletedAt: null,
      toneProfile: opts.toneProfile || null,
      domainFocus: opts.domainFocus || null,
      socraticTrigger: opts.socraticTrigger || null,
      uncertaintyProtocol: opts.uncertaintyProtocol || null,
      outputRequirements: opts.outputRequirements || null,
      messageId: opts.messageId || null,
      blockIndex: opts.blockIndex != null ? opts.blockIndex : null,
      msgIndex: opts.msgIndex != null ? opts.msgIndex : null,
      blockTextHash: opts.blockTextHash || null,
      textOffset: opts.textOffset != null ? opts.textOffset : null
    };

    cache.push(anchor);
    cacheMap[anchor.id] = anchor;
    var createKey = dateKey(anchor.createdAt);
    heatmapCache[createKey] = (heatmapCache[createKey] || 0) + 1;
    syncHeatmap();
    saveToStorage(cache);
    return anchor;
  }

  function getAll() {
    return cache.filter(function(a) { return !a.deleted; });
  }

  function getActive() {
    if (activeCacheDirty) {
      activeCache = cache
        .filter(function(a) { return !a.deleted && a.active && a.turnsRemaining > 0; })
        .sort(function(a, b) { return b.order - a.order; });
      activeCacheDirty = false;
    }
    return activeCache.slice();
  }

  function updateAnchor(id, updates) {
    if (!cacheMap[id]) {
      emitTypedError('ANCHOR_NOT_FOUND', { id: id, operation: 'updateAnchor' }, 'Anchor not found for update');
      return;
    }
    for (var key in updates) {
      if (!updates.hasOwnProperty(key)) continue;
      var rule = SCHEMAS.anchor[key];
      if (!rule) {
        console.warn('[CA] Unknown key "' + key + '" in updateAnchor');
        continue;
      }
      var val = updates[key];
          if (val !== undefined && val !== null && getType(val) !== rule.type) {
            emitTypedError('INVALID_INPUT', { id: id, field: key, operation: 'updateAnchor', expected: rule.type, actual: getType(val) }, key + ' must be of type ' + rule.type);
            return;
          }
          // Auto-snapshot before overwriting text or description
          if ((key === 'text' || key === 'description') && cacheMap[id][key] !== val) {
            if (!cacheMap[id].versionHistory) cacheMap[id].versionHistory = [];
            cacheMap[id].versionHistory.push({
              field: key,
              value: cacheMap[id][key],
              timestamp: Date.now()
            });
            // Keep only last 10 entries to prevent storage bloat
            // (~80 bytes per entry, 10 entries per anchor = 800 bytes x 500 anchors = 400KB)
            if (cacheMap[id].versionHistory.length > 10) {
              cacheMap[id].versionHistory = cacheMap[id].versionHistory.slice(-10);
            }
          }
          cacheMap[id][key] = val;
    }
    if (updates.hasOwnProperty('tags')) rebuildTagIndex();
    saveToStorage(cache);
  }

  function restoreVersion(id, index) {
    if (!cacheMap[id] || !cacheMap[id].versionHistory) return;
    var entry = cacheMap[id].versionHistory[index];
    if (!entry) return;
    // Revert to the historical value
    cacheMap[id][entry.field] = entry.value;
    // Remove this entry and any entries after it (the restored state becomes the latest)
    cacheMap[id].versionHistory = cacheMap[id].versionHistory.slice(0, index);
    saveToStorage(cache);
  }

  function deleteAnchor(id) {
    if (!cacheMap[id]) {
      emitTypedError('ANCHOR_NOT_FOUND', { id: id, operation: 'deleteAnchor' }, 'Anchor not found for delete');
      return;
    }
    cacheMap[id].deleted = true;
    cacheMap[id].deletedAt = Date.now();
    saveToStorage(cache);
  }

  function toggleAnchor(id) {
    if (!cacheMap[id]) {
      emitTypedError('ANCHOR_NOT_FOUND', { id: id, operation: 'toggleAnchor' }, 'Anchor not found for toggle');
      return;
    }
    cacheMap[id].active = !cacheMap[id].active;
    saveToStorage(cache);
  }

  function extendTurns(id, additionalTurns) {
    additionalTurns = additionalTurns || 5;
    if (!cacheMap[id]) {
      emitTypedError('ANCHOR_NOT_FOUND', { id: id, operation: 'extendTurns' }, 'Anchor not found for extendTurns');
      return;
    }
    cacheMap[id].turnsRemaining += additionalTurns;
    cacheMap[id].turnsTotal += additionalTurns;
    if (cacheMap[id].turnsRemaining > 0) {
      cacheMap[id].active = true;
    }
    saveToStorage(cache);
  }

  function resetTurns(id) {
    if (!cacheMap[id]) {
      emitTypedError('ANCHOR_NOT_FOUND', { id: id, operation: 'resetTurns' }, 'Anchor not found for resetTurns');
      return;
    }
    var target = cacheMap[id].originalTurns || cacheMap[id].turnsTotal;
    cacheMap[id].turnsRemaining = target;
    cacheMap[id].turnsTotal = target;
    if (cacheMap[id].turnsRemaining > 0) {
      cacheMap[id].active = true;
    }
    saveToStorage(cache);
  }

  function addTag(id, tag) {
    if (!cacheMap[id]) {
      emitTypedError('ANCHOR_NOT_FOUND', { id: id, operation: 'addTag' }, 'Anchor not found for addTag');
      return;
    }
    if (!cacheMap[id].tags) cacheMap[id].tags = [];
    if (cacheMap[id].tags.indexOf(tag) === -1) {
      cacheMap[id].tags.push(tag);
      var tLower = tag.toLowerCase();
      if (!tagIndex[tLower]) tagIndex[tLower] = [];
      if (tagIndex[tLower].indexOf(id) === -1) tagIndex[tLower].push(id);
    }
    saveToStorage(cache);
  }

  function removeTag(id, tag) {
    if (!cacheMap[id]) {
      emitTypedError('ANCHOR_NOT_FOUND', { id: id, operation: 'removeTag' }, 'Anchor not found for removeTag');
      return;
    }
    if (cacheMap[id].tags) {
      var idx = cacheMap[id].tags.indexOf(tag);
      if (idx !== -1) {
        cacheMap[id].tags.splice(idx, 1);
        var tLower = tag.toLowerCase();
        if (tagIndex[tLower]) {
          var idIdx = tagIndex[tLower].indexOf(id);
          if (idIdx !== -1) tagIndex[tLower].splice(idIdx, 1);
          if (tagIndex[tLower].length === 0) delete tagIndex[tLower];
        }
      }
    }
    saveToStorage(cache);
  }

  function addTriggerKeyword(id, keyword) {
    if (!cacheMap[id]) {
      emitTypedError('ANCHOR_NOT_FOUND', { id: id, operation: 'addTriggerKeyword' }, 'Anchor not found for addTriggerKeyword');
      return;
    }
    if (!cacheMap[id].triggerKeywords) cacheMap[id].triggerKeywords = [];
    if (cacheMap[id].triggerKeywords.indexOf(keyword) === -1) {
      cacheMap[id].triggerKeywords.push(keyword);
    }
    saveToStorage(cache);
  }

  function removeTriggerKeyword(id, keyword) {
    if (!cacheMap[id]) {
      emitTypedError('ANCHOR_NOT_FOUND', { id: id, operation: 'removeTriggerKeyword' }, 'Anchor not found for removeTriggerKeyword');
      return;
    }
    if (cacheMap[id].triggerKeywords) {
      var idx = cacheMap[id].triggerKeywords.indexOf(keyword);
      if (idx !== -1) {
        cacheMap[id].triggerKeywords.splice(idx, 1);
      }
    }
    saveToStorage(cache);
  }

  function renameTag(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;
    var oldLower = oldName.toLowerCase();
    var newLower = newName.toLowerCase();
    var changed = false;

    // Update all anchors
    for (var i = 0; i < cache.length; i++) {
      if (cache[i].tags) {
        var idx = cache[i].tags.indexOf(oldName);
        if (idx !== -1) {
          cache[i].tags[idx] = newName;
          changed = true;
        }
      }
    }
    // Update all templates
    for (var i = 0; i < templateCache.length; i++) {
      if (templateCache[i].tags) {
        var idx = templateCache[i].tags.indexOf(oldName);
        if (idx !== -1) {
          templateCache[i].tags[idx] = newName;
          changed = true;
        }
      }
    }
    if (!changed) return;

    activeCacheDirty = true;
    rebuildTagIndex();
    saveToStorage(cache);
    saveTemplates();
  }

  function mergeTags(sourceTag, targetTag) {
    if (!sourceTag || !targetTag || sourceTag === targetTag) return;
    var sourceLower = sourceTag.toLowerCase();
    var changed = false;

    // Update all anchors
    for (var i = 0; i < cache.length; i++) {
      if (cache[i].tags) {
        var idx = cache[i].tags.indexOf(sourceTag);
        if (idx !== -1) {
          cache[i].tags.splice(idx, 1);
          if (cache[i].tags.indexOf(targetTag) === -1) {
            cache[i].tags.push(targetTag);
          }
          changed = true;
        }
      }
    }
    // Update all templates
    for (var i = 0; i < templateCache.length; i++) {
      if (templateCache[i].tags) {
        var idx = templateCache[i].tags.indexOf(sourceTag);
        if (idx !== -1) {
          templateCache[i].tags.splice(idx, 1);
          if (templateCache[i].tags.indexOf(targetTag) === -1) {
            templateCache[i].tags.push(targetTag);
          }
          changed = true;
        }
      }
    }
    if (!changed) return;

    activeCacheDirty = true;
    rebuildTagIndex();
    saveToStorage(cache);
    saveTemplates();
  }

  function addBulkTag(ids, tag) {
    if (!ids || ids.length === 0 || !tag) return;
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (id.indexOf('tpl_') === 0) {
        addTemplateTag(id, tag);
      } else {
        addTag(id, tag);
      }
    }
  }

  function removeBulkTag(ids, tag) {
    if (!ids || ids.length === 0 || !tag) return;
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (id.indexOf('tpl_') === 0) {
        removeTemplateTag(id, tag);
      } else {
        removeTag(id, tag);
      }
    }
  }

  // --- Constraint CRUD ---

  function generateConstraintId() {
    return 'constraint_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  function createConstraint(name, text, priority) {
    var data = validate('constraint', { name: name, text: text, priority: priority });
    if (!data) return null;
    var constraint = {
      id: generateConstraintId(),
      name: data.name,
      text: data.text,
      priority: data.priority || 'low',
      active: false,
      sessionId: null,
      createdAt: Date.now(),
      deleted: false,
      deletedAt: null
    };
    constraintCache.push(constraint);
    constraintCacheMap[constraint.id] = constraint;
    saveConstraintToStorage();
    return constraint;
  }

  function getAllConstraints() {
    return constraintCache.filter(function(c) { return !c.deleted; });
  }

  function getActiveConstraints() {
    return constraintCache.filter(function(c) { return !c.deleted && c.active; });
  }

  function getConstraintById(id) {
    return constraintCacheMap[id] && !constraintCacheMap[id].deleted ? constraintCacheMap[id] : null;
  }

  function toggleConstraint(id) {
    if (!constraintCacheMap[id]) {
      emitTypedError('CONSTRAINT_NOT_FOUND', { id: id, operation: 'toggleConstraint' }, 'Constraint not found');
      return;
    }
    constraintCacheMap[id].active = !constraintCacheMap[id].active;
    saveConstraintToStorage();
  }

  function deleteConstraint(id) {
    if (!constraintCacheMap[id]) {
      emitTypedError('CONSTRAINT_NOT_FOUND', { id: id, operation: 'deleteConstraint' }, 'Constraint not found');
      return;
    }
    constraintCacheMap[id].deleted = true;
    constraintCacheMap[id].deletedAt = Date.now();
    saveConstraintToStorage();
  }

  function updateConstraint(id, updates) {
    if (!constraintCacheMap[id]) {
      emitTypedError('CONSTRAINT_NOT_FOUND', { id: id, operation: 'updateConstraint' }, 'Constraint not found');
      return;
    }
    for (var key in updates) {
      if (!updates.hasOwnProperty(key)) continue;
      var rule = SCHEMAS.constraint[key];
      if (!rule) {
        console.warn('[CA] Unknown key "' + key + '" in updateConstraint');
        continue;
      }
      var val = updates[key];
      if (val === undefined || val === null) continue;
      if (rule.type && getType(val) !== rule.type) {
        console.warn('[CA] Type mismatch for key "' + key + '": expected ' + rule.type + ', got ' + getType(val));
        continue;
      }
      constraintCacheMap[id][key] = val;
    }
    saveConstraintToStorage();
  }

  function linkConstraintToSession(id, sessionId) {
    if (!constraintCacheMap[id]) {
      emitTypedError('CONSTRAINT_NOT_FOUND', { id: id, operation: 'linkConstraintToSession' }, 'Constraint not found');
      return;
    }
    constraintCacheMap[id].sessionId = sessionId;
    saveConstraintToStorage();
  }

  function clearSessionConstraints(sessionId) {
    var changed = false;
    for (var i = 0; i < constraintCache.length; i++) {
      if (!constraintCache[i].deleted && constraintCache[i].sessionId === sessionId) {
        constraintCache[i].active = false;
        changed = true;
      }
    }
    if (changed) saveConstraintToStorage();
  }

  function bulkDeleteConstraints(ids) {
    var changed = false;
    for (var i = 0; i < ids.length; i++) {
      if (constraintCacheMap[ids[i]] && !constraintCacheMap[ids[i]].deleted) {
        constraintCacheMap[ids[i]].deleted = true;
        constraintCacheMap[ids[i]].deletedAt = Date.now();
        changed = true;
      }
    }
    if (changed) saveConstraintToStorage();
  }

  function bulkToggleConstraints(ids) {
    var changed = false;
    for (var i = 0; i < ids.length; i++) {
      if (constraintCacheMap[ids[i]] && !constraintCacheMap[ids[i]].deleted) {
        constraintCacheMap[ids[i]].active = !constraintCacheMap[ids[i]].active;
        changed = true;
      }
    }
    if (changed) saveConstraintToStorage();
  }

  function bulkSetConstraintPriority(ids, priority) {
    if (priority !== 'high' && priority !== 'low') return;
    var changed = false;
    for (var i = 0; i < ids.length; i++) {
      if (constraintCacheMap[ids[i]] && !constraintCacheMap[ids[i]].deleted) {
        constraintCacheMap[ids[i]].priority = priority;
        changed = true;
      }
    }
    if (changed) saveConstraintToStorage();
  }

  function restoreConstraint(id) {
    if (!constraintCacheMap[id]) {
      emitTypedError('CONSTRAINT_NOT_FOUND', { id: id, operation: 'restoreConstraint' }, 'Constraint not found for restore');
      return;
    }
    constraintCacheMap[id].deleted = false;
    constraintCacheMap[id].deletedAt = null;
    saveConstraintToStorage();
  }

  function permanentDeleteConstraint(id) {
    var idx = -1;
    for (var i = 0; i < constraintCache.length; i++) {
      if (constraintCache[i].id === id) { idx = i; break; }
    }
    if (idx === -1) {
      emitTypedError('CONSTRAINT_NOT_FOUND', { id: id, operation: 'permanentDeleteConstraint' }, 'Constraint not found for permanent delete');
      return;
    }
    constraintCache.splice(idx, 1);
    delete constraintCacheMap[id];
    saveConstraintToStorage();
  }

  function bulkRestoreConstraints(ids) {
    var changed = false;
    for (var i = 0; i < ids.length; i++) {
      if (constraintCacheMap[ids[i]] && constraintCacheMap[ids[i]].deleted) {
        constraintCacheMap[ids[i]].deleted = false;
        constraintCacheMap[ids[i]].deletedAt = null;
        changed = true;
      }
    }
    if (changed) saveConstraintToStorage();
  }

  // --- Template CRUD ---

  function generateTemplateId() {
    return 'tpl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  function createTemplate(name, text, tags, description, defaultTurns) {
    var data = validate('template', { name: name, text: text, tags: tags, description: description, defaultTurns: defaultTurns });
    if (!data) return null;
    var tpl = {
      id: generateTemplateId(),
      name: data.name,
      text: data.text,
      tags: data.tags || [],
      triggerKeywords: [],
      description: data.description || '',
      createdAt: Date.now(),
      usageCount: 0,
      active: true,
      defaultTurns: data.defaultTurns || null,
      ttlMinutes: null,
      ttlExpiresAt: null,
      deleted: false,
      deletedAt: null
    };
    templateCache.push(tpl);
    rebuildTemplateTagIndex(tpl);
    saveTemplates();
    return tpl;
  }

  function getTemplates() {
    return templateCache.filter(function(t) { return !t.deleted; }).sort(function(a, b) { return b.createdAt - a.createdAt; });
  }

  function deleteTemplate(id) {
    var found = false;
    for (var i = 0; i < templateCache.length; i++) {
      if (templateCache[i].id === id) {
        templateCache[i].deleted = true;
        templateCache[i].deletedAt = Date.now();
        found = true;
        break;
      }
    }
    if (!found) {
      emitTypedError('TEMPLATE_NOT_FOUND', { id: id, operation: 'deleteTemplate' }, 'Template not found for delete');
    }
    saveTemplates();
  }

  function updateTemplate(id, updates) {
    var found = false;
    for (var i = 0; i < templateCache.length; i++) {
      if (templateCache[i].id === id) {
        for (var key in updates) {
          if (!updates.hasOwnProperty(key)) continue;
          var rule = SCHEMAS.template[key];
          if (!rule) {
            console.warn('[CA] Unknown key "' + key + '" in updateTemplate');
            continue;
          }
          var val = updates[key];
          if (val !== undefined && val !== null && getType(val) !== rule.type) {
            emitTypedError('INVALID_INPUT', { id: id, field: key, operation: 'updateTemplate', expected: rule.type, actual: getType(val) }, key + ' must be of type ' + rule.type);
            return;
          }
          templateCache[i][key] = val;
        }
        found = true;
        break;
      }
    }
    if (!found) {
      emitTypedError('TEMPLATE_NOT_FOUND', { id: id, operation: 'updateTemplate' }, 'Template not found for update');
    }
    rebuildTagIndex();
    saveTemplates();
  }

  function activateTemplate(id, sourceUrl) {
    for (var i = 0; i < templateCache.length; i++) {
      if (templateCache[i].id === id) {
        var tpl = templateCache[i];
        tpl.usageCount = (tpl.usageCount || 0) + 1;
        saveTemplates();
        sourceUrl = sourceUrl || '';
        var turns = tpl.defaultTurns || 10;
        return createAnchor(tpl.text, sourceUrl, turns);
      }
    }
    emitTypedError('TEMPLATE_NOT_FOUND', { id: id, operation: 'activateTemplate' }, 'Template not found for activation');
    return null;
  }

  function addTemplateTag(id, tag) {
    var found = false;
    for (var i = 0; i < templateCache.length; i++) {
      if (templateCache[i].id === id) {
        if (!templateCache[i].tags) templateCache[i].tags = [];
        if (templateCache[i].tags.indexOf(tag) === -1) {
          templateCache[i].tags.push(tag);
          var tLower = tag.toLowerCase();
          if (!tagIndex[tLower]) tagIndex[tLower] = [];
          if (tagIndex[tLower].indexOf(id) === -1) tagIndex[tLower].push(id);
        }
        found = true;
        break;
      }
    }
    if (!found) {
      emitTypedError('TEMPLATE_NOT_FOUND', { id: id, operation: 'addTemplateTag' }, 'Template not found for addTag');
    }
    saveTemplates();
  }

  function removeTemplateTag(id, tag) {
    var found = false;
    for (var i = 0; i < templateCache.length; i++) {
      if (templateCache[i].id === id && templateCache[i].tags) {
        var idx = templateCache[i].tags.indexOf(tag);
        if (idx !== -1) {
          templateCache[i].tags.splice(idx, 1);
          var tLower = tag.toLowerCase();
          if (tagIndex[tLower]) {
            var idIdx = tagIndex[tLower].indexOf(id);
            if (idIdx !== -1) tagIndex[tLower].splice(idIdx, 1);
            if (tagIndex[tLower].length === 0) delete tagIndex[tLower];
          }
        }
        found = true;
        break;
      }
    }
    if (!found) {
      emitTypedError('TEMPLATE_NOT_FOUND', { id: id, operation: 'removeTemplateTag' }, 'Template not found for removeTag');
    }
    saveTemplates();
  }

  function addTemplateTriggerKeyword(id, keyword) {
    var found = false;
    for (var i = 0; i < templateCache.length; i++) {
      if (templateCache[i].id === id) {
        if (!templateCache[i].triggerKeywords) templateCache[i].triggerKeywords = [];
        if (templateCache[i].triggerKeywords.indexOf(keyword) === -1) {
          templateCache[i].triggerKeywords.push(keyword);
        }
        found = true;
        break;
      }
    }
    if (!found) {
      emitTypedError('TEMPLATE_NOT_FOUND', { id: id, operation: 'addTemplateTriggerKeyword' }, 'Template not found for addTriggerKeyword');
    }
    saveTemplates();
  }

  function removeTemplateTriggerKeyword(id, keyword) {
    var found = false;
    for (var i = 0; i < templateCache.length; i++) {
      if (templateCache[i].id === id && templateCache[i].triggerKeywords) {
        var idx = templateCache[i].triggerKeywords.indexOf(keyword);
        if (idx !== -1) {
          templateCache[i].triggerKeywords.splice(idx, 1);
        }
        found = true;
        break;
      }
    }
    if (!found) {
      emitTypedError('TEMPLATE_NOT_FOUND', { id: id, operation: 'removeTemplateTriggerKeyword' }, 'Template not found for removeTriggerKeyword');
    }
    saveTemplates();
  }

  function toggleTemplateActive(id) {
    var found = false;
    for (var i = 0; i < templateCache.length; i++) {
      if (templateCache[i].id === id) {
        templateCache[i].active = !templateCache[i].active;
        found = true;
        break;
      }
    }
    if (!found) {
      emitTypedError('TEMPLATE_NOT_FOUND', { id: id, operation: 'toggleTemplateActive' }, 'Template not found for toggle');
    }
    saveTemplates();
  }

  function getActiveTemplates() {
    return templateCache.filter(function(t) { return !t.deleted && t.active; });
  }

  function setTemplateTTL(id, minutes) {
    var found = false;
    for (var i = 0; i < templateCache.length; i++) {
      if (templateCache[i].id === id) {
        templateCache[i].ttlMinutes = minutes;
        templateCache[i].ttlExpiresAt = minutes === null ? null : Date.now() + minutes * 60000;
        found = true;
        break;
      }
    }
    if (!found) {
      emitTypedError('TEMPLATE_NOT_FOUND', { id: id, operation: 'setTemplateTTL' }, 'Template not found for setTTL');
    }
    saveTemplates();
  }

  function extendTemplateTTL(id, minutes) {
    var found = false;
    for (var i = 0; i < templateCache.length; i++) {
      if (templateCache[i].id === id && templateCache[i].ttlMinutes !== null) {
        templateCache[i].ttlExpiresAt = (templateCache[i].ttlExpiresAt || Date.now()) + minutes * 60000;
        found = true;
        break;
      }
    }
    if (!found) {
      emitTypedError('TEMPLATE_NOT_FOUND', { id: id, operation: 'extendTemplateTTL' }, 'Template not found for extendTTL');
    }
    saveTemplates();
  }

  function resetTemplateTTL(id) {
    var found = false;
    for (var i = 0; i < templateCache.length; i++) {
      if (templateCache[i].id === id && templateCache[i].ttlMinutes !== null) {
        templateCache[i].ttlMinutes = null;
        templateCache[i].ttlExpiresAt = null;
        found = true;
        break;
      }
    }
    if (!found) {
      emitTypedError('TEMPLATE_NOT_FOUND', { id: id, operation: 'resetTemplateTTL' }, 'Template not found for resetTTL');
    }
    saveTemplates();
  }

  function checkExpiredTemplateTTLs() {
    var changed = false;
    for (var i = 0; i < templateCache.length; i++) {
      if (!templateCache[i].deleted && templateCache[i].ttlExpiresAt && templateCache[i].ttlExpiresAt < Date.now()) {
        templateCache[i].active = false;
        changed = true;
      }
    }
    if (changed) saveTemplates();
  }

  function bulkActivateTemplate(ids) {
    if (!ids || !ids.length) return [];
    var created = [];
    for (var i = 0; i < ids.length; i++) {
      var anchor = activateTemplate(ids[i]);
      if (anchor) created.push(anchor);
    }
    return created;
  }

  // --- Bundle CRUD ---

  function createBundle(name, anchorIds, keyword) {
    var data = validate('bundle', { name: name, anchorIds: anchorIds, keyword: keyword });
    if (!data) return null;
    var bundle = {
      id: generateBundleId(),
      name: data.name,
      keyword: data.keyword || '',
      anchorIds: data.anchorIds || [],
      description: '',
      createdAt: Date.now(),
      usageCount: 0,
      deleted: false,
      deletedAt: null
    };
    bundleCache.push(bundle);
    saveBundles();
    return bundle;
  }

  function getBundles() {
    return bundleCache.filter(function(b) { return !b.deleted; }).sort(function(a, b) { return b.createdAt - a.createdAt; });
  }

  function deleteBundle(id) {
    var found = false;
    for (var i = 0; i < bundleCache.length; i++) {
      if (bundleCache[i].id === id) {
        var anchorIds = bundleCache[i].anchorIds;
        for (var j = 0; j < anchorIds.length; j++) {
          if (cacheMap[anchorIds[j]]) {
            cacheMap[anchorIds[j]].active = false;
            if (bundleCache[i].keyword && cacheMap[anchorIds[j]].triggerKeywords) {
              var rIdx = cacheMap[anchorIds[j]].triggerKeywords.indexOf(bundleCache[i].keyword);
              if (rIdx !== -1) cacheMap[anchorIds[j]].triggerKeywords.splice(rIdx, 1);
            }
          }
        }
        if (settings.activeBundleId === id) {
          settings.activeBundleId = null;
          saveSettings();
        }
        bundleCache[i].deleted = true;
        bundleCache[i].deletedAt = Date.now();
        found = true;
        break;
      }
    }
    if (!found) {
      emitTypedError('BUNDLE_NOT_FOUND', { id: id, operation: 'deleteBundle' }, 'Bundle not found for delete');
    }
    saveToStorage(cache);
    saveBundles();
  }

  function updateBundle(id, updates) {
    var found = false;
    for (var i = 0; i < bundleCache.length; i++) {
      if (bundleCache[i].id === id) {
        for (var key in updates) {
          if (!updates.hasOwnProperty(key)) continue;
          var rule = SCHEMAS.bundle[key];
          if (!rule) {
            console.warn('[CA] Unknown key "' + key + '" in updateBundle');
            continue;
          }
          var val = updates[key];
          if (val !== undefined && val !== null && getType(val) !== rule.type) {
            emitTypedError('INVALID_INPUT', { id: id, field: key, operation: 'updateBundle', expected: rule.type, actual: getType(val) }, key + ' must be of type ' + rule.type);
            return;
          }
          bundleCache[i][key] = val;
        }
        found = true;
        break;
      }
    }
    if (!found) {
      emitTypedError('BUNDLE_NOT_FOUND', { id: id, operation: 'updateBundle' }, 'Bundle not found for update');
    }
    saveBundles();
  }

  function toggleBundle(id) {
    for (var i = 0; i < bundleCache.length; i++) {
      if (bundleCache[i].id === id) {
        bundleCache[i].usageCount = (bundleCache[i].usageCount || 0) + 1;
        saveBundles();
        bulkToggle(bundleCache[i].anchorIds);
        return;
      }
    }
    emitTypedError('BUNDLE_NOT_FOUND', { id: id, operation: 'toggleBundle' }, 'Bundle not found for toggle');
  }

  function activateBundleExclusively(id) {
    var wasActive = (settings.activeBundleId === id);
    var targetFound = false;
    for (var i = 0; i < bundleCache.length; i++) {
      if (bundleCache[i].id === id) {
        targetFound = true;
        continue;
      }
      var anchorIds = bundleCache[i].anchorIds;
      for (var j = 0; j < anchorIds.length; j++) {
        if (cacheMap[anchorIds[j]]) {
          cacheMap[anchorIds[j]].active = false;
        }
      }
    }
    if (!targetFound) {
      emitTypedError('BUNDLE_NOT_FOUND', { id: id, operation: 'activateBundleExclusively' }, 'Bundle not found for exclusive activation');
      return;
    }
    settings.activeBundleId = id;
    saveSettings();
    for (var i = 0; i < bundleCache.length; i++) {
      if (bundleCache[i].id === id) {
        if (!wasActive) bundleCache[i].usageCount = (bundleCache[i].usageCount || 0) + 1;
        saveBundles();
        var anchorIds = bundleCache[i].anchorIds;
        for (var j = 0; j < anchorIds.length; j++) {
          if (cacheMap[anchorIds[j]]) {
            cacheMap[anchorIds[j]].active = true;
          }
        }
        saveToStorage(cache);
        return;
      }
    }
  }

  function deactivateAllBundles() {
    for (var i = 0; i < bundleCache.length; i++) {
      var anchorIds = bundleCache[i].anchorIds;
      for (var j = 0; j < anchorIds.length; j++) {
        if (cacheMap[anchorIds[j]]) {
          cacheMap[anchorIds[j]].active = false;
        }
      }
    }
    settings.activeBundleId = null;
    saveSettings();
    saveToStorage(cache);
  }

  function getActiveBundleId() {
    return settings.activeBundleId || null;
  }

  // --- Turn Lifecycle & Usage ---

  function decrementTurnsForActive() {
    var changed = false;
    for (var i = 0; i < cache.length; i++) {
      if (cache[i].active && cache[i].turnsRemaining > 0) {
        cache[i].turnsRemaining--;
        cache[i].usageCount = (cache[i].usageCount || 0) + 1;
        cache[i].lastUsed = Date.now();
        cache[i].totalTurnsConsumed = (cache[i].totalTurnsConsumed || 0) + 1;
        if (!cache[i].usageHistory) cache[i].usageHistory = [];
        cache[i].usageHistory.push(Date.now());
        if (cache[i].ttlMinutes !== null) {
          cache[i].ttlExpiresAt = Date.now() + cache[i].ttlMinutes * 60000;
        }
        changed = true;
        var todayKey = dateKey(Date.now());
        heatmapCache[todayKey] = (heatmapCache[todayKey] || 0) + 1;
        if (cache[i].turnsRemaining === 0) {
          cache[i].active = false;
        }
      }
    }
    if (changed) {
      syncHeatmap();
      saveToStorage(cache);
    }
  }

  function decrementTurnsForIds(ids) {
    if (!ids || !ids.length) return;
    var changed = false;
    for (var i = 0; i < ids.length; i++) {
      var a = cacheMap[ids[i]];
      if (!a || !a.active || a.turnsRemaining <= 0) continue;
      a.turnsRemaining--;
      a.usageCount = (a.usageCount || 0) + 1;
      a.lastUsed = Date.now();
      a.totalTurnsConsumed = (a.totalTurnsConsumed || 0) + 1;
      if (!a.usageHistory) a.usageHistory = [];
      a.usageHistory.push(Date.now());
      if (a.ttlMinutes !== null) {
        a.ttlExpiresAt = Date.now() + a.ttlMinutes * 60000;
      }
      changed = true;
      var todayKey = dateKey(Date.now());
      heatmapCache[todayKey] = (heatmapCache[todayKey] || 0) + 1;
      if (a.turnsRemaining === 0) {
        a.active = false;
      }
    }
    if (changed) {
      syncHeatmap();
      saveToStorage(cache);
    }
  }

  function trackAnchorUsage(id) {
    if (!cacheMap[id]) return;
    var a = cacheMap[id];
    a.usageCount = (a.usageCount || 0) + 1;
    a.lastUsed = Date.now();
    a.totalTurnsConsumed = (a.totalTurnsConsumed || 0) + 1;
    if (!a.usageHistory) a.usageHistory = [];
    a.usageHistory.push(Date.now());
    var todayKey = dateKey(Date.now());
    heatmapCache[todayKey] = (heatmapCache[todayKey] || 0) + 1;
    syncHeatmap();
    saveToStorage(cache);
  }

  function getUsageHeatmap() {
    var result = {};
    for (var key in heatmapCache) {
      if (heatmapCache.hasOwnProperty(key)) {
        result[key] = heatmapCache[key];
      }
    }
    return result;
  }

  function migrateHeatmap() {
    if (Object.keys(heatmapCache).length > 0) return;
    for (var i = 0; i < cache.length; i++) {
      var cd = new Date(cache[i].createdAt);
      var cKey = new Date(cd.getFullYear(), cd.getMonth(), cd.getDate()).getTime();
      heatmapCache[cKey] = (heatmapCache[cKey] || 0) + 1;
      var history = cache[i].usageHistory;
      if (history && history.length) {
        for (var j = 0; j < history.length; j++) {
          var d = new Date(history[j]);
          var key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
          heatmapCache[key] = (heatmapCache[key] || 0) + 1;
        }
      }
    }
  }

  // --- TTL & Expiry ---

  function clearExpired() {
    var changed = false;
    for (var i = 0; i < cache.length; i++) {
      if (cache[i].turnsRemaining === 0 && !cache[i].deleted) {
        cache[i].deleted = true;
        cache[i].deletedAt = Date.now();
        changed = true;
      }
    }
    if (changed) saveToStorage(cache);
  }

  function setTTL(id, minutes) {
    if (!cacheMap[id]) {
      emitTypedError('ANCHOR_NOT_FOUND', { id: id, operation: 'setTTL' }, 'Anchor not found for setTTL');
      return;
    }
    cacheMap[id].ttlMinutes = minutes;
    cacheMap[id].ttlExpiresAt = minutes === null ? null : Date.now() + minutes * 60000;
    saveToStorage(cache);
  }

  function extendTTL(id, minutes) {
    if (!cacheMap[id]) {
      emitTypedError('ANCHOR_NOT_FOUND', { id: id, operation: 'extendTTL' }, 'Anchor not found for extendTTL');
      return;
    }
    if (cacheMap[id].ttlMinutes === null) return;
    cacheMap[id].ttlExpiresAt = (cacheMap[id].ttlExpiresAt || Date.now()) + minutes * 60000;
    if (cacheMap[id].ttlExpiresAt > Date.now() && cacheMap[id].turnsRemaining > 0) {
      cacheMap[id].active = true;
    }
    saveToStorage(cache);
  }

  function resetTTL(id) {
    if (!cacheMap[id]) {
      emitTypedError('ANCHOR_NOT_FOUND', { id: id, operation: 'resetTTL' }, 'Anchor not found for resetTTL');
      return;
    }
    if (cacheMap[id].ttlMinutes === null) return;
    cacheMap[id].ttlExpiresAt = Date.now() + cacheMap[id].ttlMinutes * 60000;
    if (cacheMap[id].turnsRemaining > 0) {
      cacheMap[id].active = true;
    }
    saveToStorage(cache);
  }

  function checkExpiredTTLs() {
    var changed = false;
    var now = Date.now();
    for (var i = 0; i < cache.length; i++) {
      if (cache[i].ttlMinutes !== null && cache[i].ttlExpiresAt !== null && now > cache[i].ttlExpiresAt) {
        if (cache[i].active) {
          cache[i].active = false;
          changed = true;
        }
      }
    }
    if (changed) saveToStorage(cache);
  }

  // --- Query Helpers ---

  function getSorted(sortBy) {
    var list = cache.filter(function(a) { return !a.deleted; });
    if (sortBy === 'most-used') {
      list.sort(function(a, b) { return (b.usageCount || 0) - (a.usageCount || 0); });
    } else if (sortBy === 'recently-used') {
      list.sort(function(a, b) { return (b.lastUsed || 0) - (a.lastUsed || 0); });
    } else {
      list.sort(function(a, b) { return b.order - a.order; });
    }
    return list;
  }

  function setGlobal(id, isGlobal) {
    if (!cacheMap[id]) {
      emitTypedError('ANCHOR_NOT_FOUND', { id: id, operation: 'setGlobal' }, 'Anchor not found for setGlobal');
      return;
    }
    cacheMap[id].global = !!isGlobal;
    saveToStorage(cache);
  }

  function getById(id) {
    return cacheMap[id] && !cacheMap[id].deleted ? cacheMap[id] : null;
  }

  function findByText(text) {
    var matches = [];
    for (var i = 0; i < cache.length; i++) {
      if (!cache[i].deleted && cache[i].text === text) {
        matches.push(cache[i]);
      }
    }
    return matches;
  }

  function getTags() {
    return Object.keys(tagIndex).sort();
  }

  function getAnchorsByTag(tag) {
    var ids = tagIndex[tag.toLowerCase()];
    if (!ids) return [];
    var result = [];
    for (var i = 0; i < ids.length; i++) {
      var a = getById(ids[i]);
      if (a) result.push(a);
    }
    return result;
  }

  function getGlobalOnly() {
    return cache.filter(function(a) { return !a.deleted && a.global; });
  }

  // --- Bulk Operations ---

  function bulkToggle(ids) {
    for (var i = 0; i < ids.length; i++) {
      if (cacheMap[ids[i]]) {
        cacheMap[ids[i]].active = !cacheMap[ids[i]].active;
      }
    }
    saveToStorage(cache);
  }

  function bulkDelete(ids) {
    var changed = false;
    for (var i = 0; i < ids.length; i++) {
      if (cacheMap[ids[i]] && !cacheMap[ids[i]].deleted) {
        cacheMap[ids[i]].deleted = true;
        cacheMap[ids[i]].deletedAt = Date.now();
        changed = true;
      }
    }
    if (changed) saveToStorage(cache);
  }

  function bulkPermanentDelete(ids) {
    if (!ids || !ids.length) return;
    for (var i = 0; i < ids.length; i++) {
      if (cacheMap[ids[i]]) {
        if (cacheMap[ids[i]].tags) {
          for (var t = 0; t < cacheMap[ids[i]].tags.length; t++) {
            var tLower = cacheMap[ids[i]].tags[t].toLowerCase();
            if (tagIndex[tLower]) {
              var idIdx = tagIndex[tLower].indexOf(ids[i]);
              if (idIdx !== -1) tagIndex[tLower].splice(idIdx, 1);
              if (tagIndex[tLower].length === 0) delete tagIndex[tLower];
            }
          }
        }
        cache = cache.filter(function(a) { return a.id !== ids[i]; });
        delete cacheMap[ids[i]];
      }
    }
    saveToStorage(cache);
  }

  function bulkPermanentDeleteTemplates(ids) {
    if (!ids || !ids.length) return;
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < templateCache.length; j++) {
        if (templateCache[j].id === ids[i] && templateCache[j].tags) {
          for (var t = 0; t < templateCache[j].tags.length; t++) {
            var tLower = templateCache[j].tags[t].toLowerCase();
            if (tagIndex[tLower]) {
              var idIdx = tagIndex[tLower].indexOf(ids[i]);
              if (idIdx !== -1) tagIndex[tLower].splice(idIdx, 1);
              if (tagIndex[tLower].length === 0) delete tagIndex[tLower];
            }
          }
          break;
        }
      }
    }
    templateCache = templateCache.filter(function(t) { return t.id && ids.indexOf(t.id) === -1; });
    rebuildTagIndex();
    saveTemplates();
  }

  function bulkPermanentDeleteBundles(ids) {
    if (!ids || !ids.length) return;
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < bundleCache.length; j++) {
        if (bundleCache[j].id === ids[i]) {
          var anchorIds = bundleCache[j].anchorIds;
          for (var k = 0; k < anchorIds.length; k++) {
            if (cacheMap[anchorIds[k]]) {
              cacheMap[anchorIds[k]].active = false;
            }
          }
          if (settings.activeBundleId === bundleCache[j].id) {
            settings.activeBundleId = null;
          }
          break;
        }
      }
    }
    bundleCache = bundleCache.filter(function(b) { return b.id && ids.indexOf(b.id) === -1; });
    saveSettings();
    saveToStorage(cache);
    saveBundles();
  }

  function bulkPermanentDeleteConstraints(ids) {
    if (!ids || !ids.length) return;
    for (var i = 0; i < ids.length; i++) {
      delete constraintCacheMap[ids[i]];
    }
    constraintCache = constraintCache.filter(function(c) { return c.id && ids.indexOf(c.id) === -1; });
    saveConstraintToStorage();
  }

  function bulkExtend(ids, additionalTurns) {
    additionalTurns = additionalTurns || 5;
    for (var i = 0; i < ids.length; i++) {
      if (cacheMap[ids[i]]) {
        cacheMap[ids[i]].turnsRemaining += additionalTurns;
        cacheMap[ids[i]].turnsTotal += additionalTurns;
        if (cacheMap[ids[i]].turnsRemaining > 0) {
          cacheMap[ids[i]].active = true;
        }
      }
    }
    saveToStorage(cache);
  }

  function bulkSetTTL(ids, minutes) {
    for (var i = 0; i < ids.length; i++) {
      if (cacheMap[ids[i]]) {
        cacheMap[ids[i]].ttlMinutes = minutes;
        cacheMap[ids[i]].ttlExpiresAt = minutes === null ? null : Date.now() + minutes * 60000;
      }
    }
    saveToStorage(cache);
  }

  function bulkToggleGlobal(ids) {
    for (var i = 0; i < ids.length; i++) {
      if (cacheMap[ids[i]]) {
        cacheMap[ids[i]].global = !cacheMap[ids[i]].global;
      }
    }
    saveToStorage(cache);
  }

  function bulkToggleTemplateActive(ids) {
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < templateCache.length; j++) {
        if (templateCache[j].id === ids[i]) {
          templateCache[j].active = !templateCache[j].active;
          break;
        }
      }
    }
    saveTemplates();
  }

  function bulkDeleteTemplates(ids) {
    var now = Date.now();
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < templateCache.length; j++) {
        if (templateCache[j].id === ids[i] && !templateCache[j].deleted) {
          templateCache[j].deleted = true;
          templateCache[j].deletedAt = now;
          break;
        }
      }
    }
    saveTemplates();
  }

  function bulkDeleteBundles(ids) {
    var now = Date.now();
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < bundleCache.length; j++) {
        if (bundleCache[j].id === ids[i] && !bundleCache[j].deleted) {
          var anchorIds = bundleCache[j].anchorIds;
          for (var k = 0; k < anchorIds.length; k++) {
            if (cacheMap[anchorIds[k]]) {
              cacheMap[anchorIds[k]].active = false;
            }
          }
          if (settings.activeBundleId === bundleCache[j].id) {
            settings.activeBundleId = null;
          }
          bundleCache[j].deleted = true;
          bundleCache[j].deletedAt = now;
          break;
        }
      }
    }
    saveSettings();
    saveToStorage(cache);
    saveBundles();
  }

  function bulkRestoreAnchors(ids) {
    var changed = false;
    for (var i = 0; i < ids.length; i++) {
      if (cacheMap[ids[i]] && cacheMap[ids[i]].deleted) {
        cacheMap[ids[i]].deleted = false;
        cacheMap[ids[i]].deletedAt = null;
        changed = true;
      }
    }
    if (changed) saveToStorage(cache);
  }

  function bulkRestoreTemplates(ids) {
    var changed = false;
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < templateCache.length; j++) {
        if (templateCache[j].id === ids[i] && templateCache[j].deleted) {
          templateCache[j].deleted = false;
          templateCache[j].deletedAt = null;
          changed = true;
          break;
        }
      }
    }
    if (changed) saveTemplates();
  }

  function bulkRestoreBundles(ids) {
    var changed = false;
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < bundleCache.length; j++) {
        if (bundleCache[j].id === ids[i] && bundleCache[j].deleted) {
          bundleCache[j].deleted = false;
          bundleCache[j].deletedAt = null;
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      saveToStorage(cache);
      saveBundles();
    }
  }

  function bulkResetTurns(ids) {
    for (var i = 0; i < ids.length; i++) {
      if (cacheMap[ids[i]]) {
        var a = cacheMap[ids[i]];
        a.turnsRemaining = a.originalTurns;
        a.turnsTotal = a.originalTurns;
        if (a.turnsRemaining > 0) a.active = true;
      }
    }
    saveToStorage(cache);
  }

  function bulkToggleMembers(bundleIds) {
    var anchorIds = collectAnchorIds(bundleIds);
    for (var i = 0; i < anchorIds.length; i++) {
      if (cacheMap[anchorIds[i]]) {
        cacheMap[anchorIds[i]].active = !cacheMap[anchorIds[i]].active;
      }
    }
    saveToStorage(cache);
  }

  function bulkExtendMembers(bundleIds, additionalTurns) {
    additionalTurns = additionalTurns || 5;
    var anchorIds = collectAnchorIds(bundleIds);
    for (var i = 0; i < anchorIds.length; i++) {
      if (cacheMap[anchorIds[i]]) {
        cacheMap[anchorIds[i]].turnsRemaining += additionalTurns;
        cacheMap[anchorIds[i]].turnsTotal += additionalTurns;
        if (cacheMap[anchorIds[i]].turnsRemaining > 0) {
          cacheMap[anchorIds[i]].active = true;
        }
      }
    }
    saveToStorage(cache);
  }

  function bulkSetMembersTTL(bundleIds, minutes) {
    var anchorIds = collectAnchorIds(bundleIds);
    for (var i = 0; i < anchorIds.length; i++) {
      if (cacheMap[anchorIds[i]]) {
        cacheMap[anchorIds[i]].ttlMinutes = minutes;
        cacheMap[anchorIds[i]].ttlExpiresAt = minutes === null ? null : Date.now() + minutes * 60000;
      }
    }
    saveToStorage(cache);
  }

  function collectAnchorIds(bundleIds) {
    var seen = {};
    var result = [];
    for (var i = 0; i < bundleIds.length; i++) {
      for (var j = 0; j < bundleCache.length; j++) {
        if (bundleCache[j].id === bundleIds[i] && !bundleCache[j].deleted) {
          for (var k = 0; k < bundleCache[j].anchorIds.length; k++) {
            var aid = bundleCache[j].anchorIds[k];
            if (!seen[aid]) {
              seen[aid] = true;
              result.push(aid);
            }
          }
          break;
        }
      }
    }
    return result;
  }

  function bulkSetTemplateTTL(ids, minutes) {
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < templateCache.length; j++) {
        if (templateCache[j].id === ids[i]) {
          templateCache[j].ttlMinutes = minutes;
          templateCache[j].ttlExpiresAt = minutes === null ? null : Date.now() + minutes * 60000;
          break;
        }
      }
    }
    saveTemplates();
  }

  // --- Settings ---

  function getSetting(key) {
    return settings[key];
  }

  function setSetting(key, value) {
    settings[key] = value;
    saveSettings();
  }

  function getInjectionMode() {
    return settings.injectionMode || 'prepend';
  }

  function setInjectionMode(mode) {
    var valid = ['prepend', 'append', 'intermittent'];
    settings.injectionMode = valid.indexOf(mode) !== -1 ? mode : 'prepend';
    saveSettings();
  }

  // --- Soft Delete, Restore & Purge ---

  function restoreAnchor(id) {
    if (!cacheMap[id]) {
      emitTypedError('ANCHOR_NOT_FOUND', { id: id, operation: 'restoreAnchor' }, 'Anchor not found for restore');
      return;
    }
    if (!cacheMap[id].deleted) {
      emitTypedError('ANCHOR_NOT_FOUND', { id: id, operation: 'restoreAnchor' }, 'Anchor not deleted, nothing to restore');
      return;
    }
    cacheMap[id].deleted = false;
    cacheMap[id].deletedAt = null;
    saveToStorage(cache);
  }

  function restoreTemplate(id) {
    var found = false;
    for (var i = 0; i < templateCache.length; i++) {
      if (templateCache[i].id === id && templateCache[i].deleted) {
        templateCache[i].deleted = false;
        templateCache[i].deletedAt = null;
        found = true;
        break;
      }
    }
    if (!found) {
      emitTypedError('TEMPLATE_NOT_FOUND', { id: id, operation: 'restoreTemplate' }, 'Template not found for restore');
    }
    saveTemplates();
  }

  function restoreBundle(id) {
    var found = false;
    for (var i = 0; i < bundleCache.length; i++) {
      if (bundleCache[i].id === id && bundleCache[i].deleted) {
        bundleCache[i].deleted = false;
        bundleCache[i].deletedAt = null;
        found = true;
        break;
      }
    }
    if (!found) {
      emitTypedError('BUNDLE_NOT_FOUND', { id: id, operation: 'restoreBundle' }, 'Bundle not found for restore');
    }
    saveBundles();
  }

  function permanentDeleteAnchor(id) {
    if (!cacheMap[id]) {
      emitTypedError('ANCHOR_NOT_FOUND', { id: id, operation: 'permanentDeleteAnchor' }, 'Anchor not found for permanent delete');
      return;
    }
    if (cacheMap[id].tags) {
      for (var t = 0; t < cacheMap[id].tags.length; t++) {
        var tLower = cacheMap[id].tags[t].toLowerCase();
        if (tagIndex[tLower]) {
          var idIdx = tagIndex[tLower].indexOf(id);
          if (idIdx !== -1) tagIndex[tLower].splice(idIdx, 1);
          if (tagIndex[tLower].length === 0) delete tagIndex[tLower];
        }
      }
    }
    cache = cache.filter(function(a) { return a.id !== id; });
    delete cacheMap[id];
    saveToStorage(cache);
  }

  function permanentDeleteTemplate(id) {
    var found = false;
    for (var i = 0; i < templateCache.length; i++) {
      if (templateCache[i].id === id && templateCache[i].tags) {
        for (var t = 0; t < templateCache[i].tags.length; t++) {
          var tLower = templateCache[i].tags[t].toLowerCase();
          if (tagIndex[tLower]) {
            var idIdx = tagIndex[tLower].indexOf(id);
            if (idIdx !== -1) tagIndex[tLower].splice(idIdx, 1);
            if (tagIndex[tLower].length === 0) delete tagIndex[tLower];
          }
        }
        found = true;
        break;
      }
    }
    if (!found) {
      emitTypedError('TEMPLATE_NOT_FOUND', { id: id, operation: 'permanentDeleteTemplate' }, 'Template not found for permanent delete');
      return;
    }
    templateCache = templateCache.filter(function(t) { return t.id !== id; });
    saveTemplates();
  }

  function permanentDeleteBundle(id) {
    bundleCache = bundleCache.filter(function(b) { return b.id !== id; });
    saveBundles();
  }

  function purgeDeleted(type) {
    var now = Date.now();
    if (type === 'anchors' || type === 'all') {
      cache = cache.filter(function(a) { return !a.deleted || (a.deletedAt && (now - a.deletedAt) < 604800000); });
      rebuildCacheMap();
      rebuildTagIndex();
      saveToStorage(cache);
    }
    if (type === 'templates' || type === 'all') {
      var beforeLen = templateCache.length;
      templateCache = templateCache.filter(function(t) { return !t.deleted || (t.deletedAt && (now - t.deletedAt) < 604800000); });
      if (templateCache.length !== beforeLen) rebuildTagIndex();
      saveTemplates();
    }
    if (type === 'bundles' || type === 'all') {
      bundleCache = bundleCache.filter(function(b) { return !b.deleted || (b.deletedAt && (now - b.deletedAt) < 604800000); });
      saveBundles();
    }
  }

  function getSoftDeleted(type) {
    if (type === 'anchors') return cache.filter(function(a) { return a.deleted; });
    if (type === 'templates') return templateCache.filter(function(t) { return t.deleted; });
    if (type === 'bundles') return bundleCache.filter(function(b) { return b.deleted; });
    if (type === 'constraints') return constraintCache.filter(function(c) { return c.deleted; });
    return [];
  }

  // --- Profile CRUD ---

  function generateProfileId() {
    return 'prof_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  }

  function loadProfilesFromStorage(callback) {
    chrome.storage.local.get('__ca_profiles', function(result) {
      var raw = result && result.__ca_profiles;
      if (Array.isArray(raw)) {
        profileCache = raw;
      } else {
        profileCache = [];
      }
      rebuildProfileMap();
      if (callback) callback();
    });
  }

  function saveProfilesToStorage() {
    clearTimeout(profileDebounceTimer);
    profileDebounceTimer = setTimeout(function() {
      chrome.storage.local.set({ __ca_profiles: profileCache });
    }, 300);
  }

  function rebuildProfileMap() {
    profileCacheMap = {};
    for (var i = 0; i < profileCache.length; i++) {
      profileCacheMap[profileCache[i].id] = profileCache[i];
    }
  }

  function createProfile(name, promptAssembly, personaRole, reasoningProtocol, outputVerbosity, outputFormatChoice, thinkingEffort, groundingMode) {
    var data = validate('profile', { name: name, promptAssembly: promptAssembly });
    if (!data) return null;
    var profile = {
      id: generateProfileId(),
      name: data.name,
      promptAssembly: data.promptAssembly,
      active: data.active,
      createdAt: Date.now(),
      versionHistory: [],
      deleted: false,
      deletedAt: null,
      personaRole: personaRole || '',
      reasoningProtocol: reasoningProtocol || '',
      outputVerbosity: outputVerbosity || '',
      outputFormatChoice: outputFormatChoice || '',
      thinkingEffort: thinkingEffort || '',
      groundingMode: groundingMode || ''
    };
    profileCache.push(profile);
    profileCacheMap[profile.id] = profile;
    saveProfilesToStorage();
    return profile;
  }

  function getAllProfiles() {
    return profileCache.filter(function(p) { return !p.deleted; });
  }

  function getActiveProfile() {
    for (var i = 0; i < profileCache.length; i++) {
      if (profileCache[i].active && !profileCache[i].deleted) return profileCache[i];
    }
    return null;
  }

  function updateProfile(id, updates) {
    if (!profileCacheMap[id]) {
      emitTypedError('PROFILE_NOT_FOUND', { id: id, operation: 'updateProfile' }, 'Profile not found for update');
      return;
    }
    for (var key in updates) {
      if (!updates.hasOwnProperty(key)) continue;
      var rule = SCHEMAS.profile[key];
      if (!rule) continue;
      var val = updates[key];
      if (val !== undefined && val !== null && getType(val) !== rule.type) continue;
      if ((key === 'name' || key === 'promptAssembly') && profileCacheMap[id][key] !== val) {
        if (!profileCacheMap[id].versionHistory) profileCacheMap[id].versionHistory = [];
        profileCacheMap[id].versionHistory.push({ key: key, previous: profileCacheMap[id][key], timestamp: Date.now() });
      }
      profileCacheMap[id][key] = val;
    }
    saveProfilesToStorage();
  }

  function deleteProfile(id) {
    if (!profileCacheMap[id]) return;
    profileCache = profileCache.filter(function(p) { return p.id !== id; });
    profileCacheMap[id] = undefined;
    saveProfilesToStorage();
  }

  function setActiveProfile(id) {
    for (var i = 0; i < profileCache.length; i++) {
      profileCache[i].active = (profileCache[i].id === id);
    }
    saveProfilesToStorage();
  }

  // --- Init & Test Helpers ---

  function init(callback) {
    loadFromStorage(function(anchors) {
      loadProfilesFromStorage(function() {
        if (callback) callback();
      });
    });
  }

  function getStorageBytesInUse(callback) {
    try {
      chrome.storage.local.getBytesInUse(null, function(bytes) {
        if (callback) callback(bytes);
      });
    } catch(e) {
      console.warn('[CA] getStorageBytesInUse failed:', e.message);
      if (callback) callback(0);
    }
  }

  function stagePendingImport(payload, callback) {
    try {
      var obj = {};
      obj[PENDING_IMPORT_KEY] = payload;
      chrome.storage.local.set(obj, function() {
        if (chrome.runtime.lastError) {
          var msg = chrome.runtime.lastError.message;
          var code = msg.indexOf('QUOTA') !== -1 ? 'STORAGE_QUOTA' : 'STORAGE_WRITE';
          emitTypedError(code, { operation: 'stagePendingImport' }, msg);
        }
        if (callback) callback(!chrome.runtime.lastError);
      });
    } catch (e) {
      console.warn('[CA] Extension context invalidated, pending import staging skipped');
      emitTypedError('STORAGE_WRITE', { operation: 'stagePendingImport' }, 'Extension context invalidated: ' + e.message);
      if (callback) callback(false);
    }
  }

  function consumePendingImport(callback) {
    try {
      chrome.storage.local.get(PENDING_IMPORT_KEY, function(result) {
        if (chrome.runtime.lastError) {
          var msg = chrome.runtime.lastError.message;
          var code = msg.indexOf('QUOTA') !== -1 ? 'STORAGE_QUOTA' : 'STORAGE_READ';
          emitTypedError(code, { operation: 'consumePendingImport' }, msg);
          if (callback) callback(null);
          return;
        }
        var payload = result[PENDING_IMPORT_KEY] || null;
        if (payload) {
          chrome.storage.local.remove(PENDING_IMPORT_KEY, function() {
            if (chrome.runtime.lastError) {
              console.warn('[CA] Failed to remove pending import payload:', chrome.runtime.lastError.message);
            }
            if (callback) callback(payload);
          });
        } else {
          if (callback) callback(null);
        }
      });
    } catch (e) {
      console.warn('[CA] Extension context invalidated, pending import consume skipped');
      emitTypedError('STORAGE_READ', { operation: 'consumePendingImport' }, 'Extension context invalidated: ' + e.message);
      if (callback) callback(null);
    }
  }

  // ── Analytics persistence ──

  function saveAnalytics(callback) {
    clearTimeout(analyticsDebounceTimer);
    analyticsDebounceTimer = setTimeout(function() {
      if (!analyticsCache) return;
      var obj = {};
      obj[sk(ANALYTICS_KEY)] = analyticsCache;
      try {
        chrome.storage.local.set(obj, function() {
          if (chrome.runtime.lastError) {
            var msg = chrome.runtime.lastError.message;
            console.error('[CA] Analytics write error:', msg);
            emitTypedError('STORAGE_WRITE', { operation: 'saveAnalytics' }, msg);
          }
          if (callback) callback();
        });
      } catch (e) {
        console.warn('[CA] Extension context invalidated, analytics write skipped');
        emitTypedError('STORAGE_WRITE', { operation: 'saveAnalytics' }, 'Extension context invalidated: ' + e.message);
      }
    }, WRITE_DELAY);
  }

  function getAnalytics() {
    return analyticsCache;
  }

  function setAnalytics(data) {
    analyticsCache = data;
    saveAnalytics();
  }

  function clearAnalytics() {
    analyticsCache = null;
    var key = sk(ANALYTICS_KEY);
    chrome.storage.local.remove(key, function() {});
  }

  function exportAllData() {
    var data = {
      anchors: cache,
      templates: templateCache,
      bundles: bundleCache,
      constraints: constraintCache,
      settings: settings,
      heatmap: heatmapCache,
      analytics: analyticsCache,
      exportedAt: Date.now(),
      version: chrome.runtime.getManifest().version
    };
    return data;
  }

  function importAllData(data) {
    if (!data || typeof data !== 'object') return { success: false, error: 'Invalid format' };
    try {
      if (data.anchors && Array.isArray(data.anchors)) {
        for (var i = 0; i < data.anchors.length; i++) {
          var a = data.anchors[i];
          if (a && a.id && !cacheMap[a.id]) cache.push(a);
        }
      }
      if (data.templates && Array.isArray(data.templates)) {
        for (var j = 0; j < data.templates.length; j++) {
          var t = data.templates[j];
          if (t && t.id) {
            var exists = false;
            for (var k = 0; k < templateCache.length; k++) {
              if (templateCache[k].id === t.id) { exists = true; break; }
            }
            if (!exists) templateCache.push(t);
          }
        }
      }
      if (data.bundles && Array.isArray(data.bundles)) {
        for (var m = 0; m < data.bundles.length; m++) {
          var b = data.bundles[m];
          if (b && b.id) {
            var found = false;
            for (var n = 0; n < bundleCache.length; n++) {
              if (bundleCache[n].id === b.id) { found = true; break; }
            }
            if (!found) bundleCache.push(b);
          }
        }
      }
      if (data.constraints && Array.isArray(data.constraints)) {
        for (var p = 0; p < data.constraints.length; p++) {
          var c = data.constraints[p];
          if (c && c.id && !constraintCacheMap[c.id]) {
            constraintCache.push(c);
            constraintCacheMap[c.id] = c;
          }
        }
      }
      activeCacheDirty = true;
      saveToStorage(cache);
      return { success: true };
    } catch(e) {
      return { success: false, error: e.message };
    }
  }

  function resetAllData(callback) {
    try {
      chrome.storage.local.remove([getStorageKey(), sk(TEMPLATE_KEY), SETTINGS_KEY, sk(HEATMAP_KEY), sk(BUNDLE_KEY), sk(CONSTRAINT_KEY), sk(ANALYTICS_KEY)], function() {
        cache = [];
        cacheMap = {};
        activeCache = [];
        activeCacheDirty = true;
        tagIndex = {};
        templateCache = [];
        settings = { injectionMode: 'prepend', inlineSlash: false };
        heatmapCache = {};
        analyticsCache = null;
        bundleCache = [];
        constraintCache = [];
        constraintCacheMap = {};
        profileCache = [];
        profileCacheMap = {};
        if (callback) callback(true);
      });
    } catch(e) {
      if (callback) callback(false);
    }
  }

  function resetForTesting() {
    cache = [];
    cacheMap = {};
    activeCache = [];
    activeCacheDirty = true;
    tagIndex = {};
    templateCache = [];
    settings = { injectionMode: 'prepend', activeBundleId: null };
    heatmapCache = {};
    bundleCache = [];
    constraintCache = [];
    constraintCacheMap = {};
    profileCache = [];
    profileCacheMap = {};
    clearTimeout(DEBOUNCE_TIMER);
    clearTimeout(templateDebounceTimer);
    clearTimeout(bundleDebounceTimer);
    clearTimeout(syncDebounceTimer);
    clearTimeout(constraintDebounceTimer);
    DEBOUNCE_TIMER = null;
    templateDebounceTimer = null;
    bundleDebounceTimer = null;
    syncDebounceTimer = null;
    constraintDebounceTimer = null;
  }

  var Storage = {
    init: init,
    createAnchor: createAnchor,
    getAll: getAll,
    getActive: getActive,
    getSorted: getSorted,
    getById: getById,
    findByText: findByText,
    getTags: getTags,
    getAnchorsByTag: getAnchorsByTag,
    getGlobalOnly: getGlobalOnly,
    updateAnchor: updateAnchor,
    deleteAnchor: deleteAnchor,
    toggleAnchor: toggleAnchor,
    setGlobal: setGlobal,
    extendTurns: extendTurns,
    resetTurns: resetTurns,
    addTag: addTag,
    removeTag: removeTag,
    renameTag: renameTag,
    mergeTags: mergeTags,
    addBulkTag: addBulkTag,
    removeBulkTag: removeBulkTag,
    addTriggerKeyword: addTriggerKeyword,
    removeTriggerKeyword: removeTriggerKeyword,
    bulkToggle: bulkToggle,
    bulkDelete: bulkDelete,
    bulkPermanentDelete: bulkPermanentDelete,
    bulkPermanentDeleteTemplates: bulkPermanentDeleteTemplates,
    bulkPermanentDeleteBundles: bulkPermanentDeleteBundles,
    bulkPermanentDeleteConstraints: bulkPermanentDeleteConstraints,
    bulkExtend: bulkExtend,
    bulkSetTTL: bulkSetTTL,
    bulkToggleGlobal: bulkToggleGlobal,
    bulkDeleteTemplates: bulkDeleteTemplates,
    bulkDeleteBundles: bulkDeleteBundles,
    bulkRestoreAnchors: bulkRestoreAnchors,
    bulkRestoreTemplates: bulkRestoreTemplates,
    bulkRestoreBundles: bulkRestoreBundles,
    bulkResetTurns: bulkResetTurns,
    bulkToggleMembers: bulkToggleMembers,
    bulkExtendMembers: bulkExtendMembers,
    bulkSetMembersTTL: bulkSetMembersTTL,
    bulkSetTemplateTTL: bulkSetTemplateTTL,
    decrementTurnsForActive: decrementTurnsForActive,
    decrementTurnsForIds: decrementTurnsForIds,
    trackAnchorUsage: trackAnchorUsage,
    clearExpired: clearExpired,
    setTTL: setTTL,
    extendTTL: extendTTL,
    resetTTL: resetTTL,
    checkExpiredTTLs: checkExpiredTTLs,
    getUsageHeatmap: getUsageHeatmap,
    setUsageHeatmap: setUsageHeatmap,
    getSetting: getSetting,
    setSetting: setSetting,
    getStorageBytesInUse: getStorageBytesInUse,
    exportAllData: exportAllData,
    importAllData: importAllData,
    stagePendingImport: stagePendingImport,
    consumePendingImport: consumePendingImport,
    setSessionId: setSessionId,
    resetAllData: resetAllData,
    getAnalytics: getAnalytics,
    setAnalytics: setAnalytics,
    clearAnalytics: clearAnalytics,
    getInjectionMode: getInjectionMode,
    setInjectionMode: setInjectionMode,
    createTemplate: createTemplate,
    getTemplates: getTemplates,
    deleteTemplate: deleteTemplate,
    updateTemplate: updateTemplate,
    activateTemplate: activateTemplate,
    addTemplateTag: addTemplateTag,
    removeTemplateTag: removeTemplateTag,
    addTemplateTriggerKeyword: addTemplateTriggerKeyword,
    removeTemplateTriggerKeyword: removeTemplateTriggerKeyword,
    toggleTemplateActive: toggleTemplateActive,
    getActiveTemplates: getActiveTemplates,
    setTemplateTTL: setTemplateTTL,
    extendTemplateTTL: extendTemplateTTL,
    resetTemplateTTL: resetTemplateTTL,
    checkExpiredTemplateTTLs: checkExpiredTemplateTTLs,
    bulkToggleTemplateActive: bulkToggleTemplateActive,
    bulkActivateTemplate: bulkActivateTemplate,
    createConstraint: createConstraint,
    getAllConstraints: getAllConstraints,
    getActiveConstraints: getActiveConstraints,
    getConstraintById: getConstraintById,
    toggleConstraint: toggleConstraint,
    deleteConstraint: deleteConstraint,
    updateConstraint: updateConstraint,
    linkConstraintToSession: linkConstraintToSession,
    clearSessionConstraints: clearSessionConstraints,
    bulkDeleteConstraints: bulkDeleteConstraints,
    bulkToggleConstraints: bulkToggleConstraints,
    bulkSetConstraintPriority: bulkSetConstraintPriority,
    restoreConstraint: restoreConstraint,
    permanentDeleteConstraint: permanentDeleteConstraint,
    bulkRestoreConstraints: bulkRestoreConstraints,
    createBundle: createBundle,
    getBundles: getBundles,
    deleteBundle: deleteBundle,
    updateBundle: updateBundle,
    toggleBundle: toggleBundle,
    activateBundleExclusively: activateBundleExclusively,
    deactivateAllBundles: deactivateAllBundles,
    getActiveBundleId: getActiveBundleId,
    restoreAnchor: restoreAnchor,
    restoreVersion: restoreVersion,
    restoreTemplate: restoreTemplate,
    restoreBundle: restoreBundle,
    permanentDeleteAnchor: permanentDeleteAnchor,
    permanentDeleteTemplate: permanentDeleteTemplate,
    permanentDeleteBundle: permanentDeleteBundle,
    purgeDeleted: purgeDeleted,
    getSoftDeleted: getSoftDeleted,
    resetForTesting: resetForTesting,
    _setCache: function(c) { cache = c; activeCacheDirty = true; rebuildCacheMap(); rebuildTagIndex(); },
    _getCache: function() { return cache; },
    _setTemplateCache: function(c) { templateCache = c; },
    _getTemplateCache: function() { return templateCache; },
    _getSettings: function() { return settings; },
    _setSettings: function(s) { settings = s; },
    _getHeatmapCache: function() { return heatmapCache; },
    _setHeatmapCache: function(h) { heatmapCache = h; },
    _setBundleCache: function(c) { bundleCache = c; },
    _getBundleCache: function() { return bundleCache; },
    _setProfileCache: function(c) { profileCache = c; rebuildProfileMap(); },
    _getProfileCache: function() { return profileCache; },
    createProfile: createProfile,
    getAllProfiles: getAllProfiles,
    getActiveProfile: getActiveProfile,
    updateProfile: updateProfile,
    deleteProfile: deleteProfile,
    setActiveProfile: setActiveProfile
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Storage;
  } else if (typeof window !== 'undefined') {
    window.__ca = window.__ca || {};
    window.__ca.storage = Storage;
  } else if (typeof root !== 'undefined') {
    root.__ca = root.__ca || {};
    root.__ca.storage = Storage;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null));