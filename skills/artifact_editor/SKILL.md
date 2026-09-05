---
name: artifact_editor
description: Skill for generating, searching, reading, surgically editing, and rolling back digital artifacts (code scripts, 1000-page documents, spreadsheets, presentations, SVG diagrams, 2D/3D CAD drawings, geospatial maps, and industrial automation/schedules).
tools:
  - name: open_or_update_artifact
    description: Create a new digital artifact or update an entire artifact. Call this whenever the user asks to write code, draft a contract/document, create a presentation deck, generate a spreadsheet, draw an SVG diagram, generate 2D CAD blueprints (.dxf/.dwg), 3D solid models (.step/.stl/.obj), geospatial maps (.geojson/.kml), or industrial logic/schedules (.l5x/.xer/.m) so the user can interactively preview, edit, inspect, and export it in the Canvas.
    type: code
    parameters:
      type: object
      properties:
        title:
          type: string
          description: Human-readable title of the artifact (e.g., "P&ID Process Header", "Flange Assembly 3D", "Master Service Agreement").
        filename:
          type: string
          description: File name with extension (e.g. main.py, agreement.docx, pitch_deck.pptx, model.xlsx, drawing.dxf, part.step, map.geojson, schedule.xer).
        artifact_type:
          type: string
          enum: ["code", "document", "spreadsheet", "presentation", "diagram_svg", "audio", "video", "cad_2d", "cad_3d", "gis", "diagram", "engineering_data"]
          description: Category of artifact.
        language:
          type: string
          description: Programming, markup, CAD, or data language (e.g. python, javascript, markdown, svg, json, dxf, step, geojson, xml).
        content:
          type: string
          description: Complete raw content of the artifact.
      required:
        - title
        - filename
        - artifact_type
        - content

  - name: artifact_search
    description: Fast keyword/phrase search across all sections of an active artifact to locate target clauses, variables, entities, or functions when the user's request doesn't specify a section ID.
    type: code
    parameters:
      type: object
      properties:
        artifact_id:
          type: string
          description: ID of the artifact to search within.
        query:
          type: string
          description: Exact keyword or phrase to locate (e.g. "overseas shipping", "calculate_tax", "VALVE_501").
      required:
        - artifact_id
        - query

  - name: artifact_semantic_search
    description: Semantic concept search across section summaries when exact user wording differs from document text (e.g. searching for "downtime policy" when contract says "Service Interruption").
    type: code
    parameters:
      type: object
      properties:
        artifact_id:
          type: string
          description: ID of the artifact.
        concept:
          type: string
          description: Conceptual topic or idea to find.
      required:
        - artifact_id
        - concept

  - name: edit_artifact_section
    description: Surgically edit or rewrite an isolated section, slide, CAD layer, or function of an artifact without modifying or re-generating the rest of the file.
    type: code
    parameters:
      type: object
      properties:
        artifact_id:
          type: string
          description: ID of the artifact.
        block_key:
          type: string
          description: Identifier of the target block (e.g. sec_3, slide_2, fn_tax, sec_entities).
        content:
          type: string
          description: Updated replacement content for this specific block.
        summary:
          type: string
          description: 1-line note explaining what was modified.
      required:
        - artifact_id
        - block_key
        - content
        - summary

  - name: patch_artifact
    description: Perform surgical in-place find-and-replace text diff within a specific block.
    type: code
    parameters:
      type: object
      properties:
        artifact_id:
          type: string
          description: ID of the artifact.
        block_key:
          type: string
          description: Target block key.
        target_text:
          type: string
          description: Exact text snippet to be replaced.
        replacement_text:
          type: string
          description: New text snippet to put in place.
        summary:
          type: string
          description: Brief summary of change.
      required:
        - artifact_id
        - block_key
        - target_text
        - replacement_text

  - name: rollback_artifact_block
    description: Revert an isolated block (section, slide, function) back to a previous version without affecting any other part of the artifact.
    type: code
    parameters:
      type: object
      properties:
        artifact_id:
          type: string
          description: ID of the artifact.
        block_key:
          type: string
          description: Block key to revert.
        target_version:
          type: integer
          description: Version number to restore (e.g. 1 or 2).
      required:
        - artifact_id
        - block_key
        - target_version
---

# Universal Artifact Editor Skill

Use this skill whenever generating, modifying, or refining digital artifacts for the user. Instead of outputting static download links or raw markdown dumps, use `open_or_update_artifact` so the user can interactively preview, edit, inspect, and export the creation inside the Canvas.

