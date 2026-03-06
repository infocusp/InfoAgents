import boto3
import json
from botocore.config import Config
from dotenv import load_dotenv

from pathlib import Path
import os


# Load environment variables from .env file
env_path = Path(__file__).parent / 'backend' / '.env'
print(env_path)
load_dotenv(dotenv_path=env_path)
print(os.environ["AWS_SECRET_ACCESS_KEY"])
client = boto3.client("bedrock", region_name="ap-south-1")

# response = client.list_foundation_models()

# for model in response["modelSummaries"]:
#     print(
#         f"Model ID: {model['modelId']}",
#         f"| Provider: {model['providerName']}",
#         f"| Lifecycle: {model['modelLifecycle']['status']}"
#     )




# class BedrockClient:
#     def __init__(self, region="ap-south-1"):
#         self.client = boto3.client(
#             service_name="bedrock-runtime",
#             region_name=region,
#             config=Config(retries={"max_attempts": 3})
#         )

#     def invoke_claude(self, prompt: str):
#         body = json.dumps({
#             "anthropic_version": "bedrock-2023-05-31",
#             "max_tokens": 500,
#             "messages": [
#                 {
#                     "role": "user",
#                     "content": prompt
#                 }
#             ]
#         })

#         response = self.client.invoke_model(
#             # modelId="anthropic.claude-3-sonnet-20240229-v1:0",
#             modelId="amazon.titan-text-express-v1",
#             body=body,
#             contentType="application/json",
#             accept="application/json"
#         )

#         response_body = json.loads(response["body"].read())
#         return response_body["content"][0]["text"]

#     def invoke_nova(self, prompt: str):
#         body = json.dumps({
#             "messages": [
#                 {
#                     "role": "user",
#                     "content": [
#                         {"text": prompt}
#                     ]
#                 }
#             ],
#             "inferenceConfig": {
#                 "maxTokens": 500,
#                 "temperature": 0.7,
#                 "topP": 0.9
#             }
#         })

#         response = self.client.invoke_model(
#             modelId="amazon.titan-text-express-v1",
#             body=body,
#             contentType="application/json",
#             accept="application/json"
#         )

#         response_body = json.loads(response["body"].read())

#         return response_body["output"]["message"]["content"][0]["text"]

#     def invoke_openai(self, prompt: str):
#         body = json.dumps({
#             "messages": [
#                 {
#                     "role": "user",
#                     "content": prompt
#                 }
#             ],
#             "max_tokens": 500,
#             "temperature": 0.7,
#             "top_p": 0.9
#         })

#         response = self.client.invoke_model(
#             modelId="openai.gpt-oss-120b-1:0",
#             body=body,
#             contentType="application/json",
#             accept="application/json"
#         )

#         response_body = json.loads(response["body"].read())

#         return response_body["choices"][0]["message"]["content"]


# llm = BedrockClient()

# def generate_research_summary():
#     prompt = f"""
#     Hi tell me about yourself"""
#     response = llm.invoke_openai(prompt)
#     return response

# print(generate_research_summary())



import boto3
import json
from botocore.config import Config


class BedrockClient:
    def __init__(self, region="ap-south-1"):
        self.client = boto3.client(
            service_name="bedrock-runtime",
            region_name=region,
            config=Config(retries={"max_attempts": 3})
        )

    # ==========================
    # PUBLIC ENTRY POINT
    # ==========================
    def generate(self, model_id: str, prompt: str):
        """
        Main orchestration function.
        Detects model family and routes to correct invocation method.
        """

        if model_id.startswith("anthropic."):
            return self._invoke_anthropic(model_id, prompt)

        elif model_id.startswith("amazon.titan"):
            return self._invoke_titan(model_id, prompt)

        elif model_id.startswith("amazon.nova"):
            return self._invoke_nova(model_id, prompt)

        elif model_id.startswith("openai."):
            return self._invoke_openai(model_id, prompt)

        elif model_id.startswith("qwen."):
            return self._invoke_qwen(model_id, prompt)

        elif model_id.startswith("deepseek."):
            return self._invoke_deepseek(model_id, prompt)

        else:
            raise ValueError(f"Unsupported model family for model_id: {model_id}")

    # ==========================
    # ANTHROPIC
    # ==========================
    def _invoke_anthropic(self, model_id, prompt):
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "system": "Answer the query.",
            "max_tokens": 800,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        })

        response = self.client.invoke_model(
            modelId="arn:aws:bedrock:ap-south-1:508865364558:inference-profile/global.anthropic.claude-opus-4-5-20251101-v1:0",
            body=body,
            contentType="application/json",
            accept="application/json"
        )

        data = json.loads(response["body"].read())
        return data["content"][0]["text"]

    # ==========================
    # TITAN
    # ==========================
    def _invoke_titan(self, model_id, prompt):
        body = json.dumps({
            "inputText": prompt,
            "textGenerationConfig": {
                "maxTokenCount": 800,
                "temperature": 0.3,
                "topP": 0.9
            }
        })

        response = self.client.invoke_model(
            modelId=model_id,
            body=body,
            contentType="application/json",
            accept="application/json"
        )

        data = json.loads(response["body"].read())
        return data["results"][0]["outputText"]

    # ==========================
    # NOVA / QWEN STYLE MODELS
    # ==========================
    def _invoke_nova(self, model_id, prompt):
        return self._invoke_messages_api(model_id, prompt)

    def _invoke_qwen(self, model_id, prompt):
        return self._invoke_messages_api(model_id, prompt)
    
    def _invoke_deepseek(self, model_id, prompt):
        return self._invoke_messages_api(model_id, prompt)

    # ==========================
    # OPENAI (BEDROCK HOSTED)
    # ==========================
    def _invoke_openai(self, model_id, prompt):
        body = json.dumps({
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "max_tokens": 800,
            "temperature": 0.3,
            "top_p": 0.9
        })

        response = self.client.invoke_model(
            modelId=model_id,
            body=body,
            contentType="application/json",
            accept="application/json"
        )

        data = json.loads(response["body"].read())
        return data["choices"][0]["message"]["content"]

    # ==========================
    # SHARED MESSAGES API FORMAT
    # (Nova, Qwen, etc.)
    # ==========================
    def _invoke_messages_api(self, model_id, prompt):
        messages = [{"role": "system", "content":"Answer the query."}]
        body = json.dumps({
            "messages": [
                {"role": "system", "content":"Answer the query."},
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "inferenceConfig": {
                "maxTokens": 800,
                "temperature": 0.3,
                "topP": 0.9
            }
        })

        response = self.client.invoke_model(
            modelId=model_id,
            body=body,
            contentType="application/json",
            accept="application/json"
        )

        data = json.loads(response["body"].read())
        return data["choices"][0]["message"]["content"]


llm = BedrockClient()
print(llm.generate("anthropic.claude-opus-4-5-20251101-v1:0", "mujhe sar me bahut dard ho raha hai , mai kya karu?"))

# def generate_research_summary():
#     prompt = f"""
#     Hi tell me about yourself"""
#     response = llm.invoke_openai(prompt)
#     return response

# print(generate_research_summary())



# import boto3

# bedrock = boto3.client("bedrock", region_name="ap-south-1", config=Config(retries={"max_attempts": 3}))
# print(dir(bedrock))

# resp = bedrock.list_inference_profiles(typeEquals="SYSTEM_DEFINED")
# for p in resp.get("inferenceProfileSummaries", []):
#     print(p.get("inferenceProfileId"), p.get("inferenceProfileArn"))