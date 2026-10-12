(() => {
  const scriptStyleHref = (() => { try { const url=new URL(document.currentScript?.src||'',document.baseURI); return document.currentScript?.src&&url.origin===location.origin?new URL('ftue-shell.css',url).href:null; } catch(_){return null;} })();
  if (window.__CAPP_FTUE_AGENT_INSTALLED__) return;
  window.__CAPP_FTUE_AGENT_INSTALLED__ = true;

  const SIDECAR_ID = 'uk.capp.sidecar.ftue';
  const PROTOCOL = 'capp.ftue-agent.v1';
  const registeredTargets = new Map();
  const registeredActions = new Map();
  let knowledgeProvider = null;
  let workflowStartHandler = null;
  let workflowPreparation = null;
  const pendingShellRequests = new Map();
  let requestSequence = 0;
  let selectionMode = false;
  let selectedCandidate = null;
  let selectionOverlay = null;
  let selectionTray = null;
  let spotlight = null;
  let spotlightTarget = null;
  let spotlightStep = null;
  let repositionFrame = 0;

  // Shell and appFrame are separate documents. Reuse the declared stylesheet
  // in each document, not an early inline <style> that cannot see Tauri's later
  // nonce anchor. The same path is resolved by the verified Showcase VFS.
  const AGENT_STYLE_HREF = scriptStyleHref || '/capp-sidecars/ftue/ftue-shell.css';
  let agentStylePromise = null;
  let agentStyleStatus = 'idle';
  let focusGeneration = 0;
  let selectionGeneration = 0;
  const ensureAgentStyles = () => {
    if (agentStylePromise) return agentStylePromise;
    agentStyleStatus = 'loading';
    const matches = link => {
      if (link.getAttribute('href') === AGENT_STYLE_HREF) return true;
      try { return link.href === new URL(AGENT_STYLE_HREF, document.baseURI).href; } catch (_error) { return false; }
    };
    const existing = [...document.querySelectorAll('link[rel="stylesheet"]')].find(matches);
    const link = existing || document.createElement('link');
    if (!existing) {
      link.id = 'cappFtueAgentStyles';
      link.rel = 'stylesheet';
      link.href = AGENT_STYLE_HREF;
      link.setAttribute('data-capp-ftue-protected', 'true');
    }
    const pending = new Promise((resolve, reject) => {
      let timer = 0;
      const cleanup = () => {
        clearTimeout(timer);
        link.removeEventListener('load', loaded);
        link.removeEventListener('error', failed);
      };
      const loaded = () => {
        cleanup();
        agentStyleStatus = 'ready';
        // Shared with the shell loader when both run in one document.
        link.dataset.cappFtueReady = 'true';
        resolve();
      };
      const failed = () => {
        cleanup();
        agentStyleStatus = 'failed';
        if (!existing) link.remove();
        reject(new Error('CAPP_GUIDE_STYLES_UNAVAILABLE: Guide tour stylesheet could not load. Reopen Guide to retry.'));
      };
      link.addEventListener('load', loaded, { once: true });
      link.addEventListener('error', failed, { once: true });
      timer = setTimeout(failed, 5000);
      if (existing && link.sheet && !link.disabled) { loaded(); return; }
      if (!existing) (document.head || document.documentElement).appendChild(link);
    });
    agentStylePromise = pending.catch(error => {
      agentStylePromise = null;
      emit('styles-failed', { code: 'CAPP_GUIDE_STYLES_UNAVAILABLE', error: String(error.message || error) });
      throw error;
    });
    return agentStylePromise;
  };
  const requireFixedSurfaces = (...elements) => {
    if (elements.every(element => getComputedStyle(element).position === 'fixed')) return;
    throw new Error('CAPP_GUIDE_STYLES_UNAVAILABLE: Guide overlay styles are missing or overridden; the tour was not displayed.');
  };

  const bounded = (value, limit = 240) => {
    const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text;
  };
  const serialise = value => {
    try { return JSON.parse(JSON.stringify(value)); } catch (_error) { return null; }
  };
  const cssEscape = value => {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, char => `\\${char.codePointAt(0).toString(16)} `);
  };
  const currentRoute = () => `${location.pathname || '/'}${location.search || ''}${location.hash || ''}`;
  const routeKey = () => `${location.pathname || '/'}${location.hash || ''}`;
  const elementLabel = element => bounded(
    element && (
      element.getAttribute('aria-label')
      || element.getAttribute('title')
      || element.getAttribute('alt')
      || element.getAttribute('placeholder')
      || element.innerText
      || element.textContent
      || element.getAttribute('name')
      || element.id
    ),
    120,
  );
  const inferredRole = element => {
    const explicit = element && element.getAttribute && element.getAttribute('role');
    if (explicit) return explicit;
    const tag = String(element && element.tagName || '').toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a') return 'link';
    if (tag === 'input') return String(element.type || '').toLowerCase() === 'checkbox' ? 'checkbox' : 'textbox';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'nav') return 'navigation';
    return '';
  };
  const slug = value => bounded(value, 70).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'target';
  const hashText = value => {
    let hash = 2166136261;
    for (const char of String(value || '')) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  };
  const cssPath = element => {
    if (!element || element.nodeType !== 1) return '';
    const guideExplicit = element.getAttribute('data-capp-guide-id');
    if (guideExplicit) return `[data-capp-guide-id="${cssEscape(guideExplicit)}"]`;
    const explicit = element.getAttribute('data-capp-ftue-id');
    if (explicit) return `[data-capp-ftue-id="${cssEscape(explicit)}"]`;
    if (element.id) return `#${cssEscape(element.id)}`;
    const testId = element.getAttribute('data-testid');
    if (testId) return `[data-testid="${cssEscape(testId)}"]`;
    const parts = [];
    let node = element;
    while (node && node.nodeType === 1 && parts.length < 7 && node !== document.documentElement) {
      let part = String(node.tagName || '').toLowerCase();
      if (!part) break;
      const stableClass = [...node.classList].find(name => /^[a-zA-Z][a-zA-Z0-9_-]{2,48}$/.test(name) && !/(active|open|selected|hover|focus|loading|error|mobile|desktop)/i.test(name));
      if (stableClass) part += `.${cssEscape(stableClass)}`;
      const parent = node.parentElement;
      if (parent) {
        const peers = [...parent.children].filter(item => item.tagName === node.tagName);
        if (peers.length > 1) part += `:nth-of-type(${peers.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      if (parent && (parent.id || parent.getAttribute('data-capp-guide-id') || parent.getAttribute('data-capp-ftue-id'))) {
        if (parent.id) parts.unshift(`#${cssEscape(parent.id)}`);
        else if (parent.getAttribute('data-capp-guide-id')) parts.unshift(`[data-capp-guide-id="${cssEscape(parent.getAttribute('data-capp-guide-id'))}"]`);
        else parts.unshift(`[data-capp-ftue-id="${cssEscape(parent.getAttribute('data-capp-ftue-id'))}"]`);
        break;
      }
      node = parent;
    }
    return parts.join(' > ');
  };
  const descriptorFor = element => {
    if (!element || element.nodeType !== 1) return null;
    const guideExplicitId = bounded(element.getAttribute('data-capp-guide-id'), 100);
    const explicitId = bounded(element.getAttribute('data-capp-ftue-id'), 100);
    const label = elementLabel(element);
    const role = inferredRole(element);
    const selectorCandidates = [];
    if (guideExplicitId) selectorCandidates.push(`[data-capp-guide-id="${cssEscape(guideExplicitId)}"]`);
    if (explicitId) selectorCandidates.push(`[data-capp-ftue-id="${cssEscape(explicitId)}"]`);
    if (element.id) selectorCandidates.push(`#${cssEscape(element.id)}`);
    const testId = bounded(element.getAttribute('data-testid'), 100);
    if (testId) selectorCandidates.push(`[data-testid="${cssEscape(testId)}"]`);
    const aria = bounded(element.getAttribute('aria-label'), 120);
    if (aria) selectorCandidates.push(`[aria-label="${cssEscape(aria)}"]`);
    const path = cssPath(element);
    if (path) selectorCandidates.push(path);
    const tag = String(element.tagName || '').toLowerCase();
    const rect = element.getBoundingClientRect();
    const idBase = guideExplicitId || explicitId || element.id || `${role || tag}-${slug(label)}`;
    const targetId = guideExplicitId || explicitId || `guide-${slug(idBase)}-${hashText(`${routeKey()}|${path}|${label}`)}`;
    return {
      protocol: 'capp.ftue-target.v1',
      id: targetId,
      targetId,
      selectors: [...new Set(selectorCandidates)].slice(0, 5),
      route: routeKey(),
      tag,
      role,
      name: aria || label,
      text: bounded(element.innerText || element.textContent, 180),
      fingerprint: {
        tag,
        role,
        name: aria || label,
        inputType: bounded(element.getAttribute('type'), 40),
        dataGuideId: guideExplicitId,
        dataFtueId: explicitId,
        testId,
      },
      rect: {
        left: Math.round(rect.left), top: Math.round(rect.top),
        width: Math.round(rect.width), height: Math.round(rect.height),
      },
      capturedAt: new Date().toISOString(),
    };
  };
  const protectedElement = element => Boolean(element && element.closest && element.closest(
    '#cappFtueShellHost,#cappFtueSelectionOverlay,#cappFtueSelectionTray,#cappFtueSpotlight,[data-capp-ftue-protected="true"],[data-capp-ai-protected="true"]',
  ));
  const routeHash = value => {
    const text = String(value || '').trim();
    const index = text.indexOf('#');
    return index >= 0 ? text.slice(index) : '';
  };
  const routeRuleMatches = (rule, actual) => rule.endsWith('*') ? actual.startsWith(rule.slice(0, -1)) : actual === rule;
  const routeMatches = (wanted, actual = routeKey()) => {
    const rule = String(wanted || '').trim();
    const current = String(actual || '').trim();
    if (!rule || rule === '*' || rule === '/*') return true;
    if (rule.startsWith('#')) return routeRuleMatches(rule, routeHash(currentRoute()));
    return routeRuleMatches(rule, current) || routeRuleMatches(rule, currentRoute());
  };
  const visibleElement = element => {
    if (!element || !element.isConnected) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
  };
  const findByRoleName = target => {
    const role = String(target && (target.role || target.fingerprint && target.fingerprint.role) || '').trim().toLowerCase();
    const name = String(target && (target.name || target.fingerprint && target.fingerprint.name) || '').trim().toLowerCase();
    if (!role && !name) return null;
    const candidates = [...document.querySelectorAll('button,a,input,select,textarea,[role],[aria-label],[data-capp-guide-id],[data-capp-ftue-id]')];
    return candidates.find(element => {
      if (role && inferredRole(element).toLowerCase() !== role) return false;
      if (name) {
        const label = elementLabel(element).toLowerCase();
        if (!(label === name || label.includes(name) || name.includes(label))) return false;
      }
      return visibleElement(element);
    }) || null;
  };
  const findByText = target => {
    const wanted = bounded(target && target.text, 180).toLowerCase();
    if (!wanted || wanted.length < 3) return null;
    const candidates = [...document.querySelectorAll('button,a,label,[role],h1,h2,h3,h4,h5,h6,p,span,div')].slice(0, 1600);
    return candidates.find(element => {
      const text = bounded(element.innerText || element.textContent, 180).toLowerCase();
      return visibleElement(element) && (text === wanted || (wanted.length > 18 && text.includes(wanted.slice(0, 80))));
    }) || null;
  };
  const resolveTarget = rawTarget => {
    const target = rawTarget && typeof rawTarget === 'object' ? rawTarget : registeredTargets.get(String(rawTarget || ''));
    if (!target) return { element: null, target: null, reason: 'target-not-declared' };
    if (!routeMatches(target.route)) return { element: null, target, reason: 'route-mismatch' };
    const registered = registeredTargets.get(String(target.id || target.targetId || ''));
    const combined = registered ? { ...target, ...registered } : target;
    for (const selector of Array.isArray(combined.selectors) ? combined.selectors : []) {
      try {
        const element = document.querySelector(String(selector));
        if (visibleElement(element)) return { element, target: combined, reason: 'selector' };
      } catch (_error) {}
    }
    const guideDataId = combined.fingerprint && combined.fingerprint.dataGuideId;
    if (guideDataId) {
      const element = document.querySelector(`[data-capp-guide-id="${cssEscape(guideDataId)}"]`);
      if (visibleElement(element)) return { element, target: combined, reason: 'data-capp-guide-id' };
    }
    const dataId = combined.fingerprint && combined.fingerprint.dataFtueId;
    if (dataId) {
      const element = document.querySelector(`[data-capp-ftue-id="${cssEscape(dataId)}"]`);
      if (visibleElement(element)) return { element, target: combined, reason: 'data-capp-ftue-id' };
    }
    const semantic = findByRoleName(combined);
    if (semantic) return { element: semantic, target: combined, reason: 'role-name' };
    const textMatch = findByText(combined);
    if (textMatch) return { element: textMatch, target: combined, reason: 'text' };
    return { element: null, target: combined, reason: 'not-found' };
  };

  const emit = (name, detail = {}) => {
    const payload = { protocol: PROTOCOL, id: SIDECAR_ID, name, detail: serialise(detail), at: new Date().toISOString() };
    try { window.dispatchEvent(new CustomEvent('capp:ftue-agent-event', { detail: payload })); } catch (_error) {}
    try { if (parent && parent !== window) parent.postMessage({ type: 'capp-ftue-agent-event', event: payload }, '*'); } catch (_error) {}
    return payload;
  };
  const ensureSelectionUi = () => {
    if (!selectionOverlay) {
      selectionOverlay = document.createElement('div');
      selectionOverlay.id = 'cappFtueSelectionOverlay';
      selectionOverlay.setAttribute('data-capp-ftue-protected', 'true');
      selectionOverlay.hidden = true;
      document.documentElement.appendChild(selectionOverlay);
    }
    if (!selectionTray) {
      selectionTray = document.createElement('div');
      selectionTray.id = 'cappFtueSelectionTray';
      selectionTray.setAttribute('data-capp-ftue-protected', 'true');
      selectionTray.hidden = true;
      selectionTray.innerHTML = '<strong>Tap an element to attach this Guide step</strong><button type="button" data-ftue-selection-cancel>Cancel</button>';
      selectionTray.querySelector('[data-ftue-selection-cancel]').addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation(); stopSelection('cancelled');
      });
      document.documentElement.appendChild(selectionTray);
    }
  };
  const positionSelection = element => {
    ensureSelectionUi();
    selectedCandidate = element || null;
    if (!element) { selectionOverlay.hidden = true; return; }
    const rect = element.getBoundingClientRect();
    selectionOverlay.hidden = false;
    selectionOverlay.style.setProperty('--capp-ftue-select-left', `${Math.max(0, rect.left)}px`);
    selectionOverlay.style.setProperty('--capp-ftue-select-top', `${Math.max(0, rect.top)}px`);
    selectionOverlay.style.setProperty('--capp-ftue-select-width', `${Math.max(0, rect.width)}px`);
    selectionOverlay.style.setProperty('--capp-ftue-select-height', `${Math.max(0, rect.height)}px`);
  };
  const candidateAt = event => {
    const x = Number(event.clientX || event.touches && event.touches[0] && event.touches[0].clientX || 0);
    const y = Number(event.clientY || event.touches && event.touches[0] && event.touches[0].clientY || 0);
    const element = document.elementFromPoint(x, y);
    return element && !protectedElement(element) ? element : null;
  };
  const onSelectionPointer = event => {
    if (!selectionMode) return;
    const element = candidateAt(event);
    if (element) positionSelection(element);
  };
  const onSelectionClick = event => {
    if (!selectionMode) return;
    const element = candidateAt(event) || selectedCandidate;
    if (!element || protectedElement(element)) return;
    event.preventDefault(); event.stopImmediatePropagation(); event.stopPropagation();
    const detail = descriptorFor(element);
    stopSelection('selected');
    emit('selection', detail);
  };
  const stopSelection = reason => {
    selectionGeneration += 1;
    selectionMode = false;
    document.documentElement.classList.remove('capp-ftue-selection-active');
    document.removeEventListener('pointermove', onSelectionPointer, true);
    document.removeEventListener('pointerdown', onSelectionPointer, true);
    document.removeEventListener('click', onSelectionClick, true);
    document.removeEventListener('touchmove', onSelectionPointer, true);
    if (selectionOverlay) selectionOverlay.hidden = true;
    if (selectionTray) selectionTray.hidden = true;
    if (reason && reason !== 'selected') emit('selection-cancelled', { reason });
  };
  const startSelection = async () => {
    stopSelection();
    const generation = selectionGeneration;
    await ensureAgentStyles();
    if (generation !== selectionGeneration) return { active: false, reason: 'cancelled' };
    ensureSelectionUi();
    requireFixedSurfaces(selectionOverlay, selectionTray);
    selectionMode = true;
    selectedCandidate = null;
    selectionTray.hidden = false;
    document.documentElement.classList.add('capp-ftue-selection-active');
    document.addEventListener('pointermove', onSelectionPointer, true);
    document.addEventListener('pointerdown', onSelectionPointer, true);
    document.addEventListener('touchmove', onSelectionPointer, true);
    document.addEventListener('click', onSelectionClick, true);
    emit('selection-started', { touch: matchMedia('(pointer: coarse)').matches });
    return { active: true };
  };

  let confirmedStep = null;
  const ensureSpotlight = () => {
    if (spotlight) return spotlight;
    spotlight = document.createElement('div');
    spotlight.id = 'cappFtueSpotlight';
    spotlight.setAttribute('data-capp-ftue-protected', 'true');
    spotlight.hidden = true;
    spotlight.innerHTML = `
      <div class="capp-ftue-focus-ring" data-ftue-focus-ring></div>
      <section class="capp-ftue-tooltip" role="dialog" aria-live="polite">
        <div class="capp-ftue-progress" data-ftue-progress></div>
        <h2 data-ftue-title></h2>
        <p data-ftue-body></p>
        <p class="capp-ftue-tip" data-ftue-tip hidden></p>
        <p class="capp-ftue-action-status" data-ftue-action-status hidden></p>
        <div class="capp-ftue-tour-actions">
          <button type="button" data-ftue-action="skip">Cancel</button>
          <span></span>
          <button type="button" data-ftue-action="back">Back</button>
          <button class="primary" type="button" data-ftue-action="next">Next</button>
          <button class="primary" type="button" data-ftue-action="perform" hidden>Do this</button>
        </div>
      </section>`;
    spotlight.querySelectorAll('[data-ftue-action]').forEach(button => button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      confirmedStep = event.isTrusted && button.dataset.ftueAction === 'perform' && !button.disabled
        ? { id: spotlightStep?.id, generation: focusGeneration } : null;
      emit('tour-action', { action: button.dataset.ftueAction, stepId: spotlightStep && spotlightStep.id || null });
    }));
    document.documentElement.appendChild(spotlight);
    if(typeof ResizeObserver==='function')new ResizeObserver(repositionSpotlight).observe(spotlight.querySelector('.capp-ftue-tooltip'));
    return spotlight;
  };
  const tooltipPosition = (rect, placement, width = 340, height = 220) => {
    const gap = 12;
    const vw = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    const vh = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    const safe = 10;
    const choices = placement && placement !== 'auto' ? [placement] : ['bottom', 'top', 'right', 'left'];
    for (const choice of choices) {
      let left = rect.left;
      let top = rect.bottom + gap;
      if (choice === 'top') top = rect.top - height - gap;
      if (choice === 'right') { left = rect.right + gap; top = rect.top; }
      if (choice === 'left') { left = rect.left - width - gap; top = rect.top; }
      left = Math.max(safe, Math.min(vw - width - safe, left));
      top = Math.max(safe, Math.min(vh - height - safe, top));
      const overlaps = !(left + width < rect.left || left > rect.right || top + height < rect.top || top > rect.bottom);
      if (!overlaps || choices.length === 1) return { left, top };
    }
    return { left: safe, top: Math.max(safe, vh - height - safe) };
  };
  const repositionSpotlight = () => {
    if (!spotlight || spotlight.hidden || !spotlightTarget) return;
    cancelAnimationFrame(repositionFrame);
    repositionFrame = requestAnimationFrame(() => {
      if (!spotlightTarget?.isConnected) spotlightTarget=resolveTarget(spotlightStep?.targetId).element;
      if (!spotlightTarget) return;
      const rect = spotlightTarget.getBoundingClientRect();
      const ring = spotlight.querySelector('[data-ftue-focus-ring]');
      ring.style.setProperty('--capp-ftue-focus-left', `${Math.max(4, rect.left - 5)}px`);
      ring.style.setProperty('--capp-ftue-focus-top', `${Math.max(4, rect.top - 5)}px`);
      ring.style.setProperty('--capp-ftue-focus-width', `${Math.max(12, rect.width + 10)}px`);
      ring.style.setProperty('--capp-ftue-focus-height', `${Math.max(12, rect.height + 10)}px`);
      const tooltip = spotlight.querySelector('.capp-ftue-tooltip');
      const measured = tooltip.getBoundingClientRect();
      const point = tooltipPosition(rect, spotlightStep && spotlightStep.placement || 'auto', Math.max(280, measured.width || 340), Math.max(150, measured.height || 220));
      tooltip.style.setProperty('--capp-ftue-tooltip-left', `${point.left}px`);
      tooltip.style.setProperty('--capp-ftue-tooltip-top', `${point.top}px`);
    });
  };
  const waitForResolvedTarget = async (target, timeoutMs = 0, isCurrent = () => true) => {
    const limit = Math.max(0, Math.min(15000, Number(timeoutMs || 0)));
    const started = Date.now();
    let resolved = resolveTarget(target);
    while (!resolved.element && isCurrent() && Date.now() - started < limit) {
      await new Promise(resolve => setTimeout(resolve, 100));
      resolved = resolveTarget(target);
    }
    return isCurrent() ? resolved : { element: null, reason: 'cancelled' };
  };
  const showSpotlight = async payload => {
    const generation = ++focusGeneration;
    if (spotlight) spotlight.hidden = true;
    const step = payload && payload.step || {};
    const target = payload && payload.target || step.target || registeredTargets.get(String(step.targetId || ''));
    const resolved = await waitForResolvedTarget(target || step.targetId, payload && payload.timeoutMs, () => generation === focusGeneration);
    if (!resolved.element) return { visible: false, reason: resolved.reason, targetId: step.targetId || target && target.id || null };
    await ensureAgentStyles();
    if (generation !== focusGeneration) return { visible: false, reason: 'cancelled' };
    ensureSpotlight();
    requireFixedSurfaces(spotlight, spotlight.querySelector('[data-ftue-focus-ring]'), spotlight.querySelector('.capp-ftue-tooltip'));
    const action = payload && payload.action && typeof payload.action === 'object' ? payload.action : null;
    const actionType = String(action && action.type || '').toLowerCase();
    // App actions operate through their registered handler. Keep the authored
    // container as the target instead of highlighting its first text input.
    const actionControl = ['input', 'select', 'click'].includes(actionType) ? actionableControl(resolved.element, actionType, target || {}) : null;
    spotlightTarget = actionControl || resolved.element;
    spotlightStep = step;
    spotlight.hidden = false;
    spotlight.querySelector('[data-ftue-title]').textContent = bounded(step.title || 'Getting started', 120);
    spotlight.querySelector('[data-ftue-body]').textContent = bounded(step.body || step.description || '', 700);
    const tip = spotlight.querySelector('[data-ftue-tip]');
    tip.textContent = bounded(step.tip || '', 400);
    tip.hidden = !tip.textContent;
    const executionMode = String(payload && payload.executionMode || 'guided');
    const progressText = payload && payload.progress || '';
    spotlight.querySelector('[data-ftue-progress]').textContent = executionMode === 'guided' ? progressText : `${executionMode === 'auto-all' ? 'AUTO' : 'AUTO SAFE'} · ${progressText}`;
    const back = spotlight.querySelector('[data-ftue-action="back"]');
    const next = spotlight.querySelector('[data-ftue-action="next"]');
    const perform = spotlight.querySelector('[data-ftue-action="perform"]');
    const actionable = Boolean(action && action.type && action.type !== 'focus');
    back.disabled = Boolean(payload && payload.first);
    next.hidden = actionable;
    next.textContent = payload && payload.last ? 'Done' : 'Next';
    perform.hidden = !actionable;
    perform.disabled = false;
    perform.textContent = bounded(action && action.label || (action && action.type === 'click' ? 'Continue' : 'Apply this step'), 120);
    const actionStatus = spotlight.querySelector('[data-ftue-action-status]');
    actionStatus.hidden = executionMode === 'guided';
    actionStatus.textContent = executionMode === 'auto-all'
      ? 'Auto controller is applying this declared step. Press Cancel to stop.'
      : executionMode === 'auto-safe'
        ? 'Auto safe mode applies fields automatically and pauses before clicks or app actions.'
        : '';
    actionStatus.classList.remove('error');
    if (executionMode === 'guided') actionStatus.textContent = '';
    spotlightTarget.scrollIntoView({ block: 'center', inline: 'nearest', behavior: payload && payload.instant ? 'auto' : 'smooth' });
    // Position on the next frame even when the target is already on screen.
    // Scroll events keep following a smooth scroll; no fixed settling sleep.
    repositionSpotlight();
    window.addEventListener('resize', repositionSpotlight, { passive: true });
    window.addEventListener('scroll', repositionSpotlight, true);
    emit('tour-visible', { stepId: step.id || null, targetId: target && target.id || step.targetId || null, resolution: resolved.reason, actionControlResolved: Boolean(actionControl) });
    return { visible: true, targetId: target && target.id || step.targetId || null, resolution: resolved.reason, actionControlResolved: Boolean(actionControl) };
  };
  const hideSpotlight = () => {
    focusGeneration += 1;
    cancelAnimationFrame(repositionFrame);
    if (spotlight) spotlight.hidden = true;
    spotlightTarget = null;
    spotlightStep = null;
    window.removeEventListener('resize', repositionSpotlight);
    window.removeEventListener('scroll', repositionSpotlight, true);
    return { visible: false };
  };

  const actionSelector = type => {
    if (type === 'click') return 'button,[role="button"],input[type="button"],input[type="submit"]';
    if (type === 'select') return 'select';
    return 'input:not([type="hidden"]):not([type="file"]):not([type="password"]),textarea,[contenteditable="true"]';
  };
  const isActionControl = (element, type) => {
    if (!element || protectedElement(element)) return false;
    const tag = String(element.tagName || '').toLowerCase();
    const role = String(element.getAttribute && element.getAttribute('role') || '').toLowerCase();
    const inputType = String(element.getAttribute && element.getAttribute('type') || element.type || '').toLowerCase();
    if (type === 'click') return tag === 'button' || role === 'button' || tag === 'input' && ['button', 'submit'].includes(inputType);
    if (type === 'select') return tag === 'select';
    if (element.isContentEditable) return true;
    if (!['input', 'textarea'].includes(tag)) return false;
    return !['hidden', 'file', 'password'].includes(inputType);
  };
  const controlAccessibleName = element => {
    if (!element) return '';
    const labels = element.labels ? [...element.labels].map(label => elementLabel(label)).filter(Boolean) : [];
    return bounded([
      element.getAttribute && element.getAttribute('aria-label'),
      element.getAttribute && element.getAttribute('placeholder'),
      element.getAttribute && element.getAttribute('name'),
      ...labels,
    ].filter(Boolean).join(' '), 240).toLowerCase();
  };
  const associatedControlIds = element => {
    const ids = [];
    for (const attribute of ['aria-controls', 'aria-owns']) {
      const value = String(element && element.getAttribute && element.getAttribute(attribute) || '').trim();
      if (value) ids.push(...value.split(/\s+/));
    }
    const tag = String(element && element.tagName || '').toLowerCase();
    if (tag === 'label') {
      const htmlFor = String(element.htmlFor || element.getAttribute && element.getAttribute('for') || '').trim();
      if (htmlFor) ids.push(htmlFor);
    }
    return [...new Set(ids.filter(Boolean))];
  };
  const nearbyAssociatedControl = (element, type, target = {}) => {
    if (!element || !['input', 'select'].includes(type)) return null;
    const selector = actionSelector(type);
    const sourceRect = element.getBoundingClientRect();
    const sourceTerms = new Set(
      `${elementLabel(element)} ${target && target.name || ''} ${target && target.text || ''}`
        .toLowerCase().match(/[a-z0-9]+/g) || [],
    );
    let scope = element.parentElement;
    let depth = 0;
    let best = null;
    while (scope && scope !== document.body && scope !== document.documentElement && depth < 4) {
      const candidates = [...scope.querySelectorAll(selector)].filter(candidate => visibleElement(candidate) && !protectedElement(candidate));
      if (candidates.length === 1 && depth <= 1) return candidates[0];
      for (const candidate of candidates.slice(0, 24)) {
        const rect = candidate.getBoundingClientRect();
        const horizontalOverlap = Math.max(0, Math.min(sourceRect.right, rect.right) - Math.max(sourceRect.left, rect.left));
        const overlapRatio = horizontalOverlap / Math.max(1, Math.min(sourceRect.width || 1, rect.width || 1));
        const verticalGap = rect.top >= sourceRect.bottom
          ? rect.top - sourceRect.bottom
          : sourceRect.top >= rect.bottom ? sourceRect.top - rect.bottom : 0;
        const candidateTerms = new Set(controlAccessibleName(candidate).match(/[a-z0-9]+/g) || []);
        const sharedTerms = [...sourceTerms].filter(term => term.length > 2 && candidateTerms.has(term)).length;
        const labelledBy = String(candidate.getAttribute && candidate.getAttribute('aria-labelledby') || '').split(/\s+/);
        let score = Math.max(0, 120 - depth * 24);
        if (candidate.parentElement === element.parentElement) score += 100;
        if (element.contains && element.contains(candidate)) score += 180;
        if (element.id && labelledBy.includes(element.id)) score += 220;
        if (overlapRatio >= 0.55) score += 65;
        if (verticalGap <= 20) score += 90;
        else if (verticalGap <= 80) score += 45;
        else if (verticalGap > 220) score -= 180;
        score += Math.min(3, sharedTerms) * 55;
        if (!best || score > best.score) best = { element: candidate, score };
      }
      if (best && best.score >= 190) return best.element;
      scope = scope.parentElement;
      depth += 1;
    }
    return best && best.score >= 150 ? best.element : null;
  };
  const actionableControl = (element, type, target = {}) => {
    if (!element) return null;
    if (isActionControl(element, type)) return element;
    const tag = String(element.tagName || '').toLowerCase();
    if (tag === 'label' && element.control && isActionControl(element.control, type) && visibleElement(element.control)) return element.control;
    for (const id of associatedControlIds(element)) {
      const candidate = document.getElementById(id);
      if (isActionControl(candidate, type) && visibleElement(candidate)) return candidate;
    }
    if (element.id) {
      for (const attribute of ['aria-labelledby', 'aria-describedby']) {
        try {
          const candidate = document.querySelector(`${actionSelector(type)}[${attribute}~="${cssEscape(element.id)}"]`);
          if (isActionControl(candidate, type) && visibleElement(candidate)) return candidate;
        } catch (_error) {}
      }
    }
    const owningLabel = element.closest && element.closest('label');
    if (owningLabel && owningLabel.control && isActionControl(owningLabel.control, type) && visibleElement(owningLabel.control)) return owningLabel.control;
    const descendant = element.querySelector && element.querySelector(actionSelector(type));
    if (isActionControl(descendant, type) && visibleElement(descendant)) return descendant;
    return nearbyAssociatedControl(element, type, target);
  };
  const dispatchControlEvents = (element, previousValue = '') => {
    const tracker = element && element._valueTracker;
    if (tracker && typeof tracker.setValue === 'function') {
      try { tracker.setValue(String(previousValue == null ? '' : previousValue)); } catch (_error) {}
    }
    try {
      if (typeof InputEvent === 'function') element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: null }));
      else element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    } catch (_error) { element.dispatchEvent(new Event('input', { bubbles: true, composed: true })); }
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  };
  const setInputValue = (element, value) => {
    const tag = String(element.tagName || '').toLowerCase();
    const type = String(element.getAttribute && element.getAttribute('type') || '').toLowerCase();
    if (['password', 'file', 'hidden'].includes(type)) throw new Error('This field type cannot be controlled by Guide.');
    const clean = bounded(value, 240);
    if (tag === 'select') {
      const option = [...element.options].find(item => String(item.value) === clean || bounded(item.textContent, 240).toLowerCase() === clean.toLowerCase());
      if (!option) throw new Error('The requested option is not available.');
      const previousValue = element.value;
      element.value = option.value;
      dispatchControlEvents(element, previousValue);
      return { value: option.value, label: bounded(option.textContent, 120) };
    }
    if (element.isContentEditable) {
      element.focus({ preventScroll: true });
      const previousValue = element.textContent;
      element.textContent = clean;
      dispatchControlEvents(element, previousValue);
      return { value: clean };
    }
    const prototype = tag === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    const previousValue = element.value;
    element.focus({ preventScroll: true });
    if (descriptor && typeof descriptor.set === 'function') descriptor.set.call(element, clean);
    else element.value = clean;
    dispatchControlEvents(element, previousValue);
    return { value: clean };
  };
  const setActionStatus = (status, message) => {
    ensureSpotlight();
    const row = spotlight.querySelector('[data-ftue-action-status]');
    const button = spotlight.querySelector('[data-ftue-action="perform"]');
    row.hidden = !message;
    row.textContent = bounded(message || '', 240);
    row.classList.toggle('error', status === 'error');
    if (button) button.disabled = status === 'running';
    repositionSpotlight();
    return { status, message: row.textContent };
  };
  const runDeclaredAction = async payload => {
    const action = payload && payload.action && typeof payload.action === 'object' ? payload.action : {};
    const type = String(action.type || '').toLowerCase();
    if (!['input', 'select', 'click'].includes(type)) throw new Error('Unsupported declared Guide action.');
    const step = payload && payload.step || {};
    if (!spotlightStep || String(spotlightStep.id || '') !== String(step.id || '')) throw new Error('The guided step is no longer active.');
    const target = payload && payload.target || registeredTargets.get(String(step.targetId || ''));
    const resolved = await waitForResolvedTarget(target || step.targetId, payload && payload.timeoutMs);
    if (!resolved.element) throw new Error('The app control is unavailable.');
    const element = actionableControl(resolved.element, type, resolved.target || target || {});
    if (!element || !visibleElement(element) || protectedElement(element)) {
      throw new Error(type === 'click'
        ? 'The highlighted target is not linked to an operable button.'
        : 'The highlighted target is not linked to an editable app field.');
    }
    if (element.disabled || String(element.getAttribute && element.getAttribute('aria-disabled') || '').toLowerCase() === 'true') throw new Error('The app control is currently disabled.');
    setActionStatus('running', type === 'click' ? 'Activating the highlighted control…' : 'Applying the value…');
    let result;
    if (type === 'input' || type === 'select') result = setInputValue(element, action.value || '');
    else {
      const tag = String(element.tagName || '').toLowerCase();
      if (!(tag === 'button' || String(element.getAttribute('role') || '').toLowerCase() === 'button' || tag === 'input' && ['button', 'submit'].includes(String(element.type || '').toLowerCase()))) throw new Error('Guide clicks are limited to declared button controls.');
      element.focus({ preventScroll: true });
      element.click();
      result = { clicked: true };
    }
    setActionStatus('complete', type === 'click' ? 'Done.' : 'Value applied.');
    emit('action-executed', { stepId: step.id || null, targetId: step.targetId || null, actionType: type });
    return { ok: true, type, targetId: step.targetId || null, ...result };
  };

  const normaliseActionDefinition = raw => {
    const source = raw && typeof raw === 'object' ? serialise(raw) : null;
    const id = bounded(source && (source.id || source.actionId), 160).toLowerCase();
    if (!/^[a-z0-9][a-z0-9._:-]{2,159}$/.test(id)) throw new Error('Guide action registration requires a stable namespaced id.');
    return {
      protocol: 'capp.guide-action.v1',
      id,
      title: bounded(source.title || id, 140),
      description: bounded(source.description || '', 600),
      requiresUserConfirmation: source.requiresUserConfirmation === true,
      arguments: source.arguments && typeof source.arguments === 'object' ? serialise(source.arguments) : {},
    };
  };
  const registerAppAction = (definition, handler) => {
    if (typeof handler !== 'function') throw new Error('Guide action registration requires a handler function.');
    const clean = normaliseActionDefinition(definition);
    registeredActions.set(clean.id, { definition: clean, handler });
    emit('app-action-registered', { actionId: clean.id, title: clean.title });
    return clean.id;
  };
  const unregisterAppAction = actionId => {
    const id = bounded(actionId, 160).toLowerCase();
    const removed = registeredActions.delete(id);
    if (removed) emit('app-action-unregistered', { actionId: id });
    return removed;
  };
  const normaliseRegisteredActionArguments = (definition, raw) => {
    const schema = definition && definition.arguments && typeof definition.arguments === 'object' ? definition.arguments : {};
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const output = {};
    for (const [key, descriptorValue] of Object.entries(schema).slice(0, 20)) {
      const descriptor = descriptorValue && typeof descriptorValue === 'object' ? descriptorValue : {};
      const required = descriptor.required === true;
      const type = ['string', 'number', 'boolean'].includes(String(descriptor.type || 'string')) ? String(descriptor.type || 'string') : 'string';
      const value = source[key];
      if (value === undefined || value === null || value === '') {
        if (required) throw new Error(`The declared Guide action requires argument: ${key}.`);
        continue;
      }
      let clean;
      if (type === 'string') {
        clean = bounded(value, Math.max(1, Math.min(2000, Number(descriptor.maxLength || 500))));
        const allowed = Array.isArray(descriptor.enum) ? descriptor.enum.map(item => String(item)) : [];
        if (allowed.length && !allowed.includes(clean)) throw new Error(`The declared Guide action rejected argument: ${key}.`);
      } else if (type === 'number') {
        clean = Number(value);
        if (!Number.isFinite(clean)) throw new Error(`The declared Guide action requires a numeric argument: ${key}.`);
        if (Number.isFinite(Number(descriptor.min))) clean = Math.max(Number(descriptor.min), clean);
        if (Number.isFinite(Number(descriptor.max))) clean = Math.min(Number(descriptor.max), clean);
      } else {
        if (typeof value !== 'boolean') throw new Error(`The declared Guide action requires a boolean argument: ${key}.`);
        clean = value;
      }
      output[key] = clean;
    }
    return output;
  };

  const runAppAction = async payload => {
    const action = payload && payload.action && typeof payload.action === 'object' ? payload.action : {};
    const actionId = bounded(action.actionId, 160).toLowerCase();
    const registered = registeredActions.get(actionId);
    if (!registered) throw new Error(`The app has not registered the declared Guide action: ${actionId || 'unknown'}.`);
    const step = payload && payload.step || {};
    if (!spotlightStep || String(spotlightStep.id || '') !== String(step.id || '')) throw new Error('The guided step is no longer active.');
    const generation = focusGeneration;
    const userConfirmed = confirmedStep?.id === step.id && confirmedStep?.generation === generation;
    confirmedStep = null; // One trusted click authorises one handler invocation.
    if (registered.definition.requiresUserConfirmation && !userConfirmed) throw new Error('Click the Guide action to confirm this step. Automatic and brokered execution cannot confirm it.');
    setActionStatus('running', 'Asking the app to perform the declared action…');
    const args = normaliseRegisteredActionArguments(registered.definition, action.arguments);
    const result = await registered.handler(args, {
      protocol: 'capp.guide-action-context.v1',
      actionId,
      workflowId: bounded(payload && payload.workflowId, 160),
      runId: bounded(payload && payload.runId, 160),
      slots: serialise(payload && payload.slots || {}),
      question: bounded(payload && payload.question, 800),
      userConfirmed,
      checkpoint: bounded(payload && payload.checkpoint, 200),
      step: serialise(step),
    });
    if (generation === focusGeneration) setActionStatus('complete', 'Done.');
    emit('app-action-executed', { actionId, stepId: step.id || null });
    return { ok: true, type: 'app', actionId, result: serialise(result) };
  };

  const scanDeclared = () => [...document.querySelectorAll('[data-capp-guide-id],[data-capp-ftue-id]')]
    .filter(visibleElement)
    .map(descriptorFor)
    .filter(Boolean);
  const registerTarget = target => {
    const row = target && typeof target === 'object' ? serialise(target) : null;
    const id = String(row && (row.id || row.targetId) || '').trim();
    if (!id) throw new Error('Guide target registration requires an id.');
    row.id = id;
    row.targetId = id;
    registeredTargets.set(id, row);
    emit('target-registered', { id, route: row.route || null });
    return row;
  };

  const openDeclaredRoute = async (rawRoute, timeoutMs = 5000) => {
    const route = String(rawRoute || '').trim();
    if (!route || route === '*' || route === '/*') return { changed: false, route: currentRoute() };
    if (/^[a-z][a-z0-9+.-]*:/i.test(route) || route.startsWith('//')) throw new Error('Guide may navigate only to a declared in-app route.');
    const before = currentRoute();
    const limit = Math.max(250, Math.min(15000, Number(timeoutMs || 5000)));
    if (route.startsWith('#') || route.includes('#')) {
      const hash = route.slice(route.indexOf('#') + 1);
      if (location.hash !== '#' + hash) {
        // The native event lets the app render exactly once. Dispatching an
        // extra event here used to rerender the page twice on every route hop.
        await new Promise(resolve => {
          const done = () => { clearTimeout(timer); window.removeEventListener('hashchange', done); resolve(); };
          const timer = setTimeout(done, Math.min(limit, 250));
          window.addEventListener('hashchange', done, { once: true });
          location.hash = hash;
        });
      }
    } else if (route.startsWith('/')) {
      history.pushState({}, '', route);
      try { window.dispatchEvent(new HashChangeEvent('hashchange')); } catch (_error) { window.dispatchEvent(new Event('hashchange')); }
    } else throw new Error('Guide route must be an app-relative path or hash route.');
    // Yield to the app's render before resolving selectors on the new route.
    // Late asynchronous controls are handled by the bounded target wait.
    await new Promise(resolve => requestAnimationFrame(resolve));
    const started = Date.now();
    while (Date.now() - started < limit) {
      if (routeMatches(route)) return { changed: before !== currentRoute(), route: currentRoute() };
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    return { changed: before !== currentRoute(), route: currentRoute(), timedOut: true };
  };

  // Application preparation runs once at the explicit workflow-start boundary.
  // It may select a fresh draft, but never inherits a transaction confirmation.
  // Cancelling the shell aborts the app's pending preparation before it mutates.
  const cancelWorkflowPreparation = ({ runId = '', reason = 'cancelled' } = {}) => {
    const pending = workflowPreparation;
    if (!pending || runId && pending.runId !== runId) return { cancelled: false };
    pending.controller.abort(bounded(reason, 80));
    workflowPreparation = null;
    return { cancelled: true, runId: pending.runId };
  };
  const prepareWorkflowStart = async payload => {
    const runId = bounded(payload && payload.runId, 160);
    const workflowId = bounded(payload && payload.workflowId, 160);
    if (!runId || !workflowId) throw new Error('A declared workflow and unique run identity are required.');
    cancelWorkflowPreparation({ reason: 'superseded' });
    const handler = workflowStartHandler;
    if (!handler) return { protocol: 'capp.guide-workflow-start.v1', prepared: true, registered: false, runId };
    const pending = { runId, controller: new AbortController() };
    workflowPreparation = pending;
    let onAbort;
    const aborted = new Promise((_resolve, reject) => {
      onAbort = () => reject(new Error('CAPP_GUIDE_WORKFLOW_CANCELLED: Workflow preparation was cancelled.'));
      pending.controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const context = Object.freeze({
        protocol: 'capp.guide-workflow-start.v1',
        workflowId,
        runId,
        slots: serialise(payload.slots || {}),
        question: bounded(payload.question, 800),
        executionMode: ['guided', 'auto-safe', 'auto-all'].includes(payload.executionMode) ? payload.executionMode : 'guided',
        source: bounded(payload.source || 'guide', 40),
        runMode: payload.runMode === 'resume' ? 'resume' : 'new',
        recordId: bounded(payload.recordId, 200) || null,
        signal: pending.controller.signal,
      });
      const running = Promise.resolve().then(() => {
        if (pending.controller.signal.aborted) throw new Error('CAPP_GUIDE_WORKFLOW_CANCELLED: Workflow preparation was cancelled.');
        return handler(context);
      });
      const result = await Promise.race([running, aborted]);
      if (pending.controller.signal.aborted || workflowPreparation !== pending) throw new Error('CAPP_GUIDE_WORKFLOW_CANCELLED: Workflow preparation was cancelled.');
      return { protocol: 'capp.guide-workflow-start.v1', prepared: true, registered: true, runId, result: serialise(result) };
    } finally {
      pending.controller.signal.removeEventListener('abort', onAbort);
      if (workflowPreparation === pending) workflowPreparation = null;
    }
  };

  const handleCommand = async (command, payload = {}) => {
    if (command === 'workflow-start') return prepareWorkflowStart(payload || {});
    if (command === 'workflow-start-cancel') return cancelWorkflowPreparation(payload || {});
    if (command === 'guide-knowledge-status') return {available:!!knowledgeProvider};
    if (command === 'guide-knowledge-search') {
      if (!knowledgeProvider) return {available:false};
      return {available:true,...await knowledgeProvider.search({query:bounded(payload.query,1000),limit:5})};
    }

    if (command === 'ping' || command === 'route-current') return { protocol: PROTOCOL, ready: true, styles: agentStyleStatus, route: currentRoute(), routeKey: routeKey(), targetCount: registeredTargets.size };
    if (command === 'route-open') return openDeclaredRoute(payload && payload.route, payload && payload.timeoutMs);
    if (command === 'select-start') return startSelection();
    if (command === 'select-cancel') { stopSelection('command'); return { active: false }; }
    if (command === 'describe-element') return descriptorFor(payload && payload.element);
    if (command === 'target-register') return registerTarget(payload && payload.target || payload);
    if (command === 'targets-register') return (Array.isArray(payload && payload.targets) ? payload.targets : []).map(registerTarget);
    if (command === 'targets-scan') return scanDeclared();
    if (command === 'target-resolve') {
      const resolved = resolveTarget(payload && (payload.target || payload.targetId));
      return { found: Boolean(resolved.element), reason: resolved.reason, descriptor: resolved.element ? descriptorFor(resolved.element) : null };
    }
    if (command === 'focus-show') return showSpotlight(payload || {});
    if (command === 'focus-hide') return hideSpotlight();
    if (command === 'focus-status') return setActionStatus(payload && payload.status || 'idle', payload && payload.message || '');
    if (command === 'action-run') return runDeclaredAction(payload || {});
    if (command === 'app-action-run') return runAppAction(payload || {});
    if (command === 'app-actions-list') return [...registeredActions.values()].map(item => item.definition);
    if (command === 'brokered-app-action') {
      const actionId = bounded(payload && payload.actionId, 160).toLowerCase();
      const registered = registeredActions.get(actionId);
      if (!registered || !/^op_[a-f0-9]{32}$/.test(String(payload && payload.operationId || ''))) throw new Error('A declared action and broker operation are required.');
      if (registered.definition.requiresUserConfirmation) throw new Error('This action requires a click in its Guide workflow.');
      const args = normaliseRegisteredActionArguments(registered.definition, payload.arguments);
      const result = await registered.handler(args, { protocol: 'capp.guide-action-context.v1', actionId, operationId: payload.operationId, workflowId: 'capp-agent', slots: {}, step: {} });
      return { ok: true, actionId, result: serialise(result) };
    }
    if (command === 'manifest-get') return serialise(window.__CAPP_FTUE_MANIFEST__ || null);
    throw new Error(`Unsupported Guide agent command: ${command}`);
  };

  // Preload without blocking nonvisual APIs. Visual commands await the same
  // promise and fail closed; a failed preload is retryable, never "installed".
  ensureAgentStyles().catch(() => {});

  window.__CAPP_FTUE_AGENT__ = Object.freeze({ protocol: PROTOCOL, command: handleCommand, describe: descriptorFor, resolve: resolveTarget });

  window.addEventListener('message', event => {
    if (event.source !== window && event.source !== parent) return;
    const data = event && event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'capp-ftue-agent-command') {
      // Workstation uses the owner's direct same-origin surface adapter. Never
      // turn a cross-window message and an invented operation ID into authority.
      if (data.command === 'brokered-app-action' || String(data.command||'').startsWith('guide-knowledge-')) return;
      Promise.resolve(handleCommand(data.command, data.payload || {})).then(result => {
        try { event.source && event.source.postMessage({ type: 'capp-ftue-agent-response', requestId: data.requestId, ok: true, result: serialise(result) }, '*'); } catch (_error) {}
      }).catch(error => {
        try { event.source && event.source.postMessage({ type: 'capp-ftue-agent-response', requestId: data.requestId, ok: false, error: String(error && error.message || error) }, '*'); } catch (_error) {}
      });
      return;
    }
    if (data.type === 'capp-ftue-shell-response' && pendingShellRequests.has(data.requestId)) {
      const pending = pendingShellRequests.get(data.requestId);
      pendingShellRequests.delete(data.requestId);
      clearTimeout(pending.timer);
      if (data.ok) pending.resolve(data.result);
      else pending.reject(new Error(data.error || 'Guide shell request failed.'));
    }
  });

  const requestShell = (method, payload = {}) => new Promise((resolve, reject) => {
    const requestId = `ftue-app-${Date.now()}-${++requestSequence}`;
    pendingShellRequests.set(requestId, { resolve, reject });
    const timer = setTimeout(() => {
      if (!pendingShellRequests.has(requestId)) return;
      pendingShellRequests.delete(requestId);
      if (method === 'startWorkflow') {
        // Do not let an app run begin later after its caller received a timeout.
        // The owner matches this request ID, so a newer launch is unaffected.
        try { (parent || window).postMessage({ type: 'capp-ftue-app-request', requestId: `${requestId}-cancel`, method: 'cancelWorkflowStart', payload: { requestId } }, '*'); } catch (_error) {}
      }
      reject(new Error('Guide shell request timed out.'));
    }, 8000);
    pendingShellRequests.get(requestId).timer = timer;
    const message = { type: 'capp-ftue-app-request', requestId, method, payload: serialise(payload) };
    try { (parent || window).postMessage(message, '*'); } catch (error) { clearTimeout(timer); pendingShellRequests.delete(requestId); reject(error); }
  });

  window.capp = window.capp && typeof window.capp === 'object' ? window.capp : {};
  const guideApi = {
    protocol: 'capp.guide-application-api.v1',
    compatibilityProtocol: 'capp.ftue-application-api.v1',
    supports: Object.freeze({ actionProgress: true, userConfirmation: true, handoff: true, workflowStart: true }),
    openHandoff: handoff => requestShell('openHandoff', { handoff }),
    registerTarget: target => requestShell('registerTarget', { target }),
    registerTargets: targets => requestShell('registerTargets', { targets }),
    registerManifest: manifest => requestShell('registerManifest', { manifest }),
    registerAction: (definition, handler) => {
      const id = registerAppAction(definition, handler);
      return () => unregisterAppAction(id);
    },
    unregisterAction: actionId => unregisterAppAction(actionId),
    listActions: () => [...registeredActions.values()].map(item => serialise(item.definition)),
    registerWorkflowStart: async handler => {
      if (typeof handler !== 'function') throw new Error('A workflow-start handler is required.');
      // The child agent and owner shell can come from different builds. A local
      // capability flag alone cannot prove that the shell invokes this boundary.
      const support = await requestShell('workflowStartStatus');
      if (support?.protocol !== 'capp.guide-workflow-start.v1' || support.supported !== true || support.abortSignal !== true) throw new Error('Update the Guide owner runtime to support fresh workflow preparation.');
      cancelWorkflowPreparation({ reason: 'handler-replaced' });
      workflowStartHandler = handler;
      return () => {
        if (workflowStartHandler !== handler) return;
        cancelWorkflowPreparation({ reason: 'handler-removed' });
        workflowStartHandler = null;
      };
    },
    registerKnowledgeProvider: provider => {
      if (!provider || typeof provider.search !== 'function' || typeof provider.read !== 'function' || typeof provider.sources !== 'function') throw new Error('A declared Guide knowledge provider is required.');
      knowledgeProvider = provider;
      return () => { if(knowledgeProvider===provider)knowledgeProvider=null; };
    },
    search: args => knowledgeProvider ? knowledgeProvider.search(args) : Promise.reject(new Error('Guide knowledge provider is unavailable.')),
    read: args => knowledgeProvider ? knowledgeProvider.read(args) : Promise.reject(new Error('Guide knowledge provider is unavailable.')),
    sources: () => knowledgeProvider ? knowledgeProvider.sources() : Promise.resolve({sources:[]}),
    listWorkflows: () => requestShell('listWorkflows'),
    cancelWorkflow: () => requestShell('cancelWorkflow'),
    start: experienceId => requestShell('start', { experienceId }),
    startFtue: experienceId => requestShell('start', { experienceId }),
    startWorkflow: (workflowId, slots = {}, question = '', options = {}) => requestShell('startWorkflow', { workflowId, slots, question, executionMode:options.executionMode,source:options.source,runMode:options.runMode,recordId:options.recordId }),
    open: () => requestShell('openHelp'),
    openHelp: () => requestShell('openHelp'),
    reset: experienceId => requestShell('reset', { experienceId }),
    status: () => requestShell('status'),
  };
  try { window.capp.guide = Object.freeze(guideApi); } catch (_error) { window.capp.guide = guideApi; }
  try { window.capp.ftue = window.capp.guide; } catch (_error) { window.capp.ftue = guideApi; }
  try { if (typeof window.__CAPP_REGISTER_CAPABILITY__ === 'function') window.__CAPP_REGISTER_CAPABILITY__('guide', '1'); } catch (_error) {}

  window.addEventListener('keydown', event => {
    if (selectionMode && event.key === 'Escape') stopSelection('escape');
    if (!spotlight || spotlight.hidden) return;
    if (event.key === 'Escape') emit('tour-action', { action: 'skip', stepId: spotlightStep && spotlightStep.id || null });
    if (event.key === 'ArrowRight' || event.key === 'Enter') emit('tour-action', { action: 'next', stepId: spotlightStep && spotlightStep.id || null });
    if (event.key === 'ArrowLeft') emit('tour-action', { action: 'back', stepId: spotlightStep && spotlightStep.id || null });
  }, true);

  emit('ready', { route: currentRoute(), declaredTargets: scanDeclared().length });
})();
