// Správa titulů: skupiny, pořadí, vlastní názvy, přidání a odebrání.
// Změny se ukládají do instruments.json v repozitáři s daty; uložení spustí stažení dat.

import { esc } from "./format.js";

const TYPY = {
  yahoo: "Yahoo Finance",
  stooq: "Stooq",
  cnb: "Kurz ČNB",
  patria: "Patria (sazba)",
  odvozeny: "Odvozený (výpočet)",
};

const klon = o => JSON.parse(JSON.stringify(o));

function slug(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "titul";
}

function nastav(obj, cesta, v) {
  const k = cesta.split(".");
  let o = obj;
  for (const x of k.slice(0, -1)) o = o[x] ??= {};
  const posl = k[k.length - 1];
  if (v === "" || v == null) delete o[posl]; else o[posl] = v;
}

function ziskej(obj, cesta) {
  return cesta.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}

export class Sprava {
  constructor({ getApi, getConf, onUlozeno, zprava }) {
    this.getApi = getApi;
    this.getConf = getConf;
    this.onUlozeno = onUlozeno;
    this.zprava = zprava;
    this.draft = null;
    this.baseSha = null;
    this.zmeneno = false;
    this.otevrene = new Set();
    this.el = null;
  }

  vykresli(el) {
    if (this.el !== el) {
      this.el = el;
      el.addEventListener("click", e => this.klik(e));
      el.addEventListener("input", e => this.vstup(e));
      el.addEventListener("change", e => this.vstup(e, true));
    }
    const { conf, sha } = this.getConf();
    if (!this.draft || (!this.zmeneno && this.baseSha !== sha)) {
      this.draft = klon(conf);
      this.baseSha = sha;
      this.zmeneno = false;
    }
    this.render();
  }

  render() {
    const d = this.draft;
    const { summary } = this.getConf();
    const moznostiSkupin = sel => d.skupiny.map(g => `<option value="${esc(g.id)}"${g.id === sel ? " selected" : ""}>${esc(g.nazev)}</option>`).join("");

    const titulRadek = (t, iVeSkupine, pocet) => {
      const s = summary?.tituly?.[t.id];
      const otevren = this.otevrene.has(t.id);
      return `
      <div class="m-row" data-t="${esc(t.id)}">
        <div class="m-line">
          <input class="m-name" data-f="nazev" value="${esc(t.nazev)}" aria-label="Název">
          <select data-f="skupina" aria-label="Skupina">${moznostiSkupin(t.skupina)}</select>
          <span class="m-btns">
            <button type="button" data-a="t-nahoru" ${iVeSkupine === 0 ? "disabled" : ""} title="Nahoru">↑</button>
            <button type="button" data-a="t-dolu" ${iVeSkupine === pocet - 1 ? "disabled" : ""} title="Dolů">↓</button>
            <button type="button" data-a="t-detail" class="${otevren ? "on" : ""}" title="Zdroj a podrobnosti">⋯</button>
            <button type="button" data-a="t-smazat" title="Odebrat">✕</button>
          </span>
        </div>
        <div class="m-meta muted small">${esc(t.id)} · ${esc(TYPY[t.zdroj?.typ] || t.zdroj?.typ || "")}${t.zdroj?.ticker ? ` ${esc(t.zdroj.ticker)}` : ""}${s?.stav?.chyba ? ` · <span class="err">${esc(s.stav.chyba)}</span>` : ""}</div>
        ${otevren ? this.formZdroje(t) : ""}
      </div>`;
    };

    let html = `
      <div class="m-toolbar">
        <a href="#" class="btn">‹ Zpět</a>
        <h2>Správa titulů</h2>
        <span class="spacer"></span>
        <button type="button" class="btn" data-a="zahodit" ${this.zmeneno ? "" : "disabled"}>Zahodit změny</button>
        <button type="button" class="btn primary" data-a="ulozit" ${this.zmeneno ? "" : "disabled"}>Uložit</button>
      </div>
      <p class="muted small">Pořadí skupin a titulů odpovídá pořadí v přehledu. Po uložení se nové tituly stáhnou
        (včetně historie) během několika minut, odebrané se přesunou do archivu.</p>`;

    d.skupiny.forEach((g, gi) => {
      const tituly = d.tituly.filter(t => t.skupina === g.id);
      html += `
      <section class="m-group" data-g="${gi}">
        <div class="m-ghead">
          <input class="m-gname" data-gf="nazev" value="${esc(g.nazev)}" aria-label="Název skupiny">
          <span class="m-btns">
            <button type="button" data-a="g-nahoru" ${gi === 0 ? "disabled" : ""} title="Skupinu nahoru">↑</button>
            <button type="button" data-a="g-dolu" ${gi === d.skupiny.length - 1 ? "disabled" : ""} title="Skupinu dolů">↓</button>
            <button type="button" data-a="g-smazat" ${tituly.length ? "disabled title='Skupina není prázdná'" : "title='Smazat skupinu'"}>✕</button>
          </span>
        </div>
        ${tituly.map((t, i) => titulRadek(t, i, tituly.length)).join("") || `<div class="muted small m-emptyg">Prázdná skupina</div>`}
      </section>`;
    });

    html += `
      <section class="m-group m-new">
        <h3>Nová skupina</h3>
        <div class="m-line">
          <input id="novaSkupina" placeholder="Název skupiny">
          <button type="button" class="btn" data-a="g-pridat">Přidat skupinu</button>
        </div>
      </section>
      <section class="m-group m-new">
        <h3>Nový titul</h3>
        ${this.formNovy()}
      </section>`;

    this.el.innerHTML = html;
  }

