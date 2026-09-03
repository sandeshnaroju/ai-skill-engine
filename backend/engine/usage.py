
def calculate_usage_cost(usage_obj, input_rate: float, output_rate: float, audio_input_rate: float, audio_output_rate: float):
    prompt_tokens = 0
    completion_tokens = 0
    audio_input_tokens = 0
    audio_output_tokens = 0
    
    if usage_obj:
        if isinstance(usage_obj, dict):
            prompt_tokens = usage_obj.get("prompt_tokens") or 0
            completion_tokens = usage_obj.get("completion_tokens") or 0
            prompt_details = usage_obj.get("prompt_tokens_details") or {}
            audio_input_tokens = (prompt_details.get("audio_tokens") or 0) if isinstance(prompt_details, dict) else (getattr(prompt_details, "audio_tokens", 0) or 0)
            completion_details = usage_obj.get("completion_tokens_details") or {}
            audio_output_tokens = (completion_details.get("audio_tokens") or 0) if isinstance(completion_details, dict) else (getattr(completion_details, "audio_tokens", 0) or 0)
        else:
            prompt_tokens = getattr(usage_obj, "prompt_tokens", 0) or 0
            completion_tokens = getattr(usage_obj, "completion_tokens", 0) or 0
            
            prompt_details = getattr(usage_obj, "prompt_tokens_details", None)
            if prompt_details and hasattr(prompt_details, "audio_tokens"):
                audio_input_tokens = getattr(prompt_details, "audio_tokens", 0) or 0
                
            completion_details = getattr(usage_obj, "completion_tokens_details", None)
            if completion_details and hasattr(completion_details, "audio_tokens"):
                audio_output_tokens = getattr(completion_details, "audio_tokens", 0) or 0
            
    standard_input_tokens = max(0, prompt_tokens - audio_input_tokens)
    standard_output_tokens = max(0, completion_tokens - audio_output_tokens)
    
    cost = (
        (standard_input_tokens * input_rate) +
        (standard_output_tokens * output_rate) +
        (audio_input_tokens * audio_input_rate) +
        (audio_output_tokens * audio_output_rate)
    ) / 1000000.0
    return prompt_tokens, completion_tokens, cost

def update_request_usage(chat_req, usage_obj, input_rate: float, output_rate: float, audio_input_rate: float, audio_output_rate: float, is_secondary: bool = False, model_name: str = None):
    prompt_tokens, completion_tokens, cost = calculate_usage_cost(usage_obj, input_rate, output_rate, audio_input_rate, audio_output_rate)
    
    if is_secondary:
        if model_name:
            chat_req.secondary_model_name = model_name
        chat_req.secondary_prompt_tokens = (chat_req.secondary_prompt_tokens or 0) + prompt_tokens
        chat_req.secondary_completion_tokens = (chat_req.secondary_completion_tokens or 0) + completion_tokens
        chat_req.secondary_cost_usd = round((chat_req.secondary_cost_usd or 0.0) + cost, 6)
    else:
        if model_name:
            chat_req.primary_model_name = model_name
        chat_req.primary_prompt_tokens = (chat_req.primary_prompt_tokens or 0) + prompt_tokens
        chat_req.primary_completion_tokens = (chat_req.primary_completion_tokens or 0) + completion_tokens
        chat_req.primary_cost_usd = round((chat_req.primary_cost_usd or 0.0) + cost, 6)

    chat_req.prompt_tokens = (chat_req.prompt_tokens or 0) + prompt_tokens
    chat_req.completion_tokens = (chat_req.completion_tokens or 0) + completion_tokens
    chat_req.cost_usd = round((chat_req.cost_usd or 0.0) + cost, 6)

def get_model_rates(db, tenant_id: str, model_name: str):
    from models import TenantLLM
    active_model_config = db.query(TenantLLM).filter(
        TenantLLM.tenant_id == tenant_id,
        TenantLLM.model_name == model_name,
        TenantLLM.is_active == True
    ).first()
    
    if active_model_config:
        in_r = getattr(active_model_config, "input_rate", None)
        out_r = getattr(active_model_config, "output_rate", None)
        # If rates are explicitly defined and > 0, return them
        if (in_r is not None and in_r > 0.0) or (out_r is not None and out_r > 0.0):
            return (
                in_r or 0.0,
                out_r or 0.0,
                getattr(active_model_config, "audio_input_rate", 0.0) or 0.0,
                getattr(active_model_config, "audio_output_rate", 0.0) or 0.0,
            )

    # ProChat models are fine-tuned from Google Gemini models.
    # If custom rates are not set on ProChat, inherit from the tenant's Gemini model rates.
    is_prochat = any(k in (model_name or "").lower() for k in ["prochat", "genui", "mars"])
    if is_prochat:
        gemini_config = db.query(TenantLLM).filter(
            TenantLLM.tenant_id == tenant_id,
            (TenantLLM.provider == "gemini") | (TenantLLM.model_name.ilike("%gemini%")),
            TenantLLM.is_active == True
        ).first()
        if gemini_config and (gemini_config.input_rate or gemini_config.output_rate):
            return (
                getattr(gemini_config, "input_rate", 0.0) or 0.0,
                getattr(gemini_config, "output_rate", 0.0) or 0.0,
                getattr(gemini_config, "audio_input_rate", 0.0) or 0.0,
                getattr(gemini_config, "audio_output_rate", 0.0) or 0.0,
            )

    if active_model_config:
        return (
            getattr(active_model_config, "input_rate", 0.0) or 0.0,
            getattr(active_model_config, "output_rate", 0.0) or 0.0,
            getattr(active_model_config, "audio_input_rate", 0.0) or 0.0,
            getattr(active_model_config, "audio_output_rate", 0.0) or 0.0,
        )

    return (0.0, 0.0, 0.0, 0.0)


PROCHAT_SYSTEM_INSTRUCTION = (
    "You are a ProChat UI generator. Your job is to return UI for the "
    "response of another LLM assistant. The assistant's response is added in the messages.\n\n"
    "Rules:\n"
    "1. Ensure that all data and information provided in the assistant's response is fully included in the generated UI.\n"
    "2. Do not leave out, omit, or truncate any data points, figures, or information from the response.\n"
    "3. Do not add anything that is not present in the response."
)

