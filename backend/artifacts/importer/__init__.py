"""
backend/artifacts/importer/
Modular multi-format file importer package:
- dispatcher: Core routing logic (import_file_to_artifact_data)
- type_inference: Extension-based artifact_type and language inference
- documents: Word (.docx), PDF (.pdf), and HTML (.html) parsers
- spreadsheets: Excel (.xlsx, .xls), CSV (.csv), and TSV (.tsv) parsers
- presentations: PowerPoint (.pptx, .ppt) parser
- cad: 2D CAD (.dxf, .dwg) and 3D Models (.step, .stl, .obj, etc.)
- engineering: GIS (.geojson, .kml), Industrial Automation (.l5x, .xer, .m), and Vector Graphics (.svg, .vsdx)
- code: Source code AST and block decomposition
- media: Raster image metadata and preview generation
"""

from .dispatcher import import_file_to_artifact_data
from .type_inference import infer_artifact_type, infer_code_language

__all__ = [
    "import_file_to_artifact_data",
    "infer_artifact_type",
    "infer_code_language",
]
