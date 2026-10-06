// Interfaz de EcoLoco: edita el escenario, manda la simulación a un Web Worker
// (trabajador.js) y pinta lo que va llegando. No calcula nada del modelo.

import { Rejilla } from '../motor/core/rejilla.js?v=202610060036';
import { zip as zipBytes } from '../motor/salida/zip.js?v=202610060036';
import { activarCorrecciones } from '../motor/correcciones.js?v=202610060036';
import { T, enIngles, traducirDom } from '../comun/idioma.js?v=202610060036';
import { ayuda, ponerAyudas } from '../comun/ayuda.js?v=202610060036';
import { cabecera } from '../comun/cabecera.js?v=202610060036';

traducirDom(); ponerAyudas(); cabecera('motor');

const zip = (ficheros) => new Blob([zipBytes(ficheros)], { type: 'application/zip' });

const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...hijos) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat()) if (h !== null && h !== undefined) e.append(h instanceof Node ? h : String(h));
  return e;
};

// ------------------------------------------------------------------ estado
let meta = null;
// las descripciones del motor (en inglés en el original), en español: interfaz/es.json
let ES = {};
// (en inglés, la descripción original, su primera línea)
const es = (t) => (enIngles() ? String(t || '').split('\n')[0].trim() : ES[String(t || '').split('\n')[0].trim()] || '');
// la descripción entera, para el «?»
const larga = (t) => (enIngles() ? String(t || '').replace(/\s+/g, ' ').trim() : es(t));
const corto = (t) => String(t || '').replace(/\s*[([].*$/, '').replace(/[.,]$/, '');
let base = null;        // escenario tal como se cargó (valores de partida)
let escenario = null;   // copia que se edita
let nombreEscenario = '';
let transformaciones = {}; // entrada -> {factor, suma}
let info = null;        // lo que manda el trabajador al iniciar
let historia = [];      // resúmenes por paso
let corriendo = false;
let tPaso = performance.now();
let trabajador = null;

// colores de las series: legibles sobre fondo oscuro y claro
const COLORES = ['#4e9fe5', '#e5534b', '#57b86a', '#f0973c', '#a98be0', '#c9875d', '#e57bc0', '#9aa3a0', '#cdc64a',
  '#3cc6d6', '#7f8ff0', '#e88a8a', '#9cc95b', '#d9b062', '#d66a5e', '#c48ad1', '#6fb8f0', '#f2b36f', '#6fd39a', '#b3a6f2'];
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function mostrarError(m) {
  const e = $('#error');
  e.textContent = m;
  e.hidden = false;
  e.onclick = () => { e.hidden = true; };
}
window.addEventListener('error', (e) => mostrarError(String(e.error?.stack || e.message)));
window.addEventListener('unhandledrejection', (e) => mostrarError(String(e.reason?.stack || e.reason)));

const copiaProfunda = (o) => structuredClone(o);
const decod = (v) => (v === 'NaN' || v === null ? NaN : v === 'Infinity' ? Infinity : v === '-Infinity' ? -Infinity : v);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------------------------ gráficas
class Grafica {
  constructor(canvas, { log = false, unidad = '' } = {}) {
    this.c = canvas;
    this.log = log;
    this.unidad = unidad;
    this.series = []; // {nombre, puntos: [[x, y]], color, oculta}
    this.pendiente = false;
    new ResizeObserver(() => this.pedir()).observe(canvas);
    canvas.addEventListener('click', (ev) => this.clic(ev));
  }

  poner(series) {
    const ocultas = new Set(this.series.filter((s) => s.oculta).map((s) => s.nombre));
    this.series = series.map((s, i) => ({ color: COLORES[i % COLORES.length], ...s, oculta: ocultas.has(s.nombre) }));
    this.pedir();
  }

  pedir() {
    if (this.pendiente) return;
    this.pendiente = true;
    requestAnimationFrame(() => { this.pendiente = false; this.dibujar(); });
  }

  clic(ev) {
    const r = this.c.getBoundingClientRect();
    const y = ev.clientY - r.top, x = ev.clientX - r.left;
    for (const z of this.zonas || []) {
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) { z.s.oculta = !z.s.oculta; this.pedir(); return; }
    }
  }

  dibujar() {
    const c = this.c, dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.font = '11px system-ui, sans-serif';
    const vis = this.series.filter((s) => !s.oculta);
    const tr = (y) => (this.log ? (y > 0 ? Math.log10(y) : NaN) : y);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of vis) {
      for (const [x, y] of s.puntos) {
        const v = tr(y);
        if (!Number.isFinite(v)) continue;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, v); y1 = Math.max(y1, v);
      }
    }
    // leyenda (clic para ocultar)
    this.zonas = [];
    let lx = 50, ly = 4;
    for (const s of this.series) {
      const w = g.measureText(s.nombre).width + 18;
      if (lx + w > W - 4) { lx = 50; ly += 13; }
      g.globalAlpha = s.oculta ? 0.3 : 1;
      g.fillStyle = s.color; g.fillRect(lx, ly + 3, 10, 6);
      g.fillStyle = css('--tinta'); g.fillText(s.nombre, lx + 13, ly + 10);
      g.globalAlpha = 1;
      this.zonas.push({ x: lx, y: ly, w, h: 13, s });
      lx += w + 6;
    }
    const top = ly + 20, izq = 50, der = 8, abajo = 18;
    if (!Number.isFinite(x0)) { g.fillStyle = css('--suave'); g.fillText(T('sin datos todavía', 'no data yet'), izq, top + 20); return; }
    if (x0 === x1) { x0 -= 1; x1 += 1; }
    if (y0 === y1) { const d = Math.abs(y0) * 0.05 || 1; y0 -= d; y1 += d; }
    const px = (x) => izq + ((x - x0) / (x1 - x0)) * (W - izq - der);
    const py = (y) => top + (1 - (y - y0) / (y1 - y0)) * (H - top - abajo);
    g.strokeStyle = css('--rejilla'); g.fillStyle = css('--ejes'); g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const v = y0 + ((y1 - y0) * i) / 4, yy = py(v);
      g.beginPath(); g.moveTo(izq, yy); g.lineTo(W - der, yy); g.stroke();
      const et = this.log ? fmt(10 ** v) : fmt(v);
      g.fillText(et, 2, yy + 3);
    }
    g.fillText(`${T('paso', 'step')} ${x0}`, izq, H - 4);
    const t1 = `${T('paso', 'step')} ${x1}`;
    g.fillText(t1, W - der - g.measureText(t1).width, H - 4);
    for (const s of vis) {
      g.strokeStyle = s.color; g.lineWidth = 1.6; g.beginPath();
      let dentro = false;
      for (const [x, y] of s.puntos) {
        const v = tr(y);
        if (!Number.isFinite(v)) { dentro = false; continue; }
        if (!dentro) g.moveTo(px(x), py(v)); else g.lineTo(px(x), py(v));
        dentro = true;
      }
      g.stroke();
      if (s.puntos.length === 1) { const [x, y] = s.puntos[0]; g.fillStyle = s.color; g.fillRect(px(x) - 2, py(tr(y)) - 2, 4, 4); }
    }
  }
}

