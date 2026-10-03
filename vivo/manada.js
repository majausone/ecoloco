/* LOS ANIMALES EN PANTALLA. Todos los animales del mapa, con su línea de tiempo del día
   (fotogramas clave del trabajador: cuándo, dónde, rumbo, estado). Se dibujan así:
   - los más cercanos (hasta CERCANOS, a menos de CERCA m), con el modelo articulado del
     Observer y su animación (vivo/animaciones.js);
   - el resto, con una versión de 3 cajas de su especie (cuerpo, cabeza y patas, con sus
     colores), dibujada con instancias: una sola llamada de dibujo por especie, aunque sean
     miles;
   - más allá de lo que se distingue (según su tamaño), nada.
   La posición de cada animal se interpola entre sus fotogramas clave. */

import * as THREE from '../graficos/pruebas-morta/vendor/three.module.js';
import { ANIMALES } from '../graficos/pruebas-morta/borneo/especies.js?v=202610032007';
import { crearAnimal } from '../graficos/pruebas-morta/borneo/animales.js?v=202610032007';
import { CLAVE, TICS } from '../mundo/dia.js?v=202610032007';
import { ESTADOS, COMPORTAMIENTO } from '../mundo/especies.js?v=202610032007';
import { fundir } from './fundir.js?v=202610032007';
import { animar } from './animaciones.js?v=202610032007';

const CERCA = 30, CERCANOS = 60;
// los pequeños, más grandes para que se vean (como en el bioma del Observer)
export const ESCALA = { insecto: 2.6, gusano: 2.6, alado: 2.2, rana: 1.8, reptil: 1.2, serpiente: 1.1 };
const E_DORMIR = ESTADOS.indexOf('dormir'), E_MUERTO = ESTADOS.indexOf('muerto'), E_MORIR = ESTADOS.indexOf('morir'), E_IRSE = ESTADOS.indexOf('irse');
const angulo = (a, b, f) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * f; };

