# ez-tree (copia dentro de EcoLoco)

Generador de árboles con semilla para three.js de **Daniel Greenheck**, licencia MIT (ver `LICENSE`).
Original: https://github.com/dgreenheck/ez-tree · npm `@dgreenheck/ez-tree` 1.1.0.
Esta copia sale de `src/lib/` de esa versión (la que estaba en el proyecto tarántula, commit `ed45a94`,
carpeta `3dmap/ez-tree/`), sin empaquetador: módulos ES que se cargan tal cual en el navegador, en un
Web Worker y en Node.

Cambios respecto al original (marcados con «EcoLoco» en el código):
- Usa el three.js del proyecto (`graficos/pruebas-morta/vendor/three.module.js`, r186) por ruta
  relativa, y los `import` llevan `.js`.
- Sin texturas de archivo ni presets: `textures.js` deja que quien lo use ponga las suyas
  (`ponerTexturas`); sin ellas, el árbol sale sin textura y se puede generar sin DOM. Las hojas de
  EcoLoco se pintan por código (`graficos/pruebas-morta/borneo/plantas-textura.js`).
- `Tree.generate()` apunta el esqueleto (`tree.esqueleto`: las secciones de cada rama, con su nivel)
  y cada hoja (`tree.hojasInfo`: origen, orientación y tamaño), para rehacer la malla a otro nivel
  de detalle y para saber dónde se pueden posar los animales.
- Índices de 32 bits cuando un árbol pasa de 65.535 vértices.
