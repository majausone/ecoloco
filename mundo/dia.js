// Un día del mundo vivo, minuto a minuto (1440 tics). Parte del estado de los animales al
// empezar el día y devuelve: la línea de tiempo de cada animal (fotogramas clave: cuándo,
// dónde, rumbo, estado y qué come; y aparte, para la ficha, hambre, sed, sueño, tarea, con
// quién y hacia dónde), los sucesos que han salido (cazas, muertes...) y el estado al acabar.
// No toca el estado de partida: se puede repetir con otra semilla o con otras marcas del
// director.
//
// Todos los animales del mundo se simulan. Alrededor del FOCO (donde mira la cámara cuando se
// calcula el día) van minuto a minuto; el resto, a paso grueso (ctx.paso minutos), y la parte
// visual interpola entre sus fotogramas clave.

import { Azar } from './azar.js?v=202610060036';
import { hashTexto } from './mapa.js?v=202610060036';
import { activo, ACTIVIDAD, E, VERTEBRADOS } from './especies.js?v=202610060036';
import { necesidades, dirigir, alturaDeseada, Copia } from './agentes.js?v=202610060036';
import { posadero, horquilla, ARBOL, modeloPlanta, escalaDe } from './posaderos.js?v=202610060036';

export const TICS = 1440;
// fotograma clave: tic, x, y, z, rumbo, estado, valor (qué come)
export const CLAVE = 7;
// detalle de cada fotograma clave: hambre, sed, sueño, tarea (TAREAS), con quién (número en la
// lista «otros» del día, o -1), hacia dónde (x, z)
export const DETALLE = 7;
export const TAREAS = ['', 'comer', 'beber', 'dormir', 'cortejar', 'irse', 'cazar', 'anidar', 'huir', 'seguir'];
const TAREA = Object.fromEntries(TAREAS.map((t, i) => [t, i]));
const RADIO_FOCO = 100; // m alrededor del foco que se simulan minuto a minuto
const RADIO_ARBOLES = 350; // m alrededor del foco con árboles de verdad (más lejos se come «por ahí»)

// copia de un animal para simular sin tocar el original
export function clonar(a) {
  const c = new Copia(a);
  c.hogar = { ...a.hogar };
  c._k = null; c._d = null; c._n = 0; c._fino = false; c._fase = 0; c._ultimo = -99; c._pendiente = -1;
  c.objetivo = a.objetivo ? { ...a.objetivo } : null;
  if (c.objetivo?.ruta) c.objetivo.ruta = c.objetivo.ruta.map((p) => ({ ...p })); // (la ruta se va recortando: cada copia, la suya)
  c.marca = a.marca ? { ...a.marca } : null;
  return c;
}

class Rejilla {
  constructor(tam) { this.tam = tam; this.m = new Map(); }
  clave(x, z) { return (Math.floor(x / this.tam) + 1000) * 100000 + Math.floor(z / this.tam) + 1000; }
  vaciar() { this.m.clear(); }
  poner(a) { const k = this.clave(a.x, a.z); let l = this.m.get(k); if (!l) this.m.set(k, (l = [])); l.push(a); }
  cerca(x, z, r, f) {
    const t = this.tam, i0 = Math.floor((x - r) / t), i1 = Math.floor((x + r) / t), j0 = Math.floor((z - r) / t), j1 = Math.floor((z + r) / t);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const l = this.m.get((i + 1000) * 100000 + j + 1000);
      if (l) for (const a of l) if (f(a) === false) return;
    }
  }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------- el día
// ctx: { mapa, agentes (array), presasDe (grupo -> Set de grupos presa), carronas, excrementos,
//        clima, semilla, dia, marcas (id -> marca del director), programa (sucesos fijados),
//        foco: {x, z} (donde mira la cámara), paso (minutos del paso grueso) }
// para medir (herramientas/medir_caminos.mjs): las veces que un animal que no nada choca con el agua y
// se tiene que dar la vuelta, en total y por animal. No cambia nada de la simulación.
// (en globalThis: el mismo objeto aunque el módulo se cargue dos veces, con y sin ?v=)
export const ESTADISTICAS = (globalThis.__estadisticasDia ||= { bloqueosAgua: 0, porAnimal: new Map() });

