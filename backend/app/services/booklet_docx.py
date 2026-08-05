"""
Energy Accounting Booklet — Word (.docx) Renderer
=================================================

Turns the `booklet_builder.build_payload()` dictionary into the published Word
document: cover page, table of contents, the seven numbered sections with their
tables, and a reconciliation appendix.

Design notes
------------
* Pure `python-docx`; no LibreOffice / Word automation, so it runs inside the
  API container and streams straight to the browser.
* Returns `bytes` — the caller decides whether to stream, cache or persist.
* Optional cover / diagram images are dropped in from `assets/booklet/` when
  present. They are never required: a missing asset degrades to a caption box so
  the document still generates on a clean checkout.
* The Table of Contents is emitted as a real Word TOC field. Word/LibreOffice
  populates it on open (or via F9); page numbers cannot be computed here because
  python-docx does not lay out pages.
"""
from __future__ import annotations

import io
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

# Brand palette — matches the dashboard's dark-navy / gold theme.
NAVY = RGBColor(0x0F, 0x1F, 0x3D)
GOLD = RGBColor(0xC9, 0x9A, 0x2E)
GREY = RGBColor(0x55, 0x5F, 0x6D)
RED = RGBColor(0xB0, 0x2A, 0x2A)

HEADER_FILL = "0F1F3D"
SUBTOTAL_FILL = "EDF1F7"
TOTAL_FILL = "D9E2EF"

ASSET_DIR = os.getenv(
    "BOOKLET_ASSET_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "assets", "booklet"),
)


# ------------------------------------------------------------ low-level bits

def _shade(cell, hex_fill: str) -> None:
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")          # never "solid" — renders black
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tcPr.append(shd)


def _cell_text(cell, text: str, *, bold: bool = False, size: int = 9,
               color: Optional[RGBColor] = None, align: str = "left") -> None:
    cell.text = ""
    p = cell.paragraphs[0]
    p.alignment = {
        "left": WD_ALIGN_PARAGRAPH.LEFT,
        "center": WD_ALIGN_PARAGRAPH.CENTER,
        "right": WD_ALIGN_PARAGRAPH.RIGHT,
    }[align]
    run = p.add_run(str(text))
    run.bold = bold
    run.font.size = Pt(size)
    if color is not None:
        run.font.color.rgb = color
    p.paragraph_format.space_before = Pt(1)
    p.paragraph_format.space_after = Pt(1)


def _table(doc: Document, headers: List[str], widths: List[float]) -> Any:
    """Create a table with a shaded header row. Widths are inches and must be set
    on BOTH the table columns and every cell (python-docx quirk)."""
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    for i, w in enumerate(widths):
        t.columns[i].width = Inches(w)
    for i, h in enumerate(headers):
        cell = t.rows[0].cells[i]
        cell.width = Inches(widths[i])
        _shade(cell, HEADER_FILL)
        _cell_text(cell, h, bold=True, size=9, color=RGBColor(0xFF, 0xFF, 0xFF), align="center")
    return t


def _row(t, values: List[Any], widths: List[float], *, bold: bool = False,
         fill: Optional[str] = None, aligns: Optional[List[str]] = None) -> None:
    cells = t.add_row().cells
    for i, v in enumerate(values):
        cells[i].width = Inches(widths[i])
        if fill:
            _shade(cells[i], fill)
        _cell_text(cells[i], v, bold=bold, size=8.5,
                   align=(aligns[i] if aligns else "left"))


def _heading(doc: Document, number: str, text: str) -> None:
    """`number` may be empty (e.g. the Contents page), in which case the
    numbering prefix is dropped entirely rather than rendering a stray '. '."""
    h = doc.add_heading(level=1)
    run = h.add_run(f"{number}. {text}" if number else text)
    run.font.size = Pt(15)
    run.font.color.rgb = NAVY
    run.bold = True


