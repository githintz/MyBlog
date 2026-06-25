#!/usr/bin/env node
/* ============================================================
   Aperture Diary static site generator (zero dependencies).
   Reads content/*.json -> writes static HTML to dist/.
   Produces SEO-friendly pages, sitemap, RSS and robots.txt.
   ============================================================ */
import { readFile, readdir, mkdir, writeFile, cp, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const site = JSON.parse(await readFile(path.join(ROOT, "content/site.json"), "utf8"));
// BASE_PATH="" can be passed for local preview so root-relative assets resolve.
if (process.env.BASE_PATH !== undefined) site.basePath = process.env.BASE_PATH;
const BASE = (site.basePath || "").replace(/\/$/, ""); // e.g. "/myblog"
const RAW_URL = (site.url || "").replace(/\/$/, "");
// Origin without the base path; u() re-adds the base, so combining them gives clean absolute URLs.
const SITE_URL = BASE && RAW_URL.endsWith(BASE) ? RAW_URL.slice(0, -BASE.length) : RAW_URL;

/* ---------- helpers ---------- */
const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const u = (p = "/") => (p.startsWith("http") ? p : BASE + (p.startsWith("/") ? p : "/" + p));
// Prefix root-relative src/href inside post content with the base path.
const withBase = (html = "") =>
  BASE ? html.replace(/(\b(?:src|href)=")\/(?!\/)/g, `$1${BASE}/`) : html;
const fmtDate = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString(site.language || "en", {
    year: "numeric", month: "long", day: "numeric",
  });
const readTime = (html) => {
  const words = String(html).replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
};
const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---------- load posts ---------- */
const postsDir = path.join(ROOT, "content/posts");
let posts = [];
if (existsSync(postsDir)) {
  const files = (await readdir(postsDir)).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const p = JSON.parse(await readFile(path.join(postsDir, f), "utf8"));
    if (p.published === false) continue;
    p.slug = p.slug || slugify(p.title || f.replace(/\.json$/, ""));
    p.tags = Array.isArray(p.tags) ? p.tags : [];
    p.readTime = readTime(p.content || "");
    posts.push(p);
  }
}
posts.sort((a, b) => (a.date < b.date ? 1 : -1));

/* ---------- shared chrome ---------- */
const logoSvg = `<svg class="logo" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#fff" stroke="#ff7a4d" stroke-width="2.5"/><circle cx="24" cy="24" r="11" fill="#fff0e9" stroke="#e85f33" stroke-width="2"/><circle cx="24" cy="24" r="4.5" fill="#ff7a4d"/><path d="M24 5 L29 13 H19 Z" fill="#ff7a4d"/><path d="M43 24 L35 29 V19 Z" fill="#ffb38f"/><path d="M24 43 L19 35 H29 Z" fill="#ffb38f"/><path d="M5 24 L13 19 V29 Z" fill="#ffb38f"/></svg>`;

const head = (opts) => {
  const {
    title, desc, canonical, image, type = "website", published, tags = [],
  } = opts;
  const fullTitle = title === site.title ? title : `${title} · ${site.title}`;
  const img = image ? (image.startsWith("http") ? image : SITE_URL + u(image)) : "";
  const ld =
    type === "article"
      ? {
          "@context": "https://schema.org", "@type": "BlogPosting",
          headline: title, description: desc, datePublished: published,
          image: img || undefined, keywords: tags.join(", ") || undefined,
          author: { "@type": "Person", name: site.author },
          publisher: { "@type": "Organization", name: site.title },
          mainEntityOfPage: canonical,
        }
      : {
          "@context": "https://schema.org", "@type": "Blog",
          name: site.title, description: site.description, url: SITE_URL + u("/"),
        };
  return `<!doctype html>
<html lang="${site.language || "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="author" content="${esc(site.author)}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:site_name" content="${esc(site.title)}">
<meta property="og:url" content="${esc(canonical)}">
${img ? `<meta property="og:image" content="${esc(img)}">` : ""}
<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${esc(fullTitle)}">
<meta name="twitter:description" content="${esc(desc)}">
${img ? `<meta name="twitter:image" content="${esc(img)}">` : ""}
<link rel="alternate" type="application/rss+xml" title="${esc(site.title)}" href="${u("/rss.xml")}">
<link rel="icon" href="${u("/assets/favicon.svg")}" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${u("/src/styles.css")}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
${site.analytics && site.analytics.goatcounterCode
    ? `<script data-goatcounter="https://${site.analytics.goatcounterCode}.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>`
    : ""}
</head>`;
};

const header = () => `<header class="site-header"><div class="wrap nav">
  <a class="brand" href="${u("/")}">${logoSvg}<span class="brand-text">
    <span class="brand-name">${esc(site.title)}</span>
    <span class="brand-tag">${esc(site.tagline)}</span>
  </span></a>
  <button class="nav-toggle" aria-label="Menu" aria-expanded="false">
    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
  </button>
  <nav class="nav-links">
    <a href="${u("/")}">Home</a>
    <a href="${u("/#latest")}">Writing</a>
    <a href="${u("/about/")}">About</a>
    <a class="nav-cta" href="${u("/admin/")}">Sign in</a>
  </nav>
</div></header>`;

const footer = () => {
  const social = site.social || {};
  const socialLinks = Object.entries(social)
    .filter(([, v]) => v)
    .map(([k, v]) => `<li><a href="${esc(v)}" rel="me">${esc(k[0].toUpperCase() + k.slice(1))}</a></li>`)
    .join("");
  return `<footer class="site-footer"><div class="wrap footer-inner">
    <div class="about">
      <h4>${esc(site.title)}</h4>
      <p>${esc(site.description)}</p>
    </div>
    <div class="footer-links">
      <ul>
        <li><a href="${u("/")}">Home</a></li>
        <li><a href="${u("/about/")}">About</a></li>
        <li><a href="${u("/rss.xml")}">RSS feed</a></li>
        <li><a href="${u("/admin/")}">Author sign in</a></li>
      </ul>
      ${socialLinks ? `<ul>${socialLinks}</ul>` : ""}
    </div>
  </div>
  <div class="wrap footer-bottom">
    <span>© ${new Date().getFullYear()} ${esc(site.author)}. All photos &amp; words my own.</span>
    <span>Made with care · hosted free on GitHub Pages</span>
  </div></footer>`;
};

const page = (opts, body) =>
  `${head(opts)}<body>${header()}<main>${body}</main>${footer()}<script src="${u("/src/main.js")}" defer></script></body></html>`;

/* ---------- components ---------- */
const card = (p) => `<article class="card reveal">
  <a class="card-media" href="${u(`/posts/${p.slug}/`)}">
    <img src="${u(p.cover || "/assets/uploads/placeholder.svg")}" alt="${esc(p.title)}" loading="lazy">
  </a>
  <div class="card-body">
    <div class="card-tags">${p.tags.slice(0, 3).map((t) => `<a class="tag" href="${u(`/tags/${slugify(t)}/`)}">${esc(t)}</a>`).join("")}</div>
    <h3><a href="${u(`/posts/${p.slug}/`)}">${esc(p.title)}</a></h3>
    <p class="excerpt">${esc(p.excerpt || "")}</p>
    <div class="meta"><time datetime="${p.date}">${fmtDate(p.date)}</time> · <span>${p.readTime} min read</span></div>
  </div>
</article>`;

/* ---------- home ---------- */
const heroBlob = `<svg class="hero-blob" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><path fill="#ffb38f" d="M48.4,-58.6C61.3,-48.2,69.2,-31.6,71.7,-14.5C74.2,2.6,71.3,20.2,62.5,34.1C53.7,48,39,58.2,22.6,64.2C6.2,70.2,-11.9,72,-28.6,66.4C-45.3,60.8,-60.6,47.8,-67.8,31.4C-75,15,-74.1,-4.8,-67.3,-21.7C-60.5,-38.6,-47.8,-52.6,-33,-62.3C-18.2,-72,-1.3,-77.4,13.9,-74.2C29.1,-71,46.4,-69,48.4,-58.6Z" transform="translate(100 100)"/></svg>`;

const homeBody = () => {
  const [feat, ...rest] = posts;
  const latest = posts.length ? posts : [];
  return `<section class="hero"><div class="wrap hero-inner">
      ${heroBlob}
      <span class="eyebrow"><span class="dot"></span> Photography journal</span>
      <h1>${esc(site.title)}</h1>
      <p>${esc(site.description)}</p>
      <div class="pill-row">
        <a class="btn" href="${u("/#latest")}">Read the latest <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
        <a class="btn ghost" href="${u("/about/")}">About me</a>
      </div>
    </div></section>
    <section class="section" id="latest"><div class="wrap">
      <div class="section-head"><div><h2>Latest writing</h2><p>Field notes, experiments, and lessons from behind the lens.</p></div></div>
      ${latest.length
        ? `<div class="post-grid">${latest.map(card).join("")}</div>`
        : `<div class="empty"><p>No posts yet — sign in to publish your first story.</p><a class="btn" href="${u("/admin/")}">Write a post</a></div>`}
    </div></section>`;
};

/* ---------- write helpers ---------- */
async function emit(relPath, html) {
  const full = path.join(DIST, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, html);
}

/* ---------- build ---------- */
await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

// Home
await emit("index.html", page(
  { title: site.title, desc: site.description, canonical: SITE_URL + u("/"), image: posts[0]?.cover, type: "website" },
  homeBody()
));

// Posts
for (let i = 0; i < posts.length; i++) {
  const p = posts[i];
  const prev = posts[i + 1]; // older
  const next = posts[i - 1]; // newer
  const body = `<article>
    <div class="wrap article-hero">
      <span class="kicker">${p.tags[0] ? esc(p.tags[0]) : "Journal"}</span>
      <h1>${esc(p.title)}</h1>
      ${p.subtitle ? `<p class="subtitle">${esc(p.subtitle)}</p>` : ""}
      <div class="meta"><time datetime="${p.date}">${fmtDate(p.date)}</time> · <span>${p.readTime} min read</span> · <span>${esc(site.author)}</span></div>
    </div>
    ${p.cover ? `<figure class="article-cover"><img src="${u(p.cover)}" alt="${esc(p.title)}"></figure>` : ""}
    <div class="article-body">${withBase(p.content || "")}</div>
    <div class="wrap"><div class="article-foot">
      <div class="card-tags">${p.tags.map((t) => `<a class="tag" href="${u(`/tags/${slugify(t)}/`)}">${esc(t)}</a>`).join("")}</div>
      <nav class="post-nav">
        ${prev ? `<a class="prev" href="${u(`/posts/${prev.slug}/`)}"><span class="dir">← Older</span><span class="ttl">${esc(prev.title)}</span></a>` : "<span></span>"}
        ${next ? `<a class="next" href="${u(`/posts/${next.slug}/`)}"><span class="dir">Newer →</span><span class="ttl">${esc(next.title)}</span></a>` : ""}
      </nav>
    </div></div>
  </article>`;
  await emit(`posts/${p.slug}/index.html`, page(
    { title: p.title, desc: p.excerpt || site.description, canonical: SITE_URL + u(`/posts/${p.slug}/`), image: p.cover, type: "article", published: p.date, tags: p.tags },
    body
  ));
}

// Tag pages
const tags = {};
for (const p of posts) for (const t of p.tags) (tags[slugify(t)] ||= { name: t, posts: [] }).posts.push(p);
for (const [slug, data] of Object.entries(tags)) {
  const body = `<section class="section"><div class="wrap">
    <div class="section-head"><div><h2>Tagged “${esc(data.name)}”</h2><p>${data.posts.length} post${data.posts.length === 1 ? "" : "s"}</p></div><a class="btn ghost" href="${u("/")}">← All posts</a></div>
    <div class="post-grid">${data.posts.map(card).join("")}</div>
  </div></section>`;
  await emit(`tags/${slug}/index.html`, page(
    { title: `#${data.name}`, desc: `Posts tagged ${data.name} on ${site.title}`, canonical: SITE_URL + u(`/tags/${slug}/`), type: "website" },
    body
  ));
}

