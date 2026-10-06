// La cabecera común de EcoLoco: arriba del todo en todas las páginas (portada, simulación,
// editor, galería e interfaz del motor) para ir de una a otra, con el selector de idioma a la
// derecha. cabecera('vivo') la pone y marca la página en la que se está.
import { T, idioma, ponerIdioma } from './idioma.js?v=202610060010';

const raiz = new URL('../', import.meta.url);
const PAGINAS = [
  ['simulacion', 'portada/simulacion.html', 'Simulación', 'Simulation'],
  ['editor', 'graficos/pruebas-morta/borneo/editor.html', 'Editor de modelos', 'Model editor'],
  ['galeria', 'graficos/pruebas-morta/borneo/galeria.html', 'Galería', 'Gallery'],
  ['motor', 'interfaz/', 'El motor', 'The engine'],
];

export function cabecera(actual) {
  if (document.querySelector('.cabecera')) return;
  const c = document.createElement('nav');
  c.className = 'cabecera';
  // el logo es la página de inicio
  c.innerHTML = `<a class="cab-marca${actual === 'portada' ? ' on' : ''}" href="${new URL('index.html', raiz)}" title="${T('Inicio: qué es EcoLoco', 'Home: what EcoLoco is')}">EcoLoco</a>` +
    PAGINAS.map(([id, ruta, es, en]) => `<a class="ir${id === actual ? ' on' : ''}" href="${new URL(ruta, raiz)}">${T(es, en)}</a>`).join('') +
    `<span class="hueco"></span><a class="ir git" href="https://github.com/majausone/ecoloco" target="_blank" rel="noopener" title="${T('El código en GitHub', 'The source code on GitHub')}">GitHub</a><label title="${T('Idioma', 'Language')}">🌐 <select id="idioma-elegir"><option value="en">English</option><option value="es">Español</option></select></label>`;
  document.body.prepend(c);
  document.body.classList.add('con-cabecera');
  const s = c.querySelector('select');
  s.value = idioma();
  s.onchange = () => ponerIdioma(s.value);
}