export function simularDia(ctx) {
  const { mapa, presasDe } = ctx;
  const az = new Azar(ctx.semilla, ctx.dia, ctx.intento || 0);
  const agentes = ctx.agentes.map(clonar);
  const porId = new Map(agentes.map((a) => [a.id, a]));
  for (const [id, m] of Object.entries(ctx.marcas || {})) { const a = porId.get(id); if (a) a.marca = { ...m }; }
  const foco = ctx.foco || mapa.centro, PASO = Math.max(1, ctx.paso || 10);
  // árboles de verdad alrededor del foco (lejos, los animales comen «por ahí»)
  const arboles = mapa.arbolesCerca(foco.x, foco.z, RADIO_ARBOLES).map((t) => ({ ...t }));
  const rejArb = new Rejilla(10);
  for (const t of arboles) rejArb.poner(t);
  const setas = mapa.setasCerca(foco.x, foco.z, RADIO_ARBOLES).map((s) => ({ ...s, queda: 1 }));
  const carronas = (ctx.carronas || []).map((c) => ({ ...c }));
  const excrementos = (ctx.excrementos || []).map((c) => ({ ...c }));
  const eventos = [];
  const rej = new Rejilla(8);    // los de paso fino, cada tic
  const rejG = new Rejilla(40);  // todos, para las cazas a paso grueso (se rehace cada PASO tics)
  const llueve = (ctx.clima?.lluvia || 0) > 5;
  // sucesos fijados por el director (muertes naturales, nacimientos, llegadas...) por tic
  const programa = new Map();
  for (const s of ctx.programa || []) { const l = programa.get(s.tic) || []; l.push(s); programa.set(s.tic, l); }

  const fino = (a) => a.foco || Math.hypot(a.x - foco.x, a.z - foco.z) < RADIO_FOCO;
  // los de cerca, cada tic; los de lejos, repartidos en PASO turnos
  let finos = [];
  const turnos = Array.from({ length: PASO }, () => []);
  const meter = (a, tic) => {
    a._fino = fino(a);
    if (a._fino) finos.push(a);
    else { a._fase = tic % PASO; turnos[a._fase].push(a); }
  };
  agentes.forEach((a, i) => { if (!a.fuera && a.estado !== E.muerto) meter(a, i); });
  const c = { dia: ctx.dia, tic: 0, hora: 0, pasos: 1, fino: true, mapa, rej, porId, presasDe, arboles, setas, carronas, excrementos, eventos, az, llueve, mes: ctx.mes, rejG, rejArb, caceria: ctx.caceria || {}, bocado: ctx.bocado || {}, foco };
  C_ACT = c;
  // los voladores posados desde ayer: las plantas han cambiado durante la noche (crecen, mueren),
  // así que se ajustan a su punto de hoy o, si su planta ya no está, se vuelven a posar
  for (const a of agentes) {
    if (!a.vivo || !a.posado || a.y <= 0.05 || !VUELA.has(a.e.mueve)) continue;
    if ([a.hogar, ...(a.nidos || [])].some((q) => q && q.y > 0 && Math.hypot(q.x - a.x, q.z - a.z) < 0.6 && Math.abs(q.y - a.y) < 0.1)) continue;
    let mejor = null, md = 16;
    rejArb.cerca(a.x, a.z, 4, (t) => { const d = (t.x - a.x) ** 2 + (t.z - a.z) ** 2; if (d < md) { md = d; mejor = t; } });
    const p = mejor && posadero(mejor, a.x, a.y, a.z, a.e.mueve === 'volador' ? ['flor', 'hoja', 'rama'] : ['rama', 'hoja']);
    if (p && Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z) < 1.5) { a.x = p.x; a.y = p.y; a.z = p.z; } else { a.posado = false; posarse(a, c, a.estado === E.dormir ? E.dormir : E.quieto, Math.max(2, a.temporizador)); }
  }

  // un paso de un animal; devuelve false si ya no hay que seguir simulándolo
  const mover = (a, pasos, hora) => {
    if (a.fuera) return false;
    if (!a.vivo) {
      if (a.estado === E.morir && (a.temporizador -= pasos) <= 0) a.estado = E.muerto;
      return a.estado !== E.muerto;
    }
    c.pasos = pasos; c.fino = pasos === 1;
    necesidades(a, pasos / 60, hora);
    actuar(a, c);
    // un volador que se ha quedado parado en el aire (acabó un vuelo, dejó de huir...): se posa
    if (!a.objetivo && !a.posado && a.y > 0.05 && VUELA.has(a.e.mueve) && PARADO.has(a.estado)) posarse(a, c, a.estado, Math.max(2, a.temporizador));
    return !a.fuera;
  };
  // los animales a los que se refiere el detalle (presa, depredador, pareja, guía)
  const otros = [], numOtro = new Map();
  const num = (id) => { if (!id) return -1; let n = numOtro.get(id); if (n === undefined) { n = otros.length; otros.push(id); numOtro.set(id, n); } return n; };
  // un fotograma clave (los de paso fino, como mucho uno cada 2 minutos si no cambia de estado)
  const grabar = (a, tic) => {
    if (a._k && a._n > 0) {
      const o = (a._n - 1) * CLAVE, k = a._k;
      // sin cambio de estado: los de paso fino, como mucho uno cada 2 minutos; y quieto en el
      // mismo sitio (durmiendo, descansando...), ninguno: entre dos claves se interpola
      if (k[o + 5] === a.estado && k[o + 6] === (a.valor || 0)) {
        if (a._fino && tic - a._ultimo < 2 && !a._esquina) return;
        if (Math.abs(k[o + 1] - a.x) < 0.2 && Math.abs(k[o + 3] - a.z) < 0.2 && Math.abs(k[o + 2] - a.y) < 0.2 && tic < TICS - 1) { a._pendiente = tic; return; }
      }
      // antes de moverse tras estar quieto, una clave en el último momento quieto
      if (a._pendiente > k[o] && a._pendiente < tic) {
        const t2 = a._pendiente; a._pendiente = -1;
        meterClave(a, t2, k[o + 1], k[o + 2], k[o + 3], k[o + 4], k[o + 5], k[o + 6]);
      }
    }
    a._pendiente = -1;
    a._ultimo = tic; a._esquina = false;
    // un volador en el aire que no está posado está volando (aunque vaya a pararse): así se ve
    const est = !a.posado && a.y > 0.05 && VUELA.has(a.e.mueve) && PARADO.has(a.estado) && a.estado !== E.beber ? (a.e.mueve === 'planeo' ? E.planear : E.volar) : a.estado;
    meterClave(a, tic, a.x, a.y, a.z, a.rumbo, est, a.valor || 0);
    const p = (a._n - 1) * DETALLE, dt = a._d;
    dt[p] = a.hambre; dt[p + 1] = a.sed; dt[p + 2] = a.sueno;
    const huye = a.estado === E.huir;
    dt[p + 3] = huye ? TAREA.huir : TAREA[a.tarea] ?? (a.siguiendo && !a.tarea ? TAREA.seguir : 0);
    dt[p + 4] = num(a.presa || (huye && a._deQuien) || a.objetivo?.ref || a.objetivo?.pareja || (!a.tarea && a.siguiendo) || null);
    dt[p + 5] = a.objetivo ? a.objetivo.x : a.x; dt[p + 6] = a.objetivo ? a.objetivo.z : a.z;
  };
  function meterClave(a, tic, x, y, z, rumbo, estado, valor) {
    if (!a._k) { a._k = new Float32Array(32 * CLAVE); a._d = new Float32Array(32 * DETALLE); a._n = 0; }
    if ((a._n + 1) * CLAVE > a._k.length) {
      const k = new Float32Array(a._k.length * 2); k.set(a._k); a._k = k;
      const dd = new Float32Array(a._d.length * 2); dd.set(a._d); a._d = dd;
    }
    const o = a._n * CLAVE, k = a._k;
    k[o] = tic; k[o + 1] = x; k[o + 2] = y; k[o + 3] = z; k[o + 4] = rumbo; k[o + 5] = estado; k[o + 6] = valor;
    if (a._n > 0) { const d0 = (a._n - 1) * DETALLE, d1 = a._n * DETALLE, dd = a._d; for (let j = 0; j < DETALLE; j++) dd[d1 + j] = dd[d0 + j]; }
    a._n++;
  }
  for (const a of agentes) if (!a.fuera) grabar(a, 0);

  for (let tic = 0; tic < TICS; tic++) {
    const hora = tic / 60, turno = tic % PASO;
    c.tic = tic; c.hora = hora;
    // lo programado para este minuto
    const prog = programa.get(tic);
    if (prog) for (const s of prog) {
      const n = aplicarPrograma(s, porId, agentes, mapa, az, eventos, tic, carronas);
      if (n) { meter(n, tic + 1); grabar(n, tic); }
      else { const a = porId.get(s.id); if (a) grabar(a, tic); }
    }
    if (turno === 0) { rejG.vaciar(); for (const a of agentes) if (a.vivo && !a.fuera && a.vertebrado) rejG.poner(a); }
    rej.vaciar();
    for (const a of finos) if (a.vivo && !a.fuera) rej.poner(a);
    // los de cerca
    const sigue = [];
    for (const a of finos) {
      const vivo = mover(a, 1, hora);
      grabar(a, tic);
      if (!vivo) continue;
      if (fino(a) || !a.vivo) sigue.push(a);
      else { a._fino = false; a._fase = (tic + 1) % PASO; turnos[a._fase].push(a); }
    }
    // los de lejos a los que les toca
    const lista = turnos[turno], quedan = [];
    for (const a of lista) {
      const vivo = mover(a, PASO, hora);
      grabar(a, tic);
      if (!vivo) continue;
      if (fino(a)) { a._fino = true; sigue.push(a); } else quedan.push(a);
    }
    turnos[turno] = quedan;
    finos = sigue;
  }
  for (const a of agentes) if (a._k && a._pendiente > 0) { const o = (a._n - 1) * CLAVE, k = a._k; meterClave(a, a._pendiente, k[o + 1], k[o + 2], k[o + 3], k[o + 4], k[o + 5], k[o + 6]); }
  // la línea de tiempo de cada animal, recortada a lo que tiene
  const claves = new Map(), detalles = new Map();
  for (const a of agentes) {
    if (!a._k) continue;
    claves.set(a.id, a._k.slice(0, a._n * CLAVE));
    detalles.set(a.id, a._d.slice(0, a._n * DETALLE));
  }
  return { agentes, eventos, claves, detalles, otros, arboles, setas, carronas, excrementos };
}

// ---------------------------------------------------------------- lo programado
function aplicarPrograma(s, porId, agentes, mapa, az, eventos, tic, carronas) {
  const a = porId.get(s.id);
  if (s.tipo === 'muerte' && a && a.vivo) {
    a.vivo = false; a.estado = E.morir; a.temporizador = 20; a.y = 0;
    eventos.push({ tic, tipo: 'muerte', id: a.id, grupo: a.grupo, causa: s.causa || 'natural' });
    if (a.vertebrado) carronas.push({ id: `c${a.id}`, x: a.x, z: a.z, masa: a.masa, de: a.especieId, tic });
  } else if (s.tipo === 'aparece' && s.agente) {
    const n = clonar(s.agente);
    agentes.push(n); porId.set(n.id, n);
    n.estado = s.como === 'nacer' ? E.nacer : n.vertebrado ? E.llegar : E.quieto; n.temporizador = 15;
    // (llegando desde el borde, andando hacia dentro: si no, se quedaba 15 minutos «llegando» en el sitio)
    if (n.estado === E.llegar && n.hogar) { const d = Math.hypot(n.hogar.x - n.x, n.hogar.z - n.z) || 1, l = Math.min(d, velocidad(n) * 15); ir(n, n.x + (n.hogar.x - n.x) / d * l, n.z + (n.hogar.z - n.z) / d * l, E.llegar, null, 15); }
    eventos.push({ tic, tipo: s.como || 'aparece', id: n.id, grupo: n.grupo });
    return n;
  } else if (s.tipo === 'se_va' && a && a.vivo) {
    a.objetivo = { x: s.x, z: s.z, tipo: 'irse' }; a.tarea = 'irse'; a.estado = E.irse; a.temporizador = TICS - tic - 1;
  }
}

