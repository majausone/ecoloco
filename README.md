# EcoLoco: Virtual Ecosystem en JavaScript

Port a JavaScript puro de [Virtual Ecosystem](https://github.com/ImperialCollegeLondon/virtual_ecosystem)
v0.2.2 (commit `0176dc2`), con una interfaz web y un comparador que comprueba que el
motor JS da **exactamente los mismos bits** que el original.

Encima del motor está **el mundo vivo de Maliau**: una simulación de animales individuales
(comen donde hay comida, beben, duermen a su hora, huyen, acechan y cazan, cortejan,
excavan, anidan...) que cada día cuadra con lo que dice el motor, y una página que lo
enseña en 3D con día y noche y velocidades de ×1 a ×600 y más.

El informe con lo que cuadra, lo que no y los tiempos está en [`informe/INFORME.md`](informe/INFORME.md).

## Qué hay

| Carpeta | Qué es |
|---|---|
| `motor/` | El motor. Módulos ES sin dependencias ni compilación; corre igual en Node y en un Web Worker. |
| `motor/modelos/` | Los 7 módulos: `plants`, `animal`, `hydrology`, `litter`, `abiotic`, `abiotic_simple`, `soil` (+ exportadores CSV). |
| `motor/pyrealm.js` | Lo que se usa de pyrealm (P-model, T-model, Flora, cohortes, dosel, `brentq`). |
| `motor/num/` | La base numérica: `exp/log/pow/sin/cos/asin` de la UCRT de Windows, sumas de numpy, BLAS de OpenBLAS, RK45 de scipy, `sum()` de CPython, orden de `set`... |
| `motor/azar/` | Generadores de azar idénticos a los de Python (`random`), numpy legacy y `default_rng` (PCG64). |
| `motor/salida/` | Escritura de las salidas como el original: zarr (grupos `inputs`, `init`, `outputs`) y CSV estilo pandas. |
| `interfaz/` | La interfaz web del motor (página + Web Worker + servidor estático mínimo). |
| `motor/correcciones.js` | Las correcciones del fallo de los herbívoros (y otros del original), todas opcionales. |
| `index.html`, `portada/` | La portada de EcoLoco: configurar el mundo, preajustes, mundos guardados. |
| `mundo/` | El mundo vivo, sin gráficos: puente con el motor, mapa, especies y comportamientos, el día minuto a minuto, semillas y director. Corre en Node y en un Worker. |
| `vivo/` | La página del mundo vivo: el mundo entero en 3D con los modelos de `graficos/pruebas-morta/borneo/` (terreno, bosque y animales por instancias). |
| `herramientas/` | Conversión de entradas, oráculo Python, comparadores y la suite de pruebas. |
| `pruebas/` | Pruebas automáticas de Node (`node --test`). |
| `datos/escenarios/` | Escenarios ya convertidos a JSON (configuración compilada + datos de entrada). |
| `datos/variantes/` | Configuraciones de prueba distintas del ejemplo (bio, clima, rejilla, diario). |

## Cómo se lanza

```
node interfaz/servidor.mjs          # o: npm run interfaz
```
y abrir <http://localhost:8090/>: la **portada de EcoLoco**. Desde ella se configura un mundo
antes de generarlo (tamaño, río, charcas, bosque, clima, semilla y qué especies hay), con
preajustes («Maliau, bosque maduro», «Claro tras un incendio», «Ribera», «Año seco (El Niño)»,
«Maliau a lo grande»), se ve lo que va a tener y se entra en la simulación; también lleva al
editor de modelos, a la galería de fotos frente a modelos, a la interfaz del motor a solas y
a los mundos guardados (los que se guardan desde la simulación, o un archivo `.json`).
La configuración está en `mundo/config.js`.

Todo desde la raíz del proyecto. Node 22 para el motor y la interfaz; el entorno del
original (`repos/virtual_ecosystem/.venv`) para las herramientas en Python.

### La interfaz

```
node interfaz/servidor.mjs          # o: npm run interfaz
```
y abrir <http://localhost:8090/interfaz/> (o «El motor a solas» en la portada). Se elige escenario, se tocan parámetros, tipos de
animal y planta y clima de partida, y se pulsa **Iniciar / reiniciar** y **▶ Correr**.

La casilla **corregir el fallo de los herbívoros** activa todas las correcciones y ajustes de
`motor/correcciones.js` (apagada, el motor da los mismos bits que el original).

### El mundo vivo de Maliau

```
node interfaz/servidor.mjs          # el mismo servidor
```
y abrir <http://localhost:8090/vivo/> (o entrar desde la portada, con la configuración elegida:
`vivo/?mundo=...`; con `&dia=N`, en ese día, recalculando antes el motor deprisa). Tarda de 3 a 10 s en cargar el escenario (43 MB),
generar el mundo y calcular el primer día. Lo que se ve es un diorama de 90 × 90 m: el cuadro
central del motor (que mide de verdad 90 m con 0,66 km² y 3,5 km con 1000 km²); con más km²,
más animales en ese cuadro y cada uno vale por más individuos. Arriba,
siempre: FPS, día, hora, velocidad, tiempo y **Animales en el mapa** (los individuos del motor).
Teclas: **espacio** pausa, **1–5** velocidad (×1, ×10, ×60, ×600, máx), **Z** resumen del día,
**G** seguir a un animal (Esc para dejarlo), **I** indicador, **B** (o el botón 🐾 de la
derecha) el panel, en pestañas: **Mundo** (tamaño, «Guardar este mundo», velocidad, ir a un
día, los animales del mapa por grupo con su gráfica), **Animales** (la ficha del seleccionado y
el listado por especie), **Datos** (las 149 variables del motor, del mundo o de un cuadro y por
capas, con su gráfica día a día) y **Parámetros** (clima, CO₂ y árboles desde el día siguiente,
y una predicción con y sin el cambio), **clic** en un animal para seleccionarlo, **C**
controles, **M** medidas (ms por fotograma, triángulos, llamadas de dibujo, animales
dibujados y simulados, tiempo de cálculo, N de los representantes), **Intro** pantalla
completa, **H** ayuda; la cámara es la de Unity (botón derecho + WASD, Q/E, rueda, F
encuadrar, P perspectiva/ortográfica). Con `?semilla=2` sale otro mundo; con `?km2=100`, un
mundo de 100 km². Donde mira la cámara (y el animal que se sigue) se simula minuto a minuto;
el resto del mundo, a pasos de 10 a 30 minutos. En la consola, `__vivo.banco(1500, 60)` mide
1500 fotogramas a ×60 (mediana, p95, máximo, tirones, triángulos).

