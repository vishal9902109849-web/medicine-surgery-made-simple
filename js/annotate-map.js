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

  var stage = document.getElementById("stage") || document.getElementById("world");
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
  var bPen = mkBtn("✏️ Pen", function () { tool = "pen"
