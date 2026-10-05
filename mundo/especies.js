// Cómo se comporta cada especie del mundo vivo. Mismos identificadores que
// graficos/pruebas-morta/borneo/especies.js (allí están el modelo, la foto y la fuente de
// cada animal); aquí solo lo que necesita la simulación. Valores de historia natural
// aproximados (Payne y Francis, «A Field Guide to the Mammals of Borneo»; Myers, «Birds of
// Borneo»; fichas de cada especie en especies.js), redondeados.
//
//  grupo       grupo funcional del motor al que pertenece
//  mueve       suelo | arboreo (sube a los árboles) | vuelo | planeo | reptil | serpiente |
//              rana | insecto | volador (insecto que vuela) | gusano (bajo tierra)
//  andar/correr  velocidades en m/s (a velocidad natural de pantalla)
//  vista       distancia a la que ve u oye a presas y depredadores (m)
//  actividad   diurno | nocturno | crepuscular | vespertino | catemeral (horas activas en ACTIVIDAD)
//  come        lo que busca: fruta (en el árbol), fruta_suelo, hojas (del dosel),
//              sotobosque, semillas, setas, hojarasca, carroña, excremento, presas
//  caza        estrategia: acecho | emboscada | persecucion | picada | al_vuelo | lengua
//  exito       probabilidad de que un ataque salga bien (antes del «director»)
//  alerta      distancia a la que huye de un depredador (0 = no huye)
//  refugio     a dónde huye: arbol | madriguera | agua | hojarasca | aire
//  hogar       madriguera | nido_arbol | nido_suelo | dormidero_arbol | cama | termitero | ninguno
//  social      [mín, máx] del grupo con el que va (1 = solitario)
//  bebe        si tiene que ir a beber
//  cria        { meses, cortejo, dias: gestación o incubación, crias }
//  zona        (los que andan y son pequeños) radio en m de su zona de vida alrededor de su hogar: no salen de ella
//  rapido      (ídem) cuántas veces más rápido que su velocidad real se mueven: a su tamaño (dibujado más grande)
//              no se nota, y así se ve que andan
//  calma       (ídem) la probabilidad de quedarse quieto cuando no tiene nada que hacer (se mueven menos veces)

export const ACTIVIDAD = {
  diurno: [[6, 18]],
  nocturno: [[18, 24], [0, 6]],
  crepuscular: [[5, 9], [16, 20]],
  // (las termitas de procesión: salen al atardecer y siguen toda la noche)
  vespertino: [[17.5, 24], [0, 6]],
  catemeral: [[0, 24]],
};

const D = (o) => o; // para leer mejor la tabla

