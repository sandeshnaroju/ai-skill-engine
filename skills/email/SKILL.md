---
name: email
description: Use this skill to send emails containing reports, updates, notices, or summaries.
tools:
  - name: send_email
    description: Sends an email using configured SMTP settings.
    parameters:
      type: object
      properties:
        to_email:
          type: string
          description: Recipient email address.
        subject:
          type: string
          description: Subject line of the email.
        body:
          type: string
          description: HTML or text body of the email.
      required:
        - to_email
        - subject
        - body
---
# Email Skill

Use this skill to send emails directly via SMTP config. Ensure you include all necessary information, formatted nicely.
