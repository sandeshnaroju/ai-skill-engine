---
name: http_fetcher
description: Skill for downloading public web files (CSVs, datasets, documents) from HTTP/HTTPS URLs.
tools:
  - name: download_public_file
    description: Download a public file from a URL directly into the sandbox uploads folder. Returns the local sandbox path.
    type: shell
    parameters:
      type: object
      properties:
        url:
          type: string
          description: Public HTTP/HTTPS URL of the file to download (e.g. https://example.com/data.csv).
        filename:
          type: string
          description: Name to save the file as locally (e.g. input_data.csv).
      required:
        - url
        - filename
---

# HTTP Fetcher Skill
Use this skill when you need to download datasets, code bases, models, or other public files from external URLs (like GitHub, public buckets, or APIs) so that they can be read by other tools inside the offline sandbox.
Always explain the resulting sandbox path clearly to the user.