export const COMPORTAMIENTO = {
  // ---- mamíferos
  'pantera-nebulosa': D({ grupo: 'carnivorous_mammal', mueve: 'arboreo', andar: 1.1, correr: 11, vista: 60, actividad: 'nocturno',
    come: ['presas', 'carroña'], caza: 'acecho', exito: 0.35, alerta: 0, refugio: 'arbol', hogar: 'dormidero_arbol', social: [1, 1], bebe: true,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'llamada', dias: 90, crias: 2 } }),
  'gato-leopardo': D({ grupo: 'carnivorous_mammal', mueve: 'suelo', andar: 0.8, correr: 8, vista: 35, actividad: 'nocturno',
    come: ['presas'], caza: 'acecho', exito: 0.4, alerta: 25, refugio: 'arbol', hogar: 'madriguera', social: [1, 1], bebe: true,
    cria: { meses: [3, 4, 5, 6], cortejo: 'llamada', dias: 67, crias: 2 } }),
  muntiaco: D({ grupo: 'herbivorous_mammal', mueve: 'suelo', andar: 0.9, correr: 9, vista: 40, actividad: 'crepuscular',
    come: ['sotobosque', 'fruta_suelo', 'semillas'], alerta: 30, refugio: 'hojarasca', hogar: 'cama', social: [1, 2], bebe: true,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'ladrido', dias: 210, crias: 1 } }),
  'ciervo-raton': D({ grupo: 'herbivorous_mammal', mueve: 'suelo', andar: 0.6, correr: 6, vista: 20, actividad: 'nocturno',
    come: ['fruta_suelo', 'sotobosque'], alerta: 15, refugio: 'hojarasca', hogar: 'cama', social: [1, 1], bebe: true,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'persecucion', dias: 152, crias: 1 } }),
  orangutan: D({ grupo: 'herbivorous_mammal', mueve: 'arboreo', andar: 0.5, correr: 1.5, vista: 50, actividad: 'diurno',
    come: ['fruta', 'hojas'], alerta: 0, refugio: 'arbol', hogar: 'nido_arbol', social: [1, 2], bebe: false,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'llamada', dias: 255, crias: 1 } }),
  macaco: D({ grupo: 'herbivorous_mammal', mueve: 'arboreo', andar: 0.9, correr: 4, vista: 40, actividad: 'diurno',
    come: ['fruta', 'fruta_suelo', 'hojas', 'presas'], alerta: 25, refugio: 'arbol', hogar: 'dormidero_arbol', social: [8, 20], bebe: true,
    cria: { meses: [1, 2, 3, 4, 5, 6], cortejo: 'acicalar', dias: 165, crias: 1 } }),
  'jabali-barbudo': D({ grupo: 'fungivorous_mammal', mueve: 'suelo', andar: 0.8, correr: 8, vista: 30, actividad: 'catemeral',
    come: ['setas', 'fruta_suelo', 'hojarasca', 'carroña'], alerta: 20, refugio: 'hojarasca', hogar: 'cama', social: [2, 6], bebe: true,
    cria: { meses: [8, 9, 10, 11], cortejo: 'persecucion', dias: 115, crias: 4 } }),
  'ardilla-prevost': D({ grupo: 'fungivorous_mammal', mueve: 'arboreo', andar: 1.2, correr: 5, vista: 20, actividad: 'diurno',
    come: ['fruta', 'semillas', 'setas'], alerta: 15, refugio: 'arbol', hogar: 'nido_arbol', social: [1, 2], bebe: false,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'persecucion', dias: 46, crias: 2 } }),
  // ---- reptiles y anfibios
  varano: D({ grupo: 'scavenging_mammal', mueve: 'reptil', andar: 0.5, correr: 4, vista: 40, actividad: 'diurno',
    come: ['carroña', 'presas', 'excremento'], caza: 'persecucion', exito: 0.3, alerta: 10, refugio: 'agua', hogar: 'madriguera', social: [1, 1], bebe: true,
    cria: { meses: [4, 5, 6, 7], cortejo: 'lucha', dias: 240, crias: 12 } }),
  'dragon-bosque': D({ grupo: 'herbivorous_lizard', mueve: 'reptil', andar: 0.4, correr: 2.5, vista: 10, actividad: 'diurno',
    come: ['presas', 'sotobosque'], caza: 'emboscada', exito: 0.5, alerta: 6, refugio: 'arbol', hogar: 'ninguno', social: [1, 1], bebe: false,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'flexiones', dias: 70, crias: 4 } }),
  'eslizon-solar': D({ grupo: 'thermophilic_lizard', mueve: 'reptil', andar: 0.5, correr: 3, vista: 8, actividad: 'diurno',
    come: ['presas', 'sotobosque'], caza: 'emboscada', exito: 0.5, alerta: 5, refugio: 'hojarasca', hogar: 'madriguera', social: [1, 1], bebe: false,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'flexiones', dias: 60, crias: 5 } }),
  'vibora-verde': D({ grupo: 'carnivorous_snake', mueve: 'serpiente', andar: 0.15, correr: 0.5, vista: 8, actividad: 'nocturno',
    come: ['presas'], caza: 'emboscada', exito: 0.6, alerta: 0, refugio: 'arbol', hogar: 'ninguno', social: [1, 1], bebe: false,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'enredarse', dias: 150, crias: 10 } }),
  'piton-reticulada': D({ grupo: 'carnivorous_snake', mueve: 'serpiente', andar: 0.2, correr: 0.45, vista: 10, actividad: 'nocturno',
    come: ['presas'], caza: 'emboscada', exito: 0.5, alerta: 0, refugio: 'agua', hogar: 'madriguera', social: [1, 1], bebe: true,
    cria: { meses: [9, 10, 11, 12], cortejo: 'enredarse', dias: 80, crias: 20 } }),
  'rana-gigante-rio': D({ grupo: 'frog', mueve: 'rana', andar: 0.3, correr: 1.5, vista: 4, actividad: 'nocturno',
    come: ['presas'], caza: 'lengua', exito: 0.6, alerta: 3, refugio: 'agua', hogar: 'ninguno', social: [1, 1], bebe: false, cercaAgua: true,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'croar', dias: 30, crias: 200 } }),
  'rana-arboricola': D({ grupo: 'frog', mueve: 'rana', andar: 0.3, correr: 1.5, vista: 3, actividad: 'nocturno',
    come: ['presas'], caza: 'lengua', exito: 0.6, alerta: 2, refugio: 'arbol', hogar: 'ninguno', social: [1, 1], bebe: false, cercaAgua: true,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'croar', dias: 30, crias: 150 } }),
  // ---- aves
  'aguila-culebrera': D({ grupo: 'carnivorous_bird', mueve: 'planeo', andar: 0.3, correr: 12, vista: 80, actividad: 'diurno',
    come: ['presas', 'carroña'], caza: 'picada', exito: 0.3, alerta: 0, refugio: 'aire', hogar: 'nido_arbol', social: [1, 2], bebe: false,
    cria: { meses: [12, 1, 2, 3], cortejo: 'vuelo_nupcial', dias: 35, crias: 1 } }),
  'buho-pardo': D({ grupo: 'carnivorous_bird', mueve: 'vuelo', andar: 0.2, correr: 9, vista: 40, actividad: 'nocturno',
    come: ['presas'], caza: 'picada', exito: 0.4, alerta: 0, refugio: 'arbol', hogar: 'nido_arbol', social: [1, 2], bebe: false,
    cria: { meses: [1, 2, 3, 4], cortejo: 'canto', dias: 30, crias: 2 } }),
  calao: D({ grupo: 'herbivorous_bird', mueve: 'vuelo', andar: 0.3, correr: 8, vista: 50, actividad: 'diurno',
    come: ['fruta'], alerta: 20, refugio: 'aire', hogar: 'nido_arbol', social: [4, 12], bebe: false,
    cria: { meses: [2, 3, 4, 5, 6], cortejo: 'regalo', dias: 30, crias: 2 } }),
  'gallo-bankiva': D({ grupo: 'herbivorous_bird', mueve: 'suelo', andar: 0.5, correr: 4, vista: 25, actividad: 'diurno',
    come: ['semillas', 'fruta_suelo', 'presas', 'sotobosque'], alerta: 15, refugio: 'arbol', hogar: 'dormidero_arbol', social: [3, 8], bebe: true,
    cria: { meses: [2, 3, 4, 5, 6, 7], cortejo: 'exhibicion', dias: 21, crias: 5 } }),
  golondrina: D({ grupo: 'swallow', mueve: 'vuelo', andar: 0.2, correr: 10, vista: 30, actividad: 'diurno',
    come: ['presas'], caza: 'al_vuelo', exito: 0.5, alerta: 10, refugio: 'aire', hogar: 'nido_arbol', social: [4, 15], bebe: true,
    cria: { meses: [3, 4, 5, 6, 7], cortejo: 'vuelo_nupcial', dias: 15, crias: 3 } }),
  // ---- insectos y otros invertebrados (representantes de muchos individuos)
  'escarabajo-tigre': D({ grupo: 'carnivorous_insect_iteroparous', zona: 8, rapido: 1.5, calma: 0.45, carreras: true, mueve: 'insecto', andar: 0.6, correr: 2, vista: 1.5, actividad: 'diurno',
    come: ['presas'], caza: 'persecucion', exito: 0.5, alerta: 1, refugio: 'aire', hogar: 'madriguera', social: [1, 1], bebe: false,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'persecucion', dias: 30, crias: 30 } }),
  'mantis-hoja-seca': D({ grupo: 'carnivorous_insect_semelparous', zona: 2, rapido: 8, calma: 0.88, mueve: 'insecto', andar: 0.05, correr: 0.5, vista: 0.8, actividad: 'catemeral',
    come: ['presas'], caza: 'emboscada', exito: 0.6, alerta: 0, refugio: 'hojarasca', hogar: 'ninguno', social: [1, 1], bebe: false,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'cauto', dias: 40, crias: 100 } }),
  libelula: D({ grupo: 'carnivorous_insect_semelparous', mueve: 'volador', andar: 0.1, correr: 4, vista: 3, actividad: 'diurno',
    come: ['presas'], caza: 'al_vuelo', exito: 0.7, alerta: 1, refugio: 'aire', hogar: 'ninguno', social: [1, 1], bebe: false, cercaAgua: true,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'vuelo_nupcial', dias: 20, crias: 300 } }),
  fulgorido: D({ grupo: 'herbivorous_insect_iteroparous', mueve: 'volador', andar: 0.05, correr: 1.5, vista: 1, actividad: 'catemeral',
    come: ['hojas'], alerta: 0.5, refugio: 'aire', hogar: 'ninguno', social: [1, 3], bebe: false,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'cauto', dias: 20, crias: 50 } }),
  'escarabajo-atlas': D({ grupo: 'herbivorous_insect_iteroparous', zona: 6, rapido: 6, calma: 0.6, mueve: 'insecto', andar: 0.08, correr: 0.4, vista: 0.5, actividad: 'nocturno',
    come: ['fruta_suelo', 'sotobosque'], alerta: 0, refugio: 'hojarasca', hogar: 'ninguno', social: [1, 1], bebe: false,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'lucha', dias: 30, crias: 40 } }),
  'insecto-palo': D({ grupo: 'herbivorous_insect_semelparous', zona: 1.5, rapido: 10, calma: 0.92, mueve: 'insecto', andar: 0.03, correr: 0.1, vista: 0.3, actividad: 'nocturno',
    come: ['hojas', 'sotobosque'], alerta: 0, refugio: 'hojarasca', hogar: 'ninguno', social: [1, 1], bebe: false,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'cauto', dias: 60, crias: 100 } }),
  cigarra: D({ grupo: 'herbivorous_insect_semelparous', mueve: 'volador', andar: 0.02, correr: 2, vista: 1, actividad: 'crepuscular',
    come: ['hojas'], alerta: 1, refugio: 'aire', hogar: 'ninguno', social: [1, 1], bebe: false,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'canto', dias: 40, crias: 400 } }),
  oruga: D({ grupo: 'caterpillar', zona: 1.2, rapido: 10, calma: 0.7, mueve: 'insecto', andar: 0.01, correr: 0.02, vista: 0.2, actividad: 'catemeral',
    come: ['hojas', 'sotobosque'], alerta: 0, refugio: 'hojarasca', hogar: 'ninguno', social: [1, 1], bebe: false }),
  'rajah-brooke': D({ grupo: 'butterfly', mueve: 'volador', andar: 0.02, correr: 2.5, vista: 3, actividad: 'diurno',
    come: ['fruta_suelo', 'excremento'], alerta: 1.5, refugio: 'aire', hogar: 'ninguno', social: [1, 6], bebe: true, cercaAgua: true,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'vuelo_nupcial', dias: 10, crias: 100 } }),
  'ninfa-arbol': D({ grupo: 'butterfly', mueve: 'volador', andar: 0.02, correr: 1, vista: 3, actividad: 'diurno',
    come: ['fruta'], alerta: 1, refugio: 'aire', hogar: 'ninguno', social: [1, 1], bebe: false,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'vuelo_nupcial', dias: 10, crias: 100 } }),
  lombriz: D({ grupo: 'earthworm', zona: 1.5, rapido: 10, calma: 0.85, mueve: 'gusano', andar: 0.005, correr: 0.01, vista: 0.1, actividad: 'nocturno',
    come: ['hojarasca'], alerta: 0, refugio: 'madriguera', hogar: 'madriguera', social: [1, 1], bebe: false }),
  pelotero: D({ grupo: 'dung_beetle', zona: 15, rapido: 6, calma: 0.6, mueve: 'insecto', andar: 0.1, correr: 0.4, vista: 5, actividad: 'catemeral',
    come: ['excremento'], alerta: 0, refugio: 'madriguera', hogar: 'madriguera', social: [1, 2], bebe: false,
    cria: { meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cortejo: 'regalo', dias: 30, crias: 10 } }),
  termita: D({ grupo: 'detritivorous_insect', zona: 5, rapido: 6, calma: 0.5, mueve: 'insecto', andar: 0.03, correr: 0.06, vista: 0.3, actividad: 'vespertino',
    come: ['hojarasca'], alerta: 0, refugio: 'termitero', hogar: 'termitero', social: [20, 60], bebe: false }),
};

