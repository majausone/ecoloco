/* Gráficas de líneas a lo largo del tiempo para el panel del mundo vivo (pestañas «Datos» y
   «Parámetros»). SVG, un solo eje vertical, líneas de 2 px, rejilla discreta, leyenda si hay
   más de una serie y, al pasar el ratón, una línea vertical con la fecha y los valores.
   Colores (comprobados para fondo oscuro y daltonismo): naranja para lo que pasa o pasaría
   con el cambio, azul para lo que pasaría sin él. */

export const COLOR = { serie: '#c47f2c', sin: '#3b86cf' };
import { T, num } from '../comun/idioma.js?v=202610052309';
const NS = 'http://www.w3.org/2000/svg';
const el = (t, a = {}) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };

export function numero(v) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const d = (x, k) => num(x, { minimumFractionDigits: k, maximumFractionDigits: k });
  if (a >= 1e9) return d(v / 1e9, 1) + T(' mil millones', ' billion');
  if (a >= 1e6) return d(v / 1e6, 1) + T(' millones', ' million');
  if (a >= 1e4 || Number.isInteger(v)) return num(Math.round(v));
  if (a >= 100) return d(v, 0);
  if (a >= 1) return d(v, 2);
  if (a >= 0.01) return d(v, 3);
  if (a === 0) return '0';
  return T(v.toExponential(2).replace('.', ','), v.toExponential(2));
}

// series: [{ nombre, datos: números (uno por día, desde el día «desde»), color, discontinua }]
// fechas: la fecha de cada día del eje (todas las series en el mismo eje de días)
export function grafica(contenedor, { series, fechas, unidad = '', alto = 120, hoy = null }) {
  contenedor.innerHTML = '';
  const ancho = Math.max(200, contenedor.clientWidth || 340);
  const m = { i: 46, d: 8, a: 8, b: 18 };
  const n = fechas.length;
  const todos = series.flatMap((s) => Array.from(s.datos).filter(Number.isFinite));
  if (!n || !todos.length) { contenedor.innerHTML = `<div class="gris">${T('Aún no hay datos.', 'No data yet.')}</div>`; return; }
  let lo = Math.min(...todos), hi = Math.max(...todos);
  if (lo === hi) { lo -= Math.abs(lo) * 0.1 || 1; hi += Math.abs(hi) * 0.1 || 1; }
  const pad = (hi - lo) * 0.08, positivo = lo >= 0; lo -= pad; hi += pad;
  if (positivo) lo = Math.max(0, lo); // (lo que no puede ser negativo, con el eje desde 0 como mucho)
  const X = (i) => m.i + (n > 1 ? i / (n - 1) : 0.5) * (ancho - m.i - m.d), Y = (v) => m.a + (1 - (v - lo) / (hi - lo)) * (alto - m.a - m.b);
  const svg = el('svg', { width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`, class: 'grafica' });
  // rejilla y eje (3 marcas)
  for (let k = 0; k <= 2; k++) {
    const v = lo + (hi - lo) * (k / 2), y = Y(v);
    svg.append(el('line', { x1: m.i, x2: ancho - m.d, y1: y, y2: y, stroke: '#3a2f29', 'stroke-width': 1 }));
    const t = el('text', { x: m.i - 5, y: y + 3.5, 'text-anchor': 'end', fill: '#a8998a', 'font-size': 10 }); t.textContent = numero(v); svg.append(t);
  }
  const f0 = el('text', { x: m.i, y: alto - 4, fill: '#a8998a', 'font-size': 10 }); f0.textContent = fechas[0]; svg.append(f0);
  const f1 = el('text', { x: ancho - m.d, y: alto - 4, fill: '#a8998a', 'font-size': 10, 'text-anchor': 'end' }); f1.textContent = fechas[n - 1]; svg.append(f1);
  if (hoy != null && hoy > 0 && hoy < n) svg.append(el('line', { x1: X(hoy), x2: X(hoy), y1: m.a, y2: alto - m.b, stroke: '#6a5a4a', 'stroke-dasharray': '3 3' }));
  for (const s of series) {
    let d = '', abierto = false;
    const o = s.desde || 0;
    Array.from(s.datos).forEach((v, i) => {
      if (!Number.isFinite(v)) { abierto = false; return; }
      d += `${abierto ? 'L' : 'M'}${X(i + o).toFixed(1)},${Y(v).toFixed(1)}`; abierto = true;
    });
    svg.append(el('path', { d, fill: 'none', stroke: s.color || COLOR.serie, 'stroke-width': s.grosor || 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...(s.discontinua ? { 'stroke-dasharray': '5 4' } : {}) }));
  }
  // al pasar el ratón: línea, puntos y etiqueta con la fecha y los valores
  const guia = el('line', { y1: m.a, y2: alto - m.b, stroke: '#efe4d2', 'stroke-width': 1, visibility: 'hidden' });
  const puntos = series.map((s) => el('circle', { r: 4, fill: s.color || COLOR.serie, stroke: '#14100f', 'stroke-width': 2, visibility: 'hidden' }));
  svg.append(guia, ...puntos);
  const etiqueta = document.createElement('div'); etiqueta.className = 'etiqueta-grafica';
  contenedor.style.position = 'relative';
  contenedor.append(svg, etiqueta);
  const zona = el('rect', { x: m.i, y: 0, width: ancho - m.i - m.d, height: alto, fill: 'transparent' });
  svg.append(zona);
  zona.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect(), i = Math.round(((e.clientX - r.left - m.i) / (ancho - m.i - m.d)) * (n - 1));
    if (i < 0 || i >= n) return;
    guia.setAttribute('x1', X(i)); guia.setAttribute('x2', X(i)); guia.setAttribute('visibility', 'visible');
    const filas = [];
    series.forEach((s, k) => {
      const v = s.datos[i - (s.desde || 0)];
      if (Number.isFinite(v)) { puntos[k].setAttribute('cx', X(i)); puntos[k].setAttribute('cy', Y(v)); puntos[k].setAttribute('visibility', 'visible'); filas.push(`<span class="marca" style="background:${s.color || COLOR.serie}"></span>${series.length > 1 ? `${s.nombre}: ` : ''}<b>${numero(v)}</b> ${unidad}`); }
      else puntos[k].setAttribute('visibility', 'hidden');
    });
    etiqueta.innerHTML = `<div class="gris">${fechas[i]}</div>${filas.join('<br>')}`;
    etiqueta.style.display = 'block';
    const x = X(i);
    etiqueta.style.left = `${x > ancho / 2 ? x - etiqueta.offsetWidth - 10 : x + 10}px`; etiqueta.style.top = '4px';
  });
  zona.addEventListener('pointerleave', () => { guia.setAttribute('visibility', 'hidden'); puntos.forEach((p) => p.setAttribute('visibility', 'hidden')); etiqueta.style.display = 'none'; });
  if (series.length > 1) {
    const ley = document.createElement('div'); ley.className = 'leyenda';
    ley.innerHTML = series.map((s) => `<span><span class="marca" style="${s.discontinua ? `background:repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 6px)` : `background:${s.color}`};height:${Math.max(2, s.grosor || 3)}px;width:16px"></span>${s.nombre}</span>`).join('');
    contenedor.append(ley);
  }
}