def _sub(doc: Document, text: str) -> None:
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(11)
    run.font.color.rgb = NAVY
    p.paragraph_format.space_before = Pt(10)


def _para(doc: Document, text: str, *, italic: bool = False, bold: bool = False,
          size: int = 10.5, color: Optional[RGBColor] = None) -> None:
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.italic = italic
    run.bold = bold
    run.font.size = Pt(size)
    if color is not None:
        run.font.color.rgb = color
    p.paragraph_format.space_after = Pt(4)


def _formula(doc: Document, text: str) -> None:
    """Bold-italic centred formula line, as in the printed booklet."""
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(text)
    run.bold = True
    run.italic = True
    run.font.size = Pt(10.5)
    run.font.color.rgb = NAVY
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(4)


def _toc_field(doc: Document) -> None:
    """Insert a live Word TOC field (populated on open / F9)."""
    p = doc.add_paragraph()
    run = p.add_run()
    fld_begin = OxmlElement("w:fldChar"); fld_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText"); instr.set(qn("xml:space"), "preserve")
    instr.text = r'TOC \o "1-2" \h \z \u'
    fld_sep = OxmlElement("w:fldChar"); fld_sep.set(qn("w:fldCharType"), "separate")
    placeholder = OxmlElement("w:t")
    placeholder.text = "Right-click and choose “Update Field” to build the table of contents."
    fld_end = OxmlElement("w:fldChar"); fld_end.set(qn("w:fldCharType"), "end")
    for el in (fld_begin, instr, fld_sep, placeholder, fld_end):
        run._r.append(el)


def _page_break(doc: Document) -> None:
    doc.add_page_break()


def _asset(name: str) -> Optional[str]:
    path = os.path.join(ASSET_DIR, name)
    return path if os.path.exists(path) else None


def _image_or_caption(doc: Document, filename: str, caption: str, width_in: float = 5.5) -> None:
    path = _asset(filename)
    if path:
        doc.add_picture(path, width=Inches(width_in))
        doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(caption)
        r.italic = True
        r.font.size = Pt(9)
        r.font.color.rgb = GREY
    else:
        _para(doc, f"[ {caption} — drop “{filename}” into {ASSET_DIR} to embed ]",
              italic=True, size=9, color=GREY)


def _footer(doc: Document, text: str) -> None:
    footer = doc.sections[0].footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(text)
    run.font.size = Pt(8)
    run.font.color.rgb = GREY


# ------------------------------------------------------------------ sections

def _cover(doc: Document, meta: Dict[str, Any]) -> None:
    for _ in range(3):
        doc.add_paragraph()
    for text, size, color, bold in (
        (meta["entity"], 16, GREY, False),
        (meta["title"], 30, NAVY, True),
        (meta["period_label"], 22, GOLD, True),
        (f"{meta['discom']}  ·  {meta['fy_label']}", 13, GREY, False),
    ):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(text)
        run.font.size = Pt(size)
        run.bold = bold
        run.font.color.rgb = color

    doc.add_paragraph()
    _image_or_caption(doc, "cover.png", "Cover artwork", width_in=5.2)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(f"Generated {datetime.now().strftime('%d %B %Y, %H:%M')} · computed live from source sheets")
    run.font.size = Pt(8.5)
    run.font.color.rgb = GREY
    _page_break(doc)


