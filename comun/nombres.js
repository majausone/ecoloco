// Los nombres de las especies, sus categorías y los grupos del motor en inglés (los de
// español están en graficos/pruebas-morta/borneo/especies.js). nombreEsp(e) da el nombre de
// una especie en el idioma elegido; nombreGrupo(g, es) el de un grupo del motor.
import { T, enIngles } from './idioma.js?v=202610032043';

export const NOMBRE_EN = {
  'pantera-nebulosa': 'Sunda clouded leopard', 'gato-leopardo': 'Sunda leopard cat', muntiaco: 'Bornean yellow muntjac', 'ciervo-raton': 'Greater mouse-deer',
  orangutan: 'Bornean orangutan', macaco: 'Long-tailed macaque', 'jabali-barbudo': 'Bearded pig', 'ardilla-prevost': "Prevost's squirrel",
  varano: 'Asian water monitor', 'dragon-bosque': 'Bornean forest dragon', 'eslizon-solar': 'Common sun skink', 'vibora-verde': 'Bornean keeled green pit viper',
  'piton-reticulada': 'Reticulated python', 'rana-gigante-rio': 'Giant river frog', 'rana-arboricola': 'Dark-eared tree frog',
  'aguila-culebrera': 'Crested serpent eagle', 'buho-pardo': 'Brown wood owl', calao: 'Bushy-crested hornbill', 'gallo-bankiva': 'Red junglefowl', golondrina: 'Pacific swallow',
  'escarabajo-tigre': 'Golden tiger beetle', 'mantis-hoja-seca': 'Giant dead leaf mantis', libelula: 'Fulvous forest skimmer', fulgorido: 'Lanternfly',
  'escarabajo-atlas': 'Atlas beetle', 'insecto-palo': "Chan's megastick", cigarra: 'Giant cicada', oruga: "Rajah Brooke's caterpillar",
  'rajah-brooke': "Rajah Brooke's birdwing", 'ninfa-arbol': 'Tree nymph', lombriz: 'Earthworm', pelotero: 'Dung beetle', termita: 'Processional termite',
  dipterocarpo: 'Seraya (emergent dipterocarp)', agathis: 'Bornean kauri', higuera: 'Strangler fig', roble: 'Tropical oak', dillenia: 'Simpoh gajah',
  'pino-apio': 'Celery pine', rododendro: 'Long-flowered rhododendron', 'palma-cola-pez': 'Giant fishtail palm', pinanga: 'Understorey palm',
  'jengibre-antorcha': 'Torch ginger', phrynium: 'Phrynium', 'helecho-dipteris': 'Umbrella fern', 'cuerno-alce': 'Crown staghorn fern',
  rhaphidophora: 'Shingle plant', 'orquidea-tigre': 'Tiger orchid', 'nepenthes-stenophylla': 'Pitcher plant', 'nepenthes-rajah': 'Giant pitcher plant',
  rafflesia: 'Rafflesia', amanita: 'Sculpted amanita', russula: 'Red russula', 'boleto-ruibarbo': 'Rhubarb bolete', 'falo-velo': 'Bridal veil stinkhorn',
  'estrella-roja': 'Starfish fungus', 'copa-tropical': 'Hairy tropical cup', repisa: 'Yellow-footed bracket', 'poros-luminosos': 'Glowing bonnet',
  'mycena-verde': 'Green glowing mycena', termitomyces: 'Termite mushroom', cordyceps: 'Zombie-ant fungus',
};
export const CATEGORIA_EN = {
  'Mamíferos': 'Mammals', Reptiles: 'Reptiles', Anfibios: 'Amphibians', Aves: 'Birds', Insectos: 'Insects', 'Árboles emergentes': 'Emergent trees',
  'Árboles del dosel': 'Canopy trees', 'Brezal de montaña (kerangas)': 'Montane heath (kerangas)', Palmas: 'Palms', Sotobosque: 'Understorey', Helechos: 'Ferns',
  'Trepadoras y epífitas': 'Climbers and epiphytes', 'Plantas carnívoras': 'Carnivorous plants', 'Parásitas': 'Parasites',
  'Hongos de las raíces (ectomicorrizas)': 'Root fungi (ectomycorrhizal)', 'Descomponedores (saprófitos)': 'Decomposers (saprotrophs)',
  'Setas que brillan': 'Glowing mushrooms', 'Hongos con otros animales': 'Fungi living with animals',
};
export const GRUPO_EN = {
  carnivorous_mammal: 'Cats', herbivorous_mammal: 'Herbivorous mammals', fungivorous_mammal: 'Pigs and squirrels', scavenging_mammal: 'Monitor lizards',
  herbivorous_lizard: 'Forest dragons', thermophilic_lizard: 'Skinks', carnivorous_snake: 'Snakes', frog: 'Frogs',
  carnivorous_bird: 'Birds of prey', herbivorous_bird: 'Hornbills and junglefowl', swallow: 'Swallows',
  carnivorous_insect_iteroparous: 'Tiger beetles', carnivorous_insect_semelparous: 'Mantises and dragonflies', herbivorous_insect_iteroparous: 'Lanternflies and beetles',
  herbivorous_insect_semelparous: 'Stick insects and cicadas', caterpillar: 'Caterpillars', butterfly: 'Butterflies', earthworm: 'Earthworms', dung_beetle: 'Dung beetles', detritivorous_insect: 'Termites',
};
export const nombreEsp = (e) => (e ? T(e.nombre, NOMBRE_EN[e.id] || e.nombre) : '');
export const nombreGrupo = (g, es) => T(es || g, GRUPO_EN[g] || g);
export const categoria = (c) => T(c, CATEGORIA_EN[c] || c);
export { enIngles };
