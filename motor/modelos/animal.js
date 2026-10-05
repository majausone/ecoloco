// AnimalModel (models/animal/*): cohortes de animales que comen, se mueren, se mueven
// y devuelven nutrientes al suelo y a la hojarasca.
//
// Traducción fiel del original, incluidos sus fallos (se dejan tal cual porque el objetivo
// es dar los mismos números):
//  * Las comparaciones de Enum con str de animal_model.py nunca son ciertas: no hay
//    migración estacional, ningún grupo es "semelparous" a efectos de reproducción y todos
//    intentan reproducirse (pero la masa reproductiva nunca crece, así que no nace nadie).
//  * El metabolismo usa la constante de Boltzmann del core en J/K (1.38e-23) en una
//    fórmula que la espera en eV/K: exp(-Ea/(kB*T)) da 0 y nadie gasta energía.
//  * El tiempo de forrajeo se trunca a días enteros (timedelta64 de numpy): con paso
//    diario es 0 días y nadie come; con paso mensual casi todo el tiempo se pierde.
//    Esto es el "los herbívoros apenas comen" conocido.
//
// Para dar los mismos bits que Python hay que saber, en cada suma con sum() de Python,
// qué sumandos son float de Python y cuáles np.float64 (CPython hace suma compensada de
// Neumaier solo con los primeros). Por eso las masas guardan una marca `n*` que dice si el
// valor es np.float64. Ver sumaMixta en num/py.js.

import { exp, log, pow, asin } from '../num/ucrt.js?v=202610052205';
import { suma, sumaEje, media, mediaEje, nanmediaEje } from '../num/np.js?v=202610052205';
import { sumaMixta, mediaEstadistica, sumaPy } from '../num/py.js?v=202610052205';
import { PySet, PySetEnteros } from '../num/pyset.js?v=202610052205';
import { Arr } from '../core/arr.js?v=202610052205';
import { diasAFecha } from '../core/componentes.js?v=202610052205';
import { ModeloBase } from './base.js?v=202610052205';
import { F, I, S, B, L, tablaCSV } from '../salida/csv.js?v=202610052205';
import { f64 } from '../num/f64.js?v=202610052205';

// ------------------------------------------------------------------ rasgos (animal_traits)
const D = {};
['ALGAE', 'DETRITUS', 'FLOWERS', 'FOLIAGE', 'FRUIT', 'MUSHROOMS', 'FUNGI', 'SEEDS', 'BLOOD',
  'INVERTEBRATES', 'NECTAR', 'FISH', 'CARCASSES', 'VERTEBRATES', 'WASTE', 'WOOD', 'NONFEEDING',
  'POM', 'BACTERIA'].forEach((n, i) => { D[n] = 2 ** i; });
const DIETAS_BASICAS = Object.keys(D);
D.HERBIVORE = D.ALGAE | D.DETRITUS | D.FLOWERS | D.FOLIAGE | D.FRUIT | D.SEEDS | D.NECTAR | D.WOOD | D.NONFEEDING;
D.CARNIVORE = D.BLOOD | D.INVERTEBRATES | D.FISH | D.VERTEBRATES | D.CARCASSES | D.WASTE;
D.OMNIVORE = D.HERBIVORE | D.CARNIVORE;
export const DietType = D;

const V = { SOIL: 1, GROUND: 2, CANOPY: 4 };
export const VerticalOccupancy = V;

function parseDieta(s) {
  s = s.toLowerCase();
  if (s === 'herbivore') return D.HERBIVORE;
  if (s === 'carnivore') return D.CARNIVORE;
  if (s === 'omnivore') return D.OMNIVORE;
  let f = 0;
  for (const p of s.split('_')) {
    const k = p.toUpperCase();
    if (!(k in D)) throw new Error(`Invalid diet term in string: ${s}`);
    f |= D[k];
  }
  return f;
}

function categoriaGruesa(d) {
  const h = (d & D.HERBIVORE) !== 0, c = (d & D.CARNIVORE) !== 0;
  if (h && c) return 'OMNIVORE';
  if (c) return 'CARNIVORE';
  return 'HERBIVORE';
}

function contarCategorias(d) {
  let n = 0;
  for (const k of DIETAS_BASICAS) if (k !== 'NONFEEDING' && (d & D[k]) === D[k]) n++;
  return n;
}

// str() de un Flag de Python 3.12
function strDieta(d) {
  for (const a of ['HERBIVORE', 'CARNIVORE', 'OMNIVORE']) if (D[a] === d) return `DietType.${a}`;
  return `DietType.${DIETAS_BASICAS.filter((k) => (d & D[k]) !== 0).join('|')}`;
}

function parseOcupacion(s) {
  let f = 0;
  for (const p of s.split('_')) {
    const k = p.toUpperCase();
    if (!(k in V)) throw new Error(`Ocupación vertical desconocida: ${s}`);
    f |= V[k];
  }
  return f;
}
const ESTRATOS = ['SOIL', 'GROUND', 'CANOPY'];

const enumStr = (clase, v) => `${clase}.${v.toUpperCase()}`;

// ---------------------------------------------------- semántica de Python que importa
const pyMin = (a, b) => (b < a ? b : a);
const pyMax = (a, b) => (b > a ? b : a);
// round() de Python: al par en los empates
function redondeoPar(x) {
  const f = Math.floor(x), d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}
const expit = (x) => 1 / (1 + exp(-x));
// timedelta64(días) * float y / int: numpy trunca a entero (C cast / libdivide)
const tdPorFloat = (td, f) => { const r = td * f; return Number.isFinite(r) ? Math.trunc(r) : NaN; };
const tdEntreInt = (td, n) => (n === 0 ? NaN : Math.trunc(td / n));

// ------------------------------------------------------------------ CNP con marcas
export class CNP {
  constructor(C, N, P, nC = false, nN = false, nP = false) {
    this.C = C; this.N = N; this.P = P;
    this.nC = nC; this.nN = nN; this.nP = nP; // ¿es np.float64?
  }

  get total() { return this.C + this.N + this.P; }
  get nTotal() { return this.nC || this.nN || this.nP; }

  update(C, N, P, nC = false, nN = false, nP = false) {
    this.C += C; this.N += N; this.P += P;
    this.nC = this.nC || nC; this.nN = this.nN || nN; this.nP = this.nP || nP;
    if (this.C < 0 || this.N < 0 || this.P < 0) {
      throw new Error(`CNP mass cannot be negative. Current values: C=${this.C}, N=${this.N}, P=${this.P}.`);
    }
  }
}

// Un dict {'C','N','P'} con marcas de tipo
const masa = (C = 0, N = 0, P = 0, nC = false, nN = false, nP = false) => ({ C, N, P, nC, nN, nP });
const ELEM = ['C', 'N', 'P'];
const nk = (e) => `n${e}`;
// gan += g·conv y noAsim += g·(1 − conv), con sus marcas, para C, N y P (en ese orden; las claves escritas)
function sumarConv(gan, noAsim, g, conv) {
  gan.C += g.C * conv; gan.nC = gan.nC || g.nC;
  noAsim.C += g.C * (1.0 - conv); noAsim.nC = noAsim.nC || g.nC;
  gan.N += g.N * conv; gan.nN = gan.nN || g.nN;
  noAsim.N += g.N * (1.0 - conv); noAsim.nN = noAsim.nN || g.nN;
  gan.P += g.P * conv; gan.nP = gan.nP || g.nP;
  noAsim.P += g.P * (1.0 - conv); noAsim.nP = noAsim.nP || g.nP;
}

// ------------------------------------------------------------------ grupos funcionales
class GrupoFuncional {
  constructor(fila, k) {
    this.name = fila.name;
    this.taxa = fila.taxa;
    this.diet = parseDieta(fila.diet);
    this.metabolic_type = fila.metabolic_type;
    this.reproductive_environment = fila.reproductive_environment;
    this.reproductive_type = fila.reproductive_type;
    this.development_type = fila.development_type;
    this.development_status = fila.development_status;
    this.offspring_functional_group = fila.offspring_functional_group;
    this.excretion_type = fila.excretion_type;
    this.migration_type = fila.migration_type;
    this.vertical_occupancy = parseOcupacion(fila.vertical_occupancy);
    this.birth_mass = fila.birth_mass;
    this.adult_mass = fila.adult_mass;
    this.density_individuals_m2 = fila.density_individuals_m2;
    // multiplicador de la tasa de búsqueda (no existe en el original: columna opcional,
    // vale 1 si no está). Sirve para calibrar cada grupo a su densidad real.
    const mb = fila.search_rate_multiplier;
    this.search_rate_multiplier = mb === undefined || mb === null || mb !== mb ? 1 : mb;
    const noneONum = (v) => (v === null || v === undefined || v !== v ? null : v);
    this.t_opt = noneONum(fila.t_opt);
    this.t_max_crit = noneONum(fila.t_max_crit);
    this.t_min_crit = noneONum(fila.t_min_crit);
    const estratos = ESTRATOS.filter((s) => this.vertical_occupancy & V[s]);
    this.reference_annual_mean_temp = mediaEstadistica(estratos.map((s) => k.placeholder_annual_temp_terms[s].mean_temp));
    this.reference_annual_temp_sd = mediaEstadistica(estratos.map((s) => k.placeholder_annual_temp_terms[s].temp_sd));
    this.broad_diet = categoriaGruesa(this.diet);
    this.cnp_proportions = k.cnp_proportion_terms[this.taxa];
    this.metabolic_rate_terms = k.metabolic_rate_terms[this.metabolic_type];
    this.population_density_terms = k.density_scaling_method === 'damuth'
      ? k.damuths_law_terms[this.taxa][this.broad_diet] : k.madingley_biomass_scaling_terms;
    this.conversion_efficiency = k.conversion_efficiency[this.broad_diet];
    this.mechanical_efficiency = k.mechanical_efficiency[this.broad_diet];
    this.prey_scaling = k.prey_mass_scaling_terms[this.metabolic_type][this.taxa];
    this.is_invertebrate = this.taxa === 'invertebrate';
    this.is_vertebrate = ['bird', 'mammal', 'amphibian', 'reptile'].includes(this.taxa);
  }
}

function importarGrupos(tabla, k) {
  const d = tabla.datos, n = d.name.length, out = [];
  const num = (v) => (v === 'NaN' || v === null ? NaN : v === 'Infinity' ? Infinity : v === '-Infinity' ? -Infinity : v);
  for (let i = 0; i < n; i++) {
    const fila = {};
    for (const c of tabla.columnas) fila[c] = typeof d[c][i] === 'string' && tabla.dtypes[c] !== 'str' ? num(d[c][i]) : d[c][i];
    if (!('density_individuals_m2' in fila)) fila.density_individuals_m2 = NaN;
    for (const c of ['t_opt', 't_max_crit', 't_min_crit']) if (!(c in fila)) fila[c] = null;
    out.push(new GrupoFuncional(fila, k));
  }
  return out;
}

function grupoPorNombre(grupos, nombre) {
  const g = grupos.find((x) => x.name === nombre);
  if (!g) throw new Error(`No FunctionalGroup with name '${nombre}' found.`);
  return g;
}

// ------------------------------------------------------------------ scaling_functions
function rawBiomassDensity(fg, metodo, damuthLog = false) {
  const o = fg.density_individuals_m2;
  if (o !== null && o === o) return o * fg.adult_mass;
  const t = fg.population_density_terms;
  if (metodo === 'madingley') {
    const [exponente, escalar] = t;
    const massG = fg.adult_mass * 1000.0;
    return (escalar * pow(massG, exponente)) / 1000000000.0;
  }
  if (metodo === 'damuth') {
    // damuth_log10: la ley es log10(D) = a + b log10(M); el original usa a como multiplicador
    const ind = (damuthLog ? 10 ** t[1] : t[1]) * pow(fg.adult_mass * 1000, t[0]);
    return (ind / 1000000.0) * fg.adult_mass;
  }
  throw new Error(`Unrecognised density_scaling_method: ${metodo}`);
}

function territorySize(masaKg, [intercepto, exponente]) {
  return exp(intercepto + exponente * log(masaKg * 1000)) * 10000;
}

function bfsTerritorio(centro, objetivo, nx, ny) {
  const fila0 = Math.floor(centro / nx), col0 = centro % nx;
  const celdas = [centro];
  const visto = new Set(celdas);
  const cola = [[fila0, col0]];
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  while (cola.length && celdas.length < objetivo) {
    const [r, c] = cola.shift();
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < ny && nc >= 0 && nc < nx) {
        const nueva = nr * nx + nc;
        if (!visto.has(nueva)) {
          visto.add(nueva);
          celdas.push(nueva);
          cola.push([nr, nc]);
          if (celdas.length >= objetivo) break;
        }
      }
    }
  }
  return celdas;
}

