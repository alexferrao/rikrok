// Rik Rok feed: TikTok-style vertical swipe.
// SINGLE shared <video> element: iOS unlocks it once on the Start tap and it
// stays unlocked, so every swipe plays with sound — and only one video is
// ever loaded (161 videos in the DOM made Safari refuse unmuted playback
// and crawl). Cells are lightweight cards; the player moves into the active one.
let items = [];
const feed = document.getElementById("feed");
const startEl = document.getElementById("start");

// Pool of 3 video elements: one plays in the active cell, the other two sit
// detached pre-buffering the next two reels. All three are unlocked by the
// Start tap, so whichever one rotates in can play with sound instantly.
const pool = Array.from({ length: 3 }, () => {
  const v = document.createElement("video");
  v.playsInline = true;
  v.loop = true;
  v.preload = "auto";
  return v;
});
let player = pool[0]; // the element currently in the active cell
let activeCell = null;
let started = false;

function srcFor(item) {
  return new URL(`/reels/${item.id}.mp4`, location.origin).href;
}

function elementFor(item) {
  return pool.find((v) => v.src === srcFor(item)) || pool.find((v) => v !== player) || pool[0];
}

function prebuffer() {
  const idx = items.findIndex((i) => i.id === activeCell?.dataset.id);
  if (idx < 0) return;
  const next = [items[idx + 1], items[idx + 2]].filter(Boolean);
  const spare = pool.filter((v) => v !== player);
  for (let k = 0; k < spare.length; k++) {
    const target = next[k];
    if (!target) {
      spare[k].removeAttribute("src");
      continue;
    }
    if (spare[k].src !== srcFor(target)) {
      spare[k].pause();
      spare[k].src = srcFor(target);
      spare[k].load();
    }
  }
}

async function load() {
  const res = await fetch("/api/feed");
  items = await res.json();
  document.getElementById("count").textContent = items.length
    ? `${items.filter((i) => !i.watched).length} new · ${items.length} reels`
    : "no reels yet";
  render();
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const detailAvailable = (i) =>
  (i.achieved?.length || i.open?.length || i.commits?.length || i.urls?.length) > 0;

function detailSheet(item) {
  if (!detailAvailable(item)) return "";
  const list = (title, arr, cls, mark) =>
    arr?.length
      ? `<div class="dsec"><div class="dtitle ${cls}">${title}</div>${arr
          .map((x) => `<div class="ditem"><span class="${cls}">${mark}</span> ${esc(x)}</div>`)
          .join("")}</div>`
      : "";
  const links = item.urls?.length
    ? `<div class="dsec"><div class="dtitle">Links</div>${item.urls
        .map((u) => `<a class="ditem dlink" href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\//, ""))}</a>`)
        .join("")}</div>`
    : "";
  return `<div class="sheet">
    ${list("Shipped", item.achieved, "ok", "✓")}
    ${list("Open", item.open, "warn", "○")}
    ${list("Commits", item.commits, "mono", "·")}
    ${links}
  </div>`;
}

function cellHtml(item) {
  return `
    <div class="poster" style="border-color:${esc(item.accentColor)}">
      <div class="pproj" style="color:${esc(item.accentColor)}">${esc(item.project)}</div>
      <div class="phead">${esc(item.headline)}</div>
    </div>
    ${item.watched ? "" : '<div class="newpill">NEW</div>'}
    ${item.newerId ? `<button class="chain" data-jump="${esc(item.newerId)}">newer recap of this session ↗</button>` : item.chainCount > 1 ? '<div class="chain latest">latest of ' + item.chainCount + ' recaps</div>' : ""}
    <div class="flash">✅</div>
    <div class="overlay">
      <div class="proj"><span class="dot" style="background:${esc(item.accentColor)}"></span>
        <span style="color:${esc(item.accentColor)}">${esc(item.project)}</span></div>
      <div class="headline">${esc(item.headline)}</div>
      ${item.where ? `<div class="where">${esc(item.where)}</div>` : ""}
      <div class="next"><b>Next:</b> ${esc(item.next_step)}</div>
      <div class="row">
        <button class="btn watch">${item.watched ? "✓ watched" : "mark watched"}</button>
        <button class="btn comment">💬${item.comments?.length ? " " + item.comments.length : ""}</button>
        <button class="btn archive">archive</button>
        <button class="btn copy">copy path</button>
        ${detailAvailable(item) ? '<button class="btn details">details</button>' : ""}
      </div>
      ${detailSheet(item)}
      <div class="csheet">
        <textarea class="cinput" rows="2" placeholder="Reply to this session… (routed to the project's agent)"></textarea>
        <div class="crow">
          <button class="btn csend">send</button>
          <span class="cstatus"></span>
        </div>
        ${(item.comments || []).map((c) => `<div class="citem">${esc(c.text)}${c.routedTo ? ` <span class="crouted">→ ${esc(c.routedTo)}</span>` : ""}</div>`).join("")}
      </div>
    </div>
    <div class="speed">2×</div>`;
}

function render() {
  feed.innerHTML = "";
  if (!items.length) {
    document.getElementById("empty").style.display = "block";
    return;
  }
  for (const item of items) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.id = item.id;
    cell.innerHTML = cellHtml(item);
    wireCell(cell, item);
    feed.appendChild(cell);
  }
  observe();
}

function activate(cell) {
  if (activeCell === cell) return;
  activeCell = cell;
  const item = items.find((i) => i.id === cell.dataset.id);
  if (!item) return;
  const prev = player;
  player = elementFor(item);
  if (prev !== player) {
    prev.pause();
    prev.remove(); // detach from its old cell; it becomes a pre-buffer spare
  }
  cell.prepend(player);
  if (player.src !== srcFor(item)) player.src = srcFor(item);
  player.currentTime = 0;
  player.playbackRate = 1;
  if (started) {
    player.muted = false;
    player.play().catch(() => {
      player.muted = true;
      player.play().catch(() => {});
    });
  }
  armAutoWatch(cell, item);
  prebuffer();
}

async function setWatched(item, cell, watched) {
  item.watched = watched;
  cell.querySelector(".watch").textContent = watched ? "✓ watched" : "mark watched";
  cell.querySelector(".watch").classList.toggle("done", watched);
  const pill = cell.querySelector(".newpill");
  if (pill && watched) pill.remove();
  try {
    await fetch(`/api/watched/${item.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watched }),
    });
  } catch {}
}

