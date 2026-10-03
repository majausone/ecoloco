/* EL MUNDO VIVO DE MALIAU: el mundo entero del motor (de 0,66 a 1000 km²) dibujado con los
   modelos del Observer, enseñando lo que hace la simulación de individuos.

   - El motor y los animales van en un Web Worker (trabajador.js), que genera el mundo entero
     al empezar y calcula los días por delante; aquí solo se reproduce la línea de tiempo de
     cada animal (fotogramas clave: cuándo, dónde, rumbo y estado), interpolando entre ellos.
   - Donde mira la cámara (y el animal que se sigue) se simula minuto a minuto; en el resto,
     a pasos de 10 a 30 minutos. Moverse no carga nada: todo el mundo está siempre calculado.
   - Se dibuja por capas (cada una en su fichero): el terreno (terreno.js), el bosque por
     instancias con tres niveles de detalle (bosque.js) y los animales, con su modelo de cerca
     y una versión de cajas por instancias de lejos (manada.js).
   - Reloj: 1 día de juego = 24 min reales a ×1 (1 minuto de juego por segundo).
   - Escala: 1 unidad = 1 m. Los animales pequeños se dibujan más grandes para que se vean.
     Los invertebrados (y los vertebrados de los mundos grandes) van con representantes: cada
     uno vale por N individuos del motor (N por grupo en el panel de medidas, tecla M).
   - Día y noche según la hora de juego (amanece hacia las 6:10 y anochece hacia las 18:15
     en Maliau, a 4,8° N); de noche brillan las setas luminosas y salen las luciérnagas. */

import * as THREE from '../graficos/pruebas-morta/vendor/three.module.js';
import { particulas } from '../graficos/pruebas-morta/escena-v3.js';
import { ANIMALES, PLANTAS, SETAS } from '../graficos/pruebas-morta/borneo/especies.js';
import { Visor, LUCES, pantallaCompleta } from '../graficos/pruebas-morta/borneo/visor.js';
import { CamaraUnity } from '../graficos/pruebas-morta/borneo/camara.js';
import { Mapa, BALDOSA } from '../mundo/mapa.js';
import { TICS, CLAVE, DETALLE } from '../mundo/dia.js';
import { crearFicha } from './ficha.js';
import { crearTactil } from './tactil.js';
import { crearTerreno } from './terreno.js';
import { crearBosque, LEJOS, uSeguido, uSigue } from './bosque.js';
import { crearManada } from './manada.js';
import { completar, aTexto, deTexto } from '../mundo/config.js';
import { crearPanel, GRUPO_ES as GRUPO_PANEL } from './panel.js';
import { crearCielo, CAPA_CIELO } from './cielo.js';
import { crearHogares } from './hogares.js';
import { controlTamano, LADO as RANGO_LADO } from '../comun/tamano.js';
import { ponerAyudas } from '../comun/ayuda.js';
import { traducirDom, T, num, enIngles } from '../comun/idioma.js';
import { NOMBRE_EN, GRUPO_EN } from '../comun/nombres.js';
import { cabecera } from '../comun/cabecera.js';
import { VERTEBRADOS } from '../mundo/especies.js';

const $ = (id) => document.getElementById(id);
const lienzo = $('lienzo');
// el idioma de los textos del HTML y los «?» con globo
traducirDom(); ponerAyudas(); cabecera('simulacion');
const visor = new Visor(lienzo, { sombras: 4096 });
// en las pantallas de alta densidad (móviles), a su resolución de verdad (hasta ×2 y unos 3 Mpx);
// si no, se dibujaba a la resolución de CSS y se veía con píxeles gordos
const densidad = () => Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(3e6 / Math.max(1, innerWidth * innerHeight))));
visor.pixel = 1 / densidad();
window.addEventListener('resize', () => { visor.pixel = 1 / densidad(); });
const escena = new THREE.Scene();
const tiempo = { value: 0 }, viento = { value: 0.8 };
const parametros = new URLSearchParams(location.search);

// ------------------------------------------------------------------ el trabajador
// km2: cuántos km² tiene el mundo (?km2=100); sin él, los 9 × 9 cuadros de 90 m del escenario
// ?mundo=...: la configuración de la portada (mundo/config.js); ?dia=N: abrir en ese día (un
// mundo guardado). Sin ?mundo, Maliau tal cual (con ?km2= y ?semilla= si se dan)
const KM2 = Number(parametros.get('km2')) || null;
let CONFIG;
try { CONFIG = completar(parametros.get('mundo') ? deTexto(parametros.get('mundo')) : { km2: KM2 || undefined, lado: Number(parametros.get('lado')) || undefined, semilla: Number(parametros.get('semilla') || 1) }); }
catch { CONFIG = completar({}); }
const DIA = Math.max(0, Number(parametros.get('dia')) || 0);
const trabajador = new Worker(new URL('./trabajador.js', import.meta.url), { type: 'module' });
const cola = [];          // días calculados y aún sin enseñar
let mapa = null, cx = 0, cz = 0, dia = null, info = null, terreno = null, bosque = null, manada = null, hogares = null;
const detalles = new Map(); // id -> { dia, d: Float32Array } (hambre, sed... del animal seleccionado)
trabajador.onmessage = ({ data: m }) => {
  if (m.tipo === 'listo') { info = m; montar(m); }
  else if (m.tipo === 'progreso') $('carga').textContent = T(`Recalculando el motor hasta el día ${m.hasta + 1}: ${m.dia + 1} de ${m.hasta + 1}…`, `Recomputing the engine up to day ${m.hasta + 1}: ${m.dia + 1} of ${m.hasta + 1}…`);
  else if (m.tipo === 'dia') {
    medidas.calculo.push(m.segundos);
    // tras un salto o un cambio de parámetros, lo de antes ya no vale
    if (saltando != null) { if (m.dia !== saltando) return; saltando = null; cola.length = 0; cola.push(m); tic = 8 * 60; siguienteDia(); return; }
    cola.push(m);
    if (!dia) siguienteDia();
  } else if (m.tipo === 'salto') {
    saltando = m.dia;
  } else if (m.tipo === 'cambiado') {
    for (let i = cola.length - 1; i >= 0; i--) if (cola[i].dia >= m.desde) cola.splice(i, 1);
    aviso(T(`Parámetros cambiados desde el día ${m.desde + 1}: los días que vienen se calculan con el cambio.`, `Parameters changed from day ${m.desde + 1}: the coming days are computed with the change.`));
    panel.recibir(m);
  } else if (m.tipo === 'datos' || m.tipo === 'serie' || m.tipo === 'prediccion') {
    panel.recibir(m);
  } else if (m.tipo === 'detalle') {
    if (m.detalle) detalles.set(m.id, { dia: m.dia, d: m.detalle });
  } else if (m.tipo === 'error') { $('carga').classList.remove('oculto'); $('carga').textContent = T('Error en la simulación: ', 'Simulation error: ') + m.mensaje; console.error(m.mensaje); }
};
trabajador.postMessage({ tipo: 'iniciar', escenario: parametros.get('escenario') || '../datos/escenarios/maliau.json', config: CONFIG, dia: DIA });
let saltando = null;
// ir a un día (adelante o atrás): el trabajador recalcula y manda ese día
function irADia(n) {
  if (!dia || n === dia.dia) return;
  saltando = n; cola.length = 0;
  $('carga').classList.remove('oculto');
  $('carga').textContent = n > dia.dia ? T(`Recalculando el motor hasta el día ${n + 1}…`, `Recomputing the engine up to day ${n + 1}…`) : T(`Volviendo a generar el mundo para ir al día ${n + 1}…`, `Generating the world again to go to day ${n + 1}…`);
  trabajador.postMessage({ tipo: 'irA', dia: n });
}
function aviso(t) { const a = $('aviso'); if (!a) return; a.textContent = t; a.classList.add('on'); clearTimeout(aviso.t); aviso.t = setTimeout(() => a.classList.remove('on'), 4000); }
// el detalle de un animal (lo pide la ficha); llega al momento
function pedirDetalle(id) {
  const h = detalles.get(id);
  if (!dia || (h && h.dia === dia.dia) || pedirDetalle.pedido === `${dia.dia}:${id}`) return h?.dia === dia?.dia ? h.d : null;
  pedirDetalle.pedido = `${dia.dia}:${id}`;
  trabajador.postMessage({ tipo: 'detalle', dia: dia.dia, id });
  return null;
}

