// Un tamaño con barra y casilla para escribirlo, enlazadas (el del mundo, en km², y el del
// mapa, en metros de lado). Si «avisar», al cambiarlo pregunta antes (se vuelve a generar el
// mundo entero) y, si se cancela, vuelve al valor de antes.
import { T } from './idioma.js?v=202610032007';

export const KM2 = { min: 1, max: 10, paso: 0.1, unidad: 'km²' };
export const LADO = { min: 50, max: 1000, paso: 10, unidad: 'm' };
export function controlTamano(caja, valor, alCambiar, { avisar = false, rango = KM2 } = {}) {
  caja.classList.add('tamano');
  const { min, max, paso, unidad } = rango;
  caja.innerHTML = `<input type="range" min="${min}" max="${max}" step="${paso}"><input type="number" min="${min}" max="${max}" step="${paso}"><span>${unidad}</span>`;
  const [barra, casilla] = caja.querySelectorAll('input');
  let actual = valor;
  const poner = (v) => { barra.value = v; casilla.value = v; };
  poner(actual);
  barra.oninput = () => { casilla.value = barra.value; };
  const cambiar = (v) => {
    v = Math.round(Math.min(max, Math.max(min, Number(v) || actual)) / paso) * paso;
    v = Number(v.toFixed(3));
    if (v === actual) { poner(actual); return; }
    if (avisar && !confirm(T('Esto vuelve a generar el mundo entero. ¿Seguro?', 'This regenerates the whole world. Are you sure?'))) { poner(actual); return; }
    actual = v; poner(v); alCambiar(v);
  };
  barra.onchange = () => cambiar(barra.value);
  casilla.onchange = () => cambiar(casilla.value);
}
