import { login, logout, getSessionUser, onAuthChange } from "./js/auth.js";
import { showMessage, setLoading, showView } from "./js/ui.js";

const $ = (id) => document.getElementById(id);

async function init() {
  const user = await getSessionUser();
  render(user);
  onAuthChange(render);

  $("loginForm").addEventListener("submit", async (e) => {
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
  });

  $("logoutBtn").addEventListener("click", logout);
}

function render(user) {
  showView(!!user);
  if (user) $("who").textContent = user.email;
}

init();
