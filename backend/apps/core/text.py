"""Wording shared by messages, notices and documents."""


def plural(count: int, singular: str, many: str | None = None) -> str:
    """«1 préstamo», «3 préstamos»: never «préstamo(s)». The plural defaults
    to the singular plus «s»; pass it when it is «reversos pedidos»,
    «condonaciones»…"""
    return f"{count} {singular if count == 1 else (many or f'{singular}s')}"