const cima = (x, z) => (terreno ? terreno.cima(x, z) : 0);

// ------------------------------------------------------------------ halo de las setas luminosas
// puntos que suman luz, encendidos de noche
function manchaRedonda() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
// el cielo (Sky de three.js), las estrellas, la luna y el tiempo que hace (vivo/cielo.js)
const cielo = crearCielo({ escena });
const halo = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: '#9aff8a', map: manchaRedonda(), size: 0.7, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
halo.frustumCulled = false;
escena.add(halo);
function ponerHalo(luces) {
  halo.geometry.dispose();
  halo.geometry = new THREE.BufferGeometry();
  halo.geometry.setAttribute('position', new THREE.Float32BufferAttribute(luces, 3));
}

// el anillo bajo el seleccionado
const anillo = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color: '#e8a64a', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
anillo.rotation.x = -Math.PI / 2; anillo.visible = false; anillo.renderOrder = 2;
escena.add(anillo);

// ------------------------------------------------------------------ luz: día y noche
// las luciérnagas y la lluvia van alrededor de donde mira la cámara
const luciernagas = particulas(260, '#f6f08a', 2, Math.random, (r) => ({ x: (r() - 0.5) * 88, y: 0.5 + r() * 3, z: (r() - 0.5) * 88, fase: r() * 9, v: 0.3 + r() * 0.5 }), true);
const lluvia = particulas(2500, '#9ab8c8', 2, Math.random, (r) => ({ x: (r() - 0.5) * 96, y: r() * 30, z: (r() - 0.5) * 96, v: 14 + r() * 6 }), false, 0.55);
luciernagas.frustumCulled = false; lluvia.frustumCulled = false;
escena.add(luciernagas, lluvia);
const AMANECE = 6.17, ANOCHECE = 18.25;
const C = (h) => new THREE.Color(h);
const mezclarColor = (a, b, f) => C(a).lerp(C(b), f);
const mezclarNum = (a, b, f) => a + (b - a) * f;
let hemi = null;
function luz(hora) {
  // de -1 (medianoche) a 1 (mediodía), con el cero en la salida y la puesta del sol
  const esDia = hora > AMANECE && hora < ANOCHECE;
  const s = esDia ? Math.sin(Math.PI * (hora - AMANECE) / (ANOCHECE - AMANECE)) : -Math.min(1, Math.min(Math.abs(hora - AMANECE), Math.abs(hora - ANOCHECE), Math.abs(hora + 24 - ANOCHECE), Math.abs(AMANECE + 24 - hora)) / 1.5);
  let A, B, f;
  if (s >= 0.3) { A = LUCES.dia; B = LUCES.dia; f = 0; }
  else if (s >= 0) { A = LUCES.atardecer; B = LUCES.dia; f = s / 0.3; }
  else { A = LUCES.atardecer; B = LUCES.noche; f = Math.min(1, -s * 1.5); }
  // el cielo lo pinta Sky; el fondo, por si acaso, del color de la niebla
  const tiempoHoy = cielo.tiempo, gris = tiempoHoy.nubes * 0.5 + tiempoHoy.niebla * 0.4;
  escena.background = null;
  escena.fog.color.copy(mezclarColor(A.niebla, B.niebla, f)).lerp(C('#8a9a98').multiplyScalar(1 - f * 0.85), Math.min(0.7, gris));
  const sol = visor.sol;
  sol.color.copy(mezclarColor(A.sol, B.sol, f));
  // con nubes y lluvia, menos sol directo
  sol.intensity = mezclarNum(A.fuerza, B.fuerza, f) * (1 - 0.55 * tiempoHoy.nubes);
  // el sol cruza de este (+x) a oeste, como en el cielo; de noche, la luz de la luna
  if (esDia) { const d = cielo.direccionSol(hora); sol.position.set(d.x, Math.max(0.15, d.y), d.z).normalize().multiplyScalar(120); }
  else sol.position.set(...LUCES.noche.dir).normalize().multiplyScalar(120);
  hemi.color.copy(mezclarColor(A.hemiCielo, B.hemiCielo, f));
  hemi.groundColor.copy(mezclarColor(A.hemiSuelo, B.hemiSuelo, f));
  hemi.intensity = mezclarNum(A.ambiente, B.ambiente, f);
  const P = {};
  for (const k of ['contraste', 'saturacion']) P[k] = mezclarNum(A.post[k], B.post[k], f);
  for (const k of ['sombra', 'luzTinte']) P[k] = A.post[k].map((v, i) => mezclarNum(v, B.post[k][i], f));
  visor.post = P;
  const noche = s < 0 ? Math.min(1, -s * 1.5) : 0;
  luciernagas.visible = noche > 0.3;
  halo.material.opacity = noche * 0.55;
  halo.visible = noche > 0.05;
  for (const m of bosque.mallas()) if (m.userData.tipo === 'brillo') m.material.color.setScalar(0.85 + noche * 1.2);
  return noche;
}
function moverParticulas(t, dt, hora, f) {
  const ox = f.x - cx, oz = f.z - cz;
  let pos = luciernagas.geometry.attributes.position;
  if (luciernagas.visible) {
    luciernagas.userData.datos.forEach((d, i) => pos.setXYZ(i, ox + d.x + Math.sin(t * d.v + d.fase) * 0.8, cima(f.x + d.x, f.z + d.z) + d.y + Math.sin(t * d.v * 1.7 + d.fase) * 0.4, oz + d.z + Math.cos(t * d.v + d.fase) * 0.6));
    pos.needsUpdate = true;
    luciernagas.material.opacity = 0.75 + Math.sin(t * 4) * 0.25;
  }
  // lluvia: los días de más de 5 mm, aguacero por la tarde (lo típico en Borneo)
  const mm = dia?.clima?.lluvia || 0;
  lluvia.visible = mm > 5 && hora >= 14 && hora < 14 + Math.min(8, mm / 4);
  // más gotas cuanto más llueve
  lluvia.geometry.setDrawRange(0, Math.round(lluvia.geometry.attributes.position.count * Math.max(0.15, cielo.tiempo.lluvia)));
  if (lluvia.visible) {
    pos = lluvia.geometry.attributes.position;
    // alrededor de la cámara (y no de donde mira), de 20 m por debajo a 10 m por encima
    const c = camara.pos, y0 = c.y - 20;
    lluvia.userData.datos.forEach((d, i) => { d.y -= d.v * dt; if (d.y < 0) d.y += 30; pos.setXYZ(i, c.x + d.x * 0.6, y0 + d.y, c.z + d.z * 0.6); });
    pos.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ reloj y controles
const VELOCIDADES = [0, 1, 10, 60, 600, Infinity];
let velocidad = 1, tic = 8 * 60, resumenForzado = null; // se empieza a las 8 de la mañana
const medidas = { fps: 0, cuadros: 0, desde: performance.now(), calculo: [], esperando: 0 };
function ponerVelocidad(v) {
  velocidad = v;
  // a más velocidad, menos semillas y pasadas del director para que el cálculo vaya por delante
  // y, hasta ×60, una copia del mundo antes de cada día (para poder cambiar parámetros desde el
  // día siguiente al que se ve; cuesta unas 0,4 s por día, que a ×600 no sobran)
  const modo = v >= 600 ? { semillas: 1, pasadas: 1, instantaneas: false } : { semillas: 2, pasadas: 1, instantaneas: true };
  trabajador.postMessage({ tipo: 'modo', ...modo });
}
const enResumen = () => resumenForzado ?? velocidad >= 60;
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'enter') return pantallaCompleta(document.documentElement);
  if (k === ' ') { e.preventDefault(); return ponerVelocidad(velocidad === 0 ? (ponerVelocidad.antes || 1) : (ponerVelocidad.antes = velocidad, 0)); }
  if (k >= '1' && k <= '5') return ponerVelocidad(VELOCIDADES[Number(k)]);
  if (k === 'z') { resumenForzado = !enResumen(); return; }
  if (k === 'i') { const q = $('indicador'); q.dataset.quitado = q.dataset.quitado === '1' ? '' : '1'; return; }
  if (k === 'm') return $('medidas').classList.toggle('on');
  if (k === 'g') { seguirSiguiente(e.shiftKey ? -1 : 1); if (seguido) ficha.seleccionar(seguido, false); }
  if (k === 'b') { ficha.abrir(); if ($('panel').classList.contains('on')) panel.mostrar(panel.pestana); }
  if (k === 'escape') dejarDeSeguir();
  // mover la cámara a mano deja de seguir (la selección se queda)
  if ('wasdqe'.includes(k) && k.length === 1) dejarDeSeguir();
});

