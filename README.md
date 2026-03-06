# AI for Bharat — Rural Healthcare Diagnosis System

An AI-powered telemedicine platform designed for rural India, enabling patients and community health workers (ASHA workers) to describe symptoms and receive a preliminary AI-generated diagnosis, which is then reviewed and finalized by a licensed doctor.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [User Roles & Workflows](#user-roles--workflows)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Running Locally](#running-locally)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [Database Schema](#database-schema)
- [Known Limitations](#known-limitations)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Rural India faces a severe shortage of doctors, with many patients traveling hours to reach the nearest clinic. **AI for Bharat** bridges this gap by:

1. Letting patients (or ASHA community health workers on their behalf) describe symptoms via a conversational AI chat.
2. Generating a structured preliminary diagnosis with a confidence score and urgency level.
3. Routing cases to a doctor who reviews, modifies if needed, and finalizes the diagnosis with a prescription.
4. Delivering the final report back to the patient in their **preferred regional language**.

---

## Features

### For Patients
- Conversational symptom intake chat with an AI doctor
- Multi-language support (Hindi, Bengali, Telugu, Marathi, Tamil, Gujarati, Kannada, Malayalam, Punjabi, Odia, English)
- AI-generated preliminary diagnosis with confidence score and urgency level
- View finalized prescription and doctor notes
- "Understand My Diagnosis" — plain-language AI explanation of the final report
- Image/document attachment support (medical reports, photos of symptoms)
- Doctor ↔ patient feedback thread for follow-up questions

### For ASHA Workers (Community Health Workers)
- Submit cases on behalf of patients who cannot access technology
- Full conversational AI intake on behalf of the patient
- Track all submitted cases and their status in a dashboard
- Respond to doctor feedback on the patient's behalf
- "Understand My Diagnosis" — explain completed reports in simple language

### For Doctors
- Prioritized queue of pending cases (critical urgency shown first)
- Full case view: patient chat history, AI diagnosis, medical history, feedback thread
- Accept or modify AI diagnosis
- Write full prescription (medications, dosage, follow-up date, diet/lifestyle advice)
- Request additional information from the patient
- AI Research Assistant — query medical literature and drug interactions with case context
- Notification system for new cases

### System
- JWT-based authentication
- Role-based access control (patient / doctor / asha_worker)
- File uploads (images & PDFs, 10 MB limit)
- Report status lifecycle management

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (SPA)                        │
│        Vanilla JS · Hash routing · Dark glassmorphism        │
│   Patient UI │ Doctor UI │ ASHA Worker UI │ Auth Pages       │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP (JWT Bearer)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     FastAPI Backend                          │
│   /api/auth  │  /api/patient  │  /api/doctor  │  /api/asha  │
│                  Uvicorn (ASGI server)                       │
└────────────┬──────────────────────────────┬─────────────────┘
             │                              │
             ▼                              ▼
┌────────────────────┐          ┌──────────────────────────────┐
│   SQLite Database  │          │      AWS Bedrock (AI)         │
│   (aiosqlite)      │          │  Claude Opus 4.5              │
│                    │          │  DeepSeek v3.2                │
│  users             │          │  (+ Hugging Face fallback)    │
│  diagnosis_reports │          └──────────────────────────────┘
│  chat_messages     │
│  final_reports     │
│  doctor_patient_   │
│    messages        │
│  doctor_notifs     │
└────────────────────┘
```

### Report Status Flow

```
chatting ──► pending_review ──► under_review ──► completed
                    │                  │
                    └──► feedback_requested ──┘
                         (doctor asks patient
                          for more info)
```

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Backend Framework | FastAPI | 0.115.0 |
| ASGI Server | Uvicorn | 0.30.6 |
| Database | SQLite (aiosqlite) | 0.20.0 |
| Authentication | PyJWT | 2.9.0 |
| Data Validation | Pydantic | 2.9.2 |
| AI Platform | AWS Bedrock | (boto3) |
| AI Models | Claude Opus 4.5, DeepSeek v3.2 | via Bedrock |
| AI Fallback | Hugging Face (Qwen3-8B) | via huggingface-hub |
| File Uploads | python-multipart | 0.0.12 |
| Frontend | Vanilla JS (SPA) | — |
| Styling | CSS3 (dark glassmorphism) | — |

---

## User Roles & Workflows

### Patient
```
Register → Start Chat → Describe Symptoms (+ attach images) → AI Generates Diagnosis
→ Doctor Reviews → (Optional: Doctor requests feedback → Patient responds)
→ Doctor Finalizes → Patient reads report + prescription
→ "Understand My Diagnosis" for plain-language explanation
```

### ASHA Worker (Community Health Worker)
```
Login → New Patient Case (enter patient details + language) → Chat on patient's behalf
→ Generate Diagnosis → Doctor Reviews → (Optional: Feedback loop)
→ Doctor Finalizes → ASHA Worker explains result to patient
```

### Doctor
```
Login → View Pending Cases (sorted by urgency) → Open Case (read chat + AI diagnosis)
→ (Optional: Use AI Research Assistant) → (Optional: Request patient feedback)
→ Submit Final Review (approve or modify AI diagnosis + write prescription)
→ Case marked Completed
```

---

## Project Structure

```
ai_for_bharat/
├── backend/
│   ├── main.py                  # FastAPI app, route registration, file upload
│   ├── auth.py                  # JWT creation & verification, password hashing
│   ├── database.py              # SQLite schema, migrations, query helpers
│   ├── models.py                # Pydantic request/response models & enums
│   ├── requirements.txt         # Python dependencies
│   ├── uploads/                 # Uploaded files (local dev)
│   ├── routes/
│   │   ├── auth_routes.py       # POST /api/register, POST /api/login
│   │   ├── patient_routes.py    # Patient diagnosis workflow
│   │   ├── doctor_routes.py     # Doctor review & research
│   │   └── asha_routes.py       # ASHA worker case management
│   └── services/
│       ├── bedrock_client.py    # AWS Bedrock multi-model client
│       ├── ai_doctor.py         # Chat, diagnosis generation, translation
│       ├── ai_research.py       # Research assistant for doctors
│       └── prompts.py           # System prompts for all AI tasks
├── frontend/
│   ├── index.html               # SPA entry point
│   ├── index.css                # Design system & component styles
│   └── js/
│       ├── app.js               # Router, apiFetch, shared utilities
│       ├── auth.js              # Login & register pages
│       ├── patient.js           # Patient dashboard, chat, report view
│       ├── doctor.js            # Doctor dashboard, review, research
│       └── asha.js              # ASHA worker dashboard & case management
├── design.md                    # Architecture & design document
├── requirements.md              # Feature requirements & acceptance criteria
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.12+
- pip
- An AWS account with Bedrock access (Claude Opus 4.5 and/or DeepSeek models enabled in your region)
- *(Optional)* A Hugging Face API token for the fallback model

### Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd ai_for_bharat

# 2. Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Linux / macOS
# venv\Scripts\activate         # Windows

# 3. Install Python dependencies
pip install -r backend/requirements.txt
```

### Environment Variables

Create a `.env` file inside the `backend/` directory:

```env
# AWS credentials — do not commit real keys to version control
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=ap-south-1

# Optional: Hugging Face fallback model
HUGGINGFACE_API_KEY=your_hf_token
HUGGINGFACEHUB_API_TOKEN=your_hf_token
```

Also update the JWT secret key in `backend/auth.py`:

```python
SECRET_KEY = "your-strong-random-secret-key"  # change this before deploying
```

### Running Locally

```bash
cd backend
uvicorn main:app --reload --port 8000
```

The server starts at `http://localhost:8000`.

FastAPI serves the frontend static files automatically. Open `http://localhost:8000` in your browser — the full application (frontend + API) is available at that single address.

> The `API_BASE` in `frontend/js/app.js` can be set to an empty string `''` for same-origin local development, or to your deployed server URL for production.

---

## API Reference

All protected endpoints require an `Authorization: Bearer <token>` header obtained from login or register.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/register` | Register a new user (patient / doctor / asha_worker) |
| `POST` | `/api/login` | Login and receive a JWT |

### Patient

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/patient/start-chat` | Start a new diagnosis chat session |
| `POST` | `/api/patient/chat/{report_id}` | Send a message (supports image attachment) |
| `POST` | `/api/patient/generate/{report_id}` | Trigger AI diagnosis generation |
| `POST` | `/api/patient/feedback/{report_id}` | Respond to doctor's feedback request |
| `GET` | `/api/patient/reports` | List all patient reports |
| `GET` | `/api/patient/report/{report_id}` | Get full report with chat history |
| `POST` | `/api/patient/understand-report/{report_id}` | Get plain-language AI explanation |
| `DELETE` | `/api/patient/report/{report_id}` | Delete a chatting-stage report |

### Doctor

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/doctor/profile` | Doctor profile & stats |
| `GET` | `/api/doctor/notifications` | Unread notifications |
| `GET` | `/api/doctor/pending` | Pending cases (sorted by urgency) |
| `GET` | `/api/doctor/my-reports` | Doctor's reviewed cases |
| `GET` | `/api/doctor/report/{report_id}` | Full case details |
| `POST` | `/api/doctor/review/{report_id}` | Submit final diagnosis & prescription |
| `POST` | `/api/doctor/feedback/{report_id}` | Request additional info from patient |
| `POST` | `/api/doctor/research/{report_id}` | Query AI research assistant |

### ASHA Worker

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/asha/start-case` | Start a new case for a patient |
| `POST` | `/api/asha/chat/{report_id}` | Chat on the patient's behalf |
| `POST` | `/api/asha/diagnose/{report_id}` | Generate AI diagnosis |
| `GET` | `/api/asha/cases` | List all submitted cases |
| `GET` | `/api/asha/case/{report_id}` | Get full case details |
| `POST` | `/api/asha/respond/{report_id}` | Respond to doctor feedback |
| `POST` | `/api/asha/understand-case/{report_id}` | Get plain-language explanation |
| `GET` | `/api/asha/profile` | ASHA worker profile & case stats |

### File Upload

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload an image or document (max 10 MB) |

**Allowed file types:** `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.pdf`, `.doc`, `.docx`

---

## Deployment

The backend is a standard FastAPI application and can be deployed on any server or platform that supports Python.

### Production with Gunicorn + Uvicorn workers

For a production server (e.g. an EC2 instance, DigitalOcean Droplet, or any VPS):

```bash
pip install gunicorn
cd backend
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Using a Reverse Proxy (recommended)

Place **Nginx** or **Caddy** in front of Uvicorn to handle TLS, compression, and static file caching:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Environment notes for production

- Set `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` as server environment variables (not in a committed `.env` file).
- Set a strong, random `SECRET_KEY` in `backend/auth.py` or load it from an environment variable.
- The SQLite database file (`backend/healthcare.db`) is stored on disk and persists across restarts. Back it up regularly. For high-traffic production use, consider migrating to **PostgreSQL** with an async driver such as `asyncpg`.

---

## Database Schema

```
users
  id, name, email (unique), password_hash, role, specialization,
  age, gender, registration_number, created_at

diagnosis_reports
  id, patient_id (fk), symptoms, medical_history, current_medications,
  age, gender, preferred_language,
  primary_condition, confidence, urgency, recommended_actions,
  differential_diagnoses, description,
  [+ *_local variants for regional language translations]
  status, doctor_id (fk), asha_worker_id (fk),
  patient_name_text, patient_age_text, patient_gender_text, created_at

final_reports
  id, report_id (fk), patient_id (fk), doctor_id (fk),
  original_ai_diagnosis, final_diagnosis, doctor_comments, modified,
  prescribed_medications, dosage_instructions, follow_up_date,
  diet_lifestyle, additional_instructions,
  [+ *_local variants], created_at

chat_messages
  id, report_id (fk), role (patient|assistant), content, attachment_url, created_at

doctor_patient_messages
  id, report_id (fk), sender_role (doctor|patient), message, message_local,
  attachment_url, created_at

doctor_notifications
  id, doctor_id (fk), message, is_read, created_at
```

---

## Known Limitations

| Area | Issue | Recommended Fix |
|---|---|---|
| Security | Password hashed with SHA-256 (no salt) | Use `bcrypt` or `argon2` |
| Security | JWT `SECRET_KEY` hardcoded in source | Load from environment variable |
| Security | CORS set to `allow_origins=["*"]` | Restrict to known origins in production |
| Database | SQLite does not support high concurrency | Migrate to PostgreSQL for production |
| Database | No connection pooling | Use an async connection pool |
| AI | No second-opinion validation (AI Validate) | Planned feature |
| Auth | No token refresh mechanism | Implement refresh token flow |
| Compliance | No audit trail / e-signature on prescriptions | Required for regulatory approval |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m "Add your feature"`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a Pull Request

Please follow the existing code structure — FastAPI route handlers in `routes/`, AI logic in `services/`, Pydantic models in `models.py`.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
