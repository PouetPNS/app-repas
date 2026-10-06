"use strict";

/* ============ SYNCHRONISATION GITHUB (multi-appareils) ============ */
/* Les donnees (repas, notes, courses) sont stockees dans le fichier
   data.json d'un depot GitHub prive. Chaque appareil configure avec le
   jeton peut le lire et l'ecrire.

   Strategie : le plus recent gagne (horodatage updatedAt). Les
   ecritures sont regroupees (debounce) et retentees si hors ligne.
   Cas particulier : si la sync est activee alors que cet appareil ET le
   depot contiennent deja des donnees, les deux sont fusionnes au lieu
   qu'un ecrase l'autre. */

const Sync = (function () {

  const CFG_KEY = "idees-repas.sync";
  const FILE = "data.json";
  const API = "https://api.github.com";
  const PUSH_DELAY = 2500;    // regroupe les modifications rapprochees
  const FOCUS_MIN_GAP = 30000;

  let cfg = loadCfg();
  let hooks = null;           // { getState, applyRemote, persist }
  let sha = null;             // sha du fichier distant (requis pour ecrire)
  let pushTimer = null;
  let pushPending = false;    // des modifications non encore envoyees
  let lastSync = 0;
  let focusBusy = false;

  function loadCfg() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY)) || null; } catch (e) { return null; }
  }
  function saveCfg(c) {
    cfg = c;
    if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c));
    else localStorage.removeItem(CFG_KEY);
  }
  function enabled() { return !!(cfg && cfg.token && cfg.owner && cfg.repo); }

  /* ---------- encodage base64 (contenu accentue) ---------- */

  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(String(b64).replace(/\s/g, ""));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  /* ---------- API GitHub ---------- */

  async function call(method, body) {
    const url = API + "/repos/" + cfg.owner + "/" + cfg.repo + "/contents/" + FILE;
    return fetch(url, {
      method: method,
      headers: {
        "Authorization": "Bearer " + cfg.token,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: body ? JSON.stringify(body) : undefined
    });
  }

  // Etat distant, ou null si le fichier n'existe pas encore.
  async function pull() {
    const res = await call("GET");
    if (res.status === 404) { sha = null; return null; }
    if (!res.ok) throw new Error("GitHub " + res.status);
    const j = await res.json();
    sha = j.sha;
    const s = JSON.parse(b64decode(j.content));
    if (!Array.isArray(s.meals) || !Array.isArray(s.history)) throw new Error("Format inattendu");
    return s;
  }

  async function push() {
    const snap = hooks.getState();
    snap.updatedAt = Date.now();
    hooks.persist();                    // garder l'horodatage local aussi
    const body = {
      message: "sync " + new Date().toISOString(),
      content: b64encode(JSON.stringify(snap)),
      branch: cfg.branch || "main"
    };
    if (sha) body.sha = sha;
    let res = await call("PUT", body);
    if (res.status === 409) {          // le fichier a change entre-temps
      const remote = await pull();
      if (remote && (remote.updatedAt || 0) > snap.updatedAt) {
        hooks.applyRemote(remote);     // le distant etait plus recent : il gagne
        return false;
      }
      body.sha = sha;
      res = await call("PUT", body);
    }
    if (!res.ok) throw new Error("GitHub " + res.status);
    const j = await res.json();
    sha = j.content.sha;
    return true;
  }

  /* ---------- fusion de secours ---------- */

  function normName(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }

  // Fusionne local et distant sans perte : repas/historique dedoublonnes,
  // courses fusionnees par nom, "achete" si l'un des deux l'est.
  function mergeStates(local, remote) {
    const meals = [];
    const byId = {};
    for (const m of (local.meals || [])) if (!byId[m.id]) { byId[m.id] = m; meals.push(m); }
    for (const m of (remote.meals || [])) if (!byId[m.id]) { byId[m.id] = m; meals.push(m); }

    const history = [];
    const seen = new Set();
    for (const h of (local.history || []).concat(remote.history || [])) {
      const k = h.mealId + "|" + h.date + "|" + h.rating;
      if (!seen.has(k)) { seen.add(k); history.push(h); }
    }

    const shop = [];
    const byName = new Map();
    for (const it of (local.shop || []).concat(remote.shop || [])) {
      const k = normName(it.name);
      if (!byName.has(k)) { byName.set(k, it); shop.push(it); }
      else {
        const e = byName.get(k);
        e.srcs = e.srcs || [];
        for (const s of (it.srcs || [])) if (!e.srcs.includes(s)) e.srcs.push(s);
        e.checked = !!e.checked || !!it.checked;
        if (!e.qty) e.qty = it.qty;
      }
    }

    const custom = [];
    const cseen = new Set();
    for (const id of (local.custom || []).concat(remote.custom || [])) {
      if (!cseen.has(id)) { cseen.add(id); custom.push(id); }
    }

    return {
      meals: meals, history: history, shop: shop, custom: custom,
      updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0)
    };
  }

  function hasData(s) {
    return !!((s.history && s.history.length) || (s.shop && s.shop.length) || (s.custom && s.custom.length));
  }

  /* ---------- orchestration ---------- */

  // Un cycle complet : lire le distant, garder le plus recent, sinon pousser.
  async function syncCycle() {
    if (!enabled()) return;
    const remote = await pull();
    const local = hooks.getState();
    if (!remote) {
      if (hasData(local)) await push();          // premier appareil : on envoie tout
    } else if (!local.updatedAt && hasData(local)) {
      hooks.applyRemote(mergeStates(local, remote)); // appareil non sync + depot existant
      await push();
    } else if ((remote.updatedAt || 0) >= (local.updatedAt || 0)) {
      hooks.applyRemote(remote);
    } else {
      await push();                              // local plus recent
    }
    lastSync = Date.now();
    pushPending = false;
  }

  function friendly(e) {
    const m = /GitHub (\d+)/.exec(String(e.message));
    if (m) {
      if (m[1] === "401") return "jeton invalide ou expire (401)";
      if (m[1] === "403") return "acces refuse (403) - verifie la permission « Contents : Read and write » du jeton";
      return "erreur GitHub " + m[1];
    }
    return String(e.message || "erreur reseau (hors ligne ?)");
  }

  function updateStatus(errMsg) {
    const el = document.getElementById("syncStatus");
    if (!el) return;
    if (!enabled()) { el.textContent = "Sync desactivee - les donnees restent dans ce navigateur."; el.style.color = ""; return; }
    if (errMsg) { el.textContent = "Probleme de sync : " + errMsg + ". Nouvel essai a la prochaine action."; el.style.color = "var(--bad)"; return; }
    el.style.color = "";
    if (pushPending) { el.textContent = "Modifications en attente d'envoi (hors ligne ?) - nouvel essai automatique."; return; }
    const t = lastSync ? new Date(lastSync).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "?";
    el.textContent = "Synchronise a " + t + " avec " + cfg.owner + "/" + cfg.repo + ".";
  }

  async function doPush() {
    pushTimer = null;
    if (!enabled() || !pushPending || !hooks) return;
    try {
      await push();
      pushPending = false;
      lastSync = Date.now();
      updateStatus();
    } catch (e) {
      updateStatus(friendly(e));
    }
  }

  function afterSave() {
    if (!enabled()) return;
    pushPending = true;
    updateStatus();
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(doPush, PUSH_DELAY);
  }

  /* ---------- API publique ---------- */

  return {
    enabled: enabled,
    cfg: function () { return cfg; },
    setHooks: function (h) { hooks = h; },
    init: async function () {
      if (!enabled() || !hooks) return;
      try { await syncCycle(); updateStatus(); }
      catch (e) { updateStatus(friendly(e)); }
    },
    configure: async function (c) {
      if (!c || !c.token || !c.owner || !c.repo) return { ok: false, msg: "Les trois champs (pseudo, depot, jeton) sont requis." };
      saveCfg({ token: c.token.trim(), owner: c.owner.trim(), repo: c.repo.trim(), branch: c.branch || "main" });
      sha = null;
      try { await syncCycle(); updateStatus(); return { ok: true, msg: "" }; }
      catch (e) { const m = friendly(e); updateStatus(m); return { ok: false, msg: m }; }
    },
    disable: function () {
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = null;
      pushPending = false;
      saveCfg(null);
      updateStatus();
    },
    afterSave: afterSave,
    syncNow: async function () {
      if (!enabled()) return { ok: false, msg: "Sync non configuree." };
      try { await syncCycle(); updateStatus(); return { ok: true, msg: "" }; }
      catch (e) { const m = friendly(e); updateStatus(m); return { ok: false, msg: m }; }
    },
    onFocus: async function () {
      if (!enabled() || !hooks || focusBusy) return;
      if (!pushPending && Date.now() - lastSync < FOCUS_MIN_GAP) return;
      focusBusy = true;
      try {
        if (pushPending) await doPush();
        else await syncCycle();
        updateStatus();
      } catch (e) {
        updateStatus(friendly(e));
      }
      focusBusy = false;
    }
  };
})();
