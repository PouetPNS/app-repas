"use strict";

/* ==================== ETAT ==================== */

const KEY = "idees-repas.v1";

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    return {
      meals: (Array.isArray(s.meals) && s.meals.length ? s.meals : BASE_MEALS),
      history: Array.isArray(s.history) ? s.history : [],
      shop: Array.isArray(s.shop) ? s.shop : [],
      custom: Array.isArray(s.custom) ? s.custom : [],
      updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : 0
    };
  } catch (e) {
    return defaultState();
  }
}
function defaultState() {
  return { meals: BASE_MEALS.slice(), history: [], shop: [], custom: [], updatedAt: 0 };
}
function persist() {
  localStorage.setItem(KEY, JSON.stringify(state));
}
function save() {
  persist();
  Sync.afterSave();
}

function mealById(id) {
  return state.meals.find(m => m.id === id) || null;
}

/* ==================== LOGIQUE PURE ==================== */

const DAY_MS = 86400000;

// Date du jour en "AAAA-MM-JJ" (local).
function todayKey(d) {
  const x = d ? new Date(d) : new Date();
  const p = n => String(n).padStart(2, "0");
  return x.getFullYear() + "-" + p(x.getMonth() + 1) + "-" + p(x.getDate());
}

// Nombre de jours entiers entre deux clés AAAA-MM-JJ.
function daysBetween(keyA, keyB) {
  const a = new Date(keyA + "T00:00:00");
  const b = new Date(keyB + "T00:00:00");
  return Math.round((b - a) / DAY_MS);
}

// Derniere fois que chaque repas a ete fait, avec sa note.
function lastDoneMap(history) {
  const map = {};
  for (const h of history) {
    const prev = map[h.mealId];
    if (!prev || daysBetween(prev.date, h.date) >= 0) map[h.mealId] = h;
  }
  return map;
}

// Repas eligible = jamais fait, ou dernierement fait il y a assez longtemps selon la note.
function isEligible(mealId, lastDone, todayK) {
  const last = lastDone[mealId];
  if (!last) return true;
  const delay = DELAYS[last.rating] !== undefined ? DELAYS[last.rating] : 14;
  return daysBetween(last.date, todayK) >= delay;
}

// Nutriments couverts sur les N derniers jours.
function coverage(history, todayK, days) {
  const covered = {};
  const counts = {};
  for (const key in NUTRI) { counts[key] = 0; }
  for (const h of history) {
    if (daysBetween(h.date, todayK) < days) {
      const m = mealById(h.mealId);
      if (m) for (const t of (m.tags || [])) if (counts[t] !== undefined) counts[t]++;
    }
  }
  return counts;
}

