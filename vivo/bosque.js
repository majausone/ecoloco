/* EL BOSQUE, POR INSTANCIAS. Cada especie de planta y seta (con unas pocas variantes) se
   construye UNA vez como geometría (plantas suaves de graficos/pruebas-morta/borneo/plantas.js:
   ez-tree para los árboles, tiras y tubos para lo demás) y se dibuja con instancias: una por
   planta, con su sitio, su giro y su escala. Así el bosque entero son unas pocas cientos de
   llamadas de dibujo, y que nazca o muera un árbol solo cambia su instancia.

   Sin niveles de detalle: cada planta y cada seta, siempre con su modelo entero, a cualquier
   distancia (antes había una versión aligerada de 35 a 140 m y un impostor plano de los árboles
   más lejos; quitados a petición). La sombra la echan las de hasta SOMBRA m de la cámara.
   Hojas con recorte (alphaTest), sin transparencia mezclada; el viento, en el shader.
   La lista de plantas de cada nivel (un anillo alrededor de la cámara) se rehace cuando la
   cámara se ha movido bastante, con un margen igual a ese movimiento para que la tarjeta
   siempre tenga las que tocan, y como mucho un nivel por fotograma. */

import * as THREE from '../graficos/pruebas-morta/vendor/three.module.js';
import { PLANTAS, SETAS } from '../graficos/pruebas-morta/borneo/especies.js?v=202610052205';
import { construir, SacoP, materialPlanta, materialSombraPlanta, SUAVES } from '../graficos/pruebas-morta/borneo/plantas.js?v=202610052205';
// (variantes, azar y escala de cada árbol: los mismos que usan los posaderos de la simulación)
import { VARIANTES, ARBOL, azarDe, varianteDe, escalaDe } from '../mundo/posaderos.js?v=202610052205';
import { hacerImpostorPlanta, materialImpostorPlanta } from '../graficos/pruebas-morta/borneo/impostor-planta.js?v=202610052205';
import { conTransparencia } from './transparencia.js?v=202610052205';

export const CERCA = 35, MEDIO = 140, LEJOS = 2000, SETAS_HASTA = 2000;
const SOMBRA = 70, NIVELES = 1;
const UNO = [1, 1, 1];
const DOSEL = 10; // m: de lejos (nivel 2) solo se ven los árboles más altos que esto
const busca = (id) => PLANTAS.find((e) => e.id === id) || SETAS.find((e) => e.id === id);

// ---------------------------------------------------------------- geometrías
// las geometrías de un modelo por tipo (sólido, hoja, fruto, flor, brillo), en el origen, a un detalle
function geometriasDe(especie, variante, detalle) {
  const e = busca(especie), S = new SacoP(detalle);
  const med = e ? construir(e, S, azarDe(especie + ':' + variante), 0, 0, 0) || { alto: 1, ancho: 1 } : { alto: 1, ancho: 1 };
  // (las suaves, cada una en una sola malla: una llamada de dibujo por planta y nivel)
  const suave = SUAVES.has(e?.modelo?.tipo);
  return { geos: soltarAlSubir(S.geometrias({ juntarCartas: suave, juntarTodo: suave })), med, lista: S.lista };
}
// la copia en memoria sobra una vez en la tarjeta (son muchos megas y harían más lentas las
// recogidas de basura); los triángulos ya están apuntados en userData
function soltarAlSubir(geos) { for (const g of Object.values(geos)) for (const a of [...Object.values(g.attributes), g.index]) a.onUpload(soltar); return geos; }
function soltar() { this.array = null; }
// de lejos, lo que aún va con cubos: tronco y copa en bloque, con la caja y el color medio de las
// hojas y del tronco del modelo
function bloque(tipos, med) {
  const hojas = tipos.hoja || [], solidos = tipos.solido || [];
  const media = (l) => { const c = new THREE.Color(0, 0, 0); let p = 0; for (const x of l) { const w = x[3] * x[4] * x[5]; c.r += x[6].r * w; c.g += x[6].g * w; c.b += x[6].b * w; p += w; } return p ? c.multiplyScalar(1 / p) : null; };
  const copa = (media(hojas) || new THREE.Color('#1f4422')).multiplyScalar(0.85), tronco = media(solidos) || new THREE.Color('#5a4030');
  const S = new SacoP(0);
  if (!hojas.length) { S.cubo('solido', 0, med.alto / 2, 0, Math.max(0.3, med.ancho * 0.5), med.alto, Math.max(0.3, med.ancho * 0.5), tronco); return soltarAlSubir(S.geometrias()); }
  // la caja de las hojas (con el percentil 10-90 para que una rama suelta no la estire)
  const q = (l, f) => { const o = [...l].sort((x, y) => x - y); return o[Math.floor((o.length - 1) * f)]; };
  const xs = hojas.map((x) => x[0]), ys = hojas.map((x) => x[1]), zs = hojas.map((x) => x[2]);
  const x0 = q(xs, 0.1), x1 = q(xs, 0.9), y0 = q(ys, 0.1), y1 = q(ys, 0.95), z0 = q(zs, 0.1), z1 = q(zs, 0.9);
  const w = Math.max(0.8, x1 - x0 + 1), h = Math.max(0.8, y1 - y0 + 1), d = Math.max(0.8, z1 - z0 + 1);
  const cxh = (x0 + x1) / 2, cyh = (y0 + y1) / 2, czh = (z0 + z1) / 2;
  S.cubo('solido', 0, y0 / 2, 0, Math.max(0.25, Math.min(w, d) * 0.08), Math.max(0.5, y0), Math.max(0.25, Math.min(w, d) * 0.08), tronco);
  S.cubo('hoja', cxh, cyh, czh, w, h * 0.75, d, copa); S.cubo('hoja', cxh, cyh + h * 0.3, czh, w * 0.65, h * 0.35, d * 0.65, copa.clone().offsetHSL(0, 0, 0.03));
  return soltarAlSubir(S.geometrias());
}

