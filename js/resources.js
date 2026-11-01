import { db } from "./supabase.js";
import { BUCKET } from "./config.js";

const $ = (id) => document.getElementById(id);
let all = [];

const urlFor = (path) =>
  db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
const extOf = (path) => (path.split(".").pop() || "").toLowerCase();
const isImage = (e) => ["png", "jpg", "jpeg", "webp", "gif"].includes(e);
const isHtml = (e) => e === "html" || e === "htm";
const shareUrl = (r) => location.origin + location.pathname + "#" + r.id;

// Added to every mind map: the drawing layer, saved under the file's path.
const annScript = (path) =>
  "<script>window.__ANN_KEY=" +
  JSON.stringify("ann2:" + path).replace(/</g, "\\u003c") +
  ";<\/script><script src=\"/js/annotate-map.js\"><\/script>";

async function load() {
  const { data, error } = await db
    .from("resources")
    .select("*")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  $("status").hidden = false;
  if (error) {
    $("status").textContent = "Could not load resources: " + error.message;
    return;
  }
  all = data || [];
  render();
  openFromHash();
}

function render() {
  const subject = $("fSubject").value;
  const type = $("fType").value;
  const q = $("fSearch").value.trim().toLowerCase();

  const list = all.filter(
    (r) =>
      (subject === "All" || r.subject === subject) &&
      (type === "All" || r.resource_type === type) &&
      (!q ||
        r.title.toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q))
  );

  const grid = $("grid");
  grid.replaceChildren();
  $("status").hidden = list.length > 0;
  $("status").textContent = "No resources found.";

  list.forEach((r) => grid.appendChild(card(r)));
}

function card(r) {
  const ext = extOf(r.file_path);
  const url = urlFor(r.file_path);

  const el = document.createElement("article");
  el.className = "res";

  if (isImage(ext)) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = r.title;
    img.loading = "lazy";
    el.appendChild(img);
  }

  const h = document.createElement("h3");
  h.textContent = r.title;
  el.appendChild(h);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${r.subject} · ${r.resource_type} · ${ext.toUpperCase()}`;
  el.appendChild(meta);

  if (r.description) {
    const p = document.createElement("p");
    p.textContent = r.description;
    el.appendChild(p);
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = isHtml(ext) ? "Open mind map" : "Open";
  btn.addEventListener("click", () => open(r));
  el.appendChild(btn);

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "ghost";
  copy.style.marginTop = "8px";
  copy.style.width = "100%";
  copy.textContent = "Copy link";
  copy.addEventListener("click", () => copyLink(r, copy));
  el.appendChild(copy);
  return el;
}

async function copyLink(r, btn) {
  const link = shareUrl(r);
  try {
    await navigator.clipboard.writeText(link);
    btn.textContent = "Link copied";
  } catch (_) {
    window.prompt("Copy this link:", link);
    return;
  }
  setTimeout(() => (btn.textContent = "Copy link"), 1800);
}

// Supabase serves .html as plain text, so we fetch the text and show it
// inside a sandboxed frame. PDFs and images open normally in a new tab.
async function open(r) {
  const ext = extOf(r.file_path);
  const url = urlFor(r.file_path);
if (ext === "pdf") {
    window.open(
      "/pdf.html?file=" + encodeURIComponent(url),
      "_blank",
      "noopener"
    );
    return;
}
  if (!isHtml(ext)) {
    window.open(url, "_blank", "noopener");
    return;
  }
  history.replaceState(null, "", "#" + r.id);
  $("viewerTitle").textContent = r.title;
  $("viewer").hidden = false;
  document.body.style.overflow = "hidden";
  $("frame").srcdoc =
    "<p style='font-family:sans-serif;padding:20px'>Loading…</p>";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
        $("frame").srcdoc = (await res.text()) + annScript(r.file_path);
  } catch (err) 
  {
    $("frame").srcdoc =
      "<p style='font-family:sans-serif;padding:20px'>Could not load this file.</p>";
  }
}

// Opens the mind map named in the address, e.g. resources.html#<id>
function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const match = all.find((r) => r.id === id);
  if (match) {
    open(match);
  } else {
    $("status").hidden = false;
    $("status").textContent =
      "That resource is not available. It may have been hidden or removed.";
  }
}

// A link was tapped inside a mind map.
function handleLink(href) {
  if (/^https?:\/\//i.test(href)) {
    window.open(href, "_blank", "noopener");
    return;
  }
  let name = href.split("#")[0].split("?")[0].split("/").pop();
  try {
    name = decodeURIComponent(name);
  } catch (_) {}
  name = name.toLowerCase();

  const match = all.find((r) => (r.file_name || "").toLowerCase() === name);
  if (match) {
    open(match);
  } else {
    alert(
      `This linked page ("${name}") has not been uploaded yet.\n` +
        "Upload it in the admin dashboard with the same file name."
    );
  }
}

function closeViewer() {
  $("viewer").hidden = true;
  $("frame").srcdoc = "";
  document.body.style.overflow = "";
  history.replaceState(null, "", location.pathname);
}

window.addEventListener("message", (ev) => {
  if (ev.source !== $("frame").contentWindow) return;
  const href = ev.data && ev.data.mindmapLink;
  if (typeof href === "string") handleLink(href);
});

window.addEventListener("hashchange", () => {
  if (all.length) openFromHash();
});

$("closeBtn").addEventListener("click", closeViewer);
["fSubject", "fType"].forEach((id) =>
  $(id).addEventListener("change", render)
);
$("fSearch").addEventListener("input", render);

load();
