/* Junta las piezas de un modelo del Observer para que se pinte con muchas menos llamadas:
   en cada articulación (y en la raíz) todas las cajas que cuelgan de ella sin otra
   articulación por medio se funden en una sola malla, con el color de cada caja en los
   vértices y un único material por modelo. Las animaciones siguen igual porque solo mueven
   articulaciones. Para el gris de «morir» el material único hace de m.mats (su color
   multiplica a los de los vértices). Hay que llamarlo después de crearAnimal (fijar ya
   hecho): las mallas nuevas no tienen postura guardada y restaurar() no las toca. */

import * as THREE from '../graficos/pruebas-morta/vendor/three.module.js';

export function fundir(m) {
  const articulaciones = new Set([m.raiz, ...Object.values(m.piv)]);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.userData.base = new THREE.Color(1, 1, 1);
  const quitar = [];
  for (const g of articulaciones) {
    const piezas = [];
    // las cajas que cuelgan de g (y las motas pegadas a ellas), con su matriz respecto a g
    const recorrer = (o, matriz) => {
      for (const h of o.children) {
        if (articulaciones.has(h) || !h.isMesh) continue;
        h.updateMatrix();
        const mm = matriz.clone().multiply(h.matrix);
        piezas.push([h, mm]);
        recorrer(h, mm);
      }
    };
    recorrer(g, new THREE.Matrix4());
    if (!piezas.length) continue;
    let nv = 0, ni = 0;
    for (const [h] of piezas) { nv += h.geometry.attributes.position.count; ni += h.geometry.index ? h.geometry.index.count : h.geometry.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let ov = 0, oi = 0;
    const v = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (const [h, mm] of piezas) {
      const geo = h.geometry, P = geo.attributes.position, N = geo.attributes.normal;
      nm.getNormalMatrix(mm);
      // (alguna caja de las aves trae un color en lugar de un material: se toma tal cual)
      const c = h.material.color || (h.material.isColor ? h.material : new THREE.Color(1, 1, 1)), cv = geo.attributes.color; // las piezas esculpidas traen su color por vértice
      for (let k = 0; k < P.count; k++) {
        v.fromBufferAttribute(P, k).applyMatrix4(mm); pos.set([v.x, v.y, v.z], (ov + k) * 3);
        v.fromBufferAttribute(N, k).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (ov + k) * 3);
        col.set(cv ? [c.r * cv.getX(k), c.g * cv.getY(k), c.b * cv.getZ(k)] : [c.r, c.g, c.b], (ov + k) * 3);
      }
      if (geo.index) for (let k = 0; k < geo.index.count; k++) idx[oi++] = geo.index.array[k] + ov;
      else for (let k = 0; k < P.count; k++) idx[oi++] = k + ov;
      ov += P.count;
      quitar.push(h);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const malla = new THREE.Mesh(geo, material);
    malla.castShadow = true; malla.receiveShadow = true;
    g.add(malla);
  }
  for (const h of quitar) { h.removeFromParent(); h.geometry.dispose(); }
  for (const mat of m.mats) mat.dispose();
  m.mats = [material];
  return m;
}
