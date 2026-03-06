"""AI Research Assistant — provides medical research support for doctors."""

import os
from pathlib import Path
from dotenv import load_dotenv
import aisuite as ai

from services.bedrock_client import BedrockClient
from services.prompts import RESEARCH_SYSTEM_PROMPT

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

# Initialize aisuite client
bedrock_client = BedrockClient()
fallback_client = ai.Client()

# Hugging Face configuration
HF_MODEL = "huggingface:Qwen/Qwen3-8B"

# BEDROCK_MODEL = "openai.gpt-oss-120b-1:0"
# BEDROCK_RESEARCH_MODEL = "qwen.qwen3-next-80b-a3b"
BEDROCK_RESEARCH_MODEL = "anthropic.claude-opus-4-5-20251101-v1:0"


async def research_chat(
    message: str,
    chat_history: list[dict],
    patient_chat_history: list[dict] = None,
    feedback_thread: list[dict] = None,
    diagnosis_info: dict = None,
) -> str:
    """
    Conversational research assistant with full case context.

    Args:
        message: Doctor's current question
        chat_history: Previous research assistant conversation
        patient_chat_history: Patient-AI doctor conversation
        feedback_thread: Doctor-patient feedback messages
        diagnosis_info: AI diagnosis details
    """

    # Build case context from all available information
    case_context = _build_case_context(
        patient_chat_history, feedback_thread, diagnosis_info
    )

    messages = []

    # Add previous research chat history
    for msg in chat_history:
        role = "user" if msg["role"] == "doctor" else "assistant"
        messages.append({"role": role, "content": msg["content"]})

    # Add current message
    user_prompt = f"""Reply to the following Docto message:
    {message}
    
    RESPONSE GUIDELINES:
    - Match the tone of the doctor's message.
    - If it is conversational, respond naturally.
    - If it is clinical, respond with structured medical reasoning.
    - Be concise.
    - Avoid markdown formatting.
    """
    messages.append({"role": "user", "content": user_prompt})

    try:
        response = bedrock_client.research_chat(
            BEDROCK_RESEARCH_MODEL, case_context, messages
        )
        return response
    except Exception as e:
        print(f"Bedrock Research error: {e}")
        raise e
        return _hf_fallback(messages, case_context)


def _build_case_context(
    patient_chat_history: list[dict] = None,
    feedback_thread: list[dict] = None,
    diagnosis_info: dict = None,
) -> str:
    """Build comprehensive case context from all available information."""

    context_parts = []

    # Add patient-AI conversation
    if patient_chat_history and len(patient_chat_history) > 0:
        context_parts.append("Patient-AI Doctor Conversation:")
        for msg in patient_chat_history:
            role = "Patient" if msg["role"] == "patient" else "AI Doctor"
            context_parts.append(f"- {role}: {msg['content']}")
        context_parts.append("")

    # Add AI diagnosis
    if diagnosis_info:
        context_parts.append("AI Preliminary Diagnosis:")
        if diagnosis_info.get("primary_condition"):
            context_parts.append(
                f"- Primary Condition: {diagnosis_info['primary_condition']}"
            )
        if diagnosis_info.get("confidence"):
            context_parts.append(
                f"- Confidence: {diagnosis_info['confidence'] * 100:.0f}%"
            )
        if diagnosis_info.get("urgency"):
            context_parts.append(f"- Urgency: {diagnosis_info['urgency']}")
        if diagnosis_info.get("description"):
            context_parts.append(f"- Description: {diagnosis_info['description']}")
        if diagnosis_info.get("recommended_actions"):
            context_parts.append(
                f"- Recommended Actions: {diagnosis_info['recommended_actions']}"
            )
        if diagnosis_info.get("differential_diagnoses"):
            context_parts.append(
                f"- Differential Diagnoses: {diagnosis_info['differential_diagnoses']}"
            )
        context_parts.append("")

    # Add doctor-patient feedback thread
    if feedback_thread and len(feedback_thread) > 0:
        context_parts.append("Doctor-Patient Feedback Thread:")
        for msg in feedback_thread:
            role = "Doctor" if msg["sender_role"] == "doctor" else "Patient"
            context_parts.append(f"- {role}: {msg['message']}")
        context_parts.append("")

    if not context_parts:
        return "No case context available yet."

    return "\n".join(context_parts)


def _hf_fallback(messages: list[dict], case_context: str) -> str:

    system_prompt = RESEARCH_SYSTEM_PROMPT.format(case_context=case_context)
    messages = [{"role": "system", "content": system_prompt}] + messages
    try:
        response = fallback_client.chat.completions.create(
            model=HF_MODEL,
            messages=messages,
            temperature=0.4,
        )

        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Hf Research error: {e}")
        return _demo_fallback("", case_context)


def _demo_fallback(message: str, case_context: str) -> str:
    """Provide a demo response with case context."""

    return f"""**Research Assistant Response** (Demo Mode)

I can see the case context:

{case_context if case_context != "No case context available yet." else "_No case information loaded yet_"}

---

**Regarding your question:** "{message}"

In a real deployment with the Hugging Face API key configured, I would:
- Analyze the complete patient case history above
- Provide evidence-based medical guidance specific to this case
- Suggest relevant differential diagnoses
- Highlight any drug interactions or contraindications
- Offer treatment recommendations appropriate for rural healthcare settings

**To enable full AI research assistance:**
Set the `HUGGINGFACE_API_KEY` environment variable in your `.env` file.

---

**Quick Medical Reference:**
- Always consider the patient's complete history
- Follow WHO and Indian national guidelines
- Consider resource availability in rural settings
- Know when to refer to higher centers

Feel free to ask me anything about this case!

*Demo mode - Set HUGGINGFACE_API_KEY for real AI assistance*
"""