// ---------------------------------------------------------------- decidir y actuar
function actuar(a, c) {
  const e = a.e;
  // terminar lo que está haciendo
  if (a.temporizador > 0) {
    a.temporizador -= c.pasos;
    if (a.objetivo) {
      let vel = velocidad(a) * c.pasos;
      const ref = a.objetivo.ref ? c.porId.get(a.objetivo.ref) : null;
      if (ref && ref.vivo) { a.objetivo.x = ref.x; a.objetivo.z = ref.z; }
      // los que trepan van por el árbol, nunca por el aire: a un sitio de la copa, primero andando
      // hasta la base del tronco, luego tronco arriba y luego por la rama; para irse, por la rama
      // de vuelta al tronco y tronco abajo (trepa() dice a dónde ir en este paso)
      // (con una ruta por una liana: sus puntos de paso con altura; trepa() no se mete)
      const porLiana = a.objetivo.ruta?.some((p) => p.y != null);
      if (porLiana) {
        const w = a.objetivo.ruta[0];
        if (w && w.y != null && Math.hypot(w.x - a.x, w.z - a.z) < 0.3 && Math.abs(a.y - w.y) > 0.05) {
          const sube = Math.max(0.3, e.andar) * c.pasos;
          a.x = w.x; a.z = w.z; a.y = a.y < w.y ? Math.min(w.y, a.y + sube) : Math.max(w.y, a.y - sube);
          // (al acabar de subir o bajar, una clave en la esquina: luego sigue en horizontal)
          if (Math.abs(a.y - w.y) <= 0.05) a._esquina = true;
          if (a.estado === E.andar || a.estado === E.trepar) a.estado = E.trepar;
          if (a.temporizador <= 0) terminar(a, c);
          return;
        }
        // (al pasar de trepar a andar o al revés, un paso quieto: así el fotograma clave cae en la esquina)
        const nuevo = a.y > 0.3 ? E.trepar : E.andar;
        if ((a.estado === E.andar || a.estado === E.trepar) && a.estado !== nuevo) { a.estado = nuevo; if (a.temporizador <= 0) terminar(a, c); return; }
        a.arbol = null;
      }
      const t = e.mueve === 'arboreo' && !porLiana ? trepa(a, c, vel) : null;
      if (t && t.hecho) { if (a.temporizador <= 0) terminar(a, c); return; }
      const x0 = a.x, z0 = a.z;
      // (con camino: a por el siguiente punto de paso; hasta el último no se llega)
      const ruta = a.objetivo.ruta;
      while (ruta && ruta.length && Math.hypot(ruta[0].x - a.x, ruta[0].z - a.z) < 0.3 && (ruta[0].y == null || Math.abs(a.y - ruta[0].y) <= 0.05)) ruta.shift();
      const w0 = porLiana && ruta && ruta.length && ruta[0].y != null && a.y > 0.3 ? ruta[0] : null, antes = w0 ? Math.hypot(w0.x - a.x, w0.z - a.z) : 0;
      let queda = t ? dirigir(a, t.x, t.z, vel) : ruta && ruta.length ? dirigir(a, ruta[0].x, ruta[0].z, vel) : dirigir(a, a.objetivo.x, a.objetivo.z, vel);
      // (por la liana, de una altura a la otra poco a poco, según lo que queda hasta el otro extremo)
      if (w0 && antes > 1e-3) a.y = w0.y + (a.y - w0.y) * (Math.hypot(w0.x - a.x, w0.z - a.z) / antes);
      // (al llegar a la punta de la liana, una clave en la esquina: luego baja en vertical)
      if (w0 && Math.hypot(w0.x - a.x, w0.z - a.z) < 0.3) a._esquina = true;
      if (t) queda = t.final ? Math.hypot(a.x - a.objetivo.x, a.z - a.objetivo.z) : Infinity;
      else if (ruta && ruta.length) queda = Infinity;
      if (a.x !== x0 || a.z !== z0) a.posado = false; // si se mueve, ya no está posado
      // cruzando agua: los que andan, nadan (y vuelven a andar al salir); los insectos y las
      // lombrices no se meten: se dan la vuelta en la orilla
      if (c.fino && !VUELA.has(e.mueve) && !(porLiana && a.y > 0.3)) {
        // (sobre un tronco-puente no es agua: se cruza por encima)
        const agua = c.mapa.esAgua(a.x, a.z) && !c.mapa.puenteEn(a.x, a.z, 0.3);
        if (agua && !NADA.has(e.mueve) && !(c.mapa.esAgua(x0, z0) && !c.mapa.puenteEn(x0, z0, 0.3))) {
          a.x = x0; a.z = z0;
          ESTADISTICAS.bloqueosAgua++; ESTADISTICAS.porAnimal.set(a.id, (ESTADISTICAS.porAnimal.get(a.id) || 0) + 1);
          if (a.estado === E.irse) { a.fuera = true; c.eventos.push({ tic: c.tic, tipo: 'se_va', id: a.id, grupo: a.grupo }); return; }
          // (se rodea el agua que tiene delante: la charca por el lado más corto, o el río por la orilla;
          // si después de unos cuantos rodeos sigue sin pasar, se da la vuelta)
          const o = a.objetivo, desvio = (o.rodeos = (o.rodeos || 0) + 1) <= 12 ? rodeoAgua(a, c.mapa, o) : null;
          if (desvio) { (o.ruta ||= []).unshift(desvio); return; }
          a.objetivo = null; a.temporizador = 0; a.estado = E.quieto; return; }
        if (agua && NADA_DESDE.has(a.estado)) { a._antes = a.estado; a.estado = E.nadar; }
        else if (!agua && a.estado === E.nadar) a.estado = a._antes ?? E.andar;
      }
      // (posado y sin moverse, se queda a su altura: la de la flor o la rama donde está)
      if (!a.posado && !t && !porLiana) a.y += (alturaDeseada(a, c.hora, c.mapa, a.objetivo) - a.y) * 0.25;
      if (a.estado === E.huir && queda <= 0.1) { a.estado = E.quieto; a.objetivo = null; }
      if (queda <= (a.objetivo?.radio ?? 0.4)) llegar(a, c);
      else if (a.estado === E.irse && queda < 1) { a.fuera = true; a.estado = E.irse; c.eventos.push({ tic: c.tic, tipo: 'se_va', id: a.id, grupo: a.grupo }); }
    }
    if (a.temporizador <= 0) terminar(a, c);
    if (a.presa) seguirCaza(a, c);
    return;
  }
  if (a.estado === E.nacer || a.estado === E.llegar) a.estado = E.quieto;
  // 1. huir si hay un depredador cerca
  if (c.fino && e.alerta > 0 && !(a.marca && a.marca.condenado) && huirSiHayPeligro(a, c)) return;
  // 2. caza que le ha mandado el director
  if (a.marca && a.marca.cazar && puedeCazar(a, c.porId.get(a.marca.cazar)) && empezarCaza(a, c.porId.get(a.marca.cazar), c, true)) return;
  // 3. dormir fuera de sus horas
  if (!activo(e, c.hora)) {
    // a su hogar (o, el orangután, a la plataforma de esta noche): si está en un árbol, subiendo
    const h = nidoDeNoche(a, c) || a.hogar;
    if (Math.hypot(a.x - h.x, a.z - h.z) > 2) {
      const arriba = h.y > 0, est = arriba && VUELA.has(e.mueve) ? E.volar : arriba && e.mueve === 'arboreo' ? E.trepar : E.andar;
      return ir(a, h.x, h.z, est, 'dormir', 400, arriba ? { y: h.y, radio: 0.3, tronco: h.tronco || { x: h.x, z: h.z } } : {});
    }
    // (las termitas, hasta la hora de salir: así salen todas juntas, en procesión)
    if (e.hogar === 'termitero') { const falta = Math.round(((ACTIVIDAD[e.actividad][0][0] - c.hora + 24) % 24) * 60); return hacer(a, E.dormir, Math.max(1, Math.min(60, falta))); }
    return hacer(a, E.dormir, 60);
  }
  // 3b. las termitas, despiertas: en procesión por su senda hasta la comida y de vuelta al termitero
  if (e.hogar === 'termitero' && c.fino) return procesion(a, c);
  // 4. beber
  if (e.bebe && a.sed > 0.65) {
    const w = c.mapa.aguaCercana(a.x, a.z);
    return ir(a, w.x, w.z, E.andar, 'beber', 300);
  }
  // 5. comer
  if (a.hambre > 0.35 && buscarComida(a, c)) return;
  // 6. cortejar en temporada (adultos)
  if (e.cria && e.cria.meses.includes(c.mes || 1) && a.masa >= a.adulta * 0.9 && c.az.si(0.0006 * c.pasos) && cortejar(a, c)) return;
  // 6b. su casa: las lombrices y los peloteros excavan a menudo; los demás, de vez en cuando
  //     arreglan la madriguera o, criando, el nido
  if (e.hogar === 'madriguera' && c.az.si((a.vertebrado ? 0.002 : 0.03) * c.pasos)) {
    if (Math.hypot(a.x - a.hogar.x, a.z - a.hogar.z) < 3 || !a.vertebrado) return hacer(a, E.excavar, 10 + c.az.entero(25));
  }
  if (e.hogar === 'nido_arbol' && criando(a, c) && c.az.si(0.01 * c.pasos)) return ir(a, a.hogar.x, a.hogar.z, VUELA.has(e.mueve) ? E.volar : E.trepar, 'anidar', 200, { y: 12, tronco: a.hogar.tronco || { x: a.hogar.x, z: a.hogar.z } });
  // 7. descansar si está cansado
  if (a.sueno > 0.7) return hacer(a, E.descansar, 20 + c.az.entero(30));
  // 8. seguir a su grupo o pasear por su territorio
  if (a.siguiendo) {
    const l = c.porId.get(a.siguiendo);
    // (a su lado: a un par de metros los grandes y a medio metro los pequeños, y nunca en el agua)
    const lejos = e.zona ? 1 : 3, k = e.zona ? 0.5 : 2;
    if (l && l.vivo && !l.fuera && dist(a, l) > lejos) {
      let x = l.x + c.az.entre(-k, k), z = l.z + c.az.entre(-k, k);
      if (c.mapa.esAgua(x, z) && !VUELA.has(e.mueve)) { x = l.x; z = l.z; }
      return ir(a, x, z, E.andar, null, 20);
    }
  }
  // (los pequeños, según su calma: el insecto palo y la mantis casi siempre quietos)
  if (c.az.si(e.calma ?? 0.5)) return hacer(a, E.quieto, 5 + c.az.entero(20));
  const p = puntoPaseo(a, c);
  // (si el paseo es quedarse donde está, quieto: «andar» un minuto hasta su propio sitio es andar en el sitio)
  if (Math.hypot(p.x - a.x, p.z - a.z) < 0.3) return hacer(a, E.quieto, 5 + c.az.entero(20));
  // (el escarabajo tigre, a carreras cortas y rápidas)
  if (e.carreras) return ir(a, p.x, p.z, E.correr, null, 6);
  return ir(a, p.x, p.z, e.mueve === 'planeo' ? E.planear : VUELA.has(e.mueve) ? E.volar : E.andar, null, 120);
}

