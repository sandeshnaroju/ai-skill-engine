---
name: media_generator
description: Specialized generative AI sub-agent for creating photorealistic/artistic images and cinematic video clips using specialized generative models (Gemini Flash Image, DALL-E, Google Veo 3.1, Luma Dream Machine, Fal.ai).
tools:
  - name: generate_image
    description: "Generate a photorealistic, conceptual, or artistic image using specialized image generation models (Gemini Nano Banana / Flash Image, DALL-E 3, Flux). Saves the output file into the sandbox workspace. After calling this tool, immediately call `artifact_editor__open_uploaded_file_as_artifact` with the returned sandbox path to open and present the image in the interactive Canvas Artifact Editor. Call this whenever the user asks to generate, create, draw, design, or render a picture, photo, scene, poster, logo, or illustration."
    type: subagent
    parameters:
      type: object
      properties:
        prompt:
          type: string
          description: "Detailed description of the image to generate, including subjects, lighting, perspective, colors, and art style."
        aspect_ratio:
          type: string
          enum: ["1:1", "16:9", "9:16", "4:3", "3:4"]
          description: "Aspect ratio of the generated image (default '1:1')."
        size:
          type: string
          description: "Optional explicit resolution (e.g. '1024x1024', '1792x1024', '1024x1792')."
        style:
          type: string
          description: "Optional style guidance (e.g. 'photorealistic', 'digital art', 'cinematic', 'watercolor', '3d render', 'minimalist vector')."
        image_path:
          type: string
          description: "Optional source image path or URL if performing sequential image-to-image editing or modification."
      required:
        - prompt

  - name: generate_video
    description: "Generate a short video clip (.mp4) using specialized video generation models (Google Veo 2, Luma Dream Machine, Runway Gen-3, Fal.ai HunyuanVideo). Saves the output file into the sandbox workspace. After calling this tool, immediately call `artifact_editor__open_uploaded_file_as_artifact` with the returned sandbox path to open and play the video in the interactive Canvas Artifact Editor. Call this whenever the user asks to generate, create, animate, render, or produce a video clip or scene."
    type: subagent
    parameters:
      type: object
      properties:
        prompt:
          type: string
          description: "Detailed description of the video scene, character motion, camera actions (pan, tilt, zoom, drone shot), environment, lighting, and cinematic style."
        duration_seconds:
          type: integer
          enum: [5, 10]
          description: "Duration of the video clip in seconds (default: 5)."
        aspect_ratio:
          type: string
          enum: ["16:9", "9:16", "1:1"]
          description: "Aspect ratio of the video (default: '16:9')."
        image_path:
          type: string
          description: "Optional starting frame image path or URL for image-to-video animation."
      required:
        - prompt
---

# Media Generator Sub-Agent Guidelines

Use this skill whenever the user asks to generate, create, draw, animate, or render **images** or **videos**.

### 1. 🎨 Image Generation & Canvas Display Workflow
When a user asks to generate, create, draw, or render an image, picture, photo, illustration, or diagram:
1. **First, invoke `media_generator__generate_image`**:
   - Provide a vivid, detailed description in `prompt`.
   - The tool generates the image file and saves it in sandbox storage (e.g. `sandbox/outputs/tenant/a1b2c3d4_filename.png`).
2. **Next, immediately open the generated image in the interactive Canvas Artifact Editor**:
   - Call `artifact_editor__open_uploaded_file_as_artifact(file_path="<sandbox_path_from_stdout>", title="<image_title>", artifact_type="image")`.
   - This opens the image directly in the Canvas Artifact Editor with pan, zoom, rotation, and high-res export controls for the user.

### 2. 🎬 Video Generation & Canvas Display Workflow
When a user asks to generate, animate, create, or render a video clip, cinematic scene, or camera motion:
1. **First, invoke `media_generator__generate_video`**:
   - Provide a detailed visual description in `prompt` describing camera movements, lighting, and subjects.
   - Specify `aspect_ratio="16:9"` (or `"9:16"` for mobile/reels) and `duration_seconds=5`.
   - If animating an existing image, provide `image_path`.
   - The tool renders the MP4 video and saves it in sandbox storage (e.g. `sandbox/outputs/tenant/<uuid>_clip.mp4`).
2. **Next, open the video in the Canvas Artifact Editor**:
   - Call `artifact_editor__open_uploaded_file_as_artifact(file_path="<sandbox_path_from_stdout>", title="<video_title>", artifact_type="video")`.
   - This allows the user to immediately stream and preview the video directly in the Canvas media player.
