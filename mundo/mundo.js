// El mundo vivo: el motor (por el puente) más los animales de uno en uno, día a día, en todo
// el mundo.
//
// Cada cohorte del motor tiene sus animales en el mapa: tantos como individuos, o, en los grupos
// muy numerosos, uno por cada N (N fijo por grupo, para que el total quepa: unos miles). Todos
// se simulan; alrededor de donde mira la cámara, minuto a minuto, y en el resto a paso grueso.
//
// Cada día:
//  1. el motor avanza un día y dice qué ha pasado (cazas, muertes, nacimientos, llegadas...);
//  2. eso pasa a los animales: de cada suceso de n individuos de una cohorte, n / N animales
//     (con acumuladores, para que cuadre exactamente): quién tiene que morir cazado y por quién,
//     quién de muerte natural, quién nace, llega o se va;
//  3. se simula el día con varias semillas sin ayuda y se elige la que más se parece;
//  4. el «director» repite lo que salió solo y empuja con discreción lo que falta;
//  5. al acabar, cada cohorte tiene los animales que le tocan.
// Se mide cuánto sale solo y cuánto se empuja (medidas de cada día).

import { Azar } from './azar.js';
import { Mapa, hashTexto } from './mapa.js';
import { PuenteMotor } from './puente.js';
import { Agente, elegirEspecie, nuevoId, quitarEspecies } from './agentes.js';
import { completar, aplicarAlEscenario, opcionesMapa } from './config.js';
import { VERTEBRADOS, ESPECIES_DE_GRUPO, E } from './especies.js';
import { simularDia, TICS, CLAVE, DETALLE, CLASE_COMIDA, TAREAS } from './dia.js';
import { escalarEscenario } from './escala.js';
import { Registro } from './registro.js';
import { aplicarParametros } from './parametros.js';
import { clonarProfundo } from '../motor/clonar.js';
import { horquilla, ARBOL } from './posaderos.js';

// cuántos animales caben: vertebrados en total y de cada grupo de invertebrados (más allá, cada
// animal representa a varios individuos del motor)
// (para un mapa de 100 m; más grande, más, hasta 4 veces)
const MAX_VERTEBRADOS = 250, MAX_INVERTEBRADOS = 150;
// el diorama: lo que se dibuja y se simula es siempre un cuadrado de LADO m, que representa el
// mundo entero (de 1 a 10 km²): todos sus animales, cada uno por N individuos del motor
export const LADO = 100; // por defecto (config.lado)
// pasos de animal por día que se simulan como mucho (el paso grueso se alarga si hay muchos)
const PRESUPUESTO = 600000;
export const RADIO_FOCO = 100;

