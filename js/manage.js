import { db } from "./supabase.js";
import { BUCKET } from "./config.js";
import { showMessage } from "./ui.js";

const $ = (id) => document.getElementById(id);

async function listResources() {
  const { data, error } = await db
    .from("resources")
    .select("id,title,subject,resource_type,file_path,is_published,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function setPublished(id, value) {
  const { error } = await db
    .from("resources")
    .update({ is_published: value })
    .eq("id", id);
  if (error) throw error;
}

async function deleteResource(row) {
  const { error: fileErr } = await db.storage
    .from(BUCKET)
    .remove([row.file_path]);
  if (fileErr) throw fileErr;
  const { error } = await db.from("resources").delete().eq("id", row.id);
  if (error) throw error;
}

function makeButton(label, className, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.className = className;
  b.addEventListener("click", onClick);
  return b;
}

function makeRow(row) {
  const el = document.createElement("div");
  el.className = "mrow";

  const info = document.createElement("div");
  info.className = "minfo";

  const title = document.createElement("strong");
  title.textContent = row.title;

  const meta = document.createElement("small");
  meta.textContent =
    `${row.subject} · ${row.resource_type} · ` +
    (row.is_published ? "Visible" : "Hidden");

  info.append(title, meta);

  const actions = document.createElement("div");
  actions.className = "mactions";

  actions.appendChild(
    makeButton(row.is_published ? "Hide" : "Show", "ghost", async () => {
      try {
        await setPublished(row.id, !row.is_published);
        await refreshManager();
      } catch (err) {
        showMessage($("manageMsg"), err.message, "error");
      }
    })
  );

  actions.appendChild(
    makeButton("Delete", "ghost danger", async () => {
      if (!confirm(`Delete "${row.title}" permanently? This cannot be undone.`))
        return;
      try {
        await deleteResource(row);
        showMessage($("manageMsg"), `Deleted "${row.title}".`, "success");
        await refreshManager(true);
      } catch (err) {
        showMessage($("manageMsg"), err.message, "error");
      }
    })
  );

  el.append(info, actions);
  return el;
}

export async function refreshManager(keepMessage = false) {
  const box = $("manageList");
  if (!box) return;
  if (!keepMessage) showMessage($("manageMsg"), "");
  try {
    const rows = await listResources();
    box.replaceChildren();
    if (rows.length === 0) {
      box.textContent = "Nothing published yet.";
      return;
    }
    rows.forEach((r) => box.appendChild(makeRow(r)));
  } catch (err) {
    showMessage($("manageMsg"), "Could not load list: " + err.message, "error");
  }
}
