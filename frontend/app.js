/* ═══════════════════════════════════════════════════════════
   Adaptive Indexing Engine — Dashboard JS
   • Event-based animations ONLY — no continuous blinking
   • animateNode(el) adds .node-animate for 600 ms, then removes it
   • Polls /stats every 1s to keep visualizations current
═══════════════════════════════════════════════════════════ */

const API     = "http://localhost:18080";
const MAX_OPS = 10;
const NODE_R  = 22;   // AVL circle radius (SVG px)
const LEVEL_H = 82;   // Vertical gap between tree levels

/* ═══════════════════════════════════════════════════════════
   TOAST SYSTEM
═══════════════════════════════════════════════════════════ */
const toastContainer = document.getElementById("toast-container");

function showToast({ title, msg, type = "ok", duration = 3200 }) {
  const typeIconMap = {
    ok:    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="2,9 6,13 14,4"/></svg>`,
    error: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>`,
    info:  `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="8" cy="8" r="6"/><line x1="8" y1="7" x2="8" y2="11"/><circle cx="8" cy="5" r=".6" fill="currentColor"/></svg>`,
    promo: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="2,14 8,2 14,14"/><line x1="5.5" y1="10" x2="10.5" y2="10"/></svg>`,
  };

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-inner">
      <div class="toast-icon toast-icon-${type}">${typeIconMap[type] || typeIconMap.info}</div>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        <div class="toast-msg">${msg}</div>
      </div>
      <button class="toast-close" aria-label="Dismiss">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4">
          <line x1="3" y1="3" x2="13" y2="13"/>
          <line x1="13" y1="3" x2="3" y2="13"/>
        </svg>
      </button>
    </div>
    <div class="toast-progress">
      <div class="toast-progress-bar" style="animation-duration:${duration}ms"></div>
    </div>
  `;

  const dismiss = () => {
    toast.classList.add("toast-exit");
    const remove = () => { if (toast.parentNode) toast.remove(); };
    toast.addEventListener("animationend", remove, { once: true });
    setTimeout(remove, 350); /* fallback if animationend doesn't fire */
  };
  toast.querySelector(".toast-close").addEventListener("click", dismiss);

  toastContainer.appendChild(toast);
  const timer = setTimeout(dismiss, duration);
  toast.querySelector(".toast-close").addEventListener("click", () => clearTimeout(timer), { once: true });
}

/* ═══════════════════════════════════════════════════════════
   POPUP HELPERS
═══════════════════════════════════════════════════════════ */
function openPopup(overlay) {
  const card = overlay.querySelector(".popup-card");
  /* Strip any leftover classes from a previous close */
  card.classList.remove("popup-show", "popup-exit");
  /* Make overlay visible first */
  overlay.classList.remove("hidden");
  /* Force reflow so the browser registers the element as freshly rendered,
     then add the show class to trigger the popupIn animation */
  void card.offsetWidth;
  card.classList.add("popup-show");
}

function closePopup(overlay) {
  const card = overlay.querySelector(".popup-card");
  card.classList.remove("popup-show");
  card.classList.add("popup-exit");

  const finish = () => {
    overlay.classList.add("hidden");
    card.classList.remove("popup-exit");
  };
  /* Primary: wait for animation to end */
  card.addEventListener("animationend", finish, { once: true });
  /* Fallback: if animationend never fires (e.g. reduced-motion), hide after 300 ms */
  setTimeout(() => {
    if (!overlay.classList.contains("hidden")) finish();
  }, 300);
}

/* ── recent ops list ── */
const recentOps = [];

/* Key whose AVL node should blink on the next renderAVL pass.
   Set by the search handler, cleared inside renderAVL after use. */
let _blinkKey = null;

/* ═══════════════════════════════════════════════════════════
   DOM REFERENCES
═══════════════════════════════════════════════════════════ */
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

/* Popup overlay references */
const searchPopupEl  = $("search-popup");
const promoPopupEl   = $("promo-popup");
const insertPopupEl  = $("insert-popup");
const bplusStartupPopupEl = $("bplus-startup-popup");
const startupBplusSlider  = $("startup-bplus-slider");
const startupBplusInput   = $("startup-bplus-input");
const startupBplusDisplay = $("startup-bplus-display");
const startupBplusHint    = $("startup-bplus-hint");
const startupBplusStatus  = $("startup-bplus-status");
const startupBplusApply   = $("startup-bplus-apply");

const insertKeyEl   = $("insert-key");
const insertValueEl = $("insert-value");
const insertBtn     = $("insert-btn");
const insertStatus  = $("insert-status");

const searchKeyEl   = $("search-key");
const searchBtn     = $("search-btn");
const resetBtn      = $("reset-btn");
const searchStatus  = $("search-status");

const avlSvg          = $("avl-svg");
const avlBody         = $("avl-body");
const avlPlaceholder  = $("avl-placeholder");

const bplusView       = $("bplus-view");
const bplusPlaceholder = $("bplus-placeholder");

const recentTbody = $("recent-ops");
const opsEmpty    = $("ops-empty");
const clearBtn    = $("clear-btn");

const statAvl      = $("stat-avl");
const statBplus    = $("stat-bplus");
const statCache    = $("stat-cache");
const statMigrated = $("stat-migrated");

const scAvl        = $("sc-avl");
const scBplus      = $("sc-bplus");
const scSearches   = $("sc-searches");
const scPromotions = $("sc-promotions");
const scCache      = $("sc-cache");

const threshSlider  = $("thresh-slider");
const threshDisplay = $("thresh-display");

const bplusThreshSlider  = $("bplus-thresh-slider");
const bplusThreshDisplay = $("bplus-thresh-display");

const vizArea = $("viz-area");

/** Avoid overwriting B+ slider while user is dragging */
let bplusThreshUserAdjusting = false;
let bplusStartupUserEditing = false;
let bplusStartupPromptShown = false;
/** Last value confirmed by server (skip redundant /config calls) */
let lastAppliedBplusCap = 4;

/* Keep last known stats for statistics tab */
let lastStats = { avlNodeCount: 0, bplusNodeCount: 0, totalSearches: 0, promotions: 0 };

/* ── Popup close wiring ── */
["search-popup-close", "search-popup-backdrop", "search-popup-dismiss"].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener("click", () => closePopup(searchPopupEl));
});
["promo-close", "promo-popup-backdrop"].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener("click", () => closePopup(promoPopupEl));
});
["insert-popup-close", "insert-popup-backdrop", "insert-popup-dismiss"].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener("click", () => closePopup(insertPopupEl));
});
/* "Search this key" button in insert popup */
const insertPopupSearchBtn = $("insert-popup-search");
if (insertPopupSearchBtn) {
  insertPopupSearchBtn.addEventListener("click", () => {
    const key = $("ins-key-display").textContent;
    closePopup(insertPopupEl);
    // Switch to search tab and pre-fill
    document.querySelector('.tab[data-tab="search"]').click();
    searchKeyEl.value = key;
    searchKeyEl.focus();
  });
}

