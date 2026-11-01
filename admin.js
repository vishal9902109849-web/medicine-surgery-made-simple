import { login, logout, getSessionUser, onAuthChange } from "./js/auth.js";
import { showMessage, setLoading, showView } from "./js/ui.js";
import { publishResource, validateForm } from "./js/upload.js";

const $ = (id) => document.getElementById(id);

function setProgress(percent) {
  $("progressWrap").hidden = false;
  $("progressBar").style.width = percent + "%";
  $("progressText").textContent = percent + "%";
}

function resetProgress() {
  $("progressWrap").hidden = true;
  $("progressBar").style.width = "0%";
  $("progressText").textContent = "0%";
}

function readForm() {
  return {
    title: $("title").value,
    description: $("description").value,
    subject: $("subject").value,
    type: $("type").value,
    file: $("file").files[0] || null,
  };
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = $("loginBtn");
  showMessage($("loginMsg"), "");
  setLoading(btn, true);
  try {
    await login($("email").value.trim(), $("password").value);
    $("password").value = "";
  } catch (err) {
    showMessage($("loginMsg"), err.message || "Login failed.");
  } finally {
    setLoading(btn, false, "Login");
  }
}

async function handlePublish(e) {
  e.preventDefault();
  const btn = $("publishBtn");
  const msg = $("uploadMsg");
  showMessage(msg, "");

  const fields = readForm();
  const problem = validateForm(fields);
  if (problem) {
    showMessage(msg, problem, "error");
    return;
  }

  setLoading(btn, true);
  setProgress(0);
  try {
    await publishResource(fields, setProgress);
    showMessage(msg, `Published "${fields.title.trim()}" successfully.`, "success");
    $("uploadForm").reset();
  } catch (err) {
    showMessage(msg, err.message || "Upload failed.", "error");
  } finally {
    setLoading(btn, false, "Publish Resource");
    setTimeout(resetProgress, 1500);
  }
}

function render(user) {
  showView(!!user);
  if (user) $("who").textContent = user.email;
}

async function init() {
  render(await getSessionUser());
  onAuthChange(render);
  $("loginForm").addEventListener("submit", handleLogin);
  $("uploadForm").addEventListener("submit", handlePublish);
  $("logoutBtn").addEventListener("click", logout);
}

init();
