# Aperture Diary 📷

A free, self-hosted photography blog with a Squarespace-style writing experience —
built entirely on **GitHub Pages + the GitHub API**, with **no paid services and no server to run**.

- ✨ Clean, bright, fluid light theme with smooth animations and vector art
- 📝 A private **author studio** (`/admin/`) with a drag-and-drop visual editor:
  drop photos straight onto the page and text wraps around them, resize / float /
  reposition images, inline formatting — no Markdown required
- 🔒 Secure single-author login using a GitHub access token (only someone with write
  access to *your* repo can publish)
- 📊 A **dashboard** with traffic analytics (via free GoatCounter)
- 🔎 SEO-ready: static pages, Open Graph + Twitter cards, JSON-LD, `sitemap.xml`,
  RSS, and `robots.txt` so Google can index and page through your posts
- 💸 100% free to run

---

## How it works

```
content/posts/*.json   ← your posts (created by the studio editor)
content/site.json      ← site title, URL, analytics, etc.
assets/uploads/*       ← your photos (uploaded by the editor)
scripts/build.mjs      ← turns content into a static site in dist/
admin/                 ← the private author studio (login, editor, dashboard)
.github/workflows/     ← rebuilds & deploys to GitHub Pages on every push to main
```

When you publish a post, the studio commits a JSON file (and your images) to the repo
through the GitHub API. That push triggers the GitHub Action, which rebuilds the static
site and deploys it to GitHub Pages — usually live in about a minute.

---

## One-time setup

### 1. Push this repo to GitHub
The repo is expected at **`githintz/MyBlog`** (configured in `content/site.json`).
If you use a different name, update `repo`, `url`, and `basePath` in that file.

### 2. Turn on GitHub Pages
Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
After the first push to `main`, your site goes live at:

```
https://githintz.github.io/MyBlog/
```

> Using a custom domain or a `username.github.io` repo? Set `url` to your domain and
> `basePath` to `""` in `content/site.json`.

### 3. Create your author token (your “password”)
1. Go to **GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token**
2. **Repository access → Only select repositories →** choose your blog repo
3. **Permissions → Repository → Contents → Read and write**
4. Generate and copy the token.

Open **`https://githintz.github.io/MyBlog/admin/`**, paste the token, and you’re in.
The token is stored only in your browser. To “log out” everywhere, delete the token on GitHub.

### 4. (Optional) Turn on traffic analytics
1. Create a free account at <https://www.goatcounter.com/> and note your **code**
   (the `xxx` in `xxx.goatcounter.com`).
2. Put it in `content/site.json` → `analytics.goatcounterCode` so visits are counted.
3. In the studio **Dashboard → Connect**, enter the same code (and optionally an API
   token from GoatCounter for in-dashboard charts).

### 5. (Optional but recommended) Get found on Google faster
Add your site to [Google Search Console](https://search.google.com/search-console) and
submit `https://githintz.github.io/MyBlog/sitemap.xml`.

---

## Writing posts

Open `/admin/`, sign in, and click **New post**:

- **Cover photo** — click or drag an image into the banner.
- **Body** — just start typing. Select text for the formatting toolbar (bold, headings,
  quotes, lists, links).
- **Photos** — drag image files anywhere onto the page, or click **Insert photo**.
  Click a photo to **float it left/right**, **center**, make it **full width**,
  **resize** (drag the corner handle or use −/+), add a **caption**, or **delete** it.
  Drag a photo to a new spot in the text to move it — the words re-wrap automatically.
- **Sidebar** — set the URL slug, excerpt (used in previews & search results), tags, and date.
- **Save draft** keeps it private; **Publish** makes it live.

---

## Local development

```bash
npm run serve      # build + preview at http://localhost:4173
# assets are served from a base path; for a clean local preview use:
BASE_PATH="" npm run build && node scripts/serve.mjs
```

The site generator has **zero runtime dependencies** — it’s plain Node.

---

## Tech & cost

| Piece            | Tool                         | Cost |
|------------------|------------------------------|------|
| Hosting          | GitHub Pages                 | Free |
| Build/deploy     | GitHub Actions               | Free |
| Content storage  | This Git repo (JSON + images)| Free |
| Auth & publishing| GitHub API + fine-grained PAT| Free |
| Analytics        | GoatCounter                  | Free |
