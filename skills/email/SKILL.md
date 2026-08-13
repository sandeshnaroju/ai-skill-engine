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

Use this skill to send emails directly via SMTP config.

### Email Design & Formatting Guidelines
When sending emails, you must construct the `body` parameter using clean, modern, and beautifully styled HTML. Follow these formatting points:
- **HTML/CSS Formatting**: Always format the body with standard HTML tags and inline CSS styles. Never send bare or raw plain text.
- **Clean Layout Card**: Wrap the main message in a centered card container (e.g. `max-width: 600px`) with rounded corners, a soft border, and padding.
- **Typography & Accent Colors**: Use system sans-serif fonts with comfortable line-height (e.g., `1.6`). Apply a consistent, professional accent color scheme for headers, highlights, and buttons.
- **Clear Structure**: Use headers (`<h2>`, `<h3>`), bullet points, and tables to make information easily scannable.
- **Styled Buttons (CTA)**: Format links as buttons with accent background colors, padding, and rounded corners so they are easy to click.
- **Muted Footer**: Include a small, visually separate footer line at the bottom identifying the sender or utility.