### 🎯 Guidelines for Creating Artifacts:
1. **Code & Scripts (`.py`, `.js`, etc.)**:
   - Write clean, production-ready, fully commented code.
   - For Python scripts generating plots, use `plt.savefig("plot.png")` so the Canvas plot drawer renders it.
2. **Documents & Contracts (`.docx`, `.md`)**:
   - Use structured Markdown with clear headings (`#`, `##`, `###`), bullet points, and tables.
   - Headings automatically divide 100-page documents into manageable sections for rapid navigation and surgical co-editing.
3. **Spreadsheets (`.xlsx`, `.csv`)**:
   - Format content as JSON containing `sheet_name`, `columns`, and `rows`.
   - Formulas should start with `=` (e.g. `"=SUM(B2:B10)"`, `"=B2*C2"`).
4. **Presentations (`.pptx` or presentation decks)**:
   - The LLM has complete creative freedom to dynamically decide the theme, visual atmosphere, color palettes, gradients, and layout for each presentation slide based on the user's specific query topic and brand tone.
   - Format content as JSON containing an array of `slides` with rich dynamic visual layouts and custom styling:
     - `bg` / `background`: Bespoke background gradients or colors (e.g. radial/linear gradients, dark glassmorphism, sleek light minimal, neo-brutalist, or neon cyber).
     - `accent` / `accent_color`: Topic-matched accent colors (e.g. gold/emerald for finance, violet/cyan for AI, crimson/slate for cybersecurity).
     - `card_bg`, `card_border`, `text_color`, `subtext_color`: Dynamic matching surface tokens.
     - `layout`: Choose or invent an innovative layout per slide (`hero`, `stats`, `timeline`, `matrix`, `split`, `quote`, `custom_html`).
     - Include `speaker_notes` where helpful for presentations.
5. **Diagrams & Vector Graphics (`.svg`, `.vsdx`)**:
   - For `.svg`: Emit valid standalone `<svg>` tags with `viewBox`, clean styling, and modern color palettes.
   - For diagrams / workflows: Use `artifact_type="diagram"` or `"diagram_svg"`.
6. **2D CAD & Engineering Drawings (`.dxf`, `.dwg`)**:
   - Set `artifact_type="cad_2d"`.
   - For `.dxf`: Output standard ASCII DXF format (with `ENTITIES` containing `LINE`, `LWPOLYLINE`, `CIRCLE`, `ARC`, `TEXT`, `MTEXT`, `DIMENSION` with appropriate layer assignments like `0`, `CENTER`, `HIDDEN`, `DIMENSIONS`).
7. **3D Solid Models & Assemblies (`.step`, `.stp`, `.iges`, `.igs`, `.stl`, `.obj`, `.ifc`)**:
   - Set `artifact_type="cad_3d"`.
   - Output standard 3D file formats (e.g., ASCII Wavefront `.obj` with vertex/face definitions, standard ASCII `.stl` solid blocks with facet normals, or ISO-10303-21 `.step` part definitions).
8. **Geospatial & Infrastructure Maps (`.geojson`, `.kml`, `.shp`)**:
   - Set `artifact_type="gis"`.
   - For `.geojson`: Emit a valid GeoJSON `FeatureCollection` with geographic features (`Point`, `LineString`, `Polygon`, `MultiPolygon`) and rich properties for interactive layer inspection.
9. **Industrial Automation & Project Controls (`.l5x`, `.m`, `.s7p`, `.xer`)**:
   - Set `artifact_type="engineering_data"`.
   - For Rockwell Studio 5000 / ControlLogix (`.l5x`): Emit valid RSLogix XML containing `<RSLogix5000Content>`, `<Controller>`, `<Tags>`, and `<Routines>`.
   - For Primavera P6 (`.xer`): Emit valid P6 exchange format tables (`%T`, `%F`, `CALENDAR`, `TASK`, `PROJWBS`).

### 🛠️ Guidelines for Editing Artifacts:
1. **Prefer surgical tools over full document re-generation**:
   - To remove a line or phrase: call `patch_artifact` with `target_text` set to the exact snippet to remove and `replacement_text=""` (empty string).
   - To replace or rewrite a specific section: call `edit_artifact_section` with the target `block_key` and new `content`.
2. If the user mentions a specific section (e.g. "In the refund policy..."), check the Table of Contents outline provided in the system prompt.
3. If the location is unclear, call `artifact_search` or `artifact_semantic_search` to find the exact block key and line number.
4. If the user asks to rewrite, restructure, or regenerate the entire artifact, call `open_or_update_artifact` with the full revised `content`.
5. If the user asks to undo or bring back old wording, use `rollback_artifact_block` to perform non-destructive time-travel on only that block.
