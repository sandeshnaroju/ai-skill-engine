
def update_request_usage(chat_req, usage_obj, input_rate: float, output_rate: float, audio_input_rate: float, audio_output_rate: float):
    prompt_tokens = 0
    completion_tokens = 0
    audio_input_tokens = 0
    audio_output_tokens = 0
    
    if usage_obj:
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
    
    chat_req.prompt_tokens = getattr(chat_req, "prompt_tokens", 0) + prompt_tokens
    chat_req.completion_tokens = getattr(chat_req, "completion_tokens", 0) + completion_tokens
    
    cost = (
        (standard_input_tokens * input_rate) +
        (standard_output_tokens * output_rate) +
        (audio_input_tokens * audio_input_rate) +
        (audio_output_tokens * audio_output_rate)
    ) / 1000000.0
    
    chat_req.cost_usd = round(getattr(chat_req, "cost_usd", 0.0) + cost, 6)

def get_model_rates(db, tenant_id: str, model_name: str):
    from models import TenantLLM
    active_model_config = db.query(TenantLLM).filter(
        TenantLLM.tenant_id == tenant_id,
        TenantLLM.model_name == model_name,
        TenantLLM.is_active == True
    ).first()
    
    if active_model_config:
        return (
            getattr(active_model_config, "input_rate", 1.0) or 1.0,
            getattr(active_model_config, "output_rate", 2.0) or 2.0,
            getattr(active_model_config, "audio_input_rate", 10.0) or 10.0,
            getattr(active_model_config, "audio_output_rate", 20.0) or 20.0
        )
    return (1.0, 2.0, 10.0, 20.0)

PROCHAT_SYSTEM_INSTRUCTION = (
    "You are a ProChat UI generator. Your job is to return UI for the "
    "response of another LLM assistant. The assistant's response is added in the messages.\n\n"
    "Rules:\n"
    "1. Ensure that all data and information provided in the assistant's response is fully included in the generated UI.\n"
    "2. Do not leave out, omit, or truncate any data points, figures, or information from the response.\n"
    "3. Add anchor links wherever you find URLs or file links, ensuring users can download or navigate to them."
)