function activityWindow(fg, temperatura, rango, k) {
  if (fg.metabolic_type === 'endothermic') return 1.0;
  let tOpt, tMax, tMin;
  if (fg.t_opt !== null && fg.t_max_crit !== null && fg.t_min_crit !== null) {
    tOpt = fg.t_opt; tMax = fg.t_max_crit; tMin = fg.t_min_crit;
  } else {
    const m = fg.reference_annual_mean_temp, sd = fg.reference_annual_temp_sd;
    tOpt = k.m_tsm * sd + k.c_tsm + m;
    tMax = k.m_tol * sd + k.c_tol + m;
    tMin = tOpt - (4.0 * (tMax - tOpt)) / 12.0;
  }
  let pAbove, pBelow;
  if (rango <= 0.0) pAbove = temperatura > tMax ? 1.0 : 0.0;
  else {
    const arg = pyMax(-1.0, pyMin(1.0, (2.0 * (tMax - temperatura)) / rango));
    pAbove = (Math.PI / 2.0 - asin(arg)) / Math.PI;
  }
  if (rango <= 0.0) pBelow = temperatura < tMin ? 1.0 : 0.0;
  else {
    const arg = pyMax(-1.0, pyMin(1.0, (2.0 * (tMin - temperatura)) / rango));
    pBelow = 1.0 - (Math.PI / 2.0 - asin(arg)) / Math.PI;
  }
  return pyMax(0.0, 1.0 - (pAbove + pBelow));
}

function preyGroupSelection(dieta, grupos, minimo = 0.0001) {
  const r = new Map();
  for (const fg of grupos) {
    if ((dieta & (D.VERTEBRATES | D.BLOOD | D.FISH)) && ['bird', 'mammal', 'amphibian', 'reptile'].includes(fg.taxa)) {
      r.set(fg.name, [minimo, 1000.0]);
    } else if ((dieta & D.INVERTEBRATES) && fg.taxa === 'invertebrate') r.set(fg.name, [minimo, 1000.0]);
  }
  if (dieta & (D.FOLIAGE | D.FLOWERS | D.FRUIT | D.SEEDS | D.NECTAR)) r.set('plants', [0, 0]);
  if (dieta & D.CARCASSES) r.set('carcasses', [0, 0]);
  if (dieta & D.WASTE) r.set('excrement', [0, 0]);
  if (dieta & D.DETRITUS) r.set('litter', [0, 0]);
  if (dieta & D.MUSHROOMS) r.set('fungal_fruiting_bodies', [0, 0]);
  if (dieta & D.FUNGI) r.set('fungi', [0, 0]);
  if (dieta & D.POM) r.set('pom', [0, 0]);
  if (dieta & D.BACTERIA) r.set('bacteria', [0, 0]);
  if (!r.size) throw new Error(`No prey groups matched for diet type: ${dieta}`);
  return r;
}

// ------------------------------------------------------------------ recursos
const ARRAY_RESOURCES = [
  ['subcanopy_vegetation_cnp', 'subcanopy_vegetation_cnp_consumed', V.GROUND, D.FOLIAGE, 'subcanopy_vegetation_litter_lignin', false, false],
  ['subcanopy_seedbank_cnp', 'subcanopy_seedbank_cnp_consumed', V.GROUND, D.SEEDS, 'subcanopy_seedbank_litter_lignin', false, false],
  ['canopy_foliage_cnp', 'canopy_foliage_cnp_consumed', V.CANOPY, D.FOLIAGE, 'senesced_leaf_lignin', true, false],
  ['canopy_seed_cnp', 'canopy_seed_cnp_consumed', V.CANOPY, D.SEEDS, null, true, false],
  ['canopy_fruit_cnp', 'canopy_fruit_cnp_consumed', V.CANOPY, D.FRUIT, null, true, false],
  ['fallen_seeds_cnp', 'fallen_seeds_cnp_consumed', V.GROUND, D.SEEDS, null, true, false],
  ['fallen_fruit_cnp', 'fallen_fruit_cnp_consumed', V.GROUND, D.FRUIT, null, true, false],
  ['litter_pool_above_metabolic_cnp', 'litter_consumed_above_metabolic_cnp', V.GROUND, D.DETRITUS, null, false, true],
  ['litter_pool_above_structural_cnp', 'litter_consumed_above_structural_cnp', V.GROUND, D.DETRITUS, 'lignin_above_structural', false, true],
  ['litter_pool_woody_cnp', 'litter_consumed_woody_cnp', V.GROUND, D.DETRITUS, 'lignin_woody', false, true],
  ['litter_pool_below_metabolic_cnp', 'litter_consumed_below_metabolic_cnp', V.SOIL, D.DETRITUS, null, false, true],
  ['litter_pool_below_structural_cnp', 'litter_consumed_below_structural_cnp', V.SOIL, D.DETRITUS, 'lignin_below_structural', false, true],
  ['fungal_fruiting_bodies_cnp', 'fungal_fruiting_bodies_consumed_cnp', V.SOIL | V.GROUND, D.MUSHROOMS, null, false, true],
].map(([pool_array, consumed_array, vertical_occupancy, diet_type, lignin_array, partition_by_pft, density]) => ({
  pool_array, consumed_array, vertical_occupancy, diet_type, lignin_array, partition_by_pft, density,
}));

class ResourcePool {
  constructor(modelo, recurso, pft) {
    this.m = modelo;
    this.resource = recurso;
    this.pft = pft;
    this.setResources();
  }

  setResources() {
    const d = this.m.data, r = this.resource, n = this.m.grid.n_cells;
    let a = d.get(r.pool_array);
    this.lignin = r.lignin_array ? d.get(r.lignin_array).data : null;
    if (this.pft !== null) a = a.sel('pft', this.pft);
    const area = this.m.grid.cell_area;
    this.porM2 = r.density || (this.m.corr.sotobosque_por_m2 && r.pool_array.startsWith('subcanopy_'));
    this.elemental = this.porM2 ? f64(a.data, (v) => v * area) : f64(a.data);
    this.elemental0 = this.elemental; // agotar_recursos resta sobre una copia
    if (this.m.corr.agotar_recursos) this.elemental = f64(this.elemental0);
    this.consumed_total_mass = new Float64Array(n);
  }

  writeConsumption() {
    const n = this.m.grid.n_cells, el = this.elemental0;
    // sotobosque_por_m2: lo consumido vuelve a kg/m², como el resto de la variable
    const deM2 = this.m.corr.sotobosque_por_m2 && !this.resource.density && this.porM2 ? this.m.grid.cell_area : 1;
    const s = sumaEje(el, [n, 3], 1).data;
    const out = new Float64Array(n * 3);
    for (let c = 0; c < n; c++) {
      // con agotar_recursos un depósito puede quedar a 0: 0/0 sería NaN
      const f = this.m.corr.agotar_recursos && !(s[c] > 0) ? 0 : this.consumed_total_mass[c] / s[c];
      for (let e = 0; e < 3; e++) out[c * 3 + e] = (el[c * 3 + e] * f) / deM2;
    }
    const dest = this.m.data.get(this.resource.consumed_array);
    if (this.pft === null) dest.data.set(out);
    else {
      const k = dest.coords.pft.indexOf(this.pft), np_ = dest.shape[1];
      for (let c = 0; c < n; c++) for (let e = 0; e < 3; e++) dest.data[(c * np_ + k) * 3 + e] = out[c * 3 + e];
    }
  }

  isForageable(dieta, ocupacion) {
    return (dieta & this.resource.diet_type) > 0 && (ocupacion & this.resource.vertical_occupancy) > 0;
  }

  // CellResource
  celda(c) {
    const el = this.elemental;
    const masa0 = (el[c * 3] + el[c * 3 + 1]) + el[c * 3 + 2];
    return {
      tipo: 'celda', pool: this, cell_id: c, vertical_occupancy: this.resource.vertical_occupancy,
      diet_type: this.resource.diet_type, mass: masa0, nMass: true,
      ratios: [el[c * 3] / masa0, el[c * 3 + 1] / masa0, el[c * 3 + 2] / masa0],
      lignin: this.lignin ? this.lignin[c] : 0.0,
    };
  }
}

// CellResource.get_eaten
function comerCelda(r, pedido, consumidor) {
  // agotar_recursos: nadie encuentra la última migaja; como mucho la mitad de lo que queda
  const actual = r.pool.m.corr.agotar_recursos ? Math.min(0.5 * r.mass, pedido) : pyMin(r.mass, pedido);
  if (actual <= 0) return { gain: masa(0, 0, 0), waste: masa(0, 0, 0), wasteVacio: false, lignin: 0.0 };
  r.mass -= actual;
  const ingerido = actual * consumidor.fg.mechanical_efficiency;
  const resto = actual - ingerido;
  r.pool.consumed_total_mass[r.cell_id] += actual;
  if (r.pool.m.corr.agotar_recursos) {
    const el = r.pool.elemental;
    for (let e = 0; e < 3; e++) el[r.cell_id * 3 + e] = Math.max(0, el[r.cell_id * 3 + e] - r.ratios[e] * actual);
  }
  const g = r.ratios.map((x) => x * ingerido), w = r.ratios.map((x) => x * resto);
  return { gain: masa(g[0], g[1], g[2], true, true, true), waste: masa(w[0], w[1], w[2], true, true, true), wasteVacio: false, lignin: r.lignin };
}

// ScavengeableMixin.get_eaten (cadáveres y excrementos)
function comerCarroña(pool, pedido, nPedido, consumidor) {
  const s = pool.scavengeable_cnp;
  const disponible = s.total, nDisp = s.nTotal;
  if (disponible === 0.0) return { gain: masa(0, 0, 0), waste: null, lignin: 0.0 };
  const tomado = pyMin(pedido, disponible);
  const nTom = disponible < pedido ? nDisp : nPedido;
  const mech = consumidor.fg.mechanical_efficiency;
  const ing = tomado * mech, perdido = tomado * (1.0 - mech);
  const fr = [s.C / disponible, s.N / disponible, s.P / disponible];
  const nFr = [s.nC || nDisp, s.nN || nDisp, s.nP || nDisp];
  const gain = masa(ing * fr[0], ing * fr[1], ing * fr[2], nTom || nFr[0], nTom || nFr[1], nTom || nFr[2]);
  s.update(-tomado * fr[0], -tomado * fr[1], -tomado * fr[2], nTom || nFr[0], nTom || nFr[1], nTom || nFr[2]);
  pool.decomposed_cnp.update(perdido * fr[0], perdido * fr[1], perdido * fr[2], nTom || nFr[0], nTom || nFr[1], nTom || nFr[2]);
  return { gain, waste: null, lignin: 0.0 };
}

// SoilPool.get_eaten
function comerSuelo(pool, pedido, nPedido, consumidor) {
  if (pedido < 0) throw new Error('consumed_mass must be non-negative');
  const m = pool.mass_cnp;
  const total = m.total, nTot = m.nTotal;
  const minimo = pyMin(pedido, total);
  const nMin = total < pedido ? nTot : nPedido;
  const actual = minimo * consumidor.fg.mechanical_efficiency;
  const fr = [m.C / total, m.N / total, m.P / total];
  const nFr = [m.nC || nTot, m.nN || nTot, m.nP || nTot];
  const t = fr.map((f) => actual * f);
  const gain = masa(t[0], t[1], t[2], nMin || nFr[0], nMin || nFr[1], nMin || nFr[2]);
  m.update(-t[0], -t[1], -t[2], gain.nC, gain.nN, gain.nP);
  return { gain, waste: null, lignin: 0.0 };
}

class PoolDescomp {
  constructor(cell_id) {
    this.scavengeable_cnp = new CNP(0.001, 0.0001, 1e-06);
    this.decomposed_cnp = new CNP(0.0, 0.0, 0.0);
    this.cell_id = cell_id;
    this.vertical_occupancy = V.GROUND;
    this.tipo = 'carroña';
  }

  get mass() { return this.scavengeable_cnp.total; }
  get nMass() { return this.scavengeable_cnp.nTotal; }
  reset() { this.decomposed_cnp = new CNP(0.0, 0.0, 0.0); }
}

class SoilPool {
  constructor(nombre, cell, m) {
    this.pool_name = nombre;
    this.cell_id = cell;
    this.vertical_occupancy = V.SOIL;
    this.tipo = 'suelo';
    const d = m.data, area = m.grid.cell_area, prof = m.core_constants.microbial_simulation_depth;
    const pos = (v) => (v >= 0 ? v : 0); // .where(x >= 0).fillna(0)
    if (nombre === 'pom') {
      const a = d.get('soil_cnp_pool_pom');
      const k = (e) => a.data[cell * 3 + a.coords.element.indexOf(e)];
      this.mass_cnp = new CNP(k('C') * area * prof, k('N') * area * prof, k('P') * area * prof);
    } else if (nombre === 'bacteria') {
      const c = pos(d.get('soil_c_pool_bacteria').data[cell]) * area * prof;
      const r = m.microbial_c_n_p_ratios.bacteria;
      this.mass_cnp = new CNP(c, c / r.N, c / r.P);
    } else {
      const sap = pos(d.get('soil_c_pool_saprotrophic_fungi').data[cell]);
      const am = pos(d.get('soil_c_pool_arbuscular_mycorrhiza').data[cell]);
      const ecm = pos(d.get('soil_c_pool_ectomycorrhiza').data[cell]);
      const r = m.microbial_c_n_p_ratios;
      const c = sap + am + ecm;
      const n = sap / r.saprotrophic_fungi.N + am / r.arbuscular_mycorrhiza.N + ecm / r.ectomycorrhiza.N;
      const p = sap / r.saprotrophic_fungi.P + am / r.arbuscular_mycorrhiza.P + ecm / r.ectomycorrhiza.P;
      this.mass_cnp = new CNP(c * area * prof, n * area * prof, p * area * prof);
    }
    if (this.mass_cnp.total < 0) throw new Error(`${nombre}: negative mass detected in cell ${cell}`);
  }

  get mass() { return this.mass_cnp.C; }
  get nMass() { return this.mass_cnp.nC; }
}

class HerbivoryWaste {
  constructor() {
    this.above = { C: 0.0, N: 0.0, P: 0.0 };
    this.above_lignin = 0.0;
    this.below = { C: 0.0, N: 0.0, P: 0.0 };
    this.below_lignin = 0.0;
  }

  _lignina(estrato, carbono, lignina) {
    const k = `${estrato}_lignin`;
    if (carbono === 0) return;
    const actualC = this[estrato].C;
    this[k] = (lignina * carbono + this[k] * actualC) / (carbono + actualC);
  }

  addWaste(m, ocupacion, lignina) {
    if (ELEM.some((e) => m[e] < 0)) m = { C: m.C > 0 ? m.C : 0, N: m.N > 0 ? m.N : 0, P: m.P > 0 ? m.P : 0 };
    const todos = V.SOIL | V.GROUND | V.CANOPY;
    if ((ocupacion & V.SOIL) === V.SOIL) {
      if (ocupacion === V.SOIL) {
        this._lignina('below', m.C, lignina);
        for (const e of ELEM) this.below[e] += m[e];
      } else if ((ocupacion & todos) === todos) {
        this._lignina('above', (2 / 3) * m.C, lignina);
        this._lignina('below', (1 / 3) * m.C, lignina);
        for (const e of ELEM) { this.above[e] += (2 / 3) * m[e]; this.below[e] += (1 / 3) * m[e]; }
      } else {
        this._lignina('above', 0.5 * m.C, lignina);
        this._lignina('below', 0.5 * m.C, lignina);
        for (const e of ELEM) { this.above[e] += 0.5 * m[e]; this.below[e] += 0.5 * m[e]; }
      }
    } else {
      this._lignina('above', m.C, lignina);
      for (const e of ELEM) this.above[e] += m[e];
    }
  }
}

// ------------------------------------------------------------------ cohortes
class Cohorte {
  constructor(m, fg, mass, age, individuals, centroid) {
    if (age < 0) throw new Error('Age must be a positive number.');
    if (mass < 0) throw new Error('Mass must be a positive number.');
    const k = m.k;
    this.m = m;
    m.azar.nCohorte += 1;
    this.orden = m.azar.nCohorte; // hash del set de presas (ver herramientas/oraculo.py)
    this.fg = fg;
    this.name = fg.name;
    this.age = age;
    this.individuals = individuals;
    this.centroid_key = centroid;
    this.location_status = 'active';
    this.remaining_time_away = 0.0;
    this.id = m.azar.uuid4();
    this.is_alive = true;
    this.is_mature = false;
    this.time_to_maturity = 0.0;
    this.time_since_maturity = 0.0;
    this.prey_groups = new Map();
    this.territory_size = territorySize(fg.adult_mass, k.territory_size_terms[fg.metabolic_type][fg.taxa]);
    this.territory_cells = Math.ceil(this.territory_size / m.grid.cell_area);
    this.occupancy_proportion = 1.0 / this.territory_cells;
    this.territory = this.celdasTerritorio(centroid);
    this.sigma_f_t = 1.0;
    this.reference_temp = fg.reference_annual_mean_temp;
    this.current_temperature = fg.reference_annual_mean_temp;
    this.decay_fraction_excrement = k.decay_rate_excrement / (k.scavenging_rate_excrement + k.decay_rate_excrement);
    this.decay_fraction_carcasses = k.decay_rate_carcasses / (k.scavenging_rate_carcasses + k.decay_rate_carcasses);
    this.cnp_proportions = fg.cnp_proportions;
    const p = this.cnp_proportions;
    if (!(Math.abs(sumaPy([p.C, p.N, p.P]) - 1.0) < 1e-06)) throw new Error('CNP proportions must sum to 1.');
    this.mass_cnp = new CNP(mass * p.C, mass * p.N, mass * p.P);
    this.reproductive_mass_cnp = new CNP(0.0, 0.0, 0.0);
    this.largest_mass_achieved = mass;
    this.diet_category_count = contarCategorias(fg.diet);
    this.trophic_record = new Map(); // "kind\u0000id" -> {kind, id, C, N, P}
  }

  get mass() { return this.mass_cnp.total; }
  get nMass() { return this.mass_cnp.nTotal; }
  get reproductive_mass() { return this.reproductive_mass_cnp.total; }

  celdasTerritorio(c) { return bfsTerritorio(c, this.territory_cells, this.m.grid.cell_nx, this.m.grid.cell_ny); }

  updateLargestMass() {
    if (this.mass > this.largest_mass_achieved) this.largest_mass_achieved = pyMin(this.mass, this.fg.adult_mass);
  }

  recordTrophic(kind, id, g) {
    const total = (g.C + g.N) + g.P;
    if (total === 0.0) return;
    const clave = `${kind}\u0000${id}`;
    let e = this.trophic_record.get(clave);
    if (!e) { e = { kind, id, C: 0.0, N: 0.0, P: 0.0 }; this.trophic_record.set(clave, e); }
    e.C += g.C; e.N += g.N; e.P += g.P;
  }

  clampRuido(g) {
    const tol = this.m.k._ELEMENTAL_MASS_NOISE_TOLERANCE;
    const out = { ...g };
    for (const e of ELEM) if (-tol < g[e] && g[e] < 0.0) { out[e] = 0.0; out[nk(e)] = false; }
    return out;
  }

  grow(ingesta) {
    if (this.individuals <= 0) return masa(0.0, 0.0, 0.0);
    const p = this.cnp_proportions;
    let maxG = ingesta.C / p.C, nMax = ingesta.nC;
    for (const e of ['N', 'P']) {
      const v = ingesta[e] / p[e];
      if (v < maxG) { maxG = v; nMax = ingesta[nk(e)]; }
    }
    const used = { C: maxG * p.C, N: maxG * p.N, P: maxG * p.P };
    const ind = this.individuals;
    // reproduccion: un adulto (masa >= umbral × masa adulta) manda lo que crece a la masa reproductiva
    const destino = this.m.corr.reproduccion && this.mass >= this.m.k.flow_to_reproductive_mass_threshold * this.fg.adult_mass
      ? this.reproductive_mass_cnp : this.mass_cnp;
    destino.update(used.C / ind, used.N / ind, used.P / ind, nMax, nMax, nMax);
    const w = masa();
    for (const e of ELEM) {
      let v = ingesta[e] - used[e], nv = ingesta[nk(e)] || nMax;
      if (v < 0.0) {
        if (v > -this.m.k._GROWTH_WASTE_TOLERANCE * pyMax(Math.abs(ingesta[e]), 1.0)) { v = 0.0; nv = false; } else {
          throw new Error(`grow produced negative waste for ${e}: ${v}`);
        }
      }
      w[e] = v; w[nk(e)] = nv;
    }
    return w;
  }

  // gasto metabólico por individuo y día (kg de C)
  tasaMetabolica(temperatura) {
    const k = this.m.k, fg = this.fg;
    const [Es, Ea] = k.metabolic_scaling_coefficients;
    const kB = this.m.corr.boltzmann_ev ? BOLTZMANN_EV : this.m.core_constants.boltzmann_constant;
    const massG = this.mass * 1000;
    const [Ib, bb] = fg.metabolic_rate_terms.basal;
    const [If, bf] = fg.metabolic_rate_terms.field;
    const Tk = fg.metabolic_type === 'endothermic' ? 310.0 : temperatura + 273.15;
    const s = this.sigma_f_t;
    return (Es * (s * If * exp(-(Ea / (kB * Tk))) * pow(massG, bf)
      + (1 - s) * Ib * exp(-(Ea / (kB * Tk))) * pow(massG, bb))) / 1000;
  }

  metabolize(temperatura, dtDias) {
    if (this.mass_cnp.C < 0) throw new Error('Carbon mass (C) cannot be negative.');
    if (this.m.corr.metabolismo_con_comida) {
      // primero se gasta el carbono sobrante de lo comido; lo que falte, del cuerpo
      const potencial = this.tasaMetabolica(temperatura) * dtDias;
      const reserva = this.individuals > 0 ? (this._reservaC || 0) / this.individuals : 0;
      this._reservaC = 0;
      const deReserva = Math.min(potencial, reserva);
      // lo que sale del cuerpo es tejido entero: el N y el P van al excremento (urea...)
      const m = this.mass_cnp;
      const delCuerpo = Math.min(m.C, potencial - deReserva);
      const dN = m.C > 0 ? delCuerpo * (m.N / m.C) : 0, dP = m.C > 0 ? delCuerpo * (m.P / m.C) : 0;
      m.update(-delCuerpo, -Math.min(dN, m.N), -Math.min(dP, m.P), this.nMass, this.nMass, this.nMass);
      return masa((deReserva + delCuerpo) * this.individuals, dN * this.individuals, dP * this.individuals, this.nMass, this.nMass, this.nMass);
    }
    const k = this.m.k, fg = this.fg;
    const [Es, Ea] = k.metabolic_scaling_coefficients;
    const kB = this.m.corr.boltzmann_ev ? BOLTZMANN_EV : this.m.core_constants.boltzmann_constant;
    const massG = this.mass * 1000;
    const [Ib, bb] = fg.metabolic_rate_terms.basal;
    const [If, bf] = fg.metabolic_rate_terms.field;
    const Tk = fg.metabolic_type === 'endothermic' ? 310.0 : temperatura + 273.15;
    const s = this.sigma_f_t;
    const tasa = (Es * (s * If * exp(-(Ea / (kB * Tk))) * pow(massG, bf)
      + (1 - s) * Ib * exp(-(Ea / (kB * Tk))) * pow(massG, bb))) / 1000;
    const potencial = tasa * dtDias, nPot = this.nMass;
    const C = this.mass_cnp.C;
    const actual = pyMin(C, potencial);
    const nAct = potencial < C ? nPot : this.mass_cnp.nC;
    this.mass_cnp.update(-actual, 0.0, 0.0, nAct, false, false);
    return masa(actual * this.individuals, 0.0, 0.0, nAct, false, false);
  }

  excrete(excreta, pools) {
    const n = pools.length;
    if (!n) throw new Error('No excrement pools provided for waste distribution.');
    for (const pool of pools) {
      const f1 = 1 - this.decay_fraction_excrement, f2 = this.decay_fraction_excrement;
      pool.scavengeable_cnp.update((excreta.C / n) * f1, (excreta.N / n) * f1, (excreta.P / n) * f1, excreta.nC, excreta.nN, excreta.nP);
      pool.decomposed_cnp.update((excreta.C / n) * f2, (excreta.N / n) * f2, (excreta.P / n) * f2, excreta.nC, excreta.nN, excreta.nP);
    }
  }

  respire(excreta) { return excreta.C * this.m.k.carbon_excreta_proportion; }

  defecate(pools, residuo) {
    const n = pools.length;
    if (!n) throw new Error('No excrement pools provided for waste distribution.');
    for (const pool of pools) {
      const pp = { C: residuo.C / n, N: residuo.N / n, P: residuo.P / n };
      const f1 = 1 - this.decay_fraction_excrement, f2 = this.decay_fraction_excrement;
      pool.scavengeable_cnp.update(pp.C * f1, pp.N * f1, pp.P * f1, residuo.nC, residuo.nN, residuo.nP);
      pool.decomposed_cnp.update(pp.C * f2, pp.N * f2, pp.P * f2, residuo.nC, residuo.nN, residuo.nP);
    }
  }

  increaseAge(dtDias) {
    this.age += dtDias;
    if (this.is_mature === true) this.time_since_maturity += dtDias;
    else if (this.mass >= this.fg.adult_mass) {
      this.is_mature = true;
      this.time_to_maturity = this.age;
    }
  }

  dieIndividual(n, pools) {
    if (n === 0) return;
    if (n < 0) throw new Error(`Number of deaths must be non-negative, got ${n}.`);
    if (n > this.individuals) throw new Error(`Number of deaths (${n}) exceeds cohort size (${this.individuals}).`);
    const m = this.mass_cnp;
    this.individuals -= n;
    this.updateCarcassPool(m.C * n, m.N * n, m.P * n, m.nC, m.nN, m.nP, pools);
  }

