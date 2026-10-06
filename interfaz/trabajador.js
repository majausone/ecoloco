// Web Worker: corre el motor fuera del hilo de la página. La página solo pinta lo que
// este trabajador le manda tras cada paso.
//
// Mensajes de la página:
//   {tipo:'iniciar', escenario, semilla, historia}  crea e inicializa la simulación
//   {tipo:'paso'}                                   un paso
//   {tipo:'correr', retardo} / {tipo:'pausa'}        en marcha continua / parar
//   {tipo:'retardo', retardo}                        cambia la velocidad
//   {tipo:'mapa', variable, corte}                   datos de una variable para el mapa
//   {tipo:'exportar', que}                           'zarr' | 'csv_animales'
// Mensajes a la página: 'listo', 'paso', 'mapa', 'fin', 'archivo', 'error'.

import { Simulacion } from '../motor/simulacion.js?v=202610060036';
import { escribirZarr } from '../motor/salida/zarr.js?v=202610060036';
import { diasAFecha } from '../motor/core/componentes.js?v=202610060036';

let meta = null;
let sim = null;
let corriendo = false;
let retardo = 0;

async function cargarMeta() {
  if (!meta) meta = await (await fetch('../motor/meta/metadatos.json')).json();
  return meta;
}

// media espacial (sin NaN) para cada combinación de las demás dimensiones
function medias(a) {
  const ax = a.dims.indexOf('cell_id');
  if (ax < 0) return Array.from(a.data);
  const n = a.shape[ax];
  const ext = a.shape.slice(0, ax).reduce((x, y) => x * y, 1);
  const int = a.shape.slice(ax + 1).reduce((x, y) => x * y, 1);
  const out = [];
  for (let e = 0; e < ext; e++) {
    for (let j = 0; j < int; j++) {
      let s = 0, c = 0;
      for (let k = 0; k < n; k++) {
        const v = a.data[(e * n + k) * int + j];
        if (v === v) { s += v; c++; }
      }
      out.push(c ? s / c : NaN);
    }
  }
  return out;
}

// cortes de una variable (todas las combinaciones de dimensiones que no son cell_id), en el
// idioma de la página (lo manda al iniciar: el trabajador no ve el almacenamiento del navegador)
let ingles = false;
function cortes(a) {
  const otras = a.dims.map((d, i) => [d, i]).filter(([d]) => d !== 'cell_id' && d !== 'time_index');
  let l = [[]];
  for (const [d, i] of otras) {
    const c = a.coords[d] || Array.from({ length: a.shape[i] }, (_, k) => k);
    const ROL = ingles ? { above: 'above the canopy', canopy: 'canopy', surface: 'surface', topsoil: 'topsoil', subsoil: 'subsoil' } : { above: 'encima del dosel', canopy: 'dosel', surface: 'superficie', topsoil: 'suelo', subsoil: 'subsuelo' };
    const DIM = ingles ? { layers: 'layer', element: 'element', pft: 'plant type', groundwater_layers: 'groundwater layer', community_id: 'community', functional_group_id: 'group' } : { layers: 'capa', element: 'elemento', pft: 'tipo de planta', groundwater_layers: 'capa subterránea', community_id: 'comunidad', functional_group_id: 'grupo' };
    const etiq = d === 'layers' ? c.map((v, k) => `${ROL[sim.layer_structure.layer_roles[k]] || sim.layer_structure.layer_roles[k]} ${k}`) : c.map(String);
    l = l.flatMap((p) => etiq.map((e) => [...p, `${DIM[d] || d}=${e}`]));
  }
  return l.map((p) => p.join(', ') || (ingles ? 'all' : 'todo'));
}

function resumenAnimales() {
  const m = sim.modelos.animal;
  if (!m) return null;
  const grupos = {};
  for (const fg of m.functional_groups) grupos[fg.name] = { individuos: 0, biomasa: 0, cohortes: 0 };
  for (const c of m.active_cohorts.values()) {
    const g = grupos[c.fg.name];
    g.individuos += c.individuals;
    g.biomasa += c.individuals * c.mass;
    g.cohortes += 1;
  }
  // quién come a quién (carbono ingerido en este paso)
  const nombre = new Map();
  for (const c of m.active_cohorts.values()) nombre.set(c.id, c.fg.name);
  const troficas = {};
  for (const c of m.active_cohorts.values()) {
    for (const r of c.trophic_record.values()) {
      const recurso = r.kind === 'cohort' ? (nombre.get(r.id) || m.nombrePorId.get(r.id) || 'presa') : r.kind;
      const fila = (troficas[c.fg.name] ||= {});
      fila[recurso] = (fila[recurso] || 0) + r.C;
    }
  }
  return { grupos, troficas, migradas: m.migrated_cohorts.size, acuaticas: m.aquatic_cohorts.size };
}

