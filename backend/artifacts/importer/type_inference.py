"""
backend/artifacts/importer/type_inference.py
Helpers for inferring artifact_type and syntax highlighting language from filename extensions.
"""
import os


def infer_artifact_type(filename: str) -> str:
    """Infers artifact_type from filename extension."""
    fn = filename.lower()
    if fn.endswith((".docx", ".doc", ".html", ".htm")):
        return "document"
    elif fn.endswith((".xlsx", ".xls", ".csv", ".tsv")):
        return "spreadsheet"
    elif fn.endswith((".pptx", ".ppt")):
        return "presentation"
    elif fn.endswith(".pdf"):
        return "pdf"
    elif fn.endswith(".svg"):
        return "svg"
    elif fn.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff")):
        return "image"
    elif fn.endswith((".mp3", ".wav", ".ogg", ".m4a", ".aac")):
        return "audio"
    elif fn.endswith((".mp4", ".webm", ".mov", ".mkv")):
        return "video"
    elif fn.endswith((".dwg", ".dxf")):
        return "cad_2d"
    elif fn.endswith((".step", ".stp", ".iges", ".igs", ".ifc", ".stl", ".obj", ".glb", ".gltf")):
        return "cad_3d"
    elif fn.endswith((".geojson", ".kml", ".kmz", ".shp")):
        return "gis"
    elif fn.endswith((".vsdx",)):
        return "diagram"
    elif fn.endswith((".l5x", ".l5k", ".s7p", ".xer", ".m", ".slx")):
        return "engineering_data"
    elif fn.endswith((".py", ".js", ".jsx", ".ts", ".tsx", ".css", ".json", ".sql", ".sh", ".yaml", ".yml", ".xml", ".go", ".rs", ".java", ".cpp", ".c", ".rb", ".php")):
        return "code"
    elif fn.endswith((".md", ".markdown", ".txt")):
        return "document"
    return "document"


def infer_code_language(filename: str) -> str:
    """Infers code syntax highlighting language from filename extension."""
    ext = os.path.splitext(filename)[1].lower()
    mapping = {
        ".py": "python",
        ".js": "javascript",
        ".jsx": "jsx",
        ".ts": "typescript",
        ".tsx": "tsx",
        ".html": "html",
        ".htm": "html",
        ".css": "css",
        ".json": "json",
        ".sql": "sql",
        ".sh": "bash",
        ".bash": "bash",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".xml": "xml",
        ".go": "go",
        ".rs": "rust",
        ".java": "java",
        ".cpp": "cpp",
        ".c": "c",
        ".cs": "csharp",
        ".rb": "ruby",
        ".php": "php",
        ".dxf": "dxf",
        ".geojson": "json",
        ".kml": "xml",
        ".l5x": "xml",
        ".xer": "text",
        ".md": "markdown",
    }
    return mapping.get(ext, "text")
