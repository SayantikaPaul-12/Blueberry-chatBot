import json
import boto3
import os
from datetime import datetime

# Initialize AWS clients
bedrock_agent = boto3.client('bedrock-agent-runtime')
api_gateway = boto3.client('apigatewaymanagementapi', endpoint_url=os.environ['WS_API_ENDPOINT'])
lambda_client = boto3.client('lambda')

agent_id = os.environ["AGENT_ID"]
agent_alias_id = os.environ["AGENT_ALIAS_ID"] 
LOG_CLASSIFIER_FN_NAME = os.environ['LOG_CLASSIFIER_FN_NAME']

def send_ws_response(connection_id, response):
    if connection_id and connection_id.startswith("mock-"):
        print(f"[TEST] Skipping WebSocket send for mock ID: {connection_id}")
        return
    print(f"Sending response to WebSocket connection: {connection_id}")
    print(f"Response: {response}")
    try:
        api_gateway.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(response)
        )
    except Exception as e:
        print(f"WebSocket error: {str(e)}")

def lambda_handler(event, context):
    try:
        query = event.get("querytext", "").strip()
        connection_id = event.get("connectionId")
        session_id = event.get("session_id", context.aws_request_id)
        location = event.get("location")  # Must come from frontend first time
        
        print(f"Received Query - Session: {session_id}, Location: {location}, Query: {query}")

        max_retries = 2
        full_response = ""

        for attempt in range(max_retries):
            try:
                response = bedrock_agent.invoke_agent(
                    agentId=agent_id,
                    agentAliasId=agent_alias_id,
                    sessionId=session_id,
                    inputText=query
                )

                full_response = "".join(
                    event['chunk']['bytes'].decode('utf-8')
                    for event in response['completion']
                    if 'chunk' in event
                )
                break
            except Exception as e:
                print(f"Attempt {attempt + 1} failed: {str(e)}")
                if attempt == max_retries - 1:
                    raise

        
        print(full_response)

        payload = {
            "session_id": session_id,
            "timestamp": datetime.utcnow().isoformat(),
            "query": query,
            "response": full_response,
            "location": location
        }

        print(payload)

        result = {
                'responsetext': full_response,
                 }

        if connection_id:
            send_ws_response(connection_id, result)

        lambda_client.invoke(
            FunctionName   = LOG_CLASSIFIER_FN_NAME,
            InvocationType = 'Event',
            Payload        = json.dumps(payload).encode('utf-8')
        )

        return {'statusCode': 200, 'body': json.dumps(result)}

    except Exception as e:
        print(f"Error: {str(e)}")
        error_msg = {'error': str(e)}
        if connection_id:
            send_ws_response(connection_id, error_msg)
        return {'statusCode': 500, 'body': json.dumps(error_msg)}