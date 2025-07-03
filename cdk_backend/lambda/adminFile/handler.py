import json
import os
import urllib.parse
from base64 import b64decode, b64encode
from datetime import datetime

import boto3
from botocore.exceptions import ClientError

# ──────────────────────────────────────────────────────────────────────────────
#  AWS clients & env
# ──────────────────────────────────────────────────────────────────────────────
s3            = boto3.client("s3")
bedrock_agent = boto3.client("bedrock-agent")

BUCKET_NAME       = os.environ["BUCKET_NAME"]
KNOWLEDGE_BASE_ID = os.environ["KNOWLEDGE_BASE_ID"]
DATA_SOURCE_ID    = os.environ["DATA_SOURCE_ID"]

# ──────────────────────────────────────────────────────────────────────────────
#  CORS
# ──────────────────────────────────────────────────────────────────────────────
CORS_HEADERS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": (
        "Content-Type,Authorization,X-Amz-Date,"
        "X-Api-Key,X-Amz-Security-Token"
    ),
    "Access-Control-Max-Age": "600",
}


def log(*msg):
    """Single helper so every line starts the same."""
    print("[FILE-API]", *msg)


def respond(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body),
    }


# ──────────────────────────────────────────────────────────────────────────────
#  Helpers
# ──────────────────────────────────────────────────────────────────────────────
def _extract_key(raw_path: str, path_parameters: dict) -> str:
    """Handle /files/{proxy+} or /files/{key} transparently."""
    if path_parameters:
        # REST API → parameter name is either "proxy" (recommended) or "key"
        key = path_parameters.get("proxy") or path_parameters.get("key") or ""
        log("path_parameters key   :", key)
        return urllib.parse.unquote_plus(key)

    # HTTP API v2 – we only get raw_path
    key = raw_path.split("/files/")[1]
    log("raw_path key fragment   :", key)
    return urllib.parse.unquote_plus(key)


# ──────────────────────────────────────────────────────────────────────────────
#  Lambda entry-point
# ──────────────────────────────────────────────────────────────────────────────
def lambda_handler(event, context):
    log("==== NEW INVOCATION =============================================")
    log("Incoming event keys        :", list(event.keys()))
    log("Resource                   :", event.get("resource"))
    log("Path                       :", event.get("path") or event.get("rawPath"))

    # ── Detect API flavour ────────────────────────────────────────────────
    if "httpMethod" in event:      # REST API
        http_method     = event["httpMethod"]
        raw_path        = event["path"]
        path_parameters = event.get("pathParameters") or {}
    else:                          # HTTP API v2
        http_method     = event["requestContext"]["http"]["method"]
        raw_path        = event["rawPath"]
        path_parameters = event.get("pathParameters") or {}

    log("HTTP method                :", http_method)
    log("Path parameters            :", path_parameters)

    # ── Quick CORS pre-flight ─────────────────────────────────────────────
    if http_method == "OPTIONS":
        log("OPTIONS pre-flight → 200")
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    # ── Route dispatch ───────────────────────────────────────────────────
    try:
        if raw_path == "/files" and http_method == "GET":
            return handle_list_files()

        if raw_path == "/files" and http_method == "POST":
            out = handle_upload_file(event)
            sync_knowledge_base()
            return out

        if raw_path.startswith("/files/") and http_method == "GET":
            return handle_download_file(raw_path, path_parameters)

        if raw_path.startswith("/files/") and http_method == "DELETE":
            out = handle_delete_file(raw_path, path_parameters)
            sync_knowledge_base()
            return out

        if raw_path == "/sync" and http_method == "POST":
            sync_result = sync_knowledge_base()
            return respond(200, {"message": "KB sync kicked off", **sync_result})

        log("No matching route")
        return respond(404, {"error": "Route not found"})

    except Exception as exc:
        log("UNHANDLED EXCEPTION:", exc)
        return respond(500, {"error": str(exc)})


