from __future__ import annotations

from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "foundation-archive-image-brief.pdf"
IMAGES = ROOT / "images"


BG = colors.HexColor("#FAFAF7")
PAPER = colors.HexColor("#FFFFFF")
PAPER_ALT = colors.HexColor("#F4F1EA")
INK = colors.HexColor("#111111")
BODY = colors.HexColor("#2A2A2A")
MUTED = colors.HexColor("#6A6A66")
LINE = colors.HexColor("#D7D1C6")
OK = colors.HexColor("#2E6F4A")
INFO = colors.HexColor("#2F4A7D")


def page_frame(canvas: Canvas, doc: SimpleDocTemplate) -> None:
    canvas.saveState()
    canvas.setFillColor(BG)
    canvas.rect(0, 0, doc.pagesize[0], doc.pagesize[1], fill=1, stroke=0)
    canvas.setStrokeColor(LINE)
    canvas.rect(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, fill=0, stroke=1)
    canvas.restoreState()


def fit_image(path: Path, width: float, max_height: float) -> Image:
    with PILImage.open(path) as img:
        ratio = img.height / img.width
    height = min(width * ratio, max_height)
    if width * ratio > max_height:
        width = max_height / ratio
    image = Image(str(path), width=width, height=height)
    image.hAlign = "LEFT"
    return image