  updateCarcassPool(C, N, P, nC, nN, nP, pools) {
    if (C < 0 || N < 0 || P < 0) throw new Error(`Carcass mass values must be non-negative. Provided: C=${C}, N=${N}, P=${P}`);
    const n = pools.length;
    if (!n) throw new Error('No carcass pools provided for waste distribution.');
    const c = C / n, nn = N / n, p = P / n;
    const fs = 1 - this.decay_fraction_carcasses, fd = this.decay_fraction_carcasses;
    for (const pool of pools) {
      pool.scavengeable_cnp.update(c * fs, nn * fs, p * fs, nC, nN, nP);
      pool.decomposed_cnp.update(c * fd, nn * fd, p * fd, nC, nN, nP);
    }
  }

  // la cohorte (presa) es comida por `depredador`
  getEaten(potencial, depredador, carcassPools) {
    if (this.mass <= 0) throw new Error('Prey cohort mass must be greater than zero.');
    const im = this.mass, nIm = this.nMass;
    // caza_redondeo: ceil mata un individuo entero aunque el depredador solo quiera un
    // bocado; con la corrección se redondea al azar (misma media)
    const x = potencial / im;
    const maxMuertos = this.m.corr.caza_redondeo ? Math.floor(x + this.m.azar.np.random_sample()) : Math.ceil(x);
    if (maxMuertos === 0) return masa(0.0, 0.0, 0.0);
    const muertos = Math.min(maxMuertos, this.individuals);
    const masaMuerta = muertos * im;
    // con caza_redondeo el depredador se come lo que caza (de media, lo que tocaba)
    const consumida = this.m.corr.caza_redondeo ? masaMuerta : pyMin(masaMuerta, potencial);
    const tras = consumida * depredador.fg.mechanical_efficiency;
    const carcasa = masaMuerta - tras;
    const m = this.mass_cnp;
    const g = masa((m.C / im) * tras, (m.N / im) * tras, (m.P / im) * tras, nIm, nIm, nIm);
    const cC = (m.C / im) * carcasa, cN = (m.N / im) * carcasa, cP = (m.P / im) * carcasa;
    this.individuals -= muertos;
    if (this.m.eventos && muertos > 0) this.m.eventos.push({ tipo: 'caza', cazador: depredador.id, presa: this.id, n: muertos, masa: masaMuerta, comido: tras });
    if (this.individuals <= 0) this.is_alive = false;
    const comunes = interseccion(this, depredador);
    const pools = comunes.flatMap((c) => carcassPools.get(c));
    this.updateCarcassPool(cC, cN, cP, nIm, nIm, nIm, pools);
    return g;
  }

  massBin(masaPresa, thetaOpt) {
    if (masaPresa <= 0.0) throw new Error(`prey_mass must be positive, got ${masaPresa}.`);
    if (this.mass <= 0.0) throw new Error(`Predator mass_current must be positive, got ${this.mass}.`);
    const k = this.m.k;
    return redondeoPar((log(masaPresa / this.mass) - thetaOpt) / (0.5 * k.sigma_opt_pred_prey) + 2 * k.N_sigma_opt_pred_prey);
  }

  wBar(masaPresa, thetaOpt) {
    const z = (log(masaPresa / this.mass) - log(thetaOpt)) / this.m.k.sigma_opt_pred_prey;
    return exp(-pow(z, 2));
  }

  alphaPred(wbar) {
    const a = this.m.k.alpha_0_pred * (this.mass * 1000.0) * wbar;
    return this.fg.search_rate_multiplier === 1 ? a : a * this.fg.search_rate_multiplier;
  }

  // sf.k_i_j
  static kij(alpha, N, area, theta) { return alpha * (N / (area / 10000.0)) * theta; }

  // sf.H_i_j
  hij(masaPresa) {
    const k = this.m.k;
    return k.h_pred_0 * pow(k.M_pred_ref / (this.mass * 1000.0), k.b_pred) * (masaPresa * 1000.0);
  }

  deltaMassPredation(presas, carcassPools, dtDias) {
    const gan = masa(0.0, 0.0, 0.0), noAsim = masa(0.0, 0.0, 0.0);
    if (!presas.length) return [gan, noAsim];
    const k = this.m.k;
    const thetaOpt = pyMax(k.theta_opt_min_f, this.m.azar.np.normal(k.theta_opt_f, k.sigma_opt_f));
    const area = this.m.grid.cell_area, np = presas.length;
    // (lo de cada presa, por su índice: las presas no se repiten, salen de un set)
    // las celdas que comparte con cada presa, con una máscara de su territorio (lo que cuantasComunes)
    const mascara = mascaraTerritorio(this, this.m.grid.n_cells), areas = new Float64Array(np);
    for (let i = 0; i < np; i++) { const t = celdasTerritorio(presas[i]); let nc = 0; for (let j = 0; j < t.length; j++) nc += mascara[t[j]]; areas[i] = nc * area; }
    soltarMascara(this, mascara);
    const ha = area / 10000.0;
    // clase de tamaño y éxito de ataque de cada presa: en el original se recalculan en cada
    // uso, pero solo dependen de las masas, que no cambian durante el forrajeo
    const clase = new Array(np), alfa = new Float64Array(np);
    for (let i = 0; i < np; i++) clase[i] = this.massBin(presas[i].mass, thetaOpt);
    for (let i = 0; i < np; i++) alfa[i] = this.alphaPred(this.wBar(presas[i].mass, thetaOpt));
    const bins = new Map();
    for (let i = 0; i < np; i++) {
      const b = clase[i];
      bins.set(b, (bins.has(b) ? bins.get(b) : 0.0) + presas[i].individuals / ha);
    }
    const sumandos = [], marcas = [];
    for (let i = 0; i < np; i++) {
      const p = presas[i];
      const b = bins.has(clase[i]) ? bins.get(clase[i]) : 0.0;
      // caza_lineal: encuentros proporcionales a la densidad de presas (Madingley); el
      // original la multiplica además por la densidad de su clase de tamaño
      const bb = this.m.corr.caza_lineal ? 1 : b;
      sumandos.push(this.hij(p.mass) * Cohorte.kij(alfa[i], p.individuals, areas[i], bb));
      marcas.push(this.nMass || p.nMass);
    }
    const manejo = sumaMixta(sumandos, marcas);
    const conv = this.fg.conversion_efficiency;
    for (let i = 0; i < np; i++) {
      const p = presas[i];
      const a = areas[i];
      if (a === 0.0) continue;
      // F_i_j_individual
      let F = 0.0;
      const N = p.individuals;
      if (N > 0) {
        const alpha = alfa[i];
        const tb = clase[i];
        const theta = bins.has(tb) ? bins.get(tb) : 0.0;
        const kt = Cohorte.kij(alpha, N, a, this.m.corr.caza_lineal ? 1 : theta);
        F = this.individuals * (kt / (1 + manejo)) * (1 / N);
      }
      const consumida = p.mass * p.individuals * (1 - exp(-(F * dtDias)));
      const g = p.getEaten(consumida, this, carcassPools);
      this.recordTrophic('cohort', p.id, g);
      sumarConv(gan, noAsim, g, conv);
    }
    return [gan, noAsim];
  }

  forageResourceList(recursos, dtDias, tipo, residuosHerb) {
    const gan = masa(0.0, 0.0, 0.0), noAsim = masa(0.0, 0.0, 0.0);
    if (!recursos.length) return [gan, noAsim];
    const k = this.m.k;
    const alpha0 = k.alpha_0_herb * (this.mass * 1000.0), nAlpha = this.nMass;
    const alpha = this.fg.search_rate_multiplier === 1 ? alpha0 : alpha0 * this.fg.search_rate_multiplier;
    const A = this.m.grid.cell_area;
    const kik = (B) => alpha * pow((B * 1000.0) / (A / 10000.0), 2);
    const hPorGramo = k.h_herb_0 * pow(k.M_herb_ref / (this.mass * 1000.0), k.b_herb);
    const manejo = hPorGramo * sumaMixta(recursos.map((r) => kik(r.mass)), recursos.map((r) => nAlpha || r.nMass));
    const conv = this.fg.conversion_efficiency;
    for (const r of recursos) {
      const pot = kik(r.mass);
      const F = (this.individuals * (pot / (1.0 + manejo))) / (r.mass * 1000.0);
      const pedido = r.mass * (1.0 - exp(-F * dtDias));
      const nPedido = r.nMass;
      let res;
      if (r.tipo === 'celda') res = comerCelda(r, pedido, this);
      else if (r.tipo === 'suelo') res = comerSuelo(r, pedido, nPedido, this);
      else res = comerCarroña(r, pedido, nPedido, this);
      const g = this.clampRuido(res.gain);
      const w = res.waste ? this.clampRuido(res.waste) : null;
      this.recordTrophic(tipo, String(r.cell_id), g);
      sumarConv(gan, noAsim, g, conv);
      if (residuosHerb && w) residuosHerb.get(r.cell_id).addWaste(w, r.vertical_occupancy, res.lignin);
    }
    return [gan, noAsim];
  }

  forageCohort(l, dt) {
    if (this.individuals === 0) return;
    if (this.mass === 0) return;
    const herbDietas = [D.ALGAE, D.FLOWERS, D.FOLIAGE, D.FRUIT, D.SEEDS, D.NECTAR, D.WOOD];
    const plantas = l.arrays.filter((r) => herbDietas.includes(r.diet_type));
    const hojarasca = l.arrays.filter((r) => r.diet_type === D.DETRITUS);
    const setas = l.arrays.filter((r) => r.diet_type === D.MUSHROOMS);
    const tDieta = this.m.corr.forrajeo_continuo
      ? (this.m.update_interval_in_days * this.m.k.tau_f * this.sigma_f_t) / this.diet_category_count
      : tdEntreInt(tdPorFloat(tdPorFloat(dt, this.m.k.tau_f), this.sigma_f_t), this.diet_category_count);
    const dtDias = tDieta;
    const gan = masa(0.0, 0.0, 0.0), noAsim = masa(0.0, 0.0, 0.0);
    const sumar = ([g, u]) => {
      gan.C += g.C; gan.nC = gan.nC || g.nC;
      noAsim.C += u.C; noAsim.nC = noAsim.nC || u.nC;
      gan.N += g.N; gan.nN = gan.nN || g.nN;
      noAsim.N += u.N; noAsim.nN = noAsim.nN || u.nN;
      gan.P += g.P; gan.nP = gan.nP || g.nP;
      noAsim.P += u.P; noAsim.nP = noAsim.nP || u.nP;
    };
    const W = this.m.herbivory_waste_pools;
    // tiempo_plantas: las categorías vegetales de la dieta se comen en una sola llamada, así
    // que les toca el tiempo de todas ellas (el original le da el de una sola)
    const nVeg = this.m.corr.tiempo_plantas ? herbDietas.filter((d) => this.fg.diet & d).length || 1 : 1;
    if (plantas.length) sumar(this.forageResourceList(plantas, dtDias * nVeg, 'plant_resource', W));
    // tiempo_presas: vertebrados e invertebrados se cazan en una sola llamada
    const nPresa = this.m.corr.tiempo_presas ? [D.BLOOD, D.INVERTEBRATES, D.FISH, D.VERTEBRATES].filter((d) => this.fg.diet & d).length || 1 : 1;
    if (l.presas.length) sumar(this.deltaMassPredation(l.presas, this.m.carcass_pools, dtDias * nPresa));
    if (setas.length) sumar(this.forageResourceList(setas, dtDias, 'fungal_fruit_pool', W));
    if (l.hongos.length) sumar(this.forageResourceList(l.hongos, dtDias, 'soil_fungi_pool'));
    if (l.pom.length) sumar(this.forageResourceList(l.pom, dtDias, 'pom_pool'));
    if (l.bacterias.length) sumar(this.forageResourceList(l.bacterias, dtDias, 'bacteria_pool'));
    if (hojarasca.length) sumar(this.forageResourceList(hojarasca, dtDias, 'litter_pool'));
    if (l.cadaveres.length) sumar(this.forageResourceList(l.cadaveres, dtDias, 'carcass_pool'));
    if (l.excrementos.length) sumar(this.forageResourceList(l.excrementos, dtDias, 'excrement_pool'));
    if (ELEM.some((e) => gan[e] > 0) || ELEM.some((e) => noAsim[e] > 0)) this.eat(gan, noAsim, l.poolsExcremento);
  }