// About page
const aboutBody = `<section class="section"><div class="wrap" style="max-width:720px">
  <span class="eyebrow" style="color:var(--accent-deep);font-weight:600;letter-spacing:.1em;text-transform:uppercase;font-size:.78rem">About</span>
  <h1 style="font-size:clamp(2rem,4.6vw,3rem);margin:.4em 0">Hi, I’m ${esc(site.author)}.</h1>
  <div class="article-body" style="margin-top:1em">
    <p>${esc(site.description)}</p>
    <p>I’m an amateur photographer documenting what I learn as I go — the good frames, the failed experiments, and everything in between. This little corner of the web is where I keep those notes so I (and maybe you) can look back on them.</p>
    <p>Want to say hello? Email me at <a href="mailto:${esc(site.email)}">${esc(site.email)}</a>.</p>
  </div>
</div></section>`;
await emit("about/index.html", page(
  { title: "About", desc: `About ${site.author} and ${site.title}`, canonical: SITE_URL + u("/about/"), type: "website" },
  aboutBody
));

// 404
await emit("404.html", page(
  { title: "Page not found", desc: "That page wandered off.", canonical: SITE_URL + u("/404.html"), type: "website" },
  `<section class="section"><div class="wrap empty"><h1 style="font-size:3rem">404</h1><p>That frame is out of focus — the page you wanted isn’t here.</p><a class="btn" href="${u("/")}">Back home</a></div></section>`
));