// ------------------------------------------------------------------ seleccionar con el ratón
// un clic (sin arrastrar) sobre un animal lo selecciona: primero lo que toca el rayo (los
// modelos de cerca) y, si no, el más cercano en pantalla a menos de 28 píxeles (los insectos
// son muy pequeños para atinar)
let pulsado = null, camActual = null, tactil = null;
const rayo = new THREE.Raycaster();
lienzo.addEventListener('pointerdown', (e) => {
  if (e.button === 0 && !e.altKey) pulsado = { x: e.clientX, y: e.clientY };
  else dejarDeSeguir(); // mirar, desplazar u orbitar a mano
});
lienzo.addEventListener('pointerup', (e) => {
  if (!pulsado || e.button !== 0) return;
  const movido = Math.hypot(e.clientX - pulsado.x, e.clientY - pulsado.y) > 5;
  pulsado = null;
  if (movido || !camActual || !dia || tactil?.multi) return;
  const r = lienzo.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  rayo.setFromCamera(ndc, camActual);
  let elegido = null;
  const modelos = [...manada.animales.values()].filter((a) => a.visible && a.modelo).map((a) => a.modelo.g);
  const tocado = rayo.intersectObjects(modelos, true)[0];
  if (tocado) elegido = manada.idDe(tocado.object);
  if (!elegido) {
    let md = 28;
    const p = new THREE.Vector3();
    for (const a of manada.animales.values()) {
      if (!a.visible) continue;
      p.set(a.x - cx, cima(a.x, a.z) + a.y + a.s.tam * 0.4, a.z - cz).project(camActual);
      if (p.z > 1 || p.z < -1) continue;
      const d = Math.hypot((p.x + 1) / 2 * r.width - (e.clientX - r.left), (1 - p.y) / 2 * r.height - (e.clientY - r.top));
      if (d < md) { md = d; elegido = a.id; }
    }
  }
  if (elegido) return ficha.seleccionar(elegido, true);
  // si no hay animal: una planta o una seta (lo primero que toca el rayo)
  const pl = plantaEn(rayo.ray);
  if (pl) ficha.seleccionarPlanta(pl.tipo, pl.p);
});
// la planta o la seta que toca un rayo (en coordenadas de la escena): cada árbol es su tronco
// (un cilindro) y su copa (un cilindro ancho arriba); cada seta, una bolita en el suelo. Se
// queda la más cercana a la cámara.
function plantaEn(ray) {
  if (!mapa) return null;
  const o = ray.origin, d = ray.direction, ox = o.x + cx, oz = o.z + cz;
  let mejor = null, mt = Infinity;
  const h = Math.hypot(d.x, d.z) || 1e-6;
  // los árboles a menos de 150 m a lo largo del rayo
  const prueba = (p, radio, y0, y1, tipo) => {
    // el punto del rayo más cercano al eje vertical del árbol (en planta)
    const t = ((p.x - ox) * d.x + (p.z - oz) * d.z) / (h * h);
    if (t <= 0 || t > mt) return;
    const px = ox + d.x * t, pz = oz + d.z * t, py = o.y + d.y * t;
    if (Math.hypot(px - p.x, pz - p.z) > radio) return;
    const suelo = cima(p.x, p.z);
    if (py < suelo + y0 - 0.2 || py > suelo + y1 + 0.2) return;
    mt = t; mejor = { tipo, p };
  };
  for (let s = 0; s <= 150; s += 20) {
    const x = ox + d.x / h * s, z = oz + d.z / h * s;
    for (const a of mapa.arbolesCerca(x, z, 26)) {
      const copa = Math.sqrt((a.copa || 1) / Math.PI);
      prueba(a, Math.max(0.25, (a.dbh || 0.1) / 2 + 0.15), 0, a.altura, 'arbol');
      prueba(a, Math.max(0.5, copa * 0.85), a.altura * (a.pft === 'shrub' ? 0.2 : 0.55), a.altura, 'arbol');
    }
    for (const q of mapa.setasCerca(x, z, 26)) prueba(q, 0.35, 0, 0.35, 'seta');
  }
  return mejor;
}

