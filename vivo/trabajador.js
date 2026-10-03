// El mundo vivo en un Web Worker: el motor y los animales calculan los días por delante de lo
// que se está viendo, y se los manda a la página según los va teniendo (como mucho ADELANTO
// días sin ver, para no gastar memoria). En los ratos libres, las predicciones.
//
// Mensajes que recibe:
//   { tipo: 'iniciar', escenario, semilla, km2, config, dia }   carga el escenario y genera el
//                                              mundo entero (config: la de la portada,
//                                              mundo/config.js; dia: abrir en ese día)
//   { tipo: 'visto', dia }                     la página ha empezado a enseñar ese día
//   { tipo: 'modo', semillas, pasadas, instantaneas }   cuánto se esfuerza (menos = más rápido) y
//                                              si guarda una copia del mundo antes de cada día
//   { tipo: 'camara', x, z }                   dónde mira la cámara: ahí se simula minuto a minuto
//   { tipo: 'foco', id }                       el animal que sigue la cámara (siempre minuto a minuto)
//   { tipo: 'detalle', dia, id }               hambre, sed, sueño, tarea... de un animal ese día
//   { tipo: 'datos', celda }                   todas las variables del motor ahora (del mundo o de un cuadro)
//   { tipo: 'serie', nombre, celda, capa }     una variable día a día
//   { tipo: 'instantaneas', si }               guardar una copia del mundo antes de cada día (para
//                                              poder cambiar parámetros desde el día que se ve)
//   { tipo: 'cambiar', cambios, desde }        cambiar parámetros (mundo/parametros.js) desde un día
//   { tipo: 'predecir', cambios, dias }        correr el motor deprisa con y sin el cambio
//   { tipo: 'irA', dia }                       ir a un día (adelante o atrás)
// Mensajes que manda:
//   { tipo: 'listo', ... }, { tipo: 'progreso', dia, hasta }, { tipo: 'dia', ... },
//   { tipo: 'detalle', ... }, { tipo: 'datos', ... }, { tipo: 'serie', ... },
//   { tipo: 'cambiado', desde }                los días desde «desde» se vuelven a calcular
//   { tipo: 'prediccion', hecho, dias, desde, fechas, con, sin }
//   { tipo: 'salto', dia }                     el mundo ha ido a otro día
//   { tipo: 'error', mensaje }

import { Mundo } from '../mundo/mundo.js?v=202610032043';
import { reiniciarIds, idActual } from '../mundo/agentes.js?v=202610032043';
import { indicadores, INDICADORES } from '../mundo/registro.js?v=202610032043';
import { aplicarParametros } from '../mundo/parametros.js?v=202610032043';
import { clonarProfundo } from '../motor/clonar.js?v=202610032043';
import { VERTEBRADOS } from '../mundo/especies.js?v=202610032043';

const ADELANTO = 2;
let mundo = null, calculando = false, visto = -1, ultimo = -1, inicio = null, conInstantaneas = false, prediccion = null;
const detalles = new Map(); // dia -> Map(id -> Float32Array) (los últimos días)
const instantaneas = new Map(); // dia -> { mundo (antes de calcular ese día), ids }

