---
name: scheduler
description: Create, list, pause, resume, or cancel scheduled recurring tasks or timed future prompts. Use this whenever the user wants something to run automatically at a specific time, on a repeating schedule, or at regular intervals.
tools:
  - name: create_schedule
    description: >
      Schedule a prompt or task to run automatically. Use for requests like
      "every day at 10 AM", "every Monday at 9 AM", "every 2 hours",
      "remind me tomorrow at 3 PM", etc. You must derive the
      cron_expression or interval_seconds from the user's natural language.
    type: custom
    parameters:
      type: object
      properties:
        name:
          type: string
          description: Short human-readable label for this job (e.g. "Daily Crypto Report", "Hourly Uptime Monitor").
        prompt:
          type: string
          description: >
            The detailed task instructions to execute at each trigger.
            If the user requested an email or webhook delivery, explicitly instruct the model in this prompt
            what data to gather/process and to use the email or webhook tool to deliver it to the recipient
            (e.g. "Fetch and summarize the top 5 Hyderabad news headlines, format as a clean digest, and send an email to user@example.com with the update.").
        trigger_type:
          type: string
          enum: [cron, interval, date]
          description: >
            cron = repeating on a calendar schedule (daily, weekly, monthly, specific weekdays).
            interval = repeating every N seconds.
            date = one-shot run at an exact future datetime.
        cron_expression:
          type: string
          description: >
            Standard 5-field cron expression (minute hour day-of-month month day-of-week).
            Required if trigger_type is "cron".
            Examples:
            - "0 10 * * *" = Every day at 10:00 AM
            - "0 9 * * 1" = Every Monday at 9:00 AM
            - "0 8 * * 1-5" = Every weekday (Mon-Fri) at 8:00 AM
            - "30 18 * * *" = Every day at 6:30 PM
            - "0 0 1 * *" = First day of every month at midnight
        interval_seconds:
          type: integer
          description: >
            Seconds between each run. Required if trigger_type is "interval".
            Examples: 3600 (every hour), 7200 (every 2 hours), 86400 (every 24 hours).
        run_at:
          type: string
          description: >
            ISO 8601 datetime for a one-shot run. Required if trigger_type is "date".
            Example: "2026-11-12T15:00:00"
        skill_names:
          type: array
          items:
            type: string
          description: List of skills to activate when executing this scheduled task. Leave empty to enable all available skills.
        user_data_template_id:
          type: string
          description: Optional ID of a User Data / Secrets Profile template to bind to this scheduled task. If not provided, no user data profile is attached.
      required:
        - name
        - prompt
        - trigger_type

  - name: list_schedules
    description: List all scheduled jobs currently registered for this workspace, including their IDs, active status, schedule cadence, and last execution results.
    type: custom
    parameters:
      type: object
      properties: {}

  - name: cancel_schedule
    description: Permanently cancel and delete a scheduled job by its job ID or name.
    type: custom
    parameters:
      type: object
      properties:
        job_id:
          type: string
          description: The job ID or exact name to cancel.
      required:
        - job_id

  - name: pause_schedule
    description: Temporarily pause an active scheduled job without deleting it.
    type: custom
    parameters:
      type: object
      properties:
        job_id:
          type: string
          description: The job ID or name to pause.
      required:
        - job_id

  - name: resume_schedule
    description: Resume a previously paused scheduled job.
    type: custom
    parameters:
      type: object
      properties:
        job_id:
          type: string
          description: The job ID or name to resume.
      required:
        - job_id
---

# Scheduler Skill Guidelines

Use this skill whenever the user asks for periodic, recurring, or future automated tasks.

### Trigger Detection & Cron Mapping:
- **Daily / Every Day**: `cron`, `minute hour * * *` (e.g. "at 10:30 AM" -> `cron_expression="30 10 * * *"`)
- **Specific Weekday (e.g. Every Monday)**: `cron`, `0 hour * * 1` (Sunday=0, Monday=1, ..., Saturday=6)
- **Every Weekday (Workdays)**: `cron`, `0 hour * * 1-5`
- **Intervals**: `interval`, `interval_seconds=3600` for 1 hour, `1800` for 30 minutes, etc.
- **One-off Future Time**: `date`, ISO datetime string `run_at="YYYY-MM-DDTHH:MM:SS"`

### Best Practices when Creating Schedules:
1. **Self-Contained Task `prompt`**:
   - The `prompt` should include all necessary task context and delivery actions.
   - If the user wants the result delivered via email or webhook, instruct the model in `prompt` to gather the necessary data, format it nicely, and invoke the email/webhook tool to send it to the specified recipient.
   - Example: `prompt="Fetch the latest news headlines for Hyderabad, India (last 24 hours), format a clean digest, and send an email to sandesh.aiengineer@gmail.com with subject 'Hyderabad News Briefing'."`
   - **CRITICAL - Error & Missing Secret Handling in Automated Tasks**:
     - When generating prompts for automated scheduled tasks, **explicitly instruct the agent to NEVER email errors, authentication failures, missing API keys/secrets, 401/403 access denied messages, or technical stack traces to the end user**.
     - An email must ONLY be dispatched when valid data or report results were successfully obtained.
     - If an API fails, a secret is missing, or an error occurs, the scheduled agent should log the error internally in its response and terminate WITHOUT calling `send_email`.
     - Example prompt directive to include: `"Fetch weather data for Perth. If the data is retrieved successfully, format a beautiful email report and send it to user@example.com. If the data cannot be fetched due to missing credentials, API errors, or 401/403 responses, DO NOT send any email to the user; simply log the failure reason in your final response."`
2. Always confirm the schedule cadence in clear, friendly human language (e.g. *"I've scheduled this to run every day at 10:00 AM"*).

