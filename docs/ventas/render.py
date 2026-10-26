"""Renders the sales material (folleto and presentación) to PDF with the same
engine the app uses for its documents. Run from the repo root:

    uv run --directory backend python ../docs/ventas/render.py
"""

from pathlib import Path

from weasyprint import HTML

HERE = Path(__file__).resolve().parent

for name in ("folleto", "presentacion"):
    source = HERE / f"{name}.html"
    target = HERE / f"{name}.pdf"
    HTML(filename=str(source)).write_pdf(str(target))
    print(f"{target.name}: {target.stat().st_size // 1024} KB")
