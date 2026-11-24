// Trhy – přehled a grafy titulů ze soukromého repozitáře s daty.

import { Api, ApiError } from "./api.js";
import { Graf } from "./chart.js";
import { Sprava } from "./manage.js";
import {
  hodnota, zmenaAbs, zmenaHlavni, procenta, smer, datum, datumKratce, casRelativne, esc, jeSazba,
} from "./format.js";

const WORKFLOW = "update.yml";
const VYCHOZI_REPO = "jikadl/trhy-data";
const OBDOBI = ["1T", "1M", "3M", "6M", "YTD", "1R", "3R", "5R", "Max"];

const $ = sel => document.querySelector(sel);
const ls = {
  get(k, d = null) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

const S = {
  api: null,
  conf: null,
  confSha: null,
  summary: null,
  rady: new Map(),       // id → Map(rok → [[d, v], …])
  vybrany: null,
  obdobi: ls.get("trhy.obdobi", "1R"),
  vlastni: null,         // { od, do }
  graf: null,
};

// ---------------------------------------------------------------- nastavení

function nastaveni() {
  return { token: ls.get("trhy.token", ""), repo: ls.get("trhy.repo", VYCHOZI_REPO) };
}

function importOdkazu() {
  const m = /[#&]nastaveni=([^&]+)/.exec(location.hash);
  if (!m) return;
  try {
    const n = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
    if (n.token) ls.set("trhy.token", n.token);
    if (n.repo) ls.set("trhy.repo", n.repo);
    zprava("Nastavení z odkazu uloženo.", "ok", 4000);
  } catch {
    zprava("Odkaz s nastavením je poškozený.", "err");
  }
  history.replaceState(null, "", location.pathname + location.search);
}

function otevriNastaveni() {
  const n = nastaveni();
  $("#setToken").value = n.token;
  $("#setRepo").value = n.repo;
  $("#shareInfo").hidden = true;
  $("#dlgSettings").showModal();
}

function initNastaveni() {
  $("#btnSettings").addEventListener("click", otevriNastaveni);
  $("#dlgSettings").addEventListener("close", () => {
    if ($("#dlgSettings").returnValue !== "ok") return;
    ls.set("trhy.token", $("#setToken").value.trim());
    ls.set("trhy.repo", $("#setRepo").value.trim() || VYCHOZI_REPO);
    start();
  });
  $("#btnShare").addEventListener("click", async () => {
    const n = { token: $("#setToken").value.trim(), repo: $("#setRepo").value.trim() || VYCHOZI_REPO };
    const kod = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(n)))));
    const url = `${location.origin}${location.pathname}#nastaveni=${kod}`;
    const info = $("#shareInfo");
    info.hidden = false;
    try {
      await navigator.clipboard.writeText(url);
      info.textContent = "Odkaz zkopírován. Otevřete ho v mobilu – nastavení se uloží a z adresy hned zmizí. Obsahuje token, posílejte ho jen sobě.";
    } catch {
      info.textContent = url;
    }
  });
}

// ---------------------------------------------------------------- stav / zprávy

let zpravaTimer = null;
function zprava(text, typ = "info", trvani = 0) {
  const el = $("#status");
  clearTimeout(zpravaTimer);
  if (!text) { el.hidden = true; return; }
  el.className = `status ${typ}`;
  el.innerHTML = text;
  el.hidden = false;
  if (trvani) zpravaTimer = setTimeout(() => { el.hidden = true; }, trvani);
}

function chybaApi(e) {
  if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
    return `GitHub odmítl přístup (${e.status}: ${esc(e.message)}). Zkontrolujte token v <a href="#" data-akce="nastaveni">nastavení</a>.`;
  }
  if (e instanceof ApiError && e.status === 404) {
    return `Repozitář nebo soubor nenalezen (${esc(e.message)}). Zkontrolujte název repozitáře a oprávnění tokenu.`;
  }
  return `Chyba: ${esc(e.message || e)}`;
}

// ---------------------------------------------------------------- data