// ------------------------------------------------------------------ seguir a un animal
// G: el siguiente animal a la vista (los grandes primero); la cámara lo acompaña manteniendo
// la distancia y se puede seguir girando y acercando. Esc: dejar de seguir. El seguido se
// simula minuto a minuto (se le dice al trabajador).
let seguido = null, ultimaPos = null;
function seguir(id) {
  seguido = id; ultimaPos = null;
  trabajador.postMessage({ tipo: 'foco', id });
  const a = manada.animales.get(id);
  if (a && manada.pose(a, tic)) ponerseCerca(a);
}
function dejarDeSeguir() {
  if (!seguido) return;
  seguido = null; ultimaPos = null;
  trabajador.postMessage({ tipo: 'foco', id: null });
}
const panel = crearPanel({
  enviar: (m) => trabajador.postMessage(m), dia: () => dia, tic: () => tic, velocidad: () => velocidad, ponerVelocidad: (v) => ponerVelocidad(v), irADia,
  cerrarFicha: () => ficha.cerrar(),
  // cuántos se dibujan de cada grupo y por cuántos del motor vale cada uno
  dibujados: () => { const n = {}; if (dia) for (const id of dia.ids) { const g = dia.agentes[id]?.grupo; if (g) n[g] = (n[g] || 0) + 1; } return { n, vale: dia?.vale || info?.vale || {} }; },
});
// al abrir el panel, la pestaña que estaba (pide sus datos)
$('b-panel').addEventListener('click', () => { if ($('panel').classList.contains('on')) panel.mostrar(panel.pestana); });
const ficha = crearFicha({
  dia: () => dia, tic: () => tic, mapa: () => mapa,
  animal: (id) => manada?.animales.get(id),
  pose: (a, t) => manada.pose(a, t),
  detalle: pedirDetalle,
  seguir, dejarDeSeguir,
  celda: () => mapa?.celda || 90,
  seguido: () => seguido,
  foco: () => focoCamara(),
  total: () => `${fmt(contar().v)} ${T('vertebrados', 'vertebrates')} · ${fmtGrande(contar().i)} ${T('invertebrados', 'invertebrates')}`,
  verFicha: (t) => panel.verFicha(t), cerrarFicha: () => panel.cerrarFicha(),
  animales: () => manada?.animales.values() || [],
});
function seguirSiguiente(paso = 1) {
  const f = focoCamara();
  // los que se ven cerca de donde mira la cámara
  const lista = [...manada.animales.values()].filter((a) => a.visible && Math.hypot(a.x - f.x, a.z - f.z) < 60)
    .sort((a, b) => b.s.tam - a.s.tam || (a.id < b.id ? -1 : 1));
  if (!lista.length) return;
  const i = lista.findIndex((a) => a.id === seguido);
  seguir(lista[(i + paso + lista.length) % lista.length].id);
}
// ponerse cerca, un poco por encima
function ponerseCerca(a) {
  const x = a.x - cx, z = a.z - cz, y = cima(a.x, a.z) + a.y;
  const dist = Math.max(3, a.s.tam * 6);
  camara.pos.set(x + dist * 0.6, y + dist * 0.8, z + dist * 0.6);
  camara.yaw = Math.atan2(x - camara.pos.x, z - camara.pos.z);
  camara.pitch = Math.atan2(y - camara.pos.y, Math.hypot(x - camara.pos.x, z - camara.pos.z));
  ultimaPos = new THREE.Vector3(x, y, z);
}
function acompanar() {
  if (!seguido) return;
  const a = manada.animales.get(seguido);
  if (!a) { if (dia && !dia.agentes[seguido]) dejarDeSeguir(); return; }
  if (!a.visible) return; // aún no ha nacido o se ha ido: se espera
  const p = new THREE.Vector3(a.x - cx, cima(a.x, a.z) + a.y, a.z - cz);
  // si ha dado un salto grande (un día nuevo), la cámara va a él; si no, lo acompaña
  if (!ultimaPos || p.distanceTo(ultimaPos) > 40) ponerseCerca(a);
  else camara.pos.add(p.clone().sub(ultimaPos));
  ultimaPos = p;
}

function siguienteDia() {
  const d = cola.shift();
  if (!d) return false;
  const anterior = dia;
  dia = d;
  d.agentes = d.agentes || {};
  ficha.nuevoDia(anterior);
  panel.nuevoDia();
  const t0 = performance.now();
  prepararPlantas(d.plantas);
  manada.ponerDia(d);
  hogares.cambiado();
  medidas.cambioDia = { animales: performance.now() - t0 };
  sucesos = d.eventos.filter((e) => SUCESOS[e.tipo]).sort((a, b) => a.tic - b.tic);
  if (seguido && !d.agentes[seguido]) dejarDeSeguir();
  trabajador.postMessage({ tipo: 'visto', dia: d.dia });
  $('carga').classList.add('oculto');
  return true;
}

