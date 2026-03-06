"""AI Doctor Assistant — conversational diagnosis from patient symptoms."""

import json
import os
from pathlib import Path
from dotenv import load_dotenv
import aisuite as ai

from services.bedrock_client import BedrockClient
from services.prompts import (
    CHAT_SYSTEM_PROMPT,
    DIAGNOSIS_SYSTEM_PROMPT,
    UNDERSTAND_DIAGNOSIS_PROMPT,
    TRANSLATE_REPORT_FIELDS_PROMPT,
    get_diagnosis_system_prompt,
)

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

# Initialize aisuite client
bedrock_client = BedrockClient()
fallback_client = ai.Client()

# Hugging Face configuration
# HF_MODEL = "huggingface:Intelligent-Internet/II-Medical-8B"
HF_MODEL = "huggingface:Qwen/Qwen3-8B"

# BEDROCK_MODEL = "openai.gpt-oss-120b-1:0"
# BEDROCK_MODEL = "qwen.qwen3-next-80b-a3b"
# BEDROCK_CHAT_MODEL = "deepseek.v3.2"
BEDROCK_CHAT_MODEL = "anthropic.claude-opus-4-5-20251101-v1:0"
BEDROCK_REPORT_MODEL = "anthropic.claude-opus-4-5-20251101-v1:0"


# ── Chat response ──────────────────────────────────────────────────────────


def _build_chat_system_prompt(patient_info: dict | None) -> str:
    """Build CHAT_SYSTEM_PROMPT with optional language override and patient background."""
    preferred_language = (patient_info or {}).get("preferred_language", "English")

    # Always inject explicit language directive — eliminates auto-detection ambiguity
    lang = (preferred_language or "English").strip()
    if lang.lower() == "english":
        lang_override = (
            "LANGUAGE REQUIREMENT: Respond ONLY in English. "
            "Never switch to any other language.\n\n"
        )
    else:
        lang_override = (
            f"ABSOLUTE LANGUAGE REQUIREMENT — THIS OVERRIDES EVERYTHING BELOW:\n"
            f"The patient's preferred language is {lang}. "
            f"You MUST respond ENTIRELY in {lang} for EVERY message, "
            f"regardless of what language the patient writes in. "
            f"Never switch to English or any other language.\n\n"
        )
    base = lang_override + CHAT_SYSTEM_PROMPT

    # Append patient background only if there is meaningful data
    age = (patient_info or {}).get("age")
    gender = (patient_info or {}).get("gender")
    medical_history = (patient_info or {}).get("medical_history")
    current_medications = (patient_info or {}).get("current_medications")
    if not any([age, gender, medical_history, current_medications]):
        return base

    patient_section = (
        "\n\n=== Patient Background (already on file — do NOT ask for these again) ===\n"
        f"Age: {age if age else 'Not provided'}\n"
        f"Gender: {gender if gender else 'Not provided'}\n"
        f"Known Medical History / Long-term Conditions: {medical_history if medical_history else 'None mentioned'}\n"
        f"Current Medications (before this visit): {current_medications if current_medications else 'None mentioned'}\n"
        "=== End of Patient Background ===\n"
        "Use this context to ask more targeted symptom questions."
    )
    return base + patient_section


async def chat_response(
    message: str,
    chat_history: list[dict],
    patient_info: dict | None = None,
    image_b64: str | None = None,
    image_media_type: str | None = None,
) -> str:
    """Generate a conversational response to gather more symptom info."""
    system_prompt = _build_chat_system_prompt(patient_info)
    try:
        response = bedrock_client.generate(
            BEDROCK_CHAT_MODEL,
            chat_history,
            message,
            image_b64=image_b64,
            image_media_type=image_media_type,
            system_prompt=system_prompt,
        )
        return response
    except Exception as e:
        print(f"Bedrock chat error: {e}")
        return _chat_using_hf(message, chat_history, system_prompt)


# ── Final diagnosis from chat history ──────────────────────────────────────


async def generate_diagnosis_from_chat(
    chat_history: list[dict],
    medical_history: str = "",
    current_medications: str = "",
    age: int | None = None,
    gender: str | None = None,
    preferred_language: str | None = None,
) -> dict:
    """Generate a structured diagnosis from the full chat conversation."""

    # Build a transcript of the conversation
    transcript = "=== Patient-AI Conversation ===\n"
    for msg in chat_history:
        label = "Patient" if msg["role"] == "patient" else "AI Assistant"
        transcript += f"{label}: {msg['content']}\n"
    transcript += "=== End of Conversation ===\n\n"

    transcript += f"""Additional Patient Information:
- Medical History: {medical_history or "Not provided"}
- Current Medications: {current_medications or "None"}
- Age: {age or "Not provided"}
- Gender: {gender or "Not provided"}

Based on the full conversation above, provide your preliminary diagnosis as JSON.
"""
    diagnosis_prompt = get_diagnosis_system_prompt(preferred_language)
    try:
        text = bedrock_client.generate_diagnosis_report(
            BEDROCK_REPORT_MODEL, transcript, system_prompt=diagnosis_prompt
        )
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            text = text.rsplit("```", 1)[0]
        return json.loads(text)
    except Exception as e:
        print(f"Bedrock diagnosis error: {e}")
        return _diagnosis_report_using_hf(transcript, chat_history)