Sin gráficos (Node):
```
node herramientas/mundo_dias.mjs --dias 10 [--km2 100]   # cada día: tiempo, animales, cazas, lo comido...
node herramientas/mundo_mecanismos.mjs --dias 30    # cuánto hace falta cada mecanismo para cuadrar
node herramientas/sostenibilidad.mjs --dias 1096 [--km2 100]   # el motor solo, 3 años: si Maliau se sostiene
node herramientas/mundo_escalas.mjs                 # lo que cuesta un día según el tamaño del mundo
```
El escenario `datos/escenarios/maliau.json` no está en git (pesa 43 MB): se genera con
`repos/virtual_ecosystem/.venv/Scripts/python herramientas/clima_maliau.py` (baja el clima de
Open-Meteo, monta el escenario y lo calibra).

### El motor sin interfaz (Node, a toda velocidad)

```
node herramientas/correr.mjs datos/escenarios/ejemplo.json --salida runs/js_ejemplo [--semilla 1]
```
Escribe `model_data.zarr` y los CSV igual que el original, más `motor_js.json` con los tiempos.

Desde código:
```js
import { Simulacion } from './motor/simulacion.js';
const sim = new Simulacion(escenario, { semilla: 1, meta });   // meta = motor/meta/metadatos.json
sim.inicializar();
while (!sim.terminada) sim.paso();      // el estado se lee cuando se quiera: sim.data.get('air_temperature')
```

### Un escenario nuevo a partir de TOML

```
repos/virtual_ecosystem/.venv/Scripts/python herramientas/convertir_entradas.py --salida datos/escenarios/mio.json [-c "core.timing.update_interval='1 day'"] config/*.toml
```
Usa la maquinaria del propio original para compilar la configuración (con todos los valores
por defecto) y leer los `.nc` y `.csv`. Los escenarios de `datos/escenarios/` salen solos en
el desplegable de la interfaz.

### Las pruebas

```
node --test pruebas/*.test.js                                    # rápidas, sin Python (npm test); las del mundo vivo necesitan maliau.json
repos/virtual_ecosystem/.venv/Scripts/python herramientas/suite.py [casos] [--reusar]
```
La suite es la comparación de verdad: para cada caso (`mensual`, `diario`, `simple`, `bio`,
`clima`, `rejilla`) convierte la configuración, corre el original con
`herramientas/oraculo.py` (que lo hace determinista sin tocar su código), corre el motor JS
y compara todas las salidas con `herramientas/comparar.py`. Deja `runs/cmp_<caso>.md` e
`informe/suite.json`, y devuelve error si algo no es idéntico. El caso `diario` tarda unas
6 horas en el original.

Para depurar un módulo por separado (sustituyendo los demás por los datos del original):
```
repos/virtual_ecosystem/.venv/Scripts/python herramientas/oraculo.py --semilla 1 --salida runs/py_x --volcar runs/py_x/volcado config/*.toml
node herramientas/comparar_volcado.mjs datos/escenarios/ejemplo.json runs/py_x/volcado
```
