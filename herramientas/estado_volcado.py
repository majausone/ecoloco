"""Lee una entrada de un volcado del oráculo como dict de numpy arrays (para depurar)."""
import json
from pathlib import Path
import numpy as np

class Volcado:
    def __init__(self, d):
        self.d = Path(d)
        self.indice = json.loads((self.d / "indice.json").read_text())
        self.bin = np.memmap(self.d / "datos.bin", dtype="<f8", mode="r")
    def claves(self):
        return [e["clave"] for e in self.indice]
    def estado(self, clave):
        e = next(x for x in self.indice if x["clave"] == clave)
        return {k: np.array(self.bin[m["offset"] // 8: m["offset"] // 8 + m["n"]]).reshape(m["shape"]) for k, m in e["vars"].items()}
