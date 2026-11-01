import { db } from "./supabase.js";
import { SUPABASE_URL, SUPABASE_KEY, BUCKET } from "./config.js";

export const MAX_MB = 50;

const MIME = {
  html: "text/html",
  htm: "text/html",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export const ACCEPT = Object.keys(MIME).map((e) => "." + e).join(",");

const extOf = (name) => (name.split(".").pop() || "").toLowerCase();

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "file";

export function validateForm({ title, subject, type, file }) {
  if (!title.trim()) return "Please enter a title.";
  if (title.trim().length < 3) return "Title is too short.";
  if (!subject) return "Please select a subject.";
  if (!type) return "Please select a type.";
  if (!file) return "Please choose a file.";
  if (!MIME[extOf(file.name)])
    return "File type not allowed. Use HTML, PDF, PNG, JPG, WEBP or GIF.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_MB * 1024 * 1024)
    return `File is too large. Maximum is ${MAX_MB} MB.`;
  return "";
}

// Always unique: folder / timestamp-random-name.ext
// so a second upload with the same filename never overwrites the first.
function makePath(subject, type, file) {
  const ext = extOf(file.name);
  const base = slug(file.name.replace(/\.[^.]+$/, ""));
  const rand = Math.random().toString(36).slice(2, 6);
  return `${slug(subject)}/${slug(type)}/${Date.now()}-${rand}-${base}.${ext}`;
}

async function uploadWithProgress(path, file, onProgress) {
  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You are logged out. Please log in again.");

  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encoded}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", SUPABASE_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", MIME[extOf(file.name)]);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `Upload failed (${xhr.status}).`;
      try {
        msg = JSON.parse(xhr.responseText).message || msg;
      } catch (_) {}
      reject(new Error(msg));
    };
    xhr.onerror = () =>
      reject(new Error("Network error. Check your connection and try again."));
    xhr.send(file);
  });
}

export async function publishResource(fields, onProgress) {
  const problem = validateForm(fields);
  if (problem) throw new Error(problem);

  const { title, description, subject, type, file } = fields;
  const path = makePath(subject, type, file);

  await uploadWithProgress(path, file, onProgress);

  const { data, error } = await db
    .from("resources")
    .insert({
      title: title.trim(),
      description: description.trim() || null,
      subject,
      resource_type: type,
      file_path: path,
      file_name: file.name,
      is_published: true,
    })
    .select()
    .single();

  if (error) {
    // Don't leave an orphan file in storage if the database save failed.
    await db.storage.from(BUCKET).remove([path]);
    throw new Error("Saved the file but not the record: " + error.message);
  }
  return data;
}
