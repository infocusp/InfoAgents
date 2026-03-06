"""ASHA Worker routes — community health workers submitting cases on behalf of patients."""

import os
import base64
import mimetypes
from fastapi import APIRouter, Depends, HTTPException
from models import (
    AshaStartCase,
    ChatMessage,
    DiagnosisResponse,
    UnderstandReportRequest,
)
from auth import get_current_user
from database import (
    create_asha_chat_session,
    get_asha_reports,
    get_report_by_id,
    get_chat_history,
    save_chat_message,
    update_report_with_diagnosis,
    get_doctor_patient_messages,
    save_doctor_patient_message,
    update_report_status,
)
from services.ai_doctor import (
    chat_response,
    generate_diagnosis_from_chat,
    explain_diagnosis,
)

router = APIRouter(prefix="/api/asha", tags=["asha"])

_IS_LAMBDA = bool(os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
_UPLOADS_DIR = (
    "/tmp/uploads"
    if _IS_LAMBDA
    else os.path.join(os.path.dirname(__file__), "..", "uploads")
)


def _image_from_attachment(attachment_url: str | None) -> tuple[str | None, str | None]:
    if not attachment_url:
        return None, None
    filename = attachment_url.split("/")[-1]
    file_path = os.path.join(_UPLOADS_DIR, filename)
    if not os.path.exists(file_path):
        return None, None
    media_type, _ = mimetypes.guess_type(file_path)
    if not media_type or not media_type.startswith("image/"):
        return None, None
    with open(file_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    return b64, media_type


@router.post("/start-case")
async def start_case(data: AshaStartCase, user: dict = Depends(get_current_user)):
    """Start a new case for a patient — called by ASHA worker."""
    if user["role"] != "asha_worker":
        raise HTTPException(status_code=403, detail="Only ASHA workers can start cases")

    report_id = await create_asha_chat_session(
        asha_worker_id=user["user_id"],
        patient_name=data.patient_name,
        patient_age=data.patient_age,
        patient_gender=data.patient_gender,
        medical_history=data.medical_history or "",
        current_medications=data.current_medications or "",
        preferred_language=data.preferred_language or "English",
    )
    return {"report_id": report_id, "status": "chatting"}


@router.post("/chat/{report_id}")
async def asha_chat(
    report_id: int, data: ChatMessage, user: dict = Depends(get_current_user)
):
    """Send a message in an ASHA-managed chat session."""
    if user["role"] != "asha_worker":
        raise HTTPException(
            status_code=403, detail="Only ASHA workers can use this endpoint"
        )

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Chat session not found")
    if report.get("asha_worker_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if report["status"] != "chatting":
        raise HTTPException(status_code=400, detail="Chat session is no longer active")

    await save_chat_message(report_id, "patient", data.message, data.attachment_url)
    history = await get_chat_history(report_id)

    image_b64, image_media_type = _image_from_attachment(data.attachment_url)

    patient_info = {
        "age": report.get("patient_age_text") or report.get("age"),
        "gender": report.get("patient_gender_text") or report.get("gender"),
        "medical_history": report.get("medical_history"),
        "current_medications": report.get("current_medications"),
        "preferred_language": report.get("preferred_language", "English"),
    }

    ai_reply = await chat_response(
        message=data.message,
        chat_history=history[:-1],
        patient_info=patient_info,
        image_b64=image_b64,
        image_media_type=image_media_type,
    )

    await save_chat_message(report_id, "assistant", ai_reply)
    return {"reply": ai_reply}


@router.post("/diagnose/{report_id}", response_model=DiagnosisResponse)
async def asha_diagnose(report_id: int, user: dict = Depends(get_current_user)):
    """Submit the chat for AI diagnosis — called by ASHA worker."""
    if user["role"] != "asha_worker":
        raise HTTPException(
            status_code=403, detail="Only ASHA workers can use this endpoint"
        )

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Chat session not found")
    if report.get("asha_worker_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if report["status"] != "chatting":
        raise HTTPException(status_code=400, detail="Diagnosis already generated")

    history = await get_chat_history(report_id)
    if not history:
        raise HTTPException(
            status_code=400, detail="No chat messages found. Chat first!"
        )

    preferred_language = report.get("preferred_language", "English")

    ai_result = await generate_diagnosis_from_chat(
        chat_history=history,
        medical_history=report.get("medical_history", ""),
        current_medications=report.get("current_medications", ""),
        age=report.get("patient_age_text") or report.get("age"),
        gender=report.get("patient_gender_text") or report.get("gender"),
        preferred_language=preferred_language,
    )

    symptoms_summary = " | ".join(
        msg["content"] for msg in history if msg["role"] == "patient"
    )

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


@router.get("/cases")
async def get_cases(user: dict = Depends(get_current_user)):
    """Get all cases submitted by this ASHA worker."""
    if user["role"] != "asha_worker":
        raise HTTPException(status_code=403, detail="Only ASHA workers can access this")
    reports = await get_asha_reports(user["user_id"])
    return {"reports": reports}


@router.get("/case/{report_id}")
async def get_asha_case_detail(report_id: int, user: dict = Depends(get_current_user)):
    """Get full case detail — chat history, feedback thread, final report."""
    if user["role"] != "asha_worker":
        raise HTTPException(status_code=403, detail="Only ASHA workers can access this")

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Case not found")
    if report.get("asha_worker_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    chat = await get_chat_history(report_id)
    feedback_thread = await get_doctor_patient_messages(report_id)
    return {**report, "chat_history": chat, "feedback_thread": feedback_thread}


@router.post("/respond/{report_id}")
async def asha_respond_to_feedback(
    report_id: int, data: ChatMessage, user: dict = Depends(get_current_user)
):
    """ASHA worker responds to doctor's feedback request on behalf of the patient."""
    if user["role"] != "asha_worker":
        raise HTTPException(status_code=403, detail="Only ASHA workers can respond")

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.get("asha_worker_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if report["status"] != "feedback_requested":
        raise HTTPException(
            status_code=400, detail="No feedback pending for this report"
        )

    await save_doctor_patient_message(
        report_id=report_id,
        sender_role="patient",
        message=data.message,
        attachment_url=data.attachment_url,
    )
    await update_report_status(report_id, "pending_review")
    return {"message": "Response sent to doctor", "status": "pending_review"}


@router.post("/understand-case/{report_id}")
async def understand_case(
    report_id: int,
    data: UnderstandReportRequest,
    user: dict = Depends(get_current_user),
):
    """Explain the completed diagnosis in plain language for the ASHA worker."""
    if user["role"] != "asha_worker":
        raise HTTPException(
            status_code=403, detail="Only ASHA workers can use this feature"
        )

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Case not found")
    if report.get("asha_worker_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if report["status"] != "completed":
        raise HTTPException(
            status_code=400, detail="This report has not been finalized by a doctor yet"
        )
    if not report.get("final_diagnosis"):
        raise HTTPException(
            status_code=400, detail="No final report found for this diagnosis"
        )

    report_context = "\n".join(
        [
            "=== Patient Background ===",
            f"Age: {report.get('patient_age_text') or 'Not provided'}",
            f"Gender: {report.get('patient_gender_text') or 'Not provided'}",
            f"Known Medical History / Long-term Conditions: {report.get('medical_history') or 'None mentioned'}",
            f"Current Medications (before this visit): {report.get('current_medications') or 'None mentioned'}",
            "",
            "=== Doctor's Final Report ===",
            f"Condition Diagnosed: {report.get('final_diagnosis', 'Not provided')}",
            f"Urgency Level: {report.get('urgency', 'Not provided')}",
            f"Prescribed Medications: {report.get('prescribed_medications') or 'None'}",
            f"Dosage Instructions: {report.get('dosage_instructions') or 'Not provided'}",
            f"Follow-up Date: {report.get('follow_up_date') or 'Not specified'}",
            f"Diet & Lifestyle Advice: {report.get('diet_lifestyle') or 'Not provided'}",
            f"Additional Instructions: {report.get('additional_instructions') or 'None'}",
            f"Doctor's Notes: {report.get('doctor_comments') or 'None'}",
            "=== End of Report ===",
        ]
    )

    preferred_language = report.get("preferred_language", "English")
    response_text = await explain_diagnosis(
        report_context=report_context,
        message=data.message,
        chat_history=data.chat_history,
        preferred_language=preferred_language,
    )
    return {"response": response_text, "preferred_language": preferred_language}


@router.get("/profile")
async def get_asha_profile(user: dict = Depends(get_current_user)):
    """Get ASHA worker's profile and case counts."""
    if user["role"] != "asha_worker":
        raise HTTPException(status_code=403, detail="Only ASHA workers can access this")
    from database import get_user_by_id

    profile = await get_user_by_id(user["user_id"])
    if not profile:
        raise HTTPException(
            status_code=404, detail="User profile not found. Please log in again."
        )
    reports = await get_asha_reports(user["user_id"])
    in_review = sum(
        1
        for r in reports
        if (r["status"] == "pending_review" and r.get("doctor_id"))
        or r["status"] in ("under_review", "feedback_requested")
    )
    waiting = sum(
        1 for r in reports if r["status"] == "pending_review" and not r.get("doctor_id")
    )
    return {
        "name": profile["name"],
        "email": profile["email"],
        "created_at": profile.get("created_at"),
        "total_cases": len(reports),
        "completed_cases": sum(1 for r in reports if r["status"] == "completed"),
        "in_review_cases": in_review,
        "waiting_cases": waiting,
    }