export function crearManada({ escena, ox, oz, cima }) {
  const especies = new Map(); // id -> { e, tam, color, simple: InstancedMesh, ids: [] }
  // ---- por especie: medidas, colores y la versión de 3 cajas
  function especie(id) {
    let s = especies.get(id);
    if (s) return s;
    const e = ANIMALES.find((x) => x.id === id);
    if (!e) { especies.set(id, null); return null; }
    const m = fundir(crearAnimal(e));
    const esc = ESCALA[e.modelo.rig] ?? 1;
    const tam = m.tam || new THREE.Vector3(0.3, 0.3, 0.3);
    // el color: la media de los colores del modelo, y uno más oscuro para las patas
    const media = new THREE.Color(0, 0, 0); let n = 0;
    m.raiz.traverse((o) => { const c = o.geometry?.attributes?.color; if (!c) return; for (let k = 0; k < c.count; k += 7) { media.r += c.getX(k); media.g += c.getY(k); media.b += c.getZ(k); n++; } });
    if (n) media.multiplyScalar(1 / n); else media.set('#6a5a4a');
    const oscuro = media.clone().multiplyScalar(0.6), claro = media.clone().lerp(new THREE.Color('#ffffff'), 0.15);
    const L = tam.x * esc, H = tam.y * esc, W = tam.z * esc;
    const cajas = [
      [0, H * 0.55, 0, L * 0.7, H * 0.5, W * 0.9, media],
      [L * 0.42, H * 0.72, 0, L * 0.26, H * 0.4, W * 0.7, claro],
      [0, H * 0.16, 0, L * 0.55, H * 0.32, W * 0.6, oscuro],
    ];
    const geo = juntar(cajas);
    const simple = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), 64);
    simple.count = 0; simple.frustumCulled = false; simple.castShadow = false; simple.receiveShadow = true;
    escena.add(simple);
    // los modelos articulados que sobran (se reutilizan) y la distancia hasta la que se ve
    s = { e, esc, tam: Math.max(L, H, W), simple, ids: [], libres: [m], lejos: Math.max(25, Math.max(L, H, W) * 160), hogar: COMPORTAMIENTO[id]?.hogar };
    especies.set(id, s);
    return s;
  }
  const CAJA = new THREE.BoxGeometry(1, 1, 1);
  function juntar(cajas) {
    const g = new THREE.BufferGeometry(), P = CAJA.attributes.position, N = CAJA.attributes.normal, I = CAJA.index.array, nv = P.count;
    const pos = new Float32Array(cajas.length * nv * 3), nor = new Float32Array(cajas.length * nv * 3), col = new Float32Array(cajas.length * nv * 3), idx = [];
    cajas.forEach(([x, y, z, sx, sy, sz, c], j) => {
      for (let k = 0; k < nv; k++) {
        const o = (j * nv + k) * 3;
        pos[o] = x + P.getX(k) * sx; pos[o + 1] = y + P.getY(k) * sy; pos[o + 2] = z + P.getZ(k) * sz;
        nor[o] = N.getX(k); nor[o + 1] = N.getY(k); nor[o + 2] = N.getZ(k); col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
      }
      for (let k = 0; k < I.length; k++) idx.push(I[k] + j * nv);
    });
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
    return g;
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
      if (!a) animales.set(id, (a = { id, s, i: 0, x: 0, y: 0, z: 0, rumbo: 0, estado: 0, valor: 0, visible: false, modelo: null, desc }));
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
    a.rumbo = angulo(k[o + 4], k[p + 4], f);
    return true;
  }

  // ---- modelos articulados para los cercanos
  function tomarModelo(a) {
    const s = a.s;
    let m = s.libres.pop();
    if (!m) m = fundir(crearAnimal(s.e));
    m.raiz.scale.setScalar(s.esc); m.raiz.userData.bs = m.raiz.scale.clone();
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
  const tumbado = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const medidas = { dibujados: 0, articulados: 0, instancias: 0 };
  let cuadro = 0;
  return {
    medidas, animales, ponerDia, pose,
    get dia() { return dia; },
    // cada fotograma: tic, posición de la cámara (escena), qué animales siempre de cerca
    actualizar(tic, cam, dt, siempre = new Set()) {
      if (!dia) return;
      cuadro++;
      for (const s of especies.values()) if (s) { s.ids.length = 0; s.n = 0; }
      // los candidatos a modelo articulado: los más cercanos
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
        if (d < CERCA || siempre.has(a.id)) cerca.push(a);
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
        const y = cima(a.x, a.z) + a.y + dentro;
        if (articulados.has(a.id)) {
          if (!a.modelo) tomarModelo(a);
          const mo = a.modelo;
          mo.g.position.set(a.x - ox, y, a.z - oz); mo.g.rotation.y = -a.rumbo;
          animar(mo, a.estado, dt);
          nArt++;
          continue;
        }
        if (a.modelo) soltarModelo(a);
        // la versión de cajas (los muertos, tumbados)
        const s = a.s;
        if (s.n >= s.simple.instanceMatrix.count) {
          const nuevo = new THREE.InstancedMesh(s.simple.geometry, s.simple.material, s.simple.instanceMatrix.count * 2);
          Object.assign(nuevo, { frustumCulled: false, castShadow: false, receiveShadow: true });
          escena.remove(s.simple); s.simple.dispose(); escena.add(nuevo); s.simple = nuevo;
        }
        q.setFromAxisAngle(eje, -a.rumbo);
        if (a.estado === E_MUERTO || a.estado === E_MORIR) q.multiply(tumbado);
        mat.compose(p.set(a.x - ox, y, a.z - oz), q, sc);
        s.simple.setMatrixAt(s.n, mat); s.ids[s.n] = a.id; s.n++;
      }
      let inst = 0;
      for (const s of especies.values()) if (s) { s.simple.count = s.n; s.simple.instanceMatrix.needsUpdate = true; inst += s.n; }
      medidas.dibujados = dibujados; medidas.articulados = nArt; medidas.instancias = inst;
    },
    // qué animal hay en una instancia o en un modelo (para seleccionarlo con el ratón)
    idDe(obj, instancia) {
      for (const s of especies.values()) if (s && s.simple === obj) return s.ids[instancia];
      let o = obj; while (o && o.userData.id === undefined) o = o.parent;
      return o?.userData.id;
    },
    // el largo del animal dibujado de una especie (para el tamaño de su hogar)
    tamDe(id) { const s = especie(id); return s ? s.tam : 0.3; },
    objetos() { const out = []; for (const s of especies.values()) if (s) out.push(s.simple); for (const a of animales.values()) if (a.modelo) out.push(a.modelo.g); return out; },
  };
}
