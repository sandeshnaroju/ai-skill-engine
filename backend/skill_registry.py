import os
import glob
import yaml

class SkillRegistry:
    def __init__(self, skills_dir: str = None):
        if not skills_dir:
            skills_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "skills")
        self.skills_dir = skills_dir
        self.skills = {}
        self.file_skills_cache = {}
        self.file_mtimes = {}
        self.reload_skills()

    def reload_skills(self, db=None):
        self.skills = {}

        # 1. Load File-based default skills from skills/ directory
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
                self.skills[skill_name] = metadata
            except Exception as e:
                print(f"Error loading skill file {filepath}: {e}")

        # Evict deleted files from cache
        for path in list(self.file_skills_cache.keys()):
            if path not in current_filepaths:
                self.file_skills_cache.pop(path, None)
                self.file_mtimes.pop(path, None)

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
            # 2. Load DB-backed dynamic custom skills from database
            try:
                from models import CustomSkill
                db_skills = db.query(CustomSkill).filter(CustomSkill.is_active == True).all()
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

                        skill_name = metadata.get("name") or dbs.name
                        metadata["body"] = markdown_body
                        metadata["source"] = "database"
                        metadata["db_id"] = dbs.id
                        metadata["content"] = dbs.content
                        metadata["created_at"] = dbs.created_at.timestamp() if dbs.created_at else 0.0
                        self.skills[skill_name] = metadata
                    except Exception as e:
                        print(f"Error parsing DB custom skill {dbs.name}: {e}")
            except Exception as e:
                # Table might not exist yet during fresh database creation
                print(f"Database warning: Custom skills could not be loaded (table might not exist yet): {e}")

            # 3. Load tools from registered active MCP Servers
            try:
                from models import McpServer
                from mcp_manager import mcp_manager
                mcp_servers = db.query(McpServer).filter(McpServer.is_active == True).all()
                for srv in mcp_servers:
                    try:
                        discovered_tools = mcp_manager.list_tools(srv)
                        tools_def = []
                        for t in discovered_tools:
                            tools_def.append({
                                "name": t.get("name"),
                                "description": t.get("description", ""),
                                "parameters": t.get("inputSchema", {"type": "object", "properties": {}}),
                                "type": "mcp_server",
                                "mcp_server_id": srv.id,
                                "mcp_server_name": srv.name
                            })
                        
                        skill_name = f"mcp_{srv.name}"
                        self.skills[skill_name] = {
                            "name": skill_name,
                            "description": f"External MCP Server: {srv.name} (Transport: {srv.transport})",
                            "tools": tools_def,
                            "body": f"Skill auto-generated from external MCP Server {srv.name}.",
                            "source": "mcp_server",
                            "mcp_server_id": srv.id,
                            "created_at": srv.created_at.timestamp() if srv.created_at else 0.0
                        }
                    except Exception as ex:
                        print(f"Error loading tools for MCP server {srv.name}: {ex}")
            except Exception as e:
                # Table might not exist yet during fresh database creation
                print(f"Database warning: MCP servers could not be loaded (table might not exist yet): {e}")
            finally:
                if should_close:
                    db.close()

    def list_skills(self) -> list:
        result = []
        for name, data in self.skills.items():
            result.append({
                "name": name,
                "description": data.get("description", ""),
                "tools_count": len(data.get("tools", [])),
                "source": data.get("source", "file"),
                "db_id": data.get("db_id"),
                "created_at": data.get("created_at", 0.0)
            })
        return result

    def get_openai_tools(self, allowed_skills: list = None) -> list:
        openai_tools = []
        for skill_name, data in self.skills.items():
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

    def find_tool(self, full_tool_name: str) -> tuple:
        if "__" in full_tool_name:
            skill_name, tool_name = full_tool_name.split("__", 1)
            skill = self.skills.get(skill_name)
            if skill:
                for tool in skill.get("tools", []):
                    if tool.get("name") == tool_name:
                        return skill_name, tool
        return None, None

    def get_system_instructions(self, allowed_skills: list = None) -> str:
        instructions = ["You are skill_manager, an enterprise server assistant equipped with business skills and tools.\n"]
        instructions.append("Active Available Skills:\n")
        for name, data in self.skills.items():
            if allowed_skills is not None and len(allowed_skills) > 0 and name not in allowed_skills:
                continue
            instructions.append(f"### Skill: {name} (Source: {data.get('source', 'file')})")
            instructions.append(f"Description: {data.get('description', '')}")
            if data.get('body'):
                instructions.append(f"Instructions:\n{data.get('body')}\n")
        return "\n".join(instructions)

skill_registry = SkillRegistry()