// ---------------------------------------------------------------- materiales
// viento y nivel de detalle por distancia a la cámara (plantas.js: parchePlanta): el vértice de
// una instancia fuera de [uMin, uMax) se manda fuera de la pantalla
const uCam = { value: new THREE.Vector3() };
function extraBosque(min, max, deProfundidad) {
  return {
    clave: `bosque:${min}:${max}`,
    uniformes: { uCam, uMin: { value: min }, uMax: { value: max } },
    cabeceraVertex: 'uniform vec3 uCam;\nuniform float uMin;\nuniform float uMax;\nvarying vec2 vOrgPlanta;',
    vertexExtra: 'vOrgPlanta = orgPlanta.xz;',
    vertexFinal: 'float dCam = distance(orgPlanta.xz, uCam.xz);\n if (dCam < uMin || dCam >= uMax) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);',
  };
}
function material(tipo, tiempo, viento, min, max, deProfundidad = false, cartas = true) {
  const extra = { ...extraBosque(min, max, deProfundidad), cartas };
  const u = { tiempo, viento };
  // (lo que tapa al seleccionado, tramado: transparencia.js; la sombra, entera)
  return deProfundidad ? materialSombraPlanta(tipo, u, extra) : conTransparencia(materialPlanta(tipo, u, extra), { conPlanta: true });
}

