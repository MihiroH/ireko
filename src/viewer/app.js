/*
 * ireko viewer shell.
 *
 * Responsibilities:
 *   1. Load diagrams.json (produced by `ireko build`).
 *   2. Read the current diagram id from window.location.hash.
 *   3. Ask Mermaid to render the diagram's source to SVG.
 *   4. Post-process the SVG: find embedded ireko markers, strip the marker
 *      text from the rendered label, and attach click handlers that navigate
 *      to the referenced diagram.
 *   5. Maintain a breadcrumb trail of visited diagrams and render it in the
 *      header so users can navigate back up.
 *
 * The browser back button works because navigation is done by assigning to
 * window.location.hash, which pushes a history entry.
 */

(function () {
  "use strict";

  // Marker syntax must stay in sync with src/emitter.ts.
  // Format: \u200B⟦ireko:ID⟧\u200B
  var MARKER_RE = /\u200B?\u27E6ireko:([A-Za-z_][A-Za-z0-9_]*)\u27E7\u200B?/g;

  /** Persisted breadcrumb path, list of diagram ids from root → current. */
  var BREADCRUMB_KEY = "ireko.breadcrumbs";

  var state = {
    data: null,       // DiagramsOutput from diagrams.json
    current: null,    // current diagram id
    breadcrumbs: [],  // list of ids
  };

  function qs(sel) { return document.querySelector(sel); }

  function setBreadcrumbs(ids) {
    state.breadcrumbs = ids;
    try {
      sessionStorage.setItem(BREADCRUMB_KEY, JSON.stringify(ids));
    } catch (_) { /* ignore */ }
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

  function currentIdFromHash() {
    var h = window.location.hash.replace(/^#/, "");
    return h || null;
  }

  function navigate(id, opts) {
    opts = opts || {};
    var prev = state.current;
    // Update the breadcrumb trail. If we're navigating to an id already in
    // the trail (e.g., clicking a breadcrumb), truncate to that point.
    var idx = state.breadcrumbs.indexOf(id);
    var newTrail;
    if (idx >= 0) {
      newTrail = state.breadcrumbs.slice(0, idx + 1);
    } else if (opts.replaceTrail) {
      newTrail = [id];
    } else if (prev !== null && state.breadcrumbs.length > 0 &&
               state.breadcrumbs[state.breadcrumbs.length - 1] === prev) {
      newTrail = state.breadcrumbs.concat([id]);
    } else {
      // We don't know how we got here (e.g., user hit back). Start a fresh
      // trail from the root if this isn't already the root.
      if (id === state.data.root) {
        newTrail = [id];
      } else {
        newTrail = [state.data.root, id];
      }
    }
    setBreadcrumbs(newTrail);

    if (opts.push !== false) {
      window.location.hash = "#" + id;
      return; // hashchange listener will trigger render
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

    state.current = id;
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
        if (svg) postProcessMarkers(svg, diagram);
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
   * Walk the rendered SVG, find every text node containing an ireko marker,
   * strip the marker from the display text, and attach a click handler to
   * the nearest enclosing <g> that navigates to the referenced diagram.
   */
  function postProcessMarkers(svg, _diagram) {
    var texts = svg.querySelectorAll("text, tspan");
    texts.forEach(function (node) {
      var original = node.textContent;
      if (!original) return;
      MARKER_RE.lastIndex = 0;
      if (!MARKER_RE.test(original)) return;
      MARKER_RE.lastIndex = 0;
      var targets = [];
      var cleaned = original.replace(MARKER_RE, function (_m, id) {
        targets.push(id);
        return "";
      });
      node.textContent = cleaned;
      if (targets.length === 0) return;
      // Attach handler to nearest <g> (or the text node itself as fallback).
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
    if (id) navigate(id, { push: false });
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
    // fetch() when the viewer is served over HTTP (e.g., a dev server).
    var inline = document.getElementById("ireko-data");
    if (inline && inline.textContent) {
      try {
        installData(JSON.parse(inline.textContent));
        return;
      } catch (err) {
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
