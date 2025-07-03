import boto3
import json
import time
from datetime import datetime, timedelta
import os

# Configuration
GROUP_NAME = os.environ['GROUP_NAME']
BUCKET = os.environ['BUCKET']
DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']

# Initialize clients
logs_client = boto3.client('logs')
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

table = dynamodb.Table(DYNAMODB_TABLE)

def store_session_logs():
    """Store only session logs with specified fields"""
    today = datetime.utcnow()
    start_time = datetime(today.year, today.month, today.day)
    end_time = today
    
    date_str = today.strftime('%Y-%m-%d')
    
    # Check if already processed
    try:
        response = table.get_item(Key={'date': date_str, 'session_id': 'SESSION_LOGS'})
        if 'Item' in response:
            print(f"Session logs for {date_str} already processed")
            return {'success': False, 'message': 'Logs already processed'}
    except Exception as e:
        print(f"DynamoDB check failed: {str(e)}")

    try:
        # Query to find session logs
        query = """
        fields @message
        | filter @message like /"session_id":/
        | filter @message like /"query":/
        | filter @message like /"response":/
        | filter @message like /"location":/
        | limit 10000
        """
        
        query_response = logs_client.start_query(
            logGroupName=GROUP_NAME,
            startTime=int(start_time.timestamp()),
            endTime=int(end_time.timestamp()),
            queryString=query,
            limit=10000
        )
        
        query_id = query_response['queryId']
        print(f"Started query: {query_id}")
        
        # Wait for completion
        response = None
        while response is None or response['status'] == 'Running':
            time.sleep(1)
            response = logs_client.get_query_results(queryId=query_id)
        
        if response['status'] != 'Complete':
            raise Exception(f"Query failed: {response['status']}")
        
        # Collect matching logs
        session_logs = []
        for result in response['results']:
            message = next((f['value'] for f in result if f['field'] == '@message'), None)
            if message:
                try:
                    # Extract JSON part
                    json_start = message.find('{')
                    if json_start != -1:
                        log_data = json.loads(message[json_start:])
                        if all(field in log_data for field in ['session_id', 'query', 'response']):
                            session_logs.append(log_data)
                except json.JSONDecodeError:
                    continue
        
        if not session_logs:
            print("No matching session logs found")
            return {'success': False, 'message': 'No matching logs found'}
        
        # Store raw logs in S3
        file_key = f"session_logs/{date_str}.json"
        s3_client.put_object(
            Bucket=BUCKET,
            Key=file_key,
            Body=json.dumps(session_logs),
            ContentType='application/json'
        )
        
        print(f"Stored {len(session_logs)} session logs to s3://{BUCKET}/{file_key}")
        return {
            'success': True,
            's3_path': f"s3://{BUCKET}/{file_key}",
            'log_count': len(session_logs)
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        raise

def lambda_handler(event, context):
    action = event.get('action', 'store_logs')
    
    if action == 'store_logs':
        result = store_session_logs()
        return {
            'statusCode': 200,
            'body': json.dumps({
                'success': result.get('success', False),
                'message': result.get('message', ''),
                'log_count': result.get('log_count', 0)
            })
        }
    else:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Invalid action'})
        }