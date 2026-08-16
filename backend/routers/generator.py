from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User
from auth import get_current_user
from schemas import SkillGenerateRequest

router = APIRouter()


@router.get("/models")
def get_generator_models(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from models import Tenant, TenantLLM
    tenants = db.query(Tenant).filter(Tenant.user_id == current_user.id).all()
    res = []
    for t in tenants:
        models = db.query(TenantLLM).filter(
            TenantLLM.tenant_id == t.id,
            TenantLLM.is_active == True,
            TenantLLM.provider != "prochat"
        ).all()
        for m in models:
            res.append({
                "tenant_id": t.id,
                "tenant_name": t.name,
                "model_name": m.model_name,
                "provider": m.provider
            })
    return res


@router.post("/generate")
def generate_skill_content(
    payload: SkillGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from models import Tenant
    tenant = db.query(Tenant).filter(
        Tenant.id == payload.tenant_id,
        Tenant.user_id == current_user.id
    ).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found or unauthorized")

    from llm_client import get_llm_client
    try:
        client = get_llm_client(db=db, tenant_id=payload.tenant_id, model_name=payload.model_name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    system_prompt = (
        "You are an expert AI developer for the AI Skill Engine. "
        "Your task is to write a valid skill file in the `SKILL.md` format based on the user's requirements.\n\n"
        "A skill file must contain a YAML frontmatter block at the very top, followed by markdown instructions.\n"
        "Here is the structure of the YAML frontmatter:\n"
        "```yaml\n"
        "name: skill_name_in_snake_case\n"
        "description: Clear, detailed description of when the LLM should trigger this skill.\n"
        "tools:\n"
        "  - name: tool_name\n"
        "    description: What this tool does.\n"
        "    # For API calls, use type: http\n"
        "    type: http\n"
        "    # CRITICAL URL FORMATTING RULES:\n"
        "    # 1. Any query parameters from user_data MUST be appended directly to the URL string (double curly braces)\n"
        "    #    e.g. {{user_data.database_name}}\n"
        "    # 2. Dynamic runtime arguments that the LLM supplies (defined in 'parameters') do NOT need placeholders in the URL.\n"
        "    #    The http executor automatically appends/merges them as query parameters at runtime.\n"
        "    # Example URL: \"https://api.example.com/search?db={{user_data.database_name}}&limit=10\"\n"
        "    # Do NOT put static or user_data keys in a 'params:' block, as the http executor will ignore them.\n"
        "    url: https://api.example.com/endpoint\n"
        "    method: GET # or POST, PUT, DELETE, etc.\n"
        "    headers:\n"
        "      Authorization: \"Bearer {{user_data.api_token_name}}\" # optional mapping to user_data\n"
        "    # Define tool arguments that the LLM user supplies under parameters.properties.\n"
        "    # These will be automatically appended to the URL query string for GET requests:\n"
        "    parameters:\n"
        "      type: object\n"
        "      properties:\n"
        "        query:\n"
        "          type: string\n"
        "          description: User search query\n"
        "      required:\n"
        "        - query\n"
        "    # For custom code/scripts, use type: python (or leave out for default shell commands)\n"
        "    # type: python\n"
        "    # code: | ...\n"
        "```\n\n"
        "Rules for the output:\n"
        "1. Start directly with the triple-dash `---` and end the frontmatter block with `---`.\n"
        "2. Do NOT wrap the entire output in a code block or markdown wrapper. Return ONLY the raw file content.\n"
        "3. Keep YAML strings properly formatted and escaped.\n"
        "4. Include clear instructions/guidelines for the LLM under the frontmatter block.\n"
    )

    prompt = (
        f"Skill Name: {payload.skill_name}\n"
        f"Description: {payload.description}\n"
    )
    if payload.api_calls:
        prompt += "\nThe skill requires the following API calls (HTTP tools):\n"
        for i, api in enumerate(payload.api_calls):
            prompt += (
                f"\nAPI Call #{i+1}:\n"
                f"  Method: {api.method}\n"
                f"  URL: {api.url}\n"
            )
            if api.headers:
                prompt += "  Headers:\n"
                for h in api.headers:
                    prompt += f"    {h.get('key')}: {h.get('value')}\n"
            if api.query_params:
                prompt += "  Query Parameters:\n"
                for q in api.query_params:
                    prompt += f"    {q.get('key')}: {q.get('value')}\n"
            if api.body:
                prompt += f"  Request Body / payload details: {api.body}\n"

    if payload.inputs_secrets:
        prompt += f"\nRequired Credentials/Secrets from user_data: {payload.inputs_secrets}\n"
    if payload.behavior:
        prompt += f"\nBehavior & Rules: {payload.behavior}\n"

    try:
        response = client.chat.completions.create(
            model=payload.model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            stream=False
        )
        content = response.choices[0].message.content
        if content.startswith("```"):
            lines = content.splitlines()
            if lines[0].startswith("```yaml") or lines[0].startswith("```markdown") or lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            content = "\n".join(lines)
        return {"content": content.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM Generation failed: {str(e)}")
