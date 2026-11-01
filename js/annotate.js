const viewer = document.getElementById("viewer");
const frame = document.getElementById("frame");

if (viewer && frame) init();

function init() {
  const header = viewer.querySelector("header");
  const closeBtn = document.getElementById("closeBtn");
  const titleEl = document.getElementById("viewerTitle");

  const COLORS = ["#ef4444", "#2563eb", "#16a34a", "#111827", "#f59e0b"];
  let tool = "pen";
  let color = COLORS[0];
  let annotating = false;
  let notesVisible = true;
  let strokes = [];
  let key = "";
  let W = 1;
  let H = 1;
  let cur = null;
  let erasing = false;

  // ---------- styles ----------
  const css = document.createElement("style");
  css.textContent = `
    #annCanvas{position:absolute;z-index:5;pointer-events:none;touch-action:none}
    #annCanvas.on{pointer-events:auto;cursor:crosshair}
    #annBar{position:absolute;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:6;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;align-items:center;background:#1e293b;border:1px solid #334155;border-radius:14px;padding:8px}
    #annBar button{width:auto;padding:8px 12px;font-size:14px;background:#0b1220;border:1px solid #334155;color:#f1f5f9}
    #annBar button.active{background:#2563eb;border-color:#2563eb}
    #annBar .sw{width:30px;height:30px;padding:0;border-radius:50%;border:2px solid #ffffff44}
    #annBar .sw.active{border-color:#fff}
  `;
  document.head.appendChild(css);

  // ---------- elements ----------
  const canvas = document.createElement("canvas");
  canvas.id = "annCanvas";
  viewer.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const makeBtn = (label, cls) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (cls) b.className = cls;
    return b;
  };

  const toggleBtn = makeBtn("Annotate", "ghost");
  const visBtn = makeBtn("Hide notes", "ghost");
  header.insertBefore(visBtn, closeBtn);
  header.insertBefore(toggleBtn, visBtn);

  const bar = document.createElement("div");
  bar.id = "annBar";
  bar.hidden = true;
  viewer.appendChild(bar);

  const toolBtns = {
    pen: makeBtn("Pen"),
    marker: makeBtn("Marker"),
    erase: makeBtn("Eraser"),
  };
  Object.entries(toolBtns).forEach(([name, b]) => {
    b.addEventListener("click", () => {
      tool = name;
      refreshBar();
    });
    bar.appendChild(b);
  });

  const swatches = COLORS.map((c) => {
    const b = makeBtn("", "sw");
    b.style.background = c;
    b.setAttribute("aria-label", "Colour " + c);
    b.addEventListener("click", () => {
      color = c;
      if (tool === "erase") tool = "pen";
      refreshBar();
    });
    bar.appendChild(b);
    return b;
  });

  const undoBtn = makeBtn("Undo");
  undoBtn.addEventListener("click", () => {
    strokes.pop();
    save();
    redraw();
  });
  const clearBtn = makeBtn("Clear");
  clearBtn.addEventListener("click", () => {
    if (!strokes.length) return;
    if (!confirm("Clear all your notes on this mind map?")) return;
    strokes = [];
    save();
    redraw();
  });
  const doneBtn = makeBtn("Done");
  doneBtn.addEventListener("click", () => setAnnotating(false));
  bar.append(undoBtn, clearBtn, doneBtn);

  function refreshBar() {
    Object.entries(toolBtns).forEach(([name, b]) =>
      b.classList.toggle("active", tool === name)
    );
    swatches.forEach((b, i) =>
      b.classList.toggle("active", tool !== "erase" && COLORS[i] === color)
    );
  }

  // ---------- storage ----------
  function currentKey() {
    let id = "";
    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch (_) {}
    return "ann:" + (id || titleEl.textContent || "unknown");
  }

  function load() {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch (_) {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(strokes));
    } catch (_) {
      /* storage full or blocked: notes stay on screen for this session */
    }
  }

  // ---------- drawing ----------
  function place() {
    if (viewer.hidden) return;
    const v = viewer.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.style.left = f.left - v.left + "px";
    canvas.style.top = f.top - v.top + "px";
    canvas.style.width = f.width + "px";
    canvas.style.height = f.height + "px";
    canvas.width = Math.max(1, Math.round(f.width * dpr));
    canvas.height = Math.max(1, Math.round(f.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = f.width;
    H = f.height;
    redraw();
  }

  function drawStroke(s) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = s.c;
    ctx.lineWidth = s.w;
    ctx.globalAlpha = s.a;
    ctx.beginPath();
    s.p.forEach(([x, y], i) => {
      const px = x * W;
      const py = y * H;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    if (s.p.length === 1) ctx.lineTo(s.p[0][0] * W + 0.01, s.p[0][1] * H);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function redraw() {
    ctx.clearRect(0, 0, W, H);
    if (!notesVisible) return;
    strokes.forEach(drawStroke);
  }

  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };

  function eraseAt(p) {
    const R = 16;
    const before = strokes.length;
    strokes = strokes.filter(
      (s) =>
        !s.p.some(
          ([x, y]) => Math.hypot((x - p[0]) * W, (y - p[1]) * H) < R
        )
    );
    if (strokes.length !== before) redraw();
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (!annotating) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const p = point(e);
    if (tool === "erase") {
      erasing = true;
      eraseAt(p);
      return;
    }
    cur = {
      c: color,
      w: tool === "marker" ? 18 : 3,
      a: tool === "marker" ? 0.35 : 1,
      p: [p],
    };
    strokes.push(cur);
    redraw();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!annotating) return;
    if (erasing) {
      eraseAt(point(e));
    } else if (cur) {
      cur.p.push(point(e));
      redraw();
    }
  });

  const finish = () => {
    if (cur || erasing) {
      cur = null;
      erasing = false;
      save();
    }
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);

  // ---------- modes ----------
  function setAnnotating(on) {
    annotating = on;
    canvas.classList.toggle("on", on);
    bar.hidden = !on;
    toggleBtn.textContent = on ? "Annotating…" : "Annotate";
    if (on && !notesVisible) {
      notesVisible = true;
      visBtn.textContent = "Hide notes";
      redraw();
    }
    refreshBar();
  }

  toggleBtn.addEventListener("click", () => setAnnotating(!annotating));

  visBtn.addEventListener("click", () => {
    notesVisible = !notesVisible;
    visBtn.textContent = notesVisible ? "Hide notes" : "Show notes";
    if (!notesVisible) setAnnotating(false);
    redraw();
  });

  // ---------- follow the viewer ----------
  function refresh() {
    if (viewer.hidden) return;
    key = currentKey();
    strokes = load();
    notesVisible = true;
    visBtn.textContent = "Hide notes";
    setAnnotating(false);
    requestAnimationFrame(place);
  }

  new MutationObserver(() => {
    if (viewer.hidden) setAnnotating(false);
    else refresh();
  }).observe(viewer, { attributes: true, attributeFilter: ["hidden"] });

  // A different mind map opened inside the viewer (link tapped inside a map)
  new MutationObserver(refresh).observe(titleEl, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  window.addEventListener("resize", place);
  window.addEventListener("orientationchange", () => setTimeout(place, 250));
}
