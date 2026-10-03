/* Navegar con los dedos (móvil y tableta), igual que con el ratón:
   - un dedo gira la cámara sobre sí misma, como mantener el botón derecho del ratón y moverlo
     (mirar a los lados y arriba o abajo, sin moverse del sitio);
   - pellizcar con dos dedos avanza o retrocede hacia donde se mira (abrir los dedos, adelante;
     cerrarlos, atrás), como la rueda del ratón;
   - arrastrar con dos dedos desplaza la cámara (lo que se ve sigue a los dedos), como el botón
     central del ratón. Pellizcar y arrastrar se pueden hacer a la vez.
   Un toque sin arrastrar sigue siendo un clic (selecciona el animal o la planta). */

import * as THREE from '../graficos/pruebas-morta/vendor/three.module.js';

export function crearTactil({ lienzo, camara, foco, alMover }) {
  // camara(): la CamaraUnity; foco(): el punto al que se mira, en coordenadas de la escena
  const dedos = new Map();
  let antes = null, multi = false;
  // la separación de los dos dedos y su punto medio
  const separacion = () => { const [a, b] = [...dedos.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  lienzo.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dedos.size >= 2) { multi = true; antes = separacion(); }
    else { multi = false; antes = null; }
  });
  const soltar = (e) => {
    if (e.pointerType !== 'touch') return;
    dedos.delete(e.pointerId);
    antes = dedos.size >= 2 ? separacion() : null;
  };
  lienzo.addEventListener('pointerup', soltar);
  lienzo.addEventListener('pointercancel', soltar);
  lienzo.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' || !dedos.has(e.pointerId)) return;
    const c = camara();
    if (!c) return;
    const p = dedos.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (dedos.size === 1 && !multi) {
      // un dedo: girar la cámara (a la misma velocidad que el ratón con el botón derecho)
      if (Math.abs(dx) + Math.abs(dy) < 0.3) return;
      c.yaw -= dx * 0.005;
      c.pitch = Math.min(1.5, Math.max(-1.5, c.pitch - dy * 0.005));
      alMover();
      return;
    }
    if (dedos.size < 2 || antes == null) return;
    const ahora = separacion(), paso = ahora.d - antes.d, mx = ahora.x - antes.x, my = ahora.y - antes.y;
    antes = ahora;
    if (!paso && !mx && !my) return;
    // (más deprisa cuanto más lejos está el suelo al que se mira)
    const lejos = Math.max(4, Math.min(300, c.pos.distanceTo(foco()))), k = lejos / Math.max(300, lienzo.clientHeight);
    // pellizco: adelante o atrás, hacia donde se mira
    if (c.persp) c.pos.addScaledVector(c.mira(), paso * k * 1.5);
    else c.ortoAlto = Math.min(80, Math.max(3, c.ortoAlto * Math.exp(-paso * 0.004)));
    // arrastrar los dos: desplazar la cámara de lado y arriba o abajo (lo que se ve sigue a los dedos)
    const kd = c.persp ? k : c.ortoAlto / Math.max(300, lienzo.clientHeight);
    const arriba = new THREE.Vector3().crossVectors(c.derecha(), c.mira());
    c.pos.addScaledVector(c.derecha(), -mx * kd).addScaledVector(arriba, my * kd);
    alMover();
  });
  return { get multi() { return multi; } };
}
