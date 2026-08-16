"""
storage.py — Pluggable file storage backend.

Supports:
  - LocalStorage  : saves to sandbox/uploads/ on disk, serves via /api/v1/files/download/
  - S3Storage     : uploads to AWS S3 (or S3-compatible), returns pre-signed or public URL
  - AzureStorage  : uploads to Azure Blob Storage, returns SAS or public blob URL

Usage:
    from storage import get_storage_backend
    backend = get_storage_backend(db)
    url = backend.upload(filename, file_bytes, content_type)
"""

import os
import uuid
import logging
from abc import ABC, abstractmethod
from typing import Optional

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# Base interface
# ─────────────────────────────────────────────

class StorageBackend(ABC):
    @abstractmethod
    def upload(self, filename: str, data: bytes, content_type: str = "application/octet-stream", tenant_name: str = "default") -> str:
        """Upload bytes and return the public/downloadable URL."""

    @abstractmethod
    def download(self, filename: str, tenant_name: str = "default") -> Optional[bytes]:
        """Download bytes of an existing file (None if not found)."""

    @abstractmethod
    def get_download_url(self, filename: str, tenant_name: str = "default") -> Optional[str]:
        """Return a download URL for an existing file (None if not found)."""

    @abstractmethod
    def delete(self, filename: str, tenant_name: str = "default") -> None:
        """Delete a file (best-effort, no exception on miss)."""


# ─────────────────────────────────────────────
# Local disk storage (default fallback)
# ─────────────────────────────────────────────

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "sandbox", "uploads"))
OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "sandbox", "outputs"))


class LocalStorage(StorageBackend):
    def upload(self, filename: str, data: bytes, content_type: str = "application/octet-stream", tenant_name: str = "default") -> str:
        import urllib.parse
        tenant_upload_dir = os.path.join(UPLOAD_DIR, tenant_name)
        os.makedirs(tenant_upload_dir, exist_ok=True)
        file_path = os.path.join(tenant_upload_dir, filename)
        with open(file_path, "wb") as f:
            f.write(data)
        return f"/api/v1/files/download/{urllib.parse.quote(tenant_name)}/{urllib.parse.quote(filename)}"

    def download(self, filename: str, tenant_name: str = "default") -> Optional[bytes]:
        for directory in (UPLOAD_DIR, OUTPUT_DIR):
            path = os.path.join(directory, tenant_name, filename)
            if os.path.exists(path):
                with open(path, "rb") as f:
                    return f.read()
        return None

    def get_download_url(self, filename: str, tenant_name: str = "default") -> Optional[str]:
        import urllib.parse
        for directory in (UPLOAD_DIR, OUTPUT_DIR):
            path = os.path.join(directory, tenant_name, filename)
            if os.path.exists(path):
                return f"/api/v1/files/download/{urllib.parse.quote(tenant_name)}/{urllib.parse.quote(filename)}"
        return None

    def delete(self, filename: str, tenant_name: str = "default") -> None:
        for directory in (UPLOAD_DIR, OUTPUT_DIR):
            path = os.path.join(directory, tenant_name, filename)
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception as e:
                    logger.warning(f"LocalStorage.delete failed for {path}: {e}")


# ─────────────────────────────────────────────
# AWS S3 storage
# ─────────────────────────────────────────────