def _section_1(doc: Document, s: Dict[str, Any], n: str) -> None:
    _heading(doc, n, s["heading"])
    _para(doc, s["intro"])

    _sub(doc, f"{n}.1  Power Flow Summary — Percentage Sharing of Generators")
    w = [1.6, 1.8, 1.5, 1.3]
    t = _table(doc, ["Source Sector", "Type", "Volume (MU)", "Share"], w)
    for r in s["power_flow"]["table"]:
        _row(t, [r["sector"], r["type"], f"{r['volume_mu']:,.2f}", f"{r['share_pct']:.1f}%"],
             w, aligns=["left", "left", "right", "right"])
    _row(t, ["Gross Input", "(incl. DISCOM-connected RE)",
             f"{s['power_flow']['gross_input_mu']:,.2f}", "—"],
         w, bold=True, fill=TOTAL_FILL, aligns=["left", "left", "right", "right"])

    _sub(doc, f"{n}.2  Central and State Transmission Loss")
    w2 = [2.4, 1.8, 1.8]
    t2 = _table(doc, ["Loss Component", "Energy (MU)", "Loss %"], w2)
    cs = s["ctl_stl"]
    for label, mu, pct, bold in (
        ("Central Transmission Loss (CTL)", cs["ctl_mu"], cs["ctl_pct"], False),
        ("State Transmission Loss (STL)", cs["stl_mu"], cs["stl_pct"], False),
        ("Total System Loss", cs["total_loss_mu"], cs["total_loss_pct"], True),
    ):
        _row(t2, [label, f"{mu:,.2f}", f"{pct:,.2f}%"], w2,
             bold=bold, fill=TOTAL_FILL if bold else None,
             aligns=["left", "right", "right"])

    _sub(doc, f"{n}.3  DISCOM Input Energy")
    _para(doc, "NBPDCL and SBPDCL input energy on the basis of data received from the "
               "SAMAST portal of BSPTCL:-")
    w3 = [2.4, 1.8, 1.8]
    t3 = _table(doc, ["DISCOM", "Input Energy (MU)", "Ratio"], w3)
    for r in s["discom_input"]:
        is_tot = r.get("is_total", False)
        _row(t3, [r["discom"], f"{r['input_energy_mu']:,.2f}", f"{r['ratio_pct']:.1f}%"],
             w3, bold=is_tot, fill=TOTAL_FILL if is_tot else None,
             aligns=["left", "right", "right"])

    _image_or_caption(doc, "power_flow.png", "Power flow schematic")
    _page_break(doc)


def _section_2(doc: Document, s: Dict[str, Any], n: str) -> None:
    _heading(doc, n, s["heading"])
    w = [0.45, 1.0, 1.15, 0.85, 0.9, 1.75, 0.9]
    t = _table(doc, ["Sl. No.", "Voltage", "PPA", "Type", "Plant Nature", "Plant Name", "Million Units"], w)
    for r in s["rows"]:
        _row(t, [r["sl"], r["voltage"], r["ppa"], r["type"], r["plant_nature"],
                 r["plant_name"], f"{r['mu']:,.2f}"],
             w, aligns=["center", "left", "left", "left", "left", "left", "right"])
    _row(t, ["", "", "", "", "", "Grand Total", f"{s['grand_total_mu']:,.2f}"],
         w, bold=True, fill=TOTAL_FILL,
         aligns=["center", "left", "left", "left", "left", "right", "right"])
    _page_break(doc)


