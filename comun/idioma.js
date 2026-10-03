// El idioma de EcoLoco: inglés por defecto o español, recordado en el navegador. T(es, en)
// devuelve el texto en el idioma elegido; traducirDom() cambia los textos del HTML que llevan
// data-en (el texto en inglés) y data-es-title / data-en-title (los globos).
const CLAVE = 'ecoloco.idioma';
export const idioma = () => { try { return localStorage.getItem(CLAVE) || 'en'; } catch { return 'en'; } };
export const enIngles = () => idioma() === 'en';
export const T = (es, en) => (enIngles() ? en ?? es : es);
export function ponerIdioma(i) { try { localStorage.setItem(CLAVE, i); } catch { /* sin almacenamiento */ } location.reload(); }
export function traducirDom(raiz = document) {
  document.documentElement.lang = idioma();
  if (!enIngles()) return;
  for (const el of raiz.querySelectorAll('[data-en]')) el.innerHTML = el.dataset.en;
  for (const el of raiz.querySelectorAll('[data-en-title]')) el.title = el.dataset.enTitle;
  for (const el of raiz.querySelectorAll('[data-en-placeholder]')) el.placeholder = el.dataset.enPlaceholder;
}
// números a la manera del idioma
export const num = (n, op) => Number(n).toLocaleString(enIngles() ? 'en-GB' : 'es-ES', op);