/* ─── Search Result Popup ─── */
function showSearchPopup({ key, value, location, accessCount, threshold, found }) {
  if (!found) return; // not found is handled by toast

  const header     = $("sr-header");
  const headerIcon = $("sr-header-icon");
  const locationLbl = $("sr-location-label");

  const inAVL = location && location.includes("AVL");
  header.classList.remove("in-avl", "not-found-header");
  if (inAVL) header.classList.add("in-avl");

  locationLbl.textContent = inAVL ? "Found in AVL Tree (Hot Key)" : "Found in B+ Tree";

  $("sr-key").textContent   = key;
  $("sr-value").textContent = value;

  // Location badge
  const locBadgeEl = $("sr-location-badge");
  const chipClass  = inAVL ? "chip-avl" : "chip-bplus";
  locBadgeEl.innerHTML = `<span class="sr-location-chip ${chipClass}">${location}</span>`;

  // Progress bar
  const count  = parseInt(accessCount, 10) || 0;
  const thresh = parseInt(threshold, 10)   || 3;
  const pct    = Math.min(100, Math.round((count / thresh) * 100));

  $("sr-access").textContent    = count;
  $("sr-threshold").textContent = thresh;

  const fill = $("sr-progress-fill");
  fill.classList.remove("fill-promoted", "fill-almost");
  if (inAVL || count >= thresh) {
    fill.classList.add("fill-promoted");
    $("sr-progress-hint").textContent = "Hot key — served from AVL Tree cache";
  } else if (pct >= 60) {
    fill.classList.add("fill-almost");
    $("sr-progress-hint").textContent = `${thresh - count} more search${thresh - count > 1 ? "es" : ""} to trigger promotion`;
  } else {
    $("sr-progress-hint").textContent = "Keep searching to promote to AVL Tree";
  }
  // Animate width: set to 0, force reflow, then set target
  fill.style.width = "0%";
  void fill.offsetWidth;
  fill.style.width = pct + "%";

  openPopup(searchPopupEl);
}

/* ─── Promotion Popup ─── */
function showPromoPopup({ key, accessCount, totalPromotions }) {
  $("promo-key").textContent    = key;
  $("promo-access").textContent = accessCount;
  $("promo-total").textContent  = totalPromotions;

  // Confetti bar
  const confettiEl = $("promo-confetti");
  confettiEl.innerHTML = "";
  const colors = ["#f59e0b","#0d9488","#2563eb","#7c3aed","#059669","#dc2626","#d97706","#0ea5e9"];
  for (let i = 0; i < 12; i++) {
    const seg = document.createElement("div");
    seg.className = "promo-confetti-seg";
    seg.style.background = colors[i % colors.length];
    seg.style.animationDelay = (i * 0.05) + "s";
    confettiEl.appendChild(seg);
  }

  openPopup(promoPopupEl);
}

/* ─── Insert Result Popup ─── */
function showInsertPopup({ key, value, location, threshold }) {
  $("ins-key-display").textContent     = key;
  $("ins-val-display").textContent     = value;
  $("ins-threshold-hint").textContent  = threshold;
  const locBadge = $("ins-loc-badge");
  locBadge.textContent = location;
  locBadge.style.background = location.includes("AVL")
    ? "var(--teal-light)"  : "var(--blue-light)";
  locBadge.style.color = location.includes("AVL")
    ? "var(--teal-dark)"   : "var(--blue-dark)";
  openPopup(insertPopupEl);
}

/* ═══════════════════════════════════════════════════════════
   TAB NAVIGATION
═══════════════════════════════════════════════════════════ */
const VIZ_TABS = new Set(["insert", "search"]);

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;

    /* Update active tab */
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    /* Show / hide panels */
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    $(`panel-${target}`).classList.add("active");

    /* Show visualization only on Insert + Search */
    if (VIZ_TABS.has(target)) {
      vizArea.classList.remove("hidden");
    } else {
      vizArea.classList.add("hidden");
    }
  });
});

