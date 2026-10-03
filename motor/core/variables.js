// core/variables.py: registro de qué variables crea/usa cada módulo y orden de ejecución.
// El orden sale de un TopologicalSorter de Python sobre un grafo construido con sets de
// cadenas, así que se reproduce con PySet (orden de CPython con PYTHONHASHSEED=0).

import { PySet } from '../num/pyset.js?v=202610032007';

export function setupVariables(nombresModelos, metaModelos, varsDatos) {
  const rv = new Map(); // nombre -> {populated_init, required_init, populated_first, updated, required_update}
  const nueva = () => ({ vars_populated_by_init: [], vars_required_by_init: [], vars_populated_by_first_update: [],
    vars_updated: [], vars_required_by_update: [] });
  for (const v of varsDatos) {
    if (rv.has(v)) throw new Error(`Variable ${v} already populated from data`);
    const r = nueva();
    r.vars_populated_by_init.push('data');
    rv.set(v, r);
  }
  const get = (v) => { if (!rv.has(v)) rv.set(v, nueva()); return rv.get(v); };
  for (const m of nombresModelos) {
    for (const v of metaModelos[m].vars_populated_by_init) {
      if (rv.has(v) && rv.get(v).vars_populated_by_init.includes('data')) continue;
      if (rv.has(v) && rv.get(v).vars_populated_by_init.length) {
        throw new Error(`Variable ${v} initialised by ${m} already initialised`);
      }
      get(v).vars_populated_by_init.push(m);
    }
  }
  for (const m of nombresModelos) {
    for (const v of metaModelos[m].vars_required_for_init) {
      if (!rv.has(v)) throw new Error(`Variable ${v} required by ${m} during initialisation is not initialised by any model neither provided as input.`);
      rv.get(v).vars_required_by_init.push(m);
    }
  }
  for (const m of nombresModelos) {
    for (const v of metaModelos[m].vars_populated_by_first_update) {
      if (rv.has(v)) {
        const r = rv.get(v);
        if (r.vars_populated_by_init.includes('data') || r.vars_populated_by_first_update.includes('data')) continue;
        throw new Error(`Variable ${v} initialised at first update by ${m} already initialised`);
      }
      get(v).vars_populated_by_first_update.push(m);
    }
  }
  for (const m of nombresModelos) {
    for (const v of metaModelos[m].vars_updated) {
      if (!rv.has(v)) throw new Error(`Variable ${v} required by ${m} is not initialised by any model.`);
      rv.get(v).vars_updated.push(m);
    }
  }
  for (const m of nombresModelos) {
    for (const v of metaModelos[m].vars_required_for_update) {
      if (!rv.has(v)) throw new Error(`Variable ${v} required by ${m} is not initialised by any model neither provided as input.`);
      rv.get(v).vars_required_by_update.push(m);
    }
  }
  return rv;
}

function relatedModels(r) {
  const s = new PySet(r.vars_required_by_init)
    .or(new PySet(r.vars_populated_by_init))
    .or(new PySet(r.vars_required_by_update))
    .or(new PySet(r.vars_populated_by_first_update))
    .or(new PySet(r.vars_updated));
  s.discard('data');
  return s;
}

export function getModelOrder(etapa, rv) {
  const depends = new Map();
  for (const r of rv.values()) {
    for (const m of relatedModels(r)) if (!depends.has(m)) depends.set(m, new PySet());
    const pobl = etapa === 'init' ? r.vars_populated_by_init : r.vars_populated_by_first_update;
    if (!pobl.length) continue;
    const inicializador = pobl[0];
    if (inicializador === 'data') continue;
    const requeridos = etapa === 'init' ? r.vars_required_by_init : r.vars_required_by_update;
    for (const dep of requeridos) depends.get(dep).add(inicializador);
  }
  // graphlib.TopologicalSorter(depends).static_order()
  const info = new Map();
  const nodo = (n) => { if (!info.has(n)) info.set(n, { npred: 0, suc: [] }); return info.get(n); };
  for (const [n, preds] of depends) {
    const ni = nodo(n);
    const lista = preds.toArray();
    ni.npred += lista.length;
    for (const p of lista) nodo(p).suc.push(n);
  }
  let listos = [...info].filter(([, i]) => i.npred === 0).map(([n]) => n);
  const orden = [];
  while (listos.length) {
    const grupo = listos;
    listos = [];
    for (const n of grupo) info.get(n).npred = -1;
    orden.push(...grupo);
    for (const n of grupo) {
      for (const s of info.get(n).suc) {
        const si = info.get(s);
        si.npred -= 1;
        if (si.npred === 0) listos.push(s);
      }
    }
  }
  if (orden.length !== info.size) throw new Error(`Model ${etapa} dependencies are cyclic`);
  return orden;
}
