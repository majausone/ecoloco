/* PLANTAS Y SETAS de Borneo, SUAVES (la versión de cubos está en plantas-cubos.js).
   - Los árboles los hace ez-tree (graficos/vendor/ez-tree, de Dan Greenheck, MIT): tronco y ramas
     con cilindros que se estrechan, y hojas en tarjetas recortadas con la textura del atlas
     (plantas-textura.js). De cada árbol se usa el esqueleto que genera (secciones de cada rama y
     sitio de cada hoja) y la malla se hace aquí, a dos niveles de detalle con la misma semilla.
   - Lo que no es un árbol (palmas, helechos, jengibre, jarras, rafflesia, orquídea, epífitas) y
     las setas: tiras curvas para las hojas y frondas, tubos para tallos y piezas de revolución
     (geometria.js), con la misma técnica de tarjetas.
   Cada constructor echa sus piezas en un «saco» por tipo (sólido, hoja que se mece, fruto, flor y
   brillo) y apunta dónde se pueden posar los animales (flores, frutos, hojas y ramas de verdad).
   El viento, el crecer de flores y frutos y el marchitarse van en el shader (parchePlanta). */

import * as THREE from '../vendor/three.module.js';
import { azar } from '../escena-v3.js?v=202610052309';
import { Tree } from '../../vendor/ez-tree/tree.js';
import { Branch } from '../../vendor/ez-tree/branch.js';
import RNG from '../../vendor/ez-tree/rng.js';
import { Malla, tubo, tira, tarjeta, torno, bola, bezier, vec, tono, mezcla, uvCelda } from './geometria.js?v=202610052309';
import { construir as construirCubos } from './plantas-cubos.js?v=202610052309';
import { texturaPlantas } from './plantas-textura.js?v=202610052309';

const TIPOS = ['solido', 'hoja', 'fruto', 'flor', 'brillo'];
const color = (c) => (c instanceof THREE.Color ? c : new THREE.Color(c));

/* ---------------------------------------------------------------- el saco */
export class SacoP {
  constructor(detalle = 0) {
    this.detalle = detalle; // 0: de cerca; 1: a media distancia (menos hojas, más grandes; ramas finas fuera)
    this.m = Object.fromEntries(TIPOS.map((t) => [t, new Malla()]));
    this.puntos = { flor: [], fruto: [], hoja: [], rama: [] };
    this.horquilla = null;
    this.cubos = 0;
    this.lista = {}; // los cubos de lo que aún va con cubos, por tipo (para el bloque de lejos del bosque)
    // el tronco del árbol, para enganchar lianas (troncoDe): sus secciones { x, y, z, r } de abajo arriba, y lo
    // que lo ensancha al pie (contrafuertes o raíces): { alto, r(h) }
    this.tronco = null; this.pie = null;
  }
  // (los cubos de antes siguen valiendo: el suelo del editor y lo que aún no es suave)
  cubo(tipo, x, y, z, sx, sy, sz, c, rx = 0, ry = 0, rz = 0) {
    (this.lista[tipo] ||= []).push([x, y, z, sx, sy, sz, color(c), rx, ry, rz]);
    // a media distancia, aligerado como antes: de las hojas, una de cada 10 y más grande; de lo demás, lo grande
    if (this.detalle === 1) {
      const n = this.lista[tipo].length - 1;
      if (tipo === 'hoja') { if (n % 10) return; sx *= 2.1; sy *= 2.1; sz *= 2.1; }
      else if (tipo === 'solido') { if (sx * sy * sz <= 0.004) return; }
      else if (tipo === 'flor' || tipo === 'brillo') { if (n % 5) return; }
      else if (tipo === 'fruto') return;
    }
    const M = this.m[tipo], k = color(c), mat = new THREE.Matrix4().compose(vec(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), vec(sx, sy, sz));
    const caras = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const nm = new THREE.Matrix3().getNormalMatrix(mat), centro = vec(x, y, z);
    for (const [a, b, d] of caras) {
      const n = vec(a, b, d), u = vec(b, d, a), w = vec().crossVectors(n, u);
      const nn = n.clone().applyMatrix3(nm).normalize();
      const ids = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => M.v(vec().copy(n).multiplyScalar(0.5).addScaledVector(u, s * 0.5).addScaledVector(w, t * 0.5).applyMatrix4(mat), nn, k, uvCelda(0, 0.5, 0.5), tipo === 'hoja' || tipo === 'flor' || tipo === 'fruto' ? 0.02 : 0, centro));
      M.q(ids[0], ids[1], ids[2], ids[3]);
    }
    this.cubos++;
    // los posaderos, como con los cubos: la cara de arriba de flores, frutos y hojas, y las ramas finas
    if (tipo === 'flor' || tipo === 'fruto' || tipo === 'hoja') this.punto(tipo, x, y + sy / 2, z);
    else if (tipo === 'solido' && y > 0.4 && Math.min(sx, sz) < 0.15) this.punto('rama', x, y + sy / 2, z);
  }
  punto(tipo, x, y, z) { if (typeof x === 'object') ({ x, y, z } = x); this.puntos[tipo].push(x, y, z); }
  get total() { return TIPOS.reduce((n, t) => n + this.m[t].triangulos, 0); }
  // (a media distancia sin frutos: bolitas de menos de un píxel que solo gastan)
  // juntarCartas: hojas, flores y frutos en una sola malla (tipo «hoja»), para el bosque: comparten
  // material (tarjetas con recorte) y así cada planta son 2 llamadas de dibujo en vez de 4 o 5
  // juntarTodo: también el tronco y las ramas (todo menos lo que brilla), en una sola malla
  geometrias({ juntarCartas = false, juntarTodo = false } = {}) {
    const o = {};
    const tipos = TIPOS.filter((t) => this.m[t].triangulos && !(this.detalle === 1 && t === 'fruto'));
    if (!juntarCartas) { for (const t of tipos) o[t] = this.m[t].geometria(); return o; }
    const cartas = new Malla();
    for (const t of tipos) {
      if (t !== 'hoja' && t !== 'flor' && t !== 'fruto' && !(juntarTodo && t === 'solido')) { o[t] = this.m[t].geometria(); continue; }
      const m = this.m[t], base = cartas.nv;
      for (const k of ['pos', 'nor', 'col', 'uv', 'vie', 'cen']) for (const x of m[k]) cartas[k].push(x);
      for (const i of m.idx) cartas.idx.push(i + base);
    }
    if (cartas.triangulos) o.hoja = cartas.geometria();
    return o;
  }
  mallas(tiempo, viento) {
    const out = [];
    for (const [tipo, g] of Object.entries(this.geometrias())) {
      const mat = materialPlanta(tipo, { tiempo, viento });
      const malla = new THREE.Mesh(g, mat);
      malla.castShadow = tipo !== 'brillo'; malla.receiveShadow = tipo !== 'brillo';
      malla.userData.tipo = tipo;
      out.push(malla);
    }
    return out;
  }
}

/* ---------------------------------------------------------------- el material */
const MARRON = new THREE.Color('#7a5a2a'), MARRON_SETA = new THREE.Color('#3a2a1e');
/* Mete en el shader de un material el viento (cada vértice se mueve aViento metros, con una fase
   según dónde está su planta y él mismo), el crecer de flores y frutos (cada pieza hacia su centro,
   aCentro) y el marchitarse (hacia el marrón). u: { tiempo, viento, marchito, crecer, marron }.
   vertexExtra / fragmentoInicio / cabecera*: lo que añada quien lo use (el bosque: niveles de detalle). */
