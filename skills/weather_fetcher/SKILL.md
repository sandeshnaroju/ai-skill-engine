---
name: weather_fetcher
description: Example skill demonstrating secure user_data context injection for REST API calls (no credentials shared with LLM).
tools:
  - name: fetch_weather
    description: Fetch current weather info for a given city. Injects api_key from user_data dynamically.
    type: http
    url: https://api.openweathermap.org/data/2.5/weather?appid={{user_data.openweathermap_api_key}}&units=metric
    method: GET
    parameters:
      type: object
      properties:
        q:
          type: string
          description: The name of the city (e.g., "Paris", "New York").
      required:
        - q
---

# Sample Weather API Skill
This skill demonstrates how to design tools that securely interact with REST APIs requiring user credentials.
- The `openweathermap_api_key` is passed by the client application inside `user_data`.
- The LLM only sees the city parameter `q` and does not get exposed to the API key.
- During execution, the server dynamically resolves the `{{user_data.openweathermap_api_key}}` placeholder in the URL.