async function nactiZaklad() {
  const [confTxt, sumTxt] = await Promise.all([
    S.api.file("instruments.json"),
    S.api.raw("summary.json", { fresh: true }),
  ]);
  S.conf = JSON.parse(confTxt.text);
  S.confSha = confTxt.sha;
  S.summary = sumTxt ? JSON.parse(sumTxt) : { tituly: {} };
  S.summary.nacteno = Date.now();
}

function parseCsv(txt) {
  const out = [];
  for (const r of (txt || "").split("\n").slice(1)) {
    const i = r.indexOf(",");
    if (i > 0) out.push([r.slice(0, i), Number(r.slice(i + 1))]);
  }
  return out;
}

async function nactiRoky(id, odRoku, doRoku) {
  if (!S.rady.has(id)) S.rady.set(id, new Map());
  const cache = S.rady.get(id);
  const chybi = [];
  for (let r = odRoku; r <= doRoku; r++) if (!cache.has(r)) chybi.push(r);
  await Promise.all(chybi.map(async r => {
    const txt = await S.api.raw(`data/${id}/${r}.csv`, { fresh: r === doRoku });
    cache.set(r, parseCsv(txt));
  }));
  const body = [];
  for (let r = odRoku; r <= doRoku; r++) body.push(...(cache.get(r) || []));
  return body;
}

// ---------------------------------------------------------------- období

