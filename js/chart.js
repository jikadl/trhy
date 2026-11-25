// Graf jednoho titulu (ECharts) s měřením změny mezi dvěma body tažením myší / prstem.

import { hodnota, zmenaAbs, procenta, datum, jeSazba, smer, cislo } from "./format.js";

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export class Graf {
  constructor(el, mereniEl) {
    this.el = el;
    this.mereniEl = mereniEl;
    this.chart = null;
    this.titul = null;
    this.dny = [];
    this.hodn = [];
    this.tah = null;      // { a, b } indexy
    this.ro = new ResizeObserver(() => this.chart?.resize());
    this.ro.observe(el);
  }

  init() {
    if (this.chart) return;
    this.chart = echarts.init(this.el, null, { renderer: "canvas" });
    const zr = this.chart.getZr();
    zr.on("mousedown", e => this.zacatek(e));
    zr.on("mousemove", e => this.pohyb(e));
    zr.on("mouseup", () => this.konec());
    zr.on("globalout", () => this.konec());
    document.addEventListener("keydown", e => { if (e.key === "Escape") this.zrusMereni(); });
  }

  index(e) {
    if (!this.dny.length) return null;
    if (!this.chart.containPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY])) return null;
    const x = this.chart.convertFromPixel({ xAxisIndex: 0 }, e.offsetX);
    const i = Math.round(Array.isArray(x) ? x[0] : x);
    return Math.max(0, Math.min(this.dny.length - 1, i));
  }

  zacatek(e) {
    const i = this.index(e);
    if (i == null) return;
    this.tah = { a: i, b: i, aktivni: true };
    this.vykresliMereni();
  }

  pohyb(e) {
    if (!this.tah?.aktivni) return;
    const i = this.index(e);
    if (i == null || i === this.tah.b) return;
    this.tah.b = i;
    this.vykresliMereni();
  }

  konec() {
    if (!this.tah?.aktivni) return;
    this.tah.aktivni = false;
    if (this.tah.a === this.tah.b) this.zrusMereni();
  }

  zrusMereni() {
    this.tah = null;
    this.chart?.setOption({ series: [{ id: "h", markArea: { data: [] }, markPoint: { data: [] } }] });
    this.mereniEl.hidden = true;
  }

  vykresliMereni() {
    const { a, b } = this.tah;
    const [i, j] = a <= b ? [a, b] : [b, a];
    this.chart.setOption({
      series: [{
        id: "h",
        markArea: {
          silent: true,
          itemStyle: { color: css("--measure-area") },
          data: i === j ? [] : [[{ xAxis: this.dny[i] }, { xAxis: this.dny[j] }]],
        },
        markPoint: {
          silent: true,
          symbol: "circle",
          symbolSize: 8,
          itemStyle: { color: css("--accent"), borderColor: css("--bg"), borderWidth: 2 },
          label: { show: false },
          data: [{ coord: [this.dny[i], this.hodn[i]] }, { coord: [this.dny[j], this.hodn[j]] }],
        },
      }],
    });
    if (i === j) { this.mereniEl.hidden = true; return; }
    this.mereniEl.innerHTML = this.popisUseku(i, j);
    this.mereniEl.hidden = false;
  }

  popisUseku(i, j) {
    const t = this.titul;
    const v1 = this.hodn[i], v2 = this.hodn[j];
    const abs = v2 - v1;
    const rel = v1 ? v2 / v1 - 1 : null;
    const dnu = Math.round((Date.parse(this.dny[j]) - Date.parse(this.dny[i])) / 864e5);
    let max = i, min = i, pokles = 0, rust = 0, vrchol = i, dno = i;
    for (let k = i; k <= j; k++) {
      if (this.hodn[k] > this.hodn[max]) max = k;
      if (this.hodn[k] < this.hodn[min]) min = k;
      if (this.hodn[k] > this.hodn[vrchol]) vrchol = k;
      if (this.hodn[k] < this.hodn[dno]) dno = k;
      if (jeSazba(t)) {
        pokles = Math.min(pokles, this.hodn[k] - this.hodn[vrchol]);
        rust = Math.max(rust, this.hodn[k] - this.hodn[dno]);
      } else {
        pokles = Math.min(pokles, this.hodn[k] / this.hodn[vrchol] - 1);
        rust = Math.max(rust, this.hodn[k] / this.hodn[dno] - 1);
      }
    }
    const pa = !jeSazba(t) && dnu >= 30 && v1 > 0 && v2 > 0 ? Math.pow(v2 / v1, 365 / dnu) - 1 : null;
    const hlavni = jeSazba(t) ? zmenaAbs(t, abs) : procenta(rel);
    const vedl = jeSazba(t) ? "" : `<span>${zmenaAbs(t, abs)}</span>`;
    const fmtZm = v => (jeSazba(t) ? zmenaAbs(t, v) : procenta(v));
    return `
      <div class="m-range">${datum(this.dny[i])} → ${datum(this.dny[j])} <span class="muted">(${cislo(dnu, 0)} dní)</span></div>
      <div class="m-vals">${hodnota(t, v1)} → ${hodnota(t, v2)}</div>
      <div class="m-main ${smer(abs)}">${hlavni} ${vedl}</div>
      <div class="m-grid">
        ${pa != null ? `<span>p. a.</span><b>${procenta(pa)}</b>` : ""}
        <span>max</span><b>${hodnota(t, this.hodn[max])}</b>
        <span>min</span><b>${hodnota(t, this.hodn[min])}</b>
        <span>největší pokles</span><b class="down">${fmtZm(pokles)}</b>
        <span>největší růst</span><b class="up">${fmtZm(rust)}</b>
      </div>
      <button class="m-close" type="button" aria-label="Zavřít měření">×</button>`;
  }

  zobraz(titul, body) {
    this.init();
    this.titul = titul;
    this.dny = body.map(b => b[0]);
    this.hodn = body.map(b => b[1]);
    this.tah = null;
    this.mereniEl.hidden = true;

    const des = titul.des ?? 2;
    const barva = css("--accent");
    const sazba = jeSazba(titul);
    const prvni = this.hodn[0], posl = this.hodn[this.hodn.length - 1];
    const linka = posl >= prvni ? css("--up") : css("--down");

    this.chart.setOption({
      animation: false,
      grid: { left: 8, right: 12, top: 16, bottom: 64, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross", label: { backgroundColor: css("--surface-2"), color: css("--text") } },
        backgroundColor: css("--surface"),
        borderColor: css("--border"),
        textStyle: { color: css("--text"), fontSize: 12 },
        formatter: p => {
          const x = p[0];
          return `${datum(x.axisValue)}<br><b>${hodnota(titul, x.value)}</b>`;
        },
      },
      xAxis: {
        type: "category",
        data: this.dny,
        boundaryGap: false,
        axisLine: { lineStyle: { color: css("--border") } },
        axisLabel: {
          color: css("--muted"),
          hideOverlap: true,
          formatter: d => {
            const [y, m, dd] = d.split("-");
            const rozsah = Date.parse(this.dny[this.dny.length - 1]) - Date.parse(this.dny[0]);
            return rozsah > 400 * 864e5 ? `${Number(m)}/${y.slice(2)}` : `${Number(dd)}. ${Number(m)}.`;
          },
        },
        axisPointer: { label: { formatter: p => datum(p.value) } },
      },
      yAxis: {
        type: "value",
        scale: true,
        position: "right",
        splitLine: { lineStyle: { color: css("--grid") } },
        axisLabel: { color: css("--muted"), formatter: v => cislo(v, Math.min(des, 3)) + (sazba ? " %" : "") },
        axisPointer: { label: { formatter: p => cislo(p.value, des) } },
      },
      dataZoom: [
        { type: "inside", zoomOnMouseWheel: true, moveOnMouseMove: false, moveOnMouseWheel: false, preventDefaultMouseMove: false },
        {
          type: "slider", height: 22, bottom: 8, borderColor: css("--border"),
          fillerColor: css("--measure-area"), handleStyle: { color: barva },
          textStyle: { color: css("--muted") },
          dataBackground: { lineStyle: { color: css("--muted") }, areaStyle: { color: css("--grid") } },
          labelFormatter: (i, v) => datum(v),
        },
      ],
      series: [{
        id: "h",
        type: "line",
        step: titul.graf === "schody" ? "end" : false,
        data: this.hodn,
        showSymbol: false,
        sampling: "lttb",
        lineStyle: { width: 1.6, color: linka },
        itemStyle: { color: linka },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: linka + "40" },
            { offset: 1, color: linka + "00" },
          ]),
        },
        markArea: { data: [] },
        markPoint: { data: [] },
      }],
    }, { notMerge: true });
    this.chart.dispatchAction({ type: "dataZoom", start: 0, end: 100 });
  }
}