// PRNG simple, deterministe.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Trie les repas eligibles et retourne les 'count' suggestions a partir de 'offset'.
function rankSuggestions(all, history, lastDone, todayK, seedStr, offset, count) {
  const cov = coverage(history, todayK, 7);
  const rng = mulberry32(hash(seedStr));
  const scored = all
    .filter(m => isEligible(m.id, lastDone, todayK))
    .map(m => {
      let score = rng();
      if (!lastDone[m.id]) score += 0.8;            // jamais teste : priorite
      for (const t of (m.tags || [])) if (cov[t] === 0) score += 0.25; // comble une carence recente
      if (lastDone[m.id] && (lastDone[m.id].rating || 0) === 2) score += 0.15; // on aime : leger bonus
      return { m, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(offset, offset + count).map(s => s.m);
}

// Fusionne les ingredients des repas planifies en une liste de courses.
// Normalise le nom (minuscules sans accents) pour fusionner les doublons.
function buildShoppingList(mealIds, allMeals) {
  const norm = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const map = new Map();
  for (const id of mealIds) {
    const m = allMeals.find(x => x.id === id);
    if (!m || !m.ing) continue;
    for (const pair of m.ing) {
      const name = Array.isArray(pair) ? pair[0] : pair;
      const qty = Array.isArray(pair) ? pair[1] : "";
      const k = norm(name);
      if (!map.has(k)) map.set(k, { name, qty: qty, srcs: [] });
      const e = map.get(k);
      if (qty && !e.qty) e.qty = qty;
      if (!e.srcs.includes(m.nom)) e.srcs.push(m.nom);
    }
  }
  return Array.from(map.values());
}

/* ==================== RENDU ==================== */

const $ = sel => document.querySelector(sel);

function renderHeader(todayK) {
  const n = state.history.length;
  $("#todayLine").textContent = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    + (n ? " - " + n + " repas" + (n > 1 ? "s" : "") + " noté" + (n > 1 ? "s" : "") : "");
  const cov = coverage(state.history, todayK, 7);
  const bar = $("#nutriBar");
  bar.innerHTML = "";
  for (const key in NUTRI) {
    const c = document.createElement("span");
    c.className = "chip" + (cov[key] > 0 ? " on" : "");
    c.textContent = NUTRI[key] + (cov[key] > 0 ? " x" + cov[key] : " manquant");
    bar.appendChild(c);
  }
}

function tagChips(tags) {
  return (tags || []).map(t => '<span class="tag">' + (NUTRI[t] || t) + "</span>").join("");
}

function mealCard(m, todayK) {
  const cov = coverage(state.history, todayK, 7);
  const missing = (m.tags || []).filter(t => cov[t] === 0);
  const bonus = missing.length ? "Comble ce qui manque cette semaine : " + missing.map(t => NUTRI[t]).join(", ") : "";
  const planned = state.shop.some(it => it.srcs && it.srcs.includes(m.nom));
  const div = document.createElement("div");
  div.className = "meal";
  div.innerHTML =
    '<div class="meal-top"><h3></h3><span class="time">' + m.temps + " min</span></div>" +
    '<div class="tags">' + tagChips(m.tags) + "</div>" +
    (bonus ? '<div class="bonus"></div>' : "") +
    '<details><summary>Ingrédients et préparation</summary>' +
      '<div class="ing"></div>' +
      (m.etapes ? '<div class="steps"></div>' : "") +
    "</details>" +
    '<div class="actions">' +
      '<button class="btn badd" data-act="rate" data-r="0">Pas ouf</button>' +
      '<button class="btn mid" data-act="rate" data-r="1">Ok</button>' +
      '<button class="btn good" data-act="rate" data-r="2">J\'aime</button>' +
      '<button class="btn ghost" data-act="shop">' + (planned ? "Ajouté aux courses" : "+ Courses") + "</button>" +
    "</div>";
  div.querySelector("h3").textContent = m.nom;
  if (bonus) div.querySelector(".bonus").textContent = bonus;
  div.querySelector(".ing").textContent = m.ing.map(p => "- " + p[0] + (p[1] ? " : " + p[1] : "")).join("\n");
  div.querySelector(".ing").style.whiteSpace = "pre-line";
  const stepsEl = div.querySelector(".steps");
  if (stepsEl && m.etapes) { stepsEl.textContent = m.etapes; }

  div.addEventListener("click", e => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "rate") {
      rateMeal(m.id, parseInt(btn.dataset.r, 10), todayK);
    } else if (btn.dataset.act === "shop") {
      addMealToShop(m, todayK);
    }
  });
  return div;
}

function rateMeal(id, rating, todayK) {
  state.history.push({ mealId: id, rating: rating, date: todayKey() });
  // retirer le repas de la liste de courses s'il y etait
  const m = mealById(id);
  if (m) state.shop = state.shop.filter(it => !(it.srcs || []).includes(m.nom));
  save();
  renderAll(todayK);
  const delay = DELAYS[rating];
  const div = document.createElement("div");
  div.className = "done-note";
  div.textContent = "Noté « " + RATES[rating] + " » - cette idée reviendra dans " + delay + " jours.";
  const card = Array.from(document.querySelectorAll("#ideaList .meal h3"))
    .find(h => h.textContent === (m ? m.nom : ""));
  if (card) card.closest(".meal").replaceWith(div);
}

function addMealToShop(m, todayK) {
  const items = buildShoppingList([m.id], state.meals);
  for (const it of items) {
    const existing = state.shop.find(s => normName(s.name) === normName(it.name));
    if (existing) {
      if (!existing.srcs.includes(m.nom)) existing.srcs.push(m.nom);
    } else {
      state.shop.push({ name: it.name, qty: it.qty, checked: false, srcs: [m.nom] });
    }
  }
  save();
  renderAll(todayK);
}

let ideaOffset = 0;
function renderIdeas(todayK) {
  const lastDone = lastDoneMap(state.history);
  const ideas = rankSuggestions(state.meals, state.history, lastDone, todayK, todayKey(), ideaOffset, 5);
  const list = $("#ideaList");
  list.innerHTML = "";
  if (!ideas.length) {
    list.innerHTML = '<div class="empty">Aucune idée disponible pour le moment :<br>toutes tes idées ont été faites récemment.<br>Reviens demain, ou ajoute la tienne dans l\'onglet Historique.</div>';
    return;
  }
  for (const m of ideas) list.appendChild(mealCard(m, todayK));
  $("#moreBtn").onclick = () => { ideaOffset += 5; renderIdeas(todayK); };
}

function normName(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function renderShop(todayK) {
  const box = $("#shopList");
  box.innerHTML = "";
  const items = state.shop;
  const dot = $("#shopDot");
  const unchecked = items.filter(i => !i.checked).length;
  dot.hidden = unchecked === 0;
  dot.textContent = unchecked;
  if (!items.length) {
    box.innerHTML = '<div class="empty">Ta liste est vide.<br>Ajoute des repas depuis l\'onglet Idées avec le bouton « + Courses ».</div>';
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const div = document.createElement("div");
    div.className = "shop-item" + (it.checked ? " bought" : "");
    div.innerHTML =
      '<input type="checkbox"' + (it.checked ? " checked" : "") + ">" +
      '<div class="name">' + escapeHtml(it.name) +
        (it.qty ? ' <span class="qty">' + escapeHtml(it.qty) + "</span>" : "") +
        '<span class="src">pour ' + (it.srcs || []).map(escapeHtml).join(", ") + "</span></div>";
    div.querySelector("input").addEventListener("change", () => {
      it.checked = !it.checked;
      save();
      renderShop(todayK);
    });
    box.appendChild(div);
  }
}

function renderHistory(todayK) {
  // stats
  const counts = [0, 0, 0];
  for (const h of state.history) if (counts[h.rating] !== undefined) counts[h.rating]++;
  $("#statsBox").innerHTML =
    '<div class="stats">' +
      '<div class="stat"><div class="n">' + counts[2] + '</div><div class="l">J\'aime</div></div>' +
      '<div class="stat"><div class="n">' + counts[1] + '</div><div class="l">Ok</div></div>' +
      '<div class="stat"><div class="n">' + counts[0] + '</div><div class="l">Pas ouf</div></div>' +
    "</div>";

  const list = $("#histList");
  list.innerHTML = "";
  if (!state.history.length) {
    list.innerHTML = '<div class="empty">Rien encore. Note ton premier repas dans l\'onglet Idées.</div>';
    return;
  }
  const sorted = state.history.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const h of sorted.slice(0, 40)) {
    const m = mealById(h.mealId);
    const div = document.createElement("div");
    div.className = "hist-item";
    div.innerHTML =
      '<div><div class="hname"></div><span class="date">' + h.date + "</span></div>" +
      '<span class="rate r' + h.rating + '">' + RATES[h.rating] + "</span>" +
      "<button title=\"Supprimer\">x</button>";
    const nameEl = div.querySelector(".hname");
    nameEl.style.fontWeight = "600";
    nameEl.style.fontSize = "14px";
    nameEl.textContent = m ? m.nom : "(repas supprimé)";
    div.querySelector("button").onclick = () => {
      state.history = state.history.filter(x => x !== h);
      save();
      renderAll(todayK);
    };
    list.appendChild(div);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderForm() {
  const box = $("#f-tags");
  if (box.dataset.done) return;
  for (const key in NUTRI) {
    const lab = document.createElement("label");
    const inp = document.createElement("input");
    inp.type = "checkbox"; inp.value = key;
    lab.appendChild(inp);
    lab.appendChild(document.createTextNode(NUTRI[key]));
    box.appendChild(lab);
  }
  box.dataset.done = "1";
}

function renderAll(todayK) {
  renderHeader(todayK);
  renderIdeas(todayK);
  renderShop(todayK);
  renderHistory(todayK);
  renderForm();
}

/* ==================== THEME ==================== */

const THEME_KEY = "idees-repas.theme";
const THEME_ORDER = ["auto", "dark", "light"];
const THEME_LABELS = { auto: "Auto", dark: "Sombre", light: "Clair" };

function themePref() {
  return localStorage.getItem(THEME_KEY) || "auto";
}
function isDarkNow() {
  const p = themePref();
  if (p !== "auto") return p === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function applyTheme() {
  const p = themePref();
  if (p === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", p);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isDarkNow() ? "#171513" : "#2e7d5b");
  $("#themeBtn").textContent = "Thème : " + THEME_LABELS[p];
}

$("#themeBtn").onclick = () => {
  const next = THEME_ORDER[(THEME_ORDER.indexOf(themePref()) + 1) % THEME_ORDER.length];
  localStorage.setItem(THEME_KEY, next);
  applyTheme();
};
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (themePref() === "auto") applyTheme();
});

/* ==================== EVENEMENTS ==================== */

document.querySelectorAll("nav button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    $("#page-ideas").hidden = tab !== "ideas";
    $("#page-shop").hidden = tab !== "shop";
    $("#page-history").hidden = tab !== "history";
    window.scrollTo(0, 0);
  };
});

$("#clearBought").onclick = () => {
  state.shop = state.shop.filter(it => !it.checked);
  save(); renderAll(todayKey());
};
$("#clearAllShop").onclick = () => {
  if (confirm("Vider toute la liste de courses ?")) {
    state.shop = [];
    save(); renderAll(todayKey());
  }
};

$("#mealForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("#f-name").value.trim();
  if (!name) return;
  const ing = $("#f-ing").value.split("\n").map(l => l.trim()).filter(Boolean)
    .map(l => {
      const i = l.indexOf(",");
      if (i === -1) return [l, ""];
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    });
  const tags = Array.from(document.querySelectorAll("#f-tags input:checked")).map(i => i.value);
  const id = "custom-" + Date.now();
  state.custom.push(id);
  state.meals.push({
    id: id, nom: name,
    temps: parseInt($("#f-time").value, 10) || 10,
    tags: tags, ing: ing.length ? ing : [["(ingrédients non précisés)", ""]],
    etapes: $("#f-steps").value.trim() || ""
  });
  save();
  $("#mealForm").reset();
  $("#f-time").value = 10;
  renderAll(todayKey());
  alert("Idée « " + name + " » ajoutée. Tu la verras bientôt dans les suggestions.");
});

