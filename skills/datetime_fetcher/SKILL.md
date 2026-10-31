---
name: datetime_fetcher
description: Fetch the current date, time, day of the week, and timezone.
tools:
  - name: get_current_datetime
    description: Retrieves the exact real-time date, time, weekday, and timezone (in-memory fast lookup).
    parameters:
      type: object
      properties:
        timezone:
          type: string
          description: Optional IANA timezone name (e.g. 'Asia/Kolkata', 'America/New_York', 'Europe/London', 'UTC'). Defaults to tenant or system timezone.
---

# Datetime Fetcher Skill

This skill allows the AI to fetch the exact current date, time, day of the week, and timezone offset whenever needed.

## When to Use
- When the user asks for the current time or date (e.g., "What time is it right now?", "What's today's date?").
- When resolving relative time queries (e.g., "What day is today?", "Check what time it is in Tokyo").
- When timestamps or current time calculations are required for business tasks, scheduling, or reporting.

## Guidelines
1. Execute `get_current_datetime` with the user's requested timezone if specified (e.g. `timezone="Asia/Kolkata"` or `timezone="America/New_York"`), or omit `timezone` to use the tenant's default timezone.
2. Present the result clearly in a natural format, mentioning the 12-hour or 24-hour time, date, weekday, and timezone.

