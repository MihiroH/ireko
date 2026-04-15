/*
 * ireko viewer shell — loads diagrams.json, renders the current diagram per
 * URL hash, post-processes Mermaid's SVG to make `ref` placeholders clickable,
 * and keeps a breadcrumb trail in sessionStorage.
 *
 * Navigation assigns `window.location.hash`, so the browser back button
 * works against the native history stack.
 */

(function () {
  "use strict";

  // Marker syntax must stay in sync with src/emitter.ts (the browser has no
  // bundler, so this regex can't be imported).
  var MARKER_RE = /\u200B?\u27E6ireko:([A-Za-z_][A-Za-z0-9_]*)\u27E7\u200B?/g;

  var BREADCRUMB_KEY = "ireko.breadcrumbs";

  var state = {
    data: null,
    breadcrumbs: [],
  };

  function qs(sel) { return document.querySelector(sel); }

  function currentIdFromHash() {
    var h = window.location.hash.replace(/^#/, "");
    return h || null;
  }

  function currentId() {
    return state.breadcrumbs.length
      ? state.breadcrumbs[state.breadcrumbs.length - 1]
      : null;
  }

  function shallowEqual(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function setBreadcrumbs(ids) {
    if (shallowEqual(ids, state.breadcrumbs)) return;
    state.breadcrumbs = ids;
    try {
      sessionStorage.setItem(BREADCRUMB_KEY, JSON.stringify(ids));
    } catch (_) { /* storage may be disabled */ }
  }

  function loadBreadcrumbs() {
    try {
      var raw = sessionStorage.getItem(BREADCRUMB_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function computeTrail(id) {
    var trail = state.breadcrumbs;
    var idx = trail.indexOf(id);
    if (idx >= 0) return trail.slice(0, idx + 1);
    if (trail.length > 0) return trail.concat([id]);
    return id === state.data.root ? [id] : [state.data.root, id];
  }

  function navigate(id, opts) {
    opts = opts || {};
    setBreadcrumbs(computeTrail(id));

    if (opts.push !== false) {
      if (window.location.hash === "#" + id) {
        // Same hash — assigning wouldn't fire hashchange, so render now.
        render(id);
      } else {
        window.location.hash = "#" + id;
      }
      return;
    }
    render(id);
  }

  function render(id) {
    var main = qs("#diagram-root");
    main.innerHTML = '<p class="ireko-loading">Rendering…</p>';

    if (!state.data) {
      main.innerHTML = '<p class="ireko-error">diagrams.json not loaded</p>';
      return;
    }
    var diagram = state.data.diagrams[id];
    if (!diagram) {
      main.innerHTML =
        '<p class="ireko-error">Unknown diagram id: ' + escapeHtml(id) + '</p>';
      qs("#title").textContent = "ireko — not found";
      return;
    }

    qs("#title").textContent = diagram.title;
    renderBreadcrumbs();

    var mermaid = window.__ireko_mermaid;
    if (!mermaid) {
      // Mermaid ESM import is async; retry shortly.
      setTimeout(function () { render(id); }, 50);
      return;
    }

    var renderId = "ireko-" + id + "-" + Date.now();
    mermaid
      .render(renderId, diagram.mermaid)
      .then(function (result) {
        main.innerHTML = result.svg;
        var svg = main.querySelector("svg");
        if (svg) postProcessMarkers(svg);
        if (result.bindFunctions) {
          try { result.bindFunctions(main); } catch (_) { /* ignore */ }
        }
      })
      .catch(function (err) {
        main.innerHTML =
          '<pre class="ireko-error">Mermaid render failed:\n' +
          escapeHtml((err && err.message) || String(err)) +
          '\n\nSource:\n' + escapeHtml(diagram.mermaid) +
          '</pre>';
      });
  }

  /**
   * For every text node in the SVG, strip any embedded ireko markers and
   * attach a click handler on the nearest <g> that drills into the target.
   */
  function postProcessMarkers(svg) {
    var texts = svg.querySelectorAll("text, tspan");
    texts.forEach(function (node) {
      var original = node.textContent;
      if (!original) return;
      var targets = [];
      var cleaned = original.replace(MARKER_RE, function (_m, id) {
        targets.push(id);
        return "";
      });
      if (targets.length === 0) return;
      node.textContent = cleaned;
      var targetId = targets[0];
      var clickable = node.closest("g") || node;
      clickable.classList.add("ireko-ref");
      clickable.setAttribute("tabindex", "0");
      clickable.setAttribute("role", "link");
      clickable.setAttribute("aria-label", "Drill into: " + cleaned.trim());
      clickable.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        navigate(targetId);
      });
      clickable.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          navigate(targetId);
        }
      });
    });
  }

  function renderBreadcrumbs() {
    var el = qs("#breadcrumbs");
    if (!state.breadcrumbs || state.breadcrumbs.length === 0) {
      el.innerHTML = "";
      return;
    }
    var parts = [];
    state.breadcrumbs.forEach(function (id, i) {
      var diagram = state.data.diagrams[id];
      var title = diagram ? diagram.title : id;
      var isLast = i === state.breadcrumbs.length - 1;
      if (isLast) {
        parts.push('<span aria-current="page">' + escapeHtml(title) + "</span>");
      } else {
        parts.push('<a href="#' + encodeURIComponent(id) + '">' +
                   escapeHtml(title) + "</a>");
      }
    });
    el.innerHTML = parts.join('<span class="sep">›</span>');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function onHashChange() {
    var id = currentIdFromHash();
    if (!id && state.data) id = state.data.root;
    if (!id) return;
    if (id === currentId()) return;
    navigate(id, { push: false });
  }

  function installData(data) {
    state.data = data;
    var restored = loadBreadcrumbs();
    if (restored && restored.every(function (id) { return data.diagrams[id]; })) {
      state.breadcrumbs = restored;
    } else {
      state.breadcrumbs = [data.root];
    }
    var id = currentIdFromHash() || data.root;
    navigate(id, { push: false });
  }

  function boot() {
    // Prefer data inlined into the HTML (so `file://` works). Fall back to
    // fetch() when the viewer is served over HTTP.
    var inline = document.getElementById("ireko-data");
    if (inline && inline.textContent) {
      try {
        installData(JSON.parse(inline.textContent));
        return;
      } catch (_) {
        // fall through to fetch
      }
    }
    fetch("diagrams.json", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(installData)
      .catch(function (err) {
        var main = qs("#diagram-root");
        main.innerHTML =
          '<pre class="ireko-error">Failed to load diagrams.json:\n' +
          escapeHtml(err.message || String(err)) +
          '\n\nNote: some browsers block fetch() from file:// URLs. ' +
          'Re-run `ireko build` so diagrams.json is inlined into index.html, ' +
          'or serve the out/ directory with e.g. `python3 -m http.server`.' +
          '</pre>';
      });
  }

  window.addEventListener("hashchange", onHashChange);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
