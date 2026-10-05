/* PULSAR UN BOTÓN DE VERDAD, TAMBIÉN EN EL MÓVIL. En Chrome, el primer toque que sigue a un
   deslizamiento rápido (por ejemplo, arrastrar con dos dedos) se toma como «parar la inercia» y no
   genera «click», aunque sí llegan pointerdown y pointerup: el botón no hacía nada. Aquí el botón
   responde al pointerup si el dedo (o el ratón) se levanta sobre el mismo botón sin haberse movido, y
   el click queda de respaldo (sin repetir lo que ya se hizo). Escucha desde un contenedor que no
   cambie: sirve aunque el botón se rehaga entre el toque y el levantar.
   pulsar(contenedor, selector, fn): fn(el) con el botón pulsado.
   Lo que cambie lo que hay bajo el dedo (quitar o rehacer el botón, tapar con una ventana) mejor con
   despues(): un instante más tarde, para que el click de ese mismo toque no lo encuentre a medias. */
export const despues = (fn) => setTimeout(fn, 60);

export function pulsar(contenedor, selector, fn) {
  let abajo = null, hecho = 0;
  contenedor.addEventListener('pointerdown', (e) => {
    const b = e.target.closest?.(selector);
    abajo = b && contenedor.contains(b) ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
  });
  contenedor.addEventListener('pointerup', (e) => {
    const a = abajo; abajo = null;
    if (!a || e.pointerId !== a.id || Math.hypot(e.clientX - a.x, e.clientY - a.y) > 12) return;
    const b = e.target.closest?.(selector);
    if (!b || !contenedor.contains(b)) return;
    hecho = performance.now();
    fn(b);
  });
  contenedor.addEventListener('pointercancel', () => { abajo = null; });
  contenedor.addEventListener('click', (e) => {
    const b = e.target.closest?.(selector);
    if (!b || !contenedor.contains(b) || performance.now() - hecho < 700) return;
    fn(b);
  });
}