/* ═══════════════════════════════════════════════════════════
   EVENT-BASED ANIMATION  ← the only animation trigger
   Adds .node-animate class, removes after 600 ms.
═══════════════════════════════════════════════════════════ */
function animateNode(element) {
  if (!element) return;
  element.classList.remove("node-animate"); /* reset if already running */
  /* Force reflow so re-adding the class restarts the animation */
  void element.offsetWidth;
  element.classList.add("node-animate");
  setTimeout(() => element.classList.remove("node-animate"), 700);
}

/* Find SVG <g data-key="…"> or .leaf-cell[data-key="…"] */
function findNodeElement(key) {
  return document.querySelector(`[data-key="${key}"]`);
}

/* ═══════════════════════════════════════════════════════════
   STATUS HELPERS
═══════════════════════════════════════════════════════════ */
function setStatus(el, msg, type = "") {
  el.textContent = msg;
  el.className = "status-line" +
    (type === "ok"      ? " status-ok"      :
     type === "error"   ? " status-error"   :
     type === "pending" ? " status-pending" : "");
}

/* ═══════════════════════════════════════════════════════════
   RECENT OPERATIONS TABLE
═══════════════════════════════════════════════════════════ */
function addOp(type, key, location) {
  recentOps.unshift({ type, key, location });
  if (recentOps.length > MAX_OPS) recentOps.pop();
  renderOps();
}

function renderOps() {
  recentTbody.innerHTML = "";

  if (!recentOps.length) {
    opsEmpty.classList.remove("hidden");
    return;
  }
  opsEmpty.classList.add("hidden");

  recentOps.forEach(op => {
    const isAVL    = op.location && op.location.includes("AVL");
    const isInsert = op.type === "Insert";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${op.key}</td>
      <td><span class="chip ${isInsert ? "chip-insert" : "chip-search"}">${op.type}</span></td>
      <td><span class="chip ${isAVL ? "chip-avl" : "chip-bplus"}">${op.location || "—"}</span></td>
    `;
    recentTbody.appendChild(tr);
  });
}

clearBtn.addEventListener("click", () => {
  recentOps.length = 0;
  renderOps();
});

/* ═══════════════════════════════════════════════════════════
   INSERT
═══════════════════════════════════════════════════════════ */
insertBtn.addEventListener("click", async () => {
  const key = insertKeyEl.value.trim();
  const val = insertValueEl.value.trim();

  if (!key || !val) {
    setStatus(insertStatus, "Please enter both a key and a value.", "error");
    showToast({ title: "Missing Fields", msg: "Enter both a key and a value before inserting.", type: "error", duration: 2800 });
    return;
  }

  setStatus(insertStatus, "Inserting…", "pending");
  insertBtn.disabled = true;
  try {
    const url = `${API}/insert?key=${encodeURIComponent(key)}&value=${encodeURIComponent(val)}`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error();

    const data = await res.json();
    const loc  = data.location || "B+ Tree";
    const thresh = parseInt(threshSlider.value, 10) || 3;

    setStatus(insertStatus, `Inserted key ${data.key} into ${loc}.`, "ok");
    addOp("Insert", data.key, loc);

    /* Show insert result popup */
    showInsertPopup({ key: data.key, value: data.value || val, location: loc, threshold: thresh });

    /* Also show a quick toast */
    showToast({
      title: "Key Inserted",
      msg: `Key <strong>${data.key}</strong> stored in ${loc}`,
      type: "ok",
      duration: 2600
    });

    insertKeyEl.value   = "";
    insertValueEl.value = "";

    await fetchStatsWithStatus();

  } catch {
    setStatus(insertStatus, "Insert failed — is the server running?", "error");
    showToast({ title: "Insert Failed", msg: "Could not reach the server. Is it running?", type: "error", duration: 3500 });
  } finally {
    insertBtn.disabled = false;
  }
});

[insertKeyEl, insertValueEl].forEach(el => {
  el.addEventListener("keydown", e => { if (e.key === "Enter") insertBtn.click(); });
});

/* ═══════════════════════════════════════════════════════════
   SEARCH
═══════════════════════════════════════════════════════════ */
searchBtn.addEventListener("click", async () => {
  const key = searchKeyEl.value.trim();
  if (!key) {
    setStatus(searchStatus, "Please enter a key to search.", "error");
    showToast({ title: "Missing Key", msg: "Enter an integer key to search.", type: "error", duration: 2400 });
    return;
  }

  setStatus(searchStatus, "Searching…", "pending");
  searchBtn.disabled = true;

  /* Snapshot promotions count before search to detect new promotions */
  const prevPromotions = lastStats.promotions;

  try {
    const res = await fetch(`${API}/search?q=${encodeURIComponent(key)}`);
    if (!res.ok) throw new Error("not found");

    const data = await res.json();
    const loc  = data.location || "B+ Tree";
    const thresh = parseInt(threshSlider.value, 10) || 3;

    setStatus(searchStatus,
      `Found key ${data.key} = "${data.value}"  |  ${loc}  |  access #${data.accessCount}`,
      "ok");
    addOp("Search", data.key, loc);

    /* Blink the AVL node on next render */
    if (loc.includes("AVL")) _blinkKey = data.key;

    /* Fetch fresh stats to get updated promotions count */
    await fetchStatsWithStatus();

    /* Show search result popup */
    showSearchPopup({
      key: data.key,
      value: data.value,
      location: loc,
      accessCount: data.accessCount,
      threshold: thresh,
      found: true
    });

    /* If a new promotion happened, also show the promotion popup */
    if (lastStats.promotions > prevPromotions) {
      /* Slight delay so search popup appears first */
      setTimeout(() => {
        closePopup(searchPopupEl);
        showPromoPopup({
          key: data.key,
          accessCount: data.accessCount,
          totalPromotions: lastStats.promotions
        });
        showToast({
          title: "Promoted to AVL Tree!",
          msg: `Key <strong>${data.key}</strong> is now in the hot key cache`,
          type: "promo",
          duration: 4000
        });
      }, 800);
    }

  } catch {
    setStatus(searchStatus, `Key "${key}" not found in either tree.`, "error");
    showToast({
      title: "Key Not Found",
      msg: `Key <strong>${key}</strong> does not exist in either tree`,
      type: "error",
      duration: 3000
    });
  } finally {
    searchBtn.disabled = false;
  }
});