function seguir() {
  if (calculando || !mundo) return;
  const falta = ultimo - visto < ADELANTO && !mundo.puente.terminado;
  if (!falta && !prediccion) return;
  calculando = true;
  // deja pasar los mensajes que hayan llegado antes de ponerse (con un canal y no con
  // setTimeout, que el navegador frena cuando la pestaña no está delante)
  despues(() => {
    try {
      if (ultimo - visto < ADELANTO && !mundo.puente.terminado) calcularDia();
      else if (prediccion) pasoPrediccion();
    } catch (e) {
      postMessage({ tipo: 'error', mensaje: String(e && e.stack || e) });
      prediccion = null;
    }
    calculando = false;
    seguir();
  });
}
function calcularDia() {
  if (conInstantaneas) {
    instantaneas.set(mundo.puente.dia, { mundo: mundo.instantanea(), ids: idActual() });
    for (const d of [...instantaneas.keys()]) if (d < visto - 1) instantaneas.delete(d);
  }
  const t0 = performance.now();
  const r = mundo.siguienteDia();
  const ids = [...r.claves.keys()];
  const claves = ids.map((id) => r.claves.get(id));
  detalles.set(r.dia, r.detalles);
  for (const d of [...detalles.keys()]) if (d < r.dia - ADELANTO - 2) detalles.delete(d);
  postMessage({
    tipo: 'dia', dia: r.dia, otros: r.otros, fecha: r.fecha, clima: r.clima, medida: r.medida, eventos: r.eventos,
    ids, claves, agentes: r.agentes, totales: r.totales, plantas: r.plantas, foco: r.foco, vale: mundo.vale,
    parametros: mundo.parametrosAhora, segundos: (performance.now() - t0) / 1000,
  }, claves.map((l) => l.buffer));
  ultimo = r.dia;
}

// ---- predicciones: dos copias del motor (con y sin el cambio), un día cada vez
function empezarPrediccion(cambios, dias) {
  // desde el día siguiente al que se ve (de su instantánea, si la hay; si no, desde el último calculado)
  const desde = visto + 1, inst = instantaneas.get(desde);
  const base = inst ? inst.mundo.puente : mundo.puente;
  const sin = clonarProfundo(base), con = clonarProfundo(base);
  const antes = { ...mundo.parametrosAhora };
  aplicarParametros(con, { ...antes, ...cambios }, con.dia);
  prediccion = { desde: base.dia, dias, sin, con, fechas: [], serieSin: [], serieCon: [], cambios };
}
function pasoPrediccion() {
  const p = prediccion;
  const t0 = performance.now();
  while (performance.now() - t0 < 60 && p.fechas.length < p.dias && !p.con.terminado) {
    const r = p.sin.paso(); p.con.paso();
    p.fechas.push(r.fecha);
    p.serieSin.push(indicadores(p.sin, VERTEBRADOS)); p.serieCon.push(indicadores(p.con, VERTEBRADOS));
  }
  const hecho = p.fechas.length >= p.dias || p.con.terminado;
  if (hecho || p.fechas.length % 10 === 0) {
    const col = (l) => Object.fromEntries(INDICADORES.map(([k]) => [k, l.map((x) => x[k])]));
    postMessage({ tipo: 'prediccion', hecho, dias: p.dias, desde: p.desde, fechas: p.fechas, con: col(p.serieCon), sin: col(p.serieSin), cambios: p.cambios });
  }
  if (hecho) prediccion = null;
}

// ---- ir a un día
function irA(dia) {
  dia = Math.max(0, Math.min(dia, mundo.puente.sim.model_timing.n_updates - 1));
  if (dia < mundo.puente.dia - 0) {
    // atrás: el mundo de nuevo desde el principio, con los mismos cambios de parámetros
    const cambios = mundo.cambios;
    reiniciarIds();
    mundo = new Mundo(JSON.parse(inicio.texto), inicio.meta, inicio.opciones);
    mundo.cambios = cambios.map((c) => ({ ...c }));
  }
  mundo.saltarA(dia, (d) => { if (d % 5 === 0 || d === dia) postMessage({ tipo: 'progreso', dia: d, hasta: dia }); });
  instantaneas.clear(); detalles.clear(); prediccion = null;
  ultimo = visto = mundo.puente.dia - 1;
  postMessage({ tipo: 'salto', dia: mundo.puente.dia, plantas: mundo.mapa.plantas, totales: mundo.totales() });
}

const canal = new MessageChannel(), tareas = [];
canal.port1.onmessage = () => tareas.shift()();
function despues(f) { tareas.push(f); canal.port2.postMessage(0); }

