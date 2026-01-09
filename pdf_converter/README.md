# PDF to JSON Converter for Hymnal

This directory contains the tools to extract songs from the `himnario.pdf` file and convert them into a JSON format compatible with the backend `/import` endpoint.

## Requirements

- Python 3.x
- `libmuPDF` (PyMuPDF)

Install dependencies:

```bash
pip install pymupdf
```

## Usage

1. Place the `himnario.pdf` file in the root of the project.
2. Run the converter:

```bash
python3 pdf_converter/converter.py
```

3. The output will be saved as `cantos.json`.

## Output Format

The generated JSON follows the `Canto` interface:

- `id`: Unique UUID.
- `title`: Song title (converted from the uppercase header in the PDF).
- `type`: Category (defaulted to "Canto").
- `nh`: Song number (extracted from the page labels).
- `content`: Full song lyrics including verse numbers and chorus.
