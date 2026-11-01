(function () {
  if (window.__annLoaded) return;
  window.__annLoaded = true;

  var NS = "http://www.w3.org/2000/svg";
  var COLORS = ["#ef4444", "#2563eb", "#16a34a", "#111827", "#f59e0b"];
  var SIZES = { pen: [1.5, 3, 6], marker: [10, 18, 30] };
  var LABELS = ["Thin", "Medium", "Thick"];
  var inFrame = window.parent !== window;

  function safeDecode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  var KEY = window.__ANN_KEY ||
    "ann2:" + safeDecode(location.pathname.replace(/^\//, ""));

  // Links inside a mind map are handled by the resources page viewer.
  if (inFrame) {
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[href]");
      if (!a) return;
      var h = a.getAttribute("href");
      if (!h || h.charAt(0) === "#" || /^(javascript|mailto|tel):/i.test(h)) return;
      e.preventDefault();
      parent.postMessage({ mindmapLink: h }, "*");
    }, true);
  }

    var stage = document.getElementById("stage") || document.getElementById("world");
  var useBody = !stage;
  var host = stage || document.body;

  // The drawing layer lives INSIDE the stage, so it zooms and pans with the map.
  var svg = document.createElementNS(NS, "svg");
  svg.id = "annSvg";
  svg.style.cssText =
    "position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:50;" +
    (useBody ? "" : "width:100%;height:100%;");
  host.appendChild(svg);
  if (!useBody && (host.offsetWidth < 2 || host.offsetHeight < 2)) {
    svg.style.width = "1px";
    svg.style.height = "1px";
  }

  function sizeBodySvg() {
    if (!useBody) return;
    svg.style.width = Math.max(document.documentElement.scrollWidth, innerWidth) + "px";
    svg.style.height = Math.max(document.documentElement.scrollHeight, innerHeight) + "px";
  }
  sizeBodySvg();
  window.addEventListener("resize", sizeBodySvg);

  new MutationObserver(function () {
    if (!svg.isConnected) host.appendChild(svg);
  }).observe(host, { childList: true });

  var strokes = [];
  var tool = "pen";
  var sizeIdx = 1;
  var color = COLORS[0];
  var drawMode = true;
  var barOpen = false;
  var notesVisible = true;
  var cur = null;
  var erasing = false;
  var nActive = 0;

  function pathD(pts) {
    if (!pts.length) return "";
    var d = "M" + pts[0][0] + " " + pts[0][1];
    if (pts.length === 1) return d + "l0.01 0";
    for (var i = 1; i < pts.length; i++) d += "L" + pts[i][0] + " " + pts[i][1];
    return d;
  }

  function makePath(s) {
    var p = document.createElementNS(NS, "path");
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", s.c);
    p.setAttribute("stroke-width", s.w);
    p.setAttribute("stroke-opacity", s.a);
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    p.setAttribute("d", pathD(s.p));
    return p;
  }

  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(d) ? d : [];
    } catch (e) { return []; }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(strokes.map(function (s) {
        return { c: s.c, w: s.w, a: s.a, p: s.p };
      })));
      return true;
    } catch (e) { return false; }
  }

  strokes = load().map(function (s) {
    s.el = makePath(s);
    svg.appendChild(s.el);
    return s;
  });

  function ctm() { return svg.getScreenCTM(); }
  function scaleNow() {
    var m = ctm();
    return m ? Math.hypot(m.a, m.b) || 1 : 1;
  }
  function toLocal(e) {
    var m = ctm();
    if (!m) return null;
    var p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    var q = p.matrixTransform(m.inverse());
    return [Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10];
  }

  // ---------- UI ----------
  var css = document.createElement("style");
  css.textContent =
    "#annCatch{position:fixed;inset:0;z-index:99998;touch-action:none;display:none;cursor:crosshair}" +
        "#annFab{position:fixed;left:12px;top:calc(12px + env(safe-area-inset-top,0px));z-index:99999;width:46px;height:46px;border-radius:50%;border:0;background:#2563eb;color:#fff;font-size:22px;box-shadow:0 4px 14px #0006}" +
    "#annBar{position:fixed;left:8px;right:8px;top:calc(8px + env(safe-area-inset-top,0px));z-index:99999;display:none;flex-direction:column;gap:6px;background:#1e293bf2;border:1px solid #334155;border-radius:14px;padding:8px;font-family:system-ui,Arial,sans-serif}" +
    ".annRow{display:flex;flex-wrap:wrap;gap:6px;align-items:center}" +
    ".annB{padding:7px 10px;font-size:13px;border-radius:9px;border:1px solid #475569;background:#0b1220;color:#f1f5f9}" +
    ".annB.on{background:#2563eb;border-color:#2563eb}" +
    ".annSw{width:28px;height:28px;padding:0;border-radius:50%;border:2px solid #ffffff55}" +
    ".annSw.on{border-color:#fff;box-shadow:0 0 0 2px #2563eb}";
  document.head.appendChild(css);

  var catcher = document.createElement("div");
  catcher.id = "annCatch";
  document.body.appendChild(catcher);

  function btn(label, onClick, cls) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "annB " + (cls || "");
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  var fab = btn("✎", function () { openBar(true); });
  fab.id = "annFab";
  fab.className = "";
  fab.setAttribute("aria-label", "Annotate");
  document.body.appendChild(fab);

  var bar = document.createElement("div");
  bar.id = "annBar";
  document.body.appendChild(bar);

  var r1 = document.createElement("div"); r1.className = "annRow";
  var r2 = document.createElement("div"); r2.className = "annRow";
  var r3 = document.createElement("div"); r3.className = "annRow";
  bar.append(r1, r2, r3);

  var bDraw = btn("Draw", function () { setMode(true); });
  var bMove = btn("Move / Zoom", function () { setMode(false); });
  var bPen = btn("Pen", function () { tool = "pen"; refresh(); });
  var bMarker = btn("Marker", function () { tool = "marker"; refresh(); });
  var bErase = btn("Eraser", function () { tool = "erase"; refresh(); });
  r1.append(bDraw, bMove, bPen, bMarker, bErase);

  var sizeBtns = LABELS.map(function (l, i) {
    var b = btn(l, function () { sizeIdx = i; refresh(); });
    r2.appendChild(b);
    return b;
  });
  var swBtns = COLORS.map(function (c) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "annSw";
    b.style.background = c;
    b.setAttribute("aria-label", "Colour");
    b.addEventListener("click", function () {
      color = c;
      if (tool === "erase") tool = "pen";
      refresh();
    });
    r2.appendChild(b);
    return b;
  });

  var bUndo = btn("Undo", function () {
    var s = strokes.pop();
    if (s && s.el.parentNode) s.el.parentNode.removeChild(s.el);
    save();
  });
  var bClear = btn("Clear", function () {
    if (!strokes.length) return;
    if (!confirm("Clear all your notes on this mind map?")) return;
    strokes.forEach(function (s) { if (s.el.parentNode) s.el.parentNode.removeChild(s.el); });
    strokes = [];
    save();
  });
  var bSave = btn("Save", function () {
    bSave.textContent = save() ? "Saved ✓" : "Can't save";
    setTimeout(function () { bSave.textContent = "Save"; }, 1400);
  });
  var bHide = btn("Hide notes", function () {
    notesVisible = !notesVisible;
    if (!notesVisible) drawMode = false;
    refresh();
  });
  var bClose = btn("✕", function () { openBar(false); });
  r3.append(bUndo, bClear, bSave, bHide, bClose);

  function refresh() {
    svg.style.display = notesVisible ? "" : "none";
    bHide.textContent = notesVisible ? "Hide notes" : "Show notes";
    bDraw.classList.toggle("on", drawMode);
    bMove.classList.toggle("on", !drawMode);
    bPen.classList.toggle("on", tool === "pen");
    bMarker.classList.toggle("on", tool === "marker");
    bErase.classList.toggle("on", tool === "erase");
    sizeBtns.forEach(function (b, i) {
      b.classList.toggle("on", i === sizeIdx);
      b.style.opacity = tool === "erase" ? ".4" : "1";
    });
    swBtns.forEach(function (b, i) {
      b.classList.toggle("on", tool !== "erase" && COLORS[i] === color);
    });
    catcher.style.display = barOpen && drawMode && notesVisible ? "block" : "none";
  }

  function setMode(draw) {
    if (draw && !notesVisible) notesVisible = true;
    drawMode = draw;
    refresh();
  }

  function openBar(open) {
    barOpen = open;
    bar.style.display = open ? "flex" : "none";
    fab.style.display = open ? "none" : "";
    if (open) drawMode = true;
    refresh();
  }

  // ---------- drawing ----------
  function removeStroke(s) {
    if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
  }

  function eraseAt(q) {
    var R = 14 / scaleNow();
    var keep = [];
    var changed = false;
    strokes.forEach(function (s) {
      var hit = s.p.some(function (pt) {
        return Math.hypot(pt[0] - q[0], pt[1] - q[1]) < R;
      });
      if (hit) { removeStroke(s); changed = true; } else keep.push(s);
    });
    if (changed) strokes = keep;
  }

  function cancelCurrent() {
    if (cur) {
      removeStroke(cur);
      strokes = strokes.filter(function (s) { return s !== cur; });
    }
    cur = null;
    erasing = false;
  }

  catcher.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    nActive++;
    if (nActive > 1) { cancelCurrent(); return; }
    try { catcher.setPointerCapture(e.pointerId); } catch (_) {}
    var q = toLocal(e);
    if (!q) return;
    if (tool === "erase") { erasing = true; eraseAt(q); return; }
    var px = SIZES[tool][sizeIdx];
    cur = {
      c: color,
      w: Math.round((px / scaleNow()) * 100) / 100,
      a: tool === "marker" ? 0.35 : 1,
      p: [q]
    };
    cur.el = makePath(cur);
    svg.appendChild(cur.el);
    strokes.push(cur);
  });

  catcher.addEventListener("pointermove", function (e) {
    if (nActive !== 1) return;
    var q = toLocal(e);
    if (!q) return;
    if (erasing) { eraseAt(q); return; }
    if (!cur) return;
    var last = cur.p[cur.p.length - 1];
    if (Math.hypot(q[0] - last[0], q[1] - last[1]) < 0.6 / scaleNow()) return;
    cur.p.push(q);
    cur.el.setAttribute("d", pathD(cur.p));
  });

  function end() {
    nActive = Math.max(0, nActive - 1);
    if (nActive === 0 && (cur || erasing)) {
      cur = null;
      erasing = false;
      save();
    }
  }
  catcher.addEventListener("pointerup", end);
  catcher.addEventListener("pointercancel", end);

  refresh();
})();
