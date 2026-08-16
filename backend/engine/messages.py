from typing import Any
import re

def resolve_user_data_placeholders(target: Any, user_data: dict) -> Any:
    if not user_data or not isinstance(user_data, dict):
        return target
    
    if isinstance(target, str):
        def replace(match):
            placeholder = match.group(1).strip()
            if placeholder.startswith("user_data."):
                key = placeholder[len("user_data."):]
            else:
                key = placeholder
            
            parts = key.split(".")
            val = user_data
            for part in parts:
                if isinstance(val, dict) and part in val:
                    val = val[part]
                else:
                    print(f"DEBUG resolve: key '{part}' not found in user_data structure.")
                    return match.group(0)
            print(f"DEBUG resolve: Replaced placeholder '{placeholder}' with '{val}'")
            return str(val)
            
        return re.sub(r'\{\{([^}]+)\}\}', replace, target)
        
    elif isinstance(target, dict):
        return {k: resolve_user_data_placeholders(v, user_data) for k, v in target.items()}
    elif isinstance(target, list):
        return [resolve_user_data_placeholders(item, user_data) for item in target]
    return target


