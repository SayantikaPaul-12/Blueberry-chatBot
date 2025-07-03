import json
import boto3
import traceback
import os 

# Initialize AWS clients
lambda_client = boto3.client('lambda')
response_function_arn = os.environ['RESPONSE_FUNCTION_ARN']

def lambda_handler(event, context):
    try:
        # 1. Extract WebSocket context
        request_context = event.get('requestContext', {})
        connection_id = request_context.get('connectionId')
        route_key = request_context.get('routeKey')
        
        # 2. Route handling
        if route_key == '$connect':
            print(f"New connection: {connection_id}")
            return {'statusCode': 200}
            
        elif route_key == '$disconnect':
            print(f"Disconnected: {connection_id}")
            return {'statusCode': 200}

        elif route_key == 'sendMessage':
            # 3. Parse message body
            body = json.loads(event.get('body', '{}'))
            
            query = body.get('querytext', '').strip()
            location = body.get('location')  
            session_id = body.get('session_id') 
            
            if not query:
                raise ValueError("Empty query received")
            
            payload_to_cf_evaluator = {'querytext': query,'connectionId': connection_id,"session_id":session_id}
            
            if location:
                payload_to_cf_evaluator['location'] = location

            # 5. Fire off the evaluator asynchronously
            lambda_client.invoke(
                FunctionName=response_function_arn,
                InvocationType='Event',
                Payload=json.dumps(payload_to_cf_evaluator)
            )
            
            return {'statusCode': 200}
            
        else:
            # unrecognized route
            return {'statusCode': 400, 'body': json.dumps({'error': 'Unknown route'})}

    except Exception as e:
        # Log the error and full stack trace
        print(f"Error in handler: {str(e)}")
        print(traceback.format_exc())
        # Return the error message back to the caller
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