// N: individuos del motor por animal, redondeado a un número «bonito» (1, 2, 5, 10, 20...)
function valeBonito(x) {
  if (x <= 1) return 1;
  const p = 10 ** Math.floor(Math.log10(x)), m = x / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

export class Mundo {
  // config: la del mundo (mundo/config.js: agua, bosque, clima, especies...); sin ella, el
  // escenario tal cual
  constructor(escenario, meta, { semilla = 1, semillasPorDia = 1, pasadasDirector = 1, km2 = null, config = null } = {}) {
    this.config = config ? completar(config) : null;
    if (this.config) { aplicarAlEscenario(escenario, this.config); km2 = km2 ?? this.config.km2; semilla = this.config.semilla ?? semilla; }
    quitarEspecies(this.config?.quitar);
    if (km2) escalarEscenario(escenario, km2);
    this.semilla = semilla;
    this.semillasPorDia = semillasPorDia;
    this.pasadasDirector = pasadasDirector;
    // cacería: probabilidad de que un depredador con hambre vaya a por vertebrados (el resto
    // de las veces come invertebrados). Se ajusta sola cada día para que las cazas que salen
    // sin ayuda se parezcan en número a las del motor.
    this.caceria = {};
    // bocado: cuánto come cada animal de una sentada, por clase de comida, respecto a un 3 % de
    // su peso. También se ajusta solo, para que lo comido se parezca a lo que apunta el motor.
    this.comidoReciente = {};
    this.bocado = { plantas: 0.02, hojarasca: 2e-3, setas: 0.03, 'carroña': 1, excremento: 1 };
    this.puente = new PuenteMotor(escenario, meta, { semilla });
    const p = this.puente;
    // los datos del motor día a día (pestaña «Datos») y los cambios de parámetros hechos
    this.registro = new Registro(p, meta);
    this.cambios = []; // [{ desde, cambios }]
    this.km2 = p.nx * p.ny * p.celda * p.celda / 1e6;
    // el cuadro del motor que se ve, y su lado de verdad
    this.dio = p.celdaDiorama; this.ladoReal = p.celda;
    this.lado = this.config?.lado || LADO;
    const escalaMapa = Math.min(4, Math.max(1, (this.lado / 100) ** 2));
    this.maxV = MAX_VERTEBRADOS * escalaMapa; this.maxI = MAX_INVERTEBRADOS * Math.min(2, escalaMapa);
    this.opcionesMapa = { nx: 1, ny: 1, celda: this.lado, areaCelda: p.celda * p.celda, diorama: 0, semilla, ...(this.config ? opcionesMapa(this.config) : {}) };
    this.mapa = new Mapa(this.opcionesMapa);
    this.foco = { ...this.mapa.centro }; // donde mira la cámara (lo dice la parte visual)
    this.az = new Azar(semilla, 99);
    this.agentes = new Map();
    this.porCohorte = new Map(); // cohorte -> Set de ids
    this.carronas = [];
    this.excrementos = [];
    this.vale = {};      // grupo -> individuos del motor por animal (N)
    this.acc = {};       // fracciones pendientes de sucesos, por cohorte
    this.focoId = null;  // el animal que sigue la cámara (se simula siempre minuto a minuto)
    this.dia = 0;
    this.historial = [];
    // de quién es presa cada grupo (lo que dice el motor: prey_groups de sus cohortes)
    this.presasDe = new Map();
    for (const c of p.animal.active_cohorts.values()) {
      if (!this.presasDe.has(c.fg.name)) this.presasDe.set(c.fg.name, new Set([...c.prey_groups.keys()].filter((k) => ESPECIES_DE_GRUPO[k])));
    }
    this.cohortesAhora = p.cohortes();
    this.mapa.actualizarPlantas([p.plantasDe(this.dio)]);
    // N por grupo, a partir de cuántos hay al empezar en el cuadro
    const tot = {};
    for (const c of this.cohortesAhora) if (c.estado === 'activa') tot[c.grupo] = (tot[c.grupo] || 0) + c.n * this.parte(c);
    // invertebrados: cada grupo con unos MAX_INVERTEBRADOS animales; vertebrados: todos de uno en
    // uno mientras quepan y, si no, se sube N al grupo que más animales tenga (1, 2, 5, 10...),
    // de modo que los escasos (mamíferos, rapaces) son los últimos en representar a varios
    for (const g of Object.keys(ESPECIES_DE_GRUPO)) this.vale[g] = VERTEBRADOS.has(g) ? 1 : valeBonito((tot[g] || 0) / this.maxI);
    const animalesV = () => [...VERTEBRADOS].reduce((s, g) => s + (tot[g] || 0) / this.vale[g], 0);
    while (animalesV() > this.maxV) {
      const g = [...VERTEBRADOS].sort((a, b) => (tot[b] || 0) / this.vale[b] - (tot[a] || 0) / this.vale[a])[0];
      this.vale[g] = valeBonito(this.vale[g] * 1.5 + 0.5);
    }
    this.poblar(this.cohortesAhora, this.az);
  }

  // ---------------------------------------------------------------- animales
  agregar(a) {
    this.agentes.set(a.id, a);
    if (a.cohorte) { let s = this.porCohorte.get(a.cohorte); if (!s) this.porCohorte.set(a.cohorte, (s = new Set())); s.add(a.id); }
  }
  quitar(a) {
    if (!a) return;
    this.agentes.delete(a.id);
    if (a.cohorte) this.porCohorte.get(a.cohorte)?.delete(a.id);
  }
  vivosDe(coh) { return [...(this.porCohorte.get(coh) || [])].map((id) => this.agentes.get(id)).filter((a) => a && a.vivo && !a.fuera); }

  // la parte de una cohorte que sale en el cuadrado que se ve: todo, porque el cuadrado
  // representa el mundo entero (cada animal dibujado vale por N individuos)
  parte() { return 1; }
  // cuántos animales tocan a una cohorte: (n · parte) / N, redondeado con un azar fijo de la cohorte
  objetivoCohorte(c) {
    const v = this.vale[c.grupo] || 1, n = c.n * this.parte(c);
    return Math.min(Math.ceil(n / v), Math.floor(n / v + new Azar(this.semilla, 31, hashTexto(String(c.id))).r()));
  }

  nuevoAnimal(c, az, donde = null) {
    const especie = elegirEspecie(c.grupo, az);
    const p = donde || this.mapa.puntoEnCelda(0, az);
    const v = this.vale[c.grupo] || 1;
    const a = new Agente({ id: nuevoId(VERTEBRADOS.has(c.grupo) ? 'v' : 'i'), especie, grupo: c.grupo, cohorte: c.id, x: p.x, z: p.z, az, masa: c.masa, adulta: c.adulta, edad: c.edad, vale: v });
    a.territorio = c.territorio;
    // área de campeo: la del motor (territory_size, m²), como un círculo alrededor de su hogar
    a.rango = Math.min(this.lado * 0.6, Math.max(VERTEBRADOS.has(c.grupo) ? 10 : 2, Math.sqrt((c.campeo || 1e4) / Math.PI)));
    if (c.grupo === 'detritivorous_insect') { const m = this.mapa.termiteroCercano(p.x, p.z); if (m) a.hogar = { x: m.x, z: m.z }; }
    else {
      const ang = az.r() * 6.283, d = az.r() * Math.min(a.rango * 0.3, 30);
      const h = { x: p.x + Math.cos(ang) * d, z: p.z + Math.sin(ang) * d };
      a.hogar = this.hogarEn(a, this.mapa.enMundo(h.x, h.z) && !this.mapa.esAgua(h.x, h.z) ? h : { x: p.x, z: p.z });
    }
    return a;
  }
  // el hogar de verdad: los nidos y dormideros de árbol, en la horquilla del árbol alto más
  // cercano (con su altura, y); los demás, en el suelo donde caiga
  hogarEn(a, p) {
    const tipo = a.e?.hogar;
    if (tipo !== 'nido_arbol' && tipo !== 'dormidero_arbol') return p;
    let mejor = null, md = Infinity;
    for (const t of this.mapa.arbolesCerca(p.x, p.z, 25)) {
      if (!ARBOL.has(t.especie) || (t.altura || 0) < 6) continue;
      const d = (t.x - p.x) ** 2 + (t.z - p.z) ** 2;
      if (d < md) { md = d; mejor = t; }
    }
    if (!mejor) return p;
    return { x: mejor.x + 0.35, z: mejor.z, y: horquilla(mejor) * (tipo === 'dormidero_arbol' ? 1.15 : 1), arbol: mejor.id };
  }

  // los que viven en grupo siguen a uno de su especie y cohorte
  agrupar(ids) {
    const porEspecie = new Map();
    for (const id of ids) { const a = this.agentes.get(id); if (!a) continue; const l = porEspecie.get(a.especieId) || []; l.push(a); porEspecie.set(a.especieId, l); }
    for (const l of porEspecie.values()) {
      const [mn, mx] = l[0].e.social;
      if (mx <= 1) continue;
      const tam = Math.max(mn, Math.min(mx, l.length));
      for (let i = 0; i < l.length; i++) {
        const lider = l[Math.floor(i / tam) * tam];
        if (lider !== l[i]) { l[i].siguiendo = lider.id; l[i].hogar = lider.hogar; l[i].x = lider.x + this.az.entre(-3, 3); l[i].z = lider.z + this.az.entre(-3, 3); }
      }
    }
  }

  // pone (sin animación) los animales que tocan a cada cohorte y quita los que sobran
  poblar(cohortes, az) {
    for (const c of cohortes) {
      if (c.estado !== 'activa' || !ESPECIES_DE_GRUPO[c.grupo]) continue;
      const quiere = this.objetivoCohorte(c), hay = this.vivosDe(c.id);
      const nuevos = [];
      for (let k = hay.length; k < quiere; k++) { const a = this.nuevoAnimal(c, az); this.agregar(a); nuevos.push(a.id); }
      for (let k = quiere; k < hay.length; k++) if (!hay[k].foco) this.quitar(hay[k]);
      if (nuevos.length) this.agrupar(nuevos);
    }
  }

  ponerFoco(id) {
    for (const a of this.agentes.values()) a.foco = false;
    this.focoId = id;
    const a = id && this.agentes.get(id);
    if (a) a.foco = true;
  }
  // el paso grueso (minutos): para que el día no pase de PRESUPUESTO pasos de animal
  get paso() { return Math.min(30, Math.max(10, Math.ceil(this.agentes.size * TICS / PRESUPUESTO))); }
  // cuántos individuos hay en el mapa según el motor (vertebrados e invertebrados)
  totales(cohortes = this.cohortesAhora) {
    const t = {};
    for (const c of cohortes) if (c.estado === 'activa') t[c.grupo] = (t[c.grupo] || 0) + c.n * this.parte(c);
    return t;
  }

  // ---------------------------------------------------------------- un día
  // ---------------------------------------------------------------- parámetros
  // un cambio de parámetros (mundo/parametros.js) desde un día: se apunta y se aplica al motor
  // cuando el motor llega a ese día (así se puede rehacer igual desde el principio)
  cambiarParametros(cambios, desde) {
    this.cambios = this.cambios.filter((c) => c.desde < desde);
    this.cambios.push({ desde, cambios: { ...cambios } });
    if (this.puente.dia >= desde) aplicarParametros(this.puente, cambios, this.puente.dia);
  }
  aplicarCambiosDe(dia) {
    for (const c of this.cambios) if (c.desde === dia) aplicarParametros(this.puente, c.cambios, dia);
  }
  // los parámetros que rigen ahora (los del último cambio ya aplicado)
  get parametrosAhora() { const l = this.cambios.filter((c) => c.desde <= this.puente.dia); return l.length ? l[l.length - 1].cambios : {}; }

  // una copia entera del mundo (para volver a este momento), sin el registro ni las cachés del
  // mapa (se rehacen solas, iguales)
  instantanea() {
    const r = this.registro, b = this.mapa._baldosas, ps = this.mapa._pesos, pv = this.mapa._previas;
    this.registro = null; this.mapa._baldosas = new Map(); this.mapa._pesos = new Map(); this.mapa._previas = null;
    try { return clonarProfundo(this); } finally { this.registro = r; this.mapa._baldosas = b; this.mapa._pesos = ps; this.mapa._previas = pv; }
  }

  // salta hasta un día (más adelante) sin simular los animales: solo el motor, deprisa (unas
  // décimas de segundo por día), y al llegar cada cohorte recibe los animales que le tocan. Sirve
  // para abrir un mundo guardado y para «ir a un día». alPaso(dia) se llama tras cada día.
  saltarA(dia, alPaso = null) {
    const p = this.puente;
    while (p.dia < dia && !p.terminado) { this.aplicarCambiosDe(p.dia); const r = p.paso(); this.registro?.apuntar(r.fecha, r.despues); if (alPaso) alPaso(p.dia); }
    this.cohortesAhora = p.cohortes();
    const activas = new Map(this.cohortesAhora.filter((c) => c.estado === 'activa').map((c) => [c.id, c]));
    for (const a of [...this.agentes.values()]) if (!activas.has(a.cohorte)) this.quitar(a);
    this.poblar(this.cohortesAhora, new Azar(this.semilla, p.dia, 5));
    for (const c of activas.values()) for (const a of this.vivosDe(c.id)) { a.masa = c.masa; a.edad = c.edad; a.territorio = c.territorio; }
    this.mapa.actualizarPlantas([p.plantasDe(this.dio)]);
    this.acc = {}; this.carronas = []; this.excrementos = [];
    this.dia = p.dia;
  }

  siguienteDia() {
    const t0 = performance.now();
    this.aplicarCambiosDe(this.puente.dia);
    const md = this.puente.paso();
    this.registro?.apuntar(md.fecha, md.despues);
    const az = new Azar(this.semilla, md.dia, 7);
    const mes = Number(md.fecha.slice(5, 7));
    const foco = this.focoId && this.agentes.get(this.focoId);
    if (foco) foco.foco = true; else this.focoId = null;
    // plantas del día
    this.mapa.actualizarPlantas([md.plantas[this.dio]]);
    const despues = new Map(md.despues.map((c) => [c.id, c]));
    const antesC = new Map(md.antes.map((c) => [c.id, c]));
    const coh = (id) => despues.get(id) || antesC.get(id);
    // -------- objetivos a partir de lo que dijo el motor
    const programa = [];    // sucesos fijos (muertes naturales, nacimientos, llegadas, salidas)
    const cazas = [];       // cazas que tienen que pasar: { cazador, presa (id del animal), grupos }
    const medida = { dia: md.dia, fecha: md.fecha, cazasMotor: 0, cazasMotorAnimales: 0, cazasEnVista: 0, emergentes: 0, forzadas: 0, evitadas: 0, fueraDeVista: 0,
      residuo: 0, ajustes: 0, cambiadas: 0, revividas: 0, revividasEnVista: 0, forzadasHechas: 0, muertes: 0, nacimientos: 0, llegadas: 0, salidas: 0,
      semillaElegida: 0, km2: this.km2, paso: this.paso };
    const ticAleatorio = () => az.entero(TICS - 30);
    const reservados = new Set();
    const tomar = (c, preferir) => {
      const l = this.vivosDe(c).filter((a) => !reservados.has(a.id));
      if (!l.length) return null;
      let a;
      if (preferir) { let md2 = Infinity; for (const b of l) { const d = Math.hypot(b.x - preferir.x, b.z - preferir.z); if (d < md2) { md2 = d; a = b; } } }
      else a = l[az.entero(l.length)];
      reservados.add(a.id);
      return a;
    };
    // de un suceso de n individuos de una cohorte: n / N animales (con lo que sobre, a cuenta)
    const animales = (clave, grupo, n) => { const v = (this.acc[clave] || 0) + n / (this.vale[grupo] || 1); const k = Math.floor(v); this.acc[clave] = v - k; return k; };
    const vienen = []; // { c, como, padre, donde }
    for (const ev of md.eventos) {
      if (ev.tipo === 'caza') {
        const presa = coh(ev.presa), cazador = coh(ev.cazador);
        if (!presa || !cazador || !ESPECIES_DE_GRUPO[presa.grupo]) continue;
        const k = animales('c' + ev.presa, presa.grupo, ev.n * this.parte(presa));
        if (VERTEBRADOS.has(presa.grupo)) { medida.cazasMotor += ev.n * this.parte(presa); medida.cazasMotorAnimales += k; }
        const cz = this.vivosDe(ev.cazador);
        const delGrupo = cz.length ? cz : null;
        for (let j = 0; j < k; j++) {
          const pa = delGrupo ? delGrupo[az.entero(delGrupo.length)] : null;
          const p = tomar(ev.presa, pa);
          if (!p) break;
          cazas.push({ presa: p.id, grupoPresa: presa.grupo, cazador: pa?.id || null, grupoCazador: cazador.grupo });
        }
      } else if (ev.tipo === 'muerte') {
        const c = coh(ev.cohorte);
        if (!c || !ESPECIES_DE_GRUPO[c.grupo]) continue;
        const k = animales('m' + ev.cohorte, c.grupo, ev.n * this.parte(c));
        for (let j = 0; j < k; j++) { const a = tomar(ev.cohorte); if (a) { programa.push({ tic: ticAleatorio(), tipo: 'muerte', id: a.id }); medida.muertes++; } }
      } else if (ev.tipo === 'nacimiento') {
        const c = despues.get(ev.cohorte);
        if (!c || c.estado !== 'activa' || !ESPECIES_DE_GRUPO[c.grupo]) continue;
        const k = animales('n' + ev.cohorte, c.grupo, ev.n * this.parte(c));
        const padres = this.vivosDe(ev.padre);
        for (let j = 0; j < k; j++) {
          const pa = padres.length ? padres[az.entero(padres.length)] : null;
          vienen.push({ c, como: 'nacer', padre: pa, donde: pa ? { x: pa.x + az.entre(-1, 1), z: pa.z + az.entre(-1, 1) } : null });
        }
      } else if (ev.tipo === 'metamorfosis') {
        // la larva se hace adulta: las larvas de esa cohorte desaparecen y nacen los adultos
        // en su sitio (cada grupo con su N)
        const c = despues.get(ev.a), larvas = this.vivosDe(ev.de);
        if (!c || !ESPECIES_DE_GRUPO[c.grupo]) continue;
        const k = animales('n' + ev.a, c.grupo, ev.n * this.parte(c));
        for (let j = 0; j < k; j++) {
          const l = larvas.length ? larvas[j % larvas.length] : null;
          vienen.push({ c, como: 'nacer', donde: l ? { x: l.x, z: l.z } : null });
        }
        for (const l of larvas) programa.push({ tic: ticAleatorio(), tipo: 'se_va', id: l.id, x: l.x, z: l.z, quieto: true });
      } else if (ev.tipo === 'inmigra' || ev.tipo === 'vuelve') {
        const c = despues.get(ev.cohorte);
        if (!c || c.estado !== 'activa' || !ESPECIES_DE_GRUPO[c.grupo]) continue;
        const k = animales('i' + ev.cohorte, c.grupo, (ev.n ?? c.n) * this.parte(c));
        for (let j = 0; j < k; j++) vienen.push({ c, como: 'llegar', donde: ev.tipo === 'inmigra' ? this.puntoBorde(az, null, c.territorio) : null });
      } else if (ev.tipo === 'emigra' || ev.tipo === 'migra') {
        const c = coh(ev.cohorte);
        if (!c || !ESPECIES_DE_GRUPO[c.grupo]) continue;
        const k = ev.tipo === 'migra' ? this.vivosDe(ev.cohorte).length : animales('e' + ev.cohorte, c.grupo, ev.n * this.parte(c));
        for (let j = 0; j < k; j++) {
          const a = tomar(ev.cohorte);
          if (!a) break;
          const b = this.puntoBorde(az, a);
          programa.push({ tic: ticAleatorio(), tipo: 'se_va', id: a.id, x: b.x, z: b.z });
          medida.salidas++;
        }
      } else if (ev.tipo === 'fusion') {
        // el motor ha juntado dos cohortes: los animales de una pasan a ser de la otra
        for (const id of [...(this.porCohorte.get(ev.de) || [])]) {
          const ag = this.agentes.get(id);
          if (!ag) continue;
          this.quitar(ag); ag.cohorte = ev.a; this.agregar(ag);
        }
        for (const p of ['c', 'm', 'n', 'i', 'e']) this.acc[p + ev.a] = (this.acc[p + ev.a] || 0) + (this.acc[p + ev.de] || 0);
      } else if (ev.tipo === 'dispersion') {
        // la cohorte se va a otro cuadro: sus animales van andando a su casa nueva; los que
        // tardarían más de medio día (un insecto palo a 150 m) y no están a la vista ya han
        // llegado (la mudanza ha pasado durante el día del motor)
        const c = despues.get(ev.cohorte);
        if (!c) continue;
        for (const a of this.vivosDe(c.id)) {
          a.territorio = c.territorio; a.hogar = this.hogarEn(a, this.mapa.puntoEnCelda(0, az));
          const lejos = Math.hypot(a.x - a.hogar.x, a.z - a.hogar.z), andar = a.e?.andar || 1;
          if (!a.foco && lejos / andar > 6 * 3600 && Math.hypot(a.x - this.foco.x, a.z - this.foco.z) > RADIO_FOCO) { a.x = a.hogar.x + az.entre(-1, 1); a.z = a.hogar.z + az.entre(-1, 1); }
        }
      }
    }
    // las cohortes que entran o salen del cuadro que se ve (el motor las dispersa por los
    // cuadros): los que llegan entran por el borde y los que se van salen por él
    for (const c of despues.values()) {
      if (c.estado !== 'activa' || !ESPECIES_DE_GRUPO[c.grupo]) continue;
      const a0 = antesC.get(c.id);
      if (!a0) continue;
      const p0 = this.parte(a0), p1 = this.parte(c);
      if (p0 === p1) continue;
      const x = (this.acc['t' + c.id] || 0) + (c.n * p1 - a0.n * p0) / (this.vale[c.grupo] || 1), k = Math.trunc(x);
      this.acc['t' + c.id] = x - k;
      if (k > 0) for (let j = 0; j < k; j++) vienen.push({ c, como: 'llegar', donde: this.puntoBorde(az) });
      else for (let j = 0; j < -k; j++) {
        const ag = tomar(c.id);
        if (!ag) break;
        const b = this.puntoBorde(az, ag);
        programa.push({ tic: ticAleatorio(), tipo: 'se_va', id: ag.id, x: b.x, z: b.z });
        medida.salidas++;
      }
    }
    for (const v of vienen) {
      const a = this.nuevoAnimal(v.c, az, v.donde);
      if (v.padre) { a.hogar = { ...v.padre.hogar }; a.siguiendo = v.padre.vertebrado ? v.padre.id : null; a.rango = v.padre.rango; }
      programa.push({ tic: ticAleatorio(), tipo: 'aparece', agente: a, como: v.como });
      if (v.como === 'nacer') medida.nacimientos++; else medida.llegadas++;
    }
    // -------- simular: varias semillas sin ayuda
    const base = { mapa: this.mapa, presasDe: this.presasDe, carronas: this.carronas, excrementos: this.excrementos, clima: md.clima, dia: md.dia, mes,
      caceria: this.caceria, bocado: this.bocado, foco: this.foco, paso: this.paso };
    const agentes = [...this.agentes.values()];
    const objetivo = new Set(cazas.map((c) => c.presa));
    // una caza que sale sola vale si coincide con una del motor: la misma presa, o una presa
    // del mismo grupo comida por un cazador del mismo grupo (entonces se intercambian las
    // identidades de cohorte de las dos presas, que son indistinguibles a la vista)
    const evaluar = (r) => {
      const hechas = new Set(), cambios = [], sobran = new Set();
      const cz = r.eventos.filter((e2) => e2.tipo === 'caza');
      const muertas = new Set(cz.map((e2) => e2.presa));
      for (const e2 of cz) if (objetivo.has(e2.presa)) hechas.add(e2.presa);
      const porGrupos = new Map();
      for (const x of cazas) { const kk = x.grupoPresa + '>' + x.grupoCazador; const l = porGrupos.get(kk) || []; l.push(x); porGrupos.set(kk, l); }
      for (const e2 of cz) {
        if (objetivo.has(e2.presa)) continue;
        const t = (porGrupos.get(e2.grupoPresa + '>' + e2.grupo) || []).find((x) => !hechas.has(x.presa) && !muertas.has(x.presa));
        if (t) { hechas.add(t.presa); cambios.push([e2.presa, t.presa]); } else sobran.add(e2.presa);
      }
      return { buenas: hechas.size, malas: sobran.size, faltan: objetivo.size - hechas.size, hechas, cambios, sobran };
    };
    let mejor = null, mejorEv = null, mejorSem = 0;
    for (let s2 = 0; s2 < Math.max(1, this.semillasPorDia); s2++) {
      const r = simularDia({ ...base, agentes, semilla: this.semilla * 1000 + s2, intento: 0, programa, marcas: {} });
      const ev = evaluar(r);
      if (!mejor || ev.faltan + ev.malas < mejorEv.faltan + mejorEv.malas) { mejor = r; mejorEv = ev; mejorSem = s2; }
    }
    medida.semillaElegida = mejorSem;
    this.ajustarCaceria(cazas, mejor.eventos);
    medida.emergentes = mejorEv.buenas;
    // -------- el director: repite lo que salió solo, empuja lo que falta y evita lo que sobra
    let r = mejor, ev = mejorEv;
    const marcas = {};
    if (this.pasadasDirector > 0 && (ev.faltan > 0 || ev.malas > 0)) {
      const buenas = new Set([...ev.cambios.map(([muerta]) => muerta)]);
      for (const e2 of mejor.eventos) {
        if (e2.tipo !== 'caza' || !(objetivo.has(e2.presa) || buenas.has(e2.presa))) continue;
        marcas[e2.presa] = { condenado: true };
        if (e2.id) marcas[e2.id] = { ...(marcas[e2.id] || {}), cazar: e2.presa };
      }
    }
    for (let pasada = 0; pasada < this.pasadasDirector && (ev.faltan > 0 || ev.malas > 0); pasada++) {
      for (const e2 of r.eventos) {
        if (e2.tipo === 'caza' && ev.sobran.has(e2.presa)) { marcas[e2.presa] = { ...(marcas[e2.presa] || {}), protegido: true }; medida.evitadas++; }
      }
      for (const cz of cazas) {
        if (ev.hechas.has(cz.presa) || marcas[cz.presa]?.condenado) continue;
        marcas[cz.presa] = { condenado: true };
        if (cz.cazador && !marcas[cz.cazador]?.cazar) marcas[cz.cazador] = { ...(marcas[cz.cazador] || {}), cazar: cz.presa };
        medida.forzadas++;
      }
      r = simularDia({ ...base, agentes, semilla: this.semilla * 1000 + mejorSem, intento: 0, programa, marcas });
      ev = evaluar(r);
    }
    // lo que aún falta: la presa muere igualmente al final del día (lejos de la cámara, sin verse)
    const finales = new Map(r.agentes.map((a) => [a.id, a]));
    for (const cz of cazas) {
      if (ev.hechas.has(cz.presa)) continue;
      const a = finales.get(cz.presa);
      if (a && a.vivo) {
        a.vivo = false; a.estado = E.muerto;
        if (Math.hypot(a.x - this.foco.x, a.z - this.foco.z) < RADIO_FOCO) medida.residuo++; else medida.fueraDeVista++;
        r.eventos.push({ tic: TICS - 1, tipo: 'caza', id: cz.cazador, presa: a.id, grupo: cz.grupoCazador, grupoPresa: cz.grupoPresa, director: true });
      }
    }
    // cazas que han salido y el motor no dijo: el animal no muere (se escapa en el último momento)
    for (const e2 of r.eventos) {
      if (e2.tipo === 'caza' && !e2.director && ev.sobran.has(e2.presa)) {
        const a = finales.get(e2.presa);
        if (a) {
          a.vivo = true; a.estado = E.quieto; a.cazadoPor = null; medida.revividas++;
          const k = r.claves.get(a.id);
          if (k) { r.claves.set(a.id, this.escapar(k, e2, r.claves.get(e2.id), a)); r.detalles.set(a.id, this.recortarDetalle(r.detalles.get(a.id), r.claves.get(a.id))); }
        }
      }
    }
    // cazas emparejadas por grupo: la muerta pasa a ser de la cohorte que dijo el motor
    for (const [muerta, objetivoId] of ev.cambios) {
      const m = finales.get(muerta), o = finales.get(objetivoId);
      if (!m || !o) continue;
      for (const k of ['cohorte', 'masa', 'edad', 'territorio', 'adulta', 'rango']) [m[k], o[k]] = [o[k], m[k]];
      medida.cambiadas++;
    }
    // masa cazada (vertebrados): la del motor y la de las presas del mundo (por lo que valen)
    medida.masaCazadaMotor = 0;
    for (const e2 of md.eventos) if (e2.tipo === 'caza' && VERTEBRADOS.has(coh(e2.presa)?.grupo)) medida.masaCazadaMotor += e2.masa * this.parte(coh(e2.presa));
    medida.masaCazadaMundo = r.eventos.filter((e2) => e2.tipo === 'caza' && VERTEBRADOS.has(e2.grupoPresa)).reduce((s2, e2) => s2 + (finales.get(e2.presa)?.masa || 0) * (finales.get(e2.presa)?.vale || 1), 0);
    // lo comido (kg): lo que apunta el motor y lo que comen los animales
    medida.comidoMotor = {}; medida.comidoMundo = {};
    // (lo comido en el motor en el cuadro que se ve)
    for (const x of md.consumo) medida.comidoMotor[x.recurso] = (medida.comidoMotor[x.recurso] || 0) + x.masa;
    for (const e2 of r.eventos) if (e2.tipo === 'comer') medida.comidoMundo[e2.recurso] = (medida.comidoMundo[e2.recurso] || 0) + e2.kg;
    this.ajustarBocado(medida);
    medida.emergentesFinal = Math.min(mejorEv.buenas, ev.buenas);
    medida.forzadasHechas = ev.buenas - medida.emergentesFinal;
    medida.cazasEnVista = r.eventos.filter((e2) => e2.tipo === 'caza' && e2.enVista).length;
    // -------- el resultado pasa a ser el estado
    this.aplicar(r, md, despues, medida);
    this.cohortesAhora = md.despues;
    medida.segundos = (performance.now() - t0) / 1000;
    medida.animales = this.agentes.size;
    medida.vertebrados = [...this.agentes.values()].filter((a) => a.vertebrado).length;
    this.historial.push(medida);
    this.dia = md.dia + 1;
    return { dia: md.dia, fecha: md.fecha, clima: md.clima, claves: r.claves, detalles: r.detalles, otros: r.otros, eventos: r.eventos, medida,
      agentes: this.descripcion(r), totales: this.totales(md.despues), plantas: [md.plantas[this.dio]], foco: this.focoId };
  }

  // reescribe la línea de tiempo de una presa que no tenía que morir: desde el ataque huye
  // unos metros, lejos del cazador, y se queda allí (y ahí empieza el día siguiente)
  escapar(k, caza, kCazador, a) {
    const n = k.length / CLAVE;
    let i = 0;
    while (i < n - 1 && k[(i + 1) * CLAVE] <= caza.tic) i++;
    const o = i * CLAVE;
    let dx = 1, dz = 0;
    if (kCazador) {
      for (let j = 0; j < kCazador.length / CLAVE; j++) if (kCazador[j * CLAVE] >= caza.tic) { dx = k[o + 1] - kCazador[j * CLAVE + 1]; dz = k[o + 3] - kCazador[j * CLAVE + 3]; break; }
    }
    const d = Math.hypot(dx, dz) || 1, lejos = Math.min(15, Math.max(4, a.e.correr * 5));
    // (sin salirse del cuadrado)
    const m = this.mapa, x = Math.min(m.ancho, Math.max(0, k[o + 1] + (dx / d) * lejos)), z = Math.min(m.alto, Math.max(0, k[o + 3] + (dz / d) * lejos));
    // lo de antes del ataque, y después: huye 10 minutos y se queda quieto
    const out = new Float32Array((i + 3) * CLAVE);
    out.set(k.subarray(0, (i + 1) * CLAVE));
    // (si la caza es al final del día, la huida se acaba con él)
    const E2 = [[Math.max(k[o], Math.min(caza.tic + 10, TICS - 1.5)), x, z, E.huir], [TICS - 1, x, z, E.quieto]];
    E2.forEach(([t, px, pz, est], j) => { const q = (i + 1 + j) * CLAVE; out[q] = t; out[q + 1] = px; out[q + 2] = 0; out[q + 3] = pz; out[q + 4] = Math.atan2(dz, dx); out[q + 5] = est; out[q + 6] = 0; });
    a.x = x; a.z = z; a.y = 0; a.posado = false;
    return out;
  }
  recortarDetalle(d, k) {
    const n = k.length / CLAVE, out = new Float32Array(n * DETALLE);
    out.set(d.subarray(0, Math.min(d.length, n * DETALLE)));
    for (let j = Math.min(d.length / DETALLE, n); j < n; j++) out.set(d.subarray(d.length - DETALLE), j * DETALLE);
    return out;
  }

  ajustarBocado(medida) {
    const motor = {}, mundo = {};
    const DEL_MOTOR = { plant_resource: 'plantas', litter_pool: 'hojarasca', fungal_fruit_pool: 'setas', carcass_pool: 'carroña', excrement_pool: 'excremento' };
    for (const [k, v] of Object.entries(medida.comidoMotor)) if (DEL_MOTOR[k]) motor[DEL_MOTOR[k]] = (motor[DEL_MOTOR[k]] || 0) + v;
    for (const [k, v] of Object.entries(medida.comidoMundo)) { const cl = CLASE_COMIDA[k]; if (cl) mundo[cl] = (mundo[cl] || 0) + v; }
    medida.comidoClase = {};
    for (const cl of Object.keys(this.bocado)) {
      const a = motor[cl] || 0, b = mundo[cl] || 0;
      medida.comidoClase[cl] = { motor: a, mundo: b };
      if (a === 0 && b === 0) continue;
      // con lo de los últimos días (media que se va olvidando): una clase con pocas comidas al
      // día (setas, carroña) da muchos saltos de un día a otro y no hay que perseguirlos
      const h = (this.comidoReciente[cl] ||= { a: 0, b: 0 });
      h.a = h.a * 0.6 + a; h.b = h.b * 0.6 + b;
      const f = Math.min(50, Math.max(0.02, ((h.a + 1e-7) / (h.b + 1e-7)) ** 0.8));
      // (lo comido hasta ahora ya ha salido con el bocado viejo: se pasa al nuevo)
      h.b *= f;
      this.bocado[cl] = Math.min(1e4, Math.max(1e-7, this.bocado[cl] * f));
    }
  }

  ajustarCaceria(cazas, eventos) {
    const quiere = {}, salen = {};
    for (const x of cazas) if (VERTEBRADOS.has(x.grupoPresa)) quiere[x.grupoCazador] = (quiere[x.grupoCazador] || 0) + 1;
    for (const e2 of eventos) if (e2.tipo === 'caza' && VERTEBRADOS.has(e2.grupoPresa)) salen[e2.grupo] = (salen[e2.grupo] || 0) + 1;
    for (const g of new Set([...Object.keys(quiere), ...Object.keys(salen)])) {
      const q = this.caceria[g] ?? 0.05;
      const f = Math.min(2, Math.max(0.5, Math.sqrt(((quiere[g] || 0) + 0.5) / ((salen[g] || 0) + 0.5))));
      this.caceria[g] = Math.min(1, Math.max(0.002, q * f));
    }
  }

  // un punto en el borde del mundo: el más cercano a un animal, o uno de un territorio
  puntoBorde(az, desde = null, territorio = null) {
    const { ancho, alto } = this.mapa;
    if (desde) {
      const op = [{ x: 0.5, z: desde.z }, { x: ancho - 0.5, z: desde.z }, { x: desde.x, z: 0.5 }, { x: desde.x, z: alto - 0.5 }];
      op.sort((a, b) => Math.hypot(a.x - desde.x, a.z - desde.z) - Math.hypot(b.x - desde.x, b.z - desde.z));
      return op[0];
    }
    if (territorio?.length) return this.mapa.puntoEnCelda(0, az);
    const lado = az.entero(4), u = az.r();
    return [{ x: 1, z: u * alto }, { x: ancho - 1, z: u * alto }, { x: u * ancho, z: 1 }, { x: u * ancho, z: alto - 1 }][lado];
  }

  aplicar(r, md, despues, medida) {
    // el estado final de la simulación pasa a ser el del mundo
    this.agentes = new Map();
    this.porCohorte = new Map();
    for (const a of r.agentes) {
      a.marca = null; a.presa = null; a.cazadoPor = null; a.temporizador = 0; a.objetivo = null;
      if (!a.vivo || a.fuera) continue;
      this.agregar(a);
    }
    // cada cohorte con los animales que le tocan (lo normal es que ya los tenga: los ajustes
    // son lo que no ha salido de los sucesos del día, y se miden)
    const az = new Azar(this.semilla, md.dia, 9);
    for (const c of despues.values()) {
      if (c.estado !== 'activa' || !ESPECIES_DE_GRUPO[c.grupo]) continue;
      // (lo que toca es n / N; solo se ajusta si se aparta más de uno, que es lo que da el redondeo)
      const exacto = c.n * this.parte(c) / (this.vale[c.grupo] || 1), hay = this.vivosDe(c.id);
      const quiere = Math.abs(hay.length - exacto) > 1 ? Math.round(exacto) : hay.length;
      for (let k = hay.length; k < quiere; k++) { this.agregar(this.nuevoAnimal(c, az)); medida.ajustes++; }
      for (let k = quiere; k < hay.length; k++) if (!hay[k].foco) { this.quitar(hay[k]); medida.ajustes++; }
      for (const id of this.porCohorte.get(c.id) || []) { const a = this.agentes.get(id); a.masa = c.masa; a.edad = c.edad; a.territorio = c.territorio; }
    }
    for (const [cid, ids] of this.porCohorte) {
      const d = despues.get(cid);
      if (d && d.estado === 'activa') continue;
      for (const id of [...ids]) { const a = this.agentes.get(id); if (a && !a.foco) { this.quitar(a); medida.ajustes++; } }
    }
    // carroña y excrementos: se van gastando
    this.carronas = r.carronas.filter((c) => c.masa > 0.001 && (md.dia - (c.dia ?? md.dia)) < 10).map((c) => ({ ...c, dia: c.dia ?? md.dia }));
    this.excrementos = r.excrementos.filter((c) => c.masa > 0.0001);
  }

  // lo que la parte visual necesita saber de cada animal (para dibujarlo, el listado y la ficha)
  descripcion(r) {
    const out = {};
    for (const a of r.agentes) {
      out[a.id] = {
        especie: a.especieId, grupo: a.grupo, masa: a.masa, adulta: a.adulta, edad: a.edad, sexo: a.sexo, vale: a.vale,
        cohorte: a.cohorte, hogar: a.hogar, territorio: a.territorio, vertebrado: a.vertebrado, rango: a.rango, nidos: a.nidos,
      };
    }
    return out;
  }
}

export { TICS, CLAVE, DETALLE };
