// El «?» con globo: un iconito que, al pasar el ratón (o al pulsarlo, o con el foco del
// teclado), enseña una explicación corta. ayuda(es, en) devuelve su HTML.
import { T } from './idioma.js?v=202610052309';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const ayuda = (es, en) => `<span class="ayuda" tabindex="0" role="note" aria-label="${esc(T(es, en))}" data-globo="${esc(T(es, en))}">?</span>`;
// los «?» escritos en el HTML: <span class="ayuda" data-es="…" data-en="…"></span>
export function ponerAyudas(raiz = document) {
  for (const el of raiz.querySelectorAll('.ayuda[data-es]')) {
    const t = T(el.dataset.es, el.dataset.en);
    el.textContent = '?'; el.tabIndex = 0; el.setAttribute('role', 'note'); el.setAttribute('aria-label', t); el.dataset.globo = t;
    delete el.dataset.es; delete el.dataset.en;
  }
}
