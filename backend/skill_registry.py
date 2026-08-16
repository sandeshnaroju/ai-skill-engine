import os
import glob
import yaml

class SkillRegistry:
    def __init__(self, skills_dir: str = None):
        if not skills_dir:
            skills_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "skills")
        self.skills_dir = skills_dir
        self.skills_by_tenant = {}
        self.file_skills_cache = {}
        self.file_mtimes = {}

    @property
    def skills(self):
        # Fallback property for legacy/global code references
        return self.get_skills_dict()

    def get_skills_dict(self, tenant_id=None) -> dict:
        tenant_key = tenant_id or "global"
        if tenant_key not in self.skills_by_tenant:
            self.reload_skills(tenant_id=tenant_id)
        return self.skills_by_tenant.get(tenant_key, {})

    def reload_skills(self, tenant_id=None, db=None):
        tenant_key = tenant_id or "global"

        # 1. Load File-based default skills from skills/ directory
        file_skills = {}
        skill_files = glob.glob(os.path.join(self.skills_dir, "**/SKILL.md"), recursive=True)
        current_filepaths = set()
        
        for filepath in skill_files:
            current_filepaths.add(filepath)
            try:
                mtime = os.path.getmtime(filepath)
                if filepath in self.file_skills_cache and self.file_mtimes.get(filepath) == mtime:
                    metadata = self.file_skills_cache[filepath]
                else:
                    with open(filepath, "r", encoding="utf-8") as f:
                        content = f.read()
                    
                    parts = content.split("---", 2)
                    if len(parts) >= 3:
                        frontmatter_raw = parts[1]
                        markdown_body = parts[2].strip()
                        metadata = yaml.safe_load(frontmatter_raw) or {}
                        
                        metadata["body"] = markdown_body
                        metadata["filepath"] = filepath
                        metadata["source"] = "file"
                        metadata["created_at"] = mtime
                        
                        self.file_skills_cache[filepath] = metadata
                        self.file_mtimes[filepath] = mtime
                    else:
                        continue
                
                skill_name = metadata.get("name") or os.path.basename(os.path.dirname(filepath))
                file_skills[skill_name] = metadata
            except Exception as e:
                print(f"Error loading skill file {filepath}: {e}")

        # Evict deleted files from cache
        for path in list(self.file_skills_cache.keys()):
            if path not in current_filepaths:
                self.file_skills_cache.pop(path, None)
                self.file_mtimes.pop(path, None)

        tenant_skills = dict(file_skills)

        # 2. Load DB-backed dynamic custom skills from database
        should_close = False
        if db is None:
            try:
                from database import SessionLocal
                db = SessionLocal()
                should_close = True
            except Exception:
                db = None
                should_close = False

        if db is not None:
            # 2. Load DB-backed dynamic custom skills from database (scoped to tenant or global defaults)
            try:
                from models import CustomSkill
                from sqlalchemy import or_
                from sqlalchemy.orm import joinedload
                if tenant_id:
                    db_skills = db.query(CustomSkill).options(joinedload(CustomSkill.tenant)).filter(
                        CustomSkill.is_active == True,
                        or_(CustomSkill.tenant_id == tenant_id, CustomSkill.tenant_id == None)
                    ).all()
                else:
                    db_skills = db.query(CustomSkill).options(joinedload(CustomSkill.tenant)).filter(CustomSkill.is_active == True, CustomSkill.tenant_id == None).all()

                for dbs in db_skills:
                    try:
                        parts = dbs.content.split("---", 2)
                        if len(parts) >= 3:
                            frontmatter_raw = parts[1]
                            markdown_body = parts[2].strip()
                            metadata = yaml.safe_load(frontmatter_raw) or {}
                        else:
                            metadata = {"name": dbs.name, "description": dbs.description}
                            markdown_body = dbs.content

                        skill_name = dbs.name
                        metadata["name"] = skill_name
                        metadata["body"] = markdown_body
                        metadata["source"] = "database"
                        metadata["db_id"] = dbs.id
                        metadata["tenant_id"] = dbs.tenant_id
                        metadata["tenant_name"] = dbs.tenant.name if dbs.tenant else "Global"
                        metadata["content"] = dbs.content
                        metadata["created_at"] = dbs.created_at.timestamp() if dbs.created_at else 0.0
                        tenant_skills[skill_name] = metadata
                    except Exception as e:
                        print(f"Error parsing DB custom skill {dbs.name}: {e}")
            except Exception as e:
                # Table might not exist yet during fresh database creation
                print(f"Database warning: Custom skills could not be loaded: {e}")

            # 3. Load tools from registered active MCP Servers
            try:
                from models import McpServer
                from mcp_manager import mcp_manager
                from sqlalchemy import or_
                from sqlalchemy.orm import joinedload
                if tenant_id:
                    mcp_servers = db.query(McpServer).options(joinedload(McpServer.tenant)).filter(
                        McpServer.is_active == True,
                        or_(McpServer.tenant_id == tenant_id, McpServer.tenant_id == None)
                    ).all()
                else:
                    mcp_servers = db.query(McpServer).options(joinedload(McpServer.tenant)).filter(McpServer.is_active == True, McpServer.tenant_id == None).all()

                import json
                for srv in mcp_servers:
                    try:
                        discovered_tools = []
                        if srv.cached_tools:
                            try:
                                discovered_tools = json.loads(srv.cached_tools)
                            except Exception:
                                discovered_tools = []

                        if not discovered_tools:
                            discovered_tools = mcp_manager.list_tools(srv)
                            if discovered_tools:
                                srv.cached_tools = json.dumps(discovered_tools)
                                try:
                                    db.commit()
                                except Exception:
                                    pass

                        tools_def = []
                        for t in discovered_tools:
                            tools_def.append({
                                "name": t.get("name"),
                                "description": t.get("description", ""),
                                "parameters": t.get("inputSchema", t.get("parameters", {"type": "object", "properties": {}})),
                                "type": "mcp_server",
                                "mcp_server_id": srv.id,
                                "mcp_server_name": srv.name
                            })

                        skill_name = f"mcp_{srv.name}"
                        tenant_skills[skill_name] = {
                            "name": skill_name,
                            "description": f"External MCP Server: {srv.name} (Transport: {srv.transport})",
                            "tools": tools_def,
                            "body": f"Skill auto-generated from external MCP Server {srv.name}.",
                            "source": "mcp_server",
                            "mcp_server_id": srv.id,
                            "tenant_id": srv.tenant_id,
                            "tenant_name": srv.tenant.name if srv.tenant else "Global",
                            "created_at": srv.created_at.timestamp() if srv.created_at else 0.0
                        }
                    except Exception as ex:
                        print(f"Error loading tools for MCP server {srv.name}: {ex}")
            except Exception as e:
                # Table might not exist yet during fresh database creation
                print(f"Database warning: MCP servers could not be loaded: {e}")
            finally:
                if should_close:
                    db.close()

        self.skills_by_tenant[tenant_key] = tenant_skills

    def list_skills(self, tenant_id=None) -> list:
        skills = self.get_skills_dict(tenant_id)
        result = []
        for name, data in skills.items():
            result.append({
                "name": name,
                "description": data.get("description", ""),
                "tools_count": len(data.get("tools", [])),
                "source": data.get("source", "file"),
                "db_id": data.get("db_id"),
                "tenant_id": data.get("tenant_id"),
                "tenant_name": data.get("tenant_name") or "Global",
                "created_at": data.get("created_at", 0.0)
            })
        return result

    def get_openai_tools(self, allowed_skills: list = None, tenant_id=None) -> list:
        skills = self.get_skills_dict(tenant_id)
        openai_tools = []
        for skill_name, data in skills.items():
            if allowed_skills is not None and len(allowed_skills) > 0 and skill_name not in allowed_skills:
                continue
            tools = data.get("tools") or []
            for tool in tools:
                tool_name = tool.get("name")
                desc = tool.get("description") or f"Tool {tool_name} from skill {skill_name}"
                params = tool.get("parameters")
                if not isinstance(params, dict):
                    params = {
                        "type": "object",
                        "properties": {}
                    }
                elif "type" not in params:
                    params["type"] = "object"
                if "properties" not in params:
                    params["properties"] = {}

                # Register tool function schema for OpenAI
                openai_tools.append({
                    "type": "function",
                    "function": {
                        "name": f"{skill_name}__{tool_name}",
                        "description": desc,
                        "parameters": params
                    }
                })
        return openai_tools

    def find_tool(self, full_tool_name: str, tenant_id=None) -> tuple:
        skills = self.get_skills_dict(tenant_id)
        if "__" in full_tool_name:
            skill_name, tool_name = full_tool_name.split("__", 1)
            skill = skills.get(skill_name)
            if skill:
                for tool in skill.get("tools", []):
                    if tool.get("name") == tool_name:
                        return skill_name, tool
        return None, None

    def get_system_instructions(self, allowed_skills: list = None, tenant_id=None) -> str:
        skills = self.get_skills_dict(tenant_id)
        system_skill = skills.get("system")
        if system_skill and system_skill.get("body"):
            instructions = [system_skill.get("body").strip() + "\n"]
        else:
            instructions = ["You are AI Skill Engine, an enterprise chatbot equipped with advanced tools and skills.\n"]

        instructions.append("Active Available Skills:\n")
        for name, data in skills.items():
            if name == "system":
                continue
            if allowed_skills is not None and len(allowed_skills) > 0 and name not in allowed_skills:
                continue
            instructions.append(f"### Skill: {name} (Source: {data.get('source', 'file')})")
            instructions.append(f"Description: {data.get('description', '')}")
            if data.get('body'):
                instructions.append(f"Instructions:\n{data.get('body')}\n")
        return "\n".join(instructions)

skill_registry = SkillRegistry()