const posunMesic = (iso, m) => {
  const d = new Date(iso + "T00:00:00Z");
  const den = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + m);
  d.setUTCDate(Math.min(den, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return d.toISOString().slice(0, 10);
};
const posunDen = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

function rozsahObdobi(obd, posledni, prvni) {
  if (S.vlastni) return S.vlastni;
  const od = {
    "1T": posunDen(posledni, -7),
    "1M": posunMesic(posledni, -1),
    "3M": posunMesic(posledni, -3),
    "6M": posunMesic(posledni, -6),
    "YTD": `${Number(posledni.slice(0, 4)) - 1}-12-31`,
    "1R": posunMesic(posledni, -12),
    "3R": posunMesic(posledni, -36),
    "5R": posunMesic(posledni, -60),
    "Max": prvni,
  }[obd] || posunMesic(posledni, -12);
  return { od, do: posledni };
}

// ---------------------------------------------------------------- seznam

function spark(t, s) {
  const h = s?.spark;
  if (!h || h.length < 2) return `<svg class="spark"></svg>`;
  const w = 72, v = 26;
  const min = Math.min(...h), max = Math.max(...h);
  const rng = max - min || 1;
  const pts = h.map((x, i) => `${(i / (h.length - 1) * w).toFixed(1)},${(v - 2 - (x - min) / rng * (v - 4)).toFixed(1)}`).join(" ");
  const tr = smer(h[h.length - 1] - h[0]);
  return `<svg class="spark ${tr}" viewBox="0 0 ${w} ${v}" preserveAspectRatio="none"><title>Vývoj za 3 měsíce</title><polyline points="${pts}"/></svg>`;
}

function vykresliSeznam() {
  const el = $("#list");
  const skupiny = S.conf.skupiny || [];
  let html = "";
  for (const g of skupiny) {
    const tituly = S.conf.tituly.filter(t => t.skupina === g.id);
    if (!tituly.length) continue;
    html += `<div class="group"><h3>${esc(g.nazev)}</h3>`;
    for (const t of tituly) {
      const s = S.summary.tituly?.[t.id] || {};
      const z = s.zmeny?.["1D"];
      const chyba = s.stav?.chyba;
      const ath = s.odAth && s.posledni ? (jeSazba(t) ? `ATH ${zmenaAbs(t, s.odAth.abs)}` : `ATH ${procenta(s.odAth.rel, 1)}`) : "";
      html += `
        <a class="row${t.id === S.vybrany ? " active" : ""}" href="#t=${encodeURIComponent(t.id)}" data-id="${esc(t.id)}">
          <div class="r-name">
            <span class="r-title">${esc(t.nazev)}${chyba ? ` <span class="badge err" title="${esc(chyba)}">!</span>` : ""}</span>
            <small>${s.posledni ? datumKratce(s.posledni.d) : "bez dat"}${ath ? ` · ${ath}` : ""}</small>
          </div>
          ${spark(t, s)}
          <div class="r-val">
            <span>${s.posledni ? hodnota(t, s.posledni.v) : "–"}</span>
            <small class="${smer(z?.abs)}">${zmenaHlavni(t, z)}</small>
          </div>
        </a>`;
    }
    html += `</div>`;
  }
  // tituly bez existující skupiny
  const bez = S.conf.tituly.filter(t => !skupiny.some(g => g.id === t.skupina));
  if (bez.length) html += `<div class="group"><h3>Ostatní</h3>${bez.map(t => `<a class="row" href="#t=${encodeURIComponent(t.id)}" data-id="${esc(t.id)}"><div class="r-name"><span class="r-title">${esc(t.nazev)}</span></div></a>`).join("")}</div>`;
  el.innerHTML = html || `<div class="empty">Seznam titulů je prázdný. Přidejte je ve <a href="#sprava">správě titulů</a>.</div>`;
}

// ---------------------------------------------------------------- detail

function kostraDetailu() {
  const el = $("#detail");
  if (el.querySelector(".chart")) return;
  el.innerHTML = `
    <div class="d-head">
      <button class="back" type="button" aria-label="Zpět na seznam">‹</button>
      <div class="d-title"><h1></h1><div class="muted d-sub"></div></div>
      <div class="d-price"><div class="big"></div><div class="chg"></div><div class="muted small d-date"></div></div>
    </div>
    <div class="periods">
      ${OBDOBI.map(o => `<button type="button" data-obd="${o}">${o}</button>`).join("")}
      <span class="custom">
        <input type="date" id="od" aria-label="Od"><span>–</span><input type="date" id="do" aria-label="Do">
      </span>
    </div>
    <div class="d-period"></div>
    <div class="chart-wrap">
      <div class="chart"></div>
      <div class="measure" hidden></div>
    </div>
    <div class="hint small">Tažením myší nebo prstem v grafu změříte změnu mezi dvěma body. Kolečkem myši přiblížíte.</div>
    <div class="stats"></div>
    <div class="d-foot muted small"></div>`;
  S.graf = new Graf(el.querySelector(".chart"), el.querySelector(".measure"));
  el.querySelector(".back").addEventListener("click", () => { location.hash = ""; });
  el.querySelector(".periods").addEventListener("click", e => {
    const b = e.target.closest("button[data-obd]");
    if (!b) return;
    S.obdobi = b.dataset.obd;
    S.vlastni = null;
    ls.set("trhy.obdobi", S.obdobi);
    vykresliGraf();
  });
  const zmenaData = () => {
    const od = $("#od").value, d = $("#do").value;
    if (!od || !d || od >= d) return;
    S.vlastni = { od, do: d };
    vykresliGraf();
  };
  $("#od").addEventListener("change", zmenaData);
  $("#do").addEventListener("change", zmenaData);
  el.querySelector(".measure").addEventListener("click", e => {
    if (e.target.closest(".m-close")) S.graf.zrusMereni();
  });
}

function radekZmeny(t, nazev, z) {
  if (!z) return `<tr><th>${nazev}</th><td colspan="2" class="muted">–</td></tr>`;
  return `<tr><th>${nazev}</th>
    <td class="${smer(z.abs)}">${zmenaHlavni(t, z)}</td>
    <td class="muted">${jeSazba(t) ? `od ${hodnota(t, z.v)}` : zmenaAbs(t, z.abs)}</td></tr>`;
}

function vykresliDetail() {
  const t = S.conf?.tituly.find(x => x.id === S.vybrany);
  if (!t) {
    $("#detail").innerHTML = `<div class="empty">Vyberte titul ze seznamu.</div>`;
    S.graf = null;
    return;
  }
  kostraDetailu();
  const el = $("#detail");
  const s = S.summary.tituly?.[t.id] || {};
  const z = s.zmeny?.["1D"];
  el.querySelector("h1").textContent = t.nazev;
  el.querySelector(".d-sub").textContent = [t.popis, t.isin, t.jednotka].filter(Boolean).join(" · ");
  el.querySelector(".big").textContent = s.posledni ? hodnota(t, s.posledni.v) : "–";
  const chg = el.querySelector(".chg");
  chg.className = `chg ${smer(z?.abs)}`;
  chg.textContent = z ? `${zmenaHlavni(t, z)}${jeSazba(t) ? "" : ` (${zmenaAbs(t, z.abs)})`} za den` : "";
  el.querySelector(".d-date").textContent = s.posledni ? `k ${datum(s.posledni.d)}` : "";

  const ath = s.ath, odAth = s.odAth;
  el.querySelector(".stats").innerHTML = `
    <div class="card">
      <h4>Změny</h4>
      <table>
        ${radekZmeny(t, "1 den", s.zmeny?.["1D"])}
        ${radekZmeny(t, "1 týden", s.zmeny?.["1T"])}
        ${radekZmeny(t, "1 měsíc", s.zmeny?.["1M"])}
        ${radekZmeny(t, "3 měsíce", s.zmeny?.["3M"])}
        ${radekZmeny(t, "6 měsíců", s.zmeny?.["6M"])}
        ${radekZmeny(t, "od začátku roku", s.zmeny?.["YTD"])}
        ${radekZmeny(t, "1 rok", s.zmeny?.["1R"])}
        ${radekZmeny(t, "3 roky", s.zmeny?.["3R"])}
        ${radekZmeny(t, "5 let", s.zmeny?.["5R"])}
      </table>
    </div>
    <div class="card">
      <h4>Maxima a minima</h4>
      <table>
        <tr><th>ATH</th><td>${ath ? hodnota(t, ath.v) : "–"}</td><td class="muted">${ath ? datum(ath.d) : ""}</td></tr>
        <tr><th>od ATH</th><td class="${smer(odAth?.abs)}">${odAth ? (jeSazba(t) ? zmenaAbs(t, odAth.abs) : procenta(odAth.rel)) : "–"}</td><td class="muted">${odAth && !jeSazba(t) ? zmenaAbs(t, odAth.abs) : ""}</td></tr>
        <tr><th>52T max</th><td>${s.max52 ? hodnota(t, s.max52.v) : "–"}</td><td class="muted">${s.max52 ? datum(s.max52.d) : ""}</td></tr>
        <tr><th>52T min</th><td>${s.min52 ? hodnota(t, s.min52.v) : "–"}</td><td class="muted">${s.min52 ? datum(s.min52.d) : ""}</td></tr>
        <tr><th>minimum</th><td>${s.atl ? hodnota(t, s.atl.v) : "–"}</td><td class="muted">${s.atl ? datum(s.atl.d) : ""}</td></tr>
      </table>
      <p class="muted small">ATH a minimum z dostupné historie od ${datum(s.prvni)}.</p>
    </div>`;

  const st = s.stav || {};
  el.querySelector(".d-foot").innerHTML = [
    `Zdroj: ${esc(st.pouzity || t.zdroj?.typ || "")}${st.mena ? ` (${esc(st.mena)})` : ""}`,
    st.aktualizovano ? `aktualizováno ${casRelativne(st.aktualizovano)}` : "",
    s.pocet ? `${s.pocet.toLocaleString("cs-CZ")} hodnot` : "",
    st.chyba ? `<span class="err">Chyba posledního stažení: ${esc(st.chyba)}</span>` : "",
    st.varovani ? `<span class="warn">${esc(st.varovani)}</span>` : "",
  ].filter(Boolean).join(" · ");

  vykresliGraf();
}

let grafToken = 0;
async function vykresliGraf() {
  const t = S.conf?.tituly.find(x => x.id === S.vybrany);
  const s = S.summary.tituly?.[t?.id];
  const el = $("#detail");
  el.querySelectorAll(".periods button").forEach(b => b.classList.toggle("on", !S.vlastni && b.dataset.obd === S.obdobi));
  if (!t || !s?.posledni) {
    el.querySelector(".d-period").textContent = "Pro tento titul zatím nejsou data.";
    S.graf?.zobraz(t || {}, []);
    return;
  }
  const { od, do: doD } = rozsahObdobi(S.obdobi, s.posledni.d, s.prvni);
  $("#od").value = od < s.prvni ? s.prvni : od;
  $("#do").value = doD;
  $("#od").min = $("#do").min = s.prvni;
  $("#od").max = $("#do").max = s.posledni.d;

  const muj = ++grafToken;
  el.querySelector(".d-period").innerHTML = `<span class="muted">Načítám…</span>`;
  let body;
  try {
    body = await nactiRoky(t.id, Math.max(Number(od.slice(0, 4)), Number(s.prvni.slice(0, 4))), Number(doD.slice(0, 4)));
  } catch (e) {
    if (muj === grafToken) el.querySelector(".d-period").innerHTML = `<span class="err">${chybaApi(e)}</span>`;
    return;
  }
  if (muj !== grafToken) return;
  // první bod = poslední hodnota k datu "od" (aby změna za období seděla)
  let i0 = body.findIndex(b => b[0] > od);
  if (i0 < 0) i0 = body.length;
  if (i0 > 0 && body[i0 - 1][0] <= od) i0 -= 1;
  const vyber = body.slice(i0).filter(b => b[0] <= doD);
  try {
    if (typeof echarts === "undefined") throw new Error("knihovna grafů (ECharts) se nenačetla – zkuste obnovit stránku");
    S.graf.zobraz(t, vyber);
  } catch (e) {
    el.querySelector(".d-period").innerHTML = `<span class="err">Graf nelze vykreslit: ${esc(e.message || e)}</span>`;
    return;
  }

  if (vyber.length >= 2) {
    const a = vyber[0], b = vyber[vyber.length - 1];
    const abs = b[1] - a[1], rel = a[1] ? b[1] / a[1] - 1 : null;
    const hl = jeSazba(t) ? zmenaAbs(t, abs) : procenta(rel);
    el.querySelector(".d-period").innerHTML =
      `Za období ${datum(a[0])} – ${datum(b[0])}: <b class="${smer(abs)}">${hl}</b>` +
      (jeSazba(t) ? "" : ` <span class="muted">(${zmenaAbs(t, abs)})</span>`);
  } else {
    el.querySelector(".d-period").textContent = "V tomto období nejsou data.";
  }
}

// ---------------------------------------------------------------- živé kurzy (TradingView)

let liveKlic = "";
function vykresliLive() {
  const symboly = (S.conf?.tituly || []).filter(t => t.tv).map(t => ({ proName: t.tv, title: t.tvNazev || t.nazev }));
  const box = $("#live");
  const klic = JSON.stringify(symboly) + tema();
  if (klic === liveKlic) return;
  liveKlic = klic;
  box.hidden = !symboly.length;
  const w = $("#liveWidget");
  w.innerHTML = "";
  if (!symboly.length) return;
  const cont = document.createElement("div");
  cont.className = "tradingview-widget-container";
  cont.innerHTML = `<div class="tradingview-widget-container__widget"></div>`;
  const sc = document.createElement("script");
  sc.src = "https://s3.tradingview.com/external-embedding/embed-widget-tickers.js";
  sc.async = true;
  sc.textContent = JSON.stringify({
    symbols: symboly,
    showSymbolLogo: false,
    isTransparent: true,
    displayMode: "adaptive",
    colorTheme: tema(),
    locale: "en",
  });
  cont.appendChild(sc);
  w.appendChild(cont);
}

const tema = () => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

// ---------------------------------------------------------------- aktualizace na požádání

let sledovani = null;
async function aktualizujTed() {
  const btn = $("#btnRefresh");
  if (btn.classList.contains("spin")) return;
  try {
    const pred = (await S.api.runs(WORKFLOW, 1))[0]?.id || 0;
    await S.api.dispatch(WORKFLOW);
    btn.classList.add("spin");
    zprava("Stahování dat spuštěno, obvykle trvá 2–4 minuty…", "info");
    const t0 = Date.now();
    clearInterval(sledovani);
    sledovani = setInterval(async () => {
      try {
        const run = (await S.api.runs(WORKFLOW, 3)).find(r => r.id > pred);
        if (run?.status === "completed") {
          clearInterval(sledovani);
          btn.classList.remove("spin");
          if (run.conclusion === "success") {
            zprava("Data aktualizována.", "ok", 4000);
            await obnovData();
          } else {
            zprava(`Stahování skončilo chybou (${esc(run.conclusion)}). <a href="${run.html_url}" target="_blank" rel="noopener">Detail v GitHub Actions</a>`, "err");
          }
        } else if (Date.now() - t0 > 15 * 60e3) {
          clearInterval(sledovani);
          btn.classList.remove("spin");
          zprava("Stahování trvá neobvykle dlouho, zkuste obnovit stránku později.", "warn");
        }
      } catch {}
    }, 10000);
  } catch (e) {
    btn.classList.remove("spin");
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
      zprava(`Spuštění aktualizace se nepovedlo (${e.status}). Token potřebuje oprávnění <b>Actions: Read and write</b>.`, "err");
    } else zprava(chybaApi(e), "err");
  }
}

