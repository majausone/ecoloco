/* Navegar con los dedos (móvil y tableta), como en un mapa:
   - un dedo arrastra el suelo (la cámara se desplaza sin girar);
   - dos dedos: pellizcar acerca o aleja, girarlos rota la vista alrededor del punto al que
     se mira, y moverlos los dos arriba o abajo inclina la cámara.
   Un toque sin arrastrar sigue siendo un clic (selecciona el animal o la planta). */

import * as THREE from '../graficos/pruebas-morta/vendor/three.module.js';

export function crearTactil({ lienzo, camara, foco, alMover }) {
  // camara(): la CamaraUnity; foco(): el punto al que se mira, en coordenadas de la escena
  const dedos = new Map();
  let antes = null, multi = false;
  const dos = () => {
    const [a, b] = [...dedos.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  lienzo.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dedos.size >= 2) { multi = true; antes = dos(); }
    else { multi = false; antes = null; }
  });
  const soltar = (e) => {
    if (e.pointerType !== 'touch') return;
    dedos.delete(e.pointerId);
    antes = dedos.size >= 2 ? dos() : null;
  };
  lienzo.addEventListener('pointerup', soltar);
  lienzo.addEventListener('pointercancel', soltar);
  lienzo.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' || !dedos.has(e.pointerId)) return;
    const c = camara();
    if (!c) return;
    const p = dedos.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    const F = foco(), dist = Math.max(2, c.pos.distanceTo(F));
    if (dedos.size === 1 && !multi) {
      // arrastrar el suelo: lo que hay bajo el dedo lo sigue
      if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
      const k = (dist * 1.1) / Math.max(200, lienzo.clientHeight);
      const delante = new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw));
      c.pos.addScaledVector(c.derecha(), -dx * k).addScaledVector(delante, dy * k);
      alMover();
      return;
    }
    if (dedos.size < 2 || !antes) return;
    const ahora = dos();
    // pellizco: acercarse o alejarse del punto al que se mira
    const f = ahora.d / Math.max(1, antes.d), nueva = Math.min(900, Math.max(3, dist / f));
    // girar los dos dedos: rotar alrededor de ese punto
    let giro = ahora.ang - antes.ang;
    if (giro > Math.PI) giro -= 2 * Math.PI; else if (giro < -Math.PI) giro += 2 * Math.PI;
    c.yaw -= giro;
    // los dos arriba o abajo: inclinar
    c.pitch = Math.min(-0.08, Math.max(-1.5, c.pitch + (ahora.y - antes.y) * 0.004));
    c.pos.copy(F).addScaledVector(c.mira(), -nueva);
    if (!c.persp) c.ortoAlto = Math.min(80, Math.max(3, c.ortoAlto / f));
    antes = ahora;
    alMover();
  });
  return { get multi() { return multi; } };
}
