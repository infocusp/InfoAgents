"""Doctor routes — review diagnoses, feedback loop, and AI research assistant."""

from fastapi import APIRouter, Depends, HTTPException
from models import DoctorReview, DoctorFeedbackRequest, ResearchQuery
from auth import get_current_user
from database import (
    get_pending_reports,
    get_report_by_id,
    create_final_report,
    get_chat_history,
    get_doctor_patient_messages,
    save_doctor_patient_message,
    update_report_status,
    get_doctor_reports,
    get_user_by_id,
    get_unread_doctor_notifications,
    mark_doctor_notifications_read,
)
from services.ai_research import research_chat
from services.ai_doctor import translate_final_report_fields, translate_message

router = APIRouter(prefix="/api/doctor", tags=["doctor"])


@router.get("/profile")
async def get_doctor_profile(user: dict = Depends(get_current_user)):
    """Get the authenticated doctor's profile."""
    if user["role"] != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can access this")
    profile = await get_user_by_id(user["user_id"])
    return {
        "name": profile["name"],
        "email": profile["email"],
        "specialization": profile.get("specialization"),
        "created_at": profile.get("created_at"),
    }


@router.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    """Get unread notifications for the doctor and mark them as read."""
    if user["role"] != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can access this")
    notifications = await get_unread_doctor_notifications(user["user_id"])
    if notifications:
        await mark_doctor_notifications_read(user["user_id"])
    return {"notifications": notifications}


@router.get("/pending")
async def get_pending(user: dict = Depends(get_current_user)):
    """Get all diagnosis reports pending doctor review."""
    if user["role"] != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can access this")

    reports = await get_pending_reports()
    return {"reports": reports}


@router.get("/my-reports")
async def get_my_reports(user: dict = Depends(get_current_user)):
    """Get all reports this doctor has interacted with."""
    if user["role"] != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can access this")

    reports = await get_doctor_reports(user["user_id"])
    return {"reports": reports}


@router.get("/report/{report_id}")
async def get_report_detail(report_id: int, user: dict = Depends(get_current_user)):
    """Get full details of a diagnosis report for review, including chat history."""
    if user["role"] != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can access this")

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    chat = await get_chat_history(report_id)
    feedback_thread = await get_doctor_patient_messages(report_id)
    return {**report, "chat_history": chat, "feedback_thread": feedback_thread}


@router.post("/review/{report_id}")
async def submit_review(
    report_id: int, review: DoctorReview, user: dict = Depends(get_current_user)
):
    """Submit a doctor review — finalize or request feedback."""
    if user["role"] != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can review")

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report["status"] == "completed":
        raise HTTPException(status_code=400, detail="Report already finalized")

    if review.is_final:
        # Translate prescription fields into the patient's preferred language (if non-English)
        local_fields = {}
        preferred_language = report.get("preferred_language", "English")
        if preferred_language and preferred_language.strip().lower() != "english":
            try:
                local_fields = await translate_final_report_fields(
                    final_diagnosis=review.final_diagnosis,
                    doctor_comments=review.doctor_comments or "",
                    prescribed_medications=review.prescribed_medications or "",
                    dosage_instructions=review.dosage_instructions or "",
                    diet_lifestyle=review.diet_lifestyle or "",
                    additional_instructions=review.additional_instructions or "",
                    preferred_language=preferred_language,
                )
            except Exception as e:
                print(f"translate_final_report_fields failed (non-critical): {e}")

        # Finalize the diagnosis with prescription details
        final_id = await create_final_report(
            report_id=report_id,
            patient_id=report["patient_id"],
            doctor_id=user["user_id"],
            original_ai_diagnosis=report["primary_condition"],
            final_diagnosis=review.final_diagnosis,
            doctor_comments=review.doctor_comments,
            modified=review.modified,
            prescribed_medications=review.prescribed_medications or "",
            dosage_instructions=review.dosage_instructions or "",
            follow_up_date=review.follow_up_date or "",
            diet_lifestyle=review.diet_lifestyle or "",
            additional_instructions=review.additional_instructions or "",
            final_diagnosis_local=local_fields.get("final_diagnosis_local"),
            doctor_comments_local=local_fields.get("doctor_comments_local"),
            prescribed_medications_local=local_fields.get(
                "prescribed_medications_local"
            ),
            dosage_instructions_local=local_fields.get("dosage_instructions_local"),
            diet_lifestyle_local=local_fields.get("diet_lifestyle_local"),
            additional_instructions_local=local_fields.get(
                "additional_instructions_local"
            ),
        )
        return {
            "message": "Diagnosis finalized successfully",
            "final_report_id": final_id,
            "status": "completed",
        }
    else:
        # Request feedback from patient — assign doctor to this report
        preferred_language = report.get("preferred_language", "English")
        msg_local = None
        if preferred_language and preferred_language.strip().lower() != "english":
            msg_local = await translate_message(
                review.doctor_comments, preferred_language
            )
        await save_doctor_patient_message(
            report_id=report_id,
            sender_role="doctor",
            message=review.doctor_comments,
            message_local=msg_local,
        )
        await update_report_status(
            report_id, "feedback_requested", doctor_id=user["user_id"]
        )
        return {
            "message": "Feedback requested from patient",
            "status": "feedback_requested",
        }


@router.post("/feedback/{report_id}")
async def send_feedback_message(
    report_id: int, data: DoctorFeedbackRequest, user: dict = Depends(get_current_user)
):
    """Send an additional feedback message to the patient."""
    if user["role"] != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can send feedback")

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    preferred_language = report.get("preferred_language", "English")
    msg_local = None
    if preferred_language and preferred_language.strip().lower() != "english":
        msg_local = await translate_message(data.message, preferred_language)
    await save_doctor_patient_message(
        report_id=report_id,
        sender_role="doctor",
        message=data.message,
        message_local=msg_local,
    )
    await update_report_status(
        report_id, "feedback_requested", doctor_id=user["user_id"]
    )

    return {"message": "Feedback sent to patient", "status": "feedback_requested"}


@router.post("/research/{report_id}")
async def do_research_chat(
    report_id: int, data: ResearchQuery, user: dict = Depends(get_current_user)
):
    """Conversational AI Research Assistant with full case context."""
    if user["role"] != "doctor":
        raise HTTPException(
            status_code=403, detail="Only doctors can use research assistant"
        )

    # Get full report details with chat history
    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # Get patient-AI chat history
    patient_chat = await get_chat_history(report_id)

    # Get doctor-patient feedback thread
    feedback_thread = await get_doctor_patient_messages(report_id)

    # Get research chat history (stored in context for now, or pass empty list)
    research_history = []  # TODO: Store research chat history if needed

    # Build diagnosis info
    diagnosis_info = {
        "primary_condition": report.get("primary_condition"),
        "confidence": report.get("confidence"),
        "urgency": report.get("urgency"),
        "description": report.get("description"),
        "recommended_actions": report.get("recommended_actions"),
        "differential_diagnoses": report.get("differential_diagnoses"),
    }

    result = await research_chat(
        message=data.query,
        chat_history=research_history,
        patient_chat_history=patient_chat,
        feedback_thread=feedback_thread,
        diagnosis_info=diagnosis_info,
    )

    return {"response": result}
