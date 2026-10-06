// El «?» de la casilla «corregir el fallo de los herbívoros»: qué enciende, una frase por cada
// corrección (qué hace mal el original y qué cambia al arreglarlo), los ajustes de parámetros y
// la calibración de Maliau. La lista sale de los interruptores que tiene de verdad el motor
// (motor/correcciones.js y CORRECCIONES_ANIMAL): si alguno no tiene aquí su frase, se dice, y la
// prueba pruebas/correcciones.test.js falla.
import { CORRECCIONES_ANIMAL } from '../motor/modelos/animal.js?v=202610060010';
import { CORRECCIONES_PLANTAS, CORRECCIONES_HIDROLOGIA, CORRECCIONES_SUELO, CORRECCIONES_HOJARASCA, AJUSTES } from '../motor/correcciones.js?v=202610060010';

// [español, inglés] de cada corrección
export const TEXTO_CORRECCION = {
  // animales: comer
  forrajeo_continuo: ['El tiempo que cada animal pasa buscando comida se redondea a días enteros: a paso diario sale cero y ningún animal come nunca. Con el arreglo se cuentan las fracciones de día.',
    'The time each animal spends foraging is rounded down to whole days: with a daily step it is zero and no animal ever eats. The fix keeps the fractions of a day.'],
  sotobosque_por_m2: ['La vegetación y las semillas del sotobosque vienen por metro cuadrado, pero se tratan como si fueran de toda la celda, así que los herbívoros encuentran millones de veces menos comida. Ahora se cuentan bien.',
    'Understorey vegetation and seeds come per square metre but are treated as if they were for the whole cell, so herbivores find millions of times less food. Now they are counted properly.'],
  tiempo_plantas: ['El tiempo de búsqueda se reparte entre todas las dietas, pero las plantas (hojas, fruta, semillas…) se comen todas de una vez y solo les llega la parte de una. Ahora reciben la de todas.',
    'Search time is shared among all diets, but plants (leaves, fruit, seeds…) are all eaten in one go and only get the share of one. Now they get the share of all of them.'],
  setas: ['Los animales que comen setas nunca las encuentran: el código no se las ofrece. Ahora sí.',
    'Mushroom eaters never find mushrooms: the code never offers them. Now it does.'],
  agotar_recursos: ['Lo que se come un grupo de animales sigue ahí para los siguientes del mismo paso. Ahora se descuenta, y nadie se come más de la mitad de lo que queda.',
    'What one group of animals eats is still there for the next ones in the same step. Now it is taken away, and nobody eats more than half of what is left.'],
  // animales: gastar
  boltzmann_ev: ['El gasto de energía usa la constante de Boltzmann en J/K cuando la fórmula la pide en eV/K: sale cero y los animales no gastan nada. Se usa la buena.',
    'Energy use takes the Boltzmann constant in J/K where the formula needs it in eV/K: it comes out as zero and animals spend nothing. The right one is used.'],
  metabolismo_una_vez: ['Cada grupo de animales gasta su energía una vez por cada celda de su territorio (hasta 81 veces en un paso). Ahora una sola vez, repartiendo excrementos y respiración por el territorio.',
    'Each group of animals spends its energy once for every cell of its territory (up to 81 times per step). Now just once, spreading dung and respiration over the territory.'],
  metabolismo_con_comida: ['El gasto se paga solo con el cuerpo. Ahora primero con lo que sobra de lo comido, y lo que falte, del cuerpo.',
    'Energy use is paid only from the body. Now it is paid first from what is left of the food, and only the rest from the body.'],
  // animales: criar
  reproduccion: ['La masa para criar no aumenta nunca, así que no nace nadie. Ahora lo que crece un adulto va a esa masa.',
    'The mass for breeding never grows, so nothing is ever born. Now what an adult grows goes into it.'],
  comparar_enums: ['Tres comparaciones del código nunca se cumplen (comparan un tipo con un texto): no hay animales que mueran tras criar, ni migraciones de temporada, ni grupos que no crían. Ahora funcionan.',
    'Three comparisons in the code are never true (they compare a type with a text): no animals die after breeding, there is no seasonal migration and no non-breeding groups. Now they work.'],
  metamorfosis_solo_larvas: ['Al llegar a su peso adulto se transforma todo animal con metamorfosis, también los adultos: la mariposa vuelve a ser oruga y nunca cría. Ahora solo las larvas.',
    'Every animal with metamorphosis transforms when it reaches adult weight, adults too: the butterfly turns back into a caterpillar and never breeds. Now only larvae do.'],
  cohortes_iniciales_mezcladas: ['Al empezar, todos los animales son recién nacidos aunque se cuentan como adultos, y casi ninguno llega a criar. Ahora empiezan con pesos de cría a adulto.',
    'At the start every animal is a newborn even though they are counted as adults, and almost none reach breeding. Now they start with weights from young to adult.'],
  // animales: cazar
  caza_lineal: ['La probabilidad de encontrar una presa crece con su densidad al cuadrado. Ahora, en proporción a la densidad.',
    'The chance of finding prey grows with its density squared. Now it is proportional to the density.'],
  caza_redondeo: ['Cada caza mata siempre al menos un animal entero aunque el cazador solo quiera un bocado. Ahora se redondea al azar, con la misma media.',
    'Every hunt always kills at least one whole animal, even when the hunter only wants a bite. Now it is rounded at random, with the same average.'],
  tiempo_presas: ['Como con las plantas: todas las presas se cazan de una vez, pero solo les llega la parte de tiempo de una. Ahora reciben la de todas.',
    'As with plants: all prey are hunted in one go but only get the time share of one. Now they get the share of all of them.'],
  presas_pequenas: ['No se pueden cazar presas de menos de 0,1 g (termitas, insectos jóvenes). Ahora el límite baja a un microgramo.',
    'Prey under 0.1 g (termites, young insects) cannot be hunted. Now the limit goes down to a microgram.'],
  // animales: poblaciones
  damuth_log10: ['La regla que da cuántos animales hay según su tamaño (la ley de Damuth) usa un número sin pasarlo a logaritmo, y salen densidades absurdas. Ahora se usa bien.',
    'The rule that gives how many animals there are for their size (Damuth’s law) uses a number without taking its logarithm, giving absurd densities. Now it is used properly.'],
  fusionar_cohortes: ['Cada nacimiento crea un grupo nuevo y nunca se juntan, así que su número crece sin parar. Ahora, si un tipo de animal pasa de 60 grupos, se juntan los parecidos del mismo sitio (como en Madingley).',
    'Every birth creates a new group and they never merge, so their number grows without end. Now, if an animal type has more than 60 groups, similar ones in the same place are merged (as in Madingley).'],
  inmigracion: ['Cada trozo de bosque es una isla: no entra ni sale ningún animal. Ahora, si una población baja de la mitad de la de partida, entran animales por el borde, y si pasa del doble, salen.',
    'Each patch of forest is an island: no animal comes in or leaves. Now, if a population falls below half of its starting density animals come in from the edge, and if it goes over twice, they leave.'],
  // plantas
  restar_sotobosque: ['Lo que se comen los animales del sotobosque no se le resta: es comida infinita. Ahora se resta.',
    'What animals eat from the understorey is not taken away: it is endless food. Now it is.'],
  hojas_comidas_por_tallo: ['Las hojas que se come una cohorte entera se restan de cada uno de sus árboles; con muchos herbívoros las copas se quedan a cero. Ahora se reparte entre los árboles.',
    'The leaves eaten from a whole cohort are taken from each one of its trees; with many herbivores the crowns drop to zero. Now it is shared among the trees.'],
  agua_sin_negativos: ['Si el suelo se seca de más, el factor de agua sale negativo y las plantas producen en negativo. Ahora se queda en cero.',
    'If the soil gets too dry, the water factor goes negative and plants produce negatively. Now it stays at zero.'],
  reclutas_juntos: ['Cada tanda de plántulas nuevas es una cohorte nueva, y su número (y el tiempo de cálculo) crece sin parar. Ahora se suman a la cohorte de plántulas de su tipo.',
    'Each batch of new seedlings becomes a new cohort, and their number (and the computing time) grows without end. Now they join the seedling cohort of their type.'],
  // agua
  lluvia_paso_diario: ['A paso diario la lluvia se reparte por sorteo y se pierde el 70 % de los días, así que el suelo se seca. Ahora se usa la lluvia de cada día tal cual.',
    'With a daily step the rain is spread by a random draw and is lost on 70 % of days, so the soil dries out. Now each day’s rain is used as it is.'],
  evaporacion_suelo: ['La evaporación del suelo usa una magnitud equivocada (la presión de vapor en vez de la humedad) y divide por el calor latente donde no toca. Ahora sigue la fórmula correcta.',
    'Soil evaporation uses the wrong quantity (vapour pressure instead of humidity) and divides by the latent heat where it should not. Now it follows the right formula.'],
  // hojarasca y suelo
  tasa_cero: ['Con una tasa de descomposición de cero divide cero entre cero y sale un valor no numérico. Ahora no.',
    'With a decay rate of zero it divides zero by zero and gives a non-number. Not any more.'],
  setas_por_m2: ['Resta los kilos de setas comidas de una cantidad que va en kilos por metro cuadrado, y las setas quedan en negativo. Ahora se pasan antes a kilos por metro cuadrado.',
    'It takes the kilos of eaten mushrooms from an amount in kilos per square metre, and mushrooms go negative. Now they are converted to kilos per square metre first.'],
};