function biomasaPlantas() {
  const p = sim.modelos.plants;
  if (!p || !p.biomasas) return null;
  const out = {};
  for (const [cell, bio] of p.biomasas) {
    const n = p.comunidades.get(cell).cohortes.n_individuals;
    for (const t of bio.tejidos) {
      let s = 0;
      for (let i = 0; i < n.length; i++) s += t.masas[i * 3] * n[i];
      out[t.nombre] = (out[t.nombre] || 0) + s;
    }
  }
  return out;
}

function resumen() {
  const t = sim.time_index - 1;
  const m = {};
  for (const k of sim.varsSalida) if (sim.data.has(k)) m[k] = medias(sim.data.serie(k));
  return {
    t, fecha: diasAFecha(sim.model_timing.update_datestamps[t]), medias: m,
    animales: resumenAnimales(), plantas: biomasaPlantas(), terminada: sim.terminada,
  };
}

function infoVars() {
  const vars = {};
  for (const k of sim.varsSalida) {
    if (!sim.data.has(k)) continue;
    const a = sim.data.serie(k), v = meta.variables[k] || {};
    vars[k] = { dims: a.dims, shape: a.shape, cortes: cortes(a), unidad: v.unit || '', descripcion: v.description || '' };
  }
  return vars;
}

function info() {
  const vars = infoVars();
  return {
    vars, n_pasos: sim.model_timing.n_updates,
    poligonos: sim.grid.polygons, celdas: sim.grid.cell_id, nx: sim.grid.cell_nx, ny: sim.grid.cell_ny,
    grupos: sim.modelos.animal ? sim.modelos.animal.functional_groups.map((g) => g.name) : [],
    modelos: Object.keys(sim.modelos), orden: sim.ordenUpdate,
  };
}

function datosMapa(variable, corte) {
  if (!sim.data.has(variable)) return null;
  const a = sim.data.serie(variable);
  const ax = a.dims.indexOf('cell_id');
  const n = a.shape[ax];
  const int = a.shape.slice(ax + 1).reduce((x, y) => x * y, 1);
  // corte = índice plano sobre las dimensiones que no son cell_id
  const e = Math.floor(corte / int), j = corte % int;
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) out[k] = a.data[(e * n + k) * int + j];
  return out;
}

function paso() {
  const antes = sim.varsSalida.filter((k) => sim.data.has(k)).length;
  sim.paso();
  // variables que aparecen en el primer paso (vars_populated_by_first_update)
  if (sim.varsSalida.filter((k) => sim.data.has(k)).length !== antes) postMessage({ tipo: 'vars', vars: infoVars() });
  postMessage({ tipo: 'paso', resumen: resumen() });
  if (sim.terminada) { corriendo = false; postMessage({ tipo: 'fin' }); }
}

function bucle() {
  if (!corriendo || !sim || sim.terminada) return;
  try { paso(); } catch (err) { corriendo = false; postMessage({ tipo: 'error', mensaje: String(err && err.stack || err) }); return; }
  setTimeout(bucle, retardo);
}

onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.tipo === 'iniciar') {
      corriendo = false;
      ingles = !!m.ingles;
      await cargarMeta();
      const t0 = performance.now();
      sim = new Simulacion(m.escenario, { semilla: m.semilla, meta, guardarSalidas: m.historia });
      sim.inicializar();
      postMessage({ tipo: 'listo', info: info(), segundos: (performance.now() - t0) / 1000 });
    } else if (m.tipo === 'paso') {
      if (sim && !sim.terminada) paso();
    } else if (m.tipo === 'correr') {
      retardo = m.retardo ?? retardo;
      if (sim && !corriendo) { corriendo = true; bucle(); }
    } else if (m.tipo === 'pausa') {
      corriendo = false;
    } else if (m.tipo === 'retardo') {
      retardo = m.retardo;
    } else if (m.tipo === 'mapa') {
      if (sim) postMessage({ tipo: 'mapa', variable: m.variable, corte: m.corte, datos: datosMapa(m.variable, m.corte) });
    } else if (m.tipo === 'exportar') {
      if (!sim) return;
      if (m.que === 'zarr') {
        if (!sim.guardarSalidas) throw new Error('Para exportar el zarr hay que arrancar con «guardar historia completa».');
        postMessage({ tipo: 'archivo', que: 'zarr', ficheros: [...escribirZarr(sim)] });
      } else if (m.que === 'csv_animales') {
        const csv = sim.csv();
        postMessage({ tipo: 'archivo', que: 'csv_animales', ficheros: Object.entries(csv).map(([k, l]) => [k, new TextEncoder().encode(l.join('\r\n') + '\r\n')]) });
      }
    }
  } catch (err) {
    corriendo = false;
    postMessage({ tipo: 'error', mensaje: String(err && err.stack || err) });
  }
};
