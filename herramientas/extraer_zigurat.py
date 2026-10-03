"""Genera motor/azar/zigurat.js con las tablas del zigurat de numpy (ziggurat_constants.h).

Uso: python herramientas/extraer_zigurat.py <ruta a numpy/random/src/distributions/ziggurat_constants.h>
"""
import re
import struct
import sys
from pathlib import Path

src = Path(sys.argv[1]).read_text()
salida = Path(__file__).resolve().parent.parent / "motor" / "azar" / "zigurat.js"
lineas = ["// Generado por herramientas/extraer_zigurat.py a partir de numpy 2.5.3: no editar.", ""]
for nombre, tipo in [("ki_double", "u64"), ("wi_double", "f64"), ("fi_double", "f64"),
                     ("ke_double", "u64"), ("we_double", "f64"), ("fe_double", "f64")]:
    m = re.search(r"static const (?:uint64_t|double) " + nombre + r"\[\] = \{(.*?)\};", src, re.S)
    vals = [v.strip() for v in m.group(1).replace("\n", " ").split(",") if v.strip()]
    if tipo == "u64":
        hexs = [f"{int(v.rstrip('ULul'), 0):016x}" for v in vals]
    else:
        hexs = [struct.pack(">d", float(v)).hex() for v in vals]
    assert len(hexs) == 256, (nombre, len(hexs))
    lineas.append(f"export const {nombre.upper()} = [{','.join(chr(34)+h+chr(34) for h in hexs)}];")
for nombre in ["ziggurat_nor_r", "ziggurat_nor_inv_r", "ziggurat_exp_r"]:
    m = re.search(r"static const double " + nombre + r" =\s*([0-9.eE+-]+)", src)
    lineas.append(f"export const {nombre.upper()} = {float(m.group(1))!r};")
salida.write_text("\n".join(lineas) + "\n", encoding="utf-8")
print("Escrito", salida)