function armAutoWatch(cell, item) {
  if (item.watched) return;
  const el = player; // the element playing this reel right now
  const onTime = () => {
    if (activeCell !== cell || el !== player) {
      el.removeEventListener("timeupdate", onTime);
      return;
    }
    if (el.duration && el.currentTime / el.duration > 0.8) {
      el.removeEventListener("timeupdate", onTime);
      setWatched(item, cell, true);
    }
  };
  el.addEventListener("timeupdate", onTime);
}

function wireCell(cell, item) {
  cell.querySelector(".watch").addEventListener("click", (e) => {
    e.stopPropagation();
    setWatched(item, cell, !item.watched);
  });
  cell.querySelector(".comment").addEventListener("click", (e) => {
    e.stopPropagation();
    cell.querySelector(".csheet").classList.toggle("show");
  });
  cell.querySelector(".csend").addEventListener("click", async (e) => {
    e.stopPropagation();
    const input = cell.querySelector(".cinput");
    const status = cell.querySelector(".cstatus");
    const text = input.value.trim();
    if (!text) return;
    status.textContent = "…";
    try {
      const r = await fetch(`/api/comment/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = await r.json();
      status.textContent = j.routedTo ? `sent → ${j.routedTo}` : "saved";
      const div = document.createElement("div");
      div.className = "citem";
      div.textContent = text;
      cell.querySelector(".crow").after(div);
      cell.querySelector(".comment").textContent = `💬 ${j.count}`;
      input.value = "";
    } catch {
      status.textContent = "failed";
    }
  });
  cell.querySelector(".archive").addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      await fetch(`/api/archive/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      if (activeCell === cell) player.pause();
      cell.remove();
      items = items.filter((i) => i.id !== item.id);
    } catch {}
  });
  const chain = cell.querySelector("button.chain");
  if (chain) {
    chain.addEventListener("click", (e) => {
      e.stopPropagation();
      const target = document.querySelector(`.cell[data-id="${chain.dataset.jump}"]`);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  cell.querySelector(".copy").addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(item.sourcePath || item.project);
      e.target.textContent = "copied ✓";
      setTimeout(() => (e.target.textContent = "copy path"), 1500);
    } catch {}
  });

  // hold: 2x speed while pressed
  let holdTimer = null;
  let holding = false;
  cell.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".btn, .overlay, .sheet, .csheet")) return;
    holdTimer = setTimeout(() => {
      holding = true;
      player.playbackRate = 2;
      cell.querySelector(".speed").classList.add("show");
    }, 350);
  });
  const endHold = () => {
    clearTimeout(holdTimer);
    if (holding) {
      player.playbackRate = 1;
      cell.querySelector(".speed").classList.remove("show");
      setTimeout(() => (holding = false), 350); // swallow the click this release fires
    }
  };
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) cell.addEventListener(ev, endHold);

  // tap: pause/resume (and unmute). double-tap: mark watched.
  let lastTap = 0;
  cell.addEventListener("click", (e) => {
    if (holding || e.target.closest(".btn, .sheet, .csheet")) return;
    const now = Date.now();
    if (now - lastTap < 320) {
      setWatched(item, cell, true);
      const f = cell.querySelector(".flash");
      f.classList.add("show");
      setTimeout(() => f.classList.remove("show"), 700);
      lastTap = 0;
      return;
    }
    lastTap = now;
    setTimeout(() => {
      if (Date.now() - lastTap < 320 || activeCell !== cell) return;
      if (player.muted) {
        player.muted = false;
        if (player.paused) player.play().catch(() => {});
      } else if (player.paused) player.play().catch(() => {});
      else player.pause();
    }, 330);
  });
}

let observer;
function observe() {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (en.intersectionRatio >= 0.6) activate(en.target);
        else if (activeCell === en.target && en.intersectionRatio === 0) player.pause();
      }
    },
    { threshold: [0, 0.6] },
  );
  document.querySelectorAll(".cell").forEach((c) => observer.observe(c));
}

document.getElementById("go").addEventListener("click", () => {
  started = true;
  startEl.remove();
  const first = document.querySelector(".cell");
  if (first) activate(first); // assigns srcs to player + both pre-buffer spares
  // Unlock every pool element inside this gesture (play+pause blesses each
  // for future unmuted playback), then start the first reel for real.
  for (const v of pool) {
    if (v === player) continue;
    v.muted = true;
    const p = v.play();
    if (p) p.then(() => v.pause()).catch(() => {});
  }
  if (first) {
    player.muted = false;
    player.play().catch(() => {
      player.muted = true;
      player.play().catch(() => {});
    });
  }
});

load();