  eat(consumida, noAsim, pools) {
    if (this.individuals === 0) return;
    for (const m of [consumida, noAsim]) if (ELEM.some((e) => m[e] < 0)) throw new Error('Values must be non-negative');
    if (!pools.length) throw new Error('At least one excrement pool must be provided.');
    const w = this.grow(consumida);
    if (this.m.corr.metabolismo_con_comida) {
      // el carbono sobrante (que no cabe en el cuerpo por estequiometría) paga el gasto del día
      const necesidad = this.tasaMetabolica(this.current_temperature) * this.m.update_interval_in_days * this.individuals;
      const r = Math.min(w.C, Math.max(0, necesidad - (this._reservaC || 0)));
      w.C -= r;
      this._reservaC = (this._reservaC || 0) + r;
    }
    const residuo = masa();
    for (const e of ELEM) { residuo[e] = noAsim[e] + w[e]; residuo[nk(e)] = noAsim[nk(e)] || w[nk(e)]; }
    this.defecate(pools, residuo);
  }

  isBelowMassThreshold(umbral) { return (this.mass + this.reproductive_mass) / this.fg.adult_mass < umbral; }

  dispersalDistance(dtDias) {
    const k = this.m.k;
    const v = k.V_disp * pow((this.mass * 1000.0) / k.M_disp_ref, k.o_disp);
    return v * 1000.0 * (dtDias / 30.0);
  }

  migrateJuvenileProbability(dtDias) {
    return pyMin(1.0, this.dispersalDistance(dtDias) / Math.sqrt(this.m.grid.cell_area));
  }

  inflictNonPredationMortality(dtDias, pools) {
    const k = this.m.k;
    const u_bg = k.u_bg;
    let u_se = 0.0;
    if (this.is_mature) u_se = k.lambda_se * exp(this.time_since_maturity / this.time_to_maturity);
    const Mmax = this.largest_mass_achieved;
    const kk = -(this.mass - k.J_st * Mmax) / (k.zeta_st * Mmax);
    const u_st = k.lambda_max * expit(kk);
    const u_t = u_bg + u_se + u_st;
    const muertos = this.m.azar.np.binomial(this.individuals, 1 - exp(-u_t * dtDias));
    if (this.m.eventos && muertos > 0) this.m.eventos.push({ tipo: 'muerte', cohorte: this.id, n: muertos, causa: 'natural' });
    this.dieIndividual(muertos, pools);
  }

  matchVertical(o) { return (o & this.fg.vertical_occupancy) !== 0; }

  canPreyOn(p) {
    if (!this.prey_groups.has(p.fg.name)) return false;
    const [mn, mx] = this.prey_groups.get(p.fg.name);
    return mn <= p.mass && p.mass <= mx && p.individuals > 0 && p !== this && this.matchVertical(p.fg.vertical_occupancy);
  }

  getPrey(comunidades, dietaPresa) {
    const inv = (dietaPresa & D.INVERTEBRATES) !== 0, vert = (dietaPresa & D.VERTEBRATES) !== 0;
    // (un set de CPython con el hash de cada presa, su número de orden: entero y pequeño, sin BigInt)
    // (cada presa se mira la primera vez que sale: está en muchas celdas del territorio, y volver a añadirla al
    // set no hace nada, ni puede cambiar si es presa o no mientras se recorre)
    // (vista: una marca en la presa con el número de esta llamada, que es lo mismo que un Set de vistas)
    const s = new PySetEnteros(), vez = ++VECES_GETPREY;
    for (const c of this.territory) {
      for (const p of comunidades.get(c)) {
        if (p._vistaEn === vez) continue;
        p._vistaEn = vez;
        if (!this.canPreyOn(p)) continue;
        if ((inv && p.fg.is_invertebrate) || (vert && p.fg.is_vertebrate)) s.add(p, p.orden);
      }
    }
    return s.toArray();
  }

  enTerritorio(mapa, filtro) {
    const r = [];
    for (const c of this.territory) {
      const e = mapa.get(c);
      if (e === undefined) continue;
      let items = Array.isArray(e) ? e : [e];
      if (filtro) items = items.filter(filtro);
      r.push(...items);
    }
    return r;
  }

  getArrayResources(pools) {
    const r = [];
    for (const p of pools) {
      if (p.isForageable(this.fg.diet, this.fg.vertical_occupancy)) for (const c of this.territory) r.push(p.celda(c));
    }
    return r;
  }

  sueloDeTipo(soilPools, tipo) {
    const mapa = new Map();
    for (const [c, ps] of soilPools) if (ps.has(tipo)) mapa.set(c, ps.get(tipo));
    return this.enTerritorio(mapa, (r) => this.matchVertical(r.vertical_occupancy));
  }

  climaEstrato(c, cl) {
    const t = [], d = [];
    const o = this.fg.vertical_occupancy;
    if (o & V.CANOPY) { t.push(cl.canopy_temperature[c]); d.push(cl.canopy_diurnal_range[c]); }
    if (o & V.GROUND) { t.push(cl.ground_temperature[c]); d.push(cl.ground_diurnal_range[c]); }
    if (o & V.SOIL) { t.push(cl.soil_temperature[c]); d.push(cl.soil_diurnal_range[c]); }
    if (!t.length) throw new Error('No recognised vertical occupancy flags');
    return [media(t), media(d)];
  }

  climaTerritorio(cl) {
    const cc = this.territory.map((c) => this.climaEstrato(c, cl));
    return [media(cc.map((x) => x[0])), media(cc.map((x) => x[1]))];
  }
}

// set(a.territory) & set(b.territory): para lo que se usa (contar celdas y repartir por
// igual entre sus charcos) el orden no importa. El Set de cada territorio se guarda en la
// cohorte y se rehace solo cuando cambia el territorio.
function conjuntoTerritorio(c) {
  if (c._refTerritorio !== c.territory) { c._refTerritorio = c.territory; c._setTerritorio = new Set(c.territory); }
  return c._setTerritorio;
}
// las celdas (sin repetir) del territorio de una cohorte en un Int32Array, en el orden del Set: se rehace solo
// cuando cambia el territorio, como el Set
function celdasTerritorio(c) {
  const s = conjuntoTerritorio(c);
  if (c._celdasDe !== s) { c._celdasDe = s; c._celdas = Int32Array.from(s); }
  return c._celdas;
}
let VECES_GETPREY = 0;
// una máscara de las celdas del territorio de una cohorte (1 en las suyas), para contar las comunes con otras; se
// devuelve a cero al soltarla (un solo array por tamaño de rejilla, reutilizado)
const MASCARAS = new Map();
function mascaraTerritorio(a, n) {
  let m = MASCARAS.get(n);
  if (!m) MASCARAS.set(n, (m = new Uint8Array(n)));
  for (const c of conjuntoTerritorio(a)) m[c] = 1;
  return m;
}
function soltarMascara(a, m) { for (const c of conjuntoTerritorio(a)) m[c] = 0; }
// (cuántas celdas comparten: lo mismo que interseccion(a, b).length, sin hacer la lista)
function cuantasComunes(a, b) {
  const sb = conjuntoTerritorio(b);
  let n = 0;
  for (const c of conjuntoTerritorio(a)) if (sb.has(c)) n++;
  return n;
}
function interseccion(a, b) {
  const sb = conjuntoTerritorio(b), r = [];
  for (const c of conjuntoTerritorio(a)) if (sb.has(c)) r.push(c);
  return r;
}

// ------------------------------------------------------------------ exportadores CSV
const REQ = ['cohort_id', 'time', 'time_index'];

class Exportador {
  constructor(cfgCohortes, cfgPools) {
    this.cohortes = cfgCohortes && cfgCohortes.enabled ? cfgCohortes : null;
    this.pools = cfgPools && cfgPools.enabled ? cfgPools : null;
    if (this.cohortes) {
      const attrs = [...new Set(this.cohortes.cohort_attributes)].filter((a) => !REQ.includes(a));
      this.atributos = attrs.sort();
    }
    this.lineas = { animal_cohort_data: [], animal_trophic_interactions: [], resource_pool_data: [] };
  }

  _emitir(clave, filas, columnas) {
    if (!filas.length) return;
    const l = this.lineas[clave];
    if (!l.length) l.push(columnas.join(','));
    l.push(...tablaCSV(filas, columnas));
  }

  volcarCohortes(cohortes, fecha, t) {
    if (!this.cohortes) return;
    const lista = [...cohortes];
    const territorios = new Map(lista.map((c) => [c.id, c.territory]));
    const filas = lista.map((c) => ({
      time: S(fecha), time_index: I(t), cohort_id: S(c.id), functional_group: S(c.fg.name),
      development_type: S(enumStr('DevelopmentType', c.fg.development_type)), diet_type: S(strDieta(c.fg.diet)),
      reproductive_environment: S(enumStr('ReproductiveEnvironment', c.fg.reproductive_environment)),
      age: F(c.age), individuals: I(c.individuals), is_alive: B(c.is_alive), is_mature: B(c.is_mature),
      time_to_maturity: F(c.time_to_maturity), time_since_maturity: F(c.time_since_maturity),
      location_status: S(c.location_status), centroid_key: I(c.centroid_key), territory_size: F(c.territory_size),
      territory: L(c.territory), occupancy_proportion: F(c.occupancy_proportion),
      largest_mass_achieved: F(c.largest_mass_achieved), mass_carbon: F(c.mass_cnp.C), mass_nitrogen: F(c.mass_cnp.N),
      mass_phosphorus: F(c.mass_cnp.P), reproductive_mass_carbon: F(c.reproductive_mass_cnp.C),
      reproductive_mass_nitrogen: F(c.reproductive_mass_cnp.N), reproductive_mass_phosphorus: F(c.reproductive_mass_cnp.P),
      activity_window_proportion: F(c.sigma_f_t), reference_temp: F(c.reference_temp), current_temperature: F(c.current_temperature),
    }));
    const cols = this.atributos.length ? [...REQ, ...this.atributos] : Object.keys(filas[0] || {});
    this._emitir('animal_cohort_data', filas, cols);
    const tro = [];
    for (const c of lista) {
      for (const r of c.trophic_record.values()) {
        const esCoh = r.kind === 'cohort';
        tro.push({
          time: S(fecha), time_index: I(t), functional_group: S(c.fg.name), consumer_cohort_id: S(c.id),
          consumer_territory: L(c.territory), resource_kind: S(r.kind), resource_id: S(r.id),
          resource_cell_id: esCoh ? null : I(parseInt(r.id, 10)),
          prey_territory: esCoh && territorios.has(r.id) ? L(territorios.get(r.id)) : null,
          activity_window_proportion: F(c.sigma_f_t), C: F(r.C), N: F(r.N), P: F(r.P),
        });
      }
    }
    this._emitir('animal_trophic_interactions', tro, ['time', 'time_index', 'functional_group', 'consumer_cohort_id',
      'consumer_territory', 'resource_kind', 'resource_id', 'resource_cell_id', 'prey_territory',
      'activity_window_proportion', 'C', 'N', 'P']);
  }

  volcarPools(m, fecha, t) {
    if (!this.pools) return;
    const filas = [];
    const fila = (tipo, nombre, sub, pft, cell, c) => filas.push({
      time: S(fecha), time_index: I(t), pool_type: S(tipo), pool_name: S(nombre), sub_pool: S(sub), pft: S(pft),
      cell_id: I(cell), C: F(c.C), N: F(c.N), P: F(c.P),
    });
    for (const [tipo, mapa] of [['carcass', m.carcass_pools], ['excrement', m.excrement_pools]]) {
      for (const [cell, pools] of mapa) {
        for (const p of pools) {
          fila(tipo, '', 'scavengeable', '', cell, p.scavengeable_cnp);
          fila(tipo, '', 'decomposed', '', cell, p.decomposed_cnp);
        }
      }
    }
    for (const [cell, porTipo] of m.soil_pools) for (const [nombre, p] of porTipo) fila('soil', nombre, '', '', cell, p.mass_cnp);
    for (const p of m.array_resource_pools) {
      const el = p.elemental;
      for (let c = 0; c < m.grid.n_cells; c++) {
        fila('resource_array', p.resource.pool_array, '', p.pft || '', c, { C: el[c * 3], N: el[c * 3 + 1], P: el[c * 3 + 2] });
      }
    }
    this._emitir('resource_pool_data', filas, ['time', 'time_index', 'pool_type', 'pool_name', 'sub_pool', 'pft', 'cell_id', 'C', 'N', 'P']);
  }
}