// La procesión de las termitas (Hospitalitermes): al atardecer salen del termitero en fila por una senda hasta
// la hojarasca que comen, a unos metros, y vuelven. Las filas, cada día: las termitas de cada termitero, por
// orden de id, en filas de hasta 25 (filasDeTermitas). La primera de cada fila va y viene por la senda (la de su
// fila, fija: sale de su id); cada una de las demás va tras la de delante, minuto a minuto y casi tocándola (así
// no ataja y van en fila), algo más deprisa si se ha quedado atrás, y come cuando come la de delante. Si la de
// delante ya no está, hace de primera.
function filasDeTermitas(c) {
  if (c._filas) return;
  c._filas = true;
  const por = new Map();
  for (const b of c.porId.values()) {
    if (b.e?.hogar !== 'termitero' || !b.vivo || b.fuera || !b.hogar) continue;
    const k = b.hogar.x.toFixed(1) + ',' + b.hogar.z.toFixed(1);
    (por.get(k) || por.set(k, []).get(k)).push(b);
  }
  for (const l of por.values()) {
    l.sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
    l.forEach((b, i) => { b._delante = i % 25 ? l[i - 1].id : null; });
  }
}
function procesion(a, c) {
  filasDeTermitas(c);
  const l = a._delante ? c.porId.get(a._delante) : null;
  if (l && l.vivo && !l.fuera) {
    const d = dist(a, l);
    if (l.estado === E.comer && d < 0.6) { a.comiendo = { tipo: 'hojarasca', ref: null }; a.valor = TIPO_COMIDA.hojarasca; return hacer(a, E.comer, 10 + c.az.entero(10)); }
    // (tras ella cada minuto, hasta 16 cm: van en fila, casi tocándose)
    if (d > 0.2) return ir(a, l.x, l.z, E.andar, null, 4, { ref: l.id, radio: 0.16, prisa: d > 0.3 });
    return hacer(a, E.quieto, 1);
  }
  const h = a.hogar, sd = sendaDe(a, c.mapa), enCasa = Math.hypot(a.x - h.x, a.z - h.z) < 1;
  // en la punta de la senda (acaba de comer): de vuelta a casa
  if (Math.hypot(a.x - sd.x, a.z - sd.z) < 1 || !enCasa && a.tarea !== 'comer') return ir(a, h.x, h.z, E.andar, null, 200);
  // en casa: otra salida, o un rato quieta
  if (c.az.si(0.6)) { a.comiendo = { tipo: 'hojarasca', ref: null }; a.valor = TIPO_COMIDA.hojarasca; return ir(a, sd.x, sd.z, E.andar, 'comer', 200, { duracion: 20 + c.az.entero(20) }); }
  return hacer(a, E.quieto, 10 + c.az.entero(20));
}
// la punta de la senda de un grupo de termitas: a 4-8 m del termitero, en tierra y del mismo lado del río
function sendaDe(a, m) {
  if (a._senda) return a._senda;
  const h = a.hogar, az = new Azar(7, 41, hashTexto(a.id));
  let p = { x: h.x, z: h.z };
  for (let k = 0; k < 12; k++) {
    const ang = az.r() * 6.283, d = 4 + az.r() * 4, x = h.x + Math.cos(ang) * d, z = h.z + Math.sin(ang) * d;
    if (m.enMundo(x, z) && !m.esAgua(x, z) && !m.esAgua((x + h.x) / 2, (z + h.z) / 2) && ladoRio(m, x, z) === ladoRio(m, h.x, h.z)) { p = { x, z }; break; }
  }
  return (a._senda = p);
}

const VUELA = new Set(['vuelo', 'planeo', 'volador']);
const PARADO = new Set([E.quieto, E.descansar, E.dormir, E.comer, E.beber]);
const NADA = new Set(['suelo', 'reptil', 'serpiente', 'rana', 'arboreo']);
const NADA_DESDE = new Set([E.andar, E.correr, E.huir, E.llegar, E.irse, E.acechar]);
const criando = (a, c) => a.e.cria && a.e.cria.meses.includes(c.mes || 1) && a.masa >= a.adulta * 0.9;
// el paso de un trepador hacia su objetivo, por el árbol. Devuelve { x, z, final } (a dónde andar
// en este paso; final: ya va al objetivo mismo) o { hecho: true } si este paso sube o baja por el
// tronco (sin moverse en horizontal). a.arbol: el tronco del árbol en el que está.
const TRONCO = 0.4;
function trepa(a, c, vel) {
  const o = a.objetivo;
  // un sitio en alto sin tronco: el del árbol más cercano (y si no hay ninguno, se queda en el suelo)
  if ((o.y || 0) > 0.3 && !o.tronco) {
    let mejor = null, md = Infinity;
    c.rejArb?.cerca(o.x, o.z, 4, (t) => { if (!ARBOL.has(t.especie)) return; const d = Math.hypot(t.x - o.x, t.z - o.z); if (d < md) { md = d; mejor = t; } });
    if (mejor) o.tronco = { x: mejor.x, z: mejor.z }; else o.y = 0;
  }
  const sube = !!o.tronco && (o.y || 0) > 0.3;
  const arriba = a.y > 0.3, paso = Math.max(0.3, a.e.andar) * c.pasos;
  if (arriba && !a.arbol) a.arbol = { x: a.x, z: a.z }; // (ya estaba arriba: su tronco, donde está)
  const enEste = sube && a.arbol && Math.hypot(a.arbol.x - o.tronco.x, a.arbol.z - o.tronco.z) < 0.6;
  const mostrar = (est) => { if (a.estado === E.andar || a.estado === E.trepar) a.estado = est; };
  // (al cambiar de tramo, un paso quieto en la esquina: así el fotograma clave cae ahí y el dibujo
  // no corta en diagonal por el aire entre andar y subir)
  const fase = (f) => { if (a._tramo === f) return false; a._tramo = f; return true; };
  // 1. arriba y se va a otro sitio: por la rama al tronco y tronco abajo
  if (arriba && !enEste) {
    mostrar(E.trepar);
    if (Math.hypot(a.x - a.arbol.x, a.z - a.arbol.z) > TRONCO) { if (fase('alTronco')) return { hecho: true }; return { x: a.arbol.x, z: a.arbol.z, final: false }; }
    a.x = a.arbol.x; a.z = a.arbol.z;
    if (fase('baja')) return { hecho: true };
    a.y = Math.max(0, a.y - paso);
    if (a.y <= 0.3) { a.y = 0; a.arbol = null; }
    return { hecho: true };
  }
  if (!sube) { a.arbol = null; if (fase('suelo')) { mostrar(E.andar); return { hecho: true }; } mostrar(E.andar); return null; }
  // 2. abajo: andando hasta la base del tronco
  if (!arriba && Math.hypot(a.x - o.tronco.x, a.z - o.tronco.z) > TRONCO) { mostrar(E.andar); if (fase('suelo')) return { hecho: true }; return { x: o.tronco.x, z: o.tronco.z, final: false }; }
  // 3. por el tronco (arriba o abajo) hasta la altura del sitio; si ya está en el árbol pero en
  // otra rama, antes vuelve por ella al tronco
  if (Math.abs(a.y - o.y) > 0.05) {
    a.arbol = o.tronco; mostrar(E.trepar);
    if (arriba && Math.hypot(a.x - o.tronco.x, a.z - o.tronco.z) > TRONCO) { if (fase('alTronco')) return { hecho: true }; return { x: o.tronco.x, z: o.tronco.z, final: false }; }
    a.x = o.tronco.x; a.z = o.tronco.z;
    if (fase('sube')) return { hecho: true };
    a.y = a.y < o.y ? Math.min(o.y, a.y + paso) : Math.max(o.y, a.y - paso);
    return { hecho: true };
  }
  // 4. arriba: por la rama hasta el sitio, a su altura
  a.y = o.y; mostrar(E.trepar);
  if (fase('rama')) return { hecho: true };
  return { x: o.x, z: o.z, final: true };
}
// (los pequeños que andan, «rapido» veces su velocidad real: a su tamaño dibujado no se nota, y se ve que andan)
// (y la termita que se ha quedado atrás en la procesión, algo más deprisa hasta alcanzar a la de delante)
function velocidad(a) { const v = velocidadReal(a) * (a.objetivo?.prisa ? 1.5 : 1); return a.e.rapido ? v * a.e.rapido : v; }
function velocidadReal(a) {
  const e = a.e;
  if (a.estado === E.nadar) return e.andar * 0.6;
  // (en las ramas, como mucho 3 m/s: de rama en rama no se corre como por el suelo)
  // huir: el doble de lo que va normalmente (andando, o volando los que vuelan), sin pasar de correr
  if (a.estado === E.huir) {
    const normal = VUELA.has(e.mueve) ? e.correr * 0.6 : e.andar;
    return Math.min(e.correr, normal * 2, e.mueve === 'arboreo' && a.y > 1 ? 3 : Infinity);
  }
  if (a.estado === E.correr || a.estado === E.atacar) return e.mueve === 'arboreo' && a.y > 1 ? Math.min(3, e.correr) : e.correr;
  if (a.estado === E.acechar) return e.andar * 0.4;
  if (a.estado === E.volar || a.estado === E.planear || a.estado === E.irse) return e.mueve === 'vuelo' || e.mueve === 'planeo' || e.mueve === 'volador' ? e.correr * 0.6 : e.andar;
  return e.andar;
}