// [español, inglés] de cada ajuste de parámetros
export const TEXTO_AJUSTE = {
  'animal.constants.conversion_efficiency': ['<b>Eficiencia de asimilación.</b> El original pone 0,1 en herbívoros y 0,25 en carnívoros, que es la eficiencia entre niveles tróficos y ya descuenta la respiración; con el gasto aparte, la cuenta dos veces. Se usa la de Madingley: 0,5, 0,8 y 0,65 en omnívoros.',
    '<b>Assimilation efficiency.</b> The original uses 0.1 for herbivores and 0.25 for carnivores, which is the efficiency between trophic levels and already includes respiration; with energy use counted separately, it is counted twice. Madingley’s values are used: 0.5, 0.8 and 0.65 for omnivores.'],
  'animal.constants.cnp_proportion_terms': ['<b>Composición de los cuerpos.</b> El original da a los mamíferos un 50 % de carbono, 30 % de nitrógeno y 20 % de fósforo; un animal real ronda 80/17/3 (los insectos, 82/16/2).',
    '<b>Body composition.</b> The original gives mammals 50 % carbon, 30 % nitrogen and 20 % phosphorus; a real animal is about 80/17/3 (insects 82/16/2).'],
  'animal.constants.sigma_opt_pred_prey': ['<b>Tolerancia al tamaño de la presa.</b> Con 0,7, un pájaro de 100 g casi no «ve» insectos de medio gramo; se pone 2,0, porque los cazadores reales aceptan presas de tamaños muy distintos.',
    '<b>Prey size tolerance.</b> With 0.7, a 100 g bird hardly «sees» half-gram insects; 2.0 is used, because real hunters take prey of very different sizes.'],
  'animal.constants.birth_mass_threshold': ['<b>Umbral de cría.</b> El original pide juntar la mitad de su peso y suelta todas las crías de golpe (12 polluelos de un ave de 1 kg); se pone 1,1, un 10 %, que da 2 o 3.',
    '<b>Breeding threshold.</b> The original asks for half of the body weight and releases all the young at once (12 chicks from a 1 kg bird); 1.1 is used, 10 %, which gives 2 or 3.'],
};

