
def run_send_email_tool(db, args: dict, tenant) -> dict:
    import time
    start_time = time.time()
    
    to_email = args.get("to_email")
    subject = args.get("subject")
    body = args.get("body")
    
    if not to_email or not subject or not body:
        return {
            "stdout": "",
            "stderr": "Error: to_email, subject, and body are required parameters.",
            "exit_code": 1,
            "execution_time_ms": int((time.time() - start_time) * 1000),
            "sandbox_type": "host"
        }
        
    if not tenant:
        return {
            "stdout": "",
            "stderr": "Error: No tenant context provided to execute SMTP emailing.",
            "exit_code": 1,
            "execution_time_ms": int((time.time() - start_time) * 1000),
            "sandbox_type": "host"
        }
        
    from models import EmailConfig
    from encryption_utils import decrypt_key
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    
    config = db.query(EmailConfig).filter(EmailConfig.tenant_id == tenant.id).first()
    if not config:
        return {
            "stdout": "",
            "stderr": "Error: SMTP configuration has not been set up for this tenant. Please visit Email Configuration settings in the dashboard.",
            "exit_code": 1,
            "execution_time_ms": int((time.time() - start_time) * 1000),
            "sandbox_type": "host"
        }
        
    password = None
    if config.smtp_password_encrypted:
        try:
            password = decrypt_key(config.smtp_password_encrypted)
        except Exception as e:
            return {
                "stdout": "",
                "stderr": f"Error decrypting SMTP password: {str(e)}",
                "exit_code": 1,
                "execution_time_ms": int((time.time() - start_time) * 1000),
                "sandbox_type": "host"
            }
            
    try:
        msg = MIMEMultipart()
        msg['From'] = config.sender_email
        msg['To'] = to_email
        msg['Subject'] = subject
        is_html = any(tag in body.lower() for tag in ["<html", "<body", "<div", "<p", "<span", "<table", "<h1", "<h2", "<h3", "<ul", "<ol", "<li", "<br", "<a ", "<p>"])
        msg.attach(MIMEText(body, "html" if is_html else "plain"))
        
        if config.use_ssl:
            server = smtplib.SMTP_SSL(config.smtp_host, config.smtp_port, timeout=12)
        else:
            server = smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=12)
            if config.use_tls:
                server.starttls()
                
        if config.smtp_username:
            server.login(config.smtp_username, password)
            
        server.sendmail(config.sender_email, to_email, msg.as_string())
        server.quit()
        
        return {
            "stdout": f"Email successfully sent to {to_email} with subject: '{subject}'",
            "stderr": "",
            "exit_code": 0,
            "execution_time_ms": int((time.time() - start_time) * 1000),
            "sandbox_type": "host"
        }
    except Exception as e:
        return {
            "stdout": "",
            "stderr": f"SMTP delivery failed: {str(e)}",
            "exit_code": 1,
            "execution_time_ms": int((time.time() - start_time) * 1000),
            "sandbox_type": "host"
        }

