/* Studio controller: auth, navigation, dashboard, post manager, publishing. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const TOKEN_KEY = "aperture_token";
  const GC_KEY = "aperture_gc";

  let posts = [];
  let editing = null; // current post being edited (or null for new)
  let coverPath = null;

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg, kind) {
    const t = $("#toast");
    t.textContent = msg; t.className = "toast " + (kind || "");
    t.hidden = false; requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove("show"); setTimeout(() => (t.hidden = true), 300); }, kind === "err" ? 5000 : 2600);
  }

  /* ===================== AUTH ===================== */
  async function tryLogin(token, remember) {
    await GH.init(token);
    if (remember) localStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.setItem(TOKEN_KEY, token);
    showApp();
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    location.reload();
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#login-error"); err.hidden = true;
    const btn = $("#login-form button"); const label = $(".btn-label", btn);
    const old = label.textContent; label.textContent = "Signing in…"; btn.disabled = true;
    try {
      await tryLogin($("#token").value.trim(), $("#remember").checked);
    } catch (e2) {
      err.textContent = e2.message || "Sign in failed."; err.hidden = false;
    } finally {
      label.textContent = old; btn.disabled = false;
    }
  });
  $("#signout").addEventListener("click", signOut);

  async function showApp() {
    $("#view-login").hidden = true;
    $("#app").hidden = false;
    const u = GH.getUser();
    if (u) {
      $("#who-name").textContent = "@" + u.login;
      if (u.avatar_url) $("#who-avatar").style.backgroundImage = `url(${u.avatar_url})`;
    }
    Editor.init({ uploadImage: (file) => GH.uploadImage(file) });
    setupEditorUI();
    nav("dashboard");
    await loadPosts();
    renderDashboard();
  }

  /* ===================== NAV ===================== */
  function nav(view) {
    $$(".side-nav button").forEach((b) => b.classList.toggle("active", b.dataset.nav === view));
    $$(".view").forEach((v) => (v.hidden = v.dataset.view !== view));
    if (view === "editor" && !editing && !$("#ed-title").value) newPost();
    if (view === "posts") renderPosts();
  }
  $$("[data-nav]").forEach((b) => b.addEventListener("click", () => nav(b.dataset.nav)));

  /* ===================== POSTS ===================== */
  async function loadPosts() {
    try { posts = await GH.listPosts(); }
    catch (e) { toast(e.message, "err"); posts = []; }
  }

  function renderPosts() {
    const list = $("#posts-list");
    if (!posts.length) { list.innerHTML = `<p class="muted">No posts yet. Click <b>New post</b> to write your first story.</p>`; return; }
    const { owner, repo, branch } = GH.repoInfo();
    list.innerHTML = posts.map((p) => {
      const cover = p.cover ? (p.cover.startsWith("http") ? p.cover : `https://raw.githubusercontent.com/${owner}/${repo}/${branch}${p.cover}`) : "../assets/uploads/placeholder.svg";
      const live = p.published !== false;
      return `<div class="post-row" data-slug="${esc(p.slug)}">
        <img class="thumb" src="${esc(cover)}" alt="" onerror="this.src='../assets/uploads/placeholder.svg'">
        <div class="info">
          <h3>${esc(p.title || "(untitled)")}</h3>
          <div class="sub">${fmtDate(p.date)} · ${(p.tags || []).join(", ") || "no tags"}</div>
        </div>
        <span class="badge ${live ? "live" : "draft"}">${live ? "Published" : "Draft"}</span>
        <button class="btn ghost small edit">Edit</button>
        <a class="btn ghost small" href="../posts/${esc(p.slug)}/" target="_blank">View</a>
      </div>`;
    }).join("");
    $$(".post-row .edit", list).forEach((b) =>
      b.addEventListener("click", () => openPost(b.closest(".post-row").dataset.slug)));
  }

  /* ===================== EDITOR ===================== */
  function setupEditorUI() {
    // cover
    const coverInput = $("#ed-cover-input");
    $("#ed-cover-btn").addEventListener("click", () => coverInput.click());
    coverInput.addEventListener("change", () => coverInput.files[0] && setCover(coverInput.files[0]));
    const cover = $("#ed-cover");
    ["dragenter", "dragover"].forEach((ev) => cover.addEventListener(ev, (e) => { e.preventDefault(); cover.classList.add("dragover"); }));
    cover.addEventListener("dragleave", () => cover.classList.remove("dragover"));
    cover.addEventListener("drop", (e) => {
      e.preventDefault(); cover.classList.remove("dragover");
      const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/"));
      if (f) setCover(f);
    });

    // insert image
    const imgInput = $("#ed-img-input");
    $("#ed-add-img").addEventListener("click", () => imgInput.click());
    imgInput.addEventListener("change", async () => {
      try { await Editor.addImages(imgInput.files); imgInput.value = ""; }
      catch (e) { toast(e.message, "err"); }
    });

    // slug preview + auto slug
    const title = $("#ed-title"), slug = $("#ed-slug");
    title.addEventListener("input", () => { if (!slug.dataset.touched) { slug.value = slugify(title.value); updateUrlPreview(); } });
    slug.addEventListener("input", () => { slug.dataset.touched = "1"; slug.value = slugify(slug.value); updateUrlPreview(); });

    $("#ed-back").addEventListener("click", () => nav("posts"));
    $("#ed-savedraft").addEventListener("click", () => save(false));
    $("#ed-publish").addEventListener("click", () => save(true));
  }

  function updateUrlPreview() {
    GH.loadConfig().then((cfg) => {
      $("#ed-url-preview").textContent = (cfg.url || "") + "/posts/" + ($("#ed-slug").value || "your-post") + "/";
    });
  }

  async function setCover(file) {
    const cover = $("#ed-cover");
    const localUrl = URL.createObjectURL(file);
    renderCover(localUrl, true);
    try {
      const { sitePath, previewUrl } = await GH.uploadImage(file);
      coverPath = sitePath;
      renderCover(previewUrl, false);
    } catch (e) { toast(e.message, "err"); }
  }
  function renderCover(url, uploading) {
    const cover = $("#ed-cover");
    cover.classList.add("has-img");
    cover.innerHTML = `<img src="${url}" alt="cover">
      ${uploading ? '<button class="cover-remove" disabled>Uploading…</button>' : '<button class="cover-remove" id="cover-rm">Remove</button>'}`;
    const rm = $("#cover-rm");
    if (rm) rm.addEventListener("click", clearCover);
  }
  function clearCover() {
    coverPath = null;
    const cover = $("#ed-cover");
    cover.classList.remove("has-img");
    cover.innerHTML = `<button type="button" class="cover-add" id="ed-cover-btn">
      <svg viewBox="0 0 24 24"><path d="M4 16l5-5 4 4 3-3 4 4M4 5h16v14H4z"/></svg> Add a cover photo</button>`;
    $("#ed-cover-btn").addEventListener("click", () => $("#ed-cover-input").click());
  }

  function newPost() {
    editing = null; coverPath = null;
    $("#ed-title").value = ""; $("#ed-subtitle").value = ""; $("#ed-excerpt").value = "";
    $("#ed-tags").value = ""; $("#ed-slug").value = ""; $("#ed-slug").dataset.touched = "";
    $("#ed-date").value = new Date().toISOString().slice(0, 10);
    $("#ed-status").textContent = "Draft";
    clearCover();
    Editor.clear();
    updateUrlPreview();
  }

  function openPost(slug) {
    const p = posts.find((x) => x.slug === slug);
    if (!p) return;
    editing = p; coverPath = p.cover || null;
    $("#ed-title").value = p.title || "";
    $("#ed-subtitle").value = p.subtitle || "";
    $("#ed-excerpt").value = p.excerpt || "";
    $("#ed-tags").value = (p.tags || []).join(", ");
    $("#ed-slug").value = p.slug; $("#ed-slug").dataset.touched = "1";
    $("#ed-date").value = p.date || new Date().toISOString().slice(0, 10);
    $("#ed-status").textContent = p.published === false ? "Draft" : "Published";
    if (p.cover) {
      const { owner, repo, branch } = GH.repoInfo();
      renderCover(p.cover.startsWith("http") ? p.cover : `https://raw.githubusercontent.com/${owner}/${repo}/${branch}${p.cover}`, false);
    } else clearCover();
    Editor.setHtml(p.content || "");
    updateUrlPreview();
    nav("editor");
  }

  async function save(publish) {
    const title = $("#ed-title").value.trim();
    if (!title) { toast("Give your post a title first.", "err"); $("#ed-title").focus(); return; }
    let slug = slugify($("#ed-slug").value || title);
    if (!slug) slug = "post-" + Date.now();
    const content = Editor.getHtml();
    const text = Editor.getText().trim();
    const excerpt = $("#ed-excerpt").value.trim() || text.slice(0, 160) + (text.length > 160 ? "…" : "");
    const tags = $("#ed-tags").value.split(",").map((t) => t.trim()).filter(Boolean);

    const post = {
      slug, title,
      subtitle: $("#ed-subtitle").value.trim(),
      date: $("#ed-date").value || new Date().toISOString().slice(0, 10),
      tags, cover: coverPath || "",
      excerpt, published: !!publish, content,
    };

    const btn = publish ? $("#ed-publish") : $("#ed-savedraft");
    const old = btn.textContent; btn.disabled = true; btn.textContent = publish ? "Publishing…" : "Saving…";
    try {
      await GH.savePost(post);
      toast(publish ? "Published! Your site will rebuild in ~1 min." : "Draft saved.", "ok");
      $("#ed-status").textContent = publish ? "Published" : "Draft";
      editing = post;
      await loadPosts();
      renderDashboard();
    } catch (e) {
      toast(e.message, "err");
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
  }

  /* ===================== DASHBOARD ===================== */
  function renderDashboard() {
    const published = posts.filter((p) => p.published !== false);
    $("#s-posts").textContent = published.length;
    const tagSet = new Set(); posts.forEach((p) => (p.tags || []).forEach((t) => tagSet.add(t)));
    $("#s-tags").textContent = tagSet.size;

    // top posts (by date until analytics provide views)
    const top = $("#top-posts");
    top.innerHTML = published.slice(0, 5).map((p) =>
      `<div class="row"><span>${esc(p.title)}</span><b class="muted">${fmtDate(p.date)}</b></div>`).join("")
      || `<p class="muted">Publish a post to see it here.</p>`;

    renderAnalytics();
  }

  function getGC() { try { return JSON.parse(localStorage.getItem(GC_KEY)) || {}; } catch { return {}; } }
  function renderAnalytics() {
    const gc = getGC();
    const status = $("#ga-status"), chart = $("#ga-chart"), setup = $("#ga-setup");
    if (!gc.code) {
      status.textContent = "not connected";
      setup.hidden = false;
      drawChart(sampleSeries(), true);
      $("#s-views").textContent = "—"; $("#s-visitors").textContent = "—";
    } else {
      status.innerHTML = `tracking <a href="https://${gc.code}.goatcounter.com" target="_blank">${gc.code}.goatcounter.com ↗</a>`;
      setup.hidden = true;
      loadGCStats(gc);
    }
    $("#gc-save").onclick = () => {
      const code = $("#gc-code").value.trim().replace(/^https?:\/\//, "").replace(/\.goatcounter.*/, "");
      if (!code) { toast("Enter your GoatCounter code.", "err"); return; }
      localStorage.setItem(GC_KEY, JSON.stringify({ code, token: $("#gc-token").value.trim() }));
      toast("Analytics connected.", "ok");
      renderAnalytics();
    };
  }

  async function loadGCStats(gc) {
    const chart = $("#ga-chart");
    // Best-effort: GoatCounter API needs a token and may block cross-origin.
    if (!gc.token) {
      drawChart(sampleSeries(), true);
      $("#ga-status").innerHTML += " · add an API token for charts";
      return;
    }
    try {
      const end = new Date(), start = new Date(Date.now() - 29 * 864e5);
      const fmt = (d) => d.toISOString().slice(0, 10);
      const res = await fetch(`https://${gc.code}.goatcounter.com/api/v0/stats/total?start=${fmt(start)}&end=${fmt(end)}`, {
        headers: { Authorization: "Bearer " + gc.token },
      });
      if (!res.ok) throw new Error("api " + res.status);
      const data = await res.json();
      $("#s-views").textContent = (data.total ?? "—").toLocaleString();
      $("#s-visitors").textContent = (data.total_unique ?? data.total ?? "—").toLocaleString();
      drawChart(sampleSeries(), false); // total endpoint has no per-day series; keep shape
    } catch (e) {
      $("#ga-status").innerHTML = `couldn't reach the API from the browser — <a href="https://${gc.code}.goatcounter.com" target="_blank">open your dashboard ↗</a>`;
      drawChart(sampleSeries(), true);
    }
  }

  function sampleSeries() {
    return Array.from({ length: 30 }, (_, i) => 6 + Math.round(Math.abs(Math.sin(i / 3) * 18) + (i % 4)));
  }
  function drawChart(series, isSample) {
    const chart = $("#ga-chart");
    const max = Math.max(...series, 1);
    chart.innerHTML = series.map((v) => `<span class="bar" style="height:${(v / max) * 100}%" title="${v}"></span>`).join("");
    if (isSample) chart.style.opacity = ".4"; else chart.style.opacity = "1";
  }

  /* ===================== utils ===================== */
  function esc(s = "") { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function slugify(s = "") { return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function fmtDate(iso) { try { return new Date(iso + "T00:00:00").toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" }); } catch { return iso || ""; } }

  /* ===================== boot ===================== */
  (async function boot() {
    const stored = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
    if (stored) {
      try { await GH.init(stored); showApp(); return; }
      catch { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); }
    }
    $("#view-login").hidden = false;
  })();
})();