searchKeyEl.addEventListener("keydown", e => { if (e.key === "Enter") searchBtn.click(); });

resetBtn.addEventListener("click", () => {
  searchKeyEl.value = "";
  setStatus(searchStatus, "System idle — waiting for input.");
});

/* ═══════════════════════════════════════════════════════════
   THRESHOLD SLIDER
═══════════════════════════════════════════════════════════ */
threshSlider.addEventListener("input", () => {
  threshDisplay.textContent = threshSlider.value;
});

function updateBplusThreshHint(n) {
  const el = $("bplus-thresh-hint");
  if (!el) return;
  el.textContent =
    `Split when a leaf reaches ${n} key${n === 1 ? "" : "s"} ` +
    `(insert #${n} into that leaf triggers a split).`;
}

function clampBplusCap(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(2, Math.min(256, n));
}

function parseBplusCap(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 2 || n > 256) return null;
  return n;
}

function updateStartupBplusControls(n) {
  const cap = clampBplusCap(n) || 4;
  if (startupBplusDisplay) startupBplusDisplay.textContent = String(cap);
  if (startupBplusSlider && !bplusStartupUserEditing) startupBplusSlider.value = String(cap);
  if (startupBplusInput && !bplusStartupUserEditing) startupBplusInput.value = String(cap);
  if (startupBplusHint) {
    startupBplusHint.textContent =
      `Each B+ leaf splits as soon as it reaches ${cap} key${cap === 1 ? "" : "s"}. ` +
      `So insert #${cap} into that leaf creates two leaves.`;
  }
}

function setStartupBplusStatus(msg, type = "") {
  if (startupBplusStatus) setStatus(startupBplusStatus, msg, type);
}

function showBplusStartupPrompt(cap) {
  if (!bplusStartupPopupEl || bplusStartupPromptShown) return;
  bplusStartupPromptShown = true;
  bplusStartupUserEditing = false;
  updateStartupBplusControls(cap);
  setStartupBplusStatus("Choose a threshold before inserting data.");
  openPopup(bplusStartupPopupEl);
  if (startupBplusInput) startupBplusInput.focus();
}

function syncBplusThreshFromServer(cap) {
  const n = Number.isFinite(cap) && cap >= 2 ? Math.min(256, cap) : 4;
  lastAppliedBplusCap = n;
  if (bplusThreshDisplay) bplusThreshDisplay.textContent = String(n);
  if (bplusThreshSlider && !bplusThreshUserAdjusting) {
    bplusThreshSlider.value = String(Math.max(2, Math.min(256, n)));
  }
  updateBplusThreshHint(n);
  if (!bplusStartupUserEditing) updateStartupBplusControls(n);
}

async function applyBplusThreshold(n) {
  const cap = clampBplusCap(n);
  if (!cap) {
    return { ok: false, msg: "Enter a number between 2 and 256." };
  }

  if (cap === lastAppliedBplusCap) {
    syncBplusThreshFromServer(cap);
    return { ok: true, applied: cap, changed: false };
  }

  const res = await fetch(`${API}/config?bplusLeafCapacity=${encodeURIComponent(String(cap))}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      msg: data.error || res.statusText || "Server error",
    };
  }

  const applied = parseInt(data.bplusLeafCapacity, 10) || cap;
  syncBplusThreshFromServer(applied);
  await fetchStatsWithStatus();
  return { ok: true, applied, changed: true };
}

async function applyBplusThreshFromSlider() {
  if (!bplusThreshSlider) return;
  const n = clampBplusCap(bplusThreshSlider.value);
  if (!n || n === lastAppliedBplusCap) return;

  try {
    const result = await applyBplusThreshold(n);
    if (!result.ok) {
      showToast({
        title: "B+ threshold failed",
        msg: result.msg,
        type: "error",
        duration: 4000,
      });
      syncBplusThreshFromServer(lastAppliedBplusCap);
      return;
    }
    showToast({
      title: "B+ threshold updated",
      msg: `Leaf splits when it reaches ${result.applied} keys. All previous data was cleared.`,
      type: "ok",
      duration: 3800,
    });
  } catch {
    showToast({
      title: "Network error",
      msg: "Could not reach the server.",
      type: "error",
      duration: 3500,
    });
    syncBplusThreshFromServer(lastAppliedBplusCap);
  }
}

async function applyStartupBplusThreshold() {
  if (!startupBplusInput || !startupBplusApply) return;
  const cap = parseBplusCap(startupBplusInput.value);

  if (!cap) {
    setStartupBplusStatus("Enter a number between 2 and 256.", "error");
    return;
  }

  bplusStartupUserEditing = false;
  updateStartupBplusControls(cap);
  setStartupBplusStatus("Applying threshold...", "pending");
  startupBplusApply.disabled = true;

  try {
    const result = await applyBplusThreshold(cap);
    if (!result.ok) {
      setStartupBplusStatus(result.msg, "error");
      showToast({
        title: "Threshold Not Applied",
        msg: result.msg,
        type: "error",
        duration: 3500,
      });
      return;
    }

    setStartupBplusStatus(`B+ leaves will split on key #${result.applied}.`, "ok");
    closePopup(bplusStartupPopupEl);
    showToast({
      title: "B+ Threshold Ready",
      msg: `Leaf split threshold set to <strong>${result.applied}</strong>. You can change it anytime from Live Statistics.`,
      type: "ok",
      duration: 4200,
    });
  } catch {
    setStartupBplusStatus("Could not reach the server. Start the backend and try again.", "error");
    showToast({
      title: "Server Offline",
      msg: "Start the backend before applying the B+ threshold.",
      type: "error",
      duration: 4000,
    });
  } finally {
    startupBplusApply.disabled = false;
  }
}

