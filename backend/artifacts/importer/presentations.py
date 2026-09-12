"""
backend/artifacts/importer/presentations.py
Parses PowerPoint presentation decks (.pptx, .ppt) into Canvas presentation slides JSON.
"""
import json
from typing import Tuple, List, Dict, Any


def _parse_pptx(filepath: str, title: str) -> Tuple[str, List[Dict[str, Any]]]:
    """Parses PowerPoint deck into Canvas presentation slides JSON."""
    slides = []
    blocks = []

    try:
        from pptx import Presentation
        prs = Presentation(filepath)

        for idx, slide in enumerate(prs.slides):
            slide_title = f"Slide {idx + 1}"
            bullets = []
            notes = ""

            for shape in slide.shapes:
                if not shape.has_text_frame:
                    continue
                tf = shape.text_frame
                text = tf.text.strip()
                if not text:
                    continue

                if shape == slide.shapes.title or (shape.name and "title" in shape.name.lower()):
                    slide_title = text
                else:
                    for p in tf.paragraphs:
                        p_text = p.text.strip()
                        if p_text:
                            bullets.append(p_text)

            if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
                notes = slide.notes_slide.notes_text_frame.text.strip()

            slide_obj = {
                "title": slide_title,
                "bullets": bullets,
                "notes": notes,
                "layout": "split" if len(bullets) <= 3 else "grid"
            }
            slides.append(slide_obj)
            blocks.append({
                "block_key": f"slide_{idx + 1}",
                "title": slide_title,
                "content": json.dumps(slide_obj, indent=2),
                "order_index": idx
            })

    except Exception as e:
        slides = [{
            "title": title,
            "bullets": [f"Error reading presentation: {str(e)}"],
            "notes": ""
        }]

    full_content = json.dumps({"slides": slides}, indent=2)
    return full_content, blocks
