---
name: multimodal_analyst
description: Specialized multimodal sub-agent for analyzing images, audio recordings, and video files using vision and media-capable LLMs (Gemini, GPT-4o, Claude).
tools:
  - name: analyze_image
    description: "Inspect an image, diagram, screenshot, chart, or document scan. Extracts text (OCR), detects objects, explains diagrams/blueprints, or answers visual queries."
    type: code
    parameters:
      type: object
      properties:
        image_path:
          type: string
          description: "Relative path, sandbox path, or URL of the image file (.png, .jpg, .jpeg, .webp, .svg, .bmp)."
        query:
          type: string
          description: "Specific question or instruction for the image analysis (e.g., 'Transcribe receipt items and total', 'Explain this system architecture diagram', 'What is wrong in this UI design?')."
      required:
        - image_path

  - name: analyze_audio
    description: "Transcribe, summarize, or extract insights from audio files (.mp3, .wav, .m4a, .aac, .ogg, .flac). Supports speaker dialogue, meetings, lectures, voice memos, and audio logs."
    type: code
    parameters:
      type: object
      properties:
        audio_path:
          type: string
          description: "Relative path, sandbox path, or URL to the audio file."
        query:
          type: string
          description: "Instruction for audio analysis (e.g., 'Transcribe with speaker timestamps', 'Summarize key action items from this meeting', 'What questions did the client ask?')."
      required:
        - audio_path

  - name: analyze_video
    description: "Analyze video recordings (.mp4, .mov, .webm, .mkv). Understands actions, visual timeline, scene changes, spoken dialogue, and on-screen text."
    type: code
    parameters:
      type: object
      properties:
        video_path:
          type: string
          description: "Relative path, sandbox path, or URL to the video file."
        query:
          type: string
          description: "Instruction for video analysis (e.g., 'Describe what happens chronologically with timestamps', 'Identify any safety protocol violations', 'Summarize the presentation slides shown in this video')."
      required:
        - video_path
---

# Multimodal Analyst Sub-Agent Guidelines

Use this skill whenever the user provides, mentions, attaches, or links an **image**, **audio recording**, or **video file**.

### 1. Automatic File Reference Detection
When a user uploads a file through the Chat Playground, the system automatically appends file references to the user prompt in the format:
`[Attached File: filename.png (URL: /api/v1/files/download/filename.png)]`

Whenever you see:
* An image extension (`.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`, `.bmp`) or file reference $\rightarrow$ call `multimodal_analyst__analyze_image`
* An audio extension (`.mp3`, `.wav`, `.m4a`, `.aac`, `.ogg`, `.flac`) or file reference $\rightarrow$ call `multimodal_analyst__analyze_audio`
* A video extension (`.mp4`, `.mov`, `.webm`, `.mkv`) or file reference $\rightarrow$ call `multimodal_analyst__analyze_video`

### 2. What to Supply
* For the path/url parameter (`image_path`, `audio_path`, `video_path`), you can pass:
  1. The direct URL or sandbox path: e.g. `/api/v1/files/download/receipt.jpg` or `sandbox/uploads/tenant/invoice.png`
  2. The raw filename: e.g. `meeting_recording.mp3`
  3. Any public HTTP/HTTPS URL
* Include a specific, detailed `query` explaining what the user wants to understand (e.g. *"Extract all line items, totals, and tax"* or *"Summarize the presentation slides shown in this video"*).
* Note: The execution model is directly managed and configured by the user/system settings. Do not attempt to specify a model.