def run_upload_to_storage_tool(db, args: dict, tenant) -> dict:
    filename = args.get("filename")
    if not filename:
        return {"stdout": "", "stderr": "Error: filename is required.", "exit_code": 1, "execution_time_ms": 0, "sandbox_type": "host"}
        
    import os
    import time
    from storage import get_storage_backend, OUTPUT_DIR, UPLOAD_DIR
    
    start_time = time.time()
    tenant_name = tenant.name if tenant else "default"
    
    local_path = None
    for directory in (OUTPUT_DIR, UPLOAD_DIR):
        p = os.path.join(directory, tenant_name, filename)
        if os.path.exists(p):
            local_path = p
            break
        for folder in ("", "default"):
            p = os.path.join(directory, folder, filename) if folder else os.path.join(directory, filename)
            if os.path.exists(p):
                local_path = p
                break
        if local_path:
            break
            
    if not local_path or not os.path.exists(local_path):
        return {"stdout": "", "stderr": f"Error: File '{filename}' not found.", "exit_code": 1, "execution_time_ms": int((time.time() - start_time) * 1000), "sandbox_type": "host"}
        
    try:
        backend = get_storage_backend(db, tenant_id=tenant.id if tenant else None)
        with open(local_path, "rb") as f:
            data = f.read()
        cloud_url = backend.upload(filename, data, "application/octet-stream", tenant_name=tenant_name)
        elapsed_ms = int((time.time() - start_time) * 1000)
        return {
            "stdout": f"File '{filename}' successfully uploaded to storage. URL: {cloud_url}",
            "stderr": "",
            "exit_code": 0,
            "execution_time_ms": elapsed_ms,
            "sandbox_type": "host",
            "generated_files": [{
                "filename": filename,
                "original_name": filename,
                "url": cloud_url,
                "sandbox_path": f"sandbox/outputs/{tenant_name}/{filename}"
            }]
        }
    except Exception as e:
        return {"stdout": "", "stderr": f"Error uploading file: {str(e)}", "exit_code": 1, "execution_time_ms": int((time.time() - start_time) * 1000), "sandbox_type": "host"}