# ── Demo fallbacks ─────────────────────────────────────────────────────────


def _chat_using_hf(
    message: str, chat_history: list[dict], system_prompt: str | None = None
) -> str:

    messages = [{"role": "system", "content": system_prompt or CHAT_SYSTEM_PROMPT}]

    for msg in chat_history:
        role = "user" if msg["role"] == "patient" else "assistant"
        messages.append({"role": role, "content": msg["content"]})

    # Add the new message
    messages.append({"role": "user", "content": message})

    if not os.environ.get("HUGGINGFACE_API_KEY", ""):
        return _chat_demo_fallback(message, len(chat_history))
    try:
        response = fallback_client.chat.completions.create(
            model=HF_MODEL,
            messages=messages,
            temperature=0.5,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Hf Face chat error: {e}")
        return _chat_demo_fallback(message, len(chat_history))


def _diagnosis_report_using_hf(transcript: str, chat_history: list[dict]) -> dict:
    try:
        messages = [
            {"role": "system", "content": DIAGNOSIS_SYSTEM_PROMPT},
            {"role": "user", "content": transcript},
        ]
        response = fallback_client.chat.completions.create(
            model=HF_MODEL,
            messages=messages,
            temperature=0.3,
        )

        text = response.choices[0].message.content.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            text = text.rsplit("```", 1)[0]
        return json.loads(text)
    except Exception as e:
        print(f"Hf diagnosis error: {e}")
        all_symptoms = " ".join(
            msg["content"] for msg in chat_history if msg["role"] == "patient"
        )
        return _diagnosis_demo_fallback(all_symptoms)


def _chat_demo_fallback(message: str, turn_count: int) -> str:
    """Provide conversational demo responses without an API key."""
    if turn_count == 0:
        return (
            "Thank you for reaching out. I'd like to understand your symptoms better. "
            "Can you tell me how long you've been experiencing these symptoms, "
            "and have they been getting worse?"
        )
    elif turn_count <= 2:
        return (
            "I see, that's helpful information. Do you have any other symptoms "
            "like headache, body aches, loss of appetite, or changes in sleep? "
            "Also, are you currently taking any medications?"
        )
    else:
        return (
            "Thank you for sharing all this information. I have a good understanding "
            "of your symptoms now. When you're ready, you can click 'Get Diagnosis' "
            "and I'll generate a preliminary report for a doctor to review."
        )


async def explain_diagnosis(
    report_context: str,
    message: str | None,
    chat_history: list[dict],
    preferred_language: str | None = None,
) -> str:
    """Explain the doctor's final report in simple language. Stateless — chat_history from frontend."""
    effective_message = (
        message
        if message is not None
        else "Please explain my diagnosis report in simple language that I can easily understand."
    )
    messages = list(chat_history) + [{"role": "user", "content": effective_message}]

    # Always inject explicit language directive
    lang = (preferred_language or "English").strip()
    if lang.lower() == "english":
        lang_override = (
            "LANGUAGE REQUIREMENT: Respond ONLY in English. "
            "Never switch to any other language.\n\n"
        )
    else:
        lang_override = (
            f"ABSOLUTE LANGUAGE REQUIREMENT — THIS OVERRIDES EVERYTHING BELOW:\n"
            f"The patient's preferred language is {lang}. "
            f"You MUST respond ENTIRELY in {lang} for ALL messages, "
            f"regardless of what language the patient writes in. "
            f"Never mix languages or default to English.\n\n"
        )
    base_prompt = UNDERSTAND_DIAGNOSIS_PROMPT.format(report_context=report_context)
    system_prompt = lang_override + base_prompt

    try:
        return bedrock_client.understand_chat(
            BEDROCK_CHAT_MODEL, report_context, messages, system_prompt=system_prompt
        )
    except Exception as e:
        print(f"Bedrock explain_diagnosis error: {e}")
        return _explain_diagnosis_fallback(message)


def _explain_diagnosis_fallback(message: str | None) -> str:
    if message is None:
        return (
            "Hello! I'm here to help you understand your medical report in simple language. "
            "Your doctor has reviewed your case and provided a diagnosis and prescription. "
            "Feel free to ask me any questions about your report."
        )
    return (
        "I understand your question. Based on your doctor's report, I'll do my best to help. "
        "If you need more clarity, please ask your doctor at your next visit."
    )


async def translate_message(message: str, preferred_language: str) -> str | None:
    """Translate a single doctor message into the patient's preferred language.
    Returns None on failure so callers can store None gracefully."""
    content = (
        f"Translate the text inside <text> tags to {preferred_language}.\n\n"
        f"<text>{message}</text>\n\n"
        f"Output ONLY the translated text. Do not explain, comment, ask questions, or add anything else."
    )
    system_prompt = (
        f"You are a translation engine. Your sole function is to translate text to {preferred_language}. "
        f"You MUST translate whatever is inside the <text> tags literally — even if it is a single word, "
        f"a number, or appears incomplete. Never ask for clarification, never add commentary. "
        f"Output ONLY the translated text, nothing else."
    )
    try:
        result = bedrock_client.generate_diagnosis_report(
            BEDROCK_REPORT_MODEL, content, system_prompt=system_prompt
        )
        return result.strip() or None
    except Exception as e:
        print(f"translate_message error: {e}")
        return None


async def translate_final_report_fields(
    final_diagnosis: str,
    doctor_comments: str,
    prescribed_medications: str,
    dosage_instructions: str,
    diet_lifestyle: str,
    additional_instructions: str,
    preferred_language: str,
) -> dict:
    """Translate doctor's final prescription fields into the patient's preferred language."""
    content = (
        f"Translate these medical prescription fields to {preferred_language}:\n\n"
        f"Final Diagnosis: {final_diagnosis}\n"
        f"Doctor's Comments: {doctor_comments or 'None'}\n"
        f"Prescribed Medications: {prescribed_medications or 'None'}\n"
        f"Dosage Instructions: {dosage_instructions or 'None'}\n"
        f"Diet & Lifestyle: {diet_lifestyle or 'None'}\n"
        f"Additional Instructions: {additional_instructions or 'None'}\n"
    )
    system_prompt = TRANSLATE_REPORT_FIELDS_PROMPT.format(language=preferred_language)
    try:
        text = bedrock_client.generate_diagnosis_report(
            BEDROCK_REPORT_MODEL, content, system_prompt=system_prompt
        )
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            text = text.rsplit("```", 1)[0]
        return json.loads(text)
    except Exception as e:
        print(f"translate_final_report_fields error: {e}")
        return {}


def _diagnosis_demo_fallback(symptoms: str) -> dict:
    """Provide a plausible demo diagnosis when no API key is available."""
    symptoms_lower = symptoms.lower()

    if any(w in symptoms_lower for w in ["fever", "temperature", "hot"]):
        return {
            "primary_condition": "Viral Fever",
            "confidence": 0.72,
            "urgency": "medium",
            "recommended_actions": "Rest, adequate hydration, paracetamol for fever, monitor temperature",
            "differential_diagnoses": "Dengue Fever, Malaria, Typhoid Fever, Upper Respiratory Infection",
            "description": "The combination of fever symptoms suggests a viral infection. "
            "Given the rural Indian context, tropical infections like Dengue and "
            "Malaria should be ruled out through blood tests.",
        }
    elif any(w in symptoms_lower for w in ["cough", "cold", "throat", "breathing"]):
        return {
            "primary_condition": "Upper Respiratory Tract Infection",
            "confidence": 0.68,
            "urgency": "low",
            "recommended_actions": "Rest, warm fluids, steam inhalation, avoid cold beverages",
            "differential_diagnoses": "Bronchitis, Allergic Rhinitis, Pneumonia, Tuberculosis",
            "description": "Respiratory symptoms suggest an upper respiratory tract infection. "
            "If symptoms persist beyond a week or worsen, further investigation "
            "for pneumonia or tuberculosis may be necessary.",
        }
    elif any(
        w in symptoms_lower
        for w in ["stomach", "diarrhea", "vomit", "nausea", "abdomen"]
    ):
        return {
            "primary_condition": "Acute Gastroenteritis",
            "confidence": 0.70,
            "urgency": "medium",
            "recommended_actions": "ORS solution, bland diet, avoid spicy food, monitor for dehydration",
            "differential_diagnoses": "Food Poisoning, Cholera, Amoebiasis, Peptic Ulcer Disease",
            "description": "Gastrointestinal symptoms suggest acute gastroenteritis, commonly "
            "caused by contaminated water or food. Dehydration prevention is critical, "
            "especially in rural settings.",
        }
    else:
        return {
            "primary_condition": "General Medical Consultation Required",
            "confidence": 0.45,
            "urgency": "medium",
            "recommended_actions": "Schedule physical examination, basic blood work, vital signs monitoring",
            "differential_diagnoses": "Multiple conditions possible — needs clinical examination",
            "description": "The described symptoms require further clinical evaluation. "
            "A physical examination and basic diagnostic tests are recommended "
            "to narrow down the diagnosis.",
        }