function ir(a, x, z, estado, tarea, tope, extra = {}) {
  // los que vuelan van volando a donde vayan (una mariposa «andando» va a 2 cm/s y no llega)
  if (VUELA.has(a.e.mueve) && (estado === E.andar || estado === E.correr)) estado = a.e.mueve === 'planeo' ? E.planear : E.volar;
  // los que trepan: en el suelo van andando (hasta el tronco) y en el árbol, trepando
  if (a.e.mueve === 'arboreo' && (estado === E.andar || estado === E.trepar)) estado = a.y > 0.3 ? E.trepar : E.andar;
  // los que andan y no nadan: su camino (por un tronco-puente si el destino está al otro lado del río,
  // rodeando las charcas); si no hay camino razonable para él, un destino de su lado
  let ruta = null;
  if (C_ACT && !NADA.has(a.e.mueve) && !VUELA.has(a.e.mueve) && !extra.ref) {
    ruta = rutaHasta(a, x, z, C_ACT.mapa);
    if (ruta === false) {
      const o = deMiLado(a, x, z, C_ACT.mapa);
      // (su hogar, al otro lado y sin camino: se busca otro de su lado)
      if (tarea === 'dormir' && a.hogar && Math.hypot(a.hogar.x - x, a.hogar.z - z) < 0.5) a.hogar = { ...a.hogar, x: o.x, z: o.z };
      x = o.x; z = o.z; ruta = rutaHasta(a, x, z, C_ACT.mapa) || null;
      if (tarea === 'comer') tarea = null; // (la comida estaba al otro lado: va de paseo)
    }
  }
  // (los que trepan cruzan el río por una liana de orilla a orilla si no es mucho rodeo; si no, nadan)
  if (C_ACT && a.e.mueve === 'arboreo' && !extra.ref && !(extra.y > 0.3)) ruta = rutaLiana(a, x, z, C_ACT.mapa) || ruta;
  a.objetivo = { x, z, ...extra };
  if (ruta && ruta.length) a.objetivo.ruta = ruta;
  a.posado = false;
  a.tarea = tarea;
  a.estado = estado;
  a.temporizador = tope;
  return true;
}

// ---------------------------------------------------------------- caminos (los que no nadan)
// Puntos de paso, no una rejilla: el único obstáculo grande es el río (una curva que parte el mapa en
// dos), así que basta con saber de qué lado está cada punto y cruzar por el tronco-puente que menos
// rodeo haga (mapa.puentes); las charcas, pequeñas, se rodean con un punto de paso a un lado. Es
// geometría pura: determinista y barata (se calcula al elegir destino, no cada minuto).
const ladoRio = (m, x, z) => (m.rio ? Math.sign(x - m.rioX(z)) : 0);
// lo más que rodea cada uno para llegar (m más que en línea recta): un insecto no da un rodeo de 50 m
const RODEO = { insecto: 25, gusano: 12 };
// la ruta hasta (x, z): [] si se va recto, [puntos...] si hay que pasar por ellos, false si no hay camino razonable
function rutaHasta(a, x, z, m) {
  const puntos = [];
  let ax = a.x, az = a.z;
  const la = ladoRio(m, ax, az), lb = ladoRio(m, x, z);
  // (si ya va por un tronco-puente, sigue por él hasta el final del lado al que va)
  const sobre = m.puenteEn(ax, az, 0.3);
  if (sobre) {
    const p = sobre.p, fin = ladoRio(m, p.x1, p.z1) === lb ? [p.x1, p.z1, p.x0, p.z0] : [p.x0, p.z0, p.x1, p.z1];
    const ux = fin[0] - fin[2], uz = fin[1] - fin[3], l = Math.hypot(ux, uz);
    puntos.push({ x: fin[0] + (ux / l) * 0.6, z: fin[1] + (uz / l) * 0.6 });
    ax = puntos[0].x; az = puntos[0].z;
  } else if (la && lb && la !== lb) {
    // al otro lado del río: por el tronco que menos rodeo haga (entrando y saliendo por su eje, desde tierra)
    let mejor = null, coste = Infinity;
    for (const p of m.puentes) {
      const [ix, iz, fx, fz] = ladoRio(m, p.x0, p.z0) === la ? [p.x0, p.z0, p.x1, p.z1] : [p.x1, p.z1, p.x0, p.z0];
      const ux = fx - ix, uz = fz - iz, l = Math.hypot(ux, uz);
      const A = { x: ix - (ux / l) * 0.6, z: iz - (uz / l) * 0.6 }, Bp = { x: fx + (ux / l) * 0.6, z: fz + (uz / l) * 0.6 };
      const k = Math.hypot(A.x - ax, A.z - az) + l + 1.2 + Math.hypot(x - Bp.x, z - Bp.z);
      if (k < coste) { coste = k; mejor = [A, Bp]; }
    }
    const rodeo = a.e.zona ? Math.max(3, a.e.zona) : RODEO[a.e.mueve] ?? Infinity;
    if (!mejor || coste - Math.hypot(x - ax, z - az) > rodeo) return false;
    tramo(m, la, ax, az, mejor[0].x, mejor[0].z, puntos);
    puntos.push(...mejor);
    ax = mejor[1].x; az = mejor[1].z;
  }
  // (el último tramo, de su lado)
  tramo(m, lb || la, ax, az, x, z, puntos);
  return puntos;
}
// un tramo recto de su lado que corta una curva del río (el cauce serpentea): un punto de paso por la orilla
// donde lo corta, y otra vez con cada mitad (como mucho unas pocas veces)
function porLaOrilla(m, la, x0, z0, x1, z1, puntos, n = 0) {
  if (!m.rio || !la || n > 4) return;
  const l = Math.hypot(x1 - x0, z1 - z0), pasos = Math.ceil(l / 0.8);
  for (let i = 1; i < pasos; i++) {
    const t = i / pasos, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    if (ladoRio(m, x, z) === la && m.distRio(x, z) > 0.4) continue;
    const q = { x: m.rioX(z) + la * (m.rio.ancho / 2 + 1.2), z };
    porLaOrilla(m, la, x0, z0, q.x, q.z, puntos, n + 1);
    puntos.push(q);
    porLaOrilla(m, la, q.x, q.z, x1, z1, puntos, n + 1);
    return;
  }
}
// las charcas que corta un tramo recto (en las casillas de sus extremos), rodeadas por un lado
function rodearCharcas(m, x0, z0, x1, z1, puntos) {
  const ux = x1 - x0, uz = z1 - z0, l2 = ux * ux + uz * uz;
  if (l2 < 1e-6) return;
  const vistas = new Set(), l = Math.sqrt(l2), cerca = [];
  for (const cel of new Set([m.celdaDe(x0, z0), m.celdaDe(x1, z1), m.celdaDe((x0 + x1) / 2, (z0 + z1) / 2)])) for (const ch of m.charcas[cel] || []) {
    if (vistas.has(ch)) continue; vistas.add(ch);
    const t = ((ch.x - x0) * ux + (ch.z - z0) * uz) / l2;
    if (t <= 0 || t >= 1) continue;
    const qx = x0 + ux * t - ch.x, qz = z0 + uz * t - ch.z, d = Math.hypot(qx, qz);
    if (d > ch.radio + 0.4 || Math.hypot(x1 - ch.x, z1 - ch.z) < ch.radio) continue; // (el destino dentro: ese ya no es sitio)
    const nx = d > 1e-3 ? qx / d : -uz / l, nz = d > 1e-3 ? qz / d : ux / l;
    cerca.push([t, { x: ch.x + nx * (ch.radio + 1), z: ch.z + nz * (ch.radio + 1) }]);
  }
  cerca.sort((a, b) => a[0] - b[0]);
  for (const [, q] of cerca) puntos.push(q);
}
// un tramo recto de su lado: por la orilla si corta una curva del río y rodeando las charcas
function tramo(m, la, x0, z0, x1, z1, puntos) {
  const ida = [];
  porLaOrilla(m, la, x0, z0, x1, z1, ida);
  let px = x0, pz = z0;
  for (const q of [...ida, { x: x1, z: z1, fin: true }]) { rodearCharcas(m, px, pz, q.x, q.z, puntos); if (!q.fin) puntos.push(q); px = q.x; pz = q.z; }
}
// un punto de paso para rodear el agua con la que se ha topado yendo hacia su siguiente punto (o su destino)
function rodeoAgua(a, m, o) {
  const T = o.ruta?.[0] || o, dx = T.x - a.x, dz = T.z - a.z, d = Math.hypot(dx, dz) || 1;
  const px = a.x + (dx / d) * 0.6, pz = a.z + (dz / d) * 0.6;
  for (const ch of m.charcas[m.celdaDe(px, pz)] || []) {
    if (Math.hypot(px - ch.x, pz - ch.z) > ch.radio + 0.3) continue;
    const vx = a.x - ch.x, vz = a.z - ch.z, ang = Math.atan2(vz, vx);
    const lado = Math.sign(vx * (T.z - ch.z) - vz * (T.x - ch.x)) || 1, r = ch.radio + 0.8;
    return { x: ch.x + Math.cos(ang + lado * 0.8) * r, z: ch.z + Math.sin(ang + lado * 0.8) * r };
  }
  if (m.rio && m.distRio(px, pz) <= 0) {
    const la = ladoRio(m, a.x, a.z) || 1, z = a.z + Math.sign(dz || 1) * 1.5;
    return { x: m.rioX(z) + la * (m.rio.ancho / 2 + 1.2), z };
  }
  return null;
}
// los que trepan, al otro lado del río: por la liana que cuelga de orilla a orilla (mapa: tipo 'colgante', rio)
// si cuesta menos que nadar (que es más lento) más un rodeo razonable: al pie del árbol de su orilla, tronco
// arriba hasta la liana, por ella hasta el otro árbol y tronco abajo. Los puntos de paso llevan su altura (y).
const altoArbol = (a) => (modeloPlanta(a.especie, 0).med.alto || a.altura) * escalaDe(a);
export function rutaLiana(a, x, z, m) {
  if (!m.rio) return null;
  const la = ladoRio(m, a.x, a.z), lb = ladoRio(m, x, z);
  if (!la || !lb || la === lb || a.y > 0.3) return null;
  let mejor = null, coste = Math.hypot(x - a.x, z - a.z) * 1.7 + 30; // (nadar, más lento; y hasta 30 m de rodeo por no mojarse)
  for (const b of m.baldosasCerca(a.x, a.z, 40)) for (const l of b.lianas || []) {
    if (l.tipo !== 'colgante' || !l.rio) continue;
    const [A, B, fA, fB] = ladoRio(m, l.a.x, l.a.z) === la ? [l.a, l.b, l.fa, l.fb] : [l.b, l.a, l.fb, l.fa];
    const yA = altoArbol(A) * fA, yB = altoArbol(B) * fB, k = Math.hypot(A.x - a.x, A.z - a.z) + yA + Math.hypot(B.x - A.x, B.z - A.z) + yB + Math.hypot(x - B.x, z - B.z);
    // (el pie de cada árbol, del lado de tierra: si el árbol está en la misma orilla, no en el agua)
    const ax = A.x + la * 0.3, bx = B.x + lb * 0.3;
    if (k < coste) { coste = k; mejor = [{ x: ax, z: A.z }, { x: ax, z: A.z, y: yA }, { x: bx, z: B.z, y: yB }, { x: bx, z: B.z, y: 0 }]; }
  }
  return mejor;
}
// un destino de su lado del río en vez de (x, z): el simétrico respecto al cauce, en tierra
function deMiLado(a, x, z, m) {
  const la = ladoRio(m, a.x, a.z) || 1, xr = m.rioX(z), lejos = Math.max(Math.abs(x - xr), m.rio.ancho / 2 + 1);
  let nx = xr + la * lejos;
  nx = Math.min(m.ancho - 1, Math.max(1, nx));
  if (ladoRio(m, nx, z) !== la || m.esAgua(nx, z)) return { x: a.x, z: a.z };
  return { x: nx, z };
}
function hacer(a, estado, tics) {
  // los que vuelan no se quedan quietos en el aire: antes se posan
  if (!a.posado && a.y > 0.05 && VUELA.has(a.e.mueve) && (estado === E.quieto || estado === E.descansar || estado === E.dormir) && C_ACT) return posarse(a, C_ACT, estado, tics);
  a.objetivo = null; a.tarea = null; a.estado = estado; a.temporizador = tics; return true;
}
let C_ACT = null; // el contexto del día que se simula (para hacer())
// posarse: en el punto más cercano de una planta de verdad (flor, hoja o rama, de la geometría
// del modelo: mundo/posaderos.js) a menos de 4 m o, si no hay, en el suelo; y luego, lo que iba a hacer
function posarse(a, c, estado, tics) {
  let p = null;
  if (c.fino) {
    let mejor = null, md = 16;
    c.rejArb.cerca(a.x, a.z, 4, (t) => { const d = (t.x - a.x) ** 2 + (t.z - a.z) ** 2; if (d < md) { md = d; mejor = t; } });
    if (mejor) p = posadero(mejor, a.x, a.y, a.z, a.e.mueve === 'volador' ? ['flor', 'hoja', 'rama'] : ['rama', 'hoja']);
  }
  if (!p) p = { x: a.x, z: a.z, y: 0 };
  a.objetivo = { x: p.x, z: p.z, y: p.y, radio: 0.05, luego: [estado, tics] };
  a.tarea = 'posarse'; a.estado = E.volar; a.temporizador = 30;
  return true;
}
// la plataforma de esta noche del orangután: en un árbol alto cerca de donde está (cada noche, otra)
function nidoDeNoche(a, c) {
  if (a.especieId !== 'orangutan' || !c.fino) return null;
  if (a._nidoNoche && a._nidoNoche.dia === c.dia) return a._nidoNoche;
  let mejor = null, md = Infinity;
  c.rejArb.cerca(a.x, a.z, 30, (t) => { if (!ARBOL.has(t.especie) || (t.altura || 0) < 8) return; const d = (t.x - a.x) ** 2 + (t.z - a.z) ** 2; if (d < md) { md = d; mejor = t; } });
  if (!mejor) return null;
  const n = { x: mejor.x + 0.5, z: mejor.z, y: horquilla(mejor) * 1.05, dia: c.dia, tronco: { x: mejor.x, z: mejor.z } };
  a._nidoNoche = n; a.nidos = [...(a.nidos || []).slice(-2), n];
  return n;
}

