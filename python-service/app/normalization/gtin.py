"""Validación y canonización de códigos GTIN (EAN-8, UPC-A, EAN-13, GTIN-14)."""

import re

_SEPARATORS = re.compile(r"[\s\-.]")
VALID_LENGTHS = frozenset({8, 12, 13, 14})


class InvalidGtinError(ValueError):
    """El código no es un GTIN válido."""


def gs1_check_digit_is_valid(digits: str) -> bool:
    """Verifica el dígito de control GS1 (módulo 10 con pesos 3-1 desde la derecha)."""
    body, check = digits[:-1], int(digits[-1])
    total = sum(int(ch) * (3 if i % 2 == 0 else 1) for i, ch in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def canonicalize_gtin(raw: object) -> str:
    """Devuelve el GTIN canónico o lanza `InvalidGtinError` con el motivo.

    - UPC-A (12 dígitos) se convierte a EAN-13 anteponiendo un cero.
    - GTIN-14 con indicador 0 se reduce a EAN-13.
    """
    if raw is None:
        raise InvalidGtinError("GTIN ausente")
    code = _SEPARATORS.sub("", str(raw))
    if not code:
        raise InvalidGtinError("GTIN ausente")
    if not code.isdigit():
        raise InvalidGtinError("GTIN con caracteres no numéricos")
    if len(code) not in VALID_LENGTHS:
        raise InvalidGtinError("GTIN con largo inválido (se esperan 8, 12, 13 o 14 dígitos)")
    if not gs1_check_digit_is_valid(code):
        raise InvalidGtinError("GTIN con dígito verificador inválido")
    if len(code) == 12:
        return "0" + code
    if len(code) == 14 and code.startswith("0"):
        return code[1:]
    return code
