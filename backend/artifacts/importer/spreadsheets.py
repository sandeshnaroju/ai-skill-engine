"""
backend/artifacts/importer/spreadsheets.py
Parses Excel (.xlsx, .xls), CSV (.csv), and TSV (.tsv) spreadsheet files
into structured JSON sheets with columns and rows.
"""
import json
from typing import Tuple, List, Dict, Any


def _parse_spreadsheet(filepath: str, ext: str) -> Tuple[str, List[Dict[str, Any]]]:
    """Parses Excel or CSV into Canvas spreadsheet schema JSON."""
    sheets = []
    blocks = []

    try:
        import pandas as pd
        if ext in (".xlsx", ".xls"):
            xls = pd.ExcelFile(filepath)
            for idx, sheet_name in enumerate(xls.sheet_names):
                df = pd.read_excel(xls, sheet_name=sheet_name)
                df = df.fillna("")
                columns = [str(c) for c in df.columns]
                rows = df.values.tolist()
                sheet_obj = {
                    "sheet_name": sheet_name,
                    "columns": columns,
                    "rows": rows
                }
                sheets.append(sheet_obj)
                blocks.append({
                    "block_key": f"sheet_{idx + 1}",
                    "title": sheet_name,
                    "content": json.dumps(sheet_obj, indent=2),
                    "order_index": idx
                })
        else:
            sep = "\t" if ext == ".tsv" else ","
            df = pd.read_csv(filepath, sep=sep)
            df = df.fillna("")
            sheet_name = "Sheet 1"
            columns = [str(c) for c in df.columns]
            rows = df.values.tolist()
            sheet_obj = {
                "sheet_name": sheet_name,
                "columns": columns,
                "rows": rows
            }
            sheets.append(sheet_obj)
            blocks.append({
                "block_key": "sheet_1",
                "title": sheet_name,
                "content": json.dumps(sheet_obj, indent=2),
                "order_index": 0
            })
    except Exception as e:
        sheets = [{"sheet_name": "Sheet 1", "columns": ["Error"], "rows": [[str(e)]]}]

    full_content = json.dumps({"sheets": sheets}, indent=2)
    return full_content, blocks