// ------------------------------------------------------------------ correcciones
// Arreglos del fallo de los herbívoros (ver informe/INFORME.md). Se activan en
// config.animal.correcciones; por defecto el comportamiento es el del original.
export const CORRECCIONES_ANIMAL = {
  sotobosque_por_m2: false,   // la vegetación y el banco de semillas del sotobosque vienen en kg/m² (no kg/celda)
  forrajeo_continuo: false,   // el tiempo de forrajeo en días con decimales (el original lo trunca a días enteros)
  boltzmann_ev: false,        // constante de Boltzmann en eV/K en el metabolismo (el original usa J/K y da 0)
  reproduccion: false,        // lo que crece un adulto va a masa reproductiva (en el original nunca aumenta)
  comparar_enums: false,      // semélparos, migración estacional y no reproductores funcionan (Enum frente a texto)
  agotar_recursos: false,     // lo que come una cohorte deja de estar para las siguientes del mismo paso
  metabolismo_una_vez: false, // cada cohorte metaboliza una vez por paso (el original, una vez por celda de su territorio)
  tiempo_plantas: false,      // la herbivoría recibe el tiempo de todas las categorías vegetales de la dieta
  metabolismo_con_comida: false, // el carbono sobrante de lo comido paga el metabolismo antes que el del cuerpo
  caza_redondeo: false,       // las presas muertas se redondean al azar (el original redondea siempre hacia arriba)
  caza_lineal: false,         // encuentros lineales en la densidad de presas (el original la eleva al cuadrado)
  tiempo_presas: false,       // la caza recibe el tiempo de todas las categorías de presa de la dieta
  setas: false,               // los fungívoros encuentran las setas (el original nunca se las ofrece)
  damuth_log10: false,        // ley de Damuth con el término independiente en log10 (el original lo usa tal cual)
  presas_pequenas: false,     // se pueden cazar presas de menos de 0,1 g (insectos jóvenes, termitas)
  inmigracion: false,         // entran y salen animales del bosque de alrededor si la densidad se aleja mucho de la de referencia
  metamorfosis_solo_larvas: false, // solo las larvas se metamorfosean (en el original, también los adultos: mariposa -> oruga)
  cohortes_iniciales_mezcladas: false,
  fusionar_cohortes: false,   // junta cohortes parecidas (mismo grupo y sitio, masa cercana) si un grupo pasa de MAX_COHORTES (como Madingley) // las cohortes del principio con masas de cría a adulto (el original: todas recién nacidas)
};
export const BOLTZMANN_EV = 8.617333262145e-5;
const TIEMPO_ENTRADA = 60, TIEMPO_SALIDA = 15; // días (inmigracion)
const MAX_COHORTES = 60; // por grupo funcional (fusionar_cohortes)

// ------------------------------------------------------------------ el modelo
export class AnimalModel extends ModeloBase {
  static fromConfig(sim) { return new AnimalModel(sim, sim.config.animal); }

  constructor(sim, cfg) {
    super(sim, 'animal', cfg.static);
    this.k = { ...cfg.constants, _ELEMENTAL_MASS_NOISE_TOLERANCE: 1e-10, _GROWTH_WASTE_TOLERANCE: 1e-12 };
    const k = this.k;
    // Correcciones del fallo de los herbívoros (no son del original; todas apagadas por
    // defecto para que el comparador contra el Python siga dando los mismos bits).
    this.corr = { ...CORRECCIONES_ANIMAL, ...(cfg.correcciones || {}) };
    // registro de sucesos (para el mundo vivo): null = no se registra nada
    this.eventos = sim.registrarEventos ? [] : null;
    this.functional_groups = importarGrupos(sim.escenario.tablas.grupos_animales, k);
    const grupos = sim.config.soil.microbial_group_definition;
    this.microbial_c_n_p_ratios = {};
    for (const g of grupos) this.microbial_c_n_p_ratios[g.name] = { N: g.c_n_ratio, P: g.c_p_ratio };
    this.exportador = new Exportador(cfg.cohort_data_export, cfg.resource_pool_export);
    this._setup();
  }

  _setup() {
    const k = this.k, d = this.data, n = this.grid.n_cells;
    this.update_interval_in_days = this.model_timing.update_interval_days;
    this.dt = Math.trunc(this.update_interval_in_days); // timedelta64(int(días), 'D')
    // ArrayResource: crea los arrays de consumo que falten
    for (const r of ARRAY_RESOURCES) {
      if (!d.has(r.pool_array)) throw new Error(`Array resource not found: ${r.pool_array}`);
      if (!d.has(r.consumed_array)) {
        const p = d.get(r.pool_array);
        d.set(r.consumed_array, new Arr(p.dims.slice(), p.shape.slice(), null, { ...p.coords }));
      }
    }
    this.array_resource_pools = [];
    for (const r of ARRAY_RESOURCES) {
      if (r.partition_by_pft) {
        const pfts = d.get(r.pool_array).coords.pft;
        if (!pfts) throw new Error(`ArrayResource for ${r.pool_array} cannot be partitioned by PFT.`);
        for (const pft of pfts) this.array_resource_pools.push(new ResourcePool(this, r, pft));
      } else this.array_resource_pools.push(new ResourcePool(this, r, null));
    }
    const celdas = this.grid.cell_id;
    this.excrement_pools = new Map(celdas.map((c) => [c, [new PoolDescomp(c)]]));
    this.carcass_pools = new Map(celdas.map((c) => [c, [new PoolDescomp(c)]]));
    this.herbivory_waste_pools = new Map(celdas.map((c) => [c, new HerbivoryWaste()]));
    this.thermal_suitability = null;
    this.active_cohorts = new Map();
    this.communities = new Map(celdas.map((c) => [c, []]));
    this.migrated_cohorts = new Map();
    this.aquatic_cohorts = new Map();
    this.nombrePorId = new Map();
    this.target_cohorts_per_fg = celdas.length;
    this.minimum_cohort_size = 5;
    this.soil_pools = this.populateSoilPools();
    this.initializeCommunities();
    const fecha0 = diasAFecha(this.model_timing.start_day);
    this.exportador.volcarCohortes(this.active_cohorts.values(), fecha0, 0);
    this.exportador.volcarPools(this, fecha0, 0);
    d.set('total_animal_respiration', new Arr(['cell_id'], [n], null, { cell_id: celdas.slice() }));
    d.set('population_densities', new Arr(['community_id', 'functional_group_id'], [n, this.functional_groups.length], null,
      { community_id: celdas.slice(), functional_group_id: this.functional_groups.map((g) => g.name) }));
    this.updatePopulationDensities();
  }

  populateSoilPools() {
    return new Map(this.grid.cell_id.map((c) => [c, new Map(['pom', 'bacteria', 'fungi'].map((t) => [t, new SoilPool(t, c, this)]))]));
  }

  initializeCommunities() {
    const k = this.k, metodo = k.density_scaling_method;
    const areaTotal = this.grid.n_cells * this.grid.cell_area;
    const dl = this.corr.damuth_log10;
    const total = sumaPy(this.functional_groups.map((g) => rawBiomassDensity(g, metodo, dl)));
    if (total === 0.0) throw new Error('Sum of raw biomass densities across all functional groups is zero.');
    const factor = k.total_heterotroph_biomass_density_kg_m2 / total;
    for (const fg of this.functional_groups) {
      if (fg.adult_mass <= 0.0) throw new Error(`adult_mass_kg must be positive, got ${fg.adult_mass}.`);
      const totalInd = Math.ceil((rawBiomassDensity(fg, metodo, dl) * factor) / fg.adult_mass * areaTotal);
      const tamaños = this.distribuir(totalInd);
      const sitios = this.asignarSitios(tamaños.length);
      // cohortes_iniciales_mezcladas: una población real tiene de todas las edades; el original
      // empieza con todos recién nacidos (4-10 % de la masa adulta) y casi nadie llega a criar
      for (let i = 0; i < tamaños.length; i++) {
        const masaIni = this.corr.cohortes_iniciales_mezcladas
          ? fg.birth_mass * pow(fg.adult_mass / fg.birth_mass, (i + 0.5) / tamaños.length) : fg.birth_mass;
        this.createNewCohort(fg, masaIni, 0.0, tamaños[i], sitios[i]);
      }
    }
  }

  distribuir(total) {
    let nObj = this.target_cohorts_per_fg;
    const min = this.minimum_cohort_size;
    if (total < nObj * min) nObj = Math.max(1, Math.floor(total / min));
    const base = Math.floor(total / nObj), resto = total % nObj;
    return Array.from({ length: nObj }, (_, i) => (i < resto ? base + 1 : base));
  }

  asignarSitios(n) {
    const ids = this.grid.cell_id.slice();
    if (n <= ids.length) return this.azar.np.choiceSinReemplazo(ids, n);
    return ids.concat(this.azar.np.choiceConReemplazo(ids, n - ids.length));
  }

  createNewCohort(fg, mass, age, individuals, centroid, esNacimiento = false) {
    const c = new Cohorte(this, fg, mass, age, individuals, centroid);
    this.nombrePorId.set(c.id, fg.name); // para la interfaz (presas ya desaparecidas)
    // presas_pequenas: el original solo deja cazar presas de más de 0,1 g
    c.prey_groups = preyGroupSelection(fg.diet, this.functional_groups, this.corr.presas_pequenas ? 1e-9 : 0.0001);
    if (esNacimiento && fg.reproductive_environment === 'aquatic') {
      c.remaining_time_away = this.k.aquatic_residence_time;
      this.aquatic_cohorts.set(c.id, c);
    } else {
      this.active_cohorts.set(c.id, c);
      this.updateCommunityOccupancy(c, centroid);
    }
    return c;
  }

  updateCommunityOccupancy(c, centroid) {
    const celdas = c.celdasTerritorio(centroid);
    c.territory = celdas;
    for (const cell of celdas) this.communities.get(cell).push(c);
  }

  // (quita la cohorte de la lista de cada celda de su territorio, en su sitio y con los demás en el mismo orden:
  // la busca con indexOf y la quita con splice, las veces que esté; lo mismo que filtrar por id, porque cada id es
  // de un solo objeto, como ya supone removeDeadCohort)
  abandonCommunities(c) {
    for (const cell of c.territory) {
      const l = this.communities.get(cell);
      let i = l.indexOf(c);
      while (i >= 0) { l.splice(i, 1); i = l.indexOf(c, i); }
    }
  }

  _update(t) {
    const dt = this.dt;
    if (this.eventos) this.eventos = [];
    this.soil_pools = this.populateSoilPools();
    for (const p of this.array_resource_pools) p.setResources();
    for (const c of this.active_cohorts.values()) c.trophic_record.clear();
    this.updateActivityWindows();
    this.forageCommunity(dt);
    this.birthCommunity();
    this.metamorphoseCommunity();
    this.metabolizeCommunity(dt);
    this.mortalityCommunity(dt);
    this.migrateCommunity(dt);
    this.migrateExternalCommunity();
    if (this.corr.inmigracion) this.intercambioExterior();
    // update_community_bookkeeping
    this.updateMigratedAndAquatic(dt);
    this.reintegrateCommunity();
    this.removeDeadCohortCommunity();
    if (this.corr.fusionar_cohortes) this.fusionarCohortes();
    // update_cohort_bookkeeping
    for (const c of this.active_cohorts.values()) c.increaseAge(dt);
    for (const c of this.active_cohorts.values()) if (!c.is_mature) c.updateLargestMass();
    const sueloAdd = this.soilAdditions();
    const sueloCons = this.soilConsumption();
    const hojAdd = this.litterAdditions();
    this.data.addFromDict({ ...sueloAdd, ...sueloCons, ...hojAdd });
    for (const p of this.array_resource_pools) p.writeConsumption();
    this.updatePopulationDensities();
    const fecha = diasAFecha(this.model_timing.update_datestamps[t]);
    this.exportador.volcarCohortes(this.active_cohorts.values(), fecha, t);
    this.exportador.volcarPools(this, fecha, t);
  }

  // ---------------------------------------------------------------- clima
  climaEstratos() {
    const ls = this.layer_structure, d = this.data, n = this.grid.n_cells;
    const filas = (nombre, idx) => {
      const a = d.get(nombre).data, out = new Float64Array(idx.length * n);
      idx.forEach((l, i) => out.set(a.subarray(l * n, (l + 1) * n), i * n));
      return out;
    };
    const llenas = ls.int.filled_canopy;
    let canT = nanmediaEje(filas('canopy_temperature', llenas), [llenas.length, n], 0).data;
    let canD = nanmediaEje(filas('diurnal_temperature_range', llenas), [llenas.length, n], 0).data;
    const fila = (nombre, l) => f64(d.get(nombre).data.subarray(l * n, (l + 1) * n));
    const groT = fila('air_temperature', ls.index_surface_scalar);
    const soiT = fila('soil_temperature', ls.index_topsoil_scalar);
    const groD = fila('diurnal_temperature_range', ls.index_surface_scalar);
    const soiD = fila('diurnal_temperature_range', ls.index_topsoil_scalar);
    if (canT.every((v) => v !== v)) { canT = f64(groT); canD = f64(groD); } else {
      canT = canT.map((v, i) => (v !== v ? groT[i] : v));
      canD = canD.map((v, i) => (v !== v ? groD[i] : v));
    }
    return { canopy_temperature: canT, ground_temperature: groT, soil_temperature: soiT,
      canopy_diurnal_range: canD, ground_diurnal_range: groD, soil_diurnal_range: soiD };
  }