export function parchePlanta(sh, tipo, u, { vertexExtra = '', vertexFinal = '', cabeceraVertex = '', cabeceraFragmento = '', fragmentoInicio = '', uniformes = {} } = {}) {
  Object.assign(sh.uniforms, uniformes);
  sh.uniforms.uTiempo = u.tiempo; sh.uniforms.uViento = u.viento;
  sh.uniforms.uMarchito = u.marchito || { value: 0 }; sh.uniforms.uCrecer = u.crecer || { value: 1 };
  sh.uniforms.uMarron = u.marron || { value: MARRON };
  const crece = tipo === 'flor' || tipo === 'fruto';
  sh.vertexShader = `uniform float uTiempo;\nuniform float uViento;\nuniform float uCrecer;\nattribute float aViento;\nattribute vec3 aCentro;\n${cabeceraVertex}\n` + sh.vertexShader
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${crece ? 'transformed = aCentro + (transformed - aCentro) * uCrecer;' : ''}`)
    .replace('#include <project_vertex>', `vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
        vec3 orgPlanta = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #else
        vec3 orgPlanta = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #endif
      float faseV = dot(orgPlanta.xz, vec2(0.37, 0.61)) + dot(transformed.xz, vec2(0.21, 0.17));
      float wV = aViento * uViento;
      mvPosition.x += wV * (sin(uTiempo * 1.3 + faseV) + 0.35 * sin(uTiempo * 3.1 + faseV * 2.3));
      mvPosition.z += wV * 0.7 * cos(uTiempo * 1.1 + faseV * 0.9);
      mvPosition.y += wV * 0.25 * sin(uTiempo * 2.3 + faseV * 1.7);
      ${vertexExtra}
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;
      ${vertexFinal}`);
  sh.fragmentShader = `uniform float uMarchito;\nuniform vec3 uMarron;\n${cabeceraFragmento}\n` + sh.fragmentShader
    .replace('void main() {', `void main() {\n${fragmentoInicio}`)
    .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, uMarron, uMarchito);')
    // las hojas (tarjetas de dos caras) se iluminan igual por las dos: su normal ya mira hacia fuera de la copa
    .replace('#include <normal_fragment_begin>', tipo === 'hoja' || tipo === 'flor' ? THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '') : '#include <normal_fragment_begin>');
}
// el atlas de hojas y flores: se pinta la primera vez que hace falta un material (en Node o en el
// Worker de la simulación no hay materiales, así que no se pinta)
export function atlas() { return typeof document !== 'undefined' || typeof OffscreenCanvas !== 'undefined' ? texturaPlantas() : null; }

export function materialPlanta(tipo, u, extra) {
  const cartas = (tipo === 'hoja' || tipo === 'flor' || tipo === 'fruto') && extra?.cartas !== false, texturaAtlas = atlas();
  const m = tipo === 'brillo' ? new THREE.MeshBasicMaterial({ vertexColors: true })
    : new THREE.MeshLambertMaterial({ vertexColors: true, map: cartas ? texturaAtlas : null, alphaTest: cartas && texturaAtlas ? 0.42 : 0, side: cartas ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = (sh) => parchePlanta(sh, tipo, u, extra);
  m.customProgramCacheKey = () => `planta:${tipo}:${cartas}:${extra?.clave || ''}`;
  return m;
}
// y su sombra (con el mismo recorte y el mismo viento)
export function materialSombraPlanta(tipo, u, extra) {
  const texturaAtlas = atlas();
  const cartas = (tipo === 'hoja' || tipo === 'flor' || tipo === 'fruto') && extra?.cartas !== false;
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: cartas ? texturaAtlas : null, alphaTest: cartas && texturaAtlas ? 0.42 : 0, side: cartas ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = (sh) => parchePlanta(sh, tipo, u, extra);
  m.customProgramCacheKey = () => `plantaSombra:${tipo}:${cartas}:${extra?.clave || ''}`;
  return m;
}

/* ---------------------------------------------------------------- árboles con ez-tree */
const VERDES = ['#183a22', '#2a5a2a', '#447e30', '#6aa23c', '#a8c85a'];
const VERDES_OSC = ['#102a1c', '#1c4224', '#2e5e2c', '#4e7e36', '#7ea04a'];

// las opciones de ez-tree (ver graficos/vendor/ez-tree/options.js), por nivel {0: tronco, 1, 2, 3}
function opcionesEz(o) {
  const n = (v, d) => (v === undefined ? d : v);
  return {
    type: n(o.tipo, 'deciduous'),
    branch: {
      levels: o.niveles, angle: o.angulo, children: o.hijos, force: { direction: { x: 0, y: 1, z: 0 }, strength: n(o.fuerza, 0.01) },
      gnarliness: o.retorcido, length: o.largo, radius: o.radio, sections: o.secciones, segments: o.segmentos, start: o.inicio, taper: o.afilado, twist: o.giro || { 0: 0, 1: 0, 2: 0, 3: 0 },
    },
    leaves: { count: o.hojas.n, start: n(o.hojas.inicio, 0), angle: n(o.hojas.angulo, 40), size: o.hojas.tam, sizeVariance: n(o.hojas.varianza, 0.3), billboard: 'single' },
  };
}
// el esqueleto que genera ez-tree con una semilla (sin hacer su malla ni sus materiales)
function esqueletoEz(o, semilla) {
  const t = new Tree();
  t.options.copy(opcionesEz(o));
  t.options.seed = semilla;
  t.branches = { verts: [], normals: [], indices: [], uvs: [], windFactor: [] };
  t.leaves = { verts: [], normals: [], indices: [], uvs: [] };
  t.esqueleto = []; t.hojasInfo = [];
  t.rng = new RNG(semilla);
  const b = t.options.branch;
  t.branchQueue.push(new Branch(new THREE.Vector3(), new THREE.Euler(), b.length[0], b.radius[0], 0, b.sections[0], b.segments[0]));
  while (t.branchQueue.length) t.generateBranch(t.branchQueue.shift());
  return t;
}

/* Un árbol: ez-tree da el esqueleto y las hojas; aquí se hacen la corteza (tubos por las
   secciones, con menos lados y sin ramitas a media distancia) y las hojas (tarjetas del atlas,
   menos y más grandes a media distancia), escalado a «alto» metros. Devuelve lo que sirve para
   adornarlo: la escala, las puntas de las ramas, los sitios de las hojas y el centro de la copa. */
function arbolEz(S, r, x, y, z, o) {
  const semilla = Math.floor(r() * 1e6);
  const t = esqueletoEz(o, semilla);
  // la escala: que mida «alto» de verdad (hasta lo más alto de ramas y hojas)
  let maxY = 0;
  for (const rama of t.esqueleto) for (const s of rama.secciones) maxY = Math.max(maxY, s.origin.y);
  for (const h of t.hojasInfo) maxY = Math.max(maxY, h.origen.y + h.tam * 0.5);
  const k = o.alto / Math.max(0.01, maxY), d = S.detalle, base = vec(x, y, z);
  const P = (v) => vec(v.x * k + x, v.y * k + y, v.z * k + z);
  const corteza = o.corteza.map(color);
  const vientoDe = (py) => { const h = Math.max(0, (py - y) / o.alto); return h * h * 0.06 * Math.sqrt(o.alto); };
  const puntas = [];
  let horquilla = Infinity;
  const Mc = S.m.solido;
  for (const rama of t.esqueleto) {
    const nivel = rama.nivel, sec = rama.secciones;
    const rad0 = sec[0].radius * k;
    if (d === 1 && (nivel >= 3 || rad0 < 0.025)) continue;
    if (nivel === 1) horquilla = Math.min(horquilla, sec[0].origin.y * k);
    if (nivel === 0 && !S.tronco) S.tronco = sec.map((q) => { const p = P(q.origin); return { x: p.x, y: p.y, z: p.z, r: q.radius * k }; });
    const segs = Math.max(3, Math.round((o.segmentos[nivel] || 3) * (d ? 0.6 : 1)));
    const paso = d && sec.length > 4 ? 2 : 1;
    const filas = [];
    for (let i = 0; i < sec.length; i += paso) {
      const s = sec[Math.min(i, sec.length - 1)], c0 = P(s.origin), fila = [];
      const cr = tono(corteza, Math.min(0.99, 0.15 + r() * 0.5 + (i / sec.length) * 0.3));
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * Math.PI * 2, dir = vec(Math.cos(a), 0, Math.sin(a)).applyEuler(s.orientation);
        const pc = c0.clone().addScaledVector(dir, Math.max(0.004, s.radius * k));
        // una pizca de sombra en un lado del tronco (como la luz del sol)
        fila.push(Mc.v(pc, dir, cr.clone().multiplyScalar(0.85 + 0.15 * Math.cos(a - 0.8)), uvCelda(0, 0.5, 0.5), vientoDe(pc.y) + (nivel ? nivel * 0.01 : 0)));
      }
      filas.push(fila);
      if (i + paso >= sec.length && i !== sec.length - 1) i = sec.length - 1 - paso; // que la última sección esté
    }
    for (let i = 0; i < filas.length - 1; i++) for (let j = 0; j < segs; j++) Mc.q(filas[i][j], filas[i + 1][j], filas[i + 1][j + 1], filas[i][j + 1]);
    // las ramas finas: sitio para posarse (encima de cada sección)
    if (nivel >= 1) for (const s of sec) if (s.radius * k < 0.15 && s.radius * k > 0.008) { const p = P(s.origin); S.punto('rama', p.x, p.y + s.radius * k, p.z); }
    if (nivel === o.niveles) puntas.push(P(sec[sec.length - 1].origin));
  }
  // las hojas
  const hojas = t.hojasInfo;
  const cx = hojas.reduce((a, h) => a + h.origen.x, 0) / Math.max(1, hojas.length), cz = hojas.reduce((a, h) => a + h.origen.z, 0) / Math.max(1, hojas.length);
  const ys = hojas.map((h) => h.origen.y).sort((a, b) => a - b);
  const centroCopa = P(vec(cx, ys.length ? ys[Math.floor(ys.length * 0.4)] : maxY * 0.7, cz));
  const paso = d ? (o.hojas.pasoMedio || 3) : 1, agranda = Math.sqrt(paso) * (d ? 1.1 : 1);
  const sitios = [];
  for (let i = 0; i < hojas.length; i++) {
    const h = hojas[i], p = P(h.origen);
    sitios.push(p);
    if (i % paso) continue;
    const dir = vec(0, 1, 0).applyEuler(h.orientacion), lado = vec(1, 0, 0).applyEuler(h.orientacion);
    const largo = h.tam * k * agranda, ancho = largo * (o.hojas.ancho || 1);
    const c = tono(o.hojas.colores, 0.25 + r() * 0.7);
    const opc = { pasos: d ? 1 : 2, caida: largo * (o.hojas.caida ?? 0.12), celda: o.hojas.celda, color: c, viento: vientoDe(p.y) + 0.02, aleteo: 0.04, normalHacia: centroCopa, pliegue: d ? 0 : (o.hojas.pliegue || 0) };
    tira(S.m.hoja, p, dir, lado, largo, ancho, opc);
    if (o.hojas.cruz && !d) tira(S.m.hoja, p, dir, vec().crossVectors(dir, lado), largo, ancho, opc);
    S.punto('hoja', p.x, p.y + 0.02, p.z);
  }
  if (horquilla === Infinity) horquilla = (ys.length ? ys[Math.floor(ys.length * 0.15)] * k : o.alto * 0.6);
  S.horquilla = S.horquilla ?? horquilla;
  return { k, puntas, sitios, centroCopa, maxY: maxY * k, base };
}

/* El tronco de un árbol hecho en el saco S (con construir en 0, 0, 0): perfil(h) da, a h m del suelo, el
   centro del tronco { x, z } y su radio r (con los contrafuertes o las raíces del pie), para enganchar lianas. */
export function troncoDe(S) {
  const T = S.tronco, pie = S.pie;
  if (!T || !T.length) return null;
  const arriba = T[T.length - 1].y;
  return {
    arriba,
    perfil(h) {
      let i = 0;
      while (i < T.length - 2 && T[i + 1].y < h) i++;
      const a = T[i], b = T[Math.min(T.length - 1, i + 1)], k = b.y > a.y ? Math.min(1, Math.max(0, (h - a.y) / (b.y - a.y))) : 0;
      // (por debajo del tronco, si arranca en alto como el de la higuera, el de abajo del todo)
      let r = h < a.y ? a.r : a.r + (b.r - a.r) * k;
      if (pie && h < pie.alto) r = Math.max(r, pie.r(h));
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, r };
    },
  };
}

/* ---------------------------------------------------------------- piezas sueltas */
// un tronco recto o algo curvo, con anillos o manchas en el color
function troncoTubo(S, r, x, y, z, alto, r0, r1, colores, { segs = 8, curva = 0, anillos = 0, tipo = 'solido', viento = 0 } = {}) {
  const n = S.detalle ? 5 : 9, pts = [], rad = [];
  const ang = r() * 6.28;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(vec(x + Math.cos(ang) * curva * t * t, y + alto * t, z + Math.sin(ang) * curva * t * t));
    rad.push(r0 + (r1 - r0) * t);
  }
  const cs = colores.map(color);
  tubo(S.m[tipo], pts, rad, { segs: S.detalle ? Math.max(4, Math.round(segs * 0.6)) : segs, color: (t, a) => { let c = tono(cs, 0.3 + 0.4 * Math.abs(Math.sin(t * 17 + a))); if (anillos && Math.floor(t * anillos) % 2) c = c.clone().multiplyScalar(0.8); return c.multiplyScalar(0.85 + 0.15 * Math.cos(a - 0.8)); }, viento: (t) => viento * t * t });
  return pts[n];
}
// contrafuertes: aletas triangulares con grosor alrededor del pie del tronco
function contrafuertes(S, r, x, y, z, n, alto, largo, radioTronco, colores) {
  const M = S.m.solido, cs = colores.map(color);
  // (lo que ocupan, para las lianas: a una altura h, hasta dónde llegan las aletas, algo menos que las más largas)
  S.pie = { alto: alto * 1.2, r: (h) => radioTronco * 0.8 + largo * 1.05 * (1 - Math.pow(Math.min(1, Math.max(0, h - y) / (alto * 1.2)), 1 / 1.6)) };
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.5, dir = vec(Math.cos(a), 0, Math.sin(a)), lado = vec(-Math.sin(a), 0, Math.cos(a));
    const L = largo * (0.7 + r() * 0.5), H = alto * (0.7 + r() * 0.5), g = 0.05 + r() * 0.03;
    const c = tono(cs, 0.35 + r() * 0.3);
    // perfil cóncavo: de la base (lejos) al tronco (alto)
    const pasos = S.detalle ? 2 : 4, filas = [];
    for (let i = 0; i <= pasos; i++) {
      const t = i / pasos, dd = radioTronco * 0.8 + L * (1 - t), hh = H * Math.pow(t, 1.6);
      filas.push([vec(x, y, z).addScaledVector(dir, dd), vec(x, y + hh + 0.02, z).addScaledVector(dir, dd)]);
    }
    for (const s of [-1, 1]) {
      const n0 = lado.clone().multiplyScalar(s), ids = filas.map(([pa, pb]) => [M.v(pa.clone().addScaledVector(lado, s * g), n0, c, uvCelda(0, 0.5, 0.5)), M.v(pb.clone().addScaledVector(lado, s * g * 0.4), n0, c.clone().multiplyScalar(1.05), uvCelda(0, 0.5, 0.5))]);
      for (let i = 0; i < pasos; i++) s > 0 ? M.q(ids[i][0], ids[i + 1][0], ids[i + 1][1], ids[i][1]) : M.q(ids[i][0], ids[i][1], ids[i + 1][1], ids[i + 1][0]);
    }
    // el canto de arriba
    const arriba = filas.map(([, pb]) => pb), ids = [];
    for (const p of arriba) { const nn = vec(0, 1, 0); ids.push(M.v(p.clone().addScaledVector(lado, g * 0.4), nn, c, uvCelda(0, 0.5, 0.5)), M.v(p.clone().addScaledVector(lado, -g * 0.4), nn, c, uvCelda(0, 0.5, 0.5))); }
    for (let i = 0; i < pasos; i++) M.q(ids[i * 2], ids[i * 2 + 1], ids[i * 2 + 3], ids[i * 2 + 2]);
  }
}

/* ---------------------------------------------------------------- plantas */
const PLANTA = {
  dillenia(S, r, x, y, z) {
    const o = {
      alto: 7, niveles: 2, angulo: { 1: 52, 2: 40 }, hijos: { 0: 8, 1: 4 }, inicio: { 1: 0.42, 2: 0.25 },
      largo: { 0: 4.2, 1: 2.6, 2: 1.3 }, radio: { 0: 0.24, 1: 0.55, 2: 0.6 }, secciones: { 0: 8, 1: 6, 2: 4 }, segmentos: { 0: 8, 1: 5, 2: 4 },
      afilado: { 0: 0.6, 1: 0.65, 2: 0.8 }, retorcido: { 0: 0.04, 1: 0.12, 2: 0.18 }, fuerza: 0.015,
      corteza: ['#5e4430', '#7a5a3e', '#9a7650'],
      hojas: { n: 5, inicio: 0.35, angulo: 58, tam: 0.75, varianza: 0.25, celda: 'hoja-grande', ancho: 0.62, caida: 0.16, pliegue: 0.25, colores: VERDES, pasoMedio: 3 },
    };
    const A = arbolEz(S, r, x, y, z, o);
    // flores amarillas y frutos verdes en las puntas de las ramas
    const n = S.detalle ? 6 : 14;
    for (let i = 0; i < n; i++) {
      const p = A.sitios[Math.floor(r() * A.sitios.length)].clone().add(vec(0, 0.08, 0));
      const nrm = vec().subVectors(p, A.centroCopa).normalize().lerp(vec(0, 1, 0), 0.5);
      tarjeta(S.m.flor, p, nrm, 0.2, { celda: 'flor-amarilla', giro: r() * 6, viento: 0.04 });
      S.punto('flor', p);
      if (i % 2 === 0) {
        const q = p.clone().add(vec((r() - 0.5) * 0.2, -0.12, (r() - 0.5) * 0.2));
        bola(S.m.fruto, q, 0.05, { color: '#7a9a4a', segs: S.detalle ? 4 : 6, viento: 0.04 });
        S.punto('fruto', q.x, q.y + 0.05, q.z);
      }
    }
    return { alto: 7, ancho: 5 };
  },

  'palma-cola-pez'(S, r, x, y, z) {
    const top = troncoTubo(S, r, x, y, z, 8.2, 0.19, 0.14, ['#5e5848', '#7a7462', '#9a927c'], { segs: 9, curva: 0.25, anillos: 30 });
    const d = S.detalle, nF = 9;
    for (let k = 0; k < nF; k++) {
      const a = (k / nF) * Math.PI * 2 + r() * 0.35, L = 3.4 + r() * 1.0, sube = 0.55 + r() * 0.35;
      const dirH = vec(Math.cos(a), 0, Math.sin(a));
      const p0 = top.clone().add(vec(0, 0.1, 0)), p1 = p0.clone().addScaledVector(dirH, L * 0.45).add(vec(0, L * sube, 0)), p2 = p0.clone().addScaledVector(dirH, L).add(vec(0, L * (sube - 0.75), 0));
      const n = d ? 5 : 9, pts = [], rad = [];
      for (let i = 0; i <= n; i++) { pts.push(bezier(p0, p1, p2, i / n)); rad.push(0.055 * (1 - (i / n) * 0.75)); }
      tubo(S.m.hoja, pts, rad, { segs: d ? 3 : 5, color: '#4a6a2a', viento: (t) => 0.02 + t * t * 0.12 });
      // las pinnas (hojas de segundo orden), a los dos lados del raquis, con sus foliolos en cola de pez
      const nP = d ? 6 : 11;
      for (let i = 0; i < nP; i++) {
        const t = 0.14 + (i / nP) * 0.84, p = bezier(p0, p1, p2, t);
        const tg = vec().subVectors(bezier(p0, p1, p2, Math.min(1, t + 0.02)), p).normalize();
        const lado = vec().crossVectors(tg, vec(0, 1, 0)).normalize();
        const largo = (1.25 - t * 0.55) * (d ? 1.25 : 1), ancho = largo * 0.58;
        for (const s of [-1, 1]) {
          const dir = lado.clone().multiplyScalar(s).addScaledVector(tg, 0.75).normalize();
          const lad2 = vec().crossVectors(dir, vec(0, 1, 0)).normalize();
          tira(S.m.hoja, p, dir, lad2, largo, ancho, { pasos: d ? 1 : 2, caida: largo * 0.35, celda: 'cola-pez', color: tono(VERDES, 0.4 + r() * 0.45), viento: 0.03 + t * t * 0.12, aleteo: 0.05, pliegue: d ? 0 : 0.15 });
          const c = p.clone().addScaledVector(dir, largo * 0.4); S.punto('hoja', c.x, c.y - largo * 0.05, c.z);
        }
        S.punto('rama', p.x, p.y + 0.05, p.z);
      }
    }
    S.horquilla = 8.0;
    // los racimos colgantes de frutos (cuelgan bajo la copa)
    const nR = d ? 2 : 4;
    for (let k = 0; k < nR; k++) {
      const a = r() * 6.28, b = top.clone().add(vec(Math.cos(a) * 0.25, -0.35, Math.sin(a) * 0.25));
      for (let h = 0; h < (d ? 3 : 6); h++) {
        const off = vec((r() - 0.5) * 0.35, 0, (r() - 0.5) * 0.35), largo = 1.2 + r() * 0.6;
        const fin = b.clone().add(off).add(vec(0, -largo, 0));
        tubo(S.m.fruto, [b, b.clone().add(off.clone().multiplyScalar(0.5)).add(vec(0, -largo * 0.4, 0)), fin], 0.012, { segs: 3, color: '#6a5a3a', viento: (t) => 0.03 * t });
        for (let f = 0; f < (d ? 2 : 5); f++) {
          const q = b.clone().lerp(fin, 0.35 + f * 0.13);
          bola(S.m.fruto, q, 0.035, { color: f % 2 ? '#7a2a4a' : '#a83a3a', segs: 4, viento: 0.04 });
          S.punto('fruto', q.x, q.y + 0.035, q.z);
        }
      }
    }
    return { alto: 10, ancho: 7 };
  },

  dipteris(S, r, x, y, z) {
    const d = S.detalle;
    for (let k = 0; k < 5; k++) {
      const a = r() * 6.28, alto = 1.1 + r() * 0.6, sale = 0.18 + r() * 0.25;
      const base = vec(x + Math.cos(a) * 0.05, y, z + Math.sin(a) * 0.05);
      const fin = vec(x + Math.cos(a) * sale, y + alto, z + Math.sin(a) * sale);
      const medio = base.clone().lerp(fin, 0.5).add(vec(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05));
      const pts = [0, 0.33, 0.66, 1].map((t) => bezier(base, medio, fin, t));
      tubo(S.m.hoja, pts, [0.016, 0.013, 0.011, 0.009], { segs: d ? 3 : 4, color: '#5a4a2a', viento: (t) => t * t * 0.05 });
      // la hoja: dos medios abanicos, a los lados del tallo, algo levantados
      for (const s of [-1, 1]) {
        const dir = vec(Math.cos(a + s * 0.62), 0.32, Math.sin(a + s * 0.62)).normalize();
        const lado = vec().crossVectors(dir, vec(0, 1, 0)).normalize();
        tira(S.m.hoja, fin, dir, lado, 0.62, 0.62, { pasos: d ? 1 : 2, caida: 0.12, celda: 'abanico', color: tono(VERDES, 0.55 + r() * 0.3), viento: 0.05, aleteo: 0.04 });
        const c = fin.clone().addScaledVector(dir, 0.3); S.punto('hoja', c.x, c.y, c.z);
      }
    }
    return { alto: 2, ancho: 1.8 };
  },
  dipterocarpo(S, r, x, y, z) {
    // emergente: fuste recto y limpio hasta arriba, contrafuertes, y una copa ancha de «coliflor»
    const corteza = ['#7e786c', '#a29c8e', '#c2bcae'];
    const o = {
      alto: 16, niveles: 3, angulo: { 1: 72, 2: 52, 3: 40 }, hijos: { 0: 8, 1: 4, 2: 3 }, inicio: { 1: 0.72, 2: 0.3, 3: 0.3 },
      largo: { 0: 16, 1: 7.5, 2: 3.2, 3: 1.4 }, radio: { 0: 0.42, 1: 0.42, 2: 0.55, 3: 0.6 }, secciones: { 0: 10, 1: 6, 2: 4, 3: 3 }, segmentos: { 0: 10, 1: 6, 2: 4, 3: 3 },
      afilado: { 0: 0.55, 1: 0.65, 2: 0.7, 3: 0.8 }, retorcido: { 0: 0.015, 1: 0.12, 2: 0.2, 3: 0.25 }, fuerza: 0.012, corteza,
      hojas: { n: 3, inicio: 0.2, angulo: 50, tam: 2.3, varianza: 0.3, celda: 'ramillete', ancho: 0.9, caida: 0.1, cruz: true, colores: VERDES, pasoMedio: 3 },
    };
    const A = arbolEz(S, r, x, y, z, o);
    contrafuertes(S, r, x, y, z, 5, 2.2, 1.9, 0.42 * A.k * 0.9, corteza);
    // frutos con dos alas (dipterocarpo = «dos alas»)
    for (let i = 0; i < (S.detalle ? 6 : 16); i++) {
      const p = A.sitios[Math.floor(r() * A.sitios.length)].clone().add(vec(0, -0.15, 0));
      bola(S.m.fruto, p, 0.05, { color: '#7a4a2a', segs: 4, viento: 0.05 });
      for (const s of [-1, 1]) tira(S.m.fruto, p, vec(s * 0.3, 1, 0), vec(0, 0, 1), 0.26, 0.06, { pasos: 1, celda: 'blanco', color: '#c8463a', viento: 0.05 });
      S.punto('fruto', p.x, p.y + 0.05, p.z);
    }
    return { alto: 16, ancho: 9 };
  },
  agathis(S, r, x, y, z) {
    const corteza = ['#6a6258', '#8a8274', '#a69e8e'];
    const o = {
      alto: 13, niveles: 3, angulo: { 1: 60, 2: 48, 3: 40 }, hijos: { 0: 9, 1: 4, 2: 3 }, inicio: { 1: 0.5, 2: 0.25, 3: 0.3 },
      largo: { 0: 13, 1: 5, 2: 2.2, 3: 1 }, radio: { 0: 0.34, 1: 0.4, 2: 0.55, 3: 0.6 }, secciones: { 0: 10, 1: 6, 2: 4, 3: 3 }, segmentos: { 0: 9, 1: 5, 2: 4, 3: 3 },
      afilado: { 0: 0.6, 1: 0.7, 2: 0.75, 3: 0.8 }, retorcido: { 0: 0.01, 1: 0.1, 2: 0.15, 3: 0.2 }, fuerza: 0.03, corteza,
      hojas: { n: 3, inicio: 0.2, angulo: 45, tam: 1.35, varianza: 0.25, celda: 'agathis', ancho: 0.8, caida: 0.1, cruz: true, colores: VERDES_OSC, pasoMedio: 3 },
    };
    const A = arbolEz(S, r, x, y, z, o);
    // la corteza a manchas (se desprende en placas): unos parches claros en el tronco
    for (let i = 0; i < (S.detalle ? 0 : 14); i++) {
      const h = 0.6 + r() * 7, a = r() * 6.28, rad = 0.34 * A.k * (1 - h / 13 * 0.4) + 0.005;
      tarjeta(S.m.solido, vec(x + Math.cos(a) * rad, y + h, z + Math.sin(a) * rad), vec(Math.cos(a), 0, Math.sin(a)), 0.25 + r() * 0.2, { celda: 'blanco', color: '#b8a890' });
    }
    for (let i = 0; i < (S.detalle ? 4 : 10); i++) {
      const p = A.sitios[Math.floor(r() * A.sitios.length)].clone();
      bola(S.m.fruto, p, 0.07, { color: i % 2 ? '#6a7a3a' : '#7a5a34', segs: 5, aplastar: 1.1, viento: 0.04 });
      S.punto('fruto', p.x, p.y + 0.07, p.z);
    }
    return { alto: 13, ancho: 5 };
  },
  higuera(S, r, x, y, z) {
    // el árbol que abrazó (muerto, oscuro) y la celosía de raíces de la higuera, que sube hasta la copa
    troncoTubo(S, r, x, y, z, 6.6, 0.32, 0.26, ['#3a3228', '#4a4034', '#5a4e40'], { segs: 7 });
    const raiz = ['#8a8070', '#a69a86', '#c0b49e'].map(color), d = S.detalle;
    // (la celosía de raíces, para las lianas: se enredan por fuera de ella)
    S.pie = { alto: 6.9, r: (h) => Math.max(0.36, 1.15 - 0.8 * Math.sqrt(Math.min(1, Math.max(0, h - y) / 6.9))) + 0.1 };
    const nR = d ? 8 : 14;
    for (let k = 0; k < nR; k++) {
      const a0 = (k / nR) * Math.PI * 2, giro = (r() - 0.5) * 2.2, pts = [], rad = [];
      const n = d ? 4 : 8;
      for (let i = 0; i <= n; i++) {
        const t = i / n, a = a0 + giro * t, rr = 1.15 - 0.8 * Math.sqrt(t);
        pts.push(vec(x + Math.cos(a) * Math.max(0.36, rr), y + t * 6.9 - (t === 0 ? 0.05 : 0), z + Math.sin(a) * Math.max(0.36, rr)));
        rad.push(0.07 + (1 - t) * 0.05);
      }
      tubo(S.m.solido, pts, rad, { segs: d ? 3 : 5, color: (t, a) => tono(raiz, 0.3 + 0.4 * Math.abs(Math.sin(a + k))).multiplyScalar(0.85 + 0.15 * Math.cos(a - 0.8)) });
    }
    // la copa, sobre lo alto del tronco abrazado
    const o = {
      alto: 4.2, niveles: 3, angulo: { 1: 62, 2: 50, 3: 40 }, hijos: { 0: 7, 1: 4, 2: 3 }, inicio: { 1: 0.15, 2: 0.25, 3: 0.3 },
      largo: { 0: 3, 1: 4.4, 2: 2, 3: 0.9 }, radio: { 0: 0.3, 1: 0.5, 2: 0.6, 3: 0.6 }, secciones: { 0: 6, 1: 6, 2: 4, 3: 3 }, segmentos: { 0: 7, 1: 5, 2: 4, 3: 3 },
      afilado: { 0: 0.4, 1: 0.65, 2: 0.7, 3: 0.8 }, retorcido: { 0: 0.05, 1: 0.15, 2: 0.2, 3: 0.25 }, fuerza: 0.02, corteza: ['#8a8070', '#a69a86', '#c0b49e'],
      hojas: { n: 3, inicio: 0.2, angulo: 55, tam: 1.3, varianza: 0.3, celda: 'ramillete', ancho: 0.9, caida: 0.1, cruz: true, colores: VERDES, pasoMedio: 3 },
    };
    const A = arbolEz(S, r, x, y + 6.0, z, o);
    S.horquilla = 6.4;
    // los higos, muchos, por la copa
    for (let i = 0; i < (d ? 10 : 36); i++) {
      const p = A.sitios[Math.floor(r() * A.sitios.length)].clone().add(vec((r() - 0.5) * 0.3, -0.1, (r() - 0.5) * 0.3));
      bola(S.m.fruto, p, 0.06, { color: ['#e07a2a', '#c8322a', '#8a2a4a'][i % 3], segs: 4, viento: 0.05 });
      S.punto('fruto', p.x, p.y + 0.06, p.z);
    }
    return { alto: 10, ancho: 7 };
  },
  roble(S, r, x, y, z) {
    const o = {
      alto: 8, niveles: 3, angulo: { 1: 55, 2: 50, 3: 45 }, hijos: { 0: 6, 1: 4, 2: 3 }, inicio: { 1: 0.38, 2: 0.25, 3: 0.3 },
      largo: { 0: 5.2, 1: 3, 2: 1.5, 3: 0.8 }, radio: { 0: 0.24, 1: 0.5, 2: 0.6, 3: 0.6 }, secciones: { 0: 8, 1: 6, 2: 4, 3: 3 }, segmentos: { 0: 8, 1: 5, 2: 4, 3: 3 },
      afilado: { 0: 0.55, 1: 0.65, 2: 0.7, 3: 0.8 }, retorcido: { 0: 0.06, 1: 0.18, 2: 0.22, 3: 0.25 }, fuerza: 0.02, corteza: ['#4a3a2c', '#5e4a36', '#76603e'],
      hojas: { n: 3, inicio: 0.2, angulo: 50, tam: 1.25, varianza: 0.3, celda: 'ramillete', ancho: 0.9, caida: 0.1, cruz: true, colores: VERDES_OSC, pasoMedio: 3 },
    };
    const A = arbolEz(S, r, x, y, z, o);
    for (let i = 0; i < (S.detalle ? 8 : 22); i++) {
      const p = A.sitios[Math.floor(r() * A.sitios.length)].clone().add(vec(0, -0.06, 0));
      bola(S.m.fruto, p, 0.045, { color: '#7a5a2a', segs: 4, aplastar: 1.3, viento: 0.04 });
      S.punto('fruto', p.x, p.y + 0.05, p.z);
    }
    return { alto: 8, ancho: 5 };
  },
  'pino-apio'(S, r, x, y, z) {
    // conífera pequeña y cónica (ez-tree de tipo perenne: las ramas, más cortas cuanto más arriba)
    const o = {
      tipo: 'evergreen', alto: 4, niveles: 2, angulo: { 1: 75, 2: 45 }, hijos: { 0: 22, 1: 6 }, inicio: { 1: 0.18, 2: 0.2 },
      largo: { 0: 4, 1: 2.3, 2: 0.6 }, radio: { 0: 0.12, 1: 0.4, 2: 0.6 }, secciones: { 0: 8, 1: 5, 2: 3 }, segmentos: { 0: 6, 1: 4, 2: 3 },
      afilado: { 0: 0.9, 1: 0.8, 2: 0.8 }, retorcido: { 0: 0.02, 1: 0.08, 2: 0.15 }, fuerza: 0.02, corteza: ['#4a3a2a', '#5e4a34', '#6e5a40'],
      hojas: { n: 5, inicio: 0.1, angulo: 40, tam: 0.55, varianza: 0.25, celda: 'filoclado', ancho: 0.75, caida: 0.06, colores: VERDES_OSC, pasoMedio: 2 },
    };
    arbolEz(S, r, x, y, z, o);
    return { alto: 4, ancho: 2.2 };
  },
  rododendro(S, r, x, y, z) {
    const o = {
      alto: 1.8, niveles: 2, angulo: { 1: 32, 2: 40 }, hijos: { 0: 5, 1: 3 }, inicio: { 1: 0.05, 2: 0.4 },
      largo: { 0: 0.4, 1: 1.3, 2: 0.5 }, radio: { 0: 0.05, 1: 0.7, 2: 0.7 }, secciones: { 0: 3, 1: 5, 2: 3 }, segmentos: { 0: 5, 1: 4, 2: 3 },
      afilado: { 0: 0.3, 1: 0.6, 2: 0.7 }, retorcido: { 0: 0.05, 1: 0.15, 2: 0.2 }, fuerza: 0.03, corteza: ['#4a3a2c', '#5a4434', '#6a5440'],
      hojas: { n: 9, inicio: 0.55, angulo: 65, tam: 0.3, varianza: 0.2, celda: 'pala', ancho: 0.38, caida: 0.04, colores: VERDES_OSC, pasoMedio: 2 },
    };
    const A = arbolEz(S, r, x, y, z, o);
    // los ramos de flores rojas en tubo, en las puntas
    for (const p of A.puntas) {
      const q = p.clone().add(vec(0, 0.06, 0));
      for (let k = 0; k < (S.detalle ? 1 : 2); k++) tarjeta(S.m.flor, q, vec(Math.cos(k * 1.6), 0.25, Math.sin(k * 1.6)), 0.15, { celda: 'flor-roja', viento: 0.03, giro: Math.PI });
      S.punto('flor', q.x, q.y + 0.08, q.z);
    }
    return { alto: 1.8, ancho: 1.8 };
  },
  pinanga(S, r, x, y, z) {
    const d = S.detalle;
    for (let k = 0; k < 4; k++) {
      const a = k * 1.6 + r(), bx = x + Math.cos(a) * 0.25, bz = z + Math.sin(a) * 0.25, alto = 1.6 + r() * 0.8;
      const top = troncoTubo(S, r, bx, y, bz, alto, 0.035, 0.028, ['#4a6a2a', '#5a7a3a', '#6a8a48'], { segs: 5, curva: 0.1, anillos: 12 });
      for (let h = 0; h < 4; h++) {
        const b = h * 1.57 + r() * 0.5, dir = vec(Math.cos(b), 0.9, Math.sin(b)).normalize();
        tira(S.m.hoja, top, dir, vec(-Math.sin(b), 0, Math.cos(b)), 1.0, 0.62, { pasos: d ? 2 : 4, caida: 0.55, celda: 'pinnada', color: tono(VERDES, 0.45 + r() * 0.35), viento: 0.04, aleteo: 0.06 });
        const c = top.clone().addScaledVector(dir, 0.45); S.punto('hoja', c.x, c.y - 0.12, c.z);
      }
      for (let f = 0; f < (d ? 2 : 5); f++) {
        const q = vec(bx + 0.05, y + alto * 0.75 - f * 0.06, bz);
        bola(S.m.fruto, q, 0.025, { color: f % 2 ? '#c8322a' : '#2a1a1a', segs: 4 });
        S.punto('fruto', q.x, q.y + 0.025, q.z);
      }
    }
    return { alto: 3, ancho: 2 };
  },
  jengibre(S, r, x, y, z) {
    const d = S.detalle;
    for (let k = 0; k < 7; k++) {
      const a = r() * 6.28, bx = x + Math.cos(a) * 0.35, bz = z + Math.sin(a) * 0.35, alto = 2 + r() * 1;
      const top = troncoTubo(S, r, bx, y, bz, alto, 0.025, 0.018, ['#3a6a2a', '#4a7a30', '#5a8a3a'], { segs: 4, curva: 0.15, tipo: 'hoja', viento: 0.06 });
      // las hojas, en dos filas a lo largo de la caña
      const lado = r() * 6.28;
      for (let h = 0; h < (d ? 4 : 8); h++) {
        const t = 0.3 + (h / 8) * 0.68, p = vec(bx, y + alto * t, bz).lerp(top, t * t * 0.2);
        const b = lado + (h % 2 ? Math.PI : 0), dir = vec(Math.cos(b), 0.35, Math.sin(b)).normalize();
        tira(S.m.hoja, p, dir, vec(-Math.sin(b), 0, Math.cos(b)), 0.75, 0.2, { pasos: d ? 1 : 3, caida: 0.18, celda: 'pala', color: tono(VERDES, 0.4 + r() * 0.4), viento: 0.04 + t * 0.04, aleteo: 0.05, pliegue: d ? 0 : 0.2 });
        const c = p.clone().addScaledVector(dir, 0.35); S.punto('hoja', c.x, c.y, c.z);
      }
    }
    // la antorcha: un tallo propio que sale del suelo, con la cabeza de brácteas rojas
    for (let k = 0; k < 2; k++) {
      const a = r() * 6.28, fx = x + Math.cos(a) * 0.7, fz = z + Math.sin(a) * 0.7, alto = 1 + r() * 0.3;
      tubo(S.m.flor, [vec(fx, y, fz), vec(fx, y + alto * 0.5, fz), vec(fx, y + alto, fz)], 0.018, { segs: 4, color: '#5a7a3a' });
      const c = vec(fx, y + alto, fz);
      torno(S.m.flor, c, [[0.02, 0], [0.09, 0.05], [0.1, 0.11], [0.07, 0.18], [0.02, 0.24]], { segs: d ? 6 : 9, color: (t) => mezcla('#e0283a', '#f87a8a', t) });
      for (let b = 0; b < (d ? 5 : 9); b++) { const g = (b / 9) * 6.28; tira(S.m.flor, c.clone().add(vec(0, 0.02, 0)), vec(Math.cos(g), -0.15, Math.sin(g)), vec(-Math.sin(g), 0, Math.cos(g)), 0.16, 0.09, { pasos: 1, celda: 'blanco', color: '#d81e30' }); }
      S.punto('flor', c.x, c.y + 0.24, c.z);
    }
    return { alto: 3.4, ancho: 2 };
  },
  phrynium(S, r, x, y, z) {
    const d = S.detalle;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * 6.28 + r() * 0.4, alto = 0.8 + r() * 0.5;
      const ex = x + Math.cos(a) * 0.25, ez = z + Math.sin(a) * 0.25, fin = vec(ex, y + alto, ez);
      tubo(S.m.hoja, [vec(x, y, z), vec(x + Math.cos(a) * 0.1, y + alto * 0.5, z + Math.sin(a) * 0.1), fin], 0.012, { segs: 3, color: '#4a6a2a', viento: (t) => t * t * 0.04 });
      const dir = vec(Math.cos(a), 0.45, Math.sin(a)).normalize();
      tira(S.m.hoja, fin, dir, vec(-Math.sin(a), 0, Math.cos(a)), 0.78, 0.38, { pasos: d ? 1 : 3, caida: 0.22, celda: 'pala', color: tono(VERDES, 0.45 + r() * 0.4), viento: 0.04, aleteo: 0.05, pliegue: d ? 0 : 0.18 });
      const c = fin.clone().addScaledVector(dir, 0.35); S.punto('hoja', c.x, c.y, c.z);
    }
    return { alto: 1.6, ancho: 2 };
  },
  'cuerno-alce'(S, r, x, y, z) {
    const d = S.detalle;
    troncoTubo(S, r, x, y, z, 3.5, 0.3, 0.26, ['#5a5044', '#6e6252', '#8a7c66'], { segs: 8 });
    const h = y + 2.2, c = vec(x + 0.32, h, z);
    // el «nido»: frondas en escudo, de pie alrededor del tronco, verdes y pardas
    for (let i = 0; i < (d ? 4 : 8); i++) {
      const a = -1.2 + (i / 7) * 2.4, dir = vec(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.6).normalize();
      tira(S.m.hoja, c.clone().add(vec(Math.cos(a) * 0.05, -0.15, Math.sin(a) * 0.25)), dir, vec(-Math.sin(a), 0, Math.cos(a)), 0.8, 0.62, { pasos: d ? 1 : 2, caida: -0.1, celda: 'teja', color: tono(['#6a7a3a', '#8a7a3a', '#9a8a4a'], r()), viento: 0.01 });
    }
    // las frondas en cuerno que cuelgan, partidas
    for (let k = 0; k < (d ? 4 : 7); k++) {
      const a = -0.9 + (k / 6) * 1.8, dir = vec(Math.cos(a), -0.35, Math.sin(a)).normalize();
      tira(S.m.hoja, c.clone().add(vec(0.08, -0.1, Math.sin(a) * 0.1)), dir, vec(-Math.sin(a), 0, Math.cos(a)), 1.5, 0.95, { pasos: d ? 2 : 4, caida: 0.95, celda: 'cuerno', color: tono(VERDES, 0.6 + r() * 0.3), viento: 0.03, aleteo: 0.08 });
      const q = c.clone().addScaledVector(dir, 0.4); S.punto('hoja', q.x, q.y, q.z);
    }
    S.horquilla = 2.2;
    return { alto: 3.5, ancho: 2 };
  },
  trepadora(S, r, x, y, z) {
    troncoTubo(S, r, x, y, z, 4, 0.27, 0.24, ['#5a5044', '#6e6252', '#8a7c66'], { segs: 8 });
    // las hojas en teja, pegadas al tronco en espiral
    for (let i = 0; i < (S.detalle ? 12 : 26); i++) {
      const b = i * 0.55, hh = y + 0.25 + i * 0.14 * (S.detalle ? 2.1 : 1), rad = 0.3 - (hh - y) / 4 * 0.03;
      const n = vec(Math.cos(b), 0, Math.sin(b));
      tira(S.m.hoja, vec(x + n.x * rad, hh - 0.08, z + n.z * rad), vec(0, 1, 0).addScaledVector(n, 0.15).normalize(), vec(-Math.sin(b), 0, Math.cos(b)), 0.34, 0.25, { pasos: 1, celda: 'teja', color: tono(VERDES, 0.35 + (i % 3) * 0.2), viento: 0.005 });
      S.punto('hoja', x + n.x * (rad + 0.03), hh, z + n.z * (rad + 0.03));
    }
    return { alto: 4, ancho: 1 };
  },
  orquidea(S, r, x, y, z) {
    const d = S.detalle;
    // la rama en la que vive
    tubo(S.m.solido, [vec(x - 1.2, y + 1.5, z), vec(x, y + 1.62, z), vec(x + 1.2, y + 1.7, z)], 0.11, { segs: 6, color: (t, a) => tono(['#4e4234', '#5e5040', '#6e5e4a'], 0.5 + 0.3 * Math.sin(a * 3)).multiplyScalar(0.85 + 0.15 * Math.cos(a - 0.8)) });
    for (let k = 0; k < (d ? 5 : 9); k++) {
      const bx = x - 0.4 + r() * 0.8, base = vec(bx, y + 1.68, z), fin = vec(bx + (r() - 0.5) * 0.3, y + 2.5, z + (r() - 0.5) * 0.3);
      tubo(S.m.hoja, [base, base.clone().lerp(fin, 0.5), fin], [0.035, 0.03, 0.02], { segs: 4, color: '#8a9a3a', viento: (t) => t * 0.03 });
      for (let h = 0; h < 3; h++) {
        const b = r() * 6.28, dir = vec(Math.cos(b), 0.7, Math.sin(b)).normalize(), p = base.clone().lerp(fin, 0.65 + h * 0.12);
        tira(S.m.hoja, p, dir, vec(-Math.sin(b), 0, Math.cos(b)), 0.62, 0.09, { pasos: d ? 1 : 3, caida: 0.32, celda: 'pala', color: tono(VERDES, 0.55 + r() * 0.3), viento: 0.04, aleteo: 0.05 });
      }
      S.punto('hoja', fin.x, fin.y, fin.z);
    }
    // las varas de flores, que cuelgan
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1, base = vec(x + Math.cos(a) * 0.3, y + 1.8, z + Math.sin(a) * 0.3), fin = vec(base.x + Math.cos(a) * 0.8, y + 1.0, base.z + Math.sin(a) * 0.8);
      const medio = base.clone().lerp(fin, 0.5).add(vec(0, 0.25, 0));
      tubo(S.m.flor, [0, 0.25, 0.5, 0.75, 1].map((t) => bezier(base, medio, fin, t)), 0.012, { segs: 3, color: '#6a7a3a', viento: (t) => t * 0.05 });
      for (let f = 0; f < (d ? 3 : 6); f++) {
        const p = bezier(base, medio, fin, (f + 0.5) / 6);
        tarjeta(S.m.flor, p, vec(Math.cos(a), 0.4, Math.sin(a)), 0.13, { celda: 'flor-orquidea', giro: r() * 6, viento: 0.04 });
        S.punto('flor', p.x, p.y + 0.02, p.z);
      }
    }
    return { alto: 3, ancho: 2.5 };
  },
  nepenthes(S, r, x, y, z) {
    const d = S.detalle;
    let p = vec(x, y, z);
    for (let i = 0; i < 6; i++) {
      const q = vec(p.x + (r() - 0.5) * 0.4, p.y + 0.35, p.z + (r() - 0.5) * 0.4);
      tubo(S.m.hoja, [p, q], 0.018, { segs: 4, color: '#6a8a2a', viento: (t) => 0.01 + (i + t) * 0.005 });
      const a = r() * 6.28, dir = vec(Math.cos(a), 0.15, Math.sin(a)).normalize();
      tira(S.m.hoja, q, dir, vec(-Math.sin(a), 0, Math.cos(a)), 0.45, 0.13, { pasos: d ? 1 : 2, caida: 0.06, celda: 'pala', color: tono(['#5a7a2a', '#7a9a3a', '#9aa848'], r()), viento: 0.03 });
      // el zarcillo hasta la jarra
      const ini = q.clone().addScaledVector(dir, 0.45), fin = vec(q.x + Math.cos(a) * 0.65, q.y - 0.15, q.z + Math.sin(a) * 0.65);
      tubo(S.m.hoja, [ini, ini.clone().lerp(fin, 0.5).add(vec(0, 0.05, 0)), fin], 0.006, { segs: 3, color: '#6a8a2a' });
      jarra(S, fin.x, fin.y - 0.33, fin.z, 0.11, 0.32, ['#8a9a2a', '#a83a2a'], r);
      p = q;
    }
    return { alto: 2.4, ancho: 2 };
  },
  'nepenthes-rajah'(S, r, x, y, z) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 6.28, dir = vec(Math.cos(a), 0.12, Math.sin(a)).normalize();
      tira(S.m.hoja, vec(x, y + 0.05, z), dir, vec(-Math.sin(a), 0, Math.cos(a)), 0.82, 0.24, { pasos: S.detalle ? 1 : 3, caida: 0.08, celda: 'pala', color: tono(['#4a6a2a', '#6a8a3a', '#8aa04a'], r()), viento: 0.01 });
    }
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.5; jarra(S, x + Math.cos(a) * 0.75, y, z + Math.sin(a) * 0.75, 0.24, 0.5, ['#8a2a2a', '#c8402a'], r); }
    return { alto: 1, ancho: 2.2 };
  },
  // las lianas, en el editor y la galería: con su trozo de tronco (en el mundo, en árboles de verdad)
  tetrastigma(S, r, x, y, z) {
    troncoTubo(S, r, x, y, z, 6, 0.32, 0.27, ['#5a5044', '#6e6252', '#8a7c66'], { segs: 8 });
    lianaTrepando(S, r, 'tetrastigma', x, y, z, 6, 0.3);
    // y la rafflesia, saliendo de su raíz al pie del árbol
    PLANTA.rafflesia(S, r, x + 1.3, y, z + 0.9);
    return { alto: 6, ancho: 3 };
  },
  enredadera(S, r, x, y, z) {
    troncoTubo(S, r, x, y, z, 4, 0.3, 0.26, ['#5a5044', '#6e6252', '#8a7c66'], { segs: 8 });
    lianaTrepando(S, r, 'enredadera', x, y, z, 4, 0.28);
    return { alto: 4, ancho: 1 };
  },
  ratan(S, r, x, y, z) {
    troncoTubo(S, r, x, y, z, 7, 0.34, 0.28, ['#5a5044', '#6e6252', '#8a7c66'], { segs: 8 });
    lianaTrepando(S, r, 'ratan', x, y, z, 7, 0.31);
    return { alto: 7, ancho: 4 };
  },
  'liana-colgante'(S, r, x, y, z) {
    for (const dx of [-2.6, 2.6]) troncoTubo(S, r, x + dx, y, z, 5, 0.26, 0.22, ['#5a5044', '#6e6252', '#8a7c66'], { segs: 8 });
    const suelo = () => y;
    lianaColgante(S, r, vec(x - 2.4, y + 4.6, z), vec(x + 2.4, y + 4.2, z), 2.6, { suelo });
    lianaColgante(S, r, vec(x - 2.4, y + 3.8, z + 0.1), vec(x + 2.4, y + 4.5, z - 0.1), 1.1, { suelo });
    // y una cortina de lianas finas colgando del árbol de la izquierda
    lianaCortina(S, r, x - 2.6, y, z, 5, 0.24, { suelo });
    return { alto: 5, ancho: 5.5 };
  },
  rafflesia(S, r, x, y, z) {
    const d = S.detalle;
    // la liana que la lleva dentro, por el suelo
    tubo(S.m.solido, [vec(x - 1.6, y + 0.05, z - 0.8), vec(x - 0.2, y + 0.07, z - 0.1), vec(x + 1.4, y + 0.08, z + 0.6)], 0.05, { segs: 5, color: '#5a4a34' });
    // cinco pétalos gruesos con verrugas blancas, algo curvados hacia arriba
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2, dir = vec(Math.cos(a), 0.05, Math.sin(a)).normalize();
      tira(S.m.flor, vec(x + Math.cos(a) * 0.16, y + 0.1, z + Math.sin(a) * 0.16), dir, vec(-Math.sin(a), 0, Math.cos(a)), 0.62, 0.58, { pasos: d ? 1 : 3, caida: -0.06, celda: 'rafflesia', color: '#ffffff', pliegue: d ? 0 : -0.1 });
    }
    // el disco del centro: una copa con el borde hacia dentro y el diafragma
    torno(S.m.flor, vec(x, y + 0.05, z), [[0.3, 0], [0.32, 0.12], [0.3, 0.2], [0.2, 0.22], [0.16, 0.16]], { segs: d ? 8 : 14, color: (t) => mezcla('#6a1a12', '#8a2216', t) });
    torno(S.m.flor, vec(x, y + 0.05, z), [[0.001, 0.09], [0.16, 0.1]], { segs: d ? 8 : 14, color: '#4a1a12' });
    S.punto('flor', x, y + 0.2, z);
    // dos capullos oscuros al lado
    for (let k = 0; k < 2; k++) bola(S.m.solido, vec(x - 0.9 - k * 0.5, y + 0.12, z - 0.4), 0.16 + k * 0.05, { color: ['#3a2216', '#5a3420'][k], segs: d ? 5 : 8, aplastar: 0.8 });
    return { alto: 0.6, ancho: 2.4 };
  },
};

/* ---------------------------------------------------------------- lianas y trepadoras
   Sueltas, para engancharlas a un árbol cualquiera (vivo/lianas.js) o a su trozo de tronco en el editor.
   tronco: el radio del tronco (un número) o una función de la altura h (en m sobre la base) que da el radio o
   { x, z, r }: el centro y el radio del tronco de verdad a esa altura (troncoDe), para que la liana lo abrace.
   alto: hasta dónde trepan (el tronco, hasta donde empieza la copa).
   - lianaTrepando(S, r, tipo, x, y, z, alto, tronco, { suelo }): 'tetrastigma' (leñosa y gruesa, en espiral
     floja, con racimos de 5 hojas a todo lo largo y bucles que bajan hasta la altura de la vista), 'enredadera'
     (Piper: dos tallos en espiral apretada, uno hasta la copa, cubiertos de hojas pegadas al tronco) o 'ratan'
     (palmera trepadora: una mata de hojas en pluma al pie y tallos largos que suben por el tronco y salen por
     encima del sotobosque, con hojas en pluma por todo el tallo y los zarcillos colgando);
   - lianaColgante(S, r, a, b, caida, { suelo }): de una rama (a) a otra (b), colgando en curva (caida m en el
     medio), retorcida como una escalera de mono (Bauhinia), gruesa (unos 10 cm), con hojas a todo lo largo,
     racimos de flores y tallos finos que cuelgan de ella hacia el suelo;
   - lianaCortina(S, r, x, y, z, alto, tronco, { suelo }): una cortina de lianas finas colgando de una rama
     que sale del tronco, hasta cerca del suelo, que se mece con el viento.
   suelo(x, z): la altura del suelo (para no atravesarlo al colgar); si no se da, la de la base.
   lianaTrepando y lianaCortina devuelven el punto que mejor se ve de ellas (para encuadrarlas). */
const LIANA = ['#4a3a28', '#5a4632', '#6a543a'], VERDES_LIANA = ['#30521c', '#3e6424', '#4e762a', '#628a32', '#75993a'];
const colorLiana = (fase = 0) => (t, a) => tono(LIANA, 0.45 + 0.4 * Math.sin(t * 40 + a + fase)).multiplyScalar(0.8 + 0.2 * Math.cos(a - 0.8));
const bez3 = (p0, p1, p2, p3, t) => { const u = 1 - t; return vec(0, 0, 0).addScaledVector(p0, u * u * u).addScaledVector(p1, 3 * u * u * t).addScaledVector(p2, 3 * u * t * t).addScaledVector(p3, t * t * t); };
// el tronco, como función de la altura: { x, z, r }
const ejeTronco = (tronco, x, z) => (typeof tronco === 'number' ? () => ({ x, z, r: tronco }) : (h) => { const v = tronco(h); return typeof v === 'number' ? { x, z, r: v } : v; });
// a lo largo de una curva(t), cada «cada» metros: una hoja suelta o un ramillete (una tarjeta con una ramita
// de hojas: mucho verde en dos triángulos), hacia fuera y algo hacia abajo
function hojasPorCurva(S, r, curva, largo, cada, { tam = 0.5, ramillete = 0.5, desde = 0, hasta = 1, fuera = null, viento = 0.02 } = {}) {
  const n = Math.max(1, Math.round((largo * (hasta - desde)) / cada));
  for (let i = 0; i < n; i++) {
    const t = desde + (hasta - desde) * (i + 0.3 + 0.4 * r()) / n, q = curva(t), b = r() * Math.PI * 2;
    // (hacia fuera: del tronco, si se dice; si no, a cualquier lado)
    const f = fuera ? fuera(t, q) : vec(Math.cos(b), 0, Math.sin(b));
    const dir = vec(f.x + Math.cos(b) * 0.45, (r() - 0.65) * 0.9, f.z + Math.sin(b) * 0.45).normalize(), lado = vec(-dir.z, 0, dir.x);
    if (lado.lengthSq() < 1e-4) lado.set(1, 0, 0);
    const c = tono(VERDES_LIANA, r());
    if (r() < ramillete) tira(S.m.hoja, q, dir, lado, tam * 1.6, tam * 1.3, { pasos: 1, caida: 0.1, celda: 'ramillete', color: c, viento, aleteo: 0.05 });
    else tira(S.m.hoja, q, dir, lado, tam * 0.75, tam * 0.55, { pasos: 1, caida: 0.06, celda: 'pala', color: c, viento, aleteo: 0.05 });
  }
}
// un tallo que cuelga de p hasta la altura yFin, algo torcido, con hojas por el camino y un penacho en la punta
// (se mece más cuanto más abajo); verde: tallo tierno, no leñoso
function colgajo(S, r, p, yFin, radio, { hojas = 0.9, tam = 0.36, verde = false } = {}) {
  const largo = p.y - yFin;
  if (largo < 0.6) return;
  const n = Math.max(3, Math.min(9, Math.round(largo / 1.4))), dx = (r() - 0.5) * 0.5, dz = (r() - 0.5) * 0.5, pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push(vec(p.x + dx * t * t + Math.sin(t * 5 + dx * 9) * 0.06, p.y - largo * t, p.z + dz * t * t + Math.cos(t * 4 + dz * 9) * 0.06)); }
  tubo(S.m.solido, pts, pts.map((_, i) => radio * (1 - 0.5 * i / n)), { segs: 3, color: verde ? (t) => tono(['#3e4a22', '#4e5a28', '#5a6630'], 0.3 + 0.6 * t) : colorLiana(dx * 10), viento: (t) => 0.005 + 0.1 * t * t });
  const curva = (t) => { const k = Math.min(n - 1e-6, t * n), i = Math.floor(k); return pts[i].clone().lerp(pts[i + 1], k - i); };
  if (!hojas) return;
  hojasPorCurva(S, r, curva, largo, 1 / hojas, { tam, ramillete: 0.35, desde: 0.1, viento: 0.06 });
  // (el penacho de la punta: dos ramilletes colgando)
  const fin = pts[n];
  for (let j = 0; j < 2; j++) { const b = r() * Math.PI * 2, dir = vec(Math.cos(b) * 0.5, -1, Math.sin(b) * 0.5).normalize(); tira(S.m.hoja, fin, dir, vec(-Math.sin(b), 0, Math.cos(b)), tam * 1.7, tam * 1.4, { pasos: 1, celda: 'ramillete', color: tono(VERDES_LIANA, 0.4 + 0.6 * r()), viento: 0.1, aleteo: 0.05 }); }
}
export function lianaTrepando(S, r, tipo, x, y, z, alto, tronco, { suelo = null } = {}) {
  const C = ejeTronco(tronco, x, z), sueloEn = suelo || (() => y), d = S.detalle, a0 = r() * Math.PI * 2;
  // un punto alrededor del tronco, a h m de la base, en el ángulo a y a «sobra» m de la corteza
  const junto = (h, a, sobra) => { const c = C(h); return vec(c.x + Math.cos(a) * (c.r + sobra), y + h, c.z + Math.sin(a) * (c.r + sobra)); };
  const fuera = (t, q) => { const c = C(q.y - y); return vec(q.x - c.x, 0, q.z - c.z).normalize(); };
  if (tipo === 'tetrastigma') {
    // el tallo: sale del suelo a medio metro, da vuelta y media al tronco y llega a la copa
    const pts = [], radios = [], n = d ? 10 : 24, vueltas = 1.3 + r() * 0.5;
    pts.push(junto(0, a0, 0.6).setY(y - 0.05)); radios.push(0.1);
    const tallo = (t) => junto(0.3 + t * (alto - 0.3), a0 + t * vueltas * Math.PI * 2, 0.08 + 0.04 * Math.sin(t * 9));
    for (let i = 0; i <= n; i++) { pts.push(tallo(i / n)); radios.push(0.095 - (i / n) * 0.045); }
    tubo(S.m.solido, pts, radios, { segs: d ? 5 : 7, color: colorLiana() });
    // racimos de cinco hojas (hojas compuestas, como la vid) a todo lo largo del tallo
    const racimo = (q, sale) => {
      for (let j = 0; j < 5; j++) {
        const b = (j / 5) * Math.PI * 2 + r(), dir = vec(Math.cos(b) * 0.7 + sale.x, -0.15, Math.sin(b) * 0.7 + sale.z).normalize();
        tira(S.m.hoja, q, dir, vec(-dir.z, 0, dir.x), 0.5, 0.25, { pasos: 1, caida: 0.08, celda: 'pala', color: tono(VERDES_LIANA, r()), viento: 0.015, aleteo: 0.04 });
      }
    };
    for (let k = 0, nk = Math.max(3, Math.round(alto / (d ? 2.4 : 1.1))); k < nk; k++) { const t = 0.04 + 0.92 * (k + r()) / nk, q = tallo(t); racimo(q, fuera(t, q)); }
    hojasPorCurva(S, r, tallo, alto * 1.3, d ? 2 : 0.8, { tam: 0.5, ramillete: 0.7, desde: 0.2, fuera });
    // bucles: tallos que se separan del tronco, bajan hasta la altura de la vista y vuelven a subir (uno o dos)
    for (let k = 0, nb = 1 + Math.floor(r() * 2); k < nb; k++) {
      const t1 = 0.35 + 0.4 * r(), t2 = Math.min(0.98, t1 + 0.15 + 0.15 * r()), p0 = tallo(t1), p3 = tallo(t2), sale = fuera(t1, p0);
      const lejos = 1.4 + r() * 1.6, abajo = sueloEn(p0.x + sale.x * lejos, p0.z + sale.z * lejos) + 1 + r() * 2;
      const p1 = p0.clone().addScaledVector(sale, lejos * 0.7).setY(abajo + 0.4), p2 = p3.clone().addScaledVector(fuera(t2, p3), lejos).setY(abajo + 0.2 + r());
      const curva = (t) => bez3(p0, p1, p2, p3, t), m = d ? 6 : 14, bp = [];
      for (let i = 0; i <= m; i++) bp.push(curva(i / m));
      tubo(S.m.solido, bp, bp.map((_, i) => 0.05 - 0.015 * Math.sin(i / m * Math.PI)), { segs: d ? 4 : 5, color: colorLiana(k) });
      const largo = bp.reduce((s, p, i) => (i ? s + p.distanceTo(bp[i - 1]) : 0), 0);
      for (let i = 1; i < (d ? 3 : 6); i++) racimo(curva(i / (d ? 3 : 6)), vec(r() - 0.5, 0, r() - 0.5).normalize());
      hojasPorCurva(S, r, curva, largo, d ? 2 : 0.8, { tam: 0.45, ramillete: 0.6 });
    }
    // y tallos finos que cuelgan de lo alto
    for (let k = 0; k < (d ? 1 : 3); k++) { const q = tallo(0.6 + 0.38 * r()); q.addScaledVector(fuera(0, q), 0.3); colgajo(S, r, q, sueloEn(q.x, q.z) + 1.5 + r() * 4, 0.022); }
    const p = tallo(0.8); S.punto('hoja', p.x, p.y, p.z);
    return tallo(0.12);
  }
  if (tipo === 'enredadera') {
    // dos tallos en espiral apretada, uno hasta la copa y otro hasta media altura, cubiertos de hojas pegadas al tronco
    for (const [hasta, fase] of [[alto * (0.92 + r() * 0.08), 0], [alto * (0.35 + r() * 0.3), Math.PI * (0.6 + r() * 0.8)]]) {
      const vueltas = hasta / 1.5, n = Math.max(8, Math.round(vueltas * (d ? 4 : 7))), pts = [];
      const curva = (t) => junto(t * hasta, a0 + fase + t * vueltas * Math.PI * 2, 0.025);
      for (let i = 0; i <= n; i++) pts.push(curva(i / n));
      tubo(S.m.solido, pts, 0.02, { segs: 3, color: '#3e4a26' });
      for (let i = 0, nh = Math.round(hasta * (d ? 3 : 10)); i < nh; i++) {
        const t = (i + 0.5) / nh, q = curva(t), n2 = fuera(t, q), lado = vec(-n2.z, 0, n2.x);
        // (hojas acorazonadas, verdes, alguna oscura con tinte morado como la Piper porphyrophyllum; más pequeñas
        // arriba), casi pegadas al tronco y de cara hacia fuera, como tejas: se ven de frente desde cualquier lado;
        // y de vez en cuando, una ramita con varias (un ramillete)
        const tam = (0.42 - 0.14 * t) * (0.8 + 0.4 * r()), c = r() < 0.2 ? tono(['#2a2e22', '#3a3428', '#3e3a2c'], r()) : tono(VERDES_LIANA, 0.3 + 0.7 * r());
        const dir = vec(0, 1, 0).addScaledVector(n2, 0.3 + 0.3 * r()).addScaledVector(lado, (r() - 0.5) * 1.4).normalize();
        if (i % 4 === 3) tira(S.m.hoja, q, dir, lado, tam * 2, tam * 1.6, { pasos: 1, caida: 0.05, celda: 'ramillete', color: c, viento: 0.012, aleteo: 0.03 });
        else tira(S.m.hoja, q, dir, lado, tam, tam * 0.85, { pasos: 1, caida: 0.04, celda: 'pala', color: c, viento: 0.008, aleteo: 0.02 });
      }
    }
    const p = junto(alto * 0.4, a0, 0.03); S.punto('hoja', p.x, p.y, p.z);
    return junto(Math.min(2, alto * 0.3), a0, 0.03);
  }
  if (tipo === 'ratan') {
    // una hoja en pluma (con su raquis que sigue en un zarcillo con garfios, el cirro, colgando de la punta)
    const pluma = (p, dir, largo, ancho, caida) => {
      const lado = vec(-dir.z, 0, dir.x).normalize(), abajo = vec().crossVectors(dir, lado).normalize();
      if (abajo.y > 0) abajo.negate();
      tira(S.m.hoja, p, dir, lado, largo, ancho, { pasos: d ? 2 : 4, caida, celda: 'pinnada', color: tono(VERDES_LIANA, 0.35 + r() * 0.6), viento: 0.03, aleteo: 0.12 });
      // (la punta de la hoja, como la pone tira)
      const fin = p.clone().addScaledVector(dir, largo).addScaledVector(abajo, -caida), h = vec(dir.x, 0, dir.z).normalize();
      tubo(S.m.solido, [fin, fin.clone().addScaledVector(h, 0.35).add(vec(0, -0.15, 0)), fin.clone().addScaledVector(h, 0.55).add(vec(0, -0.7 - r() * 0.6, 0))], [0.01, 0.008, 0.004], { segs: 3, color: '#6e6a34', viento: (t) => 0.03 + 0.08 * t });
    };
    // la mata al pie: hojas en pluma de 2 a 3 m arqueadas desde vainas con espinas, como una palmera sin tronco
    const am = a0 + 0.4, mata = junto(0, am, 1.1);
    for (let k = 0, nh = d ? 4 : 7; k < nh; k++) {
      const b = (k / nh) * Math.PI * 2 + r() * 0.5, dir = vec(Math.cos(b), 0.7 + r() * 0.5, Math.sin(b)).normalize();
      const base = mata.clone().add(vec(Math.cos(b) * 0.12, 0.5 + r() * 0.4, Math.sin(b) * 0.12));
      tubo(S.m.solido, [mata.clone().add(vec(Math.cos(b) * 0.04, 0, Math.sin(b) * 0.04)), base], 0.045, { segs: 4, color: (t, a) => tono(['#5a5a2e', '#3e3a1e', '#6e6a34'], 0.5 + 0.5 * Math.sin(a * 7 + t * 20)) });
      pluma(base, dir, 2 + r() * 0.9, 0.95, -0.4 - r() * 0.3);
    }
    // de 2 a 3 tallos desde la mata, por el tronco arriba, que al final se separan de él y salen por encima del sotobosque
    for (let k = 0, nt = 2 + Math.floor(r() * 2); k < nt; k++) {
      const a = a0 + (k - nt / 2) * 0.7, pts = [], n = d ? 8 : 18, cima = Math.max(4, alto * (0.6 + 0.4 * r())), sale = 1.5 + r() * 2;
      for (let i = 0; i <= n; i++) {
        const t = i / n, h = t * cima - Math.max(0, (t - 0.85) / 0.15) ** 2 * 0.6;
        pts.push(junto(h, a + t * 0.6, 0.12 + (1 - t) ** 2 * 0.9 + Math.max(0, (t - 0.6) / 0.4) ** 2 * sale));
      }
      pts[0].copy(mata);
      tubo(S.m.solido, pts, pts.map((_, i) => 0.05 - 0.015 * i / n), { segs: d ? 4 : 5, color: (t, an) => tono(['#5a5a2e', '#6e6a34', '#4e4e28'], 0.5 + 0.5 * Math.sin(t * 60 + an * 3)) });
      // hojas en pluma por todo el tallo (desde la altura de la vista), cada metro y pico, hacia fuera y arriba
      const nh = Math.max(3, Math.round(cima * 0.8 / (d ? 2.2 : 1.1)));
      for (let i = 0; i < nh; i++) {
        const t = 0.2 + 0.8 * (i + 0.5) / nh, p = pts[Math.min(n, Math.round(t * n))], b = a + t * 0.6 + (i % 2 ? 1 : -1) * (0.6 + r() * 0.6);
        pluma(p, vec(Math.cos(b), 0.3 + r() * 0.5, Math.sin(b)).normalize(), 1.4 + r() * 0.8, 0.75, -0.3 - r() * 0.3);
      }
      // y en la punta, un látigo (flagelo) largo que cuelga
      const fin = pts[n], f = vec(Math.cos(a), 0, Math.sin(a));
      tubo(S.m.solido, [fin, fin.clone().addScaledVector(f, 0.9).add(vec(0, -0.8, 0)), fin.clone().addScaledVector(f, 1.4).add(vec(0, -2.4, 0))], [0.016, 0.012, 0.007], { segs: 3, color: '#6e6a34', viento: (t) => 0.02 + 0.1 * t });
      S.punto('hoja', fin.x, fin.y, fin.z);
    }
    return mata.clone().add(vec(0, 1.2, 0));
  }
}
export function lianaColgante(S, r, a, b, caida = 1.5, { suelo = null, grosor = 0.055 } = {}) {
  const d = S.detalle, largoCurva = a.distanceTo(b) + caida * 2.2, n = Math.max(d ? 10 : 18, Math.min(d ? 20 : 48, Math.round(largoCurva / (d ? 1.2 : 0.5)))), gira = r() * 6;
  const sueloEn = suelo || (() => Math.min(a.y, b.y) - caida - 3);
  const curva = (t) => vec(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - caida * 4 * t * (1 - t), a.z + (b.z - a.z) * t);
  // dos hebras retorcidas una con otra (la «escalera de mono»), de unos 10 cm las dos, más gruesas en los extremos
  for (const fase of [0, Math.PI]) {
    const pts = [], radios = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, c = curva(t), g = t * largoCurva * 1.6 + gira + fase, w = grosor * 0.8 * Math.sin(g);
      pts.push(c.add(vec(w, grosor * 0.6 * Math.cos(g), -w * 0.5))); radios.push(grosor * (0.6 - 0.15 * Math.sin(t * Math.PI)));
    }
    tubo(S.m.solido, pts, radios, { segs: d ? 4 : 5, color: colorLiana(fase) });
  }
  // hojas a todo lo largo
  hojasPorCurva(S, r, curva, largoCurva, d ? 1.6 : 0.55, { tam: 0.45, ramillete: 0.45, desde: 0.03, hasta: 0.97 });
  // racimos de flores naranjas y amarillas, colgando
  for (let k = 0; k < (d ? 2 : 5); k++) {
    const q = curva(0.15 + 0.7 * r());
    for (let j = 0; j < 3; j++) tarjeta(S.m.flor, q.clone().add(vec((r() - 0.5) * 0.25, -0.12 - r() * 0.15, (r() - 0.5) * 0.25)), vec(r() - 0.5, 0.6, r() - 0.5), 0.18, { celda: 'flor-roja', color: ['#ff9a3a', '#ffb43a', '#ff7a2a'][j], viento: 0.03 });
    S.punto('flor', q.x, q.y - 0.15, q.z);
  }
  // y de 2 a 4 tallos finos que cuelgan de ella, unos hasta la altura de la vista y otros casi hasta el suelo
  for (let k = 0, nc = (d ? 1 : 2) + Math.floor(r() * 3); k < nc; k++) {
    const q = curva(0.12 + 0.76 * r());
    colgajo(S, r, q, sueloEn(q.x, q.z) + (r() < 0.4 ? 0.4 + r() * 0.8 : 1.6 + r() * 2.5), grosor * 0.35);
  }
  const m = curva(0.5); S.punto('hoja', m.x, m.y, m.z);
}
export function lianaCortina(S, r, x, y, z, alto, tronco, { suelo = null } = {}) {
  const C = ejeTronco(tronco, x, z), sueloEn = suelo || (() => y), d = S.detalle;
  // la rama de la que cuelga: un tallo leñoso que sale del tronco cerca de la copa y se aleja de 2 a 4 m en arco
  const a = r() * Math.PI * 2, h = alto * (0.7 + 0.3 * r()), lejos = 2 + r() * 2, ux = Math.cos(a), uz = Math.sin(a), gx = -uz * (r() - 0.5) * 1.6, gz = ux * (r() - 0.5) * 1.6;
  const c = C(h), p0 = vec(c.x + ux * c.r, y + h, c.z + uz * c.r), p3 = vec(c.x + ux * lejos + gx, y + h - 0.6 - r() * 1, c.z + uz * lejos + gz);
  const p1 = p0.clone().lerp(p3, 0.33).add(vec(0, 0.6, 0)), p2 = p0.clone().lerp(p3, 0.66).add(vec(0, 0.3, 0)), rama = (t) => bez3(p0, p1, p2, p3, t);
  const rp = []; for (let i = 0; i <= (d ? 4 : 8); i++) rp.push(rama(i / (d ? 4 : 8)));
  tubo(S.m.solido, rp, rp.map((_, i) => 0.06 - 0.03 * i / rp.length), { segs: d ? 4 : 5, color: colorLiana() });
  hojasPorCurva(S, r, rama, lejos, d ? 0.8 : 0.25, { tam: 0.55, ramillete: 0.8 });
  // y la cortina: de 16 a 28 tallos finos, de la mitad de fuera de la rama hasta cerca del suelo
  for (let k = 0, nc = d ? 8 : 16 + Math.floor(r() * 13); k < nc; k++) {
    const q = rama(0.25 + 0.75 * r());
    colgajo(S, r, q, sueloEn(q.x, q.z) + (r() < 0.35 ? 0.2 + r() * 0.5 : 0.8 + r() * 2.8), 0.012 + r() * 0.008, { hojas: 1.5, tam: 0.38, verde: true });
  }
  const q = rama(0.6); S.punto('hoja', q.x, q.y, q.z);
  return rama(0.75);
}

// la rafflesia suelta (vivo/lianas.js la pone al pie de su Tetrastigma)
export const rafflesiaEn = (S, r, x, y, z) => PLANTA.rafflesia(S, r, x, y, z);

// una jarra de planta carnívora: pieza de revolución, verde abajo y roja arriba, con boca y tapa
function jarra(S, x, y, z, radio, alto, colores, r) {
  const segs = S.detalle ? 6 : 10;
  const perfil = [[radio * 0.35, 0], [radio * 0.85, alto * 0.12], [radio, alto * 0.35], [radio * 0.82, alto * 0.62], [radio * 0.72, alto * 0.85], [radio * 0.8, alto]];
  torno(S.m.hoja, vec(x, y, z), perfil, { segs, color: (t) => tono(colores.map(color), Math.min(0.99, t * 0.8 + r() * 0.1)), tapaAbajo: true });
  // la boca (el peristoma rojo) y la tapa
  torno(S.m.flor, vec(x, y + alto, z), [[radio * 0.82, -0.01], [radio * 0.95, 0.012], [radio * 0.7, 0.02]], { segs, color: '#d82a2a' });
  tira(S.m.hoja, vec(x - radio * 0.7, y + alto + 0.01, z), vec(0.35, 1, 0), vec(0, 0, 1), radio * 1.4, radio * 1.4, { pasos: 1, celda: 'teja', color: colores[1] });
  S.punto('flor', x + radio * 0.8, y + alto + 0.015, z);
}

/* ---------------------------------------------------------------- setas */
const sombrero = (S, tipo, c, radio, alto, col, { debajo = null, segs = 10, hundido = 0 } = {}) => {
  const perfil = [[radio * 0.12, 0], [radio, alto * 0.05], [radio * 0.96, alto * 0.35], [radio * 0.75, alto * 0.75], [radio * 0.4, alto * (0.98 - hundido)], [0.001, alto * (1 - hundido * 1.4)]];
  torno(S.m[tipo], c, perfil, { segs: S.detalle ? 6 : segs, color: col });
  if (debajo) torno(S.m[tipo === 'brillo' ? 'brillo' : 'solido'], c.clone().add(vec(0, 0.002, 0)), [[radio * 0.98, alto * 0.04], [radio * 0.1, 0]], { segs: S.detalle ? 6 : segs, color: debajo });
};
const pie = (S, c, alto, grosor, col, segs = 6) => torno(S.m.solido, c, [[grosor * 0.6, 0], [grosor * 0.55, alto * 0.5], [grosor * 0.45, alto]], { segs: S.detalle ? 4 : segs, color: col });
const tronquito = (S, x, y, z, largo, c = '#5a4632') => tubo(S.m.solido, [vec(x - largo / 2, y + 0.12, z), vec(x, y + 0.13, z), vec(x + largo / 2, y + 0.12, z)], 0.12, { segs: S.detalle ? 5 : 8, color: (t, a) => mezcla(c, '#6e5640', 0.5 + 0.5 * Math.sin(t * 25)).multiplyScalar(0.8 + 0.2 * Math.cos(a - 0.8)) });

const SETA = {
  amanita(S, r, x, y, z) {
    for (const [dx, dz, e] of [[0, 0, 1], [0.3, 0.15, 0.7], [-0.25, 0.2, 0.55]]) {
      const c = vec(x + dx, y, z + dz);
      torno(S.m.solido, c, [[0.07 * e, 0], [0.085 * e, 0.04 * e], [0.05 * e, 0.09 * e]], { segs: 6, color: '#e8e2d2' }); // la volva
      pie(S, c, 0.42 * e, 0.07 * e, '#f0ebe0');
      const cs = c.clone().add(vec(0, 0.4 * e, 0));
      sombrero(S, 'solido', cs, 0.22 * e, 0.13 * e, (t) => mezcla('#a89070', '#c8b08a', t), { debajo: '#f2ede0' });
      for (let i = 0; i < (S.detalle ? 0 : 5); i++) { const b = r() * 6.28, d = 0.05 + r() * 0.1; bola(S.m.solido, cs.clone().add(vec(Math.cos(b) * d * e, 0.12 * e * (1 - d * 3), Math.sin(b) * d * e)), 0.018 * e, { color: '#f4f0e6', segs: 4 }); }
      S.punto('flor', cs.x, cs.y + 0.13 * e, cs.z);
    }
    return { alto: 0.7, ancho: 0.9 };
  },
  russula(S, r, x, y, z) {
    for (const [dx, dz, e] of [[0, 0, 1], [0.28, -0.1, 0.75]]) {
      const c = vec(x + dx, y, z + dz);
      pie(S, c, 0.22 * e, 0.09 * e, '#f4f0e6');
      sombrero(S, 'solido', c.clone().add(vec(0, 0.21 * e, 0)), 0.2 * e, 0.07 * e, (t) => mezcla('#a81a22', '#d8303a', t), { debajo: '#f2ece0', hundido: 0.2 });
      S.punto('flor', c.x, c.y + 0.27 * e, c.z);
    }
    return { alto: 0.4, ancho: 0.7 };
  },
  boleto(S, r, x, y, z) {
    const c = vec(x, y, z);
    torno(S.m.solido, c, [[0.07, 0], [0.065, 0.12], [0.055, 0.25]], { segs: 7, color: (t, a) => (Math.sin(a * 6 + t * 30) > 0.3 ? new THREE.Color('#b8382a') : new THREE.Color('#c8a032')) });
    sombrero(S, 'solido', c.clone().add(vec(0, 0.24, 0)), 0.22, 0.11, (t) => mezcla('#7a1a1a', '#a02a22', t), { debajo: '#e8c43a' });
    S.punto('flor', x, y + 0.35, z);
    return { alto: 0.45, ancho: 0.6 };
  },
  falo(S, r, x, y, z) {
    const c = vec(x, y, z);
    torno(S.m.solido, c, [[0.08, 0], [0.09, 0.04], [0.04, 0.08]], { segs: 7, color: '#e8dcc8' });
    pie(S, c, 0.5, 0.07, '#f4efe2');
    torno(S.m.solido, c.clone().add(vec(0, 0.46, 0)), [[0.05, 0], [0.055, 0.05], [0.035, 0.1], [0.01, 0.12]], { segs: 7, color: '#4a4a2a' });
    // la falda de encaje: un cono con la textura de red (recortada)
    torno(S.m.flor, c.clone().add(vec(0, 0.13, 0)), [[0.24, 0], [0.16, 0.14], [0.08, 0.3], [0.05, 0.34]], { segs: S.detalle ? 8 : 12, color: '#fbf8f0', celda: 'encaje' });
    S.punto('flor', x, y + 0.58, z);
    return { alto: 0.65, ancho: 0.6 };
  },
  estrella(S, r, x, y, z) {
    const c = vec(x, y, z);
    torno(S.m.solido, c, [[0.07, 0], [0.085, 0.05], [0.06, 0.11]], { segs: 7, color: '#f0e6d8' });
    torno(S.m.solido, c.clone().add(vec(0, 0.11, 0)), [[0.06, 0], [0.001, 0.01]], { segs: 7, color: '#3a2a1a' });
    // siete brazos rojos partidos en dos
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * 6.28;
      for (const s of [-1, 1]) { const b = a + s * 0.12, dir = vec(Math.cos(b), -0.08, Math.sin(b)).normalize(); tira(S.m.flor, vec(x + Math.cos(a) * 0.05, y + 0.11, z + Math.sin(a) * 0.05), dir, vec(-Math.sin(b), 0, Math.cos(b)), 0.28, 0.04, { pasos: 2, caida: 0.04, celda: 'blanco', color: '#e0241e', perfil: (t) => 1 - t * 0.6 }); }
    }
    S.punto('flor', x, y + 0.12, z);
    return { alto: 0.25, ancho: 0.8 };
  },
  copa(S, r, x, y, z) {
    tubo(S.m.solido, [vec(x - 0.6, y + 0.04, z), vec(x, y + 0.06, z + 0.05), vec(x + 0.6, y + 0.07, z + 0.1)], 0.035, { segs: 5, color: '#5a4632' });
    for (let k = 0; k < 6; k++) {
      const px = x - 0.45 + k * 0.18, pz = z + (r() - 0.5) * 0.15, e = 0.7 + r() * 0.5, c = vec(px, y + 0.06, pz);
      pie(S, c, 0.08 * e, 0.025, '#e8c8a0', 4);
      torno(S.m.flor, c.clone().add(vec(0, 0.08 * e, 0)), [[0.008, 0], [0.04 * e, 0.025 * e], [0.07 * e, 0.06 * e], [0.075 * e, 0.07 * e], [0.065 * e, 0.065 * e], [0.035 * e, 0.035 * e], [0.001, 0.02 * e]], { segs: S.detalle ? 6 : 9, color: (t) => (t > 0.5 ? new THREE.Color('#c84a14') : mezcla('#e05a1e', '#f08a3a', t * 2)) });
      S.punto('flor', px, y + 0.15 * e, pz);
    }
    return { alto: 0.35, ancho: 1.3 };
  },
  repisa(S, r, x, y, z) {
    tronquito(S, x, y, z, 1.6);
    for (let k = 0; k < 7; k++) {
      const px = x - 0.6 + k * 0.2, pz = z + 0.16 + (r() - 0.5) * 0.06, c = vec(px, y + 0.15, pz);
      pie(S, c, 0.09, 0.025, '#e8c43a', 4);
      torno(S.m.solido, c.clone().add(vec(0, 0.085, 0)), [[0.01, 0], [0.06, 0.012], [0.11, 0.022], [0.12, 0.026], [0.1, 0.03], [0.04, 0.02], [0.001, 0.015]], { segs: S.detalle ? 6 : 10, color: (t) => tono(['#6a4a2a', '#9a7448', '#c8a878', '#7a5a34'].map(color), t) });
      S.punto('flor', px, y + 0.27, pz);
    }
    return { alto: 0.45, ancho: 1.6 };
  },
  luminosa(S, r, x, y, z, e) {
    tronquito(S, x, y, z, 1.4, '#4a3a2a');
    const n = e.modelo.pequena ? 26 : 16;
    for (let k = 0; k < (S.detalle ? Math.ceil(n / 3) : n); k++) {
      const px = x - 0.6 + r() * 1.2, pz = z + 0.08 + r() * 0.12, tam = (e.modelo.pequena ? 0.05 : 0.08) * (0.7 + r() * 0.6), c = vec(px, y + 0.18, pz);
      pie(S, c, tam * 0.8, 0.012, e.modelo.color, 3);
      sombrero(S, 'brillo', c.clone().add(vec(0, tam * 0.8, 0)), tam * 0.5, tam * 0.4, e.modelo.luz, { segs: 6 });
    }
    S.punto('flor', x, y + 0.3, z + 0.12);
    return { alto: 0.35, ancho: 1.4, luz: e.modelo.luz };
  },
  termitomyces(S, r, x, y, z) {
    // el termitero de barro y la seta que lo atraviesa
    torno(S.m.solido, vec(x, y, z), [[0.62, 0], [0.55, 0.25], [0.42, 0.55], [0.26, 0.85], [0.1, 1.05], [0.001, 1.1]], { segs: S.detalle ? 7 : 12, color: (t, a) => mezcla('#8a5e38', '#a8784a', 0.5 + 0.5 * Math.sin(t * 20 + a * 3)) });
    const c = vec(x + 0.35, y + 0.3, z + 0.2);
    pie(S, c, 0.46, 0.06, '#efe6d6');
    sombrero(S, 'solido', c.clone().add(vec(0, 0.45, 0)), 0.24, 0.1, '#d8c8a8', { debajo: '#efe6d6' });
    bola(S.m.solido, c.clone().add(vec(0, 0.56, 0)), 0.03, { color: '#7a5a3a', segs: 4, aplastar: 1.4 });
    S.punto('flor', c.x, c.y + 0.58, c.z);
    return { alto: 1.1, ancho: 1.4 };
  },
  cordyceps(S, r, x, y, z) {
    // la hoja y su nervio
    tira(S.m.hoja, vec(x - 0.6, y + 0.52, z), vec(1, 0.03, 0), vec(0, 0, 1), 1.1, 0.3, { pasos: 3, caida: 0.04, celda: 'pala', color: tono(VERDES, 0.6), viento: 0.01 });
    // la hormiga muerta agarrada al nervio por debajo
    const hx = x + 0.05, hy = y + 0.46;
    for (const [dx, rr] of [[-0.06, 0.035], [0.015, 0.025], [0.07, 0.024]]) bola(S.m.solido, vec(hx + dx, hy, z), rr, { color: '#2a1a12', segs: 5, aplastar: 0.8 });
    for (let k = 0; k < 3; k++) for (const s of [-1, 1]) tubo(S.m.solido, [vec(hx - 0.03 + k * 0.035, hy, z + s * 0.01), vec(hx - 0.03 + k * 0.035, hy - 0.03, z + s * 0.05)], 0.004, { segs: 3, color: '#2a1a12' });
    // el tallo que le sale de la cabeza
    tubo(S.m.flor, [vec(hx + 0.08, hy + 0.01, z), vec(hx + 0.1, hy - 0.17, z + 0.03), vec(hx + 0.12, hy - 0.35, z + 0.05)], [0.007, 0.006, 0.005], { segs: 3, color: '#c8a05a' });
    bola(S.m.flor, vec(hx + 0.11, hy - 0.22, z + 0.04), 0.02, { color: '#a05a2a', segs: 4, aplastar: 1.8 });
    S.punto('hoja', x, y + 0.53, z);
    return { alto: 0.7, ancho: 1.2 };
  },
};


/* ---------------------------------------------------------------- montar */
export const SUAVES = new Set([...Object.keys(PLANTA), ...Object.keys(SETA)]);
export function esSeta(especie) { return ['amanita', 'russula', 'boleto', 'falo', 'estrella', 'copa', 'repisa', 'luminosa', 'termitomyces', 'cordyceps'].includes(especie.modelo.tipo); }

// echa en el saco la planta o seta (suave si ya lo es; si no, con sus cubos de antes)
export function construir(especie, S, r, x = 0, y = 0, z = 0) {
  const f = PLANTA[especie.modelo.tipo] || SETA[especie.modelo.tipo];
  if (!f) return construirCubos(especie, S, r, x, y, z);
  return f(S, r, x, y, z, especie);
}

/* Una planta o seta suelta (editor, galería): su raíz, sus animaciones y cómo se mueven. */
export function crearPlanta(especie, { detalle = 0 } = {}) {
  let h = 0; for (const ch of especie.id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const r = azar(h >>> 0), S = new SacoP(detalle);
  const tiempo = { value: 0 }, viento = { value: 1 }, marchito = { value: 0 }, crecerFlor = { value: 1 }, crecerFruto = { value: 1 };
  const medidas = construir(especie, S, r) || { alto: 1, ancho: 1 };
  const seta = esSeta(especie);
  const raiz = new THREE.Group();
  const mallas = [];
  for (const [tipo, g] of Object.entries(S.geometrias())) {
    const u = { tiempo, viento, marchito: tipo === 'solido' && !seta ? { value: 0 } : marchito, crecer: tipo === 'flor' ? crecerFlor : tipo === 'fruto' ? crecerFruto : undefined, marron: { value: seta ? MARRON_SETA : MARRON } };
    const malla = new THREE.Mesh(g, materialPlanta(tipo, u));
    malla.customDepthMaterial = materialSombraPlanta(tipo, u);
    malla.castShadow = tipo !== 'brillo'; malla.receiveShadow = tipo !== 'brillo';
    malla.userData.tipo = tipo;
    mallas.push(malla); raiz.add(malla);
  }
  const arbol = ['dipterocarpo', 'agathis', 'higuera', 'roble', 'dillenia', 'palma-cola-pez'].includes(especie.modelo.tipo);
  const tieneFlor = mallas.some((m) => m.userData.tipo === 'flor'), tieneFruto = mallas.some((m) => m.userData.tipo === 'fruto');
  const anims = seta
    ? ['quieto', 'brotar', 'esporas', ...(medidas.luz ? ['brillar'] : []), 'pudrir']
    : ['viento', 'crecer', ...(tieneFlor ? ['florecer'] : []), ...(tieneFruto ? ['fructificar'] : []), 'marchitar', ...(arbol ? ['caer'] : [])];
  const caja = new THREE.Box3().setFromObject(raiz);
  let esporas = null;
  if (seta) {
    const n = 120, pos = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    esporas = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#f2ecd8', size: 2, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false }));
    esporas.userData.semillas = Array.from({ length: n }, () => [r() - 0.5, r(), r() - 0.5, r()]);
    esporas.visible = false; raiz.add(esporas);
  }
  const brillo = () => mallas.find((m) => m.userData.tipo === 'brillo');
  const P = {
    raiz, anims, anim: anims[0], inicio: 0, tiempo, viento, cubos: S.cubos, triangulos: S.total, tam: caja.getSize(new THREE.Vector3()), centro: caja.getCenter(new THREE.Vector3()), luz: medidas.luz, saco: S,
    poner(nombre, t = 0) {
      this.anim = nombre; this.inicio = t;
      marchito.value = 0; crecerFlor.value = 1; crecerFruto.value = 1;
      for (const m of mallas) m.visible = true;
      if (brillo()) brillo().material.color.set('#ffffff');
    },
    paso(t) {
      const k = t - this.inicio, a = this.anim;
      tiempo.value = t;
      viento.value = seta ? 0 : a === 'viento' ? 1.4 : 0.6;
      raiz.scale.set(1, 1, 1); raiz.rotation.set(0, 0, 0); raiz.position.set(0, 0, 0);
      if (esporas) esporas.visible = false;
      if (a === 'crecer' || a === 'brotar') {
        const f = Math.min(1, ((k % 6) / (seta ? 2.5 : 4.5)));
        raiz.scale.setScalar(0.04 + 0.96 * f * f * (3 - 2 * f));
      } else if (a === 'florecer' || a === 'fructificar') {
        // cada flor (o fruto) crece en su sitio (en el shader)
        const f = Math.min(1, (k % 5) / 2.5);
        (a === 'florecer' ? crecerFlor : crecerFruto).value = Math.max(0.001, f);
      } else if (a === 'marchitar' || a === 'pudrir') {
        marchito.value = Math.min(1, k / 4) * 0.85;
        if (seta) raiz.scale.y = 1 - marchito.value * 0.55;
      } else if (a === 'caer') {
        const f = Math.min(1, Math.max(0, (k - 0.5) / 2.2));
        raiz.rotation.z = -f * f * Math.PI / 2 * 0.97;
      } else if (a === 'esporas') {
        esporas.visible = true;
        const arr = esporas.geometry.attributes.position.array;
        esporas.userData.semillas.forEach(([dx, hh, dz, fase], i) => {
          const v = ((t * 0.35 + fase) % 1);
          arr[i * 3] = dx * (0.2 + v * 1.4) + Math.sin(t + fase * 9) * 0.05; arr[i * 3 + 1] = caja.max.y * 0.9 + v * 1.2 * hh; arr[i * 3 + 2] = dz * (0.2 + v * 1.4);
        });
        esporas.geometry.attributes.position.needsUpdate = true;
        esporas.material.opacity = 0.7;
      } else if (a === 'brillar' && brillo()) {
        const x = 0.55 + Math.sin(t * 2.5) * 0.45;
        brillo().material.color.setScalar(0.4 + x * 1.1);
      }
    },
  };
  return P;
}

export const NOMBRES_ANIM_PLANTA = {
  viento: 'Viento', crecer: 'Crecer', florecer: 'Florecer', fructificar: 'Fructificar', marchitar: 'Marchitarse', caer: 'Caer (morir)',
  quieto: 'Quieta', brotar: 'Brotar', esporas: 'Soltar esporas', brillar: 'Brillar', pudrir: 'Pudrirse',
};