const GRUPOS_ANIMAL = [
  [['Comer', 'Eating'], ['forrajeo_continuo', 'sotobosque_por_m2', 'tiempo_plantas', 'setas', 'agotar_recursos']],
  [['Gastar energía', 'Spending energy'], ['boltzmann_ev', 'metabolismo_una_vez', 'metabolismo_con_comida']],
  [['Criar', 'Breeding'], ['reproduccion', 'comparar_enums', 'metamorfosis_solo_larvas', 'cohortes_iniciales_mezcladas']],
  [['Cazar', 'Hunting'], ['caza_lineal', 'caza_redondeo', 'tiempo_presas', 'presas_pequenas']],
  [['Poblaciones', 'Populations'], ['damuth_log10', 'fusionar_cohortes', 'inmigracion']],
];

// todos los interruptores del motor, por grupo (de los objetos del código, no de una lista aparte)
export function interruptores() {
  const enGrupos = new Set(GRUPOS_ANIMAL.flatMap(([, l]) => l));
  const animal = GRUPOS_ANIMAL.map(([t, l]) => [t, l.filter((k) => k in CORRECCIONES_ANIMAL)]);
  const sueltos = Object.keys(CORRECCIONES_ANIMAL).filter((k) => !enGrupos.has(k));
  if (sueltos.length) animal.push([['Otras', 'Others'], sueltos]);
  return {
    animal,
    plantas: Object.keys(CORRECCIONES_PLANTAS),
    agua: Object.keys(CORRECCIONES_HIDROLOGIA),
    hojarascaSuelo: [...Object.keys(CORRECCIONES_HOJARASCA), ...Object.keys(CORRECCIONES_SUELO)],
    ajustes: Object.keys(AJUSTES),
  };
}

