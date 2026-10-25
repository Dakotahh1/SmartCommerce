"""Exporta la especificación OpenAPI del servicio FastAPI a `docs/api/python-service.openapi.json`.

La documentación interactiva (`/docs`) solo existe con el servicio corriendo y fuera de producción;
este archivo versionado permite revisar los contratos sin levantar nada. Con `--check` no escribe:
falla si el archivo del repositorio no coincide con el código (lo usa el pipeline).

Uso (desde python-service/):  uv run python scripts/export_openapi.py [--check]
"""

import json
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

OUTPUT = ROOT.parent / "docs" / "api" / "python-service.openapi.json"


def render() -> str:
    version = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"][
        "version"
    ]
    # Solo se construye el esquema: el token no se usa y la aplicación no arranca ni se conecta.
    settings = Settings(internal_api_token="x" * 32, service_version=version, log_level="WARNING")
    spec = create_app(settings).openapi()
    return json.dumps(spec, ensure_ascii=False, indent=2) + "\n"


def main() -> None:
    contenido = render()
    destino = OUTPUT.relative_to(ROOT.parent)
    if "--check" in sys.argv:
        actual = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else ""
        if actual != contenido:
            sys.exit(
                f"{destino} no coincide con la API. Regenerar con:"
                " uv run python scripts/export_openapi.py"
            )
        print(f"{destino} al día")
        return
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(contenido, encoding="utf-8", newline="\n")
    print(f"OpenAPI escrito en {destino}")


if __name__ == "__main__":
    main()