function puntoPaseo(a, c) {
  // a paso grueso: un sitio cualquiera de su área de campeo, alrededor de su hogar
  if (!c.fino) {
    const r = a.rango || 100;
    for (let k = 0; k < 6; k++) {
      const ang = c.az.r() * 6.283, d = Math.sqrt(c.az.r()) * r, x = a.hogar.x + Math.cos(ang) * d, z = a.hogar.z + Math.sin(ang) * d;
      if (!c.mapa.enMundo(x, z) || c.mapa.esAgua(x, z)) continue;
      if (a.territorio && !a.territorio.includes(c.mapa.celdaDe(x, z))) continue;
      return { x, z };
    }
    return { x: a.hogar.x, z: a.hogar.z };
  }
  const zona = a.e.zona, r = a.vertebrado ? Math.max(5, a.e.vista) : zona ? Math.min(zona, 4, Math.max(0.6, a.e.vista * 2)) : Math.max(0.5, a.e.vista * 2);
  for (let k = 0; k < (zona ? 10 : 6); k++) {
    const x = a.x + c.az.entre(-r, r), z = a.z + c.az.entre(-r, r);
    // (los pequeños, dentro de su zona de vida y de su lado del río)
    if (zona && (Math.hypot(x - a.hogar.x, z - a.hogar.z) > zona || ladoRio(c.mapa, x, z) !== ladoRio(c.mapa, a.hogar.x, a.hogar.z))) continue;
    if (c.mapa.esAgua(x, z) && a.e.mueve !== 'vuelo' && a.e.mueve !== 'planeo' && a.e.mueve !== 'volador') continue;
    // ni fuera del mundo, ni de su territorio, ni mucho más allá de su área de campeo
    if (!c.mapa.enMundo(x, z)) continue;
    // (su zona de vida manda sobre el territorio de la cohorte, que el motor puede mudar de cuadro)
    if (!zona && a.territorio && !a.territorio.includes(c.mapa.celdaDe(x, z))) continue;
    if (Math.hypot(x - a.hogar.x, z - a.hogar.z) > Math.max(a.rango || 10, 10) * 1.5) continue;
    return { x, z };
  }
  return { x: a.hogar.x, z: a.hogar.z };
}

// ---------------------------------------------------------------- llegar a donde iba
function llegar(a, c) {
  const t = a.tarea;
  a.vel = 0;
  // los que vuelan o trepan: justo a la altura de su sitio (una flor, una rama, el nido)
  if (a.objetivo?.y != null && (VUELA.has(a.e.mueve) || a.e.mueve === 'arboreo')) { a.x = a.objetivo.x; a.z = a.objetivo.z; a.y = a.objetivo.y; a.posado = true; }
  if (t === 'posarse') {
    const [estado, tics] = a.objetivo.luego;
    a.objetivo = null; a.tarea = null; a.estado = estado; a.temporizador = tics;
    return true;
  }
  if (t === 'beber') { a.sed = 0; return hacer(a, E.beber, 6 + c.az.entero(6)); }
  if (t === 'dormir') {
    // arreglar la madriguera o el nido antes de dormir
    if (a.e.hogar === 'madriguera' && c.az.si(0.35)) return hacer(a, E.excavar, 10 + c.az.entero(15));
    if (a.e.hogar === 'nido_arbol' && criando(a, c) && c.az.si(0.5)) return hacer(a, E.anidar, 15 + c.az.entero(20));
    return hacer(a, E.dormir, 60);
  }
  if (t === 'comer') return hacer(a, E.comer, a.objetivo?.duracion || 15);
  if (t === 'cortejar') return hacer(a, E.cortejar, 20);
  if (t === 'anidar') { c.eventos.push({ tic: c.tic, tipo: 'anidar', id: a.id, grupo: a.grupo }); return hacer(a, E.anidar, 20 + c.az.entero(30)); }
  if (t === 'irse') { a.fuera = true; return false; }
  a.objetivo = null;
  a.temporizador = 0;
  return false;
}

