/* Minimal GitHub Contents API client used by the studio.
   Auth = a fine-grained token with Contents:read/write on the blog repo. */
window.GH = (function () {
  const API = "https://api.github.com";
  let token = null;
  let owner = null, repo = null, branch = "main";
  let user = null;

  function headers(extra) {
    return Object.assign({
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    }, extra || {});
  }

  // UTF-8 string -> base64
  function b64encode(str) {
    return btoa(String.fromCharCode(...new TextEncoder().encode(str)));
  }
  function bytesToB64(bytes) {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  function b64decodeUtf8(b64) {
    const bin = atob(b64.replace(/\n/g, ""));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async function loadConfig() {
    // site config lives one level up from /admin/
    const res = await fetch("../content/site.json", { cache: "no-store" });
    const cfg = await res.json();
    const [o, r] = (cfg.repo || "").split("/");
    owner = o; repo = r; branch = cfg.branch || "main";
    return cfg;
  }

  async function init(tok) {
    token = tok;
    if (!owner) await loadConfig();
    const res = await fetch(API + "/user", { headers: headers() });
    if (res.status === 401) throw new Error("That token was rejected. Check it has not expired.");
    if (!res.ok) throw new Error("GitHub error " + res.status);
    user = await res.json();
    // verify repo access
    const r2 = await fetch(`${API}/repos/${owner}/${repo}`, { headers: headers() });
    if (!r2.ok) throw new Error(`This token cannot access ${owner}/${repo}. Grant it Contents access to that repo.`);
    return user;
  }

  function getUser() { return user; }
  function repoInfo() { return { owner, repo, branch }; }

  async function getFile(path) {
    const res = await fetch(`${API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, { headers: headers() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("GitHub error " + res.status + " reading " + path);
    return res.json();
  }

  async function putFile(path, contentB64, message, sha) {
    const body = { message, content: contentB64, branch };
    if (sha) body.sha = sha;
    const res = await fetch(`${API}/repos/${owner}/${repo}/contents/${path}`, {
      method: "PUT", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = "GitHub error " + res.status;
      try { msg = (await res.json()).message || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  }

  async function listPosts() {
    const dir = await getFile("content/posts");
    if (!dir) return [];
    const files = (Array.isArray(dir) ? dir : []).filter((f) => f.name.endsWith(".json"));
    const out = [];
    for (const f of files) {
      try {
        const meta = await getFile(f.path);
        const data = JSON.parse(b64decodeUtf8(meta.content));
        data._sha = meta.sha; data._file = f.path;
        out.push(data);
      } catch (e) { /* skip bad file */ }
    }
    out.sort((a, b) => (a.date < b.date ? 1 : -1));
    return out;
  }

  async function savePost(post) {
    const path = `content/posts/${post.slug}.json`;
    const existing = await getFile(path);
    const sha = existing ? existing.sha : undefined;
    const clean = Object.assign({}, post);
    delete clean._sha; delete clean._file;
    const json = JSON.stringify(clean, null, 2) + "\n";
    const verb = post.published === false ? "Save draft" : "Publish";
    return putFile(path, b64encode(json), `${verb}: ${post.title || post.slug}`, sha);
  }

  async function uploadImage(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const base = (file.name.replace(/\.[^.]+$/, "") || "image").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "image";
    const name = `${Date.now()}-${base}.${ext}`;
    const path = `assets/uploads/${name}`;
    await putFile(path, bytesToB64(buf), `Upload image ${name}`);
    const { owner, repo, branch } = repoInfo();
    return {
      sitePath: `/assets/uploads/${name}`,
      previewUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/assets/uploads/${name}`,
    };
  }

  return { init, getUser, repoInfo, listPosts, savePost, uploadImage, loadConfig, _b64decodeUtf8: b64decodeUtf8 };
})();
