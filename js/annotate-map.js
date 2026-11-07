(function () {
  if (window.__annLoaded) return;
  window.__annLoaded = true;

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

  function findWorld() {
  var ids = ["world", "stage", "canvas", "viewport", "map", "mindmap", "content"];
  for (var i = 0; i < ids.length; i++) {
    var e = document.getElementById(ids[i]);
    if (e && getComputedStyle(e).transform !== "none") return e;
  }
  // Fallback: the transformed element containing the most descendants
  var best = null, bestN = 0;
  document.querySelectorAll("body *").forEach(function (e) {
    if (e.closest && e.closest("#annUI,#annCatch")) return;
    if (getComputedStyle(e).transform === "none") return;
    var n = e.getElementsByTagName("*").length;
    if (n > bestN) { best = e; bestN = n; }
  });
  return best;
}
var stage = findWorld();
var useBody = !stage;
var host = stage || document.body;

  // The drawing layer lives INSIDE the zooming layer, so it zooms and pans with the map.
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
  var state = "closed";
  var corner = "tl";
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

  // ---------- styles ----------
  var css = document.createElement("style");
  css.textContent = `
    #annCatch{position:fixed;inset:0;z-index:99998;touch-action:none;display:none;cursor:crosshair}
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
  var dUndo = mkBtn("↶", function () { undo(); }, "annIcon", dock, "Undo");
  var dColor = mkBtn("", function () { setState("open"); }, "annIcon", dock, "Colour");
  var dDot = el("span", "annDockDot", null, dColor);
  var dExpand = mkBtn("▴", function () { setState("open"); }, "annIcon", dock, "Expand");
  var dClose = mkBtn("✕", function () { setState("closed"); }, "annIcon", dock, "Close");

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
  var bMove = mkBtn("✋ Move / Zoom", function () { setMode(false); }, "annB", rowMode);

  var gTool = group("Tool", panel);
  var rowTool = el("div", "annRow", null, gTool);
  var bPen = mkBtn("✏️ Pen", function () { tool = "pen"; refresh(); }, "annB", rowTool);
  var bMarker = mkBtn("🖍 Marker", function () { tool = "marker"; refresh(); }, "annB", rowTool);
  var bErase = mkBtn("🧽 Eraser", function () { tool = "erase"; refresh(); }, "annB", rowTool);
  var bSel = mkBtn("⬚ Select", function () { tool = "select"; refresh(); }, "annB", rowTool);

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
      if (tool === "select" && recolorSel(c)) { refresh(); return; }
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
    if (tool === "select") recolorSel(picker.value);
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
 function recolorSel(c) {
   
  if (!sel.length) return false;
  sel.forEach(function (s) { s.c = c; s.el.setAttribute("stroke", c); });
  save();
  return true;
 }
 var hist = [], pend = null;
function makeSnap(list) {
  return { t: "edit", items: list.map(function (s) {
    return { s: s, p: s.p.map(function (pt) { return [pt[0], pt[1]]; }), c: s.c };
  }) };
}
function undoHist(h) {
  if (h.t === "draw") {
    removeStroke(h.s);
    strokes = strokes.filter(function (s) { return s !== h.s; });
  } else {
    h.items.forEach(function (it) {
      it.s.p = it.p;
      it.s.c = it.c;
      it.s.el.setAttribute("d", pathD(it.s.p));
      it.s.el.setAttribute("stroke", it.c);
    });
  }
  save();
}
  function undo() {
    var s = strokes.pop();
    if (s && s.el.parentNode) s.el.parentNode.removeChild(s.el);
    save();
  }
  function clearAll() {
    if (!strokes.length) return;
    if (!confirm("Clear all your notes on this mind map?")) return;
    strokes.forEach(function (s) { if (s.el.parentNode) s.el.parentNode.removeChild(s.el); });
    strokes = [];
    save();
  }
  function setMode(draw) {
    if (draw && !notesVisible) notesVisible = true;
    drawMode = draw;
    refresh();
  }
  function setState(s) {
    state = s;
    barOpen = s !== "closed";
    fab.style.display = s === "closed" ? "" : "none";
    dock.style.display = s === "collapsed" ? "flex" : "none";
    panel.style.display = s === "open" ? "flex" : "none";
    refresh();
  }

  function refresh() {
    svg.style.display = notesVisible ? "" : "none";
    bHide.textContent = notesVisible ? "Hide notes" : "Show notes";
    bDraw.classList.toggle("on", drawMode);
    bMove.classList.toggle("on", !drawMode);
    bPen.classList.toggle("on", tool === "pen");
    bMarker.classList.toggle("on", tool === "marker");
    bErase.classList.toggle("on", tool === "erase");
    bSel.classList.toggle("on", tool === "select");
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
    catcher.style.display = barOpen && drawMode && notesVisible ? "block" : "none";
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

  // Drag the handle to move; it snaps to the nearest corner. A quick tap jumps to the next corner.
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
var sel = [], selBox = null, selMode = null, selLast = null;
function strokeHit(s, q, R) {
  return s.p.some(function (pt) { return Math.hypot(pt[0] - q[0], pt[1] - q[1]) < R; });
}
function paintSel() {
  strokes.forEach(function (s) {
    s.el.style.filter = sel.indexOf(s) >= 0 ? "drop-shadow(0 0 3px #2563eb)" : "";
  });
}
function selDown(q) {
  var R = 22 / scaleNow();
  var hit = null;
  for (var i = strokes.length - 1; i >= 0; i--) {
    if (strokeHit(strokes[i], q, R)) { hit = strokes[i]; break; }
  }
  if (hit) {
    if (sel.indexOf(hit) < 0) sel = [hit];
    selMode = "move";
    selLast = q;
  } else {
    sel = [];
    selMode = "box";
    selLast = q;
    selBox = document.createElementNS(NS, "rect");
    selBox.setAttribute("fill", "rgba(37,99,235,.12)");
    selBox.setAttribute("stroke", "#2563eb");
    selBox.setAttribute("stroke-width", 1 / scaleNow());
    selBox.setAttribute("stroke-dasharray", 4 / scaleNow());
    svg.appendChild(selBox);
  }
  paintSel();
}
function selMove(q) {
  if (selMode === "move") {
    var dx = q[0] - selLast[0], dy = q[1] - selLast[1];
    sel.forEach(function (s) {
      s.p = s.p.map(function (pt) { return [pt[0] + dx, pt[1] + dy]; });
      s.el.setAttribute("d", pathD(s.p));
    });
    selLast = q;
  } else if (selMode === "box") {
    var x = Math.min(selLast[0], q[0]), y = Math.min(selLast[1], q[1]);
    selBox.setAttribute("x", x);
    selBox.setAttribute("y", y);
    selBox.setAttribute("width", Math.abs(q[0] - selLast[0]));
    selBox.setAttribute("height", Math.abs(q[1] - selLast[1]));
  }
}
function selUp(q) {
  if (selMode === "box" && selBox) {
var bx = +selBox.getAttribute("x") || 0, by = +selBox.getAttribute("y") || 0;
var x1 = bx, x2 = bx + (+selBox.getAttribute("width") || 0);
var y1 = by, y2 = by + (+selBox.getAttribute("height") || 0);    sel = strokes.filter(function (s) {
      return s.p.some(function (pt) {
        return pt[0] >= x1 && pt[0] <= x2 && pt[1] >= y1 && pt[1] <= y2;
      });
    });
    svg.removeChild(selBox);
    selBox = null;
    paintSel();
  }
  if (selMode === "move") save();
  selMode = null;
}
  catcher.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    nActive++;
    if (nActive > 1) { cancelCurrent(); return; }
    try { catcher.setPointerCapture(e.pointerId); } catch (_) {}
    var q = toLocal(e);
    if (!q) return;
    if (tool === "erase") { erasing = true; eraseAt(q); return; }
    if (tool === "select") { selDown(q); return; }
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
    if (tool === "select") { selMove(q); return; }
    if (!cur) return;
    var last = cur.p[cur.p.length - 1];
    if (Math.hypot(q[0] - last[0], q[1] - last[1]) < 0.6 / scaleNow()) return;
    cur.p.push(q);
    cur.el.setAttribute("d", pathD(cur.p));
  });

  function end() {
    if (tool === "select" && selMode) { selUp(selLast); nActive = 0; return; }
    nActive = Math.max(0, nActive - 1);
    if (nActive === 0 && (cur || erasing)) {
      cur = null;
      erasing = false;
      save();
    }
  }
  catcher.addEventListener("pointerup", end);
  catcher.addEventListener("pointercancel", end);

  strokes.forEach(function (s) { s._h = true; });

var _selDown = selDown;
selDown = function (q) {
  _selDown(q);
  pend = selMode === "move" ? makeSnap(sel) : null;
};

var _selUp = selUp;
selUp = function (q) {
  var wasMove = selMode === "move";
  _selUp(q);
  if (wasMove && pend) {
    var a = pend.items[0];
    if (a && (a.p[0][0] !== a.s.p[0][0] || a.p[0][1] !== a.s.p[0][1])) hist.push(pend);
  }
  pend = null;
};

var _recolorSel = recolorSel;
recolorSel = function (c) {
  if (sel.length) hist.push(makeSnap(sel));
  return _recolorSel(c);
};

catcher.addEventListener("pointerup", function () {
  var last = strokes[strokes.length - 1];
  if (last && !last._h && tool !== "select" && tool !== "erase") {
    last._h = true;
    hist.push({ t: "draw", s: last });
  }
});

undo = function () {
  var h = hist.pop();
  if (h) { undoHist(h); return; }
  var s = strokes.pop();
  if (s && s.el.parentNode) s.el.parentNode.removeChild(s.el);
  save();
};
  var adoptTries = 0;
(function adopt() {
  if (!useBody) return;
  var w = findWorld();
  if (w) {
    if (getComputedStyle(w).position === "static") w.style.position = "relative";
    w.appendChild(svg);
    host = w;
    useBody = false;
    svg.style.width = "100%";
    svg.style.height = "100%";
    return;
  }
  if (++adoptTries < 40) setTimeout(adopt, 250);
})();
  applyCorner();
  setState("closed");

})();