// las plantas del día nuevo (nacen y mueren árboles): las baldosas de alrededor se generan
// poco a poco, unos milisegundos por fotograma, y el bosque cambia de una vez al acabar
let preparando = null;
function prepararPlantas(plantas) {
  const c = camara.pos, x = c.x + cx, z = c.z + cz, r = LEJOS + 80, lista = [];
  for (let i = Math.max(0, Math.floor((x - r) / BALDOSA)); i <= Math.min(Math.ceil(mapa.ancho / BALDOSA) - 1, Math.floor((x + r) / BALDOSA)); i++)
    for (let j = Math.max(0, Math.floor((z - r) / BALDOSA)); j <= Math.min(Math.ceil(mapa.alto / BALDOSA) - 1, Math.floor((z + r) / BALDOSA)); j++)
      lista.push([Math.hypot((i + 0.5) * BALDOSA - x, (j + 0.5) * BALDOSA - z), i, j]);
  lista.sort((p, q) => p[0] - q[0]);
  preparando = mapa.prepararPlantas(plantas, lista.filter((p) => p[0] < r).map((p) => [p[1], p[2]]), (b) => bosque.preparar(b));
}
function seguirPreparando(ms) {
  if (!preparando) return;
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    const t1 = performance.now(), fin = preparando.next().done, t2 = performance.now();
    preparando.k = (preparando.k || 0) + 1;
    if (t2 - t1 > (medidas.pasoPlantas?.ms || 0)) medidas.pasoPlantas = { ms: t2 - t1, fin, k: preparando.k, mem: performance.memory?.usedJSHeapSize };
    if (fin) { preparando = null; bosque.cambiado(); ultimoHalo = null; return; }
  }
}