def para(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def build() -> None:
    styles = getSampleStyleSheet()
    body = ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=BODY,
        alignment=TA_LEFT,
        spaceAfter=0,
    )
    small = ParagraphStyle(
        "Small",
        parent=body,
        fontSize=8,
        leading=11,
        textColor=MUTED,
    )
    eyebrow = ParagraphStyle(
        "Eyebrow",
        parent=body,
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=MUTED,
        spaceAfter=8,
    )
    title = ParagraphStyle(
        "Title",
        parent=styles["Title"],
        fontName="Times-Bold",
        fontSize=26,
        leading=28,
        textColor=INK,
        spaceAfter=8,
    )
    heading = ParagraphStyle(
        "Heading",
        parent=styles["Heading2"],
        fontName="Times-Bold",
        fontSize=18,
        leading=22,
        textColor=INK,
        spaceAfter=8,
    )
    subhead = ParagraphStyle(
        "Subhead",
        parent=styles["Heading3"],
        fontName="Times-Bold",
        fontSize=12,
        leading=14,
        textColor=INK,
        spaceAfter=5,
    )
    prompt_style = ParagraphStyle(
        "Prompt",
        parent=body,
        fontName="Helvetica",
        fontSize=9.5,
        leading=13.2,
        textColor=BODY,
        borderColor=LINE,
        borderWidth=1,
        borderPadding=10,
        backColor=colors.HexColor("#FBF8F1"),
    )
    accent = ParagraphStyle(
        "Accent",
        parent=body,
        textColor=OK,
        fontName="Helvetica-Bold",
    )

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=letter,
        leftMargin=0.55 * inch,
        rightMargin=0.55 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.55 * inch,
    )

    story = []

    story.append(para("FOUNDATION ARCHIVE • IMAGE GENERATION BRIEF", eyebrow))
    story.append(para("Logo and OG image direction for a preservation-first art archive.", title))
    story.append(Spacer(1, 0.12 * inch))

    voice_card = [
        para("Project voice", subhead),
        para(
            "The product already points toward an editorial, archival, and cultural-institution tone rather than a loud tech brand. "
            "The core idea is preservation, trust, legibility, and care for artists' work.",
            body,
        ),
        Spacer(1, 0.08 * inch),
        para("Key cues pulled from the product:", small),
        para("• <b>Independent preservation</b>", body),
        para("• <b>A preservation archive for Foundation artists.</b>", body),
        para("• Warm paper background, ink-black typography, muted neutrals, restrained green and blue utility accents", body),
        para("• Editorial serif headline plus mono metadata feel", body),
    ]

    direction_card = [
        para("Best-fit direction", subhead),
        para(
            "<font color='#2E6F4A'><b>Museum-grade restraint</b></font> plus "
            "<font color='#2E6F4A'><b>archival framing</b></font> plus "
            "<font color='#2E6F4A'><b>editorial poster composition</b></font>.",
            body,
        ),
        Spacer(1, 0.08 * inch),
        para("Avoid:", small),
        para("• Crypto or NFT visual clichés", body),
        para("• Neon gradients as the main identity", body),
        para("• Cloud-backup, chain, hexagon, or padlock icons", body),
        para("• Playful mascot energy", body),
    ]

    cards = Table(
        [[voice_card, direction_card]],
        colWidths=[3.6 * inch, 2.7 * inch],
        hAlign="LEFT",
    )
    cards.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PAPER_ALT),
                ("BOX", (0, 0), (-1, -1), 1, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 1, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )
    story.append(cards)
    story.append(Spacer(1, 0.16 * inch))

    swatch_table = Table(
        [[
            para("Warm paper<br/><font size='8' color='#6A6A66'>#FAFAF7</font>", body),
            para("Paper alt<br/><font size='8' color='#6A6A66'>#F4F1EA</font>", body),
            para("Ink black<br/><font size='8' color='#6A6A66'>#111111</font>", body),
            para("Archive green<br/><font size='8' color='#6A6A66'>#2E6F4A</font>", body),
            para("Slate blue<br/><font size='8' color='#6A6A66'>#2F4A7D</font>", body),
        ]],
        colWidths=[1.22 * inch] * 5,
    )
    swatch_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#FAFAF7")),
                ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#F4F1EA")),
                ("BACKGROUND", (2, 0), (2, 0), colors.HexColor("#111111")),
                ("BACKGROUND", (3, 0), (3, 0), colors.HexColor("#2E6F4A")),
                ("BACKGROUND", (4, 0), (4, 0), colors.HexColor("#2F4A7D")),
                ("TEXTCOLOR", (2, 0), (4, 0), PAPER),
                ("BOX", (0, 0), (-1, -1), 1, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 1, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    story.append(swatch_table)
    story.append(Spacer(1, 0.16 * inch))
    story.append(
        para(
            "Built from the current site voice and palette in <b>src/app/page.tsx</b> and <b>src/styles/globals.css</b>.",
            small,
        )
    )

    story.append(PageBreak())
    story.append(para("REFERENCE SET", eyebrow))
    story.append(para("Visual references to guide generation", heading))
    story.append(
        para(
            "These are not for copying literally. They define the tone, structure, and level of restraint that fits Foundation Archive best.",
            small,
        )
    )
    story.append(Spacer(1, 0.12 * inch))

    ref_specs = [
        (
            IMAGES / "intersectional-archives-design-system.png",
            "1. Identity system clarity",
            "Useful for clean mark systems, compact lockups, and disciplined identity application.",
            "https://dribbble.com/shots/26998421-Intersectional-Archives-design-system",
        ),
        (
            IMAGES / "thorvaldsens-museum.jpg",
            "2. Museum logo reduction",
            "Useful for a serious, timeless mark with strong negative space and institutional confidence.",
            "https://dribbble.com/shots/6097905-Thorvaldsens-Museum",
        ),
        (
            IMAGES / "architectural-archive-index.png",
            "3. Archival index composition",
            "Useful for the OG image: editorial hierarchy, archival layout, and structured information density.",
            "https://dribbble.com/shots/26170045-Architectural-Archive-Index-Branding",
        ),
        (
            IMAGES / "editorial-poster-style.png",
            "4. Warm editorial poster tone",
            "Useful for paper texture, quiet luxury, and a balanced headline-to-image relationship.",
            "https://dribbble.com/shots/26126694-Poster-design-in-editorial-style",
        ),
    ]

    ref_rows = []
    row = []
    for idx, (path, label, desc, source) in enumerate(ref_specs, start=1):
        cell = [
            fit_image(path, width=3.0 * inch, max_height=1.9 * inch),
            Spacer(1, 0.06 * inch),
            para(label, subhead),
            para(desc, body),
            Spacer(1, 0.03 * inch),
            para(f"Source: {source}", small),
        ]
        row.append(cell)
        if idx % 2 == 0:
            ref_rows.append(row)
            row = []
    if row:
        ref_rows.append(row)

    refs_table = Table(ref_rows, colWidths=[3.2 * inch, 3.2 * inch], rowHeights=None)
    refs_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PAPER),
                ("BOX", (0, 0), (-1, -1), 1, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 1, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    story.append(refs_table)

    story.append(PageBreak())
    story.append(para("GENERATION PROMPTS", eyebrow))
    story.append(para("Copy-paste prompts for ChatGPT image generation", heading))
    story.append(
        para(
            "<b>Editorial</b> • <b>Preservation</b> • <b>Museum-grade</b> • <b>Warm paper</b> • <b>Serif + mono</b>",
            small,
        )
    )
    story.append(Spacer(1, 0.12 * inch))

    alt_ref = KeepTogether(
        [
            para("Optional alternate energy", subhead),
            para(
                "This one is more expressive and campaign-like. Good as a secondary reference for motion or a temporary launch visual, but not as strong as the core brand direction.",
                small,
            ),
            Spacer(1, 0.08 * inch),
            fit_image(IMAGES / "internet-archive-25.png", width=6.2 * inch, max_height=2.2 * inch),
            Spacer(1, 0.06 * inch),
            para("5. Bright archive campaign language", subhead),
            para("Useful only in moderation for liveliness and historical-tech energy.", body),
            para("Source: https://dribbble.com/shots/16106759-Internet-Archive-turns-25-campaign-branding-and-art-direction", small),
        ]
    )
    story.append(alt_ref)
    story.append(Spacer(1, 0.18 * inch))

    story.append(para("Logo prompt", subhead))
    story.append(
        para(
            "Design a logo for “Foundation Archive,” an independent preservation archive for Foundation artists. "
            "The concept should feel like a cultural institution and a living digital system at once: four archival corner marks form an open square or frame around a small preserved artwork tile or spark, subtly suggesting protection, indexing, and retrieval. "
            "Pair the mark with a refined editorial serif wordmark and restrained mono metadata accents. Use a warm paper, ink-black, stone, and muted green or slate palette. "
            "Style: timeless, precise, quiet, museum-grade, high negative space, subtle print grain. Avoid folders, clouds, padlocks, chains, hexagons, neon gradients, mascots, and generic NFT or web3 clichés. "
            "Show a primary mark, a horizontal lockup, a small favicon version, and monochrome versions.",
            prompt_style,
        )
    )
    story.append(Spacer(1, 0.14 * inch))

    story.append(para("OG image prompt", subhead))
    story.append(
        para(
            "Create a 1200x630 open graph image for “Foundation Archive.” Use a premium editorial poster composition on warm off-white paper with subtle grain. "
            "Large serif headline: “A preservation archive for Foundation artists.” Surround the headline with a restrained grid of three to four abstract art tiles or framed placeholders, each held by archival corner marks, with tiny mono caption lines suggesting artist, title, and CID metadata. "
            "Add thin rules, registration marks, muted green or slate status dots, and a faint sense of networked preservation without looking sci-fi. Mood: calm, trustworthy, cultural, contemporary, archival. "
            "Keep the headline highly legible at link-preview size with generous margins. Avoid busy collage chaos, tiny unreadable labels, crypto clichés, coins, neon, and literal cloud-backup graphics.",
            prompt_style,
        )
    )
    story.append(Spacer(1, 0.16 * inch))
    story.append(
        para(
            "One-line creative direction: <font color='#2E6F4A'><b>Foundation Archive should look like an art institution that quietly knows how to keep culture alive online.</b></font>",
            body,
        )
    )

    doc.build(story, onFirstPage=page_frame, onLaterPages=page_frame)


if __name__ == "__main__":
    build()