// al acabar una acción
function terminar(a, c) {
  if (a.estado === E.irse) {
    // no ha llegado al borde antes de acabar el día: se pierde entre la hojarasca
    a.fuera = true;
    c.eventos.push({ tic: c.tic, tipo: 'se_va', id: a.id, grupo: a.grupo });
    return;
  }
  if (a.estado === E.comer) {
    const q = a.comiendo;
    if (q) consumir(q, a, c);
    a.hambre = Math.max(0, a.hambre - 0.5);
    a.comiendo = null;
  } else if (a.estado === E.cortejar) {
    a.estado = E.aparearse; a.temporizador = 6;
    c.eventos.push({ tic: c.tic, tipo: 'apareamiento', id: a.id, grupo: a.grupo });
    return;
  }
  a.estado = E.quieto;
  a.objetivo = null;
  a.valor = 0;
}

// ---------------------------------------------------------------- comida
const KG_COMIDA = (a) => Math.max(1e-6, a.masa * 0.03); // lo que come de una sentada (kg)

// clase de recurso (la del motor) de cada tipo de comida del mundo
export const CLASE_COMIDA = { fruta: 'plantas', fruta_suelo: 'plantas', hojas: 'plantas', sotobosque: 'plantas', semillas: 'plantas',
  hojarasca: 'hojarasca', setas: 'setas', 'carroña': 'carroña', excremento: 'excremento' };
function consumir(q, a, c) {
  // lo que come un animal (por los individuos que representa), por el bocado de su clase de
  // comida, que se ajusta solo para que lo comido se parezca a lo que apunta el motor
  const kg = KG_COMIDA(a) * (a.vale || 1) * (c.bocado[CLASE_COMIDA[q.tipo]] ?? 1);
  // (lejos del foco no hay un árbol o una carroña concretos: se apunta lo comido y ya está)
  if (!q.ref) { /* comido por ahí */ }
  else if (q.tipo === 'fruta') q.ref.fruta = Math.max(0, q.ref.fruta - kg);
  else if (q.tipo === 'fruta_suelo') q.ref.frutaSuelo = Math.max(0, q.ref.frutaSuelo - kg);
  else if (q.tipo === 'setas') q.ref.queda = Math.max(0, q.ref.queda - kg / 0.05);
  else if (q.tipo === 'carroña') q.ref.masa = Math.max(0, q.ref.masa - kg);
  else if (q.tipo === 'excremento') q.ref.masa = Math.max(0, q.ref.masa - kg);
  c.eventos.push({ tic: c.tic, tipo: 'comer', id: a.id, grupo: a.grupo, recurso: q.tipo, kg });
}

function buscarComida(a, c) {
  const e = a.e;
  for (const tipo of e.come) {
    if (tipo === 'presas') {
      // vertebrados solo a veces (lo que diga la cacería del grupo); el resto, invertebrados
      const p = buscarPresa(a, c, c.az.si(c.caceria[a.grupo] ?? 1));
      if (p && empezarCaza(a, p, c, false)) return true;
      if (comeInvertebrados(a.grupo, c)) {
        // insectos, gusanos...: picotea por ahí
        const q = puntoPaseo(a, c);
        a.comiendo = null; a.valor = TIPO_COMIDA.presas;
        return ir(a, q.x, q.z, e.carreras ? E.correr : E.andar, 'comer', 60, { duracion: 15 + c.az.entero(15) });
      }
      continue;
    }
    if (Math.hypot(a.x - c.foco.x, a.z - c.foco.z) > 330) {
      // lejos del foco no se buscan árboles (ni carroñas) concretos: come por ahí
      const p = puntoPaseo(a, c);
      a.comiendo = { tipo, ref: null };
      a.valor = TIPO_COMIDA[tipo] || 0;
      return ir(a, p.x, p.z, E.andar, 'comer', 60, { duracion: 20 });
    }
    const q = sitioDeComida(a, tipo, c);
    if (q) {
      a.comiendo = q;
      a.valor = TIPO_COMIDA[tipo] || 0;
      const vuela = e.mueve === 'vuelo' || e.mueve === 'planeo' || e.mueve === 'volador';
      // en la copa: al fruto, la flor o la hoja de verdad más cercana (la geometría del modelo)
      let x = q.x, z = q.z, y = 0;
      if ((tipo === 'fruta' || tipo === 'hojas') && q.ref?.giro !== undefined && (vuela || e.mueve === 'arboreo')) {
        const tipos = tipo === 'fruta' ? (e.mueve === 'volador' ? ['flor', 'fruto', 'hoja'] : ['fruto', 'flor', 'hoja']) : ['hoja', 'rama'];
        const p = posadero(q.ref, a.x, (q.ref.altura || 8) * 0.75, a.z, tipos);
        if (p) { x = p.x; z = p.z; y = p.y; }
      }
      return ir(a, x, z, vuela ? E.volar : (e.mueve === 'arboreo' && y > 0 ? E.trepar : E.andar), 'comer', 300,
        { y, duracion: 10 + c.az.entero(20), radio: y > 0 ? 0.1 : 0.6, tronco: y > 0 && q.ref ? { x: q.ref.x ?? q.x, z: q.ref.z ?? q.z } : null });
    }
  }
  return false;
}
const TIPO_COMIDA = { fruta: 1, fruta_suelo: 2, hojas: 3, sotobosque: 4, semillas: 5, setas: 6, hojarasca: 7, 'carroña': 8, excremento: 9, presas: 10 };

function sitioDeComida(a, tipo, c) {
  // (hasta 40 m: más lejos no se distingue un árbol con fruta, y con miles de árboles alrededor
  // buscar más allá era lo más caro de todo el día)
  // (los pequeños, solo dentro de su zona de vida)
  const zona = a.e.zona, r = zona ? zona * 2 : Math.min(40, Math.max(15, a.e.vista * 1.5)), kg = KG_COMIDA(a);
  let mejor = null, md = Infinity;
  const mira = (x, z, ref, ok) => {
    if (!ok) return;
    if (zona && Math.hypot(x - a.hogar.x, z - a.hogar.z) > zona * 1.2) return;
    const d = Math.hypot(x - a.x, z - a.z);
    if (d < r && d < md) { md = d; mejor = { tipo, x, z, ref }; }
  };
  if (tipo === 'fruta') c.rejArb.cerca(a.x, a.z, r, (t) => { if (t.fruta > kg) mira(t.x, t.z, t, true); });
  else if (tipo === 'fruta_suelo' || tipo === 'semillas') c.rejArb.cerca(a.x, a.z, r, (t) => { if (t.frutaSuelo > kg * 0.2) mira(t.x + c.az.entre(-1, 1), t.z + c.az.entre(-1, 1), t, true); });
  else if (tipo === 'hojas') c.rejArb.cerca(a.x, a.z, r, (t) => { mira(t.x, t.z, t, t.hojas > 0.01); });
  else if (tipo === 'setas') for (const s of c.setas) mira(s.x, s.z, s, s.queda > 0);
  else if (tipo === 'carroña') for (const s of c.carronas) mira(s.x, s.z, s, s.masa > 0);
  else if (tipo === 'excremento') for (const s of c.excrementos) mira(s.x, s.z, s, s.masa > 0);
  else if (tipo === 'sotobosque' || tipo === 'hojarasca') {
    // está en todas partes: un poco más allá
    const ang = c.az.r() * 6.283, d = c.az.entre(0.5, Math.max(1, a.e.vista));
    const x = a.x + Math.cos(ang) * d, z = a.z + Math.sin(ang) * d;
    if (zona && Math.hypot(x - a.hogar.x, z - a.hogar.z) > zona) return { tipo, x: a.x, z: a.z, ref: null };
    if (c.mapa.enMundo(x, z) && !c.mapa.esAgua(x, z)) return { tipo, x, z, ref: null };
  }
  return mejor;
}

// ---------------------------------------------------------------- caza
const INVERTEBRADOS = new Map();
function comeInvertebrados(g, c) {
  if (!INVERTEBRADOS.has(g)) INVERTEBRADOS.set(g, [...(c.presasDe.get(g) || [])].some((p) => !VERTEBRADOS.has(p)));
  return INVERTEBRADOS.get(g);
}
/* Si un cazador puede cazar a una presa por tamaño: la especie de la presa, de adulta, como mucho
   el 60 % de lo que pesa la del cazador de adulta (un águila no caza ciervos, aunque sean crías: en
   el mapa se ven como ciervos), y la presa de ahora, como mucho la mitad de lo que pesa él. */
export function puedeCazar(cazador, presa) {
  if (!cazador || !presa) return false;
  return (presa.adulta || presa.masa) <= (cazador.adulta || cazador.masa) * 0.6 && presa.masa <= cazador.masa * 0.5;
}