$("#exportBtn").onclick = () => {
  const blob = new Blob([JSON.stringify({ meals: state.meals, history: state.history, shop: state.shop, custom: state.custom }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "mes-idees-repas-" + todayKey() + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
};
$("#importBtn").onclick = () => $("#importFile").click();
$("#importFile").addEventListener("change", e => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const s = JSON.parse(reader.result);
      if (!Array.isArray(s.history) || !Array.isArray(s.meals)) throw new Error("format");
      state = { meals: s.meals, history: s.history, shop: s.shop || [], custom: s.custom || [], updatedAt: Date.now() };
      save();
      renderAll(todayKey());
      alert("Données importées.");
    } catch (err) {
      alert("Fichier invalide.");
    }
  };
  reader.readAsText(f);
  e.target.value = "";
});

/* ==================== EVENEMENTS SYNC ==================== */

$("#syncEnable").onclick = async () => {
  const r = await Sync.configure({
    owner: $("#sync-owner").value.trim(),
    repo: $("#sync-repo").value.trim(),
    token: $("#sync-token").value.trim()
  });
  if (r.ok) {
    $("#sync-token").value = "";
    renderAll(todayKey());
  } else {
    alert("Sync impossible : " + r.msg + ".");
  }
};
$("#syncNowBtn").onclick = async () => {
  const r = await Sync.syncNow();
  if (!r.ok) alert("Sync impossible : " + r.msg + ".");
};
$("#syncDisable").onclick = () => { Sync.disable(); };