  updateActivityWindows() {
    const cl = this.climaEstratos(), n = this.grid.n_cells, k = this.k;
    if (!k.thermal_habitat_selection) this.thermal_suitability = null;
    else {
      this.thermal_suitability = new Map();
      for (const fg of this.functional_groups) {
        const t = [], dd = [];
        const o = fg.vertical_occupancy;
        if (o & V.CANOPY) { t.push(cl.canopy_temperature); dd.push(cl.canopy_diurnal_range); }
        if (o & V.GROUND) { t.push(cl.ground_temperature); dd.push(cl.ground_diurnal_range); }
        if (o & V.SOIL) { t.push(cl.soil_temperature); dd.push(cl.soil_diurnal_range); }
        const apilar = (l) => { const a = new Float64Array(l.length * n); l.forEach((x, i) => a.set(x, i * n)); return a; };
        const temp = mediaEje(apilar(t), [t.length, n], 0).data;
        const rango = mediaEje(apilar(dd), [dd.length, n], 0).data;
        const s = fg.metabolic_type === 'endothermic' ? new Float64Array(n).fill(1)
          : f64(temp, (v, i) => activityWindow(fg, v, rango[i], k));
        this.thermal_suitability.set(fg.name, s);
      }
    }
    for (const c of this.active_cohorts.values()) {
      const [t, r] = c.climaTerritorio(cl);
      c.current_temperature = t;
      c.sigma_f_t = activityWindow(c.fg, t, r, k);
    }
  }

  // ---------------------------------------------------------------- forrajeo
  forageCommunity(dt) {
    for (const c of [...this.active_cohorts.values()]) {
      const dieta = c.fg.diet;
      const l = { arrays: [], presas: [], hongos: [], pom: [], bacterias: [], cadaveres: [], excrementos: [] };
      l.poolsExcremento = c.enTerritorio(this.excrement_pools);
      // setas: el original no incluye MUSHROOMS aquí, así que los fungívoros nunca encuentran setas
      const conSetas = this.corr.setas ? D.MUSHROOMS : 0;
      if (dieta & (D.ALGAE | D.FLOWERS | D.FOLIAGE | D.FRUIT | D.SEEDS | D.NECTAR | D.WOOD | D.DETRITUS | conSetas)) {
        l.arrays = c.getArrayResources(this.array_resource_pools);
      }
      const presa = dieta & (D.BLOOD | D.INVERTEBRATES | D.FISH | D.VERTEBRATES);
      if (presa) l.presas = c.getPrey(this.communities, presa);
      if (dieta & D.FUNGI) l.hongos = c.sueloDeTipo(this.soil_pools, 'fungi');
      if (dieta & D.POM) l.pom = c.sueloDeTipo(this.soil_pools, 'pom');
      if (dieta & D.BACTERIA) l.bacterias = c.sueloDeTipo(this.soil_pools, 'bacteria');
      if (dieta & D.CARCASSES) l.cadaveres = c.enTerritorio(this.carcass_pools);
      if (dieta & D.WASTE) l.excrementos = l.poolsExcremento;
      c.forageCohort(l, dt);
    }
    this.removeDeadCohortCommunity();
  }

  // ---------------------------------------------------------------- nacimientos
  birthCommunity() {
    for (const c of [...this.active_cohorts.values()]) {
      // reproductive_type != 'nonreproductive' compara un Enum con un str: siempre cierto
      // (con comparar_enums, los no reproductores no crían)
      if (this.corr.comparar_enums && c.fg.reproductive_type === 'nonreproductive') continue;
      if (!c.isBelowMassThreshold(this.k.birth_mass_threshold)) this.birth(c);
    }
  }

  birth(padre) {
    // calculate_semelparous_mass_loss: reproductive_type != 'semelparous' siempre cierto -> 0
    const semel = this.corr.comparar_enums && padre.fg.reproductive_type === 'semelparous';
    const perdida = semel ? this.k.semelparity_mass_loss : 0;
    const m = padre.mass_cnp;
    const rep = { C: padre.reproductive_mass_cnp.C + m.C * perdida, N: padre.reproductive_mass_cnp.N + m.N * perdida, P: padre.reproductive_mass_cnp.P + m.P * perdida };
    const bm = padre.fg.birth_mass, p = padre.cnp_proportions;
    const bc = bm * p.C, bn = bm * p.N, bp = bm * p.P;
    const porPadre = Math.min(rep.C / bc, rep.N / bn, rep.P / bp);
    const crias = Math.trunc(porPadre * padre.individuals);
    if (crias === 0) return;
    const fgCria = grupoPorNombre(this.functional_groups, padre.fg.offspring_functional_group);
    const cria = this.createNewCohort(fgCria, fgCria.birth_mass, 0.0, crias, padre.centroid_key, true);
    if (this.eventos) this.eventos.push({ tipo: 'nacimiento', padre: padre.id, cohorte: cria.id, n: crias });
    const r = padre.reproductive_mass_cnp;
    r.update(-pyMin(crias * bc, r.C), -pyMin(crias * bn, r.N), -pyMin(crias * bp, r.P));
    // reproductive_type == 'semelparous' nunca es cierto: el padre no muere (salvo con comparar_enums)
    if (semel) {
      m.update(-m.C * perdida, -m.N * perdida, -m.P * perdida);
      padre.is_alive = false;
      this.removeDeadCohort(padre);
    }
  }

  metamorphoseCommunity() {
    for (const c of [...this.active_cohorts.values()]) {
      // metamorfosis_solo_larvas: el original no mira si ya es adulto, y la mariposa que llega
      // a su masa adulta se vuelve oruga (y no cría nunca)
      if (c.fg.development_type === 'indirect' && c.mass >= c.fg.adult_mass
        && !(this.corr.metamorfosis_solo_larvas && c.fg.development_status !== 'larval')) {
        const muertos = Math.ceil(c.individuals * this.k.metamorph_mortality);
        c.dieIndividual(muertos, c.enTerritorio(this.carcass_pools));
        const adulto = grupoPorNombre(this.functional_groups, c.fg.offspring_functional_group);
        const nueva = this.createNewCohort(adulto, adulto.birth_mass, 0.0, c.individuals, c.centroid_key);
        if (this.eventos) this.eventos.push({ tipo: 'metamorfosis', de: c.id, a: nueva.id, n: c.individuals, muertos });
        c.is_alive = false;
        this.removeDeadCohort(c);
      }
    }
  }

  metabolizeCommunity(dt) {
    const resp = this.data.get('total_animal_respiration').data;
    if (this.corr.metabolismo_una_vez) {
      // cada cohorte metaboliza una vez y reparte excrementos y respiración por su territorio
      for (const c of this.active_cohorts.values()) {
        const w = c.metabolize(c.current_temperature, this.corr.forrajeo_continuo ? this.update_interval_in_days : dt);
        const r = c.respire(w), pools = c.enTerritorio(this.excrement_pools);
        c.excrete(w, pools);
        for (const cell of c.territory) resp[cell] += r / c.territory.length;
      }
      return;
    }
    for (const [cell, com] of this.communities) {
      if (!com.length) continue;
      let total = 0.0;
      for (const c of com) {
        const w = c.metabolize(c.current_temperature, dt);
        total += c.respire(w);
        c.excrete(w, this.excrement_pools.get(cell));
      }
      resp[cell] += total;
    }
  }

  mortalityCommunity(dt) {
    for (const c of [...this.active_cohorts.values()]) {
      c.inflictNonPredationMortality(dt, c.enTerritorio(this.carcass_pools));
      if (c.individuals <= 0) {
        c.is_alive = false;
        this.removeDeadCohort(c);
      }
    }
  }

  removeDeadCohort(c) {
    if (!this.active_cohorts.has(c.id)) throw new Error(`Cohort with ID ${c.id} does not exist.`);
    for (const cell of c.territory) {
      const l = this.communities.get(cell);
      if (l) { const i = l.indexOf(c); if (i >= 0) l.splice(i, 1); }
    }
    this.active_cohorts.delete(c.id);
  }

  // fusionar_cohortes: cada nacimiento crea una cohorte y el original no las junta nunca, así
  // que su número crece sin parar (y el motor se frena). Si un grupo pasa de MAX_COHORTES, se
  // juntan las de la misma celda con la masa más parecida (primero las que se llevan menos de
  // un 30 %, luego hasta ×2, ×4 y cualquiera), sumando individuos y promediando por individuo
  // la masa, la masa reproductiva y la edad.
  fusionarCohortes() {
    const porGrupo = new Map();
    for (const c of this.active_cohorts.values()) { const l = porGrupo.get(c.fg.name) || []; l.push(c); porGrupo.set(c.fg.name, l); }
    for (const lista of porGrupo.values()) {
      let sobran = lista.length - MAX_COHORTES;
      for (const tope of [1.3, 2, 4, Infinity]) {
        if (sobran <= 0) break;
        const porCelda = new Map();
        for (const c of lista) if (c.individuals > 0) { const l = porCelda.get(c.centroid_key) || []; l.push(c); porCelda.set(c.centroid_key, l); }
        for (const l of porCelda.values()) {
          l.sort((a, b) => a.mass - b.mass);
          for (let i = 0; i + 1 < l.length && sobran > 0; i++) {
            const a = l[i], b = l[i + 1];
            if (b.mass > a.mass * tope || a.individuals === 0) continue;
            this.juntar(b.individuals >= a.individuals ? b : a, b.individuals >= a.individuals ? a : b);
            l.splice(i + 1, 1); l[i] = a.individuals > 0 ? a : b;
            sobran--;
          }
        }
      }
    }
  }

  juntar(t, s) {
    const nt = t.individuals, ns = s.individuals, n = nt + ns;
    const mezcla = (x, y) => new CNP((x.C * nt + y.C * ns) / n, (x.N * nt + y.N * ns) / n, (x.P * nt + y.P * ns) / n, x.nC || y.nC, x.nN || y.nN, x.nP || y.nP);
    t.mass_cnp = mezcla(t.mass_cnp, s.mass_cnp);
    t.reproductive_mass_cnp = mezcla(t.reproductive_mass_cnp, s.reproductive_mass_cnp);
    t.age = (t.age * nt + s.age * ns) / n;
    t.time_since_maturity = (t.time_since_maturity * nt + s.time_since_maturity * ns) / n;
    t.largest_mass_achieved = pyMax(t.largest_mass_achieved, s.largest_mass_achieved);
    t.individuals = n;
    s.individuals = 0; s.is_alive = false;
    this.removeDeadCohort(s);
    if (this.eventos) this.eventos.push({ tipo: 'fusion', de: s.id, a: t.id, n: ns });
  }

  removeDeadCohortCommunity() {
    const muertas = [...this.active_cohorts.values()].filter((c) => c.individuals === 0);
    for (const c of muertas) { c.is_alive = false; this.removeDeadCohort(c); }
  }

  // ---------------------------------------------------------------- movimientos
  migrateCommunity(dt) {
    const n = this.grid.n_cells, k = this.k;
    for (const c of this.active_cohorts.values()) if (c.centroid_key >= n) throw new Error('cohort centroid outside grid');
    const dtDias = dt;
    for (const c of this.active_cohorts.values()) {
      const hambre = c.isBelowMassThreshold(k.dispersal_mass_threshold);
      const juvenil = c.age === 0.0 && this.azar.np.random_sample() <= c.migrateJuvenileProbability(dtDias);
      const calor = this.thermal_suitability !== null && c.sigma_f_t < k.thermal_dispersal_threshold
        && this.azar.np.random_sample() <= 1.0 - c.sigma_f_t / k.thermal_dispersal_threshold;
      if (!(hambre || juvenil || calor)) continue;
      const cand = this.celdasAlAlcance(c.centroid_key, c.dispersalDistance(dtDias));
      if (!cand.length) continue;
      this.migrate(c, this.elegirDestino(c, cand));
    }
  }

  celdasAlAlcance(centro, dist) {
    const g = this.grid, n = g.n_cells;
    dist = pyMax(dist, Math.sqrt(g.cell_area) + 0.001);
    const r = [];
    for (let j = 0; j < n; j++) if (g._distances[centro * n + j] <= dist) r.push(j);
    const i = r.indexOf(centro);
    if (i < 0) throw new Error('list.remove(x): x not in list');
    r.splice(i, 1);
    return r;
  }

  elegirDestino(c, cand) {
    if (this.thermal_suitability === null) return this.azar.py.choice(cand);
    const s = this.thermal_suitability.get(c.fg.name), k = this.k;
    const base = f64(cand, (j) => (s[j] > k.thermal_suitability_floor || s[j] !== s[j] ? s[j] : k.thermal_suitability_floor));
    const w = potenciaArr(base, k.thermal_selection_exponent);
    const tot = suma(w);
    return this.azar.np.choiceConPesos(cand, f64(w, (v) => v / tot));
  }