// ------------------------------------------------------------------ indicador y resumen
const NOMBRE = Object.fromEntries([...ANIMALES, ...PLANTAS, ...SETAS].map((e) => [e.id, T((e.nombre || e.id).toLowerCase(), NOMBRE_EN[e.id] || e.id)]));
const SUCESOS = enIngles() ? { caza: 'catches', muerte: 'dies', nacer: 'is born', llegar: 'arrives', se_va: 'leaves', apareamiento: 'mates' } : { caza: 'caza a', muerte: 'muere', nacer: 'nace', llegar: 'llega', se_va: 'se va', apareamiento: 'se aparea' };
let sucesos = [];
const hhmm = (t) => `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
// para los que no tienen modelo, el grupo funcional del motor
const GRUPO = {
  carnivorous_mammal: 'un felino', herbivorous_mammal: 'un mamífero herbívoro', fungivorous_mammal: 'un mamífero fungívoro',
  scavenging_mammal: 'un carroñero', herbivorous_lizard: 'un lagarto', thermophilic_lizard: 'un eslizón', carnivorous_snake: 'una serpiente',
  frog: 'una rana', carnivorous_bird: 'una rapaz', herbivorous_bird: 'un ave', swallow: 'una golondrina',
  carnivorous_insect_iteroparous: 'un insecto depredador', carnivorous_insect_semelparous: 'un insecto depredador', herbivorous_insect_iteroparous: 'un insecto',
  herbivorous_insect_semelparous: 'un insecto', caterpillar: 'una oruga', butterfly: 'una mariposa', earthworm: 'una lombriz',
  dung_beetle: 'un escarabajo pelotero', detritivorous_insect: 'una termita',
};
const quien = (id, grupo) => { const a = dia?.agentes[id]; return a ? NOMBRE[a.especie] || a.especie : enIngles() ? 'a ' + (GRUPO_EN[grupo] || 'animal').toLowerCase().replace(/s$/, '') : GRUPO[grupo] || 'un animal'; };
function textoSuceso(e) {
  if (e.tipo === 'caza') return `<b>${hhmm(e.tic)}</b> ${quien(e.id, e.grupo)} ${SUCESOS.caza} ${quien(e.presa, e.grupoPresa)}`;
  return `<b>${hhmm(e.tic)}</b> ${quien(e.id, e.grupo)} ${SUCESOS[e.tipo]}`;
}
// «Animales en el mapa»: los individuos del motor, de todos los grupos
const enElMapa = () => Math.round(Object.values(dia?.totales || info?.totales || {}).reduce((s, n) => s + n, 0));
// separados: vertebrados e invertebrados (los invertebrados son cientos de millones)
const contar = () => { const t = dia?.totales || info?.totales || {}; let v = 0, i = 0; for (const [g, n] of Object.entries(t)) if (VERTEBRADOS.has(g)) v += n; else i += n; return { v: Math.round(v), i: Math.round(i) }; };
let ultimoIndicador = 0;
// «3 oct 2026» / «3 Oct 2026»
const fechaTxt = (f) => { const d = new Date(`${f}T12:00:00`); return Number.isNaN(d.getTime()) ? f : d.toLocaleDateString(enIngles() ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'short', year: 'numeric' }); };
const g = (kg) => (kg >= 1 ? num(kg, { maximumFractionDigits: 1 }) + ' kg' : num(kg * 1000, { maximumFractionDigits: kg >= 0.01 ? 0 : 1 }) + ' g');
const fmt = (n) => num(n);
const fmtGrande = (n) => (n >= 1e9 ? `${num(n / 1e9, { maximumFractionDigits: 1 })} ${T('mil millones', 'billion')}` : n >= 1e6 ? `${num(n / 1e6, { maximumFractionDigits: 1 })} ${T('millones', 'million')}` : fmt(n));
function indicador(ahora) {
  if (ahora - ultimoIndicador < 250) return;
  ultimoIndicador = ahora;
  // en el panel (pestaña Mundo): los FPS, los triángulos y si se espera al cálculo
  $('rendimiento').innerHTML = `${medidas.fps.toFixed(0)} FPS · ${fmtGrande(perfil.triangulos || 0)} ${T('triángulos', 'triangles')}${medidas.esperando > 0 ? ` · <span class="gris">${T('calculando el día siguiente…', 'computing the next day…')}</span>` : ''}`;
  $('indicador').classList.toggle('oculto', !dia || $('indicador').dataset.quitado === '1');
  if (!dia) return;
  // arriba a la izquierda, solo: día, fecha, hora, temperatura, humedad y velocidad
  const v = velocidad === 0 ? T('pausa', 'paused') : velocidad === Infinity ? T('máx', 'max') : `×${velocidad}`;
  const c = dia.clima || {};
  const hum = Number.isFinite(c.humedad) ? `${Math.round(c.humedad <= 1.5 ? c.humedad * 100 : c.humedad)} % ${T('humedad', 'humidity')}` : '';
  $('indicador').innerHTML = [`${T('Día', 'Day')} ${dia.dia + 1}`, fechaTxt(dia.fecha), hhmm(tic), Number.isFinite(c.temperatura) ? c.temperatura.toFixed(0) + ' °C' : '', hum, v].filter(Boolean).join(' · ');
  const cal = medidas.calculo.slice(-10), media = cal.reduce((s, x) => s + x, 0) / Math.max(1, cal.length);
  $('medidas').textContent = T(`${perfil.ms.toFixed(1)} ms por fotograma · ${fmt(perfil.triangulos || 0)} triángulos · ${perfil.llamadas || 0} llamadas de dibujo\n` +
    `animales dibujados ${manada.medidas.dibujados} (con modelo ${manada.medidas.articulados}, de cajas ${manada.medidas.instancias}) · simulados uno a uno ${dia.ids.length}\n` +
    `bosque: ${fmt(bosque.medidas.instancias)} plantas por instancias · terreno: ${terreno.medidas.trozos} baldosas de detalle\n` +
    `cálculo de un día ${media.toFixed(2)} s (×600 necesita < 2,4 s) · días preparados ${cola.length}\n` +
    `cada animal que se ve vale por: `,
  `${perfil.ms.toFixed(1)} ms per frame · ${fmt(perfil.triangulos || 0)} triangles · ${perfil.llamadas || 0} draw calls\n` +
    `animals drawn ${manada.medidas.dibujados} (with model ${manada.medidas.articulados}, as boxes ${manada.medidas.instancias}) · simulated one by one ${dia.ids.length}\n` +
    `forest: ${fmt(bosque.medidas.instancias)} instanced plants · terrain: ${terreno.medidas.trozos} detail tiles\n` +
    `computing a day ${media.toFixed(2)} s (×600 needs < 2.4 s) · days ready ${cola.length}\n` +
    `each animal shown stands for: `) + `${Object.entries(dia.vale || info?.vale || {}).filter(([, n]) => n > 1).map(([gr, n]) => `${(GRUPO_PANEL[gr] || gr).toLowerCase()} ${fmt(n)}`).join(', ') || T('uno (todos de uno en uno)', 'one (all one by one)')}`;
  const R = $('resumen');
  R.classList.toggle('on', enResumen());
  if (!enResumen()) return;
  const md = dia.medida;
  const pasados = sucesos.filter((e) => e.tic <= tic);
  const CLASE_EN = { plantas: 'plants', hojarasca: 'leaf litter', setas: 'mushrooms', 'carroña': 'carrion', excrementos: 'dung' };
  R.innerHTML = `<h3>${T('Resumen del día', 'Summary of day')} ${dia.dia + 1}</h3><table>` +
    `<tr><td>${T('Cazas de vertebrados según el motor', 'Vertebrate kills according to the engine')}${md.cazasMotor !== md.cazasMotorAnimales ? ` (${md.cazasMotor} ${T('individuos', 'individuals')})` : ''}</td><td>${md.cazasMotorAnimales}</td></tr>` +
    `<tr><td>· ${T('salen solas (sin ayuda)', 'happen on their own (unaided)')}</td><td>${md.emergentesFinal ?? md.emergentes}</td></tr>` +
    `<tr><td>· ${T('empujadas por el director', 'pushed by the director')}</td><td>${md.forzadasHechas ?? md.forzadas}</td></tr>` +
    `<tr><td>· ${T('lejos de la cámara / al final del día', 'far from the camera / at the end of the day')}</td><td>${md.fueraDeVista} / ${md.residuo}</td></tr>` +
    `<tr><td>${T('Muertes naturales', 'Natural deaths')}</td><td>${md.muertes}</td></tr>` +
    `<tr><td>${T('Nacimientos · llegadas · salidas', 'Births · arrivals · departures')}</td><td>${md.nacimientos} · ${md.llegadas} · ${md.salidas}</td></tr>` +
    `<tr><td>${T('Masa cazada: motor · mundo', 'Mass caught: engine · world')}</td><td>${g(md.masaCazadaMotor)} · ${g(md.masaCazadaMundo)}</td></tr>` +
    Object.entries(md.comidoClase || {}).filter(([, v]) => v.motor || v.mundo).map(([k, v]) => `<tr><td>${T(`Comido (${k}): motor · mundo`, `Eaten (${CLASE_EN[k] || k}): engine · world`)}</td><td>${g(v.motor)} · ${g(v.mundo)}</td></tr>`).join('') +
    `<tr><td>${T('Ajustes de recuento al acabar', 'Count adjustments at the end')}</td><td>${md.ajustes}</td></tr></table>` +
    `<h3>${T('Lo que va pasando', 'What is happening')}</h3>` + (pasados.slice(-14).reverse().map((e) => `<div class="suceso">${textoSuceso(e)}</div>`).join('') || '<div class="suceso">—</div>');
}

// ------------------------------------------------------------------ el tamaño del mundo, guardar
// el tamaño, con botones: cambiarlo vuelve a empezar la simulación (con la misma configuración)
const fmtKm2 = (k) => (k < 1 ? k.toFixed(2).replace('.', ',') : k < 10 && !Number.isInteger(k) ? k.toFixed(1).replace('.', ',') : Math.round(k).toLocaleString('es')) + ' km²';
const irAMundo = (c, d = 0) => { location.href = `./?mundo=${aTexto(c)}${d ? `&dia=${d}` : ''}`; };
function montarAjustes(m) {
  // el tamaño del mundo (km²) y el del mapa (lado, m): cambiarlos vuelve a generar el mundo
  controlTamano($('tam-mundo'), CONFIG.km2, (v) => irAMundo({ ...CONFIG, km2: v }), { avisar: true });
  controlTamano($('tam-mapa'), CONFIG.lado, (v) => irAMundo({ ...CONFIG, lado: v }), { avisar: true, rango: RANGO_LADO });
  $('guardar').onclick = guardar;
}
// guardar el mundo: su configuración y el día (con eso se rehace igual: el motor es
// determinista); en el navegador (lo lista la portada) y en un archivo
function guardar() {
  if (!dia) return;
  const g = { app: 'EcoLoco', version: 1, config: CONFIG, dia: dia.dia, fecha: dia.fecha, guardado: new Date().toISOString() };
  let l = [];
  try { l = JSON.parse(localStorage.getItem('ecoloco.mundos') || '[]'); } catch { /* vacío */ }
  l.unshift(g); localStorage.setItem('ecoloco.mundos', JSON.stringify(l.slice(0, 30)));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(g, null, 1)], { type: 'application/json' }));
  a.download = `ecoloco-${CONFIG.nombre.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, '-')}-dia-${dia.dia + 1}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  aviso(T(`Guardado: día ${dia.dia + 1}. Está en la portada, en «Mundos guardados», y en el archivo descargado.`, `Saved: day ${dia.dia + 1}. It is on the home page, under «Saved worlds», and in the downloaded file.`));
}