// Lien d'installation pour un autre appareil : URL + identifiants dans
// le fragment (#sync=...), qui n'est jamais envoye au serveur.
// ATTENTION : ce lien contient le jeton, il est secret.
$("#syncShare").onclick = async () => {
  const c = Sync.cfg();
  if (!c) { alert("Active la sync d'abord."); return; }
  if (location.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(location.hostname)) {
    alert("Ouvre l'app depuis son adresse web (GitHub Pages) pour utiliser le lien.");
    return;
  }
  const link = location.origin + location.pathname + "#sync=" + btoa(c.owner + "|" + c.repo + "|" + c.token);
  try {
    await navigator.clipboard.writeText(link);
    alert("Lien copie. Ouvre-le sur ton telephone, la sync s'y activera toute seule.\nGarde-le secret : il contient le jeton.");
  } catch (e) {
    prompt("Copie ce lien (secret, il contient le jeton) :", link);
  }
};

function fillSyncForm() {
  const c = Sync.cfg();
  if (c) {
    $("#sync-owner").value = c.owner || "";
    $("#sync-repo").value = c.repo || "";
  }
}

// Configure la sync automatiquement si l'app a ete ouverte via un lien
// d'installation. Retourne la config, ou null.
function setupFromLink() {
  const m = /#sync=([A-Za-z0-9+/=]+)/.exec(location.hash);
  if (!m) return null;
  history.replaceState(null, "", location.pathname + location.search);
  try {
    const parts = atob(m[1]).split("|");
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
    return { owner: parts[0], repo: parts[1], token: parts[2] };
  } catch (e) {
    return null;
  }
}

window.addEventListener("focus", () => Sync.onFocus());
document.addEventListener("visibilitychange", () => { if (!document.hidden) Sync.onFocus(); });

/* ==================== DEMARRAGE ==================== */

Sync.setHooks({
  getState: () => state,
  applyRemote: s => { state = s; persist(); renderAll(todayKey()); },
  persist: persist
});

const linkCfg = setupFromLink();

Sync.init().then(async () => {
  renderAll(todayKey());
  fillSyncForm();
  applyTheme();
  if (linkCfg && confirm("Configurer la synchronisation sur cet appareil ?")) {
    const r = await Sync.configure(linkCfg);
    if (r.ok) renderAll(todayKey());
    else alert("Sync impossible : " + r.msg + ".");
  }
});

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "127.0.0.1" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