onmessage = async ({ data: m }) => {
  try {
    if (m.tipo === 'iniciar') {
      const [texto, meta] = await Promise.all([
        fetch(m.escenario).then((r) => r.text()),
        fetch('../motor/meta/metadatos.json').then((r) => r.json()),
      ]);
      inicio = { texto, meta, opciones: { semilla: m.semilla || 1, km2: m.km2 || null, config: m.config || null } };
      mundo = new Mundo(JSON.parse(texto), meta, inicio.opciones);
      // un mundo guardado: el motor hasta su día, deprisa
      if (m.dia > 0) mundo.saltarA(m.dia, (d) => postMessage({ tipo: 'progreso', dia: d, hasta: m.dia }));
      postMessage({ tipo: 'listo', mapa: mundo.opcionesMapa, config: mundo.config, ladoReal: mundo.ladoReal, dio: mundo.dio, celdas: mundo.puente.nx * mundo.puente.ny,
        km2: mundo.km2, vale: mundo.vale, totales: mundo.totales(), plantas: mundo.mapa.plantas, dias: mundo.puente.sim.model_timing.n_updates, dia: mundo.puente.dia,
        fechaInicio: mundo.puente.fecha(0) });
      seguir();
    } else if (m.tipo === 'visto') { visto = m.dia; seguir(); }
    else if (m.tipo === 'modo') { mundo.semillasPorDia = m.semillas; mundo.pasadasDirector = m.pasadas; if ('instantaneas' in m) { conInstantaneas = m.instantaneas; if (!conInstantaneas) instantaneas.clear(); } }
    else if (m.tipo === 'camara') { if (mundo) mundo.foco = { x: m.x, z: m.z }; }
    else if (m.tipo === 'foco') { if (mundo) mundo.ponerFoco(m.id); }
    else if (m.tipo === 'detalle') {
      const d = detalles.get(m.dia)?.get(m.id) || null;
      postMessage({ tipo: 'detalle', dia: m.dia, id: m.id, detalle: d ? d.slice() : null });
    } else if (m.tipo === 'datos') {
      const r = mundo.registro;
      // (hasta el día que se ve: lo calculado por delante aún no ha pasado)
      const n = Math.min(r.fechas.length, visto + 1);
      postMessage({ tipo: 'datos', celda: m.celda ?? null, catalogo: r.catalogo(m.celda ?? null, n), fechas: r.fechas.slice(0, n), animales: r.animales(n), capas: r.capas, parametros: mundo.parametrosAhora, cambios: mundo.cambios });
    } else if (m.tipo === 'serie') {
      const r = mundo.registro, n = Math.min(r.fechas.length, visto + 1);
      const s = r.serie(m.nombre, m.celda ?? null, m.capa ?? null);
      postMessage({ tipo: 'serie', nombre: m.nombre, celda: m.celda ?? null, capa: m.capa ?? null, datos: s ? s.slice(0, n) : null });
    } else if (m.tipo === 'instantaneas') { conInstantaneas = !!m.si; if (!m.si) instantaneas.clear(); }
    else if (m.tipo === 'cambiar') {
      // desde el día que se pide: si hay una copia del mundo de antes de ese día, se vuelve a
      // ella y se rehace; si no, desde el próximo día que se calcule
      let desde = m.desde;
      const inst = instantaneas.get(desde);
      if (inst && desde <= ultimo) {
        const registro = mundo.registro, cambiosAntes = mundo.cambios;
        mundo = inst.mundo; reiniciarIds(inst.ids);
        mundo.registro = registro; registro.p = mundo.puente; registro.recortar(desde);
        mundo.cambios = cambiosAntes.filter((c) => c.desde < desde);
        for (const d of [...instantaneas.keys()]) if (d >= desde) instantaneas.delete(d);
        ultimo = desde - 1;
      } else desde = Math.max(desde, ultimo + 1);
      mundo.cambiarParametros(m.cambios, desde);
      postMessage({ tipo: 'cambiado', desde, cambios: mundo.cambios });
      seguir();
    } else if (m.tipo === 'predecir') { empezarPrediccion(m.cambios, m.dias); seguir(); }
    else if (m.tipo === 'irA') { irA(m.dia); seguir(); }
  } catch (e) {
    postMessage({ tipo: 'error', mensaje: String(e && e.stack || e) });
  }
};