// ---------------------------------------------------------------- el bosque
export function crearBosque({ escena, mapa, ox, oz, cima, tiempo, viento, renderer = null }) {
  // una capa por especie, variante, nivel y tipo: su InstancedMesh, que crece si hace falta
  const capas = new Map(), porNivel = [[], [], []];
  const modelos = new Map(); // especie -> { med, niveles: [[tipos por variante]...] }
  const modelo = (especie) => {
    let m = modelos.get(especie);
    if (m) return m;
    // (solo el modelo entero: sin versión ligera ni impostor)
    const n0 = [];
    for (let v = 0; v < VARIANTES; v++) n0.push(geometriasDe(especie, v, 0));
    m = { med: n0[0].med, niveles: [n0.map((x) => x.geos)] };
    modelos.set(especie, m);
    return m;
  };
  const RADIOS = [[0, LEJOS]];
  function capa(especie, variante, nivel, tipo) {
    const clave = `${especie}|${variante}|${nivel}|${tipo}`;
    let c = capas.get(clave);
    if (c) return c;
    const geo = modelo(especie).niveles[nivel][variante]?.[tipo];
    if (!geo) { capas.set(clave, null); return null; }
    const [min, max] = especie in SETAS_IDS ? [0, SETAS_HASTA] : RADIOS[nivel];
    // (lo que aún va con cubos, sin el recorte ni las dos caras de las tarjetas)
    const cartas = SUAVES.has(busca(especie)?.modelo?.tipo);
    const malla = new THREE.InstancedMesh(geo, material(tipo, tiempo, viento, min, max, false, cartas), 16);
    malla.count = 0; malla.frustumCulled = false;
    // la sombra de las plantas de cerca la echa su versión ligera (nivel 1, con menos hojas y más
    // grandes): en el mapa de sombras apenas se nota y cuesta mucho menos que las hojas de cerca
    const esSeta = especie in SETAS_IDS;
    malla.castShadow = tipo !== 'brillo'; malla.receiveShadow = tipo !== 'brillo';
    if (malla.castShadow) malla.customDepthMaterial = material(tipo, tiempo, viento, 0, SOMBRA, true, cartas);
    malla.userData.tipo = tipo; malla.userData.nivel = nivel;
    escena.add(malla);
    c = { malla, n: 0, ns: 0, sig: new Float32Array(16 * 16), sigCol: new Float32Array(16 * 3), triangulos: geo.userData.triangulos };
    capas.set(clave, c); porNivel[nivel].push(c);
    return c;
  }
  // el impostor de un árbol (nivel 2)
  function capaImpostor(especie) {
    const clave = `${especie}|imp`;
    let c = capas.get(clave);
    if (c) return c;
    const imp = modelo(especie).impostor, [min, max] = RADIOS[2];
    const malla = new THREE.InstancedMesh(imp.geo, conTransparencia(materialImpostorPlanta(imp.textura, extraBosque(min, max, true)), { conPlanta: true }), 16);
    malla.count = 0; malla.frustumCulled = false; malla.castShadow = false; malla.receiveShadow = false;
    malla.userData.tipo = 'hoja'; malla.userData.nivel = 2;
    escena.add(malla);
    c = { malla, n: 0, ns: 0, sig: new Float32Array(16 * 16), sigCol: new Float32Array(16 * 3), triangulos: 4 };
    capas.set(clave, c); porNivel[2].push(c);
    return c;
  }
  const SETAS_IDS = Object.fromEntries(SETAS.map((e) => [e.id, true]));
  const TIPOS = ['solido', 'hoja', 'fruto', 'flor', 'brillo'];
  // las capas de una especie en un nivel y variante (se crean al hacer falta la primera vez)
  const porEspecie = new Map();
  const capasDe = (especie, nivel, v) => {
    const k = especie + '|' + nivel + '|' + v;
    let l = porEspecie.get(k);
    if (!l) { l = nivel === 2 && !ARBOL.has(especie) ? [] : nivel === 2 && modelo(especie).impostor ? [capaImpostor(especie)] : TIPOS.map((t) => capa(especie, v, nivel, t)).filter(Boolean); porEspecie.set(k, l); }
    return l;
  };
  const escalaArbol = escalaDe;
  // el tono de cada ejemplar, de su id (siempre el mismo para el mismo árbol)
  const tonoDe = (id) => { const r = azarDe('tono:' + id), k = 0.88 + r() * 0.24, v = (r() - 0.5) * 0.1; return [k * (1 + v), k * (1 + v * 0.3), k * (1 - v)]; };
  // (lo que no cambia de un árbol, guardado en él: variante, escala y altura del suelo)
  const dibujoDe = (a) => (a._dibujo = { v: varianteDe(a), esc: escalaArbol(a), alto: a.altura, y: cima(a.x, a.z), capas: [], tono: tonoDe(a.id) });
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), eje = new THREE.Vector3(0, 1, 0);
  // las matrices de cada capa se escriben primero en una copia aparte (c.sig) y se pasan a la
  // malla de una vez al acabar: así se puede rehacer un nivel por partes sin que se vea a medias
  // tono: el color propio de cada ejemplar (un poco más claro u oscuro, más verde o más amarillo)
  function poner(c, x, y, z, giro, escala, tono = UNO) {
    if ((c.ns + 1) * 16 > c.sig.length) { const n = new Float32Array(c.sig.length * 2); n.set(c.sig); c.sig = n; const k = new Float32Array(c.sigCol.length * 2); k.set(c.sigCol); c.sigCol = k; }
    mat.compose(p.set(x - ox, y, z - oz), q.setFromAxisAngle(eje, giro), s.set(escala, escala, escala));
    mat.toArray(c.sig, c.ns * 16); c.sigCol.set(tono, c.ns * 3); c.ns++;
  }
  function pasar(c) {
    if (c.ns > c.malla.instanceMatrix.count) {
      const viejo = c.malla, nuevo = new THREE.InstancedMesh(viejo.geometry, viejo.material, Math.max(16, 2 ** Math.ceil(Math.log2(c.ns))));
      Object.assign(nuevo, { castShadow: viejo.castShadow, receiveShadow: viejo.receiveShadow, frustumCulled: false, customDepthMaterial: viejo.customDepthMaterial, userData: viejo.userData });
      escena.remove(viejo); viejo.dispose(); escena.add(nuevo); c.malla = nuevo;
    }
    c.malla.instanceMatrix.array.set(c.sig.subarray(0, c.ns * 16));
    if (!c.malla.instanceColor) c.malla.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(c.malla.instanceMatrix.count * 3).fill(1), 3);
    c.malla.instanceColor.array.set(c.sigCol.subarray(0, c.ns * 3));
    c.malla.count = c.n = c.ns;
    c.malla.instanceMatrix.needsUpdate = true; c.malla.instanceColor.needsUpdate = true;
  }
  // rehace las listas de instancias de un nivel alrededor de un punto, por partes (yield cada
  // pocas baldosas)
  let ancla = [null], pendientes = [], obra = null;
  const medidas = { instancias: 0, triangulos: 0, llamadas: 0, rehechos: 0 };
  const UMBRAL = [20];
  function* rehacer(nivel, fx, fz) {
    // (el nivel 1 también lleva las plantas de cerca: echa su sombra)
    const [min, max] = RADIOS[nivel], radio = max + UMBRAL[nivel], dentro = Math.max(0, min - UMBRAL[nivel]);
    for (const c of porNivel[nivel]) c.ns = 0;
    let k = 0;
    for (const b of mapa.baldosasCerca(fx, fz, nivel === 0 ? Math.max(radio, SETAS_HASTA + UMBRAL[0]) : radio)) {
      for (const a of b.arboles) {
        const d = Math.hypot(a.x - fx, a.z - fz);
        if (d > radio || d < dentro) continue;
        if (nivel === 2 && (!ARBOL.has(a.especie) || (a.altura || 0) < DOSEL)) continue;
        const g = a._dibujo || dibujoDe(a);
        for (const c of g.capas[nivel] ||= capasDe(a.especie, nivel, nivel === 2 ? 0 : g.v)) poner(c, a.x, g.y, a.z, a.giro, g.esc, g.tono);
      }
      if (nivel === 0) for (const st of b.setas) {
        if (Math.hypot(st.x - fx, st.z - fz) > SETAS_HASTA + UMBRAL[0]) continue;
        // (las setas, con una sola variante, giradas cada una a su manera)
        const giro = (Math.abs(Math.floor(st.x * 7 + st.z * 13)) % 628) / 100;
        for (const tipo of ['solido', 'flor', 'brillo', 'hoja', 'fruto']) { const c = capa(st.especie, 0, 0, tipo); if (c) poner(c, st.x, cima(st.x, st.z), st.z, giro, 1); }
      }
      if (++k % 8 === 0) yield;
    }
    for (const c of porNivel[nivel]) pasar(c);
    ancla[nivel] = { x: fx, z: fz };
    medidas.rehechos++;
  }
  return {
    medidas,
    // el motor ha cambiado las plantas: hay que rehacer las listas
    cambiado() { pendientes = [0]; },
    // una baldosa recién generada (con las plantas del día nuevo): se adelanta lo de sus árboles
    preparar(b) { for (const a of b.arboles) if (!a._dibujo) dibujoDe(a); },
    // cada fotograma: dónde está la cámara (para el nivel de detalle) y cuántos ms hay
    actualizar(camPos, presupuesto = 4) {
      uCam.value.set(camPos.x, camPos.y, camPos.z);
      const cx = camPos.x + ox, cz = camPos.z + oz;
      // al empezar, todos los niveles de una vez; luego, uno cada vez y por partes: los que
      // quedan por rehacer porque el motor ha cambiado las plantas o, si no, el que más se
      // haya salido de su margen porque la cámara se ha movido
      let hechos = 0;
      for (let n = 0; n < NIVELES; n++) if (!ancla[n]) { for (const _ of rehacer(n, cx, cz)); hechos++; }
      if (!obra && !hechos) {
        let peor = -1, exceso = 0;
        if (pendientes.length) peor = pendientes.shift();
        else for (let n = 0; n < NIVELES; n++) {
          const e = Math.hypot(cx - ancla[n].x, cz - ancla[n].z) / UMBRAL[n];
          if (e > 1 && e > exceso) { exceso = e; peor = n; }
        }
        if (peor >= 0) obra = rehacer(peor, cx, cz);
      }
      if (obra) {
        const t0 = performance.now();
        while (performance.now() - t0 < presupuesto) if (obra.next().done) { obra = null; hechos++; break; }
      }
      if (hechos) {
        medidas.instancias = 0; medidas.triangulos = 0; medidas.llamadas = 0;
        for (const c of capas.values()) if (c && c.n) { medidas.instancias += c.n; medidas.triangulos += c.n * c.triangulos; medidas.llamadas++; }
      }
      return hechos;
    },
    // las setas luminosas cercanas (para su halo)
    luces(fx, fz) {
      const out = [];
      for (const b of mapa.baldosasCerca(fx, fz, 60)) for (const st of b.setas) {
        const e = busca(st.especie);
        if (!e?.modelo?.luz) continue;
        const y = cima(st.x, st.z), r = azarDe(st.id);
        for (let k = 0; k < 6; k++) out.push(st.x - ox - 0.6 + r() * 1.2, y + 0.25 + r() * 0.1, st.z - oz + 0.1 + r() * 0.15);
      }
      return out;
    },
    *mallas() { for (const c of capas.values()) if (c) yield c.malla; },
  };
}
