/* LA PESTAÑA «OPCIONES» del panel: de momento, cosas para probar cómo se ve, que no tocan la
   simulación. La hierba (sí o no, altura, densidad, grosor, manchas por zonas y de color), el tiempo (el del motor o a mano: lluvia, nieve,
   niebla y nubes), el viento, las sombras, el antialias y la transparencia de lo que tapa al seleccionado.
   Se guarda en el navegador (localStorage) y se aplica al momento. */

import { T } from '../comun/idioma.js?v=202610052338';

const CLAVE = 'ecoloco-graficos';
export const GRAFICOS_BASE = {
  hierba: true, altoHierba: 18, densidadHierba: 200, grosorHierba: 100, variacionHierba: 70, manchasHierba: 70, // cm y %
  tiempo: 'auto', lluvia: 0, nieve: 0, niebla: 0, nubes: 30, // a mano: %
  viento: 100, sombras: true, antialias: true, transparencia: true,
};

export function leerGraficos() {
  try { return { ...GRAFICOS_BASE, ...JSON.parse(localStorage.getItem(CLAVE) || '{}') }; } catch { return { ...GRAFICOS_BASE }; }
}

export function crearGraficos(contenedor, g, alCambiar) {
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(g)); } catch {} alCambiar(g); };
  const casilla = (k, es, en) => `<label class="g-fila"><input type="checkbox" data-k="${k}" ${g[k] ? 'checked' : ''}> <span>${T(es, en)}</span></label>`;
  const barra = (k, es, en, min, max, paso, unidad) => `<label class="g-fila"><span class="g-nom">${T(es, en)}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${paso}" value="${g[k]}"><span class="g-val" data-v="${k}">${g[k]} ${unidad}</span></label>`;
  function pintar() {
    contenedor.innerHTML = `
      <h4>${T('Hierba', 'Grass')}</h4>
      ${casilla('hierba', 'Hierba en el suelo', 'Grass on the ground')}
      ${barra('altoHierba', 'Altura', 'Height', 4, 60, 1, 'cm')}
      ${barra('densidadHierba', 'Densidad', 'Density', 20, 500, 10, '%')}
      ${barra('grosorHierba', 'Grosor', 'Thickness', 30, 300, 10, '%')}
      ${barra('variacionHierba', 'Por zonas', 'By patches', 0, 100, 5, '%')}
      ${barra('manchasHierba', 'Manchas de color', 'Colour patches', 0, 100, 5, '%')}
      <h4>${T('Tiempo', 'Weather')}</h4>
      <div class="g-fila g-radios"><label><input type="radio" name="g-tiempo" value="auto" ${g.tiempo === 'auto' ? 'checked' : ''}> ${T('El del motor', 'From the engine')}</label>
        <label><input type="radio" name="g-tiempo" value="mano" ${g.tiempo === 'mano' ? 'checked' : ''}> ${T('A mano', 'Manual')}</label></div>
      <div class="${g.tiempo === 'mano' ? '' : 'g-apagado'}">
        ${barra('lluvia', 'Lluvia', 'Rain', 0, 100, 5, '%')}
        ${barra('nieve', 'Nieve', 'Snow', 0, 100, 5, '%')}
        ${barra('niebla', 'Niebla', 'Fog', 0, 100, 5, '%')}
        ${barra('nubes', 'Nubes', 'Clouds', 0, 100, 5, '%')}
      </div>
      <h4>${T('Más', 'More')}</h4>
      ${barra('viento', 'Viento', 'Wind', 0, 300, 10, '%')}
      ${casilla('sombras', 'Sombras', 'Shadows')}
      ${casilla('antialias', 'Antialias (bordes suaves)', 'Antialiasing (smooth edges)')}
      ${casilla('transparencia', 'Ver a través de lo que tapa al seleccionado', 'See through what hides the selected one')}
      <p class="gris">${T('Solo cambia cómo se ve, no la simulación. Se guarda en este navegador.', 'It only changes how it looks, not the simulation. Saved in this browser.')}</p>
      <button id="g-restablecer">${T('Valores de siempre', 'Defaults')}</button>`;
    for (const el of contenedor.querySelectorAll('input[data-k]')) {
      el.oninput = () => {
        const k = el.dataset.k;
        g[k] = el.type === 'checkbox' ? el.checked : Number(el.value);
        const v = contenedor.querySelector(`[data-v="${k}"]`); if (v) v.textContent = v.textContent.replace(/^\S+/, String(g[k]));
        guardar();
      };
    }
    for (const el of contenedor.querySelectorAll('input[name="g-tiempo"]')) el.onchange = () => { g.tiempo = el.value; guardar(); pintar(); };
    contenedor.querySelector('#g-restablecer').onclick = () => { Object.assign(g, GRAFICOS_BASE); guardar(); pintar(); };
  }
  pintar();
  return { pintar };
}
