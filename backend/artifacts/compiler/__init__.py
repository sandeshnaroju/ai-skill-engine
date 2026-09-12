"""
backend/artifacts/compiler/
Modular multi-format artifact compiler package:
- docx: Microsoft Word (.docx) compilation
- xlsx: Microsoft Excel (.xlsx) compilation
- pptx: Microsoft PowerPoint (.pptx) compilation
- pdf:  ReportLab PDF (.pdf) compilation
- exporter: Dispatcher & MIME type mapping
- utils: Shared parsing, tokenization, image fetching, and sanitization
"""

from .docx import compile_to_docx
from .xlsx import compile_to_xlsx
from .pptx import compile_to_pptx
from .pdf import compile_to_pdf
from .exporter import export_artifact

__all__ = [
    "export_artifact",
    "compile_to_docx",
    "compile_to_xlsx",
    "compile_to_pptx",
    "compile_to_pdf",
]