// el HTML del globo, en el idioma pedido (T = (es, en) => texto)
export function htmlAyudaCorrecciones(T) {
  const i = interruptores();
  const n = i.animal.reduce((s, [, l]) => s + l.length, 0) + i.plantas.length + i.agua.length + i.hojarascaSuelo.length;
  const fila = (k, textos) => {
    const t = textos[k];
    return `<li>${t ? T(t[0], t[1]) : T('(sin explicación)', '(no explanation)')} <small class="interruptor">${k}</small></li>`;
  };
  const lista = (l) => `<ul>${l.map((k) => fila(k, TEXTO_CORRECCION)).join('')}</ul>`;
  return `<h3>${T('Qué cambia la casilla «corregir el fallo de los herbívoros»', 'What the «fix the herbivore bug» box changes')}</h3>
<p>${T(`Enciende ${n} correcciones de fallos del código original y ${i.ajustes.length} ajustes de parámetros. <b>Apagada</b> (como viene), el motor da <b>exactamente los mismos bits</b> que el Virtual Ecosystem original. Se aplica al pulsar <b>Iniciar / reiniciar</b>. El escenario de Maliau ya las trae todas puestas.`,
    `It turns on ${n} fixes for bugs in the original code and ${i.ajustes.length} parameter adjustments. <b>Off</b> (the default), the engine gives <b>exactly the same bits</b> as the original Virtual Ecosystem. It applies when you press <b>Start / restart</b>. The Maliau scenario already has all of them on.`)}</p>
<h4>${T('Animales', 'Animals')}</h4>
${i.animal.map(([t, l]) => `<h5>${T(t[0], t[1])}</h5>${lista(l)}`).join('')}
<h4>${T('Plantas', 'Plants')}</h4>${lista(i.plantas)}
<h4>${T('Agua', 'Water')}</h4>${lista(i.agua)}
<h4>${T('Hojarasca y suelo', 'Leaf litter and soil')}</h4>${lista(i.hojarascaSuelo)}
<h4>${T('Ajustes de parámetros', 'Parameter adjustments')}</h4>
<p>${T('Valores del original que, con lo anterior arreglado, no tienen sentido:', 'Values of the original that make no sense once the above is fixed:')}</p>
<ul>${i.ajustes.map((k) => fila(k, TEXTO_AJUSTE)).join('')}</ul>
<h4>${T('La tasa de búsqueda de Maliau (lo más dudoso)', 'Maliau’s search rate (the most doubtful part)')}</h4>
<p>${T('Esto no lo pone la casilla: va en la tabla de animales del escenario de Maliau. Aun con todo lo anterior, las fórmulas de encuentro dan consumos que no casan con animales reales (unos grupos no comen y otros arrasan), así que cada grupo lleva un multiplicador de su tasa de búsqueda, calibrado para que asimile 1,5 veces lo que gasta. <b>Es lo más dudoso de todo</b>: los multiplicadores van de 0,000003 (termitas) a 260.000 (carroñeros), señal de que esas fórmulas no escalan con densidades y pesos reales y habría que revisarlas, no solo calibrarlas.',
    'This is not set by the box: it is in the animal table of the Maliau scenario. Even with all of the above, the encounter formulas give intakes that do not match real animals (some groups never eat and others wipe everything out), so each group has a multiplier on its search rate, calibrated so it assimilates 1.5 times what it spends. <b>It is the most doubtful part of all</b>: the multipliers go from 0.000003 (termites) to 260,000 (scavengers), a sign that those formulas do not scale with real densities and weights and should be reviewed, not just calibrated.')}</p>`;
}
