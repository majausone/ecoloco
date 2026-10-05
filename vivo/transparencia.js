/* LO QUE TAPA AL SELECCIONADO, A MEDIAS. Con un animal o una planta seleccionado (o un animal
   seguido), todo lo que en pantalla cae dentro de su círculo y está más cerca de la cámara que él
   se quita (y en el borde del círculo, tramado): copas, troncos, hojas, matas, setas, hogares,
   otros animales y el terreno si hay una loma por medio. Así no se pierde de vista nunca.
   vivo.js pone cada fotograma dónde está en pantalla, su radio y su profundidad (actualizar);
   cada material lleva el trozo de shader con parcheTransparencia. */

import * as THREE from '../graficos/pruebas-morta/vendor/three.module.js';

export const uTransp = {
  uTrActivo: { value: 0 },
  uTrPx: { value: new THREE.Vector2() },     // el centro en píxeles del render (gl_FragCoord)
  uTrRadio: { value: 0 },                    // radio en píxeles
  uTrProf: { value: 0 },                     // profundidad (en la vista) del seleccionado
  uTrMargen: { value: 0.5 },                 // lo que esté a menos de esto delante no se trama
  uTrPlanta: { value: new THREE.Vector2(1e9, 1e9) }, // la planta seleccionada (xz de la escena): esa no
};

const CAB = `uniform float uTrActivo;\nuniform vec2 uTrPx;\nuniform float uTrRadio;\nuniform float uTrProf;\nuniform float uTrMargen;\nuniform vec2 uTrPlanta;\n`;
// el trozo del fragment shader (necesita vViewPosition, que tienen Lambert y Basic con la niebla o
// la luz; si no la tiene, se le añade). margenExtra: metros de más (el terreno, para que no se agujeree
// el suelo junto al animal). conPlanta: el material es de plantas y trae vOrgPlanta (xz de su ejemplar)
function trozo(margenExtra, conPlanta) {
  return `if (uTrActivo > 0.5) {
      float dPx = distance(gl_FragCoord.xy, uTrPx);
      if (dPx < uTrRadio && vTrProf < uTrProf - uTrMargen - ${margenExtra.toFixed(2)}${conPlanta ? ' && distance(vOrgPlanta, uTrPlanta) > 0.05' : ''}) {
        vec2 c = mod(floor(gl_FragCoord.xy), 2.0);
        // dentro, despejado del todo; en el borde, tramado (la mitad de los píxeles) para que no corte
        if (dPx < uTrRadio * 0.75 || c.x + c.y == 1.0) discard;
      }
    }`;
}
/* Mete la transparencia en un shader (en onBeforeCompile). Se encarga también de pasar la
   profundidad en la vista (vTrProf) del vertex al fragment. */
export function parcheTransparencia(sh, { margenExtra = 0, conPlanta = false } = {}) {
  Object.assign(sh.uniforms, uTransp);
  sh.vertexShader = 'varying float vTrProf;\n' + sh.vertexShader.replace(/(\n\s*gl_Position\s*=\s*projectionMatrix\s*\*\s*mvPosition;)/, '$1\n vTrProf = -mvPosition.z;');
  if (!sh.vertexShader.includes('vTrProf = -mvPosition.z')) sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vTrProf = -mvPosition.z;');
  sh.fragmentShader = CAB + 'varying float vTrProf;\n' + (conPlanta ? 'varying vec2 vOrgPlanta;\n' : '') + sh.fragmentShader.replace('void main() {', `void main() {\n${trozo(margenExtra, conPlanta)}`);
}
// a un material ya hecho (con o sin onBeforeCompile propio)
export function conTransparencia(material, opciones) {
  const antes = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => { antes?.call(material, sh, r); parcheTransparencia(sh, opciones); };
  const clave = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (clave ? clave() : '') + '|transp' + JSON.stringify(opciones || {});
  return material;
}

/* Cada fotograma: el seleccionado en la escena (centro, radio en metros) o nada. */
const v = new THREE.Vector3();
export function actualizarTransparencia(cam, ancho, alto, objetivo) {
  if (!objetivo) { uTransp.uTrActivo.value = 0; return; }
  v.copy(objetivo.centro).applyMatrix4(cam.matrixWorldInverse);
  const prof = -v.z;
  if (prof <= 0.1) { uTransp.uTrActivo.value = 0; return; }
  v.copy(objetivo.centro).project(cam);
  uTransp.uTrActivo.value = 1;
  uTransp.uTrPx.value.set((v.x * 0.5 + 0.5) * ancho, (v.y * 0.5 + 0.5) * alto);
  // el radio en píxeles: su tamaño visto a esa distancia, con un margen
  const focal = cam.isPerspectiveCamera ? alto / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) : alto / (cam.top - cam.bottom);
  uTransp.uTrRadio.value = Math.max(60, (objetivo.radio * focal) / (cam.isPerspectiveCamera ? prof : 1) * 1.5 + 30);
  uTransp.uTrProf.value = prof;
  uTransp.uTrMargen.value = objetivo.radio * 0.8;
  if (objetivo.planta) uTransp.uTrPlanta.value.set(objetivo.planta.x, objetivo.planta.z); else uTransp.uTrPlanta.value.set(1e9, 1e9);
}