class S3Storage(StorageBackend):
    def __init__(
        self,
        bucket_name: str,
        region: str,
        access_key: str,
        secret_key: str,
        endpoint_url: Optional[str] = None,
        use_presigned: bool = True,
        presigned_expires: int = 3600,
    ):
        try:
            import boto3
            from botocore.exceptions import NoCredentialsError
        except ImportError:
            raise RuntimeError("boto3 is required for S3 storage. Run: pip install boto3")

        self.bucket_name = bucket_name
        self.region = region
        self.use_presigned = use_presigned
        self.presigned_expires = presigned_expires

        kwargs = {
            "aws_access_key_id": access_key,
            "aws_secret_access_key": secret_key,
            "region_name": region,
        }
        if endpoint_url:
            kwargs["endpoint_url"] = endpoint_url

        import boto3
        self.client = boto3.client("s3", **kwargs)
        self._endpoint_url = endpoint_url

    def upload(self, filename: str, data: bytes, content_type: str = "application/octet-stream", tenant_name: str = "default") -> str:
        key = f"{tenant_name}/{filename}"
        self.client.put_object(
            Bucket=self.bucket_name,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return self.get_download_url(filename, tenant_name)

    def download(self, filename: str, tenant_name: str = "default") -> Optional[bytes]:
        key = f"{tenant_name}/{filename}"
        try:
            resp = self.client.get_object(Bucket=self.bucket_name, Key=key)
            return resp["Body"].read()
        except Exception as e:
            logger.warning(f"S3Storage.download failed for {key}: {e}")
            return None

    def get_download_url(self, filename: str, tenant_name: str = "default") -> str:
        import urllib.parse
        key = f"{tenant_name}/{filename}"
        if self.use_presigned:
            return self.client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket_name, "Key": key},
                ExpiresIn=self.presigned_expires,
            )
        else:
            # Public URL format
            quoted_key = urllib.parse.quote(key)
            if self._endpoint_url:
                return f"{self._endpoint_url.rstrip('/')}/{self.bucket_name}/{quoted_key}"
            return f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{quoted_key}"

    def delete(self, filename: str, tenant_name: str = "default") -> None:
        key = f"{tenant_name}/{filename}"
        try:
            self.client.delete_object(Bucket=self.bucket_name, Key=key)
        except Exception as e:
            logger.warning(f"S3Storage.delete failed for {key}: {e}")

    def test_connection(self) -> dict:
        """Upload and delete a tiny test object to verify connectivity."""
        test_key = f"_connection_test_{uuid.uuid4().hex}.txt"
        try:
            self.client.put_object(Bucket=self.bucket_name, Key=test_key, Body=b"ok", ContentType="text/plain")
            self.client.delete_object(Bucket=self.bucket_name, Key=test_key)
            return {"success": True, "message": "Successfully connected to S3 bucket."}
        except Exception as e:
            return {"success": False, "message": str(e)}


# ─────────────────────────────────────────────
# Azure Blob Storage
# ─────────────────────────────────────────────