def _section_3(doc: Document, s: Dict[str, Any], n: str) -> None:
    _heading(doc, n, s["heading"])

    _sub(doc, f"{n}.1  Total Gross Power Input Framework")
    _para(doc, "The total aggregate quantum of energy injected directly into the state power "
               "pooling boundary from all generating stations, central allocation and within-state "
               "generation is as follows:")
    _formula(doc, s["gross_input_formula"])
    _formula(doc, s["gross_input_worked"])

    _sub(doc, f"{n}.2  Commercial Optimization")
    _para(doc, "During low-demand periods, surplus power is managed by the Power Management Cell "
               "(PMC). These volumes are routed to the market via the Indian Energy Exchange (IEX) "
               "and short-term multilateral bilateral trading agreements. This commercial outflow is "
               "systematically subtracted from the gross input energy to establish the net purchase "
               "for internal consumption:")
    _formula(doc, s["net_purchase_formula"])
    _formula(doc, s["net_purchase_worked"])
    _para(doc, "To calculate the central loss percentage (CTL %), the variance between the total "
               "power dispatched from the central sector and the actual energy received at the state "
               "boundary is adjusted to exclude central renewable injections that bypass the specific "
               "thermal generating stations:")
    _formula(doc, s["ctl_formula"])
    _formula(doc, s["ctl_pct_formula"])

    _sub(doc, f"{n}.3  Central Transmission Loss — Computed")
    _formula(doc, s["ctl_worked"])
    _formula(doc, s["ctl_pct_worked"])

    _sub(doc, f"{n}.4  State Transmission Loss (STL)")
    _para(doc, "Once power crosses the state boundary it enters the high-voltage transmission grid "
               "operated by Bihar State Power Transmission Company Limited (BSPTCL). State "
               "Transmission Loss calculates the variance between the total energy injected into the "
               "state network and the net energy drawn at the distribution DISCOM peripheries.")
    _formula(doc, s["stl_injected_formula"])
    _formula(doc, s["stl_drawal_formula"])
    _formula(doc, s["stl_formula"])
    _para(doc, s["period_note"])
    for line in s["stl_worked"]:
        _para(doc, line)
    _formula(doc, s["stl_pct_worked"])
    _page_break(doc)


def _section_4(doc: Document, s: Dict[str, Any], n: str) -> None:
    _heading(doc, n, s["heading"])
    _para(doc, s["intro"])
    w = [4.2, 1.6]
    t = _table(doc, ["Plant Name", "Million Units"], w)
    for r in s["rows"]:
        _row(t, [r["plant_name"], f"{r['mu']:,.2f}"], w, aligns=["left", "right"])
    _row(t, ["Grand Total", f"{s['grand_total_mu']:,.2f}"], w,
         bold=True, fill=TOTAL_FILL, aligns=["right", "right"])
    _page_break(doc)


def _section_5(doc: Document, s: Dict[str, Any], n: str) -> None:
    _heading(doc, n, s["heading"])
    _para(doc, f"Circle with highest energy consumption — {s['highest']}", bold=True)
    _para(doc, f"Circle with lowest energy consumption — {s['lowest']}", bold=True)
    w = [2.1, 1.9, 2.0]
    t = _table(doc, ["Circle", "Net Energy (MU)", "Percentage Sharing of Total Input Energy"], w)
    for r in s["rows"]:
        _row(t, [r["circle"], f"{r['mu']:,.2f}", f"{r['share_pct']:.0f}%"],
             w, aligns=["left", "right", "right"])
    _row(t, ["Grand Total", f"{s['grand_total_mu']:,.2f}", "100%"], w,
         bold=True, fill=TOTAL_FILL, aligns=["left", "right", "right"])
    _page_break(doc)


def _section_8(doc: Document, s: Dict[str, Any], n: str) -> None:
    _heading(doc, n, s["heading"])
    w = [2.0, 2.2, 1.8]
    t = _table(doc, ["Circle", "Division", "Million Units"], w)
    for r in s["rows"]:
        _row(t, [r["circle"], r["division"], f"{r['mu']:,.2f}"], w,
             aligns=["left", "left", "right"])
    _row(t, ["Grand Total", "", f"{s['grand_total_mu']:,.2f}"], w,
         bold=True, fill=TOTAL_FILL, aligns=["left", "left", "right"])
    _page_break(doc)