  poleZdroje(z, prefix) {
    const typ = z?.typ || "yahoo";
    const pole = (f, label, ph = "") =>
      `<label>${label}<input data-f="${prefix}.${f}" value="${esc(ziskej({ [prefix]: z }, `${prefix}.${f}`) ?? "")}" placeholder="${esc(ph)}"></label>`;
    let html = `<label>Zdroj<select data-f="${prefix}.typ">${Object.entries(TYPY).map(([k, v]) => `<option value="${k}"${k === typ ? " selected" : ""}>${v}</option>`).join("")}</select></label>`;
    if (typ === "yahoo") html += pole("ticker", "Ticker", "např. VUAA.L (prázdné = dohledat podle ISIN)") + pole("mena", "Měna (pro hledání podle ISIN)", "USD") + `<label>Burzy (pro hledání podle ISIN)<input data-f="${prefix}.burzy" value="${esc((z?.burzy || []).join(","))}" placeholder="LSE"></label>`;
    if (typ === "stooq") html += pole("ticker", "Ticker", "např. vuaa.uk");
    if (typ === "cnb") html += pole("mena", "Měna", "USD");
    if (typ === "patria") html += pole("cesta", "Cesta stránky grafu", "/kurzy/czk/5y/irs/graf.html");
    if (typ === "odvozeny") {
      const ops = ["*", "/", "+", "-"];
      html += pole("a", "Titul A (id)", "btcusd")
        + `<label>Operace<select data-f="${prefix}.op">${ops.map(o => `<option${o === (z?.op || "*") ? " selected" : ""}>${o}</option>`).join("")}</select></label>`
        + pole("b", "Titul B (id)", "usdczk");
    }
    return html;
  }

  formZdroje(t) {
    const pole = (f, label, ph = "") => `<label>${label}<input data-f="${f}" value="${esc(ziskej(t, f) ?? "")}" placeholder="${esc(ph)}"></label>`;
    return `
      <div class="m-form">
        ${pole("popis", "Popis")}
        ${pole("isin", "ISIN")}
        ${pole("jednotka", "Jednotka", "USD, CZK, % …")}
        ${pole("des", "Desetinná místa", "2")}
        ${pole("tv", "Živý kurz – symbol TradingView", "např. FX_IDC:EURCZK")}
        ${this.poleZdroje(t.zdroj, "zdroj")}
        <label>Záložní zdroj – Stooq ticker<input data-f="zaloha.ticker" value="${esc(t.zaloha?.ticker || "")}" placeholder="volitelné, např. vuaa.uk"></label>
      </div>`;
  }

