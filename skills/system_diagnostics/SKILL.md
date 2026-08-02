---
name: system_diagnostics
description: Skill for checking server disk space, memory, uptime, and system status using shell tools.
tools:
  - name: check_disk_usage
    description: Check filesystem disk usage.
    command: df -h
  - name: check_system_uptime
    description: Check server uptime and system load.
    command: uptime
  - name: check_active_processes
    description: List current running processes.
    command: ps aux | head -n 15
---

# System Diagnostics Skill
Use this skill when users ask questions about system health, server uptime, disk space, or running processes.
Always provide a concise summary of the command outputs to the user.