# ──────────────────────────────────────────────────────────────────────────────
#  Route handlers
# ──────────────────────────────────────────────────────────────────────────────
def sync_knowledge_base():
    log("KB sync → start_ingestion_job()")
    try:
        response = bedrock_agent.start_ingestion_job(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            dataSourceId=DATA_SOURCE_ID,
        )
        job_id = response.get("ingestionJobId")
        log("KB sync job id            :", job_id)
        return {"status": "success", "jobId": job_id}
    except Exception as exc:
        log("KB sync ERROR             :", exc)
        return {"status": "error", "message": str(exc)}


def handle_list_files():
    log("LIST files in bucket       :", BUCKET_NAME)
    try:
        objects = s3.list_objects_v2(Bucket=BUCKET_NAME)
        log("S3 returned #keys          :", objects.get("KeyCount", 0))

        files = [
            {
                "key": obj["Key"],
                "size": obj["Size"],
                "last_modified": obj["LastModified"].isoformat(),
                "actions": {
                    "download": {"method": "GET", "endpoint": f"/files/{urllib.parse.quote_plus(obj['Key'])}"},
                    "delete":   {"method": "DELETE", "endpoint": f"/files/{urllib.parse.quote_plus(obj['Key'])}"},
                },
            }
            for obj in objects.get("Contents", [])
        ]
        return respond(200, {"files": files, "upload": {"method": "POST", "endpoint": "/files"}, "sync": {"method": "POST", "endpoint": "/sync"}})
    except Exception as exc:
        log("LIST error                :", exc)
        return respond(500, {"error": str(exc)})


def handle_upload_file(event):
    body = json.loads(event["body"])
    filename     = body.get("filename") or f"doc_{datetime.utcnow():%Y%m%d_%H%M%S}"
    content_type = body.get("content_type", "application/octet-stream")
    log("UPLOAD filename            :", filename)
    try:
        file_content = b64decode(body["content"])
        s3.put_object(Bucket=BUCKET_NAME, Key=filename, Body=file_content, ContentType=content_type)
        log("UPLOAD OK")
        return respond(200, {"message": "Uploaded", "file": {"name": filename, "url": f"/files/{urllib.parse.quote_plus(filename)}"}})
    except Exception as exc:
        log("UPLOAD error              :", exc)
        return respond(500, {"error": str(exc)})


def handle_delete_file(raw_path, path_parameters):
    key = _extract_key(raw_path, path_parameters)
    log("DELETE key                 :", key)
    try:
        s3.delete_object(Bucket=BUCKET_NAME, Key=key)
        log("DELETE OK")
        return respond(200, {"message": "Deleted", "deleted_file": key})
    except ClientError as err:
        log("DELETE ClientError code    :", err.response["Error"]["Code"])
        if err.response["Error"]["Code"] == "NoSuchKey":
            return respond(404, {"error": f'File "{key}" not found'})
        return respond(500, {"error": str(err)})
    except Exception as exc:
        log("DELETE error              :", exc)
        return respond(500, {"error": str(exc)})


def handle_download_file(raw_path, path_parameters):
    key = _extract_key(raw_path, path_parameters)
    log("DOWNLOAD key               :", key)
    try:
        obj = s3.get_object(Bucket=BUCKET_NAME, Key=key)
        log("DOWNLOAD Content-Type      :", obj["ContentType"])

        return {
            "statusCode": 200,
            "headers": {
                **CORS_HEADERS,
                "Content-Type":        obj["ContentType"],
                "Content-Disposition": f'attachment; filename="{key}"',
            },
            "body": b64encode(obj["Body"].read()).decode("utf-8"),
            "isBase64Encoded": True,
        }

    except ClientError as err:
        log("DOWNLOAD ClientError code  :", err.response["Error"]["Code"])
        if err.response["Error"]["Code"] == "NoSuchKey":
            return respond(404, {"error": f'File "{key}" not found'})
        return respond(500, {"error": str(err)})
    except Exception as exc:
        log("DOWNLOAD error            :", exc)
        return respond(500, {"error": str(exc)})
