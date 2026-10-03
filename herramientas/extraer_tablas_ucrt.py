"""Extrae de ucrtbase.dll las tablas y constantes que usan exp, log y pow.

El numpy de esta máquina (Windows, AVX2) no usa sus propias rutinas SIMD para exp/log/pow
en float64: llama a las de la UCRT de Windows (las mismas que usa math.exp de Python).
Para que el motor JS dé exactamente los mismos bits hay que reproducir esas rutinas, y
para eso necesitamos sus tablas. Este script las lee de la DLL instalada y genera
motor/num/tablas_ucrt.js.

Uso (con el entorno de herramientas, que tiene pefile):
    tmp/toolsenv/Scripts/python herramientas/extraer_tablas_ucrt.py

Las direcciones son las de ucrtbase.dll 10.0.26100 (Windows 11 24H2/25H2). Si la DLL
cambia, el script lo detecta comprobando unos valores conocidos y se para.
"""

import hashlib
import struct
import sys
from pathlib import Path

import pefile

DLL = Path(r"C:\Windows\System32\ucrtbase.dll")
SALIDA = Path(__file__).resolve().parent.parent / "motor" / "num" / "tablas_ucrt.js"

# (nombre, rva, número de qwords)
TABLAS = [
    ("EXP_T1", 0x10C580, 64),
    ("EXP_T2", 0x10C380, 64),
    ("EXP_T3", 0x10C180, 64),
    ("LOG_TINV", 0x10A650, 257),
    ("LOG_TA", 0x109420, 257),
    ("LOG_TB", 0x109C30, 257),
    ("POW_LOG", 0x102DE8, 512),
    ("POW_EXP", 0x103EB0, 512),
    ("LOG10_TA", 0x107EA0, 257),
    ("LOG10_TB", 0x1086B0, 257),
]

# comprobaciones: rva -> qword esperado
COMPROBAR = {
    0x107198: 0x40571547652B82FE,
    0x1075E0: 0x3FE62E42E0000000,
    0x102D98: 0x3FE62E42FEFA3800,
    0x104EC8: 0x40771547652B82FE,
}


def main() -> None:
    pe = pefile.PE(str(DLL))
    img = pe.get_memory_mapped_image()

    def q(a: int) -> int:
        return struct.unpack("<Q", img[a : a + 8])[0]

    for rva, esperado in COMPROBAR.items():
        if q(rva) != esperado:
            sys.exit(f"ucrtbase.dll no es la versión esperada (rva {rva:#x})")

    huella = hashlib.sha256(DLL.read_bytes()).hexdigest()
    lineas = [
        "// Generado por herramientas/extraer_tablas_ucrt.py: no editar a mano.",
        f"// Origen: {DLL.name} sha256 {huella}",
        "",
    ]
    for nombre, rva, n in TABLAS:
        valores = ",".join(f'"{q(rva + 8 * i):016x}"' for i in range(n))
        lineas.append(f"export const {nombre} = [{valores}];")
    SALIDA.write_text("\n".join(lineas) + "\n", encoding="utf-8")
    print(f"Escrito {SALIDA}")


if __name__ == "__main__":
    main()
