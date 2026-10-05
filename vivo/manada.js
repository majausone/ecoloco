/* LOS ANIMALES EN PANTALLA. Todos los animales del mapa, con su línea de tiempo del día
   (fotogramas clave del trabajador: cuándo, dónde, rumbo, estado). Se dibujan así:
   - los más cercanos (hasta CERCANOS, a menos de CERCA_X veces su tamaño y como mucho CERCA m),
     con su modelo suave con esqueleto
     (graficos/pruebas-morta/borneo/animales.js) y su animación (vivo/animaciones.js): una
     llamada de dibujo cada uno;
   - a media distancia (hasta MEDIO_X veces su tamaño), la malla de ~100 triángulos con las
     animaciones grabadas en una textura (lejos.js): toda la especie en una llamada, aunque sean
     miles, cada uno con su animación;
   - más lejos, hasta lo que se distingue (según su tamaño), un recorte plano de 2 triángulos;
   - más allá, nada.
   La posición de cada animal se interpola entre sus fotogramas clave. */

import * as THREE from '../graficos/pruebas-morta/vendor/three.module.js';
import { ANIMALES } from '../graficos/pruebas-morta/borneo/especies.js?v=202610052338';
import { crearAnimal } from '../graficos/pruebas-morta/borneo/animales.js?v=202610052338';
import { hornearVAT, filaVAT, materialVAT, hacerImpostor, materialImpostor } from '../graficos/pruebas-morta/borneo/lejos.js?v=202610052338';
import { CLAVE } from '../mundo/dia.js?v=202610052338';
import { ESTADOS, COMPORTAMIENTO } from '../mundo/especies.js?v=202610052338';
import { fundir } from './fundir.js?v=202610052338';
import { animar, COMO_SE_VE } from './animaciones.js?v=202610052338';
import { conTransparencia } from './transparencia.js?v=202610052338';

// hasta dónde va cada nivel, en veces el tamaño del animal (con un mínimo y un máximo en metros)
const CERCA = 30, CERCANOS = 60, CERCA_X = 35, MEDIO_X = 35;
// los pequeños, más grandes para que se vean (como en el bioma del Observer)
export const ESCALA = { insecto: 2.6, gusano: 2.6, alado: 2.2, rana: 1.8, reptil: 1.2, serpiente: 1.1 };
const E_DORMIR = ESTADOS.indexOf('dormir'), E_IRSE = ESTADOS.indexOf('irse');
// los estados en los que se anda (o se trepa o se nada): ahí el paso de las patas va con lo que de verdad avanza
const ANDANDO = new Set(['andar', 'correr', 'huir', 'acechar', 'trepar', 'nadar', 'llegar', 'irse'].map((n) => ESTADOS.indexOf(n)));
// (corriendo, la animación es la de correr: su paso normal, unos 2,5 tamaños de cuerpo por segundo)
const CORRIENDO = new Set(['correr', 'huir', 'atacar'].map((n) => ESTADOS.indexOf(n)));
// el ritmo de la animación de andar según lo que avanza en pantalla (con su tamaño DIBUJADO, s.tam): a su
// ritmo normal a unos 0,8 tamaños de cuerpo por segundo (corriendo, 2,5), más deprisa si va más deprisa (hasta 3 veces) y más
// despacio si va más despacio; parado, las patas quietas (si no, patinan: andan en el sitio o se deslizan)
function pasoDe(a, dt) {
  const px = a._px ?? a.x, pz = a._pz ?? a.z, py = a._py ?? a.y;
  a._px = a.x; a._pz = a.z; a._py = a.y;
  const v = Math.hypot(a.x - px, a.z - pz, a.y - py) / Math.max(dt, 1e-3);
  a.velVis = a.velVis == null ? v : a.velVis * 0.8 + v * 0.2;
  if (!ANDANDO.has(a.estado)) return 1;
  const k = a.velVis / (a.s.tam * (CORRIENDO.has(a.estado) ? 2.5 : 0.8));
  return k < 0.04 ? 0 : Math.min(3, k);
}
const angulo = (a, b, f) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * f; };

