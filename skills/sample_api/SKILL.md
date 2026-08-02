---
name: sample_api
description: Skill for calling external enterprise REST webhooks and APIs.
tools:
  - name: get_github_zen
    description: Fetch a design philosophy message from GitHub REST API.
    type: http
    url: https://api.github.com/zen
    method: GET
    headers:
      User-Agent: skill_manager_app
---

# Sample REST API Skill
Use this skill to fetch inspiration messages from GitHub REST API.
