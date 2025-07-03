import os
import json
import boto3
from datetime import datetime

# lambda function created based on https://docs.aws.amazon.com/bedrock/latest/userguide/agents-lambda.html#agents-lambda-response
ses = boto3.client("ses")

def lambda_handler(event, context):
    print("Event keys:", list(event.keys()))

    # ---------------------------------------------------------------------
    # 1.  GLUE DATA: Pull out the three user-facing fields we care about
    # ---------------------------------------------------------------------
    email = querytext = agent_response = None

    # ---- 1a) first look in the top-level parameters list -----------------
    for p in event.get("parameters", []):
        name = p.get("name", "").lower()
        val  = p.get("value")
        if name == "email":
            email = val
        elif name in ("querytext", "question", "inputtext"):
            querytext = val
        elif name in ("agentresponse", "response"):
            agent_response = val

    # ---- 1b) if any are missing, look inside the requestBody -------------
    if (email is None or querytext is None or agent_response is None) and "requestBody" in event:
        for ctype, body in event["requestBody"].get("content", {}).items():
            for prop in body.get("properties", []):
                name = prop.get("name", "").lower()
                val  = prop.get("value")
                if name == "email" and email is None:
                    email = val
                elif name in ("querytext", "question", "inputtext") and querytext is None:
                    querytext = val
                elif name in ("agentresponse", "response") and agent_response is None:
                    agent_response = val

    # graceful fallbacks
    email          = email or "<unknown>"
    querytext      = querytext or "<no question>"
    agent_response = agent_response or "<no agent response>"

    print(f"Parsed → email:{email}  querytext:{querytext}  agentResponse:{agent_response}")

    # ---------------------------------------------------------------------
    # 2.  BUSINESS LOGIC: Notify admin via SES
    # ---------------------------------------------------------------------
    try:
        src   = os.environ["VERIFIED_SOURCE_EMAIL"]
        admin = os.environ["ADMIN_EMAIL"]

        body = (
            f"Hello Admin,\n\n"
            f"A user needs assistance with this question:\n\n"
            f"  • User Email: {email}\n"
            f"  • Original Question: {querytext}\n"
            f"  • Agent’s Response: {agent_response}\n\n"
            f"Timestamp: {datetime.utcnow().isoformat()}Z\n\n"
            "Thanks,\nBlueberry BOT"
        )

        print("Sending SES …")
        ses.send_email(
            Source=src,
            Destination={"ToAddresses": [admin]},
            Message={
                "Subject": {"Data": "Agent Assistance Requested"},
                "Body":    {"Text": {"Data": body}}
            }
        )
        ses_fail = False
        result_msg = "Admin has been notified successfully."

    except Exception as exc:
        print("SES error:", exc, flush=True)
        ses_fail   = True
        result_msg = f"Failed to notify admin: {exc}"

    # ---------------------------------------------------------------------
    # 3.  FORMAT THE RESPONSE *exactly* per docs
    # ---------------------------------------------------------------------
    message_version = "1.0"
    action_group    = event.get("actionGroup")
    session_attrs   = event.get("sessionAttributes", {})
    prompt_attrs    = event.get("promptSessionAttributes", {})

    # ------ branch: Function-details mode --------------------------------
    if "function" in event:                              # ← key tells us mode
        response_dict = {
            "actionGroup": action_group,
            "function":    event["function"],
            "functionResponse": {
                # include "responseState" ONLY on error
                **({"responseState": "FAILURE"} if ses_fail else {}),
                "responseBody": {
                    "TEXT": { "body": result_msg }
                }
            }
        }

    # ------ branch: OpenAPI-schema mode ----------------------------------
    else:
        response_dict = {
            "actionGroup":   action_group,
            "apiPath":       event.get("apiPath", ""),
            "httpMethod":    event.get("httpMethod", ""),
            "httpStatusCode": 500 if ses_fail else 200,
            "responseBody": {
                "application/json": {
                    "body": json.dumps({"message": result_msg})
                }
            }
        }

    # ------ assemble final wrapper ---------------------------------------
    return {
        "messageVersion": message_version,
        "response":        response_dict,
        "sessionAttributes":         session_attrs,
        "promptSessionAttributes":   prompt_attrs
    }
