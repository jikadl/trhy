# Trhy

Přehled a grafy vývoje měn, IRS sazeb, ETF, indexů, komodit a akcií.
Statická stránka na GitHub Pages; data jsou v soukromém repozitáři
[trhy-data](https://github.com/jikadl/trhy-data) a stránka je čte přes GitHub API
s tokenem uloženým jen v prohlížeči. V tomto repozitáři nejsou žádná data ani klíče.

## Funkce

- **Přehled** po skupinách: poslední hodnota, denní změna, vzdálenost od ATH, minigraf (přepínač 1T / 1M / 3M)
  a odkaz na graf (TradingView podle pole `tv`, jinak zdroj dat: Patria, Yahoo, ČNB).
- **Živé kurzy** (lišta nahoře): widget TradingView pro tituly, které mají v seznamu symbol `zive`.
  Kliknutí otevře graf na TradingView.
- **Detail**: graf s obdobím 1T / 1M / 3M / 6M / YTD / 1R / 3R / 5R / Max nebo vlastní rozsah dat,
  posuvník a kolečko myši pro přiblížení.
- **Měření**: tažením myší nebo prstem v grafu se ukáže změna mezi dvěma body
  (absolutně a v %, u sazeb v bazických bodech), počet dní, p. a., max/min a největší pokles/růst v úseku.
  Zavření křížkem nebo Esc.
- **Statistiky**: změny za období, ATH a vzdálenost od něj, 52T max/min, minimum.
- **Správa titulů** (ikona ☰): pořadí skupin a titulů, vlastní názvy, přesun mezi skupinami,
  přidání (ticker, ISIN, kurz ČNB, stránka Patrie, odvozený výpočet) a odebrání.
  Uložení zapíše `instruments.json` do repozitáře s daty a spustí stažení historie nových titulů.
- **Aktualizovat teď** (ikona ⟳): spustí stahování dat v GitHub Actions a po dokončení data obnoví.

## Zprovoznění

1. **GitHub Pages**: v tomto repozitáři *Settings → Pages → Build and deployment*,
   Source *Deploy from a branch*, větev `main`, složka `/ (root)`. Stránka pak běží na
   `https://jikadl.github.io/trhy/`.
2. **Token**: *GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens →
   Generate new token*:
   - *Repository access*: *Only select repositories* → `trhy-data`
   - *Repository permissions*: **Contents: Read and write**, **Actions: Read and write**
     (pro pouhé prohlížení stačí *Contents: Read-only*)
3. Na stránce otevřít **⚙ Nastavení**, vložit token, uložit.
   Tlačítko **Odkaz do mobilu** zkopíruje odkaz `…#nastaveni=…`, který po otevření uloží token
   i do dalšího zařízení a z adresy se hned smaže (část za `#` se na server neposílá).

## Soubory

| Soubor | Obsah |
|---|---|
| `index.html`, `style.css` | stránka a vzhled (světlý/tmavý podle systému, mobil i FullHD) |
| `js/app.js` | načítání dat, přehled, detail, živé kurzy, aktualizace |
| `js/chart.js` | graf (ECharts) a měření úseku |
| `js/manage.js` | správa titulů |
| `js/api.js` | GitHub API (čtení a zápis souborů, spuštění workflow) |
| `js/format.js` | české formátování čísel a dat |
