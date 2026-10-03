// El crédito de una foto de iNaturalist, en español: «(c) Chien Lee, all rights reserved,
// uploaded by Chien Lee» → «© Chien Lee, todos los derechos reservados (iNaturalist)».
import { enIngles } from '../../../comun/idioma.js?v=202610032115';
// (en inglés, tal cual sin «uploaded by»)
export function creditoFoto(autor) {
  if (!autor) return '';
  if (enIngles()) return `${String(autor).replace(/,?\s*uploaded by .*$/i, '').replace(/^\(c\)\s*/i, '© ').trim()} (iNaturalist)`;
  let s = String(autor).replace(/,?\s*uploaded by .*$/i, '').trim();
  s = s.replace(/^\(c\)\s*/i, '© ')
    .replace(/all rights reserved/i, 'todos los derechos reservados')
    .replace(/some rights reserved/i, 'algunos derechos reservados')
    .replace(/no known copyright restrictions \(public domain\)/i, 'sin restricciones conocidas (dominio público)')
    .replace(/^anonymous/i, 'anónimo');
  return `${s} (iNaturalist)`;
}
