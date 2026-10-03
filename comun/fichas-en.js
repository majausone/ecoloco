// Las fichas de las especies en inglés (las de español están en
// graficos/pruebas-morta/borneo/especies.js): dieta, dónde, nota y, en plantas y hongos, lo que
// son en el motor. dato(e, 'nota') da el campo en el idioma elegido.
import { enIngles } from './idioma.js?v=202610032007';

export const FICHA_EN = {
  'pantera-nebulosa': ['Deer, pigs, monkeys, porcupines', 'Maliau and Sabah', 'The largest cat in Borneo. It weighs half as much as the engine group.'],
  'gato-leopardo': ['Rodents, birds, frogs, insects', 'Sabah', 'Small variant of the same group: it would be used for low-weight cohorts.'],
  muntiaco: ['Leaves, fallen fruit, shoots, seeds', 'Maliau (barking deer) and Sabah', ''],
  'ciervo-raton': ['Leaves, shoots, fallen fruit', 'Maliau', 'Small variant of the herbivore group.'],
  orangutan: ['Mostly fruit (figs), leaves, bark', 'Sabah', 'Large fruit eater: the engine has no primate group, so it falls under herbivores.'],
  macaco: ['Fruit, seeds, leaves, insects, crabs', 'Sabah (very common)', 'Omnivore; in the engine it would go to herbivores.'],
  'jabali-barbudo': ['Fruit, roots, mushrooms, earthworms, carrion', 'Maliau and Sabah', 'It eats mushrooms, but it is an omnivore and much larger than the group (10 kg). No Bornean mammal of that size lives on mushrooms.'],
  'ardilla-prevost': ['Fruit, seeds, insects; squirrels eat the most mushrooms', 'Maliau and Sabah', 'Small variant of the group: squirrels are the biggest mushroom eaters.'],
  varano: ['Fish, frogs, rodents, birds, crabs and lots of carrion', 'Maliau', 'The real 20 kg scavenger of Borneo, but it is a reptile, not a mammal.'],
  'dragon-bosque': ['Insects (it does not eat plants)', 'Maliau', 'There are no herbivorous lizards in Borneo: it is a stand-in so the group can be drawn.'],
  'eslizon-solar': ['Insects (it does not eat plants)', 'Maliau', 'A sun-basking lizard, as the group requires, but it eats insects: a stand-in.'],
  'vibora-verde': ['Tree birds and rodents, frogs', 'Maliau (among the most seen)', ''],
  'piton-reticulada': ['Mammals and birds', 'Maliau', 'Large variant of the snake group.'],
  'rana-gigante-rio': ['Insects, crabs, other frogs', 'Maliau (endemic to Borneo)', ''],
  'rana-arboricola': ['Insects', 'Maliau', 'Small variant of the group.'],
  'aguila-culebrera': ['Snakes, lizards, frogs, small mammals', 'Borneo', ''],
  'buho-pardo': ['Rodents, birds, large insects', 'Maliau', 'Night hunter of the same group.'],
  calao: ['Mostly fruit (also cicadas, lizards)', 'Borneo', ''],
  'gallo-bankiva': ['Seeds, shoots, insects', 'Maliau', 'Ground variant of the herbivore group.'],
  golondrina: ['Insects on the wing', 'Maliau', ''],
  'escarabajo-tigre': ['Hunts insects, ants, spiders', 'Maliau', ''],
  'mantis-hoja-seca': ['Hunts insects', 'Maliau', ''],
  libelula: ['Hunts insects on the wing (the nymph, in the water)', 'Maliau (dragonflies are the most seen)', 'Flying variant of the group.'],
  fulgorido: ['Tree sap', 'Maliau', ''],
  'escarabajo-atlas': ['Sap and fruit (the larva, rotting wood)', 'Maliau', ''],
  'insecto-palo': ['Leaves', 'Maliau (Phobaeticus)', 'Among the longest insects in the world.'],
  cigarra: ['Sap (the nymph, from roots underground)', 'Maliau', ''],
  oruga: ['Aristolochia leaves', 'Borneo', 'It turns into the butterfly below.'],
  'rajah-brooke': ['Nectar, mineral salts from the ground', 'Borneo', ''],
  'ninfa-arbol': ['Nectar', 'Maliau', 'It flies slowly, like paper in the wind.'],
  lombriz: ['Leaf litter, fungi, soil bacteria', 'species not checked', 'Generic: I have not checked the Maliau species.'],
  pelotero: ['Dung', 'species not checked', 'Generic: I have not checked the Maliau species.'],
  termita: ['Lichens and log debris', 'Maliau', 'They come out at night in columns of thousands.'],
  dipterocarpo: [null, 'Maliau', 'Maliau’s lowland forest is made of dipterocarps (74 species), with emergents over 30 m. Their fruits have wings. They live bound to fungi (Amanita, Russula).', 'Tree (broadleaf PFT)'],
  agathis: [null, 'Maliau', 'It dominates Maliau’s lower montane forest. A broad-leaved conifer.', 'Tree (broadleaf PFT)'],
  higuera: [null, 'Maliau (Ficus punctata) and Borneo', 'Keystone species: its figs feed orangutans, hornbills and over a thousand species. It starts high up and hugs the tree with its roots.', 'Tree (broadleaf PFT)'],
  roble: [null, 'Maliau (Lithocarpus pulcher)', 'Oaks and laurels make up Maliau’s montane forest.', 'Tree (broadleaf PFT)'],
  dillenia: [null, 'Sabah', 'Huge leaves and yellow flowers.', 'Tree (broadleaf PFT)'],
  'pino-apio': [null, 'Maliau', 'Small conifer of the montane heath, on poor soil.', 'Shrub (PFT)'],
  rododendro: [null, 'Maliau', 'Common in the Maliau heath, with red tubular flowers.', 'Shrub (PFT)'],
  'palma-cola-pez': [null, 'Maliau', 'Leaves split like fish tails and hanging bunches.', 'Tree (broadleaf PFT)'],
  pinanga: [null, 'Maliau', 'Small shade palm.', 'Shrub (PFT)'],
  'jengibre-antorcha': [null, 'Maliau', 'Tall leafy canes and a red flower like a torch rising from the ground.', 'Subcanopy vegetation'],
  phrynium: [null, 'Maliau', 'Large paddle-like leaves on long stalks.', 'Subcanopy vegetation'],
  'helecho-dipteris': [null, 'Maliau', 'Fan-shaped leaves split in two, on tall stalks.', 'Subcanopy vegetation'],
  'cuerno-alce': [null, 'Maliau', 'It lives hanging from trunks (epiphyte).', 'Subcanopy vegetation'],
  rhaphidophora: [null, 'Maliau', 'It climbs trunks with its leaves pressed flat like tiles.', 'Subcanopy vegetation'],
  'orquidea-tigre': [null, 'Maliau', 'The largest orchid in the world; it lives on branches.', 'Subcanopy vegetation'],
  'nepenthes-stenophylla': [null, 'Maliau', 'The most observed plant in Maliau. It traps insects in its pitchers.', 'Subcanopy vegetation'],
  'nepenthes-rajah': [null, 'Sabah', 'Huge pitchers on the ground. From Sabah.', 'Subcanopy vegetation'],
  rafflesia: [null, 'Sabah and Maliau', 'The largest flower in the world; it lives inside a liana and only the flower shows. Maliau has Rafflesia tengku-adlinii.', 'not in the engine'],
  amanita: [null, 'Maliau', 'It lives on the roots of dipterocarps and feeds them nutrients.', 'Ectomycorrhizal fungi'],
  russula: [null, 'Borneo', 'The genus that most dominates dipterocarp roots.', 'Ectomycorrhizal fungi'],
  'boleto-ruibarbo': [null, 'Maliau', 'Red cap and yellow pores.', 'Ectomycorrhizal fungi'],
  'falo-velo': [null, 'Maliau', 'A white lace skirt; it smells rotten to attract flies.', 'Saprotrophic fungi'],
  'estrella-roja': [null, 'Sabah', 'The most observed mushroom in Sabah.', 'Saprotrophic fungi'],
  'copa-tropical': [null, 'Sabah', 'Small hairy orange cups on fallen branches.', 'Saprotrophic fungi'],
  repisa: [null, 'Sabah', 'Thin funnels on rotting logs.', 'Saprotrophic fungi'],
  'poros-luminosos': [null, 'Sabah', 'It glows at night.', 'Saprotrophic fungi'],
  'mycena-verde': [null, 'Sabah', 'It glows green at night.', 'Saprotrophic fungi'],
  termitomyces: [null, 'Sabah', 'Termites farm it inside the mound and it comes out at the top.', 'Saprotrophic fungi'],
  cordyceps: [null, 'Sabah', 'It infects an ant, makes it climb a leaf and grows a stalk out of its head.', 'not in the engine'],
};
// los grupos del motor, con su peso (editor)
export const GRUPOS_EN = {
  carnivorous_mammal: 'Carnivorous mammal (40 kg)', herbivorous_mammal: 'Herbivorous mammal (10 kg)', fungivorous_mammal: 'Fungivorous mammal (10 kg)', scavenging_mammal: 'Scavenging mammal (20 kg)',
  carnivorous_bird: 'Carnivorous bird (1 kg)', herbivorous_bird: 'Herbivorous bird (0.5 kg)', swallow: 'Swallow (0.2 kg)', frog: 'Frog (0.5 kg)', herbivorous_lizard: 'Herbivorous lizard (0.5 kg)',
  thermophilic_lizard: 'Thermophilic lizard (0.3 kg)', carnivorous_snake: 'Carnivorous snake (1 kg)', carnivorous_insect_iteroparous: 'Carnivorous insect, breeds many times',
  carnivorous_insect_semelparous: 'Carnivorous insect, breeds once', herbivorous_insect_iteroparous: 'Herbivorous insect, breeds many times', herbivorous_insect_semelparous: 'Herbivorous insect, breeds once',
  caterpillar: 'Caterpillar', butterfly: 'Butterfly', earthworm: 'Earthworm', dung_beetle: 'Dung beetle', detritivorous_insect: 'Leaf-litter insect',
};
export const ANIMACION_EN = {
  quieto: 'Idle', andar: 'Walk', correr: 'Run', comer: 'Eat', atacar: 'Attack', dormir: 'Sleep', morir: 'Die', sentarse: 'Sit', flexiones: 'Push-ups', reptar: 'Slither',
  enrollarse: 'Coil up', saltar: 'Jump', croar: 'Croak', saltitos: 'Hop', volar: 'Fly', planear: 'Glide', empujar: 'Push the ball', arrastrarse: 'Crawl',
  viento: 'Wind', crecer: 'Grow', florecer: 'Bloom', fructificar: 'Fruit', marchitar: 'Wither', caer: 'Fall (die)', brotar: 'Sprout', esporas: 'Release spores', brillar: 'Glow', pudrir: 'Rot',
};
const CAMPO = { dieta: 0, donde: 1, nota: 2, grupo: 3 };
// un campo de la ficha en el idioma elegido
export const dato = (e, campo) => {
  if (!enIngles()) return e?.[campo];
  const f = FICHA_EN[e?.id];
  return f && f[CAMPO[campo]] != null ? f[CAMPO[campo]] : e?.[campo];
};