async function obnovData() {
  S.rady.clear();
  await nactiZaklad();
  vykresli();
}

// ---------------------------------------------------------------- směrování

const sprava = new Sprava({
  getApi: () => S.api,
  getConf: () => ({ conf: S.conf, sha: S.confSha, summary: S.summary }),
  onUlozeno: async (conf, sha) => {
    S.conf = conf;
    S.confSha = sha;
    vykresliSeznam();
    vykresliLive();
  },
  zprava,
});

function trasa() {
  const h = location.hash;
  if (h.startsWith("#sprava")) return { view: "sprava" };
  const m = /^#t=([^&]+)/.exec(h);
  return { view: "main", id: m ? decodeURIComponent(m[1]) : null };
}

function vykresli() {
  if (!S.conf) return;
  const r = trasa();
  $("#viewMain").hidden = r.view !== "main";
  $("#viewManage").hidden = r.view !== "sprava";
  $("#dataInfo").textContent = S.summary?.generovano ? `data ${casRelativne(S.summary.generovano)}` : "";
  vykresliLive();
  if (r.view === "sprava") {
    sprava.vykresli($("#viewManage"));
    return;
  }
  const siroky = matchMedia("(min-width: 900px)").matches;
  S.vybrany = r.id || (siroky ? S.conf.tituly[0]?.id : null);
  document.body.classList.toggle("show-detail", !!r.id);
  vykresliSeznam();
  vykresliDetail();
  if (r.id) $("#list .row.active")?.scrollIntoView({ block: "nearest" });
}

