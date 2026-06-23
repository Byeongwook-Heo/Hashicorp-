#!/usr/bin/env python3
from __future__ import annotations

import html
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / "docs" / "vault-benchmark-test-result-2026-06-23.md"
OUT_DIR = ROOT / "docs" / "assets" / "vault-benchmark"

THREADS = [2, 4, 8, 16, 32, 64, 128]
BATCH_COUNTS = [20, 40, 80, 160, 320]

CHARTS = [
    ("Transit Encrypt - TPS", "transit-encrypt-tps.svg", "requests/sec"),
    ("Transit Decrypt - TPS", "transit-decrypt-tps.svg", "requests/sec"),
    ("Transform FPE Encode - TPS", "transform-fpe-encode-tps.svg", "requests/sec"),
    ("Transit Encrypt - Item Throughput", "transit-encrypt-item-throughput.svg", "items/sec"),
    ("Transit Decrypt - Item Throughput", "transit-decrypt-item-throughput.svg", "items/sec"),
    ("Transform FPE Encode - Item Throughput", "transform-fpe-encode-item-throughput.svg", "items/sec"),
]

COLORS = ["#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c"]


def parse_number(value: str) -> float:
    return float(value.strip().replace(",", ""))


def extract_table(markdown: str, heading: str) -> dict[int, list[float]]:
    pattern = rf"### {re.escape(heading)}(?:\s+\([^\n]+\))?\n\n단위:[^\n]+\n\n(?:!\[[^\n]+\]\([^)]+\)\n\n)?(?P<table>\| Batch Count \|[\s\S]*?)(?:\n\n###|\n\n##|\Z)"
    match = re.search(pattern, markdown)
    if not match:
        raise RuntimeError(f"Unable to find table for heading: {heading}")

    lines = [line.strip() for line in match.group("table").strip().splitlines()]
    rows = {}
    for line in lines[2:]:
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if not cells or not cells[0].isdigit():
            continue
        rows[int(cells[0])] = [parse_number(cell) for cell in cells[1:]]
    return rows


def fmt_axis(value: float) -> str:
    if value >= 1_000_000:
        return f"{value / 1_000_000:.1f}M"
    if value >= 1_000:
        return f"{value / 1_000:.0f}K"
    return f"{value:.0f}"


def fmt_tooltip(value: float) -> str:
    return f"{value:,.2f}"


def line_path(points: list[tuple[float, float]]) -> str:
    first, *rest = points
    return " ".join([f"M {first[0]:.2f} {first[1]:.2f}"] + [f"L {x:.2f} {y:.2f}" for x, y in rest])


def render_chart(title: str, unit: str, data: dict[int, list[float]], output: Path) -> None:
    width, height = 1100, 620
    left, right, top, bottom = 92, 210, 70, 96
    plot_w = width - left - right
    plot_h = height - top - bottom
    max_value = max(max(values) for values in data.values())
    y_max = max_value * 1.12
    y_ticks = 5

    def x_pos(index: int) -> float:
        return left + (plot_w * index / (len(THREADS) - 1))

    def y_pos(value: float) -> float:
        return top + plot_h - (value / y_max * plot_h)

    svg: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">',
        f"<title>{html.escape(title)}</title>",
        f"<desc>{html.escape(title)} benchmark line chart by thread and connection count.</desc>",
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        f'<text x="{left}" y="38" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#111827">{html.escape(title)}</text>',
        f'<text x="{left}" y="61" font-family="Arial, sans-serif" font-size="13" fill="#4b5563">X axis: Thread/Connection, Y axis: {html.escape(unit)}</text>',
    ]

    for tick in range(y_ticks + 1):
        value = y_max * tick / y_ticks
        y = y_pos(value)
        svg.append(f'<line x1="{left}" y1="{y:.2f}" x2="{left + plot_w}" y2="{y:.2f}" stroke="#e5e7eb" stroke-width="1"/>')
        svg.append(f'<text x="{left - 12}" y="{y + 4:.2f}" text-anchor="end" font-family="Arial, sans-serif" font-size="12" fill="#6b7280">{fmt_axis(value)}</text>')

    svg.append(f'<line x1="{left}" y1="{top}" x2="{left}" y2="{top + plot_h}" stroke="#374151" stroke-width="1.4"/>')
    svg.append(f'<line x1="{left}" y1="{top + plot_h}" x2="{left + plot_w}" y2="{top + plot_h}" stroke="#374151" stroke-width="1.4"/>')

    for index, thread in enumerate(THREADS):
        x = x_pos(index)
        svg.append(f'<line x1="{x:.2f}" y1="{top + plot_h}" x2="{x:.2f}" y2="{top + plot_h + 6}" stroke="#374151" stroke-width="1"/>')
        svg.append(f'<text x="{x:.2f}" y="{top + plot_h + 28}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#374151">{thread}</text>')

    svg.append(f'<text x="{left + plot_w / 2:.2f}" y="{height - 30}" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="600" fill="#374151">Thread / Connection</text>')

    for color, batch in zip(COLORS, BATCH_COUNTS):
        values = data[batch]
        points = [(x_pos(index), y_pos(value)) for index, value in enumerate(values)]
        svg.append(f'<path d="{line_path(points)}" fill="none" stroke="{color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>')
        for (x, y), value in zip(points, values):
            svg.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="4.5" fill="{color}" stroke="#ffffff" stroke-width="1.5"><title>batch {batch}: {fmt_tooltip(value)} {html.escape(unit)}</title></circle>')

    legend_x = left + plot_w + 38
    legend_y = top + 34
    svg.append(f'<text x="{legend_x}" y="{top}" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#111827">Batch Count</text>')
    for index, (color, batch) in enumerate(zip(COLORS, BATCH_COUNTS)):
        y = legend_y + index * 30
        svg.append(f'<line x1="{legend_x}" y1="{y}" x2="{legend_x + 28}" y2="{y}" stroke="{color}" stroke-width="4" stroke-linecap="round"/>')
        svg.append(f'<circle cx="{legend_x + 14}" cy="{y}" r="4.5" fill="{color}" stroke="#ffffff" stroke-width="1.5"/>')
        svg.append(f'<text x="{legend_x + 42}" y="{y + 5}" font-family="Arial, sans-serif" font-size="13" fill="#374151">{batch}</text>')

    svg.append("</svg>")
    output.write_text("\n".join(svg) + "\n", encoding="utf-8")


def main() -> None:
    markdown = REPORT.read_text(encoding="utf-8")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for heading, filename, unit in CHARTS:
        data = extract_table(markdown, heading)
        render_chart(heading, unit, data, OUT_DIR / filename)

    print(f"Generated {len(CHARTS)} charts in {OUT_DIR}")


if __name__ == "__main__":
    main()