def run_download_from_storage_tool(db, args: dict, tenant) -> dict:
    filename = args.get("filename")
    if not filename:
        return {"stdout": "", "stderr": "Error: filename is required.", "exit_code": 1, "execution_time_ms": 0, "sandbox_type": "host"}
        
    import os
    import time
    from storage import get_storage_backend, UPLOAD_DIR
    
    start_time = time.time()
    tenant_name = tenant.name if tenant else "default"
    local_path = os.path.join(UPLOAD_DIR, tenant_name, filename)
    
    try:
        backend = get_storage_backend(db, tenant_id=tenant.id if tenant else None)
        if not hasattr(backend, "download"):
            return {"stdout": "", "stderr": "Error: Active backend does not support download.", "exit_code": 1, "execution_time_ms": int((time.time() - start_time) * 1000), "sandbox_type": "host"}
            
        data = backend.download(filename, tenant_name=tenant_name)
        if not data:
            return {"stdout": "", "stderr": f"Error: File '{filename}' not found in cloud storage.", "exit_code": 1, "execution_time_ms": int((time.time() - start_time) * 1000), "sandbox_type": "host"}
            
        tenant_upload_dir = os.path.join(UPLOAD_DIR, tenant_name)
        os.makedirs(tenant_upload_dir, exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(data)
            
        elapsed_ms = int((time.time() - start_time) * 1000)
        return {
            "stdout": f"File '{filename}' successfully downloaded to local sandbox path sandbox/uploads/{tenant_name}/{filename}",
            "stderr": "",
            "exit_code": 0,
            "execution_time_ms": elapsed_ms,
            "sandbox_type": "host"
        }
    except Exception as e:
        return {"stdout": "", "stderr": f"Error downloading file: {str(e)}", "exit_code": 1, "execution_time_ms": int((time.time() - start_time) * 1000), "sandbox_type": "host"}

def run_download_public_file_tool(db, args: dict, tenant) -> dict:
    url = args.get("url")
    filename = args.get("filename")
    if not url or not filename:
        return {"stdout": "", "stderr": "Error: Both url and filename are required.", "exit_code": 1, "execution_time_ms": 0, "sandbox_type": "host"}
        
    import os
    import time
    import urllib.request
    from storage import UPLOAD_DIR
    
    start_time = time.time()
    tenant_name = tenant.name if tenant else "default"
    local_path = os.path.join(UPLOAD_DIR, tenant_name, filename)
    
    try:
        tenant_upload_dir = os.path.join(UPLOAD_DIR, tenant_name)
        os.makedirs(tenant_upload_dir, exist_ok=True)
        
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            data = response.read()
            
        with open(local_path, "wb") as f:
            f.write(data)
            
        elapsed_ms = int((time.time() - start_time) * 1000)
        return {
            "stdout": f"Successfully downloaded public file to sandbox/uploads/{tenant_name}/{filename}",
            "stderr": "",
            "exit_code": 0,
            "execution_time_ms": elapsed_ms,
            "sandbox_type": "host"
        }
    except Exception as e:
        return {"stdout": "", "stderr": f"Error downloading public file: {str(e)}", "exit_code": 1, "execution_time_ms": int((time.time() - start_time) * 1000), "sandbox_type": "host"}

def map_local_generated_files_to_tenant(exec_res: dict, tenant_name: str = "default") -> dict:
    generated_files = exec_res.get("generated_files", [])
    if not generated_files:
        return exec_res
    import os
    from storage import OUTPUT_DIR
    for f in generated_files:
        old_path = os.path.join(OUTPUT_DIR, f["filename"])
        if os.path.exists(old_path):
            tenant_output_dir = os.path.join(OUTPUT_DIR, tenant_name)
            os.makedirs(tenant_output_dir, exist_ok=True)
            new_path = os.path.join(tenant_output_dir, f["filename"])
            os.rename(old_path, new_path)
            f["url"] = f"/api/v1/files/download/{tenant_name}/{f['filename']}"
            f["sandbox_path"] = f"sandbox/outputs/{tenant_name}/{f['filename']}"
    return exec_res

def run_list_sandbox_files(db, session_id: str, tenant_id: str = None):
    from models import SandboxConfig
    from encryption_utils import decrypt_key
    from sandbox.remote_runner import remote_runner
    from sqlalchemy import or_
    import os
    
    if tenant_id:
        config = db.query(SandboxConfig).filter(
            SandboxConfig.is_active == True,
            or_(SandboxConfig.tenant_id == tenant_id, SandboxConfig.tenant_id == None)
        ).first()
    else:
        config = db.query(SandboxConfig).filter(SandboxConfig.is_active == True, SandboxConfig.tenant_id == None).first()

    if config and config.provider == "azure":
        client_id = decrypt_key(config.azure_client_id_encrypted)
        client_secret = decrypt_key(config.azure_client_secret_encrypted)
        t_id = decrypt_key(config.azure_tenant_id_encrypted)
        pool_endpoint = config.azure_session_pool_endpoint
        if client_id and client_secret and t_id and pool_endpoint:
            try:
                files = remote_runner.list_files_azure(client_id, client_secret, t_id, pool_endpoint, session_id)
                stdout = "Files in Azure ACA Sandbox:\n" + "\n".join([f"- {f['filename']} ({f['size']} bytes, modified {f['last_modified']})" for f in files])
                return {"stdout": stdout, "stderr": "", "exit_code": 0, "sandbox_type": "azure_aca"}
            except Exception as e:
                return {"stdout": "", "stderr": f"Failed to list sandbox files: {str(e)}", "exit_code": 1, "sandbox_type": "azure_aca"}
    
    # Fallback/Local list
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    outputs_dir = os.path.join(base_dir, "sandbox", "outputs")
    os.makedirs(outputs_dir, exist_ok=True)
    files = os.listdir(outputs_dir)
    stdout = "Files in local outputs folder:\n" + "\n".join([f"- {f}" for f in files])
    return {"stdout": stdout, "stderr": "", "exit_code": 0, "sandbox_type": "process"}


def run_download_sandbox_file(db, session_id: str, args: dict, tenant_id: str = None):
    from models import SandboxConfig
    from encryption_utils import decrypt_key
    from sandbox.remote_runner import remote_runner
    from sqlalchemy import or_
    import os
    import uuid
    
    filename = args.get("filename")
    if not filename:
        return {"stdout": "", "stderr": "Error: filename is required", "exit_code": 1, "sandbox_type": "process"}
        
    if tenant_id:
        config = db.query(SandboxConfig).filter(
            SandboxConfig.is_active == True,
            or_(SandboxConfig.tenant_id == tenant_id, SandboxConfig.tenant_id == None)
        ).first()
    else:
        config = db.query(SandboxConfig).filter(SandboxConfig.is_active == True, SandboxConfig.tenant_id == None).first()

    if config and config.provider == "azure":
        client_id = decrypt_key(config.azure_client_id_encrypted)
        client_secret = decrypt_key(config.azure_client_secret_encrypted)
        t_id = decrypt_key(config.azure_tenant_id_encrypted)
        pool_endpoint = config.azure_session_pool_endpoint
        if client_id and client_secret and t_id and pool_endpoint:
            try:
                content = remote_runner.download_file_azure(client_id, client_secret, t_id, pool_endpoint, session_id, filename)
                from storage import OUTPUT_DIR
                unique_name = f"{uuid.uuid4().hex}_{filename}"
                os.makedirs(OUTPUT_DIR, exist_ok=True)
                
                with open(os.path.join(OUTPUT_DIR, unique_name), "wb") as f:
                    f.write(content)
                    
                download_url = f"/api/v1/files/download/{unique_name}"
                stdout = f"Successfully downloaded file. Available locally at: {download_url}"
                generated_files = [{
                    "filename": unique_name,
                    "original_name": filename,
                    "url": download_url,
                    "sandbox_path": f"sandbox/outputs/{unique_name}"
                }]
                return {"stdout": stdout, "stderr": "", "exit_code": 0, "sandbox_type": "azure_aca", "generated_files": generated_files}
            except Exception as e:
                return {"stdout": "", "stderr": f"Failed to download file from sandbox: {str(e)}", "exit_code": 1, "sandbox_type": "azure_aca"}
                
    # Local fallback
    return {"stdout": f"File {filename} is already present locally.", "stderr": "", "exit_code": 0, "sandbox_type": "process"}


def run_upload_sandbox_file(db, session_id: str, args: dict, tenant_id: str = None):
    from models import SandboxConfig
    from encryption_utils import decrypt_key
    from sandbox.remote_runner import remote_runner
    from sqlalchemy import or_
    import os
    
    local_path = args.get("local_path")
    if not local_path:
        return {"stdout": "", "stderr": "Error: local_path is required", "exit_code": 1, "sandbox_type": "process"}
        
    if not os.path.exists(local_path):
        return {"stdout": "", "stderr": f"Error: Local file {local_path} does not exist.", "exit_code": 1, "sandbox_type": "process"}
        
    filename = os.path.basename(local_path)
    with open(local_path, "rb") as f:
        content = f.read()
        
    if tenant_id:
        config = db.query(SandboxConfig).filter(
            SandboxConfig.is_active == True,
            or_(SandboxConfig.tenant_id == tenant_id, SandboxConfig.tenant_id == None)
        ).first()
    else:
        config = db.query(SandboxConfig).filter(SandboxConfig.is_active == True, SandboxConfig.tenant_id == None).first()

    if config and config.provider == "azure":
        client_id = decrypt_key(config.azure_client_id_encrypted)
        client_secret = decrypt_key(config.azure_client_secret_encrypted)
        t_id = decrypt_key(config.azure_tenant_id_encrypted)
        pool_endpoint = config.azure_session_pool_endpoint
        if client_id and client_secret and t_id and pool_endpoint:
            try:
                remote_runner.upload_file_azure(client_id, client_secret, t_id, pool_endpoint, session_id, filename, content)
                return {"stdout": f"Successfully uploaded {filename} to Azure ACA Sandbox workspace.", "stderr": "", "exit_code": 0, "sandbox_type": "azure_aca"}
            except Exception as e:
                return {"stdout": "", "stderr": f"Failed to upload file to sandbox: {str(e)}", "exit_code": 1, "sandbox_type": "azure_aca"}
    return {"stdout": f"Uploaded {filename} to local sandbox workspace.", "stderr": "", "exit_code": 0, "sandbox_type": "process"}