// encima(x, z): la altura de algo por lo que se anda por encima del suelo (un tronco-puente, vivo/puentes.js) o null
// colgando(x, z): la altura de una liana por la que se cruza en alto (vivo/lianas.js) o null
export function crearManada({ escena, ox, oz, cima, renderer = null, encima = null, colgando = null }) {
  const especies = new Map(); // id -> { e, esc, tam, vat, imp, ids..., libres }
  // un InstancedMesh que crece si hace falta
  const crecer = (malla, n) => {
    if (n <= malla.instanceMatrix.count) return malla;
    const nuevo = new THREE.InstancedMesh(malla.geometry, malla.material, Math.max(64, 2 ** Math.ceil(Math.log2(n))));
    for (const [k, a] of Object.entries(malla.geometry.attributes)) if (a.isInstancedBufferAttribute) {
      const b = new THREE.InstancedBufferAttribute(new Float32Array(nuevo.instanceMatrix.count * a.itemSize), a.itemSize); b.array.set(a.array); b.setUsage(THREE.DynamicDrawUsage); malla.geometry.setAttribute(k, b);
    }
    nuevo.instanceMatrix.array.set(malla.instanceMatrix.array); // (lo ya puesto en este fotograma)
    Object.assign(nuevo, { frustumCulled: false, castShadow: false, receiveShadow: malla.receiveShadow });
    escena.remove(malla); malla.dispose(); escena.add(nuevo);
    return nuevo;
  };
  // ---- por especie: medidas, la malla de media distancia (con sus animaciones en textura) y el recorte
  function especie(id) {
    let s = especies.get(id);
    if (s) return s;
    const e = ANIMALES.find((x) => x.id === id);
    if (!e) { especies.set(id, null); return null; }
    const m = fundir(crearAnimal(e));
    const esc = ESCALA[e.modelo.rig] ?? 1;
    const tam = m.tam || new THREE.Vector3(0.3, 0.3, 0.3);
    const L = tam.x * esc, H = tam.y * esc, W = tam.z * esc, grande = Math.max(L, H, W);
    // media distancia: la malla ligera, por instancias, con su fotograma (aVat) por instancia
    const vat = hornearVAT(e, m);
    const geoV = vat.geo.clone();
    const aVat = new THREE.InstancedBufferAttribute(new Float32Array(64 * 3), 3); aVat.setUsage(THREE.DynamicDrawUsage);
    geoV.setAttribute('aVat', aVat);
    const mallaV = new THREE.InstancedMesh(geoV, conTransparencia(materialVAT(e, vat)), 64);
    Object.assign(mallaV, { frustumCulled: false, castShadow: false, receiveShadow: true }); mallaV.count = 0;
    escena.add(mallaV);
    // muy lejos: el recorte (si hay renderer para pintarlo)
    let mallaI = null;
    // (sin impostor: quitado a petición; todos con su malla en 3D)
    if (false) {
      const imp = hacerImpostor(e, renderer, m);
      mallaI = new THREE.InstancedMesh(imp.geo, conTransparencia(materialImpostor(imp.textura)), 64);
      Object.assign(mallaI, { frustumCulled: false, castShadow: false, receiveShadow: false }); mallaI.count = 0;
      escena.add(mallaI);
    }
    s = { e, esc, tam: grande, vat, mallaV, mallaI, idsV: [], idsI: [], nV: 0, nI: 0, libres: [m], lejos: 5000, cerca: Math.min(CERCA, Math.max(6, grande * CERCA_X)), medio: Math.max(Math.min(CERCA, Math.max(6, grande * CERCA_X)), grande * MEDIO_X), hogar: COMPORTAMIENTO[id]?.hogar,
      base: {}, anims: { anims: vat.anims } };
    especies.set(id, s);
    return s;
  }
  // la animación de un estado para la malla de media distancia (la misma que elegiría el modelo de cerca)
  function animDe(s, estado) {
    let a = s.base[estado];
    if (a) return a;
    const nombre = ESTADOS[estado] || 'quieto', como = COMO_SE_VE[nombre] || COMO_SE_VE.quieto;
    a = typeof como.base === 'function' ? como.base(s.anims) : como.base;
    if (!s.vat.filas[a]) a = 'quieto';
    return (s.base[estado] = { anim: a, ritmo: como.ritmo || 1, fijo: !!como.fijo });
  }

  // ---- los animales del día
  let dia = null;
  const animales = new Map(); // id -> { id, s, k (claves), i (cursor), x, y, z, rumbo, estado, valor, visible, modelo }
  function ponerDia(d) {
    dia = d;
    const nuevos = new Set(d.ids);
    for (const [id, a] of animales) if (!nuevos.has(id)) { soltarModelo(a); animales.delete(id); }
    d.ids.forEach((id, j) => {
      const desc = d.agentes[id];
      if (!desc) return;
      const s = especie(desc.especie);
      if (!s) return;
      let a = animales.get(id);
      // (un id que ahora es de otro animal, tras volver atrás en el tiempo: se rehace)
      if (a && a.s !== s) { soltarModelo(a); animales.delete(id); a = null; }
      if (!a) animales.set(id, (a = { id, s, i: 0, x: 0, y: 0, z: 0, rumbo: 0, estado: 0, valor: 0, visible: false, modelo: null, desc, vEstado: -1, vReloj: Math.random() * 3 }));
      a.k = d.claves[j]; a.i = 0; a.desc = desc;
    });
  }

  // la pose de un animal en un tic (interpolando); false si no está (aún no ha nacido, se ha ido)
  function pose(a, tic) {
    const k = a.k, n = k.length / CLAVE;
    if (!n || tic < k[0] - 0.5) return false;
    if (a.i >= n || k[a.i * CLAVE] > tic) a.i = 0;
    while (a.i < n - 1 && k[(a.i + 1) * CLAVE] <= tic) a.i++;
    const o = a.i * CLAVE;
    a.estado = k[o + 5]; a.valor = k[o + 6];
    if (a.i === n - 1) {
      // el último: si se ha ido (o ha muerto hace rato), ya no está
      if (a.estado === E_IRSE && tic > k[o] + 1) return false;
      a.x = k[o + 1]; a.y = k[o + 2]; a.z = k[o + 3]; a.rumbo = k[o + 4];
      return true;
    }
    const p = o + CLAVE, f = Math.min(1, (tic - k[o]) / Math.max(1e-6, k[p] - k[o]));
    a.x = k[o + 1] + (k[p + 1] - k[o + 1]) * f; a.y = k[o + 2] + (k[p + 2] - k[o + 2]) * f; a.z = k[o + 3] + (k[p + 3] - k[o + 3]) * f;
    // hacia dónde mira: si en este tramo se desplaza, hacia donde va (el tramo es una recta de un
    // fotograma clave al siguiente; mezclar el rumbo de un extremo con el del otro lo hacía andar de
    // lado o de espaldas cuando arrancaba en otra dirección de la que miraba); si no, el de los extremos
    const dx = k[p + 1] - k[o + 1], dz = k[p + 3] - k[o + 3];
    a.rumbo = Math.hypot(dx, dz) > 0.05 ? Math.atan2(dz, dx) : angulo(k[o + 4], k[p + 4], f);
    return true;
  }

  // ---- modelos con esqueleto para los cercanos
  function tomarModelo(a) {
    const s = a.s;
    let m = s.libres.pop();
    if (!m) m = fundir(crearAnimal(s.e));
    m.raiz.scale.setScalar(s.esc); m.raiz.userData.bs = m.raiz.scale.clone();
    // (la sombra de los diminutos ni se ve: solo la echan los de más de 35 cm)
    if (m.suave) m.suave.malla.castShadow = s.tam > 0.35;
    const g = new THREE.Group(); g.add(m.raiz); g.userData.id = a.id;
    escena.add(g);
    a.modelo = { m, g, tam: s.tam, estado: null, reloj: 0, desde: 0 };
  }
  function soltarModelo(a) {
    if (!a.modelo) return;
    escena.remove(a.modelo.g); a.modelo.g.remove(a.modelo.m.raiz);
    a.s.libres.push(a.modelo.m);
    a.modelo = null;
  }

  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), eje = new THREE.Vector3(0, 1, 0);
  const medidas = { dibujados: 0, articulados: 0, instancias: 0, medios: 0, recortes: 0 };
  let cuadro = 0;
  return {
    medidas, animales, ponerDia, pose,
    get dia() { return dia; },
    // cada fotograma: tic, posición de la cámara (escena), qué animales siempre de cerca
    actualizar(tic, cam, dt, siempre = new Set()) {
      if (!dia) return;
      cuadro++;
      for (const s of especies.values()) if (s) { s.nV = 0; s.nI = 0; }
      // los candidatos a modelo con esqueleto: los más cercanos
      const cerca = [];
      for (const a of animales.values()) {
        // los lejanos se recalculan uno de cada 6 fotogramas (no se nota a esa distancia)
        const dx = a.x - ox - cam.x, dz = a.z - oz - cam.z, d2 = dx * dx + dz * dz;
        const lejos = a.s.lejos;
        if (a.visible === false && d2 > (lejos + 60) ** 2 && (cuadro + a.k.length) % 6 && !siempre.has(a.id)) continue;
        a.visible = pose(a, tic);
        if (!a.visible) continue;
        const ex = a.x - ox - cam.x, ez = a.z - oz - cam.z, d = Math.sqrt(ex * ex + ez * ez + (a.y - cam.y) ** 2);
        a.dist = d;
        if (d > lejos && !siempre.has(a.id)) { a.visible = false; continue; }
        if (d < a.s.cerca || siempre.has(a.id)) cerca.push(a);
      }
      cerca.sort((x, y) => x.dist - y.dist);
      const articulados = new Set(cerca.slice(0, CERCANOS).map((a) => a.id));
      for (const id of siempre) if (animales.has(id)) articulados.add(id);
      let dibujados = 0, nArt = 0;
      for (const a of animales.values()) {
        if (!a.visible) { if (a.modelo) soltarModelo(a); continue; }
        // durmiendo en casa: dentro de la madriguera (hundido en la boca) o del termitero (no se ve)
        let dentro = 0;
        const h = a.desc.hogar;
        if (a.estado === E_DORMIR && h && (a.s.hogar === 'madriguera' || a.s.hogar === 'termitero') && Math.hypot(a.x - h.x, a.z - h.z) < 1.5) {
          if (a.s.hogar === 'termitero') { if (a.modelo) soltarModelo(a); continue; }
          dentro = -a.s.tam * 0.55;
        }
        dibujados++;
        // (encima de un tronco-puente, por encima de él: los que lo cruzan andando, sobre su lomo; los que
        // vuelan bajo por encima del río, sin atravesarlo; las lombrices, que van enterradas, también por encima)
        const sobre = encima?.(a.x, a.z);
        let y = Math.max(cima(a.x, a.z) + a.y + dentro, sobre != null ? sobre + (a.y < 0.5 ? Math.max(0, a.y) : 0.05) : -Infinity);
        const ritmo = pasoDe(a, dt);
        // (cruzando en alto por una liana: sobre ella, que cuelga en curva)
        const enLiana = a.y > 1 ? colgando?.(a.x, a.z) : null;
        if (enLiana != null) y = enLiana + 0.04;
        a.yVis = y; // (la altura a la que se dibuja: para las pruebas)
        // (el giro, suave: en unas décimas de segundo, sin saltos al empezar un tramo nuevo)
        a.rumboVis = a.rumboVis == null ? a.rumbo : angulo(a.rumboVis, a.rumbo, 1 - Math.exp(-dt * 10));
        if (articulados.has(a.id)) {
          if (!a.modelo) tomarModelo(a);
          const mo = a.modelo;
          mo.g.position.set(a.x - ox, y, a.z - oz); mo.g.rotation.y = -a.rumboVis;
          animar(mo, a.estado, dt * ritmo);
          nArt++;
          continue;
        }
        if (a.modelo) soltarModelo(a);
        const s = a.s;
        q.setFromAxisAngle(eje, -a.rumboVis);
        mat.compose(p.set(a.x - ox, y, a.z - oz), q, sc.setScalar(s.esc));
        if (a.dist < s.medio || !s.mallaI) {
          // media distancia: su animación grabada (el reloj de cada uno, como el del modelo de cerca)
          const b = animDe(s, a.estado);
          if (a.vEstado !== a.estado) { a.vEstado = a.estado; a.vDesde = 0; }
          a.vDesde += dt * b.ritmo * ritmo; a.vReloj += dt * b.ritmo * ritmo;
          if (s.nV >= s.mallaV.instanceMatrix.count) s.mallaV = crecer(s.mallaV, s.nV + 1);
          s.mallaV.setMatrixAt(s.nV, mat);
          filaVAT(s.vat, b.anim, s.vat.filas[b.anim]?.bucle ? a.vReloj : (b.fijo ? 100 : a.vDesde), s.mallaV.geometry.attributes.aVat.array, s.nV * 3);
          s.idsV[s.nV++] = a.id;
        } else {
          if (s.nI >= s.mallaI.instanceMatrix.count) s.mallaI = crecer(s.mallaI, s.nI + 1);
          s.mallaI.setMatrixAt(s.nI, mat);
          s.idsI[s.nI++] = a.id;
        }
      }
      let inst = 0, medios = 0, recortes = 0;
      for (const s of especies.values()) if (s) {
        // (las vacías, ocultas: si no, cada una sigue costando su llamada de dibujo)
        s.mallaV.count = s.nV; s.mallaV.visible = s.nV > 0; medios += s.nV;
        if (s.nV) { s.mallaV.instanceMatrix.needsUpdate = true; s.mallaV.geometry.attributes.aVat.needsUpdate = true; }
        if (s.mallaI) { s.mallaI.count = s.nI; s.mallaI.visible = s.nI > 0; if (s.nI) s.mallaI.instanceMatrix.needsUpdate = true; recortes += s.nI; }
        inst += s.nV + s.nI;
      }
      Object.assign(medidas, { dibujados, articulados: nArt, instancias: inst, medios, recortes });
    },
    // qué animal hay en una instancia o en un modelo (para seleccionarlo con el ratón)
    idDe(obj, instancia) {
      for (const s of especies.values()) if (s) { if (s.mallaV === obj) return s.idsV[instancia]; if (s.mallaI === obj) return s.idsI[instancia]; }
      let o = obj; while (o && o.userData.id === undefined) o = o.parent;
      return o?.userData.id;
    },
    // el largo del animal dibujado de una especie (para el tamaño de su hogar)
    tamDe(id) { const s = especie(id); return s ? s.tam : 0.3; },
    objetos() { const out = []; for (const s of especies.values()) if (s) { out.push(s.mallaV); if (s.mallaI) out.push(s.mallaI); } for (const a of animales.values()) if (a.modelo) out.push(a.modelo.g); return out; },
  };
}