function fmt(v) {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(2);
  return Number(v.toPrecision(4)).toString();
}

// ------------------------------------------------------------------ mapa
function viridis(t) {
  const p = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
  t = Math.min(1, Math.max(0, t)) * (p.length - 1);
  const i = Math.min(p.length - 2, Math.floor(t)), f = t - i;
  return `rgb(${p[i].map((v, k) => Math.round(v + (p[i + 1][k] - v) * f)).join(',')})`;
}

class Mapa {
  constructor(canvas, { leyenda = true } = {}) {
    this.c = canvas;
    this.conLeyenda = leyenda;
    this.datos = null;
    new ResizeObserver(() => this.dibujar()).observe(canvas);
    canvas.addEventListener('mousemove', (ev) => this.raton(ev));
  }

  poner(poligonos, datos, unidad) {
    this.pol = poligonos; this.datos = datos; this.unidad = unidad;
    this.dibujar();
  }

  dibujar() {
    if (!this.pol || !this.datos) return;
    const c = this.c, dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const xs = this.pol.flat().map((p) => p[0]), ys = this.pol.flat().map((p) => p[1]);
    const mx = Math.min(...xs), Mx = Math.max(...xs), my = Math.min(...ys), My = Math.max(...ys);
    const esc = Math.min((W - 8) / (Mx - mx), (H - 8) / (My - my));
    this.tx = (x) => 4 + (x - mx) * esc;
    this.ty = (y) => 4 + (My - y) * esc;
    const fin = [...this.datos].filter(Number.isFinite);
    const lo = fin.length ? Math.min(...fin) : 0, hi = fin.length ? Math.max(...fin) : 1;
    this.pol.forEach((p, i) => {
      const v = this.datos[i];
      g.fillStyle = Number.isFinite(v) ? viridis(hi > lo ? (v - lo) / (hi - lo) : 0.5) : css('--linea');
      g.beginPath();
      p.forEach(([x, y], k) => (k ? g.lineTo(this.tx(x), this.ty(y)) : g.moveTo(this.tx(x), this.ty(y))));
      g.closePath(); g.fill();
      g.strokeStyle = css('--fondo'); g.stroke();
    });
    if (!this.conLeyenda) return;
    const ley = $('#leyenda');
    ley.style.background = `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map(viridis).join(',')})`;
    ley.innerHTML = '';
    ley.append(el('span', { style: 'color:#fff;padding:0 3px' }, fmt(lo)), el('span', { style: 'color:#000;padding:0 3px' }, `${fmt(hi)} ${this.unidad || ''}`));
  }

  raton(ev) {
    if (!this.pol) return;
    const r = this.c.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    const i = this.pol.findIndex((p) => dentro(p.map(([a, b]) => [this.tx(a), this.ty(b)]), x, y));
    $('#mapa-info').textContent = i >= 0 ? `${T('celda', 'cell')} ${i}: ${fmt(this.datos[i])} ${this.unidad || ''}` : '';
  }
}

function dentro(p, x, y) {
  let d = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) d = !d;
  }
  return d;
}

