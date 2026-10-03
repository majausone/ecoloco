/* Navegar con los dedos (móvil y tableta), igual que con el ratón:
   - un dedo gira la cámara sobre sí misma, como mantener el botón derecho del ratón y moverlo
     (mirar a los lados y arriba o abajo, sin moverse del sitio);
   - pellizcar con dos dedos avanza o retrocede hacia donde se mira (abrir los dedos, adelante;
     cerrarlos, atrás), como la rueda del ratón.
   Un toque sin arrastrar sigue siendo un clic (selecciona el animal o la planta). */

export function crearTactil({ lienzo, camara, foco, alMover }) {
  // camara(): la CamaraUnity; foco(): el punto al que se mira, en coordenadas de la escena
  const dedos = new Map();
  let antes = null, multi = false;
  const separacion = () => { const [a, b] = [...dedos.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
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
    // pellizco: adelante o atrás, hacia donde se mira (más deprisa cuanto más lejos está el suelo)
    const d = separacion(), paso = d - antes;
    antes = d;
    if (!paso) return;
    const lejos = Math.max(4, Math.min(300, c.pos.distanceTo(foco())));
    if (c.persp) c.pos.addScaledVector(c.mira(), paso * lejos / Math.max(300, lienzo.clientHeight) * 1.5);
    else c.ortoAlto = Math.min(80, Math.max(3, c.ortoAlto * Math.exp(-paso * 0.004)));
    alMover();
  });
  return { get multi() { return multi; } };
}