class AzureStorage(StorageBackend):
    def __init__(
        self,
        account_name: str,
        account_key: str,
        container_name: str,
        use_presigned: bool = True,
        presigned_expires: int = 3600,
    ):
        try:
            from azure.storage.blob import BlobServiceClient
        except ImportError:
            raise RuntimeError(
                "azure-storage-blob is required for Azure storage. Run: pip install azure-storage-blob"
            )

        self.account_name = account_name
        self.account_key = account_key
        self.container_name = container_name
        self.use_presigned = use_presigned
        self.presigned_expires = presigned_expires

        from azure.storage.blob import BlobServiceClient
        conn_str = (
            f"DefaultEndpointsProtocol=https;"
            f"AccountName={account_name};"
            f"AccountKey={account_key};"
            f"EndpointSuffix=core.windows.net"
        )
        self.service_client = BlobServiceClient.from_connection_string(conn_str)
        self.container_client = self.service_client.get_container_client(container_name)

        if container_name:
            from azure.core.exceptions import ResourceExistsError
            try:
                self.container_client.create_container()
            except ResourceExistsError:
                pass
            except Exception as e:
                logger.warning(f"Could not check/create Azure container '{container_name}': {e}")

    def upload(self, filename: str, data: bytes, content_type: str = "application/octet-stream", tenant_name: str = "default") -> str:
        blob_name = f"{tenant_name}/{filename}"
        blob_client = self.container_client.get_blob_client(blob_name)
        blob_client.upload_blob(data, overwrite=True, content_settings=self._content_settings(content_type))
        return self.get_download_url(filename, tenant_name)

    def download(self, filename: str, tenant_name: str = "default") -> Optional[bytes]:
        blob_name = f"{tenant_name}/{filename}"
        try:
            blob_client = self.container_client.get_blob_client(blob_name)
            return blob_client.download_blob().readall()
        except Exception as e:
            logger.warning(f"AzureStorage.download failed for {blob_name}: {e}")
            return None

    def _content_settings(self, content_type: str):
        from azure.storage.blob import ContentSettings
        return ContentSettings(content_type=content_type)

    def get_download_url(self, filename: str, tenant_name: str = "default") -> str:
        import urllib.parse
        blob_name = f"{tenant_name}/{filename}"
        quoted_blob_name = urllib.parse.quote(blob_name)
        if self.use_presigned:
            from azure.storage.blob import generate_blob_sas, BlobSasPermissions
            from datetime import datetime, timedelta

            sas_token = generate_blob_sas(
                account_name=self.account_name,
                container_name=self.container_name,
                blob_name=blob_name,
                account_key=self.account_key,
                permission=BlobSasPermissions(read=True),
                expiry=datetime.utcnow() + timedelta(seconds=self.presigned_expires),
            )
            return (
                f"https://{self.account_name}.blob.core.windows.net/"
                f"{self.container_name}/{quoted_blob_name}?{sas_token}"
            )
        else:
            return (
                f"https://{self.account_name}.blob.core.windows.net/"
                f"{self.container_name}/{quoted_blob_name}"
            )

    def delete(self, filename: str, tenant_name: str = "default") -> None:
        blob_name = f"{tenant_name}/{filename}"
        try:
            blob_client = self.container_client.get_blob_client(blob_name)
            blob_client.delete_blob()
        except Exception as e:
            logger.warning(f"AzureStorage.delete failed for {blob_name}: {e}")

    def test_connection(self) -> dict:
        test_key = f"_connection_test_{uuid.uuid4().hex}.txt"
        try:
            blob_client = self.container_client.get_blob_client(test_key)
            blob_client.upload_blob(b"ok", overwrite=True)
            blob_client.delete_blob()
            return {"success": True, "message": "Successfully connected to Azure Blob container."}
        except Exception as e:
            return {"success": False, "message": str(e)}


# ─────────────────────────────────────────────
# Factory — reads active config from DB
# ─────────────────────────────────────────────

def get_storage_backend(db=None, tenant_id=None) -> StorageBackend:
    """
    Return the active StorageBackend based on the persisted StorageConfig.
    Falls back to LocalStorage if no config or provider == 'local'.
    """
    if db is None:
        return LocalStorage()

    try:
        from models import StorageConfig
        from encryption_utils import decrypt_key as decrypt_value
        from sqlalchemy import or_

        if tenant_id:
            config = db.query(StorageConfig).filter(
                StorageConfig.is_active == True,
                or_(StorageConfig.tenant_id == tenant_id, StorageConfig.tenant_id == None)
            ).first()
        else:
            config = db.query(StorageConfig).filter(StorageConfig.is_active == True, StorageConfig.tenant_id == None).first()

        if not config or config.provider == "local":
            return LocalStorage()

        if config.provider == "s3":
            return S3Storage(
                bucket_name=config.bucket_name or "",
                region=config.region or "us-east-1",
                access_key=decrypt_value(config.access_key_encrypted) if config.access_key_encrypted else "",
                secret_key=decrypt_value(config.secret_key_encrypted) if config.secret_key_encrypted else "",
                endpoint_url=config.endpoint_url or None,
                use_presigned=config.use_presigned_urls,
                presigned_expires=config.presigned_url_expires_seconds or 3600,
            )

        if config.provider == "azure":
            return AzureStorage(
                account_name=decrypt_value(config.account_name_encrypted) if config.account_name_encrypted else "",
                account_key=decrypt_value(config.account_key_encrypted) if config.account_key_encrypted else "",
                container_name=config.container_name or "",
                use_presigned=config.use_presigned_urls,
                presigned_expires=config.presigned_url_expires_seconds or 3600,
            )

    except Exception as e:
        logger.error(f"Failed to load storage config from DB, falling back to local: {e}")

    return LocalStorage()
