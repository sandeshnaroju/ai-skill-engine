"""
engine/limits.py
Quota evaluation, token estimation, and usage limit enforcement across Day, Month, Year, Session, and Turn.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy import func, case
from models import ChatRequest
from engine.usage import get_model_rates


def get_tenant_schedule_boundaries(tenant):
    """
    Computes localized cycle start boundaries (converted to UTC for DB filtering)
    and future renewal moments in the tenant's configured timezone.
    """
    tz_str = getattr(tenant, "timezone", "UTC") or "UTC"
    try:
        tz = ZoneInfo(tz_str)
    except Exception:
        tz = ZoneInfo("UTC")
        tz_str = "UTC"

    now_local = datetime.now(tz)

    # Daily Reset Time (HH:MM format, 24-hr)
    d_time = getattr(tenant, "daily_reset_time", "00:00") or "00:00"
    try:
        parts = d_time.strip().split(":")
        r_hour = int(parts[0])
        r_min = int(parts[1]) if len(parts) > 1 else 0
    except Exception:
        r_hour, r_min = 0, 0

    # 1. Daily Cycle:
    today_reset = now_local.replace(hour=r_hour, minute=r_min, second=0, microsecond=0)
    if now_local >= today_reset:
        day_start_local = today_reset
        next_day_renew_local = today_reset + timedelta(days=1)
    else:
        day_start_local = today_reset - timedelta(days=1)
        next_day_renew_local = today_reset

    # 2. Monthly Cycle (1-28):
    m_day = getattr(tenant, "monthly_reset_day", 1) or 1
    m_day = max(1, min(28, m_day))
    anchor_this_month = now_local.replace(day=m_day, hour=r_hour, minute=r_min, second=0, microsecond=0)
    if now_local >= anchor_this_month:
        month_start_local = anchor_this_month
        if now_local.month == 12:
            next_month_renew_local = now_local.replace(year=now_local.year + 1, month=1, day=m_day, hour=r_hour, minute=r_min, second=0, microsecond=0)
        else:
            next_month_renew_local = now_local.replace(month=now_local.month + 1, day=m_day, hour=r_hour, minute=r_min, second=0, microsecond=0)
    else:
        next_month_renew_local = anchor_this_month
        if now_local.month == 1:
            month_start_local = now_local.replace(year=now_local.year - 1, month=12, day=m_day, hour=r_hour, minute=r_min, second=0, microsecond=0)
        else:
            month_start_local = now_local.replace(month=now_local.month - 1, day=m_day, hour=r_hour, minute=r_min, second=0, microsecond=0)

    # 3. Yearly Cycle (1-12, 1-28):
    y_month = getattr(tenant, "yearly_reset_month", 1) or 1
    y_month = max(1, min(12, y_month))
    y_day = getattr(tenant, "yearly_reset_day", 1) or 1
    y_day = max(1, min(28, y_day))

    anchor_this_year = now_local.replace(month=y_month, day=y_day, hour=r_hour, minute=r_min, second=0, microsecond=0)
    if now_local >= anchor_this_year:
        year_start_local = anchor_this_year
        next_year_renew_local = anchor_this_year.replace(year=now_local.year + 1)
    else:
        year_start_local = anchor_this_year.replace(year=now_local.year - 1)
        next_year_renew_local = anchor_this_year

    # Convert local cycle starts to naive UTC datetimes for SQL querying
    utc_tz = ZoneInfo("UTC")
    day_start_utc = day_start_local.astimezone(utc_tz).replace(tzinfo=None)
    month_start_utc = month_start_local.astimezone(utc_tz).replace(tzinfo=None)
    year_start_utc = year_start_local.astimezone(utc_tz).replace(tzinfo=None)

    is_default = (
        tz_str.upper() == "UTC" and (r_hour == 0 and r_min == 0) and m_day == 1 and y_month == 1 and y_day == 1
    )

    return {
        "tz_str": tz_str,
        "day_start_utc": day_start_utc,
        "month_start_utc": month_start_utc,
        "year_start_utc": year_start_utc,
        "next_day_renew_local": next_day_renew_local,
        "next_month_renew_local": next_month_renew_local,
        "next_year_renew_local": next_year_renew_local,
        "is_default_schedule": is_default,
    }


def format_local_renew_moment(dt_local, include_date=False) -> str:
    """Format local renewal datetime with timezone abbreviation and ordinal date suffix."""
    tz_abbr = dt_local.strftime("%Z") or "UTC"
    time_str = dt_local.strftime("%I:%M %p") + f" {tz_abbr}"
    if not include_date:
        return time_str
    day = dt_local.day
    suffix = "th" if 11 <= day <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    date_str = dt_local.strftime(f"%B {day}{suffix}")
    return f"{date_str} at {time_str}"


def get_tenant_aggregated_usage(db, tenant_id: str, session_id: str = None, tenant = None) -> dict:
    """
    Returns aggregated tokens and cost for Day, Month, Year, and optional Session in a single query.
    Takes into account the tenant's configured Timezone, Daily reset time, Monthly reset day,
    and Yearly reset date.
    """
    if not tenant:
        from models import Tenant
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()

    if tenant:
        sched = get_tenant_schedule_boundaries(tenant)
        day_start = sched["day_start_utc"]
        month_start = sched["month_start_utc"]
        year_start = sched["year_start_utc"]
    else:
        now = datetime.utcnow()
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        month_start = datetime(now.year, now.month, 1, 0, 0, 0, 0)
        year_start = datetime(now.year, 1, 1, 0, 0, 0, 0)

    res = db.query(
        func.sum(case((ChatRequest.created_at >= day_start, ChatRequest.cost_usd), else_=0.0)).label("day_cost"),
        func.sum(case((ChatRequest.created_at >= day_start, ChatRequest.prompt_tokens + ChatRequest.completion_tokens), else_=0)).label("day_tokens"),
        func.sum(case((ChatRequest.created_at >= month_start, ChatRequest.cost_usd), else_=0.0)).label("month_cost"),
        func.sum(case((ChatRequest.created_at >= month_start, ChatRequest.prompt_tokens + ChatRequest.completion_tokens), else_=0)).label("month_tokens"),
        func.sum(case((ChatRequest.created_at >= year_start, ChatRequest.cost_usd), else_=0.0)).label("year_cost"),
        func.sum(case((ChatRequest.created_at >= year_start, ChatRequest.prompt_tokens + ChatRequest.completion_tokens), else_=0)).label("year_tokens"),
    ).filter(
        ChatRequest.tenant_id == tenant_id,
        ChatRequest.status == "completed",
        ChatRequest.created_at >= year_start
    ).first()

    session_tokens = 0
    session_cost = 0.0
    if session_id:
        sess_res = db.query(
            func.sum(ChatRequest.prompt_tokens + ChatRequest.completion_tokens).label("session_tokens"),
            func.sum(ChatRequest.cost_usd).label("session_cost")
        ).filter(
            ChatRequest.tenant_id == tenant_id,
            ChatRequest.session_id == session_id,
            ChatRequest.status == "completed"
        ).first()
        if sess_res:
            session_tokens = sess_res.session_tokens or 0
            session_cost = round(sess_res.session_cost or 0.0, 6)

    return {
        "day_cost": round(res.day_cost or 0.0, 6) if res and res.day_cost else 0.0,
        "day_tokens": (res.day_tokens or 0) if res and res.day_tokens else 0,
        "month_cost": round(res.month_cost or 0.0, 6) if res and res.month_cost else 0.0,
        "month_tokens": (res.month_tokens or 0) if res and res.month_tokens else 0,
        "year_cost": round(res.year_cost or 0.0, 6) if res and res.year_cost else 0.0,
        "year_tokens": (res.year_tokens or 0) if res and res.year_tokens else 0,
        "session_cost": session_cost,
        "session_tokens": session_tokens,
    }


def check_tenant_quotas(db, tenant, session_id: str, messages: list, model_name: str = None, secondary_model: str = None) -> tuple[bool, str | None]:
    """
    Evaluate tenant quotas in 5-tier hierarchical order:
    1. Yearly Limits (Cost -> Tokens)
    2. Monthly Limits (Cost -> Tokens)
    3. Daily Limits (Cost -> Tokens)
    4. Session Limits (Cost -> Tokens)
    5. Per-Turn Context Limit (Tokens)

    Includes 2-layer pre-flight cost projection for incoming prompt (primary + optional secondary LLM).
    ProChat secondary models (fine-tuned from Google Gemini) use Gemini-based token and rate calculations.
    Returns (is_breached, user_message).
    """
    if not tenant:
        return False, None

    sched = get_tenant_schedule_boundaries(tenant)

    est_prompt_tokens = estimate_messages_tokens(messages)
    in_rate = 0.0
    if model_name:
        rates = get_model_rates(db, tenant.id, model_name)
        if rates:
            in_rate = rates[0] or 0.0
    projected_prompt_cost = (est_prompt_tokens * in_rate) / 1000000.0 if in_rate > 0 else 0.0

    # If a secondary LLM (e.g. ProChat GenUI) is active, include its pre-flight estimate
    # ProChat is fine-tuned from Google Gemini models, so rates and token calculations align with Gemini.
    if secondary_model:
        sec_rates = get_model_rates(db, tenant.id, secondary_model)
        sec_in_rate = (sec_rates[0] or 0.0) if sec_rates else 0.0
        # Secondary receives the conversation context to generate the UI
        sec_projected_cost = (est_prompt_tokens * sec_in_rate) / 1000000.0 if sec_in_rate > 0 else 0.0
        projected_prompt_cost += sec_projected_cost

    usage = get_tenant_aggregated_usage(db, tenant.id, session_id, tenant=tenant)

    # ── Tier 1: Yearly / Annual Limits ──────────────────────────────────────
    if getattr(tenant, "yearly_cost_limit", None) and tenant.yearly_cost_limit > 0:
        total_projected_year_cost = usage["year_cost"] + projected_prompt_cost
        if total_projected_year_cost >= tenant.yearly_cost_limit:
            if sched["is_default_schedule"]:
                return True, "Annual quota limit reached. Quota will renew on January 1st at 00:00 UTC."
            renew_str = format_local_renew_moment(sched["next_year_renew_local"], include_date=True)
            return True, f"Annual quota limit reached. Quota will renew on {renew_str}."
    if getattr(tenant, "yearly_token_limit", None) and tenant.yearly_token_limit > 0:
        total_projected_year_tokens = usage["year_tokens"] + est_prompt_tokens
        if total_projected_year_tokens >= tenant.yearly_token_limit:
            if sched["is_default_schedule"]:
                return True, "Annual token limit reached. Quota will renew on January 1st at 00:00 UTC."
            renew_str = format_local_renew_moment(sched["next_year_renew_local"], include_date=True)
            return True, f"Annual token limit reached. Quota will renew on {renew_str}."

    # ── Tier 2: Monthly Limits ──────────────────────────────────────────────
    if getattr(tenant, "monthly_cost_limit", None) and tenant.monthly_cost_limit > 0:
        total_projected_month_cost = usage["month_cost"] + projected_prompt_cost
        if total_projected_month_cost >= tenant.monthly_cost_limit:
            if sched["is_default_schedule"]:
                return True, "Monthly quota limit reached. Quota will renew on the 1st of next month at 00:00 UTC."
            renew_str = format_local_renew_moment(sched["next_month_renew_local"], include_date=True)
            return True, f"Monthly quota limit reached. Quota will renew on {renew_str}."
    if getattr(tenant, "monthly_token_limit", None) and tenant.monthly_token_limit > 0:
        total_projected_month_tokens = usage["month_tokens"] + est_prompt_tokens
        if total_projected_month_tokens >= tenant.monthly_token_limit:
            if sched["is_default_schedule"]:
                return True, "Monthly token limit reached. Quota will renew on the 1st of next month at 00:00 UTC."
            renew_str = format_local_renew_moment(sched["next_month_renew_local"], include_date=True)
            return True, f"Monthly token limit reached. Quota will renew on {renew_str}."

    # ── Tier 3: Daily Limits ────────────────────────────────────────────────
    if getattr(tenant, "daily_cost_limit", None) and tenant.daily_cost_limit > 0:
        total_projected_day_cost = usage["day_cost"] + projected_prompt_cost
        if total_projected_day_cost >= tenant.daily_cost_limit:
            if sched["is_default_schedule"]:
                return True, "Daily quota limit reached. Quota will renew at 00:00 UTC."
            renew_str = format_local_renew_moment(sched["next_day_renew_local"], include_date=False)
            return True, f"Daily quota limit reached. Quota will renew at {renew_str}."
    if getattr(tenant, "daily_token_limit", None) and tenant.daily_token_limit > 0:
        total_projected_day_tokens = usage["day_tokens"] + est_prompt_tokens
        if total_projected_day_tokens >= tenant.daily_token_limit:
            if sched["is_default_schedule"]:
                return True, "Daily token limit reached. Quota will renew at 00:00 UTC."
            renew_str = format_local_renew_moment(sched["next_day_renew_local"], include_date=False)
            return True, f"Daily token limit reached. Quota will renew at {renew_str}."

    # ── Tier 4: Session Limits ──────────────────────────────────────
    if session_id:
        if getattr(tenant, "session_cost_limit", None) and tenant.session_cost_limit > 0:
            total_projected_sess_cost = usage["session_cost"] + projected_prompt_cost
            if total_projected_sess_cost >= tenant.session_cost_limit:
                return True, "Session quota limit reached. Please start a new session to continue."
        if getattr(tenant, "session_token_limit", None) and tenant.session_token_limit > 0:
            total_projected_sess_tokens = usage["session_tokens"] + est_prompt_tokens
            if total_projected_sess_tokens >= tenant.session_token_limit:
                return True, "Session token limit reached. Please start a new session to continue."

    # ── Tier 5: Per-Turn Context Memory Limit ──────────────────────────────
    max_ctx = getattr(tenant, "max_context_tokens", None) or 1_000_000
    if max_ctx > 0 and est_prompt_tokens >= max_ctx:
        return True, "Context memory limit reached. Please start a new session to continue."

    return False, None


def estimate_text_tokens(text: str) -> int:
    """
    Fast, universal token estimation.
    Averages ~3.7 characters per token for English & code, with safety margin.
    """
    if not text:
        return 0
    if not isinstance(text, str):
        text = str(text)
    return max(1, int(len(text) / 3.7))


def estimate_messages_tokens(messages: list) -> int:
    """
    Recursively estimate tokens across all roles, text content, and tool calls in a messages list.
    """
    total = 0
    if not messages:
        return 0
    import json
    for m in messages:
        if not isinstance(m, dict):
            continue
        total += 4  # Base framing overhead per message
        role = m.get("role")
        if role:
            total += estimate_text_tokens(role)
        content = m.get("content")
        if content:
            if isinstance(content, str):
                total += estimate_text_tokens(content)
            elif isinstance(content, list):
                for part in content:
                    if isinstance(part, dict):
                        text_val = part.get("text") or part.get("content") or ""
                        total += estimate_text_tokens(str(text_val))
                    else:
                        total += estimate_text_tokens(str(part))
            elif isinstance(content, dict):
                total += estimate_text_tokens(json.dumps(content))
        tool_calls = m.get("tool_calls")
        if tool_calls:
            total += estimate_text_tokens(json.dumps(tool_calls))
    return total


def truncate_tool_output(tool_result: str, max_chars: int = 400_000) -> str:
    """
    Safeguard against a single massive tool output (e.g. 50MB log dump)
    from overflowing the context.
    """
    if not tool_result or len(tool_result) <= max_chars:
        return tool_result
    truncated_msg = f"\n\n[Warning: Tool output truncated at {max_chars:,} characters to prevent context overflow.]"
    return tool_result[:max_chars] + truncated_msg





def generate_prochat_quota_ui(quota_message: str) -> tuple[dict, str]:
    """
    Generate deterministic ProChat UI JSON schema and React Native component code
    for quota notification screens. Costs $0 in LLM tokens and responds instantly.
    """
    escaped_msg = quota_message.replace('"', '\\"')

    ui_code = (
        'const quotaHeading = {\n'
        '  name: "quota_heading",\n'
        '  component: "text",\n'
        '  package: "react-native-paper",\n'
        '  value: "Quota Reached",\n'
        '  props: {\n'
        '    style: {\n'
        '      fontSize: 20,\n'
        '      fontWeight: "bold",\n'
        '      color: "#D32F2F",\n'
        '      textAlign: "center",\n'
        '      marginBottom: 10,\n'
        '    }\n'
        '  }\n'
        '};\n\n'
        'const quotaParagraph = {\n'
        '  name: "quota_paragraph",\n'
        '  component: "text",\n'
        '  package: "react-native-paper",\n'
        f'  value: "{escaped_msg}",\n'
        '  props: {\n'
        '    style: {\n'
        '      fontSize: 13,\n'
        '      color: "#455A64",\n'
        '      textAlign: "center",\n'
        '      lineHeight: 18,\n'
        '      paddingHorizontal: 5,\n'
        '    }\n'
        '  }\n'
        '};\n\n'
        'const quotaContentContainer = {\n'
        '  name: "quota_content_container",\n'
        '  component: "view",\n'
        '  package: "react-native",\n'
        '  content: [quotaHeading, quotaParagraph],\n'
        '  props: {\n'
        '    style: {\n'
        '      backgroundColor: "#FFFFFF",\n'
        '      padding: 20,\n'
        '      marginTop: 10,\n'
        '      borderRadius: 12,\n'
        '      borderTopWidth: 4,\n'
        '      borderTopColor: "#D32F2F",\n'
        '      width: "90%",\n'
        '      elevation: 3,\n'
        '      shadowColor: "#000",\n'
        '      shadowOffset: { width: 0, height: 2 },\n'
        '      shadowOpacity: 0.1,\n'
        '      shadowRadius: 4,\n'
        '    }\n'
        '  }\n'
        '};\n\n'
        'const screen = {\n'
        "  name: 'QuotaNotificationScreen',\n"
        '  screen: {\n'
        '    v1: [quotaContentContainer],\n'
        '  },\n'
        '  props: {\n'
        '    screenProps: {\n'
        '      options: {\n'
        '        headerShown: false,\n'
        '      },\n'
        '    },\n'
        '    style: {\n'
        "      display: 'flex',\n"
        "      flexDirection: 'column',\n"
        "      justifyContent: 'center',\n"
        "      alignItems: 'center',\n"
        '      backgroundColor: "#F5F7F8",\n'
        '    },\n'
        '  },\n'
        '  onStart: ({ setUi, getUi, moduleParams }) => {\n'
        '    // Screen mounted\n'
        '  },\n'
        '};'
    )

    ui_json = {
        "name": "QuotaNotificationScreen",
        "screen": {
            "v1": [
                {
                    "name": "quota_content_container",
                    "component": "view",
                    "package": "react-native",
                    "content": [
                        {
                            "name": "quota_heading",
                            "component": "text",
                            "package": "react-native-paper",
                            "value": "Quota Reached",
                            "props": {
                                "style": {
                                    "fontSize": 20,
                                    "fontWeight": "bold",
                                    "color": "#D32F2F",
                                    "textAlign": "center",
                                    "marginBottom": 10
                                }
                            }
                        },
                        {
                            "name": "quota_paragraph",
                            "component": "text",
                            "package": "react-native-paper",
                            "value": quota_message,
                            "props": {
                                "style": {
                                    "fontSize": 13,
                                    "color": "#455A64",
                                    "textAlign": "center",
                                    "lineHeight": 18,
                                    "paddingHorizontal": 5
                                }
                            }
                        }
                    ],
                    "props": {
                        "style": {
                            "backgroundColor": "#FFFFFF",
                            "padding": 20,
                            "marginTop": 10,
                            "borderRadius": 12,
                            "borderTopWidth": 4,
                            "borderTopColor": "#D32F2F",
                            "width": "90%",
                            "elevation": 3,
                            "shadowColor": "#000",
                            "shadowOffset": {
                                "width": 0,
                                "height": 2
                            },
                            "shadowOpacity": 0.1,
                            "shadowRadius": 4
                        }
                    }
                }
            ]
        },
        "props": {
            "screenProps": {
                "options": {
                    "headerShown": False
                }
            },
            "style": {
                "display": "flex",
                "flexDirection": "column",
                "justifyContent": "center",
                "alignItems": "center",
                "backgroundColor": "#F5F7F8"
            }
        },
        "onStart": "({ setUi, getUi, moduleParams }) => {\n    // Screen mounted\n  }"
    }

    return ui_json, ui_code