// ------------------------------------------------------------------ montar y bucle
let camara = null;
function montar(m) {
  mapa = new Mapa(m.mapa);
  mapa.actualizarPlantas(m.plantas);
  // el origen de la escena: el centro del cuadro de partida
  cx = mapa.centro.x; cz = mapa.centro.z;
  terreno = crearTerreno({ escena, mapa, ox: cx, oz: cz });
  bosque = crearBosque({ escena, mapa, ox: cx, oz: cz, cima, tiempo, viento });
  manada = crearManada({ escena, ox: cx, oz: cz, cima });
  hogares = crearHogares({ escena, ox: cx, oz: cz, cima, mapa, tamDe: (e) => manada.tamDe(e) });
  visor.luces(escena, 'dia', 62);
  escena.add(visor.sol.target);
  montarAjustes(m);
  hemi = escena.children.find((o) => o.isHemisphereLight);
  escena.fog = new THREE.Fog('#6a8a7a', 160, 480);
  camara = new CamaraUnity(lienzo, { elevacion: 38, azimut: 25, distancia: 85, ortoAlto: 60 });
  camara.camP.far = 1200; camara.camP.updateProjectionMatrix();
  camara.camO.far = 1200; camara.camO.updateProjectionMatrix();
  camara.camP.layers.enable(CAPA_CIELO); camara.camO.layers.enable(CAPA_CIELO);
  // con los dedos (móvil y tableta)
  tactil = crearTactil({ lienzo, camara: () => camara, alMover: dejarDeSeguir,
    foco: () => { const f = focoCamara(); return new THREE.Vector3(f.x - cx, cima(f.x, f.z), f.z - cz); } });
  ponerVelocidad(1);
  requestAnimationFrame(bucle);
}

