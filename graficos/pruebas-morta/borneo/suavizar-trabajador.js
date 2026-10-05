/* Un Web Worker que hace las mallas suaves de los animales (suavizar.js) fuera del hilo principal:
   recibe { id } y devuelve la malla de cerca y la de lejos (con sus huesos) y las piezas para
   pintar el pelaje, todo en datos planos (las mallas, con sus arrays transferidos). */

import { ANIMALES } from './especies.js?v=202610052205';
import { crearAnimal } from './animales-cubos.js?v=202610052205';
import { suavizar } from './suavizar.js?v=202610052205';
import { objetivosDe, aPlano } from './suavizar-datos.js?v=202610052205';

self.onmessage = ({ data: { id } }) => {
  const e = ANIMALES.find((x) => x.id === id);
  const m = crearAnimal(e);
  const s = suavizar(m, objetivosDe(m));
  const { plano, transferir } = aPlano(s);
  self.postMessage({ id, plano }, transferir);
};