function buscarPresa(a, c, vertebrados = true) {
  const presas = c.presasDe.get(a.grupo);
  if (!presas || !presas.size) return null;
  let mejor = null, md = Infinity;
  // presas de su tamaño: ni más de la mitad de su peso ni diminutas
  const maxima = a.masa * 0.5, minima = a.masa * 1e-5;
  (c.fino ? c.rej : c.rejG).cerca(a.x, a.z, a.e.vista, (p) => {
    if (p === a || !p.vivo || p.fuera || !presas.has(p.grupo) || p.cazadoPor) return;
    if (p.masa > maxima || p.masa < minima || !puedeCazar(a, p)) return;
    // quien no vuela no persigue a un ave que va volando (posada o en el suelo, sí)
    if (!VUELA.has(a.e.mueve) && VUELA.has(p.e.mueve) && p.y > 0.5 && !p.posado) return;
    if (p.vertebrado && !vertebrados && !(a.marca && a.marca.cazar === p.id)) return;
    if (p.marca && p.marca.protegido && !(a.marca && a.marca.cazar === p.id)) return;
    const d = dist(a, p);
    if (d < md && d < a.e.vista) { md = d; mejor = p; }
  });
  return mejor;
}

function empezarCaza(a, p, c, forzada) {
  if (!p || !p.vivo || p.fuera) { if (a.marca) a.marca.cazar = null; return false; }
  a.presa = p.id;
  p.cazadoPor = a.id;
  const est = a.e.caza === 'emboscada' || a.e.caza === 'lengua' ? E.acechar : a.e.caza === 'picada' ? E.planear : E.acechar;
  a.valor = TIPO_COMIDA.presas;
  return ir(a, p.x, p.z, est, 'cazar', forzada ? 900 : 120, { ref: p.id, radio: alcance(a) });
}
const alcance = (a) => (a.e.caza === 'lengua' ? 0.15 : a.e.caza === 'emboscada' ? 0.4 : Math.max(0.3, a.masa ** 0.33 * 0.4));

function seguirCaza(a, c) {
  const p = c.porId.get(a.presa);
  if (!p || !p.vivo || p.fuera) { soltarPresa(a, c); return; }
  const d = dist(a, p);
  const forzada = a.marca && a.marca.cazar === p.id;
  // la presa se da cuenta (si no está condenada) y huye: carrera
  if (a.estado === E.acechar && d < Math.max(p.e.alerta, 1) && !(p.marca && p.marca.condenado) && c.az.si(0.08)) {
    a.estado = E.correr;
    huirDe(p, a, c);
  }
  if (a.estado === E.acechar && d < alcance(a) * 4 + 1) a.estado = E.atacar;
  if (d <= alcance(a) + 0.2) {
    // el ataque
    let exito = a.e.exito ?? 0.3;
    if (p.marca && p.marca.condenado) exito = 1;
    if (forzada) exito = 1;
    if (p.marca && p.marca.protegido && !forzada) exito = 0;
    if (c.az.si(exito)) matar(a, p, c);
    else {
      c.eventos.push({ tic: c.tic, tipo: 'caza_fallida', id: a.id, presa: p.id, grupo: a.grupo, grupoPresa: p.grupo });
      huirDe(p, a, c);
      soltarPresa(a, c);
      hacer(a, E.descansar, 10);
    }
    return;
  }
  if (a.temporizador <= 1 && !forzada) {
    soltarPresa(a, c);
    hacer(a, E.quieto, 5);
  }
}

function soltarPresa(a, c) {
  const p = c.porId.get(a.presa);
  if (p && p.cazadoPor === a.id) p.cazadoPor = null;
  a.presa = null;
}

function matar(a, p, c) {
  // un representante de invertebrados vale por muchos: comérselo es picotear unos pocos de
  // los que representa, salvo que el director diga que ese representante muere entero
  if (!p.vertebrado && !(p.marca && p.marca.condenado) && !(a.marca && a.marca.cazar === p.id)) {
    c.eventos.push({ tic: c.tic, tipo: 'picoteo', id: a.id, presa: p.id, grupo: a.grupo, grupoPresa: p.grupo });
    a.presa = null; p.cazadoPor = null;
    a.hambre = Math.max(0, a.hambre - 0.4);
    huirDe(p, a, c);
    hacer(a, E.comer, 4 + c.az.entero(6));
    return;
  }
  p.vivo = false; p.estado = E.morir; p.temporizador = 15; p.y = 0; p.cazadoPor = a.id;
  a.presa = null;
  if (a.marca && a.marca.cazar === p.id) a.marca.cazar = null;
  c.eventos.push({ tic: c.tic, tipo: 'caza', id: a.id, presa: p.id, grupo: a.grupo, grupoPresa: p.grupo, cohorte: a.cohorte, cohortePresa: p.cohorte,
    vale: p.vale, enVista: Math.hypot(p.x - c.foco.x, p.z - c.foco.z) < RADIO_FOCO });
  const kg = Math.min(p.masa * p.vale, KG_COMIDA(a) * 3);
  a.hambre = Math.max(0, a.hambre - 0.7);
  if (p.vertebrado && p.masa > kg) c.carronas.push({ id: `c${p.id}`, x: p.x, z: p.z, masa: p.masa - kg, de: p.especieId, tic: c.tic });
  a.x = p.x; a.z = p.z;
  hacer(a, E.comer, Math.max(5, Math.min(90, Math.round(10 + 20 * Math.log10(1 + p.masa * 1000)))));
}

function huirDe(p, depredador, c) {
  const dx = p.x - depredador.x, dz = p.z - depredador.z, d = Math.hypot(dx, dz) || 1;
  const lejos = Math.min(30, 6 + p.e.alerta);
  let x = p.x + (dx / d) * lejos, z = p.z + (dz / d) * lejos, y = 0, tronco = null;
  if (!c.mapa.enMundo(x, z)) { x = p.x - (dx / d) * lejos * 0.3; z = p.z - (dz / d) * lejos * 0.3; }
  if (p.e.refugio === 'aire' && VUELA.has(p.e.mueve)) y = 6;
  else if (p.e.refugio === 'arbol' && p.e.mueve === 'arboreo' && c.fino) {
    // los que trepan huyen a un árbol (lejos del depredador): a su horquilla, nunca por el aire
    let mejor = null, mp = -Infinity;
    c.rejArb.cerca(p.x, p.z, lejos, (t) => {
      if (!ARBOL.has(t.especie) || (t.altura || 0) < 6) return;
      const ex = t.x - p.x, ez = t.z - p.z, de = Math.hypot(ex, ez) || 1, lejosDel = (ex * dx + ez * dz) / (de * d);
      const puntos = lejosDel * 2 - Math.abs(de - lejos * 0.5) / lejos;
      if (puntos > mp) { mp = puntos; mejor = t; }
    });
    if (mejor) { x = mejor.x + 0.3; z = mejor.z; y = horquilla(mejor); tronco = { x: mejor.x, z: mejor.z }; }
  }
  // (los que no nadan huyen por donde pueden: por un tronco-puente o, si no, de su lado del río)
  let ruta = null;
  if (!NADA.has(p.e.mueve) && !VUELA.has(p.e.mueve) && c.mapa.rio) {
    ruta = rutaHasta(p, x, z, c.mapa);
    if (ruta === false) { const o = deMiLado(p, x, z, c.mapa); x = o.x; z = o.z; ruta = rutaHasta(p, x, z, c.mapa) || null; }
  }
  p.objetivo = { x, z, y, tronco };
  if (ruta && ruta.length) p.objetivo.ruta = ruta;
  p.tarea = null;
  p._deQuien = depredador.id;
  p.estado = E.huir;
  p.temporizador = 15;
}

function huirSiHayPeligro(a, c) {
  let peligro = null;
  c.rej.cerca(a.x, a.z, a.e.alerta, (p) => {
    if (p === a || !p.vivo || p.fuera) return;
    const presas = c.presasDe.get(p.grupo);
    if (!presas || !presas.has(a.grupo)) return;
    if (!activo(p.e, c.hora) && !p.presa) return;
    // solo asusta quien podría cazarlo por tamaño, salvo que vaya a por él de verdad
    if (p.presa !== a.id && !puedeCazar(p, a)) return;
    if (dist(a, p) < a.e.alerta) { peligro = p; return false; }
  });
  if (!peligro) return false;
  // a veces no se da cuenta
  if (!c.az.si(0.35)) return false;
  huirDe(a, peligro, c);
  return true;
}

// ---------------------------------------------------------------- cortejo
function cortejar(a, c) {
  let pareja = null, md = Infinity;
  c.rej.cerca(a.x, a.z, Math.max(5, a.e.vista), (b) => {
    if (b === a || !b.vivo || b.especieId !== a.especieId || b.sexo === a.sexo || b.estado === E.dormir) return;
    const d = dist(a, b);
    if (d < md) { md = d; pareja = b; }
  });
  if (!pareja) return false;
  ir(a, pareja.x, pareja.z, E.andar, 'cortejar', 120, { radio: Math.max(0.3, a.masa ** 0.33 * 0.6), pareja: pareja.id });
  if (pareja.temporizador <= 0 || pareja.estado === E.quieto) ir(pareja, a.x, a.z, E.andar, 'cortejar', 120, { radio: Math.max(0.3, a.masa ** 0.33 * 0.6), pareja: a.id });
  c.eventos.push({ tic: c.tic, tipo: 'cortejo', id: a.id, pareja: pareja.id, grupo: a.grupo });
  return true;
}