let ultimo = performance.now();
function bucle(ms) {
  requestAnimationFrame(bucle);
  cuadro(ms);
}
// pinta n cuadros seguidos esperando a la GPU en cada uno: lo que costaría cada cuadro con la
// pestaña delante (sirve aunque el navegador esté en segundo plano y no dé fotogramas)
function medirCuadros(n = 60) {
  const gl = visor.renderer.getContext(), px = new Uint8Array(4);
  const t0 = performance.now();
  for (let k = 0; k < n; k++) { cuadro(ultimo + 1000 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  const ms = (performance.now() - t0) / n;
  return { msPorCuadro: ms, fps: 1000 / ms, triangulos: perfil.triangulos, llamadas: perfil.llamadas, ...manada.medidas, plantas: bosque.medidas.instancias, ancho: visor.objetivo?.width, alto: visor.objetivo?.height };
}
// el banco de pruebas: n fotogramas forzados (cediendo entre uno y otro, para que lleguen los
// días del trabajador) a una velocidad, moviendo la cámara «mover» m por fotograma si se pide;
// devuelve lo que tarda cada fotograma (mediana, p95, máximo), los tirones y lo que se pinta
async function banco(n = 1500, vel = 60, mover = 0) {
  const ceder = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
  ponerVelocidad(vel);
  const ms = [], huecos = []; let fin = performance.now(), maxTri = 0, maxLl = 0;
  const dia0 = dia?.dia; perfil.peores.length = 0;
  for (let k = 0; k < n; k++) {
    await ceder();
    const a = performance.now(); huecos.push(a - fin);
    if (mover) camara.pos.x += mover;
    medirCuadros(1);
    fin = performance.now(); ms.push(fin - a);
    maxTri = Math.max(maxTri, perfil.triangulos); maxLl = Math.max(maxLl, perfil.llamadas);
  }
  const tot = ms.map((m, i) => m + huecos[i]).sort((a, b) => a - b), s = [...ms].sort((a, b) => a - b);
  const p = (l, q) => +l[Math.floor(l.length * q)].toFixed(1);
  return { fotogramas: n, ms_p50: p(s, 0.5), ms_p95: p(s, 0.95), ms_max: Math.round(s[s.length - 1]), tirones_50ms: tot.filter((x) => x > 50).length, tirones_100ms: tot.filter((x) => x > 100).length,
    triangulos: maxTri, llamadas: maxLl, dias: (dia?.dia ?? 0) - (dia0 ?? 0), animales: manada.medidas.dibujados, simulados: dia?.ids.length,
    peores: perfil.peores.slice(-4).map((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => Math.abs(v) > 3).map(([k, v]) => [k, Math.round(v)]))) };
}
// desglose del tiempo de cada fotograma (para buscar tirones): perfil.ultimo y los peores
const perfil = { ultimo: {}, peores: [], ms: 0 };
let marcaT = 0, partes = null;
const marca = (n) => { const t = performance.now(); partes[n] = (partes[n] || 0) + t - marcaT; marcaT = t; };
let ultimaCamara = null, ultimoHalo = null;
function cuadro(ms) {
  partes = {}; marcaT = performance.now(); const t0 = marcaT, m0 = performance.memory?.usedJSHeapSize;
  const dt = Math.min(0.1, Math.max(0, ms - ultimo) / 1000); ultimo = ms;
  tiempo.value = ms / 1000;
  medidas.cuadros++;
  if (ms - medidas.desde > 1000) { medidas.fps = medidas.cuadros * 1000 / (ms - medidas.desde); medidas.cuadros = 0; medidas.desde = ms; }
  if (!camara) return;
  if (dia) {
    // el reloj de juego: a máx, un día entero por cada día que esté listo
    tic += velocidad === Infinity ? TICS : dt * velocidad;
    medidas.esperando = 0;
    if (tic >= TICS) {
      if (cola.length) { tic = velocidad === Infinity ? 12 * 60 : tic - TICS; marca('reloj'); siguienteDia(); marca('cambioDia'); }
      else { tic = TICS - 0.001; medidas.esperando = 1; }
    }
    marca('reloj');
  }
  camActual = camara.paso(dt);
  const f = focoCamara();
  // al trabajador: dónde mira la cámara (ahí se simula minuto a minuto los días que vienen)
  if (!ultimaCamara || Math.hypot(f.x - ultimaCamara.x, f.z - ultimaCamara.z) > 10) { ultimaCamara = f; trabajador.postMessage({ tipo: 'camara', x: f.x, z: f.z }); }
  marca('camara');
  if (dia) {
    // a velocidades altas las animaciones van algo más rápidas, pero no al ritmo del reloj
    const siempre = new Set([seguido, ficha.seleccionado].filter(Boolean));
    manada.actualizar(tic, camara.pos, dt * Math.min(4, Math.max(1, Math.sqrt(velocidad === Infinity ? 16 : velocidad) / 2)), siempre);
    marca('animales');
    acompanar();
    // lo que tape al animal que se sigue, a medias (bosque.js)
    const sg = seguido && manada.animales.get(seguido);
    uSigue.value = sg && sg.visible ? 1 : 0;
    if (uSigue.value) uSeguido.value.set(sg.x - cx, cima(sg.x, sg.z) + sg.y + sg.s.tam * 0.4, sg.z - cz);
    // el anillo bajo el seleccionado
    const s = ficha.seleccionado && manada.animales.get(ficha.seleccionado);
    anillo.visible = !!(s && s.visible);
    if (anillo.visible) { anillo.position.set(s.x - cx, cima(s.x, s.z) + s.y + 0.03, s.z - cz); anillo.scale.setScalar(Math.max(0.35, s.s.tam * 0.7)); }
  }
  // el terreno de detalle y el bosque, según dónde está y mira la cámara
  const cp = camara.pos, cerca = { x: cp.x + cx, z: cp.z + cz };
  // el detalle del suelo: donde mira si está cerca, si no, bajo la cámara
  const df = Math.hypot(f.x - cerca.x, f.z - cerca.z) < 60 ? f : cerca;
  terreno.actualizar(df.x, df.z, 4);
  marca('terreno');
  seguirPreparando(3);
  marca('plantas');
  bosque.actualizar(cp, 4);
  marca('bosque');
  hogares.actualizar(dia, cerca.x, cerca.z);
  marca('hogares');
  // el cielo y el tiempo (antes que la luz, que los usa)
  const nocheAntes = cuadro.noche || 0;
  const tiempoAhora = cielo.actualizar(camActual.position, tic / 60, nocheAntes, dia?.clima, ms / 1000);
  const noche = luz(tic / 60);
  cuadro.noche = noche;
  // la niebla: más cerca con neblina o lluvia
  escena.fog.near = 140 * (1 - 0.8 * tiempoAhora.niebla); escena.fog.far = 480 * (1 - 0.65 * tiempoAhora.niebla);
  // el agua: sus ondas, el sol y su color con la luz del día
  const ua = terreno.agua.material.uniforms;
  ua.time.value = ms / 1000 * 0.6; ua.sunDirection.value.copy(cielo.sol);
  ua.sunColor.value.copy(visor.sol.color).multiplyScalar(Math.max(0, cielo.sol.y) * (1 - tiempoAhora.nubes * 0.7));
  ua.waterColor.value.set('#123230').multiplyScalar(0.2 + 0.8 * (1 - noche));
  if (noche > 0.05 && (!ultimoHalo || Math.hypot(f.x - ultimoHalo.x, f.z - ultimoHalo.z) > 10 || ultimoHalo.dia !== dia?.dia)) { ultimoHalo = { ...f, dia: dia?.dia }; ponerHalo(bosque.luces(f.x, f.z)); }
  moverParticulas(ms / 1000, dt, tic / 60, f);
  marca('luzYparticulas');
  indicador(ms);
  if (dia && (panel.pestana === 'animales' || panel.pestana === 'ficha')) ficha.actualizar(ms, panel.pestana);
  if (dia && ms - (cuadro.panel || 0) > 400) { cuadro.panel = ms; panel.actualizar(ms); }
  marca('paneles');
  // la sombra del sol, donde mira la cámara
  const p = new THREE.Vector3(f.x - cx, cima(f.x, f.z), f.z - cz);
  visor.sol.target.position.copy(p); visor.sol.target.updateMatrixWorld();
  visor.sol.position.add(p); // (luz() la pone cada fotograma respecto al origen)
  const ri = visor.renderer.info; ri.autoReset = false; ri.reset();
  visor.pintar(escena, camActual);
  perfil.triangulos = ri.render.triangles; perfil.llamadas = ri.render.calls;
  marca('pintar');
  partes.total = performance.now() - t0;
  perfil.ultimo = partes;
  perfil.ms = perfil.ms * 0.9 + partes.total * 0.1;
  if (partes.total > 50) { perfil.peores.push({ ...partes, montonMB: m0 ? ((performance.memory.usedJSHeapSize - m0) / 1e6) : 0 }); if (perfil.peores.length > 30) perfil.peores.shift(); }
}
// el punto del suelo al que mira la cámara (en coordenadas del mundo)
function focoCamara() {
  if (!camara || !mapa) return { x: cx, z: cz };
  const m = camara.mira(), p = camara.pos;
  let t = m.y < -0.05 ? (p.y - cima(p.x + cx, p.z + cz)) / -m.y : 60;
  t = Math.min(Math.max(t, 0), 400);
  const x = Math.min(Math.max(p.x + m.x * t + cx, 0), mapa.ancho), z = Math.min(Math.max(p.z + m.z * t + cz, 0), mapa.alto);
  return { x, z };
}
window.__vivo = {
  perfil, ficha, panel, trabajador, medidas, medirCuadros, plantaEn, banco, escena, visor, seguirSiguiente, focoCamara, ponerVelocidad, cola,
  get diaCompleto() { return dia; }, get camActual() { return camActual; }, suelo: (x, z) => cima(x, z), irA: (h) => { tic = h * 60; },
  get camara() { return camara; }, get seguido() { return seguido; }, centro: () => [cx, cz], get mapa() { return mapa; },
  get manada() { return manada; }, get bosque() { return bosque; }, get terreno() { return terreno; }, get hogares() { return hogares; }, enElMapa,
  get dia() { return dia && { dia: dia.dia, fecha: dia.fecha, tic, simulados: dia.ids.length, medida: dia.medida }; },
};
