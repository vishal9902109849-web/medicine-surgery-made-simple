const SUPABASE_URL = "https://xsduelyqbytddbfyfkiq.supabase.co";
const BUCKET = "medical-resources";

const TYPES = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

const INJECT = '<script src="/js/annotate-map.js"></script>';

module.exports = async (req, res) => {
  const raw = req.query.path || "";
  let path = Array.isArray(raw) ? raw.join("/") : raw;
  try {
    path = decodeURIComponent(path);
  } catch (_) {}

  const ext = path.split(".").pop().toLowerCase();
  if (!path || path.includes("..") || path.startsWith("/") || !TYPES[ext]) {
    res.status(400).send("Bad request");
    return;
  }

  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encoded}`;

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      res.status(upstream.status === 404 ? 404 : 502).send("File not found");
      return;
    }
    let body = Buffer.from(await upstream.arrayBuffer());

    if (ext === "html" || ext === "htm") {
      let html = body.toString("utf8");
      const i = html.lastIndexOf("</body>");
      html = i >= 0 ? html.slice(0, i) + INJECT + html.slice(i) : html + INJECT;
      body = Buffer.from(html, "utf8");
    }

    res.setHeader("Content-Type", TYPES[ext]);
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
    res.status(200).send(body);
  } catch (err) {
    res.status(502).send("Could not load file");
  }
};
