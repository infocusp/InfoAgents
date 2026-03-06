"""Pydantic models for request/response validation."""

from pydantic import BaseModel, EmailStr
from typing import Optional
from enum import Enum


# ── Enums ──────────────────────────────────────────────────────────────────


class UserRole(str, Enum):
    PATIENT = "patient"
    DOCTOR = "doctor"
    ASHA_WORKER = "asha_worker"


class ReportStatus(str, Enum):
    CHATTING = "chatting"
    PENDING_REVIEW = "pending_review"
    FEEDBACK_REQUESTED = "feedback_requested"
    UNDER_REVIEW = "under_review"
    COMPLETED = "completed"


class UrgencyLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# ── Auth Models ────────────────────────────────────────────────────────────


class UserRegister(BaseModel):
    name: str
    email: str
    password: str
    role: UserRole
    specialization: Optional[str] = None  # for doctors
    age: Optional[int] = None  # for patients
    gender: Optional[str] = None  # for patients
    registration_number: Optional[str] = None  # mandatory for doctors and ASHA workers


class UserLogin(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    role: str
    user_id: int
    name: str


# ── Patient Models ─────────────────────────────────────────────────────────


class PatientSymptoms(BaseModel):
    symptoms: str  # free-text symptom description
    medical_history: Optional[str] = ""
    current_medications: Optional[str] = ""
    age: Optional[int] = None
    gender: Optional[str] = None


class DiagnosisResponse(BaseModel):
    report_id: int
    primary_condition: str
    confidence: float
    urgency: str
    recommended_actions: str
    differential_diagnoses: str
    description: str
    # Optional local-language translations (populated for non-English preferred_language)
    primary_condition_local: Optional[str] = None
    recommended_actions_local: Optional[str] = None
    differential_diagnoses_local: Optional[str] = None
    description_local: Optional[str] = None


class StartChat(BaseModel):
    medical_history: Optional[str] = ""
    current_medications: Optional[str] = ""
    preferred_language: Optional[str] = "English"


class ChatMessage(BaseModel):
    message: str
    attachment_url: Optional[str] = None  # optional uploaded file URL


class PatientFeedbackResponse(BaseModel):
    message: str
    attachment_url: Optional[str] = None


class UnderstandReportRequest(BaseModel):
    message: Optional[str] = None  # None on first call → generates initial explanation
    chat_history: list[dict] = []  # [{role: "user"|"assistant", content: "..."}]
    # preferred_language is read from the report (set at diagnosis start) — not sent by client


# ── Doctor Models ──────────────────────────────────────────────────────────


class DoctorReview(BaseModel):
    final_diagnosis: str
    doctor_comments: str
    modified: bool = False
    is_final: bool = True
    # Prescription template fields (required when is_final=True)
    prescribed_medications: Optional[str] = ""
    dosage_instructions: Optional[str] = ""
    follow_up_date: Optional[str] = ""
    diet_lifestyle: Optional[str] = ""
    additional_instructions: Optional[str] = ""


class DoctorFeedbackRequest(BaseModel):
    message: str


class ResearchQuery(BaseModel):
    query: str
    context: Optional[str] = ""  # optional diagnosis context


# ── ASHA Worker Models ──────────────────────────────────────────────────────


class AshaStartCase(BaseModel):
    patient_name: str
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None
    medical_history: Optional[str] = ""
    current_medications: Optional[str] = ""
    preferred_language: Optional[str] = "English"