if (bplusThreshSlider) {
  const beginBplusThreshDrag = () => {
    bplusThreshUserAdjusting = true;
    const done = () => {
      bplusThreshUserAdjusting = false;
      document.removeEventListener("mouseup", done);
      document.removeEventListener("touchend", done);
    };
    document.addEventListener("mouseup", done);
    document.addEventListener("touchend", done);
  };
  bplusThreshSlider.addEventListener("mousedown", beginBplusThreshDrag);
  bplusThreshSlider.addEventListener("touchstart", beginBplusThreshDrag, { passive: true });

  bplusThreshSlider.addEventListener("input", () => {
    const v = parseInt(bplusThreshSlider.value, 10) || 2;
    if (bplusThreshDisplay) bplusThreshDisplay.textContent = String(v);
    updateBplusThreshHint(v);
  });

  bplusThreshSlider.addEventListener("change", () => {
    void applyBplusThreshFromSlider();
  });

  updateBplusThreshHint(parseInt(bplusThreshSlider.value, 10) || 4);
}

function setStartupBplusDraft(value, source) {
  const cap = parseBplusCap(value);
  if (!cap) {
    if (startupBplusDisplay) startupBplusDisplay.textContent = "--";
    setStartupBplusStatus("Enter a number between 2 and 256.", "error");
    return;
  }

  if (startupBplusDisplay) startupBplusDisplay.textContent = String(cap);
  if (startupBplusHint) {
    startupBplusHint.textContent =
      `Each B+ leaf splits as soon as it reaches ${cap} key${cap === 1 ? "" : "s"}. ` +
      `Insert #${cap} into that leaf triggers the split.`;
  }
  if (startupBplusSlider && source !== "slider") startupBplusSlider.value = String(cap);
  if (startupBplusInput && source !== "input") startupBplusInput.value = String(cap);
  setStartupBplusStatus("Waiting for your threshold.");
}

if (startupBplusSlider && startupBplusInput && startupBplusApply) {
  startupBplusSlider.addEventListener("input", () => {
    bplusStartupUserEditing = true;
    setStartupBplusDraft(startupBplusSlider.value, "slider");
  });

  startupBplusInput.addEventListener("input", () => {
    bplusStartupUserEditing = true;
    setStartupBplusDraft(startupBplusInput.value, "input");
  });

  startupBplusInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      startupBplusApply.click();
    }
  });

  startupBplusApply.addEventListener("click", () => {
    void applyStartupBplusThreshold();
  });
}

/* fetchStats is now fetchStatsWithStatus (defined at BOOT) */

/* ═══════════════════════════════════════════════════════════
   AVL TREE  —  SVG RENDERER
   Backend returns in-order keys.
   We reconstruct a balanced BST shape for display.
═══════════════════════════════════════════════════════════ */
function buildTree(nodes) {
  if (!nodes.length) return null;
  const mid  = Math.floor(nodes.length / 2);
  const node = { ...nodes[mid] };
  node.left  = buildTree(nodes.slice(0, mid));
  node.right = buildTree(nodes.slice(mid + 1));
  return node;
}

function annotate(node) {
  if (!node) return 0;
  const lh = annotate(node.left);
  const rh = annotate(node.right);
  node.h  = 1 + Math.max(lh, rh);
  node.bf = lh - rh;
  return node.h;
}

