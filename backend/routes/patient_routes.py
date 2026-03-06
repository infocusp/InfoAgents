"""Patient routes — chat-based diagnosis, feedback responses, and report viewing."""

import base64
import mimetypes
import os
from fastapi import APIRouter, Depends, HTTPException
from models import (
    StartChat,
    ChatMessage,
    DiagnosisResponse,
    PatientFeedbackResponse,
    UnderstandReportRequest,
)
from auth import get_current_user
from database import (
    create_chat_session,
    delete_stale_chat_sessions,
    save_chat_message,
    get_chat_history,
    get_report_by_id,
    get_reports_for_patient,
    update_report_with_diagnosis,
    get_doctor_patient_messages,
    save_doctor_patient_message,
    update_report_status,
    get_user_by_id,
    create_doctor_notification,
)
from services.ai_doctor import (
    chat_response,
    generate_diagnosis_from_chat,
    explain_diagnosis,
    translate_message,
)

_IS_LAMBDA = bool(os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
_UPLOADS_DIR = (
    "/tmp/uploads"
    if _IS_LAMBDA
    else os.path.join(os.path.dirname(__file__), "..", "uploads")
)


def _image_from_attachment(attachment_url: str | None) -> tuple[str | None, str | None]:
    """
    Read an uploaded image file from disk and return (base64_data, media_type).
    Returns (None, None) for missing URLs, non-existent files, or non-image types
    (e.g. PDFs — Claude Vision only supports images).
    """
    if not attachment_url:
        return None, None

    # Extract filename whether URL is absolute (http://host/uploads/f) or relative (/uploads/f)
    if "/uploads/" not in attachment_url:
        return None, None
    filename = attachment_url.rsplit("/uploads/", 1)[-1]
    file_path = os.path.join(_UPLOADS_DIR, filename)

    if not os.path.exists(file_path):
        print(f"[image] Attachment file not found: {file_path}")
        return None, None

    media_type, _ = mimetypes.guess_type(file_path)
    if not media_type or not media_type.startswith("image/"):
        print(f"[image] Skipping non-image attachment: {media_type}")
        return None, None

    with open(file_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")

    print(f"[image] Loaded attachment: {filename} ({media_type}, {len(b64)} b64 chars)")
    return b64, media_type




router = APIRouter(prefix="/api/patient", tags=["patient"])


@router.post("/start-chat")
async def start_chat(data: StartChat, user: dict = Depends(get_current_user)):
    """Start a new chat session — creates a shell report and returns its ID."""
    if user["role"] != "patient":
        raise HTTPException(status_code=403, detail="Only patients can start chats")

    # Clean up any abandoned chatting sessions before creating a new one
    await delete_stale_chat_sessions(user["user_id"])

    patient_profile = await get_user_by_id(user["user_id"])
    report_id = await create_chat_session(
        patient_id=user["user_id"],
        medical_history=data.medical_history or "",
        current_medications=data.current_medications or "",
        age=patient_profile.get("age") if patient_profile else None,
        gender=patient_profile.get("gender") if patient_profile else None,
        preferred_language=data.preferred_language or "English",
    )

    return {"report_id": report_id, "status": "chatting"}


@router.post("/chat/{report_id}")
async def send_chat_message(
    report_id: int, data: ChatMessage, user: dict = Depends(get_current_user)
):
    """Send a message in the patient-AI conversation."""
    if user["role"] != "patient":
        raise HTTPException(status_code=403, detail="Only patients can chat")

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Chat session not found")
    if report["patient_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if report["status"] != "chatting":
        raise HTTPException(status_code=400, detail="Chat session is no longer active")

    # Save patient message
    await save_chat_message(report_id, "patient", data.message, data.attachment_url)

    # Get full history for context
    history = await get_chat_history(report_id)

    # Read image attachment if present (base64 + media type for Claude Vision)
    image_b64, image_media_type = _image_from_attachment(data.attachment_url)

    # Build patient context from the report (stored at session creation)
    patient_info = {
        "age": report.get("age"),
        "gender": report.get("gender"),
        "medical_history": report.get("medical_history"),
        "current_medications": report.get("current_medications"),
        "preferred_language": report.get("preferred_language", "English"),
    }

    # Get AI response
    ai_reply = await chat_response(
        message=data.message,
        chat_history=history[
            :-1
        ],  # exclude the message we just saved (it's the current one)
        patient_info=patient_info,
        image_b64=image_b64,
        image_media_type=image_media_type,
    )

    # Save AI response
    await save_chat_message(report_id, "assistant", ai_reply)

    return {"reply": ai_reply}


@router.post("/diagnose/{report_id}", response_model=DiagnosisResponse)
async def generate_diagnosis(report_id: int, user: dict = Depends(get_current_user)):
    """End chat and generate a structured diagnosis from the full conversation."""
    if user["role"] != "patient":
        raise HTTPException(
            status_code=403, detail="Only patients can request diagnosis"
        )

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Chat session not found")
    if report["patient_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if report["status"] != "chatting":
        raise HTTPException(status_code=400, detail="Diagnosis already generated")

    # Get full chat history
    history = await get_chat_history(report_id)
    if not history:
        raise HTTPException(
            status_code=400, detail="No chat messages found. Chat first!"
        )

    preferred_language = report.get("preferred_language", "English")

    # Generate diagnosis from the full conversation
    ai_result = await generate_diagnosis_from_chat(
        chat_history=history,
        medical_history=report.get("medical_history", ""),
        current_medications=report.get("current_medications", ""),
        age=report.get("age"),
        gender=report.get("gender"),
        preferred_language=preferred_language,
    )

    # Summarize patient messages as the symptoms field
    symptoms_summary = " | ".join(
        msg["content"] for msg in history if msg["role"] == "patient"
    )

    # Update the report with diagnosis data (English + optional local-language fields)
    await update_report_with_diagnosis(
        report_id=report_id,
        symptoms_summary=symptoms_summary,
        primary_condition=ai_result["primary_condition"],
        confidence=ai_result["confidence"],
        urgency=ai_result["urgency"],
        recommended_actions=ai_result["recommended_actions"],
        differential_diagnoses=ai_result["differential_diagnoses"],
        description=ai_result["description"],
        primary_condition_local=ai_result.get("primary_condition_local"),
        recommended_actions_local=ai_result.get("recommended_actions_local"),
        differential_diagnoses_local=ai_result.get("differential_diagnoses_local"),
        description_local=ai_result.get("description_local"),
    )

    return DiagnosisResponse(
        report_id=report_id,
        primary_condition=ai_result["primary_condition"],
        confidence=ai_result["confidence"],
        urgency=ai_result["urgency"],
        recommended_actions=ai_result["recommended_actions"],
        differential_diagnoses=ai_result["differential_diagnoses"],
        description=ai_result["description"],
        primary_condition_local=ai_result.get("primary_condition_local"),
        recommended_actions_local=ai_result.get("recommended_actions_local"),
        differential_diagnoses_local=ai_result.get("differential_diagnoses_local"),
        description_local=ai_result.get("description_local"),
    )


@router.post("/respond/{report_id}")
async def respond_to_feedback(
    report_id: int,
    data: PatientFeedbackResponse,
    user: dict = Depends(get_current_user),
):
    """Patient responds to doctor's feedback request."""
    if user["role"] != "patient":
        raise HTTPException(status_code=403, detail="Only patients can respond")

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report["patient_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if report["status"] != "feedback_requested":
        raise HTTPException(
            status_code=400, detail="No feedback pending for this report"
        )

    # Translate patient response to English for the doctor (if patient's language is non-English)
    preferred_language = report.get("preferred_language", "English")
    msg_en = None
    if preferred_language and preferred_language.strip().lower() != "english":
        msg_en = await translate_message(data.message, "English")

    # Save patient response — message = original (patient's language), message_local = English for doctor
    await save_doctor_patient_message(
        report_id=report_id,
        sender_role="patient",
        message=data.message,
        message_local=msg_en,
        attachment_url=data.attachment_url,
    )

    # Move back to pending_review for doctor
    await update_report_status(report_id, "pending_review")

    return {"message": "Response sent to doctor", "status": "pending_review"}


@router.get("/reports")
async def get_my_reports(user: dict = Depends(get_current_user)):
    """Get all diagnosis reports for the logged-in patient."""
    if user["role"] != "patient":
        raise HTTPException(
            status_code=403, detail="Only patients can view their reports"
        )

    reports = await get_reports_for_patient(user["user_id"])
    return {"reports": reports}


@router.get("/report/{report_id}")
async def get_single_report(report_id: int, user: dict = Depends(get_current_user)):
    """Get a specific diagnosis report with chat history, feedback thread, and final report."""
    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report["patient_id"] != user["user_id"] and user["role"] != "doctor":
        raise HTTPException(status_code=403, detail="Access denied")

    chat = await get_chat_history(report_id)
    feedback_thread = await get_doctor_patient_messages(report_id)
    return {**report, "chat_history": chat, "feedback_thread": feedback_thread}


@router.delete("/report/{report_id}")
async def delete_report(report_id: int, user: dict = Depends(get_current_user)):
    """Delete a diagnosis report (only if patient owns it and it's in chatting status)."""
    if user["role"] != "patient":
        raise HTTPException(
            status_code=403, detail="Only patients can delete their reports"
        )

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report["patient_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Notify the assigned doctor before deleting
    if report.get("doctor_id"):
        patient = await get_user_by_id(user["user_id"])
        patient_name = patient["name"] if patient else "A patient"
        condition = report.get("primary_condition") or f"Report #{report_id}"
        await create_doctor_notification(
            report["doctor_id"],
            f"{patient_name} deleted report #{report_id} ({condition}) which you were reviewing.",
        )

    from database import delete_report as db_delete_report

    await db_delete_report(report_id)

    return {"message": "Report deleted successfully"}


@router.get("/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    """Get the logged-in patient's profile details."""
    if user["role"] != "patient":
        raise HTTPException(status_code=403, detail="Only patients can access this")
    profile = await get_user_by_id(user["user_id"])
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "name": profile["name"],
        "email": profile["email"],
        "age": profile.get("age"),
        "gender": profile.get("gender"),
        "created_at": profile.get("created_at"),
    }


@router.post("/understand-report/{report_id}")
async def understand_report(
    report_id: int,
    data: UnderstandReportRequest,
    user: dict = Depends(get_current_user),
):
    """Explain the completed diagnosis in plain language. Stateless — history passed by frontend."""
    if user["role"] != "patient":
        raise HTTPException(
            status_code=403, detail="Only patients can use this feature"
        )

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report["patient_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if report["status"] != "completed":
        raise HTTPException(
            status_code=400, detail="This report has not been finalized by a doctor yet"
        )
    if not report.get("final_diagnosis"):
        raise HTTPException(
            status_code=400, detail="No final report found for this diagnosis"
        )

    report_context = f"""=== Patient Background ===
Age: {report.get("age") or "Not provided"}
Gender: {report.get("gender") or "Not provided"}
Known Medical History / Long-term Conditions: {report.get("medical_history") or "None mentioned"}
Current Medications (before this visit): {report.get("current_medications") or "None mentioned"}

=== Doctor's Final Report ===
Condition Diagnosed: {report.get("final_diagnosis", "Not provided")}
Urgency Level: {report.get("urgency", "Not provided")}
Prescribed Medications: {report.get("prescribed_medications") or "None"}
Dosage Instructions: {report.get("dosage_instructions") or "Not provided"}
Follow-up Date: {report.get("follow_up_date") or "Not specified"}
Diet & Lifestyle Advice: {report.get("diet_lifestyle") or "Not provided"}
Additional Instructions: {report.get("additional_instructions") or "None"}
Doctor's Notes: {report.get("doctor_comments") or "None"}
=== End of Report ==="""

    preferred_language = report.get("preferred_language", "English")
    response_text = await explain_diagnosis(
        report_context=report_context,
        message=data.message,
        chat_history=data.chat_history,
        preferred_language=preferred_language,
    )
    return {"response": response_text, "preferred_language": preferred_language}