// ------------------------------------------------------------------ descargas
function descargar(nombre, blob) {
  // modo de prueba (?prueba): la descarga va al servidor (tmp/descargas) para poder comprobarla
  if (new URLSearchParams(location.search).has('prueba')) {
    fetch(`../prueba-descarga?nombre=${encodeURIComponent(nombre)}`, { method: 'POST', body: blob })
      .then(() => { $('#estado').textContent += ` · guardado ${nombre}`; });
    return;
  }
  const a = el('a', { href: URL.createObjectURL(blob), download: nombre });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ------------------------------------------------------------------ editor de parámetros
function metaCampo(ruta) {
  let lista = meta.parametros[ruta[0]];
  let m = null;
  for (const k of ruta.slice(1)) {
    if (!lista) return null;
    m = lista.find((c) => c.nombre === k);
    if (!m) return null;
    lista = m.campos;
  }
  return m;
}

const MODULOS = enIngles() ? { core: 'Core', plants: 'Plants', animal: 'Animals', hydrology: 'Hydrology', litter: 'Leaf litter', abiotic: 'Forest climate (abiotic)', abiotic_simple: 'Forest climate (simple abiotic)', soil: 'Soil' }
  : { core: 'Núcleo', plants: 'Plantas', animal: 'Animales', hydrology: 'Hidrología', litter: 'Hojarasca', abiotic: 'Clima del bosque (abiótico)', abiotic_simple: 'Clima del bosque (abiótico sencillo)', soil: 'Suelo' };
function dibujarArbol() {
  const arbol = $('#arbol');
  arbol.innerHTML = '';
  for (const modulo of Object.keys(escenario.config)) {
    const d = el('details', {}, el('summary', { title: modulo }, MODULOS[modulo] || modulo));
    nodo(d, escenario.config, modulo, [modulo]);
    arbol.append(d);
  }
  filtrar();
}

function nodo(padre, obj, clave, ruta) {
  const v = obj[clave];
  const m = metaCampo(ruta);
  const esGrupo = v && typeof v === 'object' && !Array.isArray(v) && (!m || m.tipo === 'grupo' || m.tipo === 'PyrealmConfig' || ruta.length === 1);
  if (esGrupo && ruta.length > 1) {
    const d = el('details', {}, el('summary', { title: clave }, es(m?.descripcion) || clave));
    for (const k of Object.keys(v)) nodo(d, v, k, [...ruta, k]);
    padre.append(d);
    return;
  }
  if (esGrupo) { for (const k of Object.keys(v)) nodo(padre, v, k, [...ruta, k]); return; }
  padre.append(campo(obj, clave, ruta, m));
}

function campo(obj, clave, ruta, m) {
  const v = obj[clave];
  const defecto = m ? m.defecto : undefined;
  const fila = el('div', { class: 'param', 'data-buscar': `${ruta.join('.')} ${es(m?.descripcion)}`.toLowerCase() });
  const marcar = () => fila.classList.toggle('cambiado', defecto !== undefined && !igual(obj[clave], defecto));
  let entrada;
  const soloLectura = m && (m.tipo === 'Path' || /_path$/.test(clave)) || (ruta[0] === 'core' && ruta[1] === 'data');
  if (typeof v === 'boolean') {
    entrada = el('input', { type: 'checkbox' });
    entrada.checked = v;
    entrada.onchange = () => { obj[clave] = entrada.checked; marcar(); };
  } else if (typeof v === 'number') {
    entrada = el('input', { type: 'number', step: 'any', value: v });
    entrada.onchange = () => { const n = Number(entrada.value); if (Number.isFinite(n)) { obj[clave] = n; marcar(); } };
  } else if (typeof v === 'string') {
    entrada = el('input', { type: 'text', value: v });
    entrada.onchange = () => { obj[clave] = entrada.value; marcar(); };
  } else {
    entrada = el('textarea', {}, JSON.stringify(v));
    entrada.onchange = () => {
      try { obj[clave] = JSON.parse(entrada.value); entrada.style.background = ''; marcar(); } catch { entrada.style.background = css('--mal'); }
    };
  }
  if (soloLectura) entrada.disabled = true;
  entrada.setAttribute('aria-label', ruta.join('.'));
  // el nombre, en español (el interno, al pasar el ratón)
  fila.append(
    el('div', { class: 'nombre', title: ruta.join('.') }, corto(es(m?.descripcion)) || ruta.slice(1).join('.'), frag(ayuda(`${larga(m?.descripcion) || '—'} (${ruta.join('.')})`, `${larga(m?.descripcion) || '—'} (${ruta.join('.')})`))),
    entrada,
    el('div', {},
      defecto !== undefined ? el('div', { class: 'defecto' }, `${T('por defecto', 'default')}: ${JSON.stringify(defecto).slice(0, 200)}`) : ''),
  );
  marcar();
  return fila;
}

function filtrar() {
  const q = $('#buscar').value.trim().toLowerCase();
  for (const f of document.querySelectorAll('#arbol .param')) f.style.display = !q || f.dataset.buscar.includes(q) ? '' : 'none';
  if (q) for (const d of document.querySelectorAll('#arbol details')) d.open = !!d.querySelector('.param:not([style*="none"])');
}

// un trozo de HTML (el «?») como nodo
const frag = (html) => { const t = document.createElement('template'); t.innerHTML = html; return t.content.firstChild; };

// ------------------------------------------------------------------ tablas
const DOC_ANIMALES_EN = {
  name: 'Name of the functional group.', taxa: 'mammal, bird, invertebrate, amphibian or reptile.',
  diet: 'herbivore, carnivore, omnivore or a combination joined with _ of: algae, detritus, flowers, foliage, fruit, mushrooms, fungi, seeds, blood, invertebrates, nectar, fish, carcasses, vertebrates, waste, wood, nonfeeding, pom, bacteria.',
  metabolic_type: 'endothermic (warm-blooded) or ectothermic.', reproductive_environment: 'terrestrial or aquatic (aquatic young spend some time away).',
  reproductive_type: 'semelparous, iteroparous or nonreproductive.', development_type: 'direct or indirect (with metamorphosis).', development_status: 'larval or adult.',
  offspring_functional_group: 'Group of the young, or of the adult after metamorphosis.', excretion_type: 'ureotelic or uricotelic.', migration_type: 'none or seasonal.',
  vertical_occupancy: 'Strata it occupies: soil, ground and/or canopy, joined with _.', birth_mass: 'Mass at birth [kg].', adult_mass: 'Adult mass [kg].',
  density_individuals_m2: 'Starting density [individuals m⁻²] (optional; if missing the scaling law is used).', t_opt: 'Optimal activity temperature [°C] (optional, ectotherms).',
  t_max_crit: 'Critical maximum temperature [°C] (optional, ectotherms).', t_min_crit: 'Critical minimum temperature [°C] (optional, ectotherms).',
  search_rate_multiplier: 'Multiplier of the search rate.',
};
const DOC_COHORTES_EN = { plant_cohorts_n: 'Number of individuals in the cohort.', plant_cohorts_pft: 'Plant type (PFT) of the cohort.', plant_cohorts_cell_id: 'Grid cell it is in.', plant_cohorts_dbh: 'Diameter at breast height [m].' };
const COLUMNAS_EN = {
  name: 'Name', taxa: 'Taxon', diet: 'Diet', metabolic_type: 'Metabolism', reproductive_environment: 'Breeds in', reproductive_type: 'Reproduction',
  development_type: 'Development', development_status: 'Stage', offspring_functional_group: 'Offspring group', excretion_type: 'Excretion',
  migration_type: 'Migration', vertical_occupancy: 'Height it lives at', birth_mass: 'Birth mass (kg)', adult_mass: 'Adult mass (kg)',
  density_individuals_m2: 'Density (ind./m²)', t_opt: 'Optimal T (°C)', t_max_crit: 'Max T (°C)', t_min_crit: 'Min T (°C)', search_rate_multiplier: 'Search (×)',
  plant_cohorts_n: 'Individuals', plant_cohorts_pft: 'Plant type', plant_cohorts_cell_id: 'Cell', plant_cohorts_dbh: 'Diameter (m)', pft_name: 'Name',
};
const DOC_ANIMALES = {
  name: 'Nombre del grupo funcional.',
  taxa: 'mammal, bird, invertebrate, amphibian o reptile.',
  diet: 'herbivore, carnivore, omnivore o una combinación con _ de: algae, detritus, flowers, foliage, fruit, mushrooms, fungi, seeds, blood, invertebrates, nectar, fish, carcasses, vertebrates, waste, wood, nonfeeding, pom, bacteria.',
  metabolic_type: 'endothermic (sangre caliente) o ectothermic.',
  reproductive_environment: 'terrestrial o aquatic (las crías acuáticas pasan un tiempo fuera).',
  reproductive_type: 'semelparous, iteroparous o nonreproductive.',
  development_type: 'direct o indirect (con metamorfosis).',
  development_status: 'larval o adult.',
  offspring_functional_group: 'Grupo de las crías, o del adulto tras la metamorfosis.',
  excretion_type: 'ureotelic o uricotelic.',
  migration_type: 'none o seasonal.',
  vertical_occupancy: 'Estratos que ocupa: soil, ground y/o canopy, unidos con _.',
  birth_mass: 'Masa al nacer [kg].',
  adult_mass: 'Masa adulta [kg].',
  density_individuals_m2: 'Densidad de partida [individuos m⁻²] (opcional; si falta se usa la ley de escala).',
  t_opt: 'Temperatura óptima de actividad [°C] (opcional, ectotermos).',
  t_max_crit: 'Temperatura crítica máxima [°C] (opcional, ectotermos).',
  t_min_crit: 'Temperatura crítica mínima [°C] (opcional, ectotermos).',
};
const DIMS = enIngles() ? { cell_id: 'cell', time_index: 'step', layers: 'layer', pft: 'plant type', element: 'element', groundwater_layers: 'groundwater layer' }
  : { cell_id: 'cuadro', time_index: 'día', layers: 'capa', pft: 'tipo de planta', element: 'elemento', groundwater_layers: 'capa subterránea' };
const COLUMNAS = {
  name: 'Nombre', taxa: 'Taxón', diet: 'Dieta', metabolic_type: 'Metabolismo', reproductive_environment: 'Dónde cría', reproductive_type: 'Reproducción',
  development_type: 'Desarrollo', development_status: 'Fase', offspring_functional_group: 'Grupo de las crías', excretion_type: 'Excreción',
  migration_type: 'Migración', vertical_occupancy: 'Altura donde vive', birth_mass: 'Masa al nacer (kg)', adult_mass: 'Masa adulta (kg)',
  density_individuals_m2: 'Densidad (ind./m²)', t_opt: 'T óptima (°C)', t_max_crit: 'T máxima (°C)', t_min_crit: 'T mínima (°C)', search_rate_multiplier: 'Búsqueda (×)',
  plant_cohorts_n: 'Individuos', plant_cohorts_pft: 'Tipo de planta', plant_cohorts_cell_id: 'Cuadro', plant_cohorts_dbh: 'Diámetro (m)', pft_name: 'Nombre',
};
const DOC_COHORTES = {
  plant_cohorts_n: 'Número de individuos de la cohorte.',
  plant_cohorts_pft: 'Tipo de planta (PFT) de la cohorte.',
  plant_cohorts_cell_id: 'Celda de la rejilla en la que está.',
  plant_cohorts_dbh: 'Diámetro a la altura del pecho [m].',
};

function dibujarTablas() {
  const cont = $('#tablas');
  cont.innerHTML = '';
  const docPft = Object.fromEntries((meta.pft || []).map((c) => [c.nombre, c.descripcion]));
  const defs = [
    ['grupos_animales', T('Tipos de animal (animal_functional_groups.csv)', 'Animal types (animal_functional_groups.csv)'), enIngles() ? DOC_ANIMALES_EN : DOC_ANIMALES],
    ['pft', T('Tipos de planta (plant_pfts.csv)', 'Plant types (plant_pfts.csv)'), docPft],
    ['cohortes_plantas', T('Cohortes de plantas de partida (example_plant_cohorts.csv)', 'Starting plant cohorts (example_plant_cohorts.csv)'), enIngles() ? DOC_COHORTES_EN : DOC_COHORTES],
  ];
  const COL = enIngles() ? COLUMNAS_EN : COLUMNAS;
  for (const [k, titulo, doc] of defs) {
    const t = escenario.tablas[k];
    if (!t) continue;
    const n = t.datos[t.columnas[0]].length;
    const tabla = el('table', { class: 'editable' });
    // la cabecera: un nombre corto en español; el interno y la explicación, al pasar el ratón
    const cab = (c) => COL[c] || corto(k === 'pft' ? es(doc[c]) : doc[c]) || c;
    const docDe = (c) => (k === 'pft' ? larga(doc[c]) : doc[c]) || '';
    tabla.append(el('tr', {}, el('th', {}, ''), t.columnas.map((c) => el('th', { title: c }, cab(c), frag(ayuda(`${docDe(c) || '—'} (${c})`, `${docDe(c) || '—'} (${c})`))))));
    for (let i = 0; i < n; i++) {
      const fila = el('tr', {}, el('td', {}, el('button', { title: T('quitar fila', 'remove row'), onclick: () => { for (const c of t.columnas) t.datos[c].splice(i, 1); dibujarTablas(); } }, '×')));
      for (const c of t.columnas) {
        const v = t.datos[c][i];
        const inp = el('input', { value: v === null ? '' : v });
        inp.onchange = () => {
          if (t.dtypes[c] === 'str') t.datos[c][i] = inp.value;
          else {
            const s = inp.value.trim();
            t.datos[c][i] = s === '' || s.toLowerCase() === 'nan' ? 'NaN' : s.toLowerCase() === 'inf' ? 'Infinity' : Number(s);
          }
        };
        fila.append(el('td', {}, inp));
      }
      tabla.append(fila);
    }
    cont.append(el('h3', {}, titulo), el('div', { class: 'tabla-env' }, tabla),
      el('button', { onclick: () => { for (const c of t.columnas) t.datos[c].push(t.datos[c][n - 1]); dibujarTablas(); } }, T('Añadir fila (copia de la última)', 'Add row (copy of the last one)')));
  }
}

// ------------------------------------------------------------------ entradas (clima de partida)
function dibujarEntradas() {
  const cont = $('#entradas');
  cont.innerHTML = '';
  for (const [k, v] of Object.entries(escenario.inputs)) {
    const m = meta.variables[k] || {};
    const tr = (transformaciones[k] ||= { factor: 1, suma: 0 });
    const datos = v.data.map(decod).filter(Number.isFinite);
    const media = datos.reduce((a, b) => a + b, 0) / (datos.length || 1);
    const factor = el('input', { type: 'number', step: 'any', value: tr.factor, title: T('multiplicar por', 'multiply by') });
    const suma = el('input', { type: 'number', step: 'any', value: tr.suma, title: T('sumar', 'add') });
    factor.onchange = () => { tr.factor = Number(factor.value); };
    suma.onchange = () => { tr.suma = Number(suma.value); };
    const lienzo = el('canvas');
    cont.append(el('div', { class: 'entrada' },
      el('div', {}, el('div', { class: 'nombre', title: k }, corto(es(m.description)) || k, frag(ayuda(`${larga(m.description) || '—'} (${k})`, `${larga(m.description) || '—'} (${k})`))), el('div', { class: 'desc' }, `${v.dims.map((d) => DIMS[d] || d).join(' × ')} · ${T('media', 'mean')} ${fmt(media)} ${m.unit || ''}`)),
      el('label', {}, '× ', factor), el('label', {}, '+ ', suma), lienzo));
    // vista: primer paso / primer índice de las demás dimensiones
    const ax = v.dims.indexOf('cell_id');
    const pol = poligonos();
    if (ax >= 0 && pol && pol.length === v.shape[ax]) {
      const nC = v.shape[ax], int = v.shape.slice(ax + 1).reduce((a, b) => a * b, 1);
      const d = Array.from({ length: nC }, (_, c) => decod(v.data[c * int]));
      requestAnimationFrame(() => mapaPequeno(lienzo, pol, d));
    }
  }
}

function mapaPequeno(c, pol, datos) {
  const m = new Mapa(c, { leyenda: false });
  m.raton = () => {};
  m.poner(pol, datos, '');
}

function poligonos() {
  try { return new Rejilla(escenario.config.core.grid).polygons; } catch { return null; }
}

function escenarioParaCorrer() {
  const e = copiaProfunda(escenario);
  if ($('#corregir').checked) activarCorrecciones(e);
  for (const [k, tr] of Object.entries(transformaciones)) {
    if (!e.inputs[k] || (tr.factor === 1 && tr.suma === 0)) continue;
    const v = e.inputs[k];
    v.data = v.data.map((x) => { const d = decod(x); return Number.isFinite(d) ? d * tr.factor + tr.suma : x; });
    v.dtype = 'float64';
  }
  return e;
}

// ------------------------------------------------------------------ gráficas de la pestaña simulación
const g = {};
let mapa = null;

function serieDe(variable, filtro) {
  if (!info || !info.vars[variable]) return [];
  const cortes = info.vars[variable].cortes;
  const idx = cortes.map((c, i) => [c, i]).filter(([c]) => filtro(c));
  return idx.map(([c, i]) => ({ nombre: `${variable.replace(/_cnp$/, '')}${cortes.length > 1 ? ` [${c}]` : ''}`, puntos: historia.map((h) => [h.t, h.medias[variable]?.[i]]) }));
}

function actualizarGraficas() {
  if (!info) return;
  const modo = $('#g-pob-modo').value;
  g.pob.log = $('#g-pob-log').checked;
  g.pob.poner(info.grupos.map((n) => ({ nombre: n, puntos: historia.map((h) => [h.t, h.animales?.grupos[n]?.[modo]]) })));
  const tejidos = historia.length && historia[historia.length - 1].plantas ? Object.keys(historia[historia.length - 1].plantas) : [];
  g.plantas.poner(tejidos.map((t) => ({ nombre: t, puntos: historia.map((h) => [h.t, h.plantas?.[t]]) })));
  const esC = (c) => c === 'element=C';
  g.hojarasca.poner(['litter_pool_above_metabolic_cnp', 'litter_pool_above_structural_cnp', 'litter_pool_woody_cnp',
    'litter_pool_below_metabolic_cnp', 'litter_pool_below_structural_cnp'].flatMap((v) => serieDe(v, esC)));
  g.suelo.poner([...['soil_cnp_pool_lmwc', 'soil_cnp_pool_maom', 'soil_cnp_pool_pom', 'soil_cnp_pool_necromass'].flatMap((v) => serieDe(v, esC)),
    ...['soil_c_pool_bacteria', 'soil_c_pool_saprotrophic_fungi', 'soil_c_pool_arbuscular_mycorrhiza', 'soil_c_pool_ectomycorrhiza'].flatMap((v) => serieDe(v, () => true))]);
  g.agua.poner([...serieDe('soil_moisture', (c) => /topsoil|subsoil/.test(c)), ...serieDe('precipitation_surface', () => true),
    ...serieDe('total_runoff', () => true), ...serieDe('groundwater_storage', () => true)]);
  g.temp.poner([...serieDe('air_temperature', (c) => /surface|above/.test(c)), ...serieDe('canopy_temperature', (c) => / 1$/.test(c)),
    ...serieDe('soil_temperature', (c) => /topsoil/.test(c))]);
  const xv = $('#x-var').value, xc = Number($('#x-corte').value || 0);
  if (xv && info.vars[xv]) {
    const u = info.vars[xv].unidad;
    g.explorador.poner([{ nombre: `${xv} [${info.vars[xv].cortes[xc]}] (media espacial, ${u})`, puntos: historia.map((h) => [h.t, h.medias[xv]?.[xc]]) }]);
  }
  dibujarTroficas();
}

function dibujarTroficas() {
  const cont = $('#troficas');
  const acum = $('#t-acum').checked;
  const tabla = {};
  const pasos = acum ? historia : historia.slice(-1);
  for (const h of pasos) {
    for (const [con, fila] of Object.entries(h.animales?.troficas || {})) {
      for (const [rec, v] of Object.entries(fila)) ((tabla[con] ||= {})[rec] = ((tabla[con] || {})[rec] || 0) + v);
    }
  }
  const recursos = [...new Set(Object.values(tabla).flatMap((f) => Object.keys(f)))].sort();
  const consumidores = Object.keys(tabla).sort();
  if (!consumidores.length) { cont.textContent = historia.length ? T('Nadie ha comido nada en este paso.', 'Nobody ate anything in this step.') : ''; return; }
  const max = Math.max(...consumidores.flatMap((c) => recursos.map((r) => tabla[c][r] || 0)));
  const t = el('table', {}, el('tr', {}, el('th', { class: 'fila' }, T('come ↓ / recurso →', 'eats ↓ / resource →')), recursos.map((r) => el('th', {}, r))));
  for (const c of consumidores) {
    t.append(el('tr', {}, el('th', { class: 'fila' }, c), recursos.map((r) => {
      const v = tabla[c][r] || 0;
      const a = v > 0 ? 0.15 + 0.85 * (Math.log10(v / max + 1e-12) + 12) / 12 : 0;
      return el('td', { style: v > 0 ? `background: rgba(47,125,75,${a.toFixed(2)}); color:${a > 0.6 ? '#fff' : css('--tinta')}` : '' }, v > 0 ? fmt(v) : '');
    })));
  }
  cont.innerHTML = '';
  cont.append(t);
}

function rellenarExplorador() {
  const s = $('#x-var');
  const previo = s.value;
  s.innerHTML = '';
  const nom = (k) => es(meta.variables[k]?.description) || k;
  for (const k of Object.keys(info.vars).sort((a, b) => nom(a).localeCompare(nom(b), enIngles() ? 'en' : 'es'))) s.append(el('option', { value: k, title: k }, nom(k)));
  s.value = info.vars[previo] ? previo : (info.vars.air_temperature ? 'air_temperature' : Object.keys(info.vars)[0]);
  rellenarCortes();
}

function rellenarCortes() {
  const v = info.vars[$('#x-var').value];
  const s = $('#x-corte');
  s.innerHTML = '';
  v.cortes.forEach((c, i) => s.append(el('option', { value: i }, c)));
  const sup = v.cortes.findIndex((c) => /superficie|suelo|elemento=C|surface|topsoil|element=C/.test(c));
  if (sup >= 0) s.value = sup;
  $('#x-desc').textContent = `${es(v.descripcion) || $('#x-var').value} [${v.unidad}]`;
  pedirMapa();
  actualizarGraficas();
}

function pedirMapa() {
  if (trabajador && info) trabajador.postMessage({ tipo: 'mapa', variable: $('#x-var').value, corte: Number($('#x-corte').value || 0) });
}

// ------------------------------------------------------------------ simulación
function botones() {
  const hay = !!info;
  const fin = hay && historia.length && historia[historia.length - 1].terminada;
  $('#b-paso').disabled = !hay || corriendo || fin;
  $('#b-correr').disabled = !hay || fin;
  $('#b-correr').textContent = corriendo ? T('❚❚ Pausa', '❚❚ Pause') : T('▶ Correr', '▶ Run');
}

function retardo() { return Math.round((100 - Number($('#velocidad').value)) * 20); }

function nuevoTrabajador() {
  if (trabajador) trabajador.terminate();
  trabajador = new Worker('trabajador.js?v=202610060036', { type: 'module' });
  trabajador.onmessage = (ev) => {
    const m = ev.data;
    if (m.tipo === 'listo') {
      info = m.info;
      historia = [];
      $('#estado').textContent = T(`${nombreEscenario}: iniciado en ${m.segundos.toFixed(1)} s · ${info.n_pasos} pasos · módulos ${info.orden.join(', ')}`, `${nombreEscenario}: started in ${m.segundos.toFixed(1)} s · ${info.n_pasos} steps · modules ${info.orden.join(', ')}`);
      rellenarExplorador();
      actualizarGraficas();
      botones();
      tPaso = performance.now();
    } else if (m.tipo === 'paso') {
      historia.push(m.resumen);
      const ahora = performance.now();
      $('#estado').textContent = T(`${nombreEscenario} · paso ${m.resumen.t + 1} de ${info.n_pasos} · ${m.resumen.fecha} · ${((ahora - tPaso) / 1000).toFixed(2)} s/paso`, `${nombreEscenario} · step ${m.resumen.t + 1} of ${info.n_pasos} · ${m.resumen.fecha} · ${((ahora - tPaso) / 1000).toFixed(2)} s/step`);
      tPaso = ahora;
      $('#barra').style.width = `${(100 * (m.resumen.t + 1)) / info.n_pasos}%`;
      actualizarGraficas();
      pedirMapa();
      botones();
    } else if (m.tipo === 'vars') {
      info.vars = m.vars;
      rellenarExplorador();
    } else if (m.tipo === 'mapa') {
      if (m.datos && m.variable === $('#x-var').value) mapa.poner(info.poligonos, m.datos, info.vars[m.variable]?.unidad);
    } else if (m.tipo === 'fin') {
      corriendo = false;
      $('#estado').textContent += T(' · terminada', ' · finished');
      botones();
    } else if (m.tipo === 'archivo') {
      if (m.que === 'zarr') descargar('model_data.zarr.zip', zip(m.ficheros.map(([k, b]) => [`model_data.zarr/${k}`, b])));
      else descargar('animales_csv.zip', zip(m.ficheros));
    } else if (m.tipo === 'error') {
      corriendo = false;
      botones();
      mostrarError(m.mensaje);
    }
  };
}

function iniciar() {
  corriendo = false;
  info = null;
  historia = [];
  botones();
  $('#barra').style.width = '0';
  $('#estado').textContent = T('Inicializando la simulación…', 'Initialising the simulation…');
  nuevoTrabajador();
  trabajador.postMessage({ tipo: 'iniciar', escenario: escenarioParaCorrer(), semilla: Number($('#semilla').value), historia: $('#historia').checked, ingles: enIngles() });
}

function exportarSeries() {
  if (!historia.length) return;
  const l = ['paso,fecha,variable,corte,media_espacial'];
  for (const h of historia) {
    for (const [k, vals] of Object.entries(h.medias)) {
      const cortes = info.vars[k]?.cortes || [];
      vals.forEach((v, i) => l.push(`${h.t},${h.fecha},${k},"${cortes[i] || ''}",${v}`));
    }
    for (const [n, gr] of Object.entries(h.animales?.grupos || {})) {
      l.push(`${h.t},${h.fecha},animales_individuos,"${n}",${gr.individuos}`, `${h.t},${h.fecha},animales_biomasa_kg,"${n}",${gr.biomasa}`);
    }
    for (const [n, v] of Object.entries(h.plantas || {})) l.push(`${h.t},${h.fecha},plantas_kgC,"${n}",${v}`);
  }
  descargar('series.csv', new Blob([l.join('\n') + '\n'], { type: 'text/csv' }));
}

// ------------------------------------------------------------------ cargar escenarios y configuraciones
async function cargarEscenario(nombre) {
  $('#estado').textContent = T(`Cargando ${nombre}…`, `Loading ${nombre}…`);
  base = await (await fetch(`../datos/escenarios/${nombre}`)).json();
  escenario = copiaProfunda(base);
  nombreEscenario = nombre.replace(/\.json$/, '');
  transformaciones = {};
  // pasadas diarias: la historia completa ocuparía cientos de MB en el navegador
  $('#historia').checked = !/day/.test(escenario.config.core.timing.update_interval);
  dibujarArbol();
  dibujarTablas();
  dibujarEntradas();
  $('#estado').textContent = T(`${nombreEscenario} cargado. Pulsa «Iniciar».`, `${nombreEscenario} loaded. Press «Start».`);
}

function guardarConfiguracion() {
  const datos = { formato: 'ecoloco-configuracion', version: 1, nombre: nombreEscenario, semilla: Number($('#semilla').value), transformaciones, escenario };
  descargar(`${nombreEscenario}_config.json`, new Blob([JSON.stringify(datos)], { type: 'application/json' }));
}

async function cargarConfiguracion(fichero) {
  const d = JSON.parse(await fichero.text());
  if (d.formato === 'ecoloco-configuracion') {
    escenario = d.escenario;
    base = copiaProfunda(d.escenario);
    transformaciones = d.transformaciones || {};
    nombreEscenario = d.nombre || fichero.name;
    $('#semilla').value = d.semilla ?? 1;
  } else if (d.config && d.inputs) { // un escenario de herramientas/convertir_entradas.py
    escenario = d; base = copiaProfunda(d); transformaciones = {}; nombreEscenario = fichero.name.replace(/\.json$/, '');
  } else throw new Error(T('No es una configuración de EcoLoco ni un escenario.', 'It is not an EcoLoco configuration or a scenario.'));
  dibujarArbol();
  dibujarTablas();
  dibujarEntradas();
  $('#estado').textContent = T(`${nombreEscenario} cargado desde fichero. Pulsa «Iniciar».`, `${nombreEscenario} loaded from file. Press «Start».`);
}

// ------------------------------------------------------------------ arranque
async function main() {
  meta = await (await fetch('../motor/meta/metadatos.json')).json();
  ES = enIngles() ? {} : await (await fetch('./es.json')).json().catch(() => ({}));
  g.pob = new Grafica($('#g-pob'), { log: true });
  g.plantas = new Grafica($('#g-plantas'));
  g.hojarasca = new Grafica($('#g-hojarasca'));
  g.suelo = new Grafica($('#g-suelo'));
  g.agua = new Grafica($('#g-agua'));
  g.temp = new Grafica($('#g-temp'));
  g.explorador = new Grafica($('#g-explorador'));
  mapa = new Mapa($('#mapa'));

  for (const b of document.querySelectorAll('#pestanas button')) {
    b.onclick = () => {
      document.querySelectorAll('#pestanas button, .panel').forEach((x) => x.classList.remove('activa'));
      b.classList.add('activa');
      $(`#p-${b.dataset.p}`).classList.add('activa');
      if (b.dataset.p === 'entradas') dibujarEntradas();
      if (b.dataset.p === 'simulacion') { Object.values(g).forEach((x) => x.pedir()); mapa.dibujar(); }
    };
  }
  const botonTema = () => { $('#b-tema').textContent = document.documentElement.dataset.tema === 'claro' ? T('☾ Oscuro', '☾ Dark') : T('☀ Claro', '☀ Light'); };
  botonTema();
  $('#b-tema').onclick = () => {
    const tema = document.documentElement.dataset.tema === 'claro' ? 'oscuro' : 'claro';
    document.documentElement.dataset.tema = tema;
    localStorage.setItem('ecoloco-tema', tema);
    botonTema();
    Object.values(g).forEach((x) => x.pedir());
    mapa.dibujar();
  };
  $('#buscar').oninput = filtrar;
  $('#b-iniciar').onclick = iniciar;
  $('#b-paso').onclick = () => trabajador?.postMessage({ tipo: 'paso' });
  $('#b-correr').onclick = () => {
    corriendo = !corriendo;
    trabajador.postMessage(corriendo ? { tipo: 'correr', retardo: retardo() } : { tipo: 'pausa' });
    tPaso = performance.now();
    botones();
  };
  $('#velocidad').oninput = () => trabajador?.postMessage({ tipo: 'retardo', retardo: retardo() });
  $('#g-pob-modo').onchange = actualizarGraficas;
  $('#g-pob-log').onchange = actualizarGraficas;
  $('#t-acum').onchange = dibujarTroficas;
  $('#x-var').onchange = rellenarCortes;
  $('#x-corte').onchange = () => { pedirMapa(); actualizarGraficas(); };
  $('#b-guardar').onclick = guardarConfiguracion;
  $('#f-cargar').onchange = (ev) => { const f = ev.target.files[0]; if (f) cargarConfiguracion(f).catch((e) => mostrarError(String(e))); ev.target.value = ''; };
  $('#b-exp-series').onclick = exportarSeries;
  $('#b-exp-animales').onclick = () => trabajador?.postMessage({ tipo: 'exportar', que: 'csv_animales' });
  $('#b-exp-zarr').onclick = () => trabajador?.postMessage({ tipo: 'exportar', que: 'zarr' });

  const lista = await (await fetch('../escenarios')).json();
  const sel = $('#escenario');
  for (const n of lista) sel.append(el('option', { value: n }, n.replace(/\.json$/, '')));
  const pedido = new URLSearchParams(location.search).get('escenario'); // ?escenario=diario
  const base = pedido ? `${pedido.replace(/\.json$/, '')}.json` : 'ejemplo.json';
  const preferido = lista.includes(base) ? base : 'ejemplo.json';
  sel.value = lista.includes(preferido) ? preferido : lista[0];
  sel.onchange = () => cargarEscenario(sel.value);
  await cargarEscenario(sel.value);
  botones();
}

main().catch((e) => mostrarError(String(e.stack || e)));