  formNovy() {
    const n = this.novy ??= { nazev: "", skupina: this.draft.skupiny[0]?.id, zdroj: { typ: "yahoo" } };
    return `
      <div class="m-form m-newform">
        <label>Název<input data-n="nazev" value="${esc(n.nazev)}" placeholder="např. Apple"></label>
        <label>Skupina<select data-n="skupina">${this.draft.skupiny.map(g => `<option value="${esc(g.id)}"${g.id === n.skupina ? " selected" : ""}>${esc(g.nazev)}</option>`).join("")}</select></label>
        <label>ISIN<input data-n="isin" value="${esc(n.isin || "")}" placeholder="volitelné"></label>
        <label>Jednotka<input data-n="jednotka" value="${esc(n.jednotka || "")}" placeholder="USD"></label>
        ${this.poleZdroje(n.zdroj, "zdroj").replaceAll('data-f="', 'data-n="')}
        <label>Živý kurz – symbol TradingView<input data-n="tv" value="${esc(n.tv || "")}" placeholder="volitelné"></label>
        <div class="m-line"><button type="button" class="btn primary" data-a="t-pridat">Přidat titul</button>
        ${n.isin && !n.zdroj?.ticker ? `<a class="small" target="_blank" rel="noopener" href="https://finance.yahoo.com/lookup?s=${encodeURIComponent(n.isin)}">najít ticker na Yahoo</a>` : ""}</div>
      </div>`;
  }

  oznac() {
    this.zmeneno = true;
    this.el.querySelectorAll("[data-a='ulozit'],[data-a='zahodit']").forEach(b => { b.disabled = false; });
  }

  vstup(e, zmena = false) {
    const el = e.target;
    const d = this.draft;
    if (el.dataset.n) {
      // formulář nového titulu
      let v = el.value;
      if (el.dataset.n.endsWith(".burzy")) v = v.split(",").map(s => s.trim()).filter(Boolean);
      nastav(this.novy, el.dataset.n, v);
      if (zmena && (el.dataset.n === "zdroj.typ" || el.dataset.n === "isin")) this.render();
      return;
    }
    if (el.dataset.gf) {
      const gi = Number(el.closest("[data-g]").dataset.g);
      d.skupiny[gi][el.dataset.gf] = el.value;
      this.oznac();
      return;
    }
    if (el.dataset.f) {
      const t = d.tituly.find(x => x.id === el.closest("[data-t]").dataset.t);
      let v = el.value;
      if (el.dataset.f === "des") v = v === "" ? "" : Number(v);
      if (el.dataset.f.endsWith(".burzy")) v = v.split(",").map(s => s.trim()).filter(Boolean);
      if (el.dataset.f === "zaloha.ticker") {
        if (v) t.zaloha = { typ: "stooq", ticker: v }; else delete t.zaloha;
      } else nastav(t, el.dataset.f, v);
      this.oznac();
      if (zmena && (el.dataset.f === "skupina" || el.dataset.f === "zdroj.typ")) this.render();
    }
  }

  presunTitul(id, smer) {
    const d = this.draft;
    const i = d.tituly.findIndex(t => t.id === id);
    const g = d.tituly[i].skupina;
    let j = i + smer;
    while (j >= 0 && j < d.tituly.length && d.tituly[j].skupina !== g) j += smer;
    if (j < 0 || j >= d.tituly.length) return;
    [d.tituly[i], d.tituly[j]] = [d.tituly[j], d.tituly[i]];
  }

