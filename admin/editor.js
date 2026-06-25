/* Rich, Squarespace-style editor: drag/drop photos that text wraps around,
   click to resize / reposition / float, inline formatting toolbar. */
window.Editor = (function () {
  let body, toolbar, controls;
  let selectedFig = null;
  let lastRange = null;
  let onImageNeeded = null; // async (File) -> {sitePath, previewUrl}

  function init(opts) {
    body = document.getElementById("ed-body");
    toolbar = document.getElementById("ed-toolbar");
    controls = document.getElementById("img-controls");
    onImageNeeded = opts.uploadImage;

    // Track caret so we can insert images where the user was typing
    document.addEventListener("selectionchange", () => {
      const sel = window.getSelection();
      if (sel.rangeCount && body.contains(sel.anchorNode)) lastRange = sel.getRangeAt(0).cloneRange();
    });

    // Inline formatting toolbar on text selection
    body.addEventListener("mouseup", positionToolbar);
    body.addEventListener("keyup", positionToolbar);
    toolbar.addEventListener("mousedown", (e) => e.preventDefault());
    toolbar.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        const cmd = b.dataset.cmd, val = b.dataset.val;
        if (cmd === "createLink") {
          const url = prompt("Link URL:");
          if (url) document.execCommand("createLink", false, url);
        } else if (cmd === "formatBlock") {
          // toggle off if already that block
          document.execCommand("formatBlock", false, val);
        } else {
          document.execCommand(cmd, false, null);
        }
        positionToolbar();
      });
    });

    // Click to select a figure
    body.addEventListener("click", (e) => {
      const fig = e.target.closest("figure");
      if (fig && body.contains(fig)) selectFigure(fig);
      else if (!e.target.closest(".resize-handle")) deselect();
    });

    // Image control popover actions
    controls.querySelectorAll("button").forEach((b) => {
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", () => figureAction(b.dataset.act));
    });

    // Drag & drop image files
    ["dragenter", "dragover"].forEach((ev) =>
      body.addEventListener(ev, (e) => {
        if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
          e.preventDefault(); body.classList.add("dropping");
        }
      })
    );
    body.addEventListener("dragleave", () => body.classList.remove("dropping"));
    body.addEventListener("drop", onDrop);

    // Resize via handle (event delegation)
    body.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("resize-handle")) startResize(e);
    });

    document.addEventListener("click", (e) => {
      if (!body.contains(e.target) && !controls.contains(e.target)) deselect();
    });
    window.addEventListener("scroll", () => { if (selectedFig) positionControls(selectedFig); }, true);
  }

  /* ---------- formatting toolbar ---------- */
  function positionToolbar() {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !body.contains(sel.anchorNode)) { toolbar.hidden = true; return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) { toolbar.hidden = true; return; }
    toolbar.hidden = false;
    const tb = toolbar.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tb.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tb.width - 8));
    toolbar.style.left = left + "px";
    toolbar.style.top = Math.max(8, rect.top - tb.height - 8) + "px";
  }

  /* ---------- figures ---------- */
  function makeFigure(sitePath, previewUrl, caption) {
    const fig = document.createElement("figure");
    fig.className = "img-center";
    fig.contentEditable = "false";
    fig.setAttribute("draggable", "true");
    const img = document.createElement("img");
    img.src = previewUrl; img.setAttribute("data-path", sitePath); img.alt = caption || "";
    fig.appendChild(img);
    if (caption) {
      const cap = document.createElement("figcaption");
      cap.contentEditable = "true"; cap.textContent = caption;
      fig.appendChild(cap);
    }
    const h = document.createElement("span");
    h.className = "resize-handle"; h.contentEditable = "false";
    fig.appendChild(h);
    fig.addEventListener("dragstart", figDragStart);
    return fig;
  }

  function insertFigure(fig) {
    const sel = window.getSelection();
    let range = lastRange;
    if (!range || !body.contains(range.startContainer)) {
      range = document.createRange(); range.selectNodeContents(body); range.collapse(false);
    }
    // Insert on its own line
    range.collapse(false);
    range.insertNode(fig);
    // ensure there is an editable paragraph after the figure
    if (!fig.nextSibling || fig.nextSibling.nodeName !== "P") {
      const p = document.createElement("p"); p.innerHTML = "<br>";
      fig.after(p);
    }
    sel.removeAllRanges();
    selectFigure(fig);
  }

  function selectFigure(fig) {
    deselect();
    selectedFig = fig;
    fig.classList.add("selected");
    positionControls(fig);
    controls.hidden = false;
  }
  function deselect() {
    if (selectedFig) selectedFig.classList.remove("selected");
    selectedFig = null;
    controls.hidden = true;
  }
  function positionControls(fig) {
    const r = fig.getBoundingClientRect();
    const cw = controls.offsetWidth || 320;
    let left = r.left + r.width / 2 - cw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - cw - 8));
    controls.style.left = left + "px";
    controls.style.top = Math.max(8, r.top - 48) + "px";
  }

  function figureAction(act) {
    if (!selectedFig) return;
    const fig = selectedFig;
    const floats = { left: "img-float-left", right: "img-float-right", center: "img-center", full: "img-full" };
    if (floats[act]) {
      fig.classList.remove("img-float-left", "img-float-right", "img-center", "img-full");
      fig.classList.add(floats[act]);
      fig.style.width = ""; // let CSS class set default width
    } else if (act === "smaller" || act === "bigger") {
      const cur = parseFloat(fig.style.width) || defaultWidth(fig);
      let next = cur + (act === "bigger" ? 8 : -8);
      next = Math.max(20, Math.min(100, next));
      fig.style.width = next + "%";
    } else if (act === "caption") {
      let cap = fig.querySelector("figcaption");
      if (!cap) {
        cap = document.createElement("figcaption");
        cap.contentEditable = "true";
        fig.querySelector("img").after(cap);
        cap.focus();
      } else { cap.remove(); }
    } else if (act === "delete") {
      fig.remove(); deselect(); return;
    }
    positionControls(fig);
  }
  function defaultWidth(fig) {
    if (fig.classList.contains("img-full")) return 100;
    if (fig.classList.contains("img-center")) return 70;
    return 46;
  }

  /* ---------- resize drag ---------- */
  function startResize(e) {
    e.preventDefault();
    const fig = e.target.closest("figure");
    const startX = e.clientX;
    const parentW = body.clientWidth;
    const startW = fig.getBoundingClientRect().width;
    const floatRight = fig.classList.contains("img-float-right");
    function move(ev) {
      const dx = ev.clientX - startX;
      let w = startW + (floatRight ? -dx : dx);
      let pct = Math.max(20, Math.min(100, (w / parentW) * 100));
      fig.style.width = pct.toFixed(1) + "%";
      positionControls(fig);
    }
    function up() {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    }
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  /* ---------- drag to reposition ---------- */
  let draggingFig = null;
  function figDragStart(e) {
    draggingFig = e.currentTarget;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "figure");
  }
  function caretRangeFromPoint(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) { const r = document.createRange(); r.setStart(p.offsetNode, p.offset); return r; }
    }
    return null;
  }

  async function onDrop(e) {
    e.preventDefault();
    body.classList.remove("dropping");
    const range = caretRangeFromPoint(e.clientX, e.clientY);

    // Repositioning an existing figure
    if (draggingFig && (!e.dataTransfer.files || !e.dataTransfer.files.length)) {
      if (range) { range.collapse(true); range.insertNode(draggingFig); }
      selectFigure(draggingFig); draggingFig = null; return;
    }
    draggingFig = null;

    // New image files
    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    if (range) lastRange = range;
    for (const file of files) {
      await insertImageFile(file);
    }
  }

  async function insertImageFile(file) {
    // optimistic local preview while uploading
    const localUrl = URL.createObjectURL(file);
    const fig = makeFigure("", localUrl, "");
    fig.dataset.uploading = "1";
    insertFigure(fig);
    try {
      const { sitePath, previewUrl } = await onImageNeeded(file);
      const img = fig.querySelector("img");
      img.setAttribute("data-path", sitePath);
      img.src = previewUrl;
      delete fig.dataset.uploading;
      URL.revokeObjectURL(localUrl);
    } catch (err) {
      fig.remove();
      throw err;
    }
  }

  /* ---------- public: insert from picker ---------- */
  async function addImages(fileList) {
    for (const file of Array.from(fileList)) {
      if (file.type.startsWith("image/")) await insertImageFile(file);
    }
  }

  /* ---------- serialize / load ---------- */
  function getHtml() {
    const clone = body.cloneNode(true);
    clone.querySelectorAll(".resize-handle").forEach((h) => h.remove());
    clone.querySelectorAll("figure").forEach((fig) => {
      fig.removeAttribute("draggable");
      fig.removeAttribute("contenteditable");
      fig.classList.remove("selected");
      delete fig.dataset.uploading;
      const img = fig.querySelector("img");
      if (img) {
        const p = img.getAttribute("data-path");
        if (p) { img.setAttribute("src", p); img.removeAttribute("data-path"); }
        img.removeAttribute("style");
      }
      const cap = fig.querySelector("figcaption");
      if (cap) { cap.removeAttribute("contenteditable"); if (!cap.textContent.trim()) cap.remove(); }
    });
    // strip empty trailing paragraphs
    return clone.innerHTML.replace(/(<p><br><\/p>\s*)+$/i, "").trim();
  }

  function setHtml(html) {
    body.innerHTML = html || "";
    const { owner, repo, branch } = GH.repoInfo();
    body.querySelectorAll("figure").forEach((fig) => {
      fig.contentEditable = "false";
      fig.setAttribute("draggable", "true");
      fig.addEventListener("dragstart", figDragStart);
      const img = fig.querySelector("img");
      if (img) {
        const src = img.getAttribute("src") || "";
        img.setAttribute("data-path", src);
        if (src.startsWith("/")) img.src = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}${src}`;
      }
      const cap = fig.querySelector("figcaption");
      if (cap) cap.contentEditable = "true";
      const h = document.createElement("span");
      h.className = "resize-handle"; h.contentEditable = "false";
      fig.appendChild(h);
    });
  }

  function clear() { body.innerHTML = ""; deselect(); }
  function getText() { return body.textContent || ""; }

  return { init, addImages, getHtml, setHtml, clear, getText };
})();