function assignXY(node, lo, hi, depth) {
  if (!node) return;
  node.x = (lo + hi) / 2;
  node.y = NODE_R + 10 + depth * LEVEL_H;
  assignXY(node.left,  lo,     node.x, depth + 1);
  assignXY(node.right, node.x, hi,     depth + 1);
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function drawEdges(node, svg) {
  if (!node) return;
  if (node.left) {
    svg.appendChild(svgEl("line", {
      x1: node.x, y1: node.y,
      x2: node.left.x,  y2: node.left.y,
      class: "tree-edge"
    }));
  }
  if (node.right) {
    svg.appendChild(svgEl("line", {
      x1: node.x, y1: node.y,
      x2: node.right.x, y2: node.right.y,
      class: "tree-edge"
    }));
  }
  drawEdges(node.left,  svg);
  drawEdges(node.right, svg);
}

function drawNodes(node, svg, promotedKeys) {
  if (!node) return;

  const g = svgEl("g", { class: "avl-node", "data-key": node.key });

  /* Blink this node if it was just searched — applied at creation time
     so there are no classList/reflow timing issues with SVG elements */
  if (_blinkKey !== null && node.key === _blinkKey) {
    g.style.animation = "avlBlink .7s ease both";
    setTimeout(() => { g.style.animation = ""; }, 750);
  }

  const isPromoted = promotedKeys && promotedKeys.has(node.key);
  g.appendChild(svgEl("circle", {
    cx: node.x, cy: node.y, r: NODE_R,
    class: "node-circle" + (isPromoted ? " promoted" : "")
  }));

  const keyT = svgEl("text", { x: node.x, y: node.y, class: "node-key" });
  keyT.textContent = node.key;
  g.appendChild(keyT);

  const infoT = svgEl("text", {
    x: node.x,
    y: node.y + NODE_R + 13,
    class: "node-info"
  });
  infoT.textContent = `h:${node.h}  \u0394:${node.bf}`;
  g.appendChild(infoT);

  svg.appendChild(g);

  drawNodes(node.left,  svg, promotedKeys);
  drawNodes(node.right, svg, promotedKeys);
}

function renderAVL(nodes) {
  while (avlSvg.firstChild) avlSvg.removeChild(avlSvg.firstChild);

  if (!nodes.length) {
    avlPlaceholder.classList.remove("hidden");
    avlSvg.style.display = "none";
    return;
  }

  avlPlaceholder.classList.add("hidden");
  avlSvg.style.display = "block";

  const root       = buildTree(nodes);
  annotate(root);

  const containerW = avlBody.clientWidth  || 360;
  const svgW       = Math.max(containerW - 16, nodes.length * (NODE_R * 2 + 10));
  const svgH       = root.h * LEVEL_H + NODE_R * 2 + 30;

  avlSvg.setAttribute("viewBox", `0 0 ${svgW} ${svgH}`);
  avlSvg.setAttribute("height",  svgH);

  assignXY(root, NODE_R + 5, svgW - NODE_R - 5, 0);

  const promoted = new Set(
    nodes.filter(n => (parseInt(n.accessCount, 10) || 0) >= 3).map(n => n.key)
  );

  drawEdges(root, avlSvg);
  drawNodes(root, avlSvg, promoted);
  _blinkKey = null;   /* consumed — clear so interval polls don't re-trigger */
}

/* ═══════════════════════════════════════════════════════════
   B+ TREE  —  LEAF BLOCK RENDERER
═══════════════════════════════════════════════════════════ */
function renderBPlus(leaves) {
  bplusView.innerHTML = "";

  if (!leaves.length) {
    bplusPlaceholder.classList.remove("hidden");
    return;
  }
  bplusPlaceholder.classList.add("hidden");

  leaves.forEach((leaf, idx) => {
    const row = document.createElement("div");
    row.className = "bplus-leaf-row";

    const lbl = document.createElement("div");
    lbl.className   = "leaf-label";
    lbl.textContent = `L${leaf.id}`;
    row.appendChild(lbl);

    const cells = document.createElement("div");
    cells.className = "leaf-cells";

    (leaf.entries || []).forEach(entry => {
      const cell = document.createElement("div");
      cell.className        = "leaf-cell";
      cell.textContent      = entry.key;
      cell.title            = `val: ${entry.value}  |  access: ${entry.accessCount}`;
      cell.dataset.key      = entry.key;   /* used by findNodeElement() */
      cells.appendChild(cell);
    });

    row.appendChild(cells);

    if (idx < leaves.length - 1) {
      const arrow = document.createElement("div");
      arrow.className   = "leaf-arrow";
      arrow.textContent = "→";
      row.appendChild(arrow);
    }

    bplusView.appendChild(row);
  });
}

/* ═══════════════════════════════════════════════════════════
   SERVER STATUS INDICATOR
═══════════════════════════════════════════════════════════ */
const serverDot    = $("server-dot");
const dotEl        = serverDot ? serverDot.querySelector(".dot")       : null;
const dotLabelEl   = serverDot ? serverDot.querySelector(".dot-label") : null;
const offlineBanner = $("offline-banner");

/* null = never connected yet, true = online, false = went offline */
let _serverOnline = null;

function setServerStatus(online) {
  if (online === _serverOnline) return;
  const prev = _serverOnline;
  _serverOnline = online;

  if (dotEl) {
    dotEl.className = "dot " + (online ? "dot-online" : "dot-offline");
  }
  if (dotLabelEl) {
    dotLabelEl.textContent = online ? "Online" : "Offline";
  }
  if (offlineBanner) {
    /* Banner only appears when server drops after being connected — NOT on first load */
    if (online || prev === null) {
      offlineBanner.classList.add("hidden");
    } else {
      offlineBanner.classList.remove("hidden");
    }
  }

  /* Toast only when transitioning online → offline (not on first cold load) */
  if (!online && prev === true) {
    showToast({
      title: "Server Disconnected",
      msg: "Lost connection to <code>localhost:18080</code>. Restart the server.",
      type: "error",
      duration: 5000
    });
  }
}

/* ═══════════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════════ */
console.log("[AIE] app.js loaded — connecting to", API);

async function fetchStatsWithStatus() {
  try {
    const res = await fetch(`${API}/stats`);
    if (!res.ok) { setServerStatus(false); return; }
    const d = await res.json();

    setServerStatus(true);

    const avlCount = parseInt(d.avlNodeCount,   10) || 0;
    const bpCount  = parseInt(d.bplusNodeCount, 10) || 0;
    const promos   = parseInt(d.promotions,     10) || 0;
    const searches = parseInt(d.totalSearches,  10) || 0;
    const bpCap = parseInt(d.bplusLeafCapacity, 10);
    if (d.bplusLeafCapacity !== undefined && !bplusThreshUserAdjusting) {
      syncBplusThreshFromServer(bpCap);
    }
    if (d.bplusLeafCapacity !== undefined) {
      showBplusStartupPrompt(bpCap);
    }
    const total    = avlCount + bpCount;
    const ratio    = total > 0 ? Math.round((avlCount / total) * 100) : 0;

    statAvl.textContent      = avlCount;
    statBplus.textContent    = bpCount;
    statCache.textContent    = ratio + "%";
    statMigrated.textContent = promos;

    scAvl.textContent        = avlCount;
    scBplus.textContent      = bpCount;
    scSearches.textContent   = searches;
    scPromotions.textContent = promos;
    scCache.textContent      = ratio + "%";

    lastStats = { avlNodeCount: avlCount, bplusNodeCount: bpCount,
                  totalSearches: searches, promotions: promos, _raw: d };

    renderAVL(d.avlNodes    || []);
    renderBPlus(d.bplusLeaves || []);
    renderStatsDashboard(d);

  } catch {
    setServerStatus(false);
  }
}

/* Replace the original fetchStats used by polling */
fetchStatsWithStatus();
setInterval(fetchStatsWithStatus, 1000);

/* ═══════════════════════════════════════════════════════════
   STATISTICS DASHBOARD RENDERER
═══════════════════════════════════════════════════════════ */
function renderStatsDashboard(d) {
  const avlCount = parseInt(d.avlNodeCount,   10) || 0;
  const bpCount  = parseInt(d.bplusNodeCount, 10) || 0;
  const promos   = parseInt(d.promotions,     10) || 0;
  const searches = parseInt(d.totalSearches,  10) || 0;
  const thresh   = parseInt(threshSlider.value, 10) || 3;
  const total    = avlCount + bpCount;

  // Timestamp
  const dashUpdatedEl = $("dash-updated");
  if (dashUpdatedEl) {
    const t = new Date();
    dashUpdatedEl.textContent = `Updated ${t.toLocaleTimeString()}`;
  }

  // Distribution bar
  const avlPct   = total > 0 ? Math.round((avlCount / total) * 100) : 0;
  const bplusPct = 100 - avlPct;
  const distSegAvl   = $("dist-seg-avl");
  const distSegBplus = $("dist-seg-bplus");
  if (distSegAvl)   distSegAvl.style.width   = avlPct + "%";
  if (distSegBplus) distSegBplus.style.width = bplusPct + "%";
  const e = id => $(id);
  if (e("dist-avl-pct"))   e("dist-avl-pct").textContent   = avlPct + "%";
  if (e("dist-bplus-pct")) e("dist-bplus-pct").textContent = bplusPct + "%";
  if (e("dist-total"))     e("dist-total").textContent     = total + (total === 1 ? " key" : " keys");
  if (e("dm-total-keys"))  e("dm-total-keys").textContent  = total;
  if (e("dm-hot-keys"))    e("dm-hot-keys").textContent    = avlCount;
  if (e("dm-cold-keys"))   e("dm-cold-keys").textContent   = bpCount;
  const promoRate = searches > 0 ? Math.round((promos / searches) * 100) : 0;
  if (e("dm-promo-rate"))  e("dm-promo-rate").textContent  = promoRate + "%";

  // Efficiency bars
  if (e("eff-bar-avl"))   e("eff-bar-avl").style.width   = avlPct + "%";
  if (e("eff-bar-bplus")) e("eff-bar-bplus").style.width = bplusPct + "%";
  if (e("eff-pct-avl"))   e("eff-pct-avl").textContent   = avlPct + "%";
  if (e("eff-pct-bplus")) e("eff-pct-bplus").textContent = bplusPct + "%";
  if (e("eff-thresh-val")) e("eff-thresh-val").textContent = thresh + (thresh === 1 ? " search" : " searches");

  // Hot Keys table (AVL nodes sorted by access count desc)
  const avlNodes  = d.avlNodes || [];
  const sortedAvl = [...avlNodes].sort((a, b) =>
    (parseInt(b.accessCount, 10) || 0) - (parseInt(a.accessCount, 10) || 0));
  const maxAccess = sortedAvl.length > 0 ? Math.max(parseInt(sortedAvl[0].accessCount, 10) || 1, 1) : 1;
  const hotCountEl = $("hot-count");
  if (hotCountEl) hotCountEl.textContent = avlNodes.length + (avlNodes.length === 1 ? " key" : " keys");
  const avlTbody  = $("dash-avl-tbody");
  const avlEmpty  = $("dash-avl-empty");
  if (avlTbody) {
    avlTbody.innerHTML = "";
    if (sortedAvl.length === 0) {
      if (avlEmpty) avlEmpty.classList.remove("hidden");
    } else {
      if (avlEmpty) avlEmpty.classList.add("hidden");
      sortedAvl.forEach(n => {
        const count   = parseInt(n.accessCount, 10) || 0;
        const heatPct = Math.round((count / maxAccess) * 100);
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${n.key}</td>
          <td style="color:var(--muted);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${n.value}">${n.value}</td>
          <td style="font-weight:700;color:var(--orange)">${count}</td>
          <td><div class="heat-bar-wrap"><div class="heat-bar-fill" style="width:${heatPct}%"></div></div></td>`;
        avlTbody.appendChild(tr);
      });
    }
  }

  // Cold Keys table (B+ leaves, sorted by key)
  const bpLeaves  = d.bplusLeaves || [];
  const bpEntries = [];
  bpLeaves.forEach(leaf => { (leaf.entries || []).forEach(en => bpEntries.push(en)); });
  bpEntries.sort((a, b) => parseInt(a.key, 10) - parseInt(b.key, 10));
  const coldCountEl = $("cold-count");
  if (coldCountEl) coldCountEl.textContent = bpEntries.length + (bpEntries.length === 1 ? " key" : " keys");
  const bpTbody  = $("dash-bplus-tbody");
  const bpEmpty  = $("dash-bplus-empty");
  if (bpTbody) {
    bpTbody.innerHTML = "";
    if (bpEntries.length === 0) {
      if (bpEmpty) bpEmpty.classList.remove("hidden");
    } else {
      if (bpEmpty) bpEmpty.classList.add("hidden");
      bpEntries.forEach(en => {
        const count = parseInt(en.accessCount, 10) || 0;
        const pct   = Math.min(100, Math.round((count / thresh) * 100));
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${en.key}</td>
          <td style="color:var(--muted);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${en.value}">${en.value}</td>
          <td style="font-weight:600;color:var(--blue-dark)">${count}</td>
          <td><div class="promo-mini-wrap"><div class="promo-mini-fill${pct >= 60 ? " almost-promoted" : ""}" style="width:${pct}%"></div></div></td>`;
        bpTbody.appendChild(tr);
      });
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   BROWSE ALL DATA POPUP
═══════════════════════════════════════════════════════════ */
const browsePopupEl  = $("browse-popup");
const browseTbody    = $("browse-tbody");
const browseEmpty    = $("browse-empty");
const browseNoData   = $("browse-no-data");
const browseSubtitle = $("browse-subtitle");
const browseSearchEl = $("browse-search");

let _browseAllRows = [];   /* full merged dataset, rebuilt on each open */

function buildBrowseRows(stats) {
  const rows = [];
  (stats.avlNodes || []).forEach(n => {
    rows.push({ key: parseInt(n.key, 10), value: n.value,
                location: "AVL Tree", accessCount: parseInt(n.accessCount, 10) || 0 });
  });
  (stats.bplusLeaves || []).forEach(leaf => {
    (leaf.entries || []).forEach(e => {
      rows.push({ key: parseInt(e.key, 10), value: e.value,
                  location: "B+ Tree", accessCount: parseInt(e.accessCount, 10) || 0 });
    });
  });
  rows.sort((a, b) => a.key - b.key);
  return rows;
}

function renderBrowseTable(rows) {
  browseTbody.innerHTML = "";
  if (rows.length === 0) {
    browseEmpty.classList.remove("hidden");
    return;
  }
  browseEmpty.classList.add("hidden");

  rows.forEach(r => {
    const tr = document.createElement("tr");
    const isAVL = r.location === "AVL Tree";
    tr.innerHTML = `
      <td>${r.key}</td>
      <td>${r.value}</td>
      <td><span class="${isAVL ? "browse-loc-avl" : "browse-loc-bplus"}">${r.location}</span></td>
      <td class="browse-access">${r.accessCount}</td>`;
    browseTbody.appendChild(tr);
  });
}

function applyBrowseFilter() {
  const text   = (browseSearchEl.value || "").toLowerCase();
  const chip   = document.querySelector(".browse-chip.active");
  const filter = chip ? chip.dataset.filter : "all";

  const filtered = _browseAllRows.filter(r => {
    const matchText = !text ||
      String(r.key).includes(text) ||
      r.value.toLowerCase().includes(text);
    const matchLoc  = filter === "all" ||
      (filter === "avl"   && r.location === "AVL Tree") ||
      (filter === "bplus" && r.location === "B+ Tree");
    return matchText && matchLoc;
  });
  renderBrowseTable(filtered);
}

async function openBrowsePopup() {
  /* Fetch fresh data */
  try {
    const res = await fetch(`${API}/stats`);
    if (!res.ok) throw new Error();
    const d = await res.json();
    _browseAllRows = buildBrowseRows(d);
  } catch {
    _browseAllRows = buildBrowseRows(lastStats._raw || {});
  }

  const total = _browseAllRows.length;
  browseSubtitle.textContent = total === 0
    ? "No data inserted yet"
    : `${total} key${total !== 1 ? "s" : ""} stored  ·  ${_browseAllRows.filter(r => r.location === "AVL Tree").length} in AVL  ·  ${_browseAllRows.filter(r => r.location === "B+ Tree").length} in B+`;

  if (total === 0) {
    browseNoData.classList.remove("hidden");
    browseTbody.innerHTML = "";
    browseEmpty.classList.add("hidden");
  } else {
    browseNoData.classList.add("hidden");
    browseSearchEl.value = "";
    document.querySelectorAll(".browse-chip").forEach(c =>
      c.classList.toggle("active", c.dataset.filter === "all"));
    renderBrowseTable(_browseAllRows);
  }

  openPopup(browsePopupEl);
}

/* Wire up the button and close actions */
$("browse-btn").addEventListener("click", openBrowsePopup);
["browse-popup-close", "browse-popup-backdrop", "browse-popup-dismiss"].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener("click", () => closePopup(browsePopupEl));
});

/* Filter chips */
document.querySelectorAll(".browse-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".browse-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    applyBrowseFilter();
  });
});

/* Live search input */
browseSearchEl.addEventListener("input", applyBrowseFilter);
