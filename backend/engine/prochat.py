"""
engine/prochat.py
ProChat Generative UI helpers for both non-streaming and streaming paths.
"""
import json
from sqlalchemy.orm import Session

from engine.usage import PROCHAT_SYSTEM_INSTRUCTION


def get_prochat_ui(db: Session, tenant, messages: list, final_text: str, prochat_model: str = None) -> tuple:
    """
    Fetch ProChat UI components synchronously (non-streaming).
    Returns (json_data, code_str, usage_dict, rates_tuple) or (None, None, None, None) on failure/no config.
    """
    import requests
    from models import TenantLLM
    from encryption_utils import decrypt_key
    from engine.usage import get_model_rates

    config = db.query(TenantLLM).filter(
        TenantLLM.tenant_id == tenant.id,
        (TenantLLM.provider == "prochat") | TenantLLM.model_name.ilike("%genui%"),
        TenantLLM.is_active == True
    ).first()

    if not config:
        return None, None, None, None

    try:
        api_key = decrypt_key(config.api_key_encrypted)
        base_url = config.base_url or "https://www.prochat.dev/apps/api/v1"
        resolved_model = prochat_model or config.model_name or "genui-mars-0.1"

        rates = get_model_rates(db, tenant.id, resolved_model)

        prochat_messages = [
            {"role": "system", "content": PROCHAT_SYSTEM_INSTRUCTION},
            {"role": "user", "content": f"Here is the assistant response data:\n\n{final_text}\n\nBased on this response, please present this in the UI."}
        ]
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {"model": resolved_model, "messages": prochat_messages, "stream": False}

        res = requests.post(f"{base_url.rstrip('/')}/chat/completions", headers=headers, json=payload, timeout=30)
        res_data = res.json()
        usage_data = res_data.get("usage")
        content_str = res_data["choices"][0]["message"]["content"]
        try:
            content_obj = json.loads(content_str)
            return content_obj.get("json"), content_obj.get("code"), usage_data, rates
        except Exception:
            return content_str, None, usage_data, rates
    except Exception as e:
        print(f"Error calling ProChat completions: {e}")
        return None, None, None, None


def stream_prochat_ui(db: Session, tenant, full_text: str, prochat_model: str,
                      session_id: str, model_name: str):
    """
    Stream ProChat UI chunk events. Yields SSE-formatted data strings.
    Returns (last_json, last_code, usage_data, rates) via final element StopIteration.
    """
    import requests
    from models import TenantLLM
    from encryption_utils import decrypt_key
    from engine.usage import get_model_rates

    config = db.query(TenantLLM).filter(
        TenantLLM.tenant_id == tenant.id,
        (TenantLLM.provider == "prochat") | TenantLLM.model_name.ilike("%genui%"),
        TenantLLM.is_active == True
    ).first()

    last_extracted_json = None
    last_extracted_code = None
    last_usage_data = None
    rates = (1.0, 2.0, 10.0, 20.0)

    if not config:
        warning = {
            "id": f"chatcmpl-{session_id}", "object": "chat.completion.chunk",
            "created": 1700000000, "model": model_name,
            "choices": [{"index": 0, "delta": {
                "content": "\n\n⚠️ **ProChat Generative UI config not found.** Please go to the **Tenants & Keys** settings dashboard, select your Tenant, and add a model configuration with provider `prochat` and your API Key to enable this feature."
            }, "finish_reason": "stop"}]
        }
        yield f"data: {json.dumps(warning)}\n\n"
        return last_extracted_json, last_extracted_code, last_usage_data, rates

    try:
        api_key = decrypt_key(config.api_key_encrypted)
        base_url = config.base_url or "https://www.prochat.dev/apps/api/v1"
        resolved_model = prochat_model or config.model_name or "genui-mars-0.1"
        rates = get_model_rates(db, tenant.id, resolved_model)

        loading = {
            "id": f"chatcmpl-{session_id}", "object": "chat.completion.chunk",
            "created": 1700000000, "model": model_name,
            "choices": [{"index": 0, "delta": {"reasoning": "Generating dynamic user interface components..."}, "finish_reason": None}]
        }
        yield f"data: {json.dumps(loading)}\n\n"

        prochat_messages = [
            {"role": "system", "content": PROCHAT_SYSTEM_INSTRUCTION},
            {"role": "user", "content": f"Here is the assistant response data:\n\n{full_text}\n\nBased on this response, please present this in the UI."}
        ]
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {
            "model": resolved_model,
            "messages": prochat_messages,
            "stream": True,
            "stream_options": {"include_usage": True}
        }

        res = requests.post(f"{base_url.rstrip('/')}/chat/completions", headers=headers, json=payload, stream=True, timeout=60)

        for line in res.iter_lines():
            if not line:
                continue
            line_str = line.decode("utf-8").strip()
            if not line_str.startswith("data: "):
                continue
            data_content = line_str[6:]
            if data_content == "[DONE]":
                break
            try:
                chunk_obj = json.loads(data_content)
                if chunk_obj.get("usage"):
                    last_usage_data = chunk_obj.get("usage")

                choices = chunk_obj.get("choices") or []
                if choices and len(choices) > 0:
                    delta = choices[0].get("delta", {})
                    content_str = delta.get("content")
                    if content_str:
                        try:
                            content_obj = json.loads(content_str)
                            extracted_json = content_obj.get("json")
                            extracted_code = content_obj.get("code")
                        except Exception:
                            extracted_json = content_str
                            extracted_code = None

                        if extracted_json:
                            last_extracted_json = extracted_json
                        if extracted_code:
                            last_extracted_code = extracted_code

                        ui_chunk = {
                            "id": f"chatcmpl-{session_id}", "object": "chat.completion.chunk",
                            "created": 1700000000, "model": model_name,
                            "choices": [{"index": 0, "delta": {"json": extracted_json, "code": extracted_code}, "finish_reason": None}]
                        }
                        yield f"data: {json.dumps(ui_chunk)}\n\n"
            except Exception as e:
                print(f"Error parsing ProChat chunk: {e}")
    except Exception as e:
        print(f"Error calling ProChat completions stream: {e}")

    return last_extracted_json, last_extracted_code, last_usage_data, rates