  async klik(e) {
    const b = e.target.closest("[data-a]");
    if (!b || b.disabled) return;
    const d = this.draft;
    const a = b.dataset.a;
    const tid = b.closest("[data-t]")?.dataset.t;
    const gi = Number(b.closest("[data-g]")?.dataset.g);

    if (a === "t-nahoru" || a === "t-dolu") { this.presunTitul(tid, a === "t-nahoru" ? -1 : 1); this.oznac(); }
    else if (a === "t-detail") { this.otevrene.has(tid) ? this.otevrene.delete(tid) : this.otevrene.add(tid); }
    else if (a === "t-smazat") {
      const t = d.tituly.find(x => x.id === tid);
      const zavisle = d.tituly.filter(x => x.zdroj?.typ === "odvozeny" && (x.zdroj.a === tid || x.zdroj.b === tid));
      const upoz = zavisle.length ? `\n\nPozor, z tohoto titulu se počítá: ${zavisle.map(x => x.nazev).join(", ")}.` : "";
      if (!confirm(`Odebrat „${t.nazev}“? Data se přesunou do archivu.${upoz}`)) return;
      d.tituly = d.tituly.filter(x => x.id !== tid);
      this.oznac();
    }
    else if (a === "g-nahoru" || a === "g-dolu") {
      const j = gi + (a === "g-nahoru" ? -1 : 1);
      [d.skupiny[gi], d.skupiny[j]] = [d.skupiny[j], d.skupiny[gi]];
      this.oznac();
    }
    else if (a === "g-smazat") { d.skupiny.splice(gi, 1); this.oznac(); }
    else if (a === "g-pridat") {
      const nazev = this.el.querySelector("#novaSkupina").value.trim();
      if (!nazev) return;
      let id = slug(nazev), k = 2;
      while (d.skupiny.some(g => g.id === id)) id = `${slug(nazev)}-${k++}`;
      d.skupiny.push({ id, nazev });
      this.oznac();
    }
    else if (a === "t-pridat") {
      const n = this.novy;
      if (!n.nazev?.trim()) { alert("Zadejte název."); return; }
      const z = n.zdroj || {};
      const chybi =
        z.typ === "yahoo" && !z.ticker && !n.isin ? "ticker nebo ISIN" :
        z.typ === "stooq" && !z.ticker ? "ticker" :
        z.typ === "cnb" && !z.mena ? "měnu" :
        z.typ === "patria" && !z.cesta ? "cestu stránky" :
        z.typ === "odvozeny" && (!z.a || !z.b) ? "tituly A a B" : null;
      if (chybi) { alert(`Doplňte ${chybi}.`); return; }
      let id = slug(n.isin && !z.ticker ? n.nazev : z.ticker || n.nazev), k = 2;
      const zaklad = id;
      while (d.tituly.some(t => t.id === id)) id = `${zaklad}-${k++}`;
      const t = { id, skupina: n.skupina || d.skupiny[0]?.id, nazev: n.nazev.trim() };
      if (n.isin) t.isin = n.isin.trim();
      if (n.jednotka) t.jednotka = n.jednotka.trim();
      t.des = n.jednotka === "%" ? 3 : 2;
      t.zdroj = klon(z);
      if (t.zdroj.typ === "yahoo" && !t.zdroj.ticker) t.zdroj.ticker = "";
      if (n.tv) t.tv = n.tv.trim();
      // vložit na konec své skupiny
      let pos = -1;
      d.tituly.forEach((x, i) => { if (x.skupina === t.skupina) pos = i; });
      d.tituly.splice(pos >= 0 ? pos + 1 : d.tituly.length, 0, t);
      this.novy = null;
      this.oznac();
    }
    else if (a === "zahodit") {
      this.draft = null;
      this.vykresli(this.el);
      return;
    }
    else if (a === "ulozit") { await this.uloz(b); return; }
    this.render();
  }

  async uloz(btn) {
    const api = this.getApi();
    btn.disabled = true;
    try {
      const aktualni = await api.file("instruments.json");
      if (aktualni.sha !== this.baseSha) {
        this.zprava("Seznam titulů se mezitím změnil (např. doplněný ticker). Obnovte stránku a změny proveďte znovu.", "warn");
        btn.disabled = false;
        return;
      }
      const text = JSON.stringify(this.draft, null, 2) + "\n";
      const sha = await api.put("instruments.json", text, this.baseSha, "Úprava seznamu titulů");
      this.baseSha = sha;
      this.zmeneno = false;
      await this.onUlozeno(klon(this.draft), sha);
      this.zprava("Uloženo. Stažení dat pro nové tituly se spustilo – výsledek bude vidět za několik minut.", "ok", 6000);
      this.render();
    } catch (e) {
      btn.disabled = false;
      this.zprava(e.status === 403 || e.status === 404
        ? `Uložení se nepovedlo (${e.status}). Token potřebuje oprávnění <b>Contents: Read and write</b>.`
        : `Uložení se nepovedlo: ${esc(e.message)}`, "err");
    }
  }
}
