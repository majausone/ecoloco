/* EL BOSQUE, POR INSTANCIAS. Cada especie de planta y seta (con unas pocas variantes) se
   construye UNA vez como geometría (todos sus cubos juntos, con el color en los vértices) y
   se dibuja con instancias: una por planta, con su sitio, su giro y su escala. Así el bosque
   entero son unas pocas cientos de llamadas de dibujo, y que nazca o muera un árbol solo
   cambia su instancia.

   Tres niveles de detalle, según la distancia a la cámara (la decide la tarjeta gráfica en
   cada vértice, así que no hay que rehacer nada al moverse):
     0 (hasta CERCA m): el modelo entero del Observer;
     1 (hasta MEDIO m): el mismo aligerado (las hojas, en cubos más grandes y unas 10 veces menos;
        de las ramas, solo las gruesas);
     2 (hasta LEJOS m, solo los árboles del dosel): tronco y copa en bloque.
   La lista de plantas de cada nivel (un anillo alrededor de la cámara) se rehace cuando la
   cámara se ha movido bastante, con un margen igual a ese movimiento para que la tarjeta
   siempre tenga las que tocan, y como mucho un nivel por fotograma. */

import * as THREE from '../graficos/pruebas-morta/vendor/three.module.js';
import { PLANTAS, SETAS } from '../graficos/pruebas-morta/borneo/especies.js?v=202610032115';
import { construir } from '../graficos/pruebas-morta/borneo/plantas.js?v=202610032115';
// (variantes, azar y escala de cada árbol: los mismos que usan los posaderos de la simulación)
import { VARIANTES, ARBOL, azarDe, varianteDe, escalaDe } from '../mundo/posaderos.js?v=202610032115';

export const CERCA = 35, MEDIO = 140, LEJOS = 500, SETAS_HASTA = 60;
const DOSEL = 10; // m: de lejos (nivel 2) solo se ven los árboles más altos que esto
const busca = (id) => PLANTAS.find((e) => e.id === id) || SETAS.find((e) => e.id === id);