  migrate(c, destino) {
    if (this.eventos) this.eventos.push({ tipo: 'dispersion', cohorte: c.id, de: c.centroid_key, a: destino });
    const l = this.communities.get(c.centroid_key);
    const i = l.indexOf(c);
    if (i < 0) throw new Error('list.remove(x): x not in list');
    l.splice(i, 1);
    c.centroid_key = destino;
    this.communities.get(destino).push(c);
    this.abandonCommunities(c);
    this.updateCommunityOccupancy(c, destino);
  }

  // inmigracion: la rejilla es una mancha de un bosque mucho mayor. Si un grupo baja de la
  // mitad de su densidad de referencia (density_individuals_m2) entran animales del exterior
  // (casi adultos, por una celda del borde), y si pasa del doble salen. Ritmo: la diferencia
  // se reduce con una constante de TIEMPO_ENTRADA días al entrar y TIEMPO_SALIDA al salir.
  intercambioExterior() {
    const area = this.grid.n_cells * this.grid.cell_area, dias = this.update_interval_in_days;
    const nx = this.grid.cell_nx, ny = this.grid.cell_ny;
    const borde = this.grid.cell_id.filter((c) => c % nx === 0 || c % nx === nx - 1 || c < nx || c >= nx * (ny - 1));
    for (const fg of this.functional_groups) {
      const dens = fg.density_individuals_m2;
      if (!(dens > 0)) continue;
      const ref = dens * area;
      let n = 0;
      const coh = [];
      for (const c of this.active_cohorts.values()) if (c.fg === fg) { n += c.individuals; coh.push(c); }
      if (n < 0.5 * ref) {
        const media = (0.5 * ref - n) * (1 - Math.exp(-dias / TIEMPO_ENTRADA));
        const entran = Math.floor(media + this.azar.np.random_sample());
        if (entran > 0) {
          const centro = borde[Math.floor(this.azar.np.random_sample() * borde.length)];
          const c = this.createNewCohort(fg, fg.adult_mass * 0.8, 365.0, entran, centro);
          c.is_mature = true; c.time_to_maturity = 365.0; c.largest_mass_achieved = c.mass;
          if (this.eventos) this.eventos.push({ tipo: 'inmigra', cohorte: c.id, n: entran, celda: centro });
        }
      } else if (n > 2 * ref && coh.length) {
        let salen = Math.floor((n - 2 * ref) * (1 - Math.exp(-dias / TIEMPO_SALIDA)) + this.azar.np.random_sample());
        for (const c of coh) {
          if (salen <= 0) break;
          const k = Math.min(salen, c.individuals - (c.individuals > 1 ? 1 : 0));
          if (k <= 0) continue;
          c.individuals -= k; salen -= k;
          if (this.eventos) this.eventos.push({ tipo: 'emigra', cohorte: c.id, n: k });
        }
      }
    }
  }

  migrateExternalCommunity() {
    // migration_type == 'seasonal' compara un Enum con un str: nunca es cierto, así que
    // en el original ninguna cohorte migra fuera (ni se gasta azar de random.random()).
    if (!this.corr.comparar_enums) return;
    for (const c of [...this.active_cohorts.values()]) {
      if (c.fg.migration_type === 'seasonal' && this.azar.py.random() <= this.k.seasonal_migration_probability) {
        if (this.eventos) this.eventos.push({ tipo: 'migra', cohorte: c.id });
        this.abandonCommunities(c);
        c.location_status = 'migrated';
        c.remaining_time_away = this.k.migration_residence_time;
        this.migrated_cohorts.set(c.id, c);
        this.active_cohorts.delete(c.id);
      }
    }
  }

  updateMigratedAndAquatic(dt) {
    for (const [mapa, origen] of [[this.migrated_cohorts, 'migrated'], [this.aquatic_cohorts, 'aquatic']]) {
      for (const c of [...mapa.values()]) {
        c.remaining_time_away -= dt;
        if (c.remaining_time_away <= 0) this.reintegrate(c, origen);
      }
    }
  }

  reintegrateCommunity() {
    for (const [mapa, origen] of [[this.migrated_cohorts, 'migrated'], [this.aquatic_cohorts, 'aquatic']]) {
      for (const c of [...mapa.values()]) if (c.remaining_time_away <= 0) this.reintegrate(c, origen);
    }
  }

  reintegrate(c, origen) {
    let tasa;
    if (origen === 'migrated') { tasa = this.k.migration_mortality; this.migrated_cohorts.delete(c.id); } else {
      tasa = this.k.aquatic_mortality; this.aquatic_cohorts.delete(c.id);
    }
    const bajas = Math.trunc(c.individuals * tasa);
    c.individuals -= bajas;
    if (this.eventos) this.eventos.push({ tipo: 'vuelve', cohorte: c.id, origen, muertos: bajas });
    if (c.individuals > 0) {
      c.location_status = 'active';
      this.active_cohorts.set(c.id, c);
      this.updateCommunityOccupancy(c, c.centroid_key);
    } else c.is_alive = false;
  }

  // ---------------------------------------------------------------- salidas
  porDia(v) { return v / this.update_interval_in_days; }

  soilAdditions() {
    const n = this.grid.n_cells, area = this.grid.cell_area, celdas = this.grid.cell_id;
    const sacar = (mapa) => {
      const a = new Float64Array(n * 3);
      let i = 0;
      for (const pools of mapa.values()) {
        for (const p of pools) {
          a[i * 3] = this.porDia(p.decomposed_cnp.C / area);
          a[i * 3 + 1] = this.porDia(p.decomposed_cnp.N / area);
          a[i * 3 + 2] = this.porDia(p.decomposed_cnp.P / area);
          i++;
        }
      }
      return a;
    };
    const exc = sacar(this.excrement_pools), car = sacar(this.carcass_pools);
    for (const m of [this.excrement_pools, this.carcass_pools]) for (const ps of m.values()) for (const p of ps) p.reset();
    const coords = { cell_id: celdas.slice(), element: ['C', 'N', 'P'] };
    return {
      decomposed_excrement_cnp: new Arr(['cell_id', 'element'], [n, 3], exc, coords),
      decomposed_carcasses_cnp: new Arr(['cell_id', 'element'], [n, 3], car, { ...coords }),
    };
  }

  soilConsumption() {
    const d = this.data, n = this.grid.n_cells, area = this.grid.cell_area, celdas = this.grid.cell_id;
    const prof = this.core_constants.microbial_simulation_depth;
    const pom = d.get('soil_cnp_pool_pom');
    const kC = pom.coords.element.indexOf('C');
    const pomC = new Float64Array(n), pomN = new Float64Array(n), pomP = new Float64Array(n);
    const bac = new Float64Array(n), sapC = new Float64Array(n), ecmC = new Float64Array(n), amC = new Float64Array(n);
    const bacIni = d.get('soil_c_pool_bacteria').data;
    const sap = d.get('soil_c_pool_saprotrophic_fungi').data;
    const am = d.get('soil_c_pool_arbuscular_mycorrhiza').data, ecm = d.get('soil_c_pool_ectomycorrhiza').data;
    for (let i = 0; i < n; i++) {
      const c = celdas[i], ps = this.soil_pools.get(c);
      const mp = ps.get('pom').mass_cnp;
      const consC = pom.data[i * 3 + kC] - mp.C / (area * prof);
      const cn = mp.N > 0 ? mp.C / mp.N : 0.0, cp = mp.P > 0 ? mp.C / mp.P : 0.0;
      pomC[i] = this.porDia(consC); pomN[i] = this.porDia(consC / cn); pomP[i] = this.porDia(consC / cp);
      bac[i] = this.porDia(bacIni[i] - ps.get('bacteria').mass / (area * prof));
      const amI = am[i] > 0 ? am[i] : 0, ecmI = ecm[i] > 0 ? ecm[i] : 0;
      const fIni = sap[i] + amI + ecmI;
      const fCons = fIni - ps.get('fungi').mass / (area * prof);
      sapC[i] = this.porDia(fCons * (sap[i] / fIni));
      ecmC[i] = this.porDia(fCons * (ecmI / fIni));
      amC[i] = this.porDia(fCons * (amI / fIni));
    }
    const pomA = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) { pomA[i * 3] = pomC[i]; pomA[i * 3 + 1] = pomN[i]; pomA[i * 3 + 2] = pomP[i]; }
    const cel = () => ({ cell_id: celdas.slice() });
    return {
      animal_pom_consumption_cnp: new Arr(['cell_id', 'element'], [n, 3], pomA, { cell_id: celdas.slice(), element: ['C', 'N', 'P'] }),
      animal_bacteria_consumption: new Arr(['cell_id'], [n], bac, cel()),
      animal_saprotrophic_fungi_consumption: new Arr(['cell_id'], [n], sapC, cel()),
      animal_ectomycorrhiza_consumption: new Arr(['cell_id'], [n], ecmC, cel()),
      animal_arbuscular_mycorrhiza_consumption: new Arr(['cell_id'], [n], amC, cel()),
    };
  }

  litterAdditions() {
    const n = this.grid.n_cells, celdas = this.grid.cell_id;
    const ab = new Float64Array(n * 3), be = new Float64Array(n * 3), abL = new Float64Array(n), beL = new Float64Array(n);
    celdas.forEach((c, i) => {
      const w = this.herbivory_waste_pools.get(c);
      ELEM.forEach((e, j) => { ab[i * 3 + j] = w.above[e]; be[i * 3 + j] = w.below[e]; });
      abL[i] = w.above_lignin; beL[i] = w.below_lignin;
    });
    for (const w of this.herbivory_waste_pools.values()) {
      w.above_lignin = 0.0; w.below_lignin = 0.0;
      for (const e of ELEM) { w.above[e] = 0.0; w.below[e] = 0.0; }
    }
    const co = () => ({ cell_id: celdas.slice(), element: ['C', 'N', 'P'] });
    return {
      herbivory_waste_above_cnp: new Arr(['cell_id', 'element'], [n, 3], ab, co()),
      herbivory_waste_above_lignin: new Arr(['cell_id'], [n], abL, { cell_id: celdas.slice() }),
      herbivory_waste_below_cnp: new Arr(['cell_id', 'element'], [n, 3], be, co()),
      herbivory_waste_below_lignin: new Arr(['cell_id'], [n], beL, { cell_id: celdas.slice() }),
    };
  }

  updatePopulationDensities() {
    const pd = this.data.get('population_densities');
    const nombres = pd.coords.functional_group_id, nf = nombres.length;
    for (const [cell, com] of this.communities) {
      const dens = new Map();
      for (const c of com) {
        const v = c.individuals / this.grid.cell_area;
        dens.set(c.fg.name, (dens.has(c.fg.name) ? dens.get(c.fg.name) : 0.0) + v);
      }
      const fila = pd.coords.community_id.indexOf(cell);
      for (const [nombre, v] of dens) pd.data[fila * nf + nombres.indexOf(nombre)] = v;
    }
  }

  // estado interno en el mismo formato que herramientas/oraculo.py (estado_animales)
  estado() {
    const coh = (c) => ({
      id: c.id, fg: c.fg.name, individuals: c.individuals, age: c.age, C: c.mass_cnp.C, N: c.mass_cnp.N, P: c.mass_cnp.P,
      rC: c.reproductive_mass_cnp.C, rN: c.reproductive_mass_cnp.N, rP: c.reproductive_mass_cnp.P,
      centroid: c.centroid_key, territory: c.territory.slice(), is_alive: c.is_alive, is_mature: c.is_mature,
      time_to_maturity: c.time_to_maturity, time_since_maturity: c.time_since_maturity,
      largest_mass: c.largest_mass_achieved, sigma_f_t: c.sigma_f_t, current_temperature: c.current_temperature,
      location_status: c.location_status, remaining_time_away: c.remaining_time_away,
    });
    const cnp = (x) => [x.C, x.N, x.P];
    const pools = (m) => [...m.values()].flatMap((ps) => ps.map((p) => [cnp(p.scavengeable_cnp), cnp(p.decomposed_cnp)]));
    const comunidades = {};
    for (const [k, v] of this.communities) comunidades[String(k)] = v.map((c) => c.id);
    const troficas = {};
    for (const c of this.active_cohorts.values()) troficas[c.id] = [...c.trophic_record.values()].map((r) => [r.kind, r.id, r.C, r.N, r.P]);
    return {
      communities: comunidades, excrement: pools(this.excrement_pools), carcass: pools(this.carcass_pools), trophic: troficas,
      active: [...this.active_cohorts.values()].map(coh), migrated: [...this.migrated_cohorts.values()].map(coh),
      aquatic: [...this.aquatic_cohorts.values()].map(coh),
    };
  }
}

// ndarray ** escalar de Python (atajos de numpy para -1, 0, 0.5, 1, 2)
function potenciaArr(a, e) {
  if (e === 2) return a.map((x) => x * x);
  if (e === 1) return f64(a);
  if (e === 0) return a.map(() => 1);
  if (e === 0.5) return a.map((x) => Math.sqrt(x));
  if (e === -1) return a.map((x) => 1 / x);
  return a.map((x) => pow(x, e));
}
