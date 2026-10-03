// ¿Se sostiene Maliau? Corre el escenario N días y saca, por grupo funcional: individuos al
// empezar y cada año, y cuántos nacen, mueren (de muerte natural o cazados), entran del
// bosque de alrededor (inmigración) y se van (emigración). Sirve para el informe: cuánto del
// mantenimiento sale de la propia celda y cuánto del intercambio con el bosque de alrededor.
//
// Uso: node herramientas/sostenibilidad.mjs [escenario.json] [--dias 1096]
import { readFileSync } from 'node:fs';
import { Simulacion } from '../motor/simulacion.js?v=202610032043';
import { escalarEscenario } from '../mundo/escala.js?v=202610032043';

const args = process.argv.slice(2);
const ruta = args[0] && !args[0].startsWith('--') ? args[0] : 'datos/escenarios/maliau.json';
const dias = Number(args[args.indexOf('--dias') + 1] || 1096);
const escenario = JSON.parse(readFileSync(ruta, 'utf8'));
// --km2 N: el mundo de N km² (misma rejilla, cuadros más grandes; ver mundo/escala.js)
if (args.includes('--km2')) escalarEscenario(escenario, Number(args[args.indexOf('--km2') + 1]));
const meta = JSON.parse(readFileSync(new URL('../motor/meta/metadatos.json', import.meta.url), 'utf8'));
const sim = new Simulacion(escenario, { semilla: 1, meta, guardarSalidas: false, registrarEventos: true });
sim.inicializar();
const am = sim.modelos.animal;
const grupos = am.functional_groups.map((g) => g.name);
const grupoDe = new Map();
// individuos activos (los migrados y los acuáticos no están en la celda)
const todas = () => [...am.active_cohorts.values(), ...am.migrated_cohorts.values(), ...am.aquatic_cohorts.values()];
// (las que nacen y desaparecen en el mismo paso solo están en el registro del motor)
const anotar = () => { for (const c of todas()) grupoDe.set(c.id, c.fg.name); for (const [id, n] of am.nombrePorId) if (!grupoDe.has(id)) grupoDe.set(id, n); };
const cuenta = () => { anotar(); const o = Object.fromEntries(grupos.map((g) => [g, 0])); for (const c of am.active_cohorts.values()) o[c.fg.name] += c.individuals; return o; };
const fotos = [cuenta()];
const S = Object.fromEntries(grupos.map((g) => [g, { nacen: 0, natural: 0, cazados: 0, entran: 0, salen: 0, metamorfosis: 0, migracion: 0 }]));
const t0 = performance.now();
for (let d = 0; d < dias && !sim.terminada; d++) {
  anotar();
  sim.paso();
  anotar();
  for (const e of am.eventos) {
    if (e.tipo === 'metamorfosis') {
      // la larva (oruga, renacuajo...) pasa a adulto: sale de un grupo y entra en otro
      const de = grupoDe.get(e.de), a = grupoDe.get(e.a);
      if (de) S[de].metamorfosis -= e.n + e.muertos;
      if (a) S[a].metamorfosis += e.n;
      if (de) S[de].natural += 0;
      continue;
    }
    const g = grupoDe.get(e.tipo === 'caza' ? e.presa : e.cohorte);
    if (!g) continue;
    // las crías de puesta acuática (ranas) cuentan cuando salen del agua ('vuelve')
    if (e.tipo === 'nacimiento') { if (!am.aquatic_cohorts.has(e.cohorte)) S[g].nacen += e.n; }
    else if (e.tipo === 'vuelve') { const c = am.active_cohorts.get(e.cohorte); if (c) { if (e.origen === 'aquatic') S[g].nacen += c.individuals; else S[g].migracion += c.individuals; } }
    else if (e.tipo === 'migra') { const c = am.migrated_cohorts.get(e.cohorte); if (c) S[g].migracion -= c.individuals; }
    else if (e.tipo === 'muerte') S[g].natural += e.n;
    else if (e.tipo === 'caza') S[g].cazados += e.n;
    else if (e.tipo === 'inmigra') S[g].entran += e.n;
    else if (e.tipo === 'emigra') S[g].salen += e.n;
  }
  if ((d + 1) % 365 === 0) fotos.push(cuenta());
}
fotos.push(cuenta());
console.log(`${escenario.escalaKm2 ? escenario.escalaKm2 + ' km² · ' : ''}${dias} días en ${((performance.now() - t0) / 1000).toFixed(0)} s\n`);
console.log('| grupo | al empezar | ' + fotos.slice(1, -1).map((_, i) => `año ${i + 1}`).join(' | ') + ' | al acabar | nacen | por metamorfosis | entran | mueren | cazados | se van | migración estacional (neta) | entran / (nacen + metamorfosis + entran) | sin cuadrar¹ |');
const nota = '¹ semélparos que mueren al criar: el motor no apunta ese suceso';
console.log('|---|' + '---:|'.repeat(fotos.length + 9));
const f = (x) => (x >= 100 ? Math.round(x).toLocaleString('es') : x.toFixed(1));
for (const g of grupos) {
  const s = S[g], ap = s.nacen + Math.max(0, s.metamorfosis) + s.entran;
  console.log(`| ${g} | ${fotos.map((o) => f(o[g])).join(' | ')} | ${f(s.nacen)} | ${f(s.metamorfosis)} | ${f(s.entran)} | ${f(s.natural)} | ${f(s.cazados)} | ${f(s.salen)} | ${f(s.migracion)} | ${ap ? Math.round(100 * s.entran / ap) + ' %' : '—'} | ${f(Math.abs(fotos[0][g] + s.nacen + s.metamorfosis + s.entran + s.migracion - s.natural - s.cazados - s.salen - fotos[fotos.length - 1][g]))} |`);
}
console.log('\n' + nota);