// ---------------------------------------------------------------- geometrías
const CAJA = new THREE.BoxGeometry(1, 1, 1);
// junta una lista de cubos [x, y, z, sx, sy, sz, color, rx, ry, rz] en una geometría con color por vértice
function juntar(cubos) {
  const P = CAJA.attributes.position, N = CAJA.attributes.normal, I = CAJA.index.array, nv = P.count;
  const pos = new Float32Array(cubos.length * nv * 3), nor = new Float32Array(cubos.length * nv * 3), col = new Float32Array(cubos.length * nv * 3);
  const idx = new Uint32Array(cubos.length * I.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
  cubos.forEach((c, j) => {
    m.compose(p.set(c[0], c[1], c[2]), q.setFromEuler(e.set(c[7] || 0, c[8] || 0, c[9] || 0)), s.set(c[3], c[4], c[5]));
    nm.getNormalMatrix(m);
    const col3 = c[6];
    for (let k = 0; k < nv; k++) {
      v.fromBufferAttribute(P, k).applyMatrix4(m); pos.set([v.x, v.y, v.z], (j * nv + k) * 3);
      v.fromBufferAttribute(N, k).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (j * nv + k) * 3);
      col.set([col3.r, col3.g, col3.b], (j * nv + k) * 3);
    }
    for (let k = 0; k < I.length; k++) idx[j * I.length + k] = I[k] + j * nv;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  // la copia en memoria sobra una vez en la tarjeta (son muchos megas y harían más lentas las
  // recogidas de basura); antes se apuntan los triángulos
  g.userData.triangulos = idx.length / 3;
  g.computeBoundingSphere(); g.computeBoundingBox();
  for (const a of [...Object.values(g.attributes), g.index]) a.onUpload(soltar);
  return g;
}
function soltar() { this.array = null; }
// los cubos de un modelo, por tipo (sólido, hoja, fruto, flor, brillo), en el origen
function cubosDe(especie, variante) {
  const e = busca(especie), tipos = {};
  const S = { cubo(tipo, x, y, z, sx, sy, sz, c, rx = 0, ry = 0, rz = 0) { (tipos[tipo] ||= []).push([x, y, z, sx, sy, sz, c instanceof THREE.Color ? c : new THREE.Color(c), rx, ry, rz]); } };
  const med = e ? construir(e, S, azarDe(especie + ':' + variante), 0, 0, 0) || { alto: 1, ancho: 1 } : { alto: 1, ancho: 1 };
  return { tipos, med };
}
// aligerado: de las hojas, una de cada 10 y más grande; de lo demás, lo grande
function aligerar(tipos) {
  const out = {};
  for (const [t, l] of Object.entries(tipos)) {
    if (t === 'hoja') out[t] = l.filter((_, i) => i % 10 === 0).map((c) => [c[0], c[1], c[2], c[3] * 2.1, c[4] * 2.1, c[5] * 2.1, c[6], c[7], c[8], c[9]]);
    else if (t === 'solido') out[t] = l.filter((c) => c[3] * c[4] * c[5] > 0.004);
    else if (t === 'flor' || t === 'brillo') out[t] = l.filter((_, i) => i % 5 === 0);
  }
  return out;
}
// en bloque: tronco y copa, con la caja y el color medio de las hojas y del tronco del modelo
function bloque(tipos, med) {
  const hojas = tipos.hoja || [], solidos = tipos.solido || [];
  const media = (l) => { const c = new THREE.Color(0, 0, 0); let p = 0; for (const x of l) { const w = x[3] * x[4] * x[5]; c.r += x[6].r * w; c.g += x[6].g * w; c.b += x[6].b * w; p += w; } return p ? c.multiplyScalar(1 / p) : null; };
  const copa = (media(hojas) || new THREE.Color('#1f4422')).multiplyScalar(0.85), tronco = media(solidos) || new THREE.Color('#5a4030');
  if (!hojas.length) return { solido: [[0, med.alto / 2, 0, Math.max(0.3, med.ancho * 0.5), med.alto, Math.max(0.3, med.ancho * 0.5), tronco]] };
  // la caja de las hojas (con el percentil 10-90 para que una rama suelta no la estire)
  const q = (l, f) => { const o = [...l].sort((x, y) => x - y); return o[Math.floor((o.length - 1) * f)]; };
  const xs = hojas.map((x) => x[0]), ys = hojas.map((x) => x[1]), zs = hojas.map((x) => x[2]);
  const x0 = q(xs, 0.1), x1 = q(xs, 0.9), y0 = q(ys, 0.1), y1 = q(ys, 0.95), z0 = q(zs, 0.1), z1 = q(zs, 0.9);
  const w = Math.max(0.8, x1 - x0 + 1), h = Math.max(0.8, y1 - y0 + 1), d = Math.max(0.8, z1 - z0 + 1);
  const cxh = (x0 + x1) / 2, cyh = (y0 + y1) / 2, czh = (z0 + z1) / 2;
  return {
    solido: [[0, y0 / 2, 0, Math.max(0.25, Math.min(w, d) * 0.08), Math.max(0.5, y0), Math.max(0.25, Math.min(w, d) * 0.08), tronco]],
    hoja: [[cxh, cyh, czh, w, h * 0.75, d, copa], [cxh, cyh + h * 0.3, czh, w * 0.65, h * 0.35, d * 0.65, copa.clone().offsetHSL(0, 0, 0.03)]],
  };
}

// ---------------------------------------------------------------- materiales
// viento (como el de las plantas del Observer) y nivel de detalle por distancia a la cámara:
// el vértice de una instancia fuera de [uMin, uMax) se manda fuera de la pantalla
const uCam = { value: new THREE.Vector3() };
// el animal que sigue la cámara (escena) y si hay uno: lo que se interponga entre la cámara y él
// se ve a medias (tramado), para no perderlo de vista
export const uSeguido = { value: new THREE.Vector3() }, uSigue = { value: 0 };
function material(tipo, tiempo, viento, min, max, deProfundidad = false) {
  const m = deProfundidad ? new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
    : tipo === 'brillo' ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshLambertMaterial({ vertexColors: true });
  const mece = tipo === 'hoja' || tipo === 'flor' || tipo === 'fruto';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTiempo = tiempo; sh.uniforms.uViento = viento; sh.uniforms.uCam = uCam;
    sh.uniforms.uMin = { value: min }; sh.uniforms.uMax = { value: max };
    sh.uniforms.uSeguido = uSeguido; sh.uniforms.uSigue = uSigue;
    if (!deProfundidad) sh.fragmentShader = 'uniform vec3 uCam;\nuniform vec3 uSeguido;\nuniform float uSigue;\nvarying vec3 vMundo;\n' + sh.fragmentShader.replace('void main() {', `void main() {
      if (uSigue > 0.5) {
        vec3 ab = uSeguido - uCam; float l2 = dot(ab, ab);
        float h = clamp(dot(vMundo - uCam, ab) / max(l2, 1e-4), 0.0, 1.0);
        // entre la cámara y el animal (sin tocar lo que está a su lado), a menos de 1,6 m de la línea
        if (h < 0.97 && distance(vMundo, uCam + ab * h) < 1.6 && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
      }`);
    sh.vertexShader = 'uniform float uTiempo;\nuniform float uViento;\nuniform vec3 uCam;\nuniform float uMin;\nuniform float uMax;\nvarying vec3 vMundo;\n' + sh.vertexShader.replace(
      '#include <project_vertex>',
      `vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
        vec3 centro = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #else
        vec3 centro = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #endif
      float dCam = distance(centro.xz, uCam.xz);
      ${mece ? `float fase = mvPosition.x * 1.7 + mvPosition.z * 1.3;
      float alto = clamp(mvPosition.y, 0.0, 3.0);
      mvPosition.x += (sin(uTiempo * 2.2 + fase) + 0.5 * sin(uTiempo * 3.7 + fase * 1.9)) * uViento * (0.012 + alto * 0.004);
      mvPosition.z += cos(uTiempo * 1.9 + fase * 1.1) * uViento * 0.008;` : ''}
      vMundo = (modelMatrix * mvPosition).xyz;
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;
      if (dCam < uMin || dCam >= uMax) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);`);
  };
  m.customProgramCacheKey = () => `bosque:${tipo}:${min}:${max}:${deProfundidad}`;
  return m;
}

// ---------------------------------------------------------------- el bosque
export function crearBosque({ escena, mapa, ox, oz, cima, tiempo, viento }) {
  // una capa por especie, variante, nivel y tipo: su InstancedMesh, que crece si hace falta
  const capas = new Map(), porNivel = [[], [], []];
  const modelos = new Map(); // especie -> { med, niveles: [[tipos por variante]...] }
  const modelo = (especie) => {
    let m = modelos.get(especie);
    if (m) return m;
    const vs = [];
    for (let v = 0; v < VARIANTES; v++) vs.push(cubosDe(especie, v));
    m = { med: vs[0].med, niveles: [vs.map((x) => x.tipos), vs.map((x) => aligerar(x.tipos)), [bloque(vs[0].tipos, vs[0].med)]] };
    modelos.set(especie, m);
    return m;
  };
  const RADIOS = [[0, CERCA], [CERCA, MEDIO], [MEDIO, LEJOS]];
  function capa(especie, variante, nivel, tipo) {
    const clave = `${especie}|${variante}|${nivel}|${tipo}`;
    let c = capas.get(clave);
    if (c) return c;
    const cubos = modelo(especie).niveles[nivel][variante]?.[tipo];
    if (!cubos?.length) { capas.set(clave, null); return null; }
    const geo = juntar(cubos);
    const [min, max] = especie in SETAS_IDS ? [0, SETAS_HASTA] : RADIOS[nivel];
    const malla = new THREE.InstancedMesh(geo, material(tipo, tiempo, viento, min, max), 16);
    malla.count = 0; malla.frustumCulled = false;
    malla.castShadow = nivel === 0 && tipo !== 'brillo'; malla.receiveShadow = tipo !== 'brillo';
    if (malla.castShadow) malla.customDepthMaterial = material(tipo, tiempo, viento, min, max, true);
    malla.userData.tipo = tipo;
    escena.add(malla);
    c = { malla, n: 0, ns: 0, sig: new Float32Array(16 * 16), triangulos: geo.userData.triangulos };
    capas.set(clave, c); porNivel[nivel].push(c);
    return c;
  }
  const SETAS_IDS = Object.fromEntries(SETAS.map((e) => [e.id, true]));
  const TIPOS = ['solido', 'hoja', 'fruto', 'flor', 'brillo'];
  // las capas de una especie en un nivel y variante (se crean al hacer falta la primera vez)
  const porEspecie = new Map();
  const capasDe = (especie, nivel, v) => {
    const k = especie + '|' + nivel + '|' + v;
    let l = porEspecie.get(k);
    if (!l) { l = nivel === 2 && !ARBOL.has(especie) ? [] : TIPOS.map((t) => capa(especie, v, nivel, t)).filter(Boolean); porEspecie.set(k, l); }
    return l;
  };
  const escalaArbol = escalaDe;
  // (lo que no cambia de un árbol, guardado en él: variante, escala y altura del suelo)
  const dibujoDe = (a) => (a._dibujo = { v: varianteDe(a), esc: escalaArbol(a), alto: a.altura, y: cima(a.x, a.z), capas: [] });
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), eje = new THREE.Vector3(0, 1, 0);
  // las matrices de cada capa se escriben primero en una copia aparte (c.sig) y se pasan a la
  // malla de una vez al acabar: así se puede rehacer un nivel por partes sin que se vea a medias
  function poner(c, x, y, z, giro, escala) {
    if ((c.ns + 1) * 16 > c.sig.length) { const n = new Float32Array(c.sig.length * 2); n.set(c.sig); c.sig = n; }
    mat.compose(p.set(x - ox, y, z - oz), q.setFromAxisAngle(eje, giro), s.set(escala, escala, escala));
    mat.toArray(c.sig, c.ns * 16); c.ns++;
  }
  function pasar(c) {
    if (c.ns > c.malla.instanceMatrix.count) {
      const viejo = c.malla, nuevo = new THREE.InstancedMesh(viejo.geometry, viejo.material, Math.max(16, 2 ** Math.ceil(Math.log2(c.ns))));
      Object.assign(nuevo, { castShadow: viejo.castShadow, receiveShadow: viejo.receiveShadow, frustumCulled: false, customDepthMaterial: viejo.customDepthMaterial, userData: viejo.userData });
      escena.remove(viejo); viejo.dispose(); escena.add(nuevo); c.malla = nuevo;
    }
    c.malla.instanceMatrix.array.set(c.sig.subarray(0, c.ns * 16));
    c.malla.count = c.n = c.ns;
    c.malla.instanceMatrix.needsUpdate = true;
  }
  // rehace las listas de instancias de un nivel alrededor de un punto, por partes (yield cada
  // pocas baldosas)
  let ancla = [null, null, null], pendientes = [], obra = null;
  const medidas = { instancias: 0, triangulos: 0, llamadas: 0, rehechos: 0 };
  const UMBRAL = [6, 15, 60];
  function* rehacer(nivel, fx, fz) {
    const [min, max] = RADIOS[nivel], radio = max + UMBRAL[nivel], dentro = Math.max(0, min - UMBRAL[nivel]);
    for (const c of porNivel[nivel]) c.ns = 0;
    let k = 0;
    for (const b of mapa.baldosasCerca(fx, fz, nivel === 0 ? Math.max(radio, SETAS_HASTA + UMBRAL[0]) : radio)) {
      for (const a of b.arboles) {
        const d = Math.hypot(a.x - fx, a.z - fz);
        if (d > radio || d < dentro) continue;
        if (nivel === 2 && (!ARBOL.has(a.especie) || (a.altura || 0) < DOSEL)) continue;
        const g = a._dibujo || dibujoDe(a);
        for (const c of g.capas[nivel] ||= capasDe(a.especie, nivel, nivel === 2 ? 0 : g.v)) poner(c, a.x, g.y, a.z, a.giro, g.esc);
      }
      if (nivel === 0) for (const st of b.setas) {
        if (Math.hypot(st.x - fx, st.z - fz) > SETAS_HASTA + UMBRAL[0]) continue;
        const v = Math.abs(Math.floor(st.x * 7 + st.z * 13)) % VARIANTES;
        for (const tipo of ['solido', 'flor', 'brillo', 'hoja']) { const c = capa(st.especie, v, 0, tipo); if (c) poner(c, st.x, cima(st.x, st.z), st.z, 0, 1); }
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
    cambiado() { pendientes = [0, 1, 2]; },
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
      for (let n = 0; n < 3; n++) if (!ancla[n]) { for (const _ of rehacer(n, cx, cz)); hechos++; }
      if (!obra && !hechos) {
        let peor = -1, exceso = 0;
        if (pendientes.length) peor = pendientes.shift();
        else for (let n = 0; n < 3; n++) {
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
      for (const b of mapa.baldosasCerca(fx, fz, SETAS_HASTA)) for (const st of b.setas) {
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