// ---------------------------------------------------------------- start

async function start() {
  const n = nastaveni();
  if (!n.token) {
    zprava(`Pro načtení dat zadejte GitHub token v <a href="#" data-akce="nastaveni">nastavení</a>.`, "warn");
    $("#list").innerHTML = "";
    return;
  }
  S.api = new Api(n.token, n.repo);
  zprava("Načítám…", "info");
  try {
    await nactiZaklad();
    zprava("");
    vykresli();
  } catch (e) {
    zprava(chybaApi(e), "err");
  }
}

importOdkazu();
initNastaveni();
document.addEventListener("click", e => {
  const a = e.target.closest("[data-akce='nastaveni']");
  if (a) { e.preventDefault(); otevriNastaveni(); }
});
$("#btnRefresh").addEventListener("click", () => S.api ? aktualizujTed() : otevriNastaveni());
window.addEventListener("hashchange", () => {
  if (/[#&]nastaveni=/.test(location.hash)) { importOdkazu(); start(); return; }
  vykresli();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { liveKlic = ""; vykresli(); });
document.addEventListener("visibilitychange", () => {
  // po návratu do aplikace (mobil) obnovit, pokud jsou data starší než 30 min
  if (document.visibilityState === "visible" && S.api && S.summary?.nacteno && Date.now() - S.summary.nacteno > 30 * 60e3) obnovData();
});

window.addEventListener("load", () => start());
