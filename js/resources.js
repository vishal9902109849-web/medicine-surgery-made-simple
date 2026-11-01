import { db } from "./supabase.js";
import { BUCKET } from "./config.js";

const $ = (id) => document.getElementById(id);
let all = [];

const urlFor = (path) =>
  db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
const extOf = (path) => (path.split(".").pop() || "").toLowerCase();
const isImage = (e) => ["png", "jpg", "jpeg", "webp", "gif"].includes(e);

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
  btn.textContent = ext === "html" || ext === "htm" ? "Open mind map" : "Open";
  btn.addEventListener("click", () => open(r, url, ext));
  el.appendChild(btn);
  return el;
}

// Supabase serves .html files as plain text, so we fetch the text and show it
// inside a sandboxed frame. PDFs and images open normally in a new tab.
async function open(r, url, ext) {
  if (ext !== "html" && ext !== "htm") {
    window.open(url, "_blank", "noopener");
    return;
  }
  $("viewerTitle").textContent = r.title;
  $("viewer").hidden = false;
  document.body.style.overflow = "hidden";
  $("frame").srcdoc = "<p style='font-family:sans-serif;padding:20px'>Loading…</p>";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    $("frame").srcdoc = await res.text();
  } catch (err) {
    $("frame").srcdoc =
      "<p style='font-family:sans-serif;padding:20px'>Could not load this file.</p>";
  }
}

function closeViewer() {
  $("viewer").hidden = true;
  $("frame").srcdoc = "";
  document.body.style.overflow = "";
}

$("closeBtn").addEventListener("click", closeViewer);
["fSubject", "fType"].forEach((id) =>
  $(id).addEventListener("change", render)
);
$("fSearch").addEventListener("input", render);

load();
