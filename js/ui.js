const $ = (id) => document.getElementById(id);

export function showMessage(el, text, type = "error") {
  el.textContent = text;
  el.className = `msg ${type}`;
  el.hidden = !text;
}

export function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.innerHTML = loading
    ? '<span class="spinner"></span> Please wait…'
    : label;
}

export function showView(loggedIn) {
  $("loginView").hidden = loggedIn;
  $("dashView").hidden = !loggedIn;
}
