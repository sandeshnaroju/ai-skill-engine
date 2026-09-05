---
name: artifact_editor
description: Skill for generating, searching, reading, surgically editing, and rolling back digital artifacts (code scripts, 1000-page documents, spreadsheets, presentations, SVG diagrams, and media).
tools:
  - name: open_or_update_artifact
    description: Create a new digital artifact or update an entire artifact. Call this whenever the user asks to write code, draft a contract/document, create a presentation deck, generate a spreadsheet, or draw an SVG diagram so the user can interactively preview and edit it in the Canvas.
    type: code
    parameters:
      type: object
      properties:
        title:
          type: string
          description: Human-readable title of the artifact (e.g., "Compound Interest Calculator" or "Master Service Agreement").
        filename:
          type: string
          description: File name with extension (e.g. main.py, agreement.docx, pitch_deck.pptx, model.xlsx, diagram.svg).
        artifact_type:
          type: string
          enum: ["code", "document", "spreadsheet", "presentation", "diagram_svg", "audio", "video"]
          description: Category of artifact.
        language:
          type: string
          description: Programming or markup language (e.g. python, javascript, markdown, svg, json).
        content:
          type: string
          description: Complete raw content of the artifact.
      required:
        - title
        - filename
        - artifact_type
        - content

  - name: artifact_search
    description: Fast keyword/phrase search across all sections of an active artifact to locate target clauses, variables, or functions when the user's request doesn't specify a section ID.
    type: code
    parameters:
      type: object
      properties:
        artifact_id:
          type: string
          description: ID of the artifact to search within.
        query:
          type: string
          description: Exact keyword or phrase to locate (e.g. "overseas shipping" or "calculate_tax").
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
    description: Surgically edit or rewrite an isolated section, slide, or function of an artifact without modifying or re-generating the rest of the file.
    type: code
    parameters:
      type: object
      properties:
        artifact_id:
          type: string
          description: ID of the artifact.
        block_key:
          type: string
          description: Identifier of the target block (e.g. sec_3, slide_2, fn_tax).
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

Use this skill whenever generating, modifying, or refining digital artifacts for the user. Instead of outputting static download links, use `open_or_update_artifact` so the user can interactively preview, edit, run, and export the creation inside the Canvas.

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
     - `bg` / `background`: The LLM selects bespoke background gradients or colors (e.g. radial/linear gradients, dark glassmorphism, sleek light minimal, neo-brutalist, or neon cyber).
     - `accent` / `accent_color`: Topic-matched accent colors (e.g. gold/emerald for finance, violet/cyan for AI, crimson/slate for cybersecurity).
     - `card_bg`, `card_border`, `text_color`, `subtext_color`: Dynamic matching surface tokens.
     - `layout`: Choose or invent an innovative layout per slide based on narrative context:
       - `"hero"`: Cover/title or bold keynote vision (with `badge`, `subtitle`, `tags`).
       - `"stats"`: Performance metrics, KPIs, and data highlights (`stats: [{"value": "$4.2M", "label": "ARR", "change": "+120%"}, ...]`).
       - `"timeline"` / `"process"`: Roadmaps, phased launches, and milestone steps (`steps: [{"step": "Phase 1", "title": "Foundation", "desc": "Core infra"}, ...]`).
       - `"matrix"` / `"grid"`: Multi-pillar architectures, feature grids, or capability matrices (`cards: [{"title": "Pillar A", "description": "...", "badge": "Core"}, ...]`).
       - `"split"` / `"comparison"`: Side-by-side comparative column containers (`columns: [{"title": "Legacy", "items": [...]}, {"title": "AI Engine", "items": [...]}]`).
       - `"quote"` / `"callout"`: Impactful vision statements and testimonials (`quote`, `author`, `role`).
       - `"custom_html"`: Complete design autonomy to output full custom HTML + CSS directly inside the slide.
     - Include `speaker_notes` where helpful for presentations.
5. **Diagrams (`.svg`)**:
   - Emit valid standalone `<svg>` tags with `viewBox`, clean styling, and modern color palettes.

### 🛠️ Guidelines for Editing Artifacts:
1. **Prefer surgical tools over full document re-generation**:
   - To remove a line or phrase: call `patch_artifact` with `target_text` set to the exact snippet to remove and `replacement_text=""` (empty string).
   - To replace or rewrite a specific section: call `edit_artifact_section` with the target `block_key` and new `content`.
2. If the user mentions a specific section (e.g. "In the refund policy..."), check the Table of Contents outline provided in the system prompt.
3. If the location is unclear, call `artifact_search` or `artifact_semantic_search` to find the exact block key and line number.
4. If the user asks to rewrite, restructure, or regenerate the entire artifact, call `open_or_update_artifact` with the full revised `content`.
5. If the user asks to undo or bring back old wording, use `rollback_artifact_block` to perform non-destructive time-travel on only that block.