// las especies de cada grupo del motor, con su peso cuando sale un individuo nuevo
// (la principal, «bueno» en especies.js, pesa más)
export const ESPECIES_DE_GRUPO = {
  carnivorous_mammal: [['pantera-nebulosa', 3], ['gato-leopardo', 1]],
  herbivorous_mammal: [['muntiaco', 3], ['ciervo-raton', 2], ['macaco', 3], ['orangutan', 1]],
  fungivorous_mammal: [['jabali-barbudo', 2], ['ardilla-prevost', 2]],
  scavenging_mammal: [['varano', 1]],
  herbivorous_lizard: [['dragon-bosque', 1]],
  thermophilic_lizard: [['eslizon-solar', 1]],
  carnivorous_snake: [['vibora-verde', 3], ['piton-reticulada', 1]],
  frog: [['rana-gigante-rio', 1], ['rana-arboricola', 1]],
  carnivorous_bird: [['aguila-culebrera', 1], ['buho-pardo', 1]],
  herbivorous_bird: [['calao', 1], ['gallo-bankiva', 1]],
  swallow: [['golondrina', 1]],
  carnivorous_insect_iteroparous: [['escarabajo-tigre', 1]],
  carnivorous_insect_semelparous: [['mantis-hoja-seca', 1], ['libelula', 2]],
  herbivorous_insect_iteroparous: [['fulgorido', 1], ['escarabajo-atlas', 1]],
  herbivorous_insect_semelparous: [['insecto-palo', 1], ['cigarra', 1]],
  caterpillar: [['oruga', 1]],
  butterfly: [['rajah-brooke', 1], ['ninfa-arbol', 1]],
  earthworm: [['lombriz', 1]],
  dung_beetle: [['pelotero', 1]],
  detritivorous_insect: [['termita', 1]],
};

export const VERTEBRADOS = new Set(['carnivorous_mammal', 'herbivorous_mammal', 'fungivorous_mammal', 'scavenging_mammal',
  'herbivorous_lizard', 'thermophilic_lizard', 'carnivorous_snake', 'frog', 'carnivorous_bird', 'herbivorous_bird', 'swallow']);

// ¿está activa a esa hora (0-24)?
export function activo(especie, hora) {
  return ACTIVIDAD[especie.actividad].some(([a, b]) => hora >= a && hora < b);
}

// los estados que puede tener un animal (el código va en la línea de tiempo)
export const ESTADOS = ['quieto', 'andar', 'correr', 'comer', 'beber', 'dormir', 'descansar', 'acechar', 'atacar', 'huir',
  'cortejar', 'aparearse', 'anidar', 'excavar', 'nadar', 'volar', 'planear', 'morir', 'muerto', 'nacer', 'trepar', 'llegar', 'irse'];
export const E = Object.fromEntries(ESTADOS.map((n, i) => [n, i]));
