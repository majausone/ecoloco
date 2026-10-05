// EcoLoco: sin las texturas de corteza y hoja del original (son JPG/PNG que se importaban con
// el empaquetador). Quien use el árbol pone las suyas con ponerTexturas(); si no hay, el árbol
// sale sin textura (así también se puede generar en Node o en un Worker, sin DOM).
const texturas = { bark: {}, leaves: {} };

export function ponerTexturas({ bark = {}, leaves = {} } = {}) {
  Object.assign(texturas.bark, bark);
  Object.assign(texturas.leaves, leaves);
}

export function getBarkTexture(barkType, fileType) {
  return texturas.bark[barkType]?.[fileType] ?? null;
}

export function getLeafTexture(leafType) {
  return texturas.leaves[leafType] ?? null;
}
