(function () {
  if (window.__gate) return;
  window.__gate = true;
  var URL = "https://xsduelyqbytddbfyfkiq.supabase.co";
  var KEY = "sb_publishable_EBwOOi98q-gISwA49unvsQ_eirApWLZ";

  function log(v) {
    try {
      if (sessionStorage.getItem("visitLogged:" + location.pathname)) return;
      sessionStorage.setItem("visitLogged:" + location.pathname, "1");
    } catch (e) {}
    fetch(URL + "/rest/v1/visitors", {
      method: "POST",
      headers: {
        apikey: KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({ name: v.name, college: v.college, page: location.pathname })
    }).catch(function () {});
  }

  var saved = null;
  try { saved = JSON.parse(localStorage.getItem("visitor")); } catch (e) {}
  if (saved && saved.name && saved.college) { log(saved); return; }

  var box = document.createElement("div");
  box.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:#102d50;display:flex;" +
    "align-items:center;justify-content:center;padding:20px;font-family:system-ui,sans-serif";
  box.innerHTML =
    '<form style="background:#fff;border-radius:14px;padding:24px;width:100%;max-width:380px;color:#24364c">' +
    '<h2 style="margin:0 0 6px;color:#102d50;font-size:22px">Welcome</h2>' +
    '<p style="margin:0 0 16px;font-size:13px;color:#77869a">Please tell us who you are before you start. ' +
    'Your name and college are saved so the site owner knows who uses these notes.</p>' +
    '<input id="vgName" maxlength="100" placeholder="Your name" style="width:100%;padding:12px;margin-bottom:10px;border:1px solid #ccd6e0;border-radius:8px;font-size:16px;box-sizing:border-box">' +
    '<input id="vgCollege" maxlength="120" placeholder="Your college" style="width:100%;padding:12px;margin-bottom:14px;border:1px solid #ccd6e0;border-radius:8px;font-size:16px;box-sizing:border-box">' +
    '<button type="submit" style="width:100%;padding:13px;border:0;border-radius:8px;background:#17669d;color:#fff;font-size:16px;font-weight:bold">Continue</button>' +
    '</form>';
  document.body.appendChild(box);

  box.querySelector("form").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = document.getElementById("vgName").value.trim();
    var college = document.getElementById("vgCollege").value.trim();
    if (!name || !college) return;
    var v = { name: name, college: college };
    try { localStorage.setItem("visitor", JSON.stringify(v)); } catch (err) {}
    log(v);
    box.remove();
  });
})();