def _section_9(doc: Document, s: Dict[str, Any], n: str) -> None:
    """Landscape section — seven columns do not fit portrait."""
    sec = doc.add_section()
    sec.orientation = WD_ORIENT.LANDSCAPE
    sec.page_width, sec.page_height = sec.page_height, sec.page_width
    sec.left_margin = sec.right_margin = Inches(0.5)

    _heading(doc, n, s["heading"])
    _para(doc, s["intro"])

    if s.get("skipped"):
        _para(doc, "Feeder-level detail was omitted from this render (summary mode).",
              italic=True, color=GREY)
        return

    if not s.get("meter_column_available"):
        _para(doc, "Note: the input_energy sheet does not currently expose a meter serial / CA "
                   "number column, so that column is blank. Add one of: meter_no, meter_sno, ca_no.",
              italic=True, size=8.5, color=RED)
    if not s.get("sharing_column_available"):
        _para(doc, "Note: no sharing-percentage column found; all feeders default to 100%. "
                   "Add one of: sharing_pct, sharing_percent, sharing_ratio.",
              italic=True, size=8.5, color=RED)

    w = [1.2, 1.4, 1.9, 2.1, 1.6, 0.8, 1.0]
    t = _table(doc, ["Circle", "Division", "Substation", "Feeder / Metering Point",
                     "Meter S.No. / CA No.", "Sharing %", "Net Energy (MU)"], w)
    aligns = ["left", "left", "left", "left", "left", "center", "right"]
    for r in s["rows"]:
        is_sub = r.get("is_subtotal", False)
        _row(t, [r["circle"], r["division"], r["substation"], r["feeder"],
                 r["meter"], r["sharing"], f"{r['mu']:,.2f}"],
             w, bold=is_sub, fill=SUBTOTAL_FILL if is_sub else None, aligns=aligns)
    _row(t, ["Grand Total", "", "", "", "", "", f"{s['grand_total_mu']:,.2f}"],
         w, bold=True, fill=TOTAL_FILL, aligns=aligns)


def _appendix(doc: Document, checks: List[Dict[str, Any]]) -> None:
    _page_break(doc)
    _heading(doc, "A", "Reconciliation & Data-Integrity Checks")
    _para(doc, "Every figure in this booklet is recomputed from the source sheets at generation "
               "time. The checks below confirm that the independently-derived sections agree with "
               "one another. Tolerance is 0.01%.")
    w = [3.3, 1.3, 1.3, 1.1, 0.9]
    t = _table(doc, ["Check", "Computed", "Expected", "Difference", "Status"], w)
    for c in checks:
        _row(t, [c["check"], f"{c['computed']:,.2f}", f"{c['expected']:,.2f}",
                 f"{c['difference']:,.4f}", c["status"]],
             w, bold=(c["status"] != "PASS"),
             aligns=["left", "right", "right", "right", "center"])
    failed = [c for c in checks if c["status"] != "PASS"]
    if failed:
        _para(doc, "One or more checks require review. Investigate the flagged sheets before "
                   "circulating this booklet.", bold=True, color=RED)


# --------------------------------------------------------------------- build

def render(payload: Dict[str, Any]) -> bytes:
    """Render a booklet payload to .docx bytes."""
    doc = Document()

    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(10.5)

    sec = doc.sections[0]
    sec.left_margin = sec.right_margin = Inches(0.7)
    sec.top_margin = sec.bottom_margin = Inches(0.7)

    meta = payload["meta"]
    n = meta["section_numbers"]

    _footer(doc, f"{meta['entity']} · {meta['title']} · {meta['period_label']} · {meta['discom']}")

    _cover(doc, meta)

    _heading(doc, "", "Contents")
    _toc_field(doc)
    _page_break(doc)

    _section_1(doc, payload["section_1"], n["exec"])
    _section_2(doc, payload["section_2"], n["purchase"])
    _section_3(doc, payload["section_3"], n["loss"])
    _section_4(doc, payload["section_4"], n["prosumer"])
    _section_5(doc, payload["section_5"], n["circle"])
    _section_8(doc, payload["section_8"], n["division"])
    _section_9(doc, payload["section_9"], n["detail"])
    _appendix(doc, payload["reconciliation"])

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def filename(payload: Dict[str, Any]) -> str:
    meta = payload["meta"]
    period = (meta.get("period") or "all").replace("-", "_")
    return f"Energy_Accounting_Booklet_{meta['discom']}_{period}.docx"
