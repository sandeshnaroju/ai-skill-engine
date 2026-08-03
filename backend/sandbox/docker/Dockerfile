FROM python:3.11-slim

# Pre-install useful packages for file, document, PDF generation & data science
RUN pip install --no-cache-dir \
    fpdf2 \
    reportlab \
    openpyxl \
    python-docx \
    pandas \
    numpy \
    matplotlib \
    pillow \
    pypdf \
    pdfplumber \
    PyPDF2 \
    PyMuPDF \
    weasyprint \
    xhtml2pdf

WORKDIR /workspace
