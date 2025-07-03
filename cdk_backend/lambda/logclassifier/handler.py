import os
import json
import uuid
from datetime import datetime
from decimal import Decimal
import boto3
from botocore.exceptions import ClientError

# ─── Configuration ────────────────────────────────────────────────────────────
DYNAMODB_TABLE   = os.environ['DYNAMODB_TABLE']
BEDROCK_MODEL_ID = os.environ.get('BEDROCK_MODEL_ID', 'us.amazon.nova-lite-v1:0')

# ─── AWS Clients ───────────────────────────────────────────────────────────────
ddb      = boto3.resource('dynamodb')
table    = ddb.Table(DYNAMODB_TABLE)
bedrock  = boto3.client('bedrock-runtime')


def classify_question(question: str) -> str:
    """
    Use Bedrock Converse to classify into one category.
    """
    prompt = (
        "Classify this blueberry farming question into exactly one category:\n\n"
        "[Chemical Registrations, Disease, Economics, Field Establishment, Harvest, Insects, "
        "Irrigation, Nutrition, Pest Management Guide, Pollination, Post Harvest Handling, "
        "Cold Chain, Production, Pruning, Sanitation, Varietal Information, Weeds]\n\n"
        f"Question: {question}\n\n"
        "- Respond ONLY with the category name in quotes (e.g., \"Harvest\").\n"
        "- No explanations or additional text.\n"
        "- If it doesn't fit, return \"Unknown\"."
    )
    try:
        resp = bedrock.converse(
            modelId=BEDROCK_MODEL_ID,
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": 16, "temperature": 0.0, "topP": 1.0}
        )
        out = resp["output"]["message"]["content"][0]["text"].strip().strip('"')
    except ClientError as e:
        print(f"[classify_question] error: {e}")
        out = "Unknown"

    valid = {
        "Chemical Registrations","Disease","Economics","Field Establishment","Harvest","Insects",
        "Irrigation","Nutrition","Pest Management Guide","Pollination","Post Harvest Handling",
        "Cold Chain","Production","Pruning","Sanitation","Varietal Information","Weeds","Unknown"
    }
    return out if out in valid else "Unknown"


def lambda_handler(event, context):
    """
    Expects a single‐record event with keys:
      session_id, timestamp, query, response, location, [confidence]
    """
    print("Received event:", json.dumps(event))

    # 1) Session ID
    session_id = event.get("session_id") or str(uuid.uuid4())

    # 2) Timestamp + unique suffix for SK
    iso_ts = event.get("timestamp") or datetime.utcnow().isoformat()
    sort_key = f"{iso_ts}#{uuid.uuid4().hex[:8]}"

    # 3) Pull fields
    question      = event.get("query", "")
    response_text = event.get("response", "")
    location      = event.get("location", "")
    confidence    = event.get("confidence", None)

    if not question or not response_text:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Missing query or response"})
        }

    # 4) Classify
    category = classify_question(question)

    # 5) Build item
    item = {
        "session_id": session_id,   # PK
        "timestamp":  sort_key,     # SK
        "original_ts": iso_ts,
        "query":       question,
        "response":    response_text,
        "location":    location,
        "category":    category
    }
    if confidence is not None:
        try:
            item["confidence"] = Decimal(str(confidence))
        # amazonq-ignore-next-line
        except:
            pass

    # 6) Write to DynamoDB
    try:
        # amazonq-ignore-next-line
        table.put_item(Item=item)
    except Exception as e:
        print(f"[lambda_handler] DynamoDB error: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to write to DynamoDB"})
        }

    return {
        "statusCode": 200,
        "body": json.dumps({
            "session_id": session_id,
            "timestamp":  sort_key,
            "category":   category
        })
    }
