(function () {
  if (window.__pdfAnnLoaded) return;
  window.__pdfAnnLoaded = true;

  var NS = "http://www.w3.org/2000/svg";
  var COLORS = [
    "#ef4444", "#f97316", "#f59e0b", "#facc15", "#84cc16",
    "#16a34a", "#14b8a6", "#38bdf8", "#2563eb", "#8b5cf6",
    "#ec4899", "#92400e", "#111827", "#ffffff"
  ];
  var SIZES = { pen: [1.5, 3, 6], marker: [10, 18, 30] };
  var SIZE_NAMES = ["Thin", "Medium", "Thick"];
  var DOT = [5, 9, 14];
  var CORNERS = ["tl", "tr", "br", "bl"];

  var FILE = new URLSearchParams(location.search).get("file");
  var KEY = "pdfann:" + FILE;
  var pagesEl = document.getElementById("pages");
  var msg = document.getElementById("msg");
  pagesEl.style.cssText =
    "position:absolute;left:0;top:0;transform-origin:0 0;width:1000px;padding:10px 0;";

  var infos = [];
  var strokes = [];
  var view = { x: 0, y: 0, k: 1 };
  var tool = "pen";
  var sizeIdx = 1;
  var color = COLORS[0];
  var drawMode = true;
  var barOpen = false;
  var notesVisible = true;
  var corner = "tl";
  var cur = null;
  var mode = null;
  var ptrs = {};
  var lastPan = null;
  var pinch0 = null;

  // ---------- view (pan / zoom) ----------
  function apply() {
    var W = pagesEl.offsetWidth * view.k;
    var H = pagesEl.offsetHeight * view.k;
    view.x = Math.min(innerWidth - 60, Math.max(60 - W, view.x));
    view.y = Math.min(innerHeight - 60, Math.max(60 - H, view.y));
    pagesEl.style.transform =
      "translate(" + view.x + "px," + view.y + "px) scale(" + view.k + ")";
  }
  function fit() {
    view.k = innerWidth / (pagesEl.offsetWidth || 1000);
    view.x = 0;
    view.y = 0;
    apply();
  }
  function clampK(k) {
    var minK = Math.min(innerWidth / (pagesEl.offsetWidth || 1000), 1) * 0.6;
    return Math.min(8, Math.max(minK, k));
  }
  function zoomAt(cx, cy, nk) {
    nk = clampK(nk);
    view.x = cx - ((cx - view.x) / view.k) * nk;
    view.y = cy - ((cy - view.y) / view.k) * nk;
    view.k = nk;
    apply();
  }

  // ---------- strokes ----------
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
  function addStrokeEl(s) {
    var inf = infos[s.g];
    if (!inf) return;
    s.el = makePath(s);
    inf.svg.appendChild(s.el);
  }
  function removeStroke(s) {
    if (s.el && s.el.parentNode) s.el.parentNode.removeChild(s.el);
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
        return { g: s.g, c: s.c, w: s.w, a: s.a, p: s.p };
      })));
      return true;
    } catch (e) { return false; }
  }
  function loadUI() {
    try {
      var u = JSON.parse(localStorage.getItem("annUI"));
      if (u && CORNERS.indexOf(u.corner) >= 0) corner = u.corner;
    } catch (e) {}
  }
  function saveUI() {
    try { localStorage.setItem("annUI", JSON.stringify({ corner: corner })); } catch (e) {}
  }
  loadUI();

  // ---------- page lookup ----------
  function pageAt(py) {
    var best = -1, bd = 1e12;
    infos.forEach(function (inf, i) {
      var t = inf.div.offsetTop, b = t + inf.div.offsetHeight;
      var d = py < t ? t - py : (py > b ? py - b : 0);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  function pagePt(e, g) {
    var d = infos[g].div;
    var x = (e.clientX - view.x) / view.k - d.offsetLeft;
    var y = (e.clientY - view.y) / view.k - d.offsetTop;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  }

  // ---------- styles ----------
  var css = document.createElement("style");
  css.textContent = `
    #annCatch{position:fixed;inset:0;z-index:99998;touch-action:none;cursor:grab}
    #annCatch.draw{cursor:crosshair}
    #annUI{position:fixed;z-index:99999;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#e2e8f0;-webkit-user-select:none;user-select:none}
    #annUI.drag{opacity:.9}
    #annUI button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
    #annFab{width:52px;height:52px;border-radius:50%;border:3px solid #2563eb;background:linear-gradient(135deg,#1e293b,#0f172a);color:#fff;font-size:22px;padding:0;box-shadow:0 6px 18px rgba(0,0,0,.45)}
    #annDock,#annPanel{background:rgba(15,23,42,.93);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.14);box-shadow:0 10px 30px rgba(0,0,0,.45)}
    #annDock{display:none;align-items:center;gap:4px;padding:5px;border-radius:999px}
    #annPanel{display:none;flex-direction:column;gap:10px;width:min(88vw,330px);max-height:calc(100vh - 28px);overflow:auto;border-radius:20px;padding:10px}
    .annHead{display:flex;align-items:center;gap:6px}
    .annGrip{flex:1;text-align:left;background:transparent;border:0;padding:6px 4px;font-size:14px;font-weight:600;letter-spacing:.02em;touch-action:none;cursor:grab}
    .annGrip.small{flex:none;width:30px;text-align:center;padding:6px 0;font-size:16px}
    .annIcon{width:34px;height:34px;border-radius:50%;padding:0;font-size:15px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12)}
    .annLbl{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:#94a3b8;margin:0 0 5px 2px}
    .annRow{display:flex;gap:6px;flex-wrap:wrap}
    .annB{flex:1;padding:9px 10px;font-size:13px;border-radius:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);white-space:nowrap;transition:background .15s,border-color .15s}
    .annB.on,.annIcon.on{background:linear-gradient(135deg,#3b82f6,#2563eb);border-color:#60a5fa;color:#fff}
    .annSize{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 6px 6px}
    .annDotBox{height:16px;display:flex;align-items:center;justify-content:center}
    .annDot{display:block;border-radius:50%;background:#fff}
    .annSizeTxt{font-size:10px;color:#cbd5e1}
    .annSwGrid{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;padding:2px}
    .annSwB{position:relative;display:block;width:100%;aspect-ratio:1;border-radius:50%;padding:0;border:2px solid rgba(255,255,255,.35);transition:transform .12s}
    .annSwB.on{border-color:#fff;box-shadow:0 0 0 3px #3b82f6;transform:scale(1.06)}
    .annCustom{background:conic-gradient(#ef4444,#facc15,#22c55e,#38bdf8,#8b5cf6,#ec4899,#ef4444);overflow:hidden}
    .annCustom input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:0;padding:0}
    .annDockDot{display:block;width:18px;height:18px;margin:auto;border-radius:50%;border:2px solid #fff}
  `;
  document.head.appendChild(css);

  // ---------- element helpers ----------
  function el(tag, cls, text, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function mkBtn(label, onClick, cls, parent, aria) {
    var b = el("button", cls || "annB", label, parent);
    b.type = "button";
    if (aria) b.setAttribute("aria-label", aria);
    b.addEventListener("click", onClick);
    return b;
  }
  function group(label, parent) {
    var g = el("div", "annGroup", null, parent);
    el("div", "annLbl", label, g);
    return g;
  }

  var catcher = el("div", "", null, document.body);
  catcher.id = "annCatch";

  var ui = el("div", "", null, document.body);
  ui.id = "annUI";

  // ---------- closed: round button ----------
  var fab = mkBtn("✎", function () { drawMode = true; setState("open"); }, "", ui, "Annotate");
  fab.id = "annFab";

  // ---------- shrunk: small pill ----------
  var dock = el("div", "", null, ui);
  dock.id = "annDock";
  var gripD = mkBtn("⠿", function () {}, "annGrip small", dock, "Drag to move");
  var dMode = mkBtn("✎", function () { setMode(!drawMode); }, "annIcon", dock, "Draw or move");
  dMode.style.width = "auto";
  dMode.style.padding = "0 12px";
  mkBtn("↶", function () { undo(); }, "annIcon", dock, "Undo");
  var dColor = mkBtn("", function () { setState("open"); }, "annIcon", dock, "Colour");
  var dDot = el("span", "annDockDot", null, dColor);
  mkBtn("▴", function () { setState("open"); }, "annIcon", dock, "Expand");
  mkBtn("✕", function () { setState("closed"); }, "annIcon", dock, "Close");

  // ---------- open: full panel ----------
  var panel = el("div", "", null, ui);
  panel.id = "annPanel";

  var head = el("div", "annHead", null, panel);
  var grip = mkBtn("⠿  Notes", function () {}, "annGrip", head, "Drag to move");
  mkBtn("▾", function () { setState("collapsed"); }, "annIcon", head, "Shrink");
  mkBtn("✕", function () { setState("closed"); }, "annIcon", head, "Close");

  var gMode = group("Mode", panel);
  var rowMode = el("div", "annRow", null, gMode);
  var bDraw = mkBtn("✎ Draw", function () { setMode(true); }, "annB", rowMode);
  var bMove = mkBtn("✋ Move", function () { setMode(false); }, "annB", rowMode);
  mkBtn("⤢ Fit", function () { fit(); }, "annB", rowMode);

  var gTool = group("Tool", panel);
  var rowTool = el("div", "annRow", null, gTool);
  var bPen = mkBtn("✏️ Pen", function () { tool = "pen"; refresh(); }, "annB", rowTool);
  var bMarker = mkBtn("🖍 Marker", function () { tool = "marker"; refresh(); }, "annB", rowTool);
  var bErase = mkBtn("🧽 Eraser", function () { tool = "erase"; refresh(); }, "annB", rowTool);

  var gSize = group("Thickness", panel);
  var rowSize = el("div", "annRow", null, gSize);
  var sizeBtns = DOT.map(function (d, i) {
    var b = el("button", "annB annSize", null, rowSize);
    b.type = "button";
    b.setAttribute("aria-label", SIZE_NAMES[i]);
    var box = el("span", "annDotBox", null, b);
    var dot = el("span", "annDot", null, box);
    dot.style.width = d + "px";
    dot.style.height = d + "px";
    el("span", "annSizeTxt", SIZE_NAMES[i], b);
    b.addEventListener("click", function () { sizeIdx = i; refresh(); });
    b.dotEl = dot;
    return b;
  });

  var gColor = group("Colour", panel);
  var grid = el("div", "annSwGrid", null, gColor);
  var swBtns = COLORS.map(function (c) {
    var b = el("button", "annSwB", null, grid);
    b.type = "button";
    b.style.background = c;
    b.setAttribute("aria-label", "Colour " + c);
    b.addEventListener("click", function () {
      color = c;
      if (tool === "erase") tool = "pen";
      refresh();
    });
    return b;
  });
  var custom = el("label", "annSwB annCustom", null, grid);
  custom.setAttribute("aria-label", "Custom colour");
  var picker = document.createElement("input");
  picker.type = "color";
  picker.value = "#2563eb";
  custom.appendChild(picker);
  picker.addEventListener("input", function () {
    color = picker.value;
    if (tool === "erase") tool = "pen";
    refresh();
  });

  var gAct = group("Notes", panel);
  var rowAct = el("div", "annRow", null, gAct);
  mkBtn("↶ Undo", function () { undo(); }, "annB", rowAct);
  mkBtn("Clear", function () { clearAll(); }, "annB", rowAct);
  var bSave = mkBtn("Save", function () {
    bSave.textContent = save() ? "Saved ✓" : "Can't save";
    setTimeout(function () { bSave.textContent = "Save"; }, 1400);
  }, "annB", rowAct);
  var bHide = mkBtn("Hide notes", function () {
    notesVisible = !notesVisible;
    if (!notesVisible) drawMode = false;
    refresh();
  }, "annB", rowAct);

  // ---------- actions ----------
  function undo() {
    var s = strokes.pop();
    if (s) removeStroke(s);
    save();
  }
  function clearAll() {
    if (!strokes.length) return;
    if (!confirm("Clear all your notes on this PDF?")) return;
    strokes.forEach(removeStroke);
    strokes = [];
    save();
  }
  function setMode(draw) {
    if (draw && !notesVisible) notesVisible = true;
    drawMode = draw;
    refresh();
  }
  function setState(s) {
    barOpen = s !== "closed";
    fab.style.display = s === "closed" ? "" : "none";
    dock.style.display = s === "collapsed" ? "flex" : "none";
    panel.style.display = s === "open" ? "flex" : "none";
    refresh();
  }
  function drawing() { return barOpen && drawMode && notesVisible; }

  function refresh() {
    infos.forEach(function (inf) { inf.svg.style.display = notesVisible ? "" : "none"; });
    bHide.textContent = notesVisible ? "Hide notes" : "Show notes";
    bDraw.classList.toggle("on", drawMode);
    bMove.classList.toggle("on", !drawMode);
    bPen.classList.toggle("on", tool === "pen");
    bMarker.classList.toggle("on", tool === "marker");
    bErase.classList.toggle("on", tool === "erase");
    sizeBtns.forEach(function (b, i) {
      b.classList.toggle("on", i === sizeIdx && tool !== "erase");
      b.style.opacity = tool === "erase" ? ".4" : "1";
      b.dotEl.style.background = tool === "erase" ? "#94a3b8" : color;
    });
    swBtns.forEach(function (b, i) {
      b.classList.toggle("on", tool !== "erase" && COLORS[i] === color);
    });
    custom.classList.toggle("on", tool !== "erase" && COLORS.indexOf(color) < 0);
    dMode.textContent = drawMode ? "✎ Draw" : "✋ Move";
    dMode.classList.toggle("on", drawMode);
    dDot.style.background = tool === "erase" ? "#94a3b8" : color;
    fab.style.borderColor = color;
    catcher.classList.toggle("draw", drawing());
  }

  // ---------- placing the toolbox in a corner ----------
  function applyCorner() {
    ui.style.left = "auto";
    ui.style.right = "auto";
    ui.style.top = "auto";
    ui.style.bottom = "auto";
    var v = corner.charAt(0) === "t" ? "top" : "bottom";
    var h = corner.charAt(1) === "l" ? "left" : "right";
    ui.style[v] = "calc(10px + env(safe-area-inset-" + v + ",0px))";
    ui.style[h] = "calc(10px + env(safe-area-inset-" + h + ",0px))";
  }
  function attachDrag(handle) {
    var dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
    handle.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      dragging = true;
      moved = false;
      var r = ui.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    });
    handle.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.hypot(dx, dy) > 6) {
        moved = true;
        ui.style.right = "auto";
        ui.style.bottom = "auto";
        ui.classList.add("drag");
      }
      if (moved) {
        ui.style.left = ox + dx + "px";
        ui.style.top = oy + dy + "px";
      }
    });
    function up() {
      if (!dragging) return;
      dragging = false;
      ui.classList.remove("drag");
      if (moved) {
        var r = ui.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        corner = (cy < innerHeight / 2 ? "t" : "b") + (cx < innerWidth / 2 ? "l" : "r");
      } else {
        corner = CORNERS[(CORNERS.indexOf(corner) + 1) % 4];
      }
      saveUI();
      applyCorner();
    }
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }
  attachDrag(grip);
  attachDrag(gripD);

  // ---------- touch: draw, pan, pinch ----------
  function eraseAt(q, g) {
    var R = 14 / view.k;
    var keep = [];
    strokes.forEach(function (s) {
      var hit = s.g === g && s.p.some(function (pt) {
        return Math.hypot(pt[0] - q[0], pt[1] - q[1]) < R;
      });
      if (hit) removeStroke(s); else keep.push(s);
    });
    strokes = keep;
  }
  function cancelCurrent() {
    if (cur) {
      removeStroke(cur);
      strokes = strokes.filter(function (s) { return s !== cur; });
    }
    cur = null;
  }
  function twoPts() {
    var ids = Object.keys(ptrs);
    return [ptrs[ids[0]], ptrs[ids[1]]];
  }
  function startPinch() {
    var t = twoPts();
    pinch0 = {
      d: Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) || 1,
      mx: (t[0].x + t[1].x) / 2,
      my: (t[0].y + t[1].y) / 2,
      vx: view.x, vy: view.y, vk: view.k
    };
  }
  function startStroke(e) {
    var g = pageAt((e.clientY - view.y) / view.k);
    if (g < 0) { mode = "ignore"; return; }
    var q = pagePt(e, g);
    if (tool === "erase") { mode = "erase"; eraseAt(q, g); return; }
    mode = "draw";
    cur = {
      g: g,
      c: color,
      w: Math.round((SIZES[tool][sizeIdx] / view.k) * 100) / 100,
      a: tool === "marker" ? 0.35 : 1,
      p: [q]
    };
    addStrokeEl(cur);
    strokes.push(cur);
  }

  catcher.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    try { catcher.setPointerCapture(e.pointerId); } catch (_) {}
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    var n = Object.keys(ptrs).length;
    if (n >= 2) {
      cancelCurrent();
      startPinch();
      mode = "pinch";
      return;
    }
    if (drawing()) {
      startStroke(e);
    } else {
      mode = "pan";
      lastPan = { x: e.clientX, y: e.clientY };
    }
  });

  catcher.addEventListener("pointermove", function (e) {
    if (!ptrs[e.pointerId]) return;
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (mode === "pinch" && pinch0 && Object.keys(ptrs).length >= 2) {
      var t = twoPts();
      var d = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) || 1;
      var mx = (t[0].x + t[1].x) / 2, my = (t[0].y + t[1].y) / 2;
      var nk = clampK(pinch0.vk * d / pinch0.d);
      view.x = mx - ((pinch0.mx - pinch0.vx) / pinch0.vk) * nk;
      view.y = my - ((pinch0.my - pinch0.vy) / pinch0.vk) * nk;
      view.k = nk;
      apply();
    } else if (mode === "pan" && lastPan) {
      view.x += e.clientX - lastPan.x;
      view.y += e.clientY - lastPan.y;
      lastPan = { x: e.clientX, y: e.clientY };
      apply();
    } else if (mode === "draw" && cur) {
      var q = pagePt(e, cur.g);
      var last = cur.p[cur.p.length - 1];
      if (Math.hypot(q[0] - last[0], q[1] - last[1]) < 0.6 / view.k) return;
      cur.p.push(q);
      cur.el.setAttribute("d", pathD(cur.p));
    } else if (mode === "erase") {
      var g = pageAt((e.clientY - view.y) / view.k);
      if (g >= 0) eraseAt(pagePt(e, g), g);
    }
  });

  function end(e) {
    delete ptrs[e.pointerId];
    var n = Object.keys(ptrs).length;
    if (n === 0) {
      if (mode === "draw" || mode === "erase") save();
      cur = null;
      mode = null;
      pinch0 = null;
    } else if (mode === "pinch" && n < 2) {
      mode = "ignore";
    }
  }
  catcher.addEventListener("pointerup", end);
  catcher.addEventListener("pointercancel", end);

  catcher.addEventListener("wheel", function (e) {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, view.k * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  window.addEventListener("resize", function () { apply(); });

  // ---------- load the PDF ----------
  function renderPage(inf) {
    if (inf.done) return;
    inf.done = true;
    var sc = 2600 / inf.vw;
    var vp = inf.page.getViewport({ scale: sc });
    var c = document.createElement("canvas");
    c.width = Math.round(vp.width);
    c.height = Math.round(vp.height);
    c.style.cssText = "display:block;width:100%;height:100%";
    inf.div.insertBefore(c, inf.svg);
    inf.page.render({ canvasContext: c.getContext("2d"), viewport: vp });
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) renderPage(en.target._inf);
    });
  }, { rootMargin: "800px" });

  function buildPage(page) {
    var vp = page.getViewport({ scale: 1 });
    var h = Math.round((1000 * vp.height) / vp.width);
    var div = el("div", "", null, pagesEl);
    div.style.cssText =
      "position:relative;width:1000px;height:" + h + "px;margin:0 0 10px;background:#fff";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 1000 " + h);
    svg.style.cssText =
      "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:hidden";
    div.appendChild(svg);
    var inf = { div: div, svg: svg, page: page, vw: vp.width, done: false };
    div._inf = inf;
    infos.push(inf);
    io.observe(div);
  }

  function init() {
    if (!FILE) {
      msg.textContent = "No PDF chosen. Add ?file=/path/to/file.pdf to the address.";
      return;
    }
    if (!window.pdfjsLib) {
      msg.textContent = "The PDF viewer library did not load. Check your connection.";
      return;
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    pdfjsLib.getDocument(FILE).promise.then(function (pdf) {
      var chain = Promise.resolve();
      for (var i = 1; i <= pdf.numPages; i++) {
        (function (n) {
          chain = chain.then(function () {
            return pdf.getPage(n).then(buildPage);
          });
        })(i);
      }
      return chain;
    }).then(function () {
      msg.style.display = "none";
      load().forEach(function (s) {
        if (!infos[s.g]) return;
        strokes.push(s);
        addStrokeEl(s);
      });
      fit();
      refresh();
    }).catch(function (err) {
      msg.textContent = "Could not open the PDF: " + ((err && err.message) || err);
    });
  }

    // ---------- page indicator + jump ----------
  var pgBtn = document.createElement("button");
  pgBtn.type = "button";
  pgBtn.style.cssText =
    "position:fixed;top:calc(10px + env(safe-area-inset-top,0px));left:50%;" +
    "transform:translateX(-50%);z-index:99999;padding:7px 14px;border-radius:999px;" +
    "border:1px solid rgba(255,255,255,.14);background:rgba(15,23,42,.93);" +
    "color:#e2e8f0;font:600 13px system-ui,sans-serif;display:none";
  document.body.appendChild(pgBtn);
  function curPage() {
    return Math.max(0, pageAt((innerHeight / 2 - view.y) / view.k));
  }
  function updPg() {
    if (!infos.length) return;
    pgBtn.style.display = "block";
    pgBtn.textContent = "Page " + (curPage() + 1) + " / " + infos.length;
  }
  var _apply = apply;
  apply = function () { _apply(); updPg(); };
  pgBtn.addEventListener("click", function () {
    var n = parseInt(prompt("Go to page (1-" + infos.length + ")", curPage() + 1), 10);
    if (!n) return;
    n = Math.min(infos.length, Math.max(1, n));
    view.y = 10 - infos[n - 1].div.offsetTop * view.k;
    apply();
  });applyCorner();
  setState("closed");
  init();
})();