// Sitemap
const urls = [
  { loc: u("/"), pri: "1.0" },
  { loc: u("/about/"), pri: "0.5" },
  ...posts.map((p) => ({ loc: u(`/posts/${p.slug}/`), pri: "0.8", lastmod: p.date })),
  ...Object.keys(tags).map((s) => ({ loc: u(`/tags/${s}/`), pri: "0.4" })),
];
await emit("sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((x) => `  <url><loc>${SITE_URL}${x.loc}</loc>${x.lastmod ? `<lastmod>${x.lastmod}</lastmod>` : ""}<priority>${x.pri}</priority></url>`).join("\n") +
  `\n</urlset>\n`
);

// robots.txt
await emit("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}${u("/sitemap.xml")}\n`);

// RSS
const rssItems = posts.slice(0, 20).map((p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${SITE_URL}${u(`/posts/${p.slug}/`)}</link>
      <guid>${SITE_URL}${u(`/posts/${p.slug}/`)}</guid>
      <pubDate>${new Date(p.date + "T00:00:00").toUTCString()}</pubDate>
      <description>${esc(p.excerpt || "")}</description>
    </item>`).join("\n");
await emit("rss.xml", `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${esc(site.title)}</title>
  <link>${SITE_URL}${u("/")}</link>
  <description>${esc(site.description)}</description>
  <language>${site.language || "en"}</language>
${rssItems}
</channel></rss>
`);

// posts index for admin listing fallback
await emit("posts/index.json", JSON.stringify(
  posts.map((p) => ({ slug: p.slug, title: p.title, date: p.date, tags: p.tags, excerpt: p.excerpt, published: p.published !== false })),
  null, 2
));

// favicon
await emit("assets/favicon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#fff" stroke="#ff7a4d" stroke-width="3"/><circle cx="24" cy="24" r="10" fill="#fff0e9" stroke="#e85f33" stroke-width="2"/><circle cx="24" cy="24" r="4" fill="#ff7a4d"/></svg>`);
// placeholder cover
await emit("assets/uploads/placeholder.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#eef2f5"/><circle cx="600" cy="380" r="90" fill="#cfd8de"/><circle cx="600" cy="380" r="34" fill="#fff"/></svg>`);

/* ---------- copy static dirs ---------- */
for (const dir of ["assets", "src", "admin", "content"]) {
  const from = path.join(ROOT, dir);
  if (existsSync(from)) await cp(from, path.join(DIST, dir), { recursive: true });
}
// NoJekyll so GitHub Pages serves files/dirs starting with _ and src as-is
await writeFile(path.join(DIST, ".nojekyll"), "");

console.log(`✓ Built ${posts.length} post(s), ${Object.keys(tags).length} tag(s) → dist/`);
