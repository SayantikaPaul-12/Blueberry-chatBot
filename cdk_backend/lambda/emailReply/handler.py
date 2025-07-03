import os
import json
import re
import boto3
from email import policy
from email.parser import BytesParser
from datetime import datetime

# AWS clients
s3              = boto3.client('s3')
bedrock_agent   = boto3.client('bedrock-agent')

# Environment variables
SOURCE_BUCKET   = os.environ['SOURCE_BUCKET_NAME']       # your SES email bucket
DEST_BUCKET     = os.environ['DESTINATION_BUCKET_NAME']  # your BlueberryData bucket
KB_ID           = os.environ['KNOWLEDGE_BASE_ID']
DS_ID           = os.environ['DATA_SOURCE_ID']
ADMIN_EMAIL     = os.environ['ADMIN_EMAIL']

def lambda_handler(event, context):
    try:
        rec = event['Records'][0]
        
        # 1) Fetch raw email bytes from S3
        if 'ses' in rec:
            # Invoked by SES receipt rule
            mail      = rec['ses']['mail']
            msg_id    = mail['messageId']
            s3_key    = f"incoming/{msg_id}"
            print(f"[SES] Pulling s3://{SOURCE_BUCKET}/{s3_key}")
            raw_obj   = s3.get_object(Bucket=SOURCE_BUCKET, Key=s3_key)
            raw_bytes = raw_obj['Body'].read()
        
        elif 's3' in rec:
            # Invoked by a generic S3 ObjectCreated event
            bucket    = rec['s3']['bucket']['name']
            key       = rec['s3']['object']['key']
            print(f"[S3 ] Pulling s3://{bucket}/{key}")
            raw_obj   = s3.get_object(Bucket=bucket, Key=key)
            raw_bytes = raw_obj['Body'].read()
        
        else:
            raise ValueError("Unsupported event type")

        # 2) Parse MIME and extract text/plain
        msg = BytesParser(policy=policy.default).parsebytes(raw_bytes)
        body = None
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == 'text/plain':
                    body = part.get_content()
                    break
        else:
            if msg.get_content_type() == 'text/plain':
                body = msg.get_content()

        if not body:
            raise ValueError("No text/plain part found in email")

        # 3) Extract QUESTION / ANSWER
        question, answer = extract_qna(body)
        if not question or not answer:
            raise ValueError("Failed to extract QUESTION/ANSWER")

        print("Extracted Q:", question)
        print("Extracted A:", answer)

        # 4) Write out to DEST_BUCKET under admin_answers/
        ts       = datetime.utcnow().strftime("%Y%m%d_%H%M%SZ")
        out_key  = f"admin_answers/{ts}.txt"
        content  = (
            f"Q: {question}\n"
            f"A: {answer}\n\n"
            f"Approved by: {ADMIN_EMAIL}\n"
            f"Date: {datetime.utcnow().isoformat()}Z\n"
        ).encode('utf-8')

        s3.put_object(
            Bucket      = DEST_BUCKET,
            Key         = out_key,
            Body        = content,
            ContentType = 'text/plain',
            Metadata    = {
                'question':    question,
                'approved_by': ADMIN_EMAIL
            }
        )
        print(f"Uploaded Q&A to s3://{DEST_BUCKET}/{out_key}")

        # 5) Trigger Bedrock ingestion
        resp = bedrock_agent.start_ingestion_job(
            knowledgeBaseId = KB_ID,
            dataSourceId    = DS_ID
        )

        print("Bedrock ingestion response:", resp)
        return { 'status': 'SUCCESS' }

    except Exception as e:
        print("ERROR:", str(e))
        print("Event payload:", json.dumps(event))
        return { 'status': 'ERROR', 'message': str(e) }


def extract_qna(body_text):
    """
    Finds QUESTION: … ANSWER: … or falls back to first-line / remainder.
    """
    patterns = [
        (r'QUESTION:\s*(.*?)\s*ANSWER:\s*(.*)', re.DOTALL|re.IGNORECASE),
        (r'QUESTION:\s*(.*?)\r?\n(.*)',   re.DOTALL|re.IGNORECASE),
        (r'^(.*?)\r?\n(.*)$',             re.DOTALL)
    ]
    for pat, flags in patterns:
        m = re.search(pat, body_text, flags)
        if m and m.groups():
            return m.group(1).strip(), m.group(2).strip()
    return None, None
