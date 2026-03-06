"""SQLite database setup and helper functions."""

import aiosqlite
import os

IS_LAMBDA = bool(os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))

LOCAL_DB_PATH = os.path.join(os.path.dirname(__file__), "healthcare.db")
DB_PATH = "/tmp/healthcare.db" if IS_LAMBDA else LOCAL_DB_PATH  # or your local path


async def get_db():
    """Get a database connection."""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    return db


async def init_db():
    """Create all tables on startup."""
    db = await get_db()
    try:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('patient', 'doctor', 'asha_worker')),
                specialization TEXT,
                age INTEGER,
                gender TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS diagnosis_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL,
                symptoms TEXT NOT NULL DEFAULT '',
                medical_history TEXT DEFAULT '',
                current_medications TEXT DEFAULT '',
                age INTEGER,
                gender TEXT,
                preferred_language TEXT NOT NULL DEFAULT 'English',
                primary_condition TEXT DEFAULT '',
                primary_condition_local TEXT,
                confidence REAL DEFAULT 0.0,
                urgency TEXT DEFAULT 'medium',
                recommended_actions TEXT DEFAULT '',
                recommended_actions_local TEXT,
                differential_diagnoses TEXT DEFAULT '',
                differential_diagnoses_local TEXT,
                description TEXT DEFAULT '',
                description_local TEXT,
                status TEXT NOT NULL DEFAULT 'chatting'
                    CHECK(status IN ('chatting', 'pending_review', 'feedback_requested', 'under_review', 'completed')),
                doctor_id INTEGER,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (patient_id) REFERENCES users(id),
                FOREIGN KEY (doctor_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS final_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                report_id INTEGER NOT NULL,
                patient_id INTEGER NOT NULL,
                doctor_id INTEGER NOT NULL,
                original_ai_diagnosis TEXT NOT NULL,
                final_diagnosis TEXT NOT NULL,
                final_diagnosis_local TEXT,
                doctor_comments TEXT DEFAULT '',
                doctor_comments_local TEXT,
                modified INTEGER NOT NULL DEFAULT 0,
                prescribed_medications TEXT DEFAULT '',
                prescribed_medications_local TEXT,
                dosage_instructions TEXT DEFAULT '',
                dosage_instructions_local TEXT,
                follow_up_date TEXT DEFAULT '',
                diet_lifestyle TEXT DEFAULT '',
                diet_lifestyle_local TEXT,
                additional_instructions TEXT DEFAULT '',
                additional_instructions_local TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (report_id) REFERENCES diagnosis_reports(id),
                FOREIGN KEY (patient_id) REFERENCES users(id),
                FOREIGN KEY (doctor_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                report_id INTEGER NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('patient', 'assistant')),
                content TEXT NOT NULL,
                attachment_url TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (report_id) REFERENCES diagnosis_reports(id)
            );

            CREATE TABLE IF NOT EXISTS doctor_patient_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                report_id INTEGER NOT NULL,
                sender_role TEXT NOT NULL CHECK(sender_role IN ('doctor', 'patient')),
                message TEXT NOT NULL,
                message_local TEXT,
                attachment_url TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (report_id) REFERENCES diagnosis_reports(id)
            );

            CREATE TABLE IF NOT EXISTS doctor_notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                doctor_id INTEGER NOT NULL,
                message TEXT NOT NULL,
                is_read INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (doctor_id) REFERENCES users(id)
            );
        """)
        await db.commit()

        # Simple ADD COLUMN migrations (fail silently if column already exists)
        for migration in [
            "ALTER TABLE users ADD COLUMN age INTEGER",
            "ALTER TABLE users ADD COLUMN gender TEXT",
            "ALTER TABLE diagnosis_reports ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'English'",
            "ALTER TABLE diagnosis_reports ADD COLUMN primary_condition_local TEXT",
            "ALTER TABLE diagnosis_reports ADD COLUMN recommended_actions_local TEXT",
            "ALTER TABLE diagnosis_reports ADD COLUMN differential_diagnoses_local TEXT",
            "ALTER TABLE diagnosis_reports ADD COLUMN description_local TEXT",
            "ALTER TABLE final_reports ADD COLUMN final_diagnosis_local TEXT",
            "ALTER TABLE final_reports ADD COLUMN doctor_comments_local TEXT",
            "ALTER TABLE final_reports ADD COLUMN prescribed_medications_local TEXT",
            "ALTER TABLE final_reports ADD COLUMN dosage_instructions_local TEXT",
            "ALTER TABLE final_reports ADD COLUMN diet_lifestyle_local TEXT",
            "ALTER TABLE final_reports ADD COLUMN additional_instructions_local TEXT",
            "ALTER TABLE doctor_patient_messages ADD COLUMN message_local TEXT",
            "ALTER TABLE diagnosis_reports ADD COLUMN asha_worker_id INTEGER REFERENCES users(id)",
            "ALTER TABLE diagnosis_reports ADD COLUMN patient_name_text TEXT",
            "ALTER TABLE diagnosis_reports ADD COLUMN patient_age_text INTEGER",
            "ALTER TABLE diagnosis_reports ADD COLUMN patient_gender_text TEXT",
            "ALTER TABLE users ADD COLUMN registration_number TEXT",
        ]:
            try:
                await db.execute(migration)
                await db.commit()
            except Exception:
                pass  # column already exists

        # One-time migration: rebuild users table to add 'asha_worker' to role CHECK constraint.
        # Guarded by sqlite_master check so it only runs when actually needed, never on every restart.
        cur = await db.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
        )
        row = await cur.fetchone()
        if row and "asha_worker" not in row[0]:
            await db.executescript("""
                CREATE TABLE IF NOT EXISTS users_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('patient', 'doctor', 'asha_worker')),
                    specialization TEXT,
                    age INTEGER,
                    gender TEXT,
                    registration_number TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
                INSERT OR IGNORE INTO users_new
                    (id, name, email, password_hash, role, specialization, age, gender, created_at)
                    SELECT id, name, email, password_hash, role, specialization, age, gender, created_at
                    FROM users;
                ALTER TABLE users RENAME TO users_old;
                ALTER TABLE users_new RENAME TO users;
                DROP TABLE IF EXISTS users_old;
            """)
            await db.commit()
    finally:
        await db.close()


# ── User helpers ───────────────────────────────────────────────────────────


async def create_user(
    name: str,
    email: str,
    password_hash: str,
    role: str,
    specialization: str | None = None,
    age: int | None = None,
    gender: str | None = None,
    registration_number: str | None = None,
) -> int:
    db = await get_db()
    try:
        cursor = await db.execute(
            "INSERT INTO users (name, email, password_hash, role, specialization, age, gender, registration_number) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                name,
                email,
                password_hash,
                role,
                specialization,
                age,
                gender,
                registration_number,
            ),
        )
        await db.commit()
        return cursor.lastrowid
    finally:
        await db.close()


async def get_user_by_email(email: str) -> dict | None:
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM users WHERE email = ?", (email,))
        row = await cursor.fetchone()
        return dict(row) if row else None
    finally:
        await db.close()


async def get_user_by_id(user_id: int) -> dict | None:
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = await cursor.fetchone()
        return dict(row) if row else None
    finally:
        await db.close()


# ── Diagnosis report helpers ───────────────────────────────────────────────


async def create_diagnosis_report(
    patient_id: int,
    symptoms: str,
    medical_history: str,
    current_medications: str,
    age: int | None,
    gender: str | None,
    primary_condition: str,
    confidence: float,
    urgency: str,
    recommended_actions: str,
    differential_diagnoses: str,
    description: str,
) -> int:
    db = await get_db()
    try:
        cursor = await db.execute(
            """INSERT INTO diagnosis_reports
               (patient_id, symptoms, medical_history, current_medications,
                age, gender, primary_condition, confidence, urgency,
                recommended_actions, differential_diagnoses, description)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                patient_id,
                symptoms,
                medical_history,
                current_medications,
                age,
                gender,
                primary_condition,
                confidence,
                urgency,
                recommended_actions,
                differential_diagnoses,
                description,
            ),
        )
        await db.commit()
        return cursor.lastrowid
    finally:
        await db.close()


async def delete_stale_chat_sessions(patient_id: int) -> None:
    """Delete all chatting-status reports for a patient (abandoned sessions)."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id FROM diagnosis_reports WHERE patient_id = ? AND status = 'chatting'",
            (patient_id,),
        )
        rows = await cursor.fetchall()
        for row in rows:
            stale_id = row["id"]
            await db.execute(
                "DELETE FROM chat_messages WHERE report_id = ?", (stale_id,)
            )
            await db.execute("DELETE FROM diagnosis_reports WHERE id = ?", (stale_id,))
        await db.commit()
    finally:
        await db.close()


async def create_asha_chat_session(
    asha_worker_id: int,
    patient_name: str,
    patient_age: int | None = None,
    patient_gender: str | None = None,
    medical_history: str = "",
    current_medications: str = "",
    preferred_language: str = "English",
) -> int:
    """Create a shell diagnosis report for an ASHA-assisted case (no patient account)."""
    db = await get_db()
    try:
        cursor = await db.execute(
            """INSERT INTO diagnosis_reports
               (patient_id, symptoms, medical_history, current_medications, age, gender,
                preferred_language, status, asha_worker_id, patient_name_text,
                patient_age_text, patient_gender_text)
               VALUES (?, '', ?, ?, ?, ?, ?, 'chatting', ?, ?, ?, ?)""",
            (
                asha_worker_id,
                medical_history,
                current_medications,
                patient_age,
                patient_gender,
                preferred_language,
                asha_worker_id,
                patient_name,
                patient_age,
                patient_gender,
            ),
        )
        await db.commit()
        return cursor.lastrowid
    finally:
        await db.close()


async def get_asha_reports(asha_worker_id: int) -> list[dict]:
    """Get all cases submitted by an ASHA worker (excluding active chatting sessions)."""
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT dr.id, dr.patient_name_text, dr.patient_age_text, dr.patient_gender_text,
                      dr.primary_condition, dr.urgency, dr.confidence, dr.status,
                      dr.created_at, dr.preferred_language, dr.doctor_id,
                      fr.created_at as review_date
               FROM diagnosis_reports dr
               LEFT JOIN final_reports fr ON fr.report_id = dr.id
               WHERE dr.asha_worker_id = ? AND dr.status != 'chatting'
               ORDER BY dr.created_at DESC""",
            (asha_worker_id,),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def create_chat_session(
    patient_id: int,
    medical_history: str = "",
    current_medications: str = "",
    age: int | None = None,
    gender: str | None = None,
    preferred_language: str = "English",
) -> int:
    """Create a shell diagnosis report for the chat phase."""
    db = await get_db()
    try:
        cursor = await db.execute(
            """INSERT INTO diagnosis_reports
               (patient_id, symptoms, medical_history, current_medications, age, gender, preferred_language, status)
               VALUES (?, '', ?, ?, ?, ?, ?, 'chatting')""",
            (
                patient_id,
                medical_history,
                current_medications,
                age,
                gender,
                preferred_language,
            ),
        )
        await db.commit()
        return cursor.lastrowid
    finally:
        await db.close()


async def update_report_with_diagnosis(
    report_id: int,
    symptoms_summary: str,
    primary_condition: str,
    confidence: float,
    urgency: str,
    recommended_actions: str,
    differential_diagnoses: str,
    description: str,
    primary_condition_local: str | None = None,
    recommended_actions_local: str | None = None,
    differential_diagnoses_local: str | None = None,
    description_local: str | None = None,
) -> None:
    """Fill in the AI diagnosis and move status to pending_review."""
    db = await get_db()
    try:
        await db.execute(
            """UPDATE diagnosis_reports SET
               symptoms = ?, primary_condition = ?, confidence = ?,
               urgency = ?, recommended_actions = ?,
               differential_diagnoses = ?, description = ?,
               primary_condition_local = ?, recommended_actions_local = ?,
               differential_diagnoses_local = ?, description_local = ?,
               status = 'pending_review'
               WHERE id = ?""",
            (
                symptoms_summary,
                primary_condition,
                confidence,
                urgency,
                recommended_actions,
                differential_diagnoses,
                description,
                primary_condition_local,
                recommended_actions_local,
                differential_diagnoses_local,
                description_local,
                report_id,
            ),
        )
        await db.commit()
    finally:
        await db.close()


async def update_report_status(
    report_id: int, status: str, doctor_id: int | None = None
) -> None:
    """Update a report's status and optionally assign a doctor."""
    db = await get_db()
    try:
        if doctor_id:
            await db.execute(
                "UPDATE diagnosis_reports SET status = ?, doctor_id = ? WHERE id = ?",
                (status, doctor_id, report_id),
            )
        else:
            await db.execute(
                "UPDATE diagnosis_reports SET status = ? WHERE id = ?",
                (status, report_id),
            )
        await db.commit()
    finally:
        await db.close()


async def get_reports_for_patient(patient_id: int) -> list[dict]:
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT dr.*, u.name as patient_name,
                      fr.final_diagnosis, fr.doctor_comments, fr.modified as was_modified,
                      du.name as doctor_name,
                      fr.created_at as review_date
               FROM diagnosis_reports dr
               JOIN users u ON dr.patient_id = u.id
               LEFT JOIN final_reports fr ON dr.id = fr.report_id
               LEFT JOIN users du ON fr.doctor_id = du.id
               WHERE dr.patient_id = ?
               ORDER BY 
                 CASE 
                   WHEN dr.status = 'completed' THEN 1
                   WHEN dr.status = 'feedback_requested' THEN 2
                   WHEN dr.doctor_id IS NOT NULL THEN 3
                   WHEN dr.status = 'pending_review' THEN 4
                   ELSE 5
                 END,
                 COALESCE(fr.created_at, dr.created_at) DESC""",
            (patient_id,),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def get_pending_reports() -> list[dict]:
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT dr.*, u.name as patient_name
               FROM diagnosis_reports dr
               JOIN users u ON dr.patient_id = u.id
               WHERE dr.status = 'pending_review' AND dr.doctor_id IS NULL
               ORDER BY
                 CASE dr.urgency
                   WHEN 'critical' THEN 0
                   WHEN 'high' THEN 1
                   WHEN 'medium' THEN 2
                   WHEN 'low' THEN 3
                 END,
                 dr.created_at ASC""",
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def get_report_by_id(report_id: int) -> dict | None:
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT dr.*, u.name as patient_name,
                      fr.final_diagnosis, fr.final_diagnosis_local,
                      fr.doctor_comments, fr.doctor_comments_local,
                      fr.modified as was_modified,
                      fr.prescribed_medications, fr.prescribed_medications_local,
                      fr.dosage_instructions, fr.dosage_instructions_local,
                      fr.follow_up_date,
                      fr.diet_lifestyle, fr.diet_lifestyle_local,
                      fr.additional_instructions, fr.additional_instructions_local,
                      fr.created_at as review_date, du.name as doctor_name
               FROM diagnosis_reports dr
               JOIN users u ON dr.patient_id = u.id
               LEFT JOIN final_reports fr ON dr.id = fr.report_id
               LEFT JOIN users du ON fr.doctor_id = du.id
               WHERE dr.id = ?""",
            (report_id,),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None
    finally:
        await db.close()


async def create_final_report(
    report_id: int,
    patient_id: int,
    doctor_id: int,
    original_ai_diagnosis: str,
    final_diagnosis: str,
    doctor_comments: str,
    modified: bool,
    prescribed_medications: str = "",
    dosage_instructions: str = "",
    follow_up_date: str = "",
    diet_lifestyle: str = "",
    additional_instructions: str = "",
    final_diagnosis_local: str | None = None,
    doctor_comments_local: str | None = None,
    prescribed_medications_local: str | None = None,
    dosage_instructions_local: str | None = None,
    diet_lifestyle_local: str | None = None,
    additional_instructions_local: str | None = None,
) -> int:
    db = await get_db()
    try:
        cursor = await db.execute(
            """INSERT INTO final_reports
               (report_id, patient_id, doctor_id, original_ai_diagnosis,
                final_diagnosis, final_diagnosis_local,
                doctor_comments, doctor_comments_local, modified,
                prescribed_medications, prescribed_medications_local,
                dosage_instructions, dosage_instructions_local,
                follow_up_date, diet_lifestyle, diet_lifestyle_local,
                additional_instructions, additional_instructions_local)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                report_id,
                patient_id,
                doctor_id,
                original_ai_diagnosis,
                final_diagnosis,
                final_diagnosis_local,
                doctor_comments,
                doctor_comments_local,
                int(modified),
                prescribed_medications,
                prescribed_medications_local,
                dosage_instructions,
                dosage_instructions_local,
                follow_up_date,
                diet_lifestyle,
                diet_lifestyle_local,
                additional_instructions,
                additional_instructions_local,
            ),
        )
        await db.execute(
            "UPDATE diagnosis_reports SET status = 'completed', doctor_id = ? WHERE id = ?",
            (doctor_id, report_id),
        )
        await db.commit()
        return cursor.lastrowid
    finally:
        await db.close()


async def get_doctor_reports(doctor_id: int) -> list[dict]:
    """Get all reports a doctor has interacted with (feedback_requested, completed, pending_review with doctor_id)."""
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT dr.*, u.name as patient_name,
                      fr.final_diagnosis, fr.doctor_comments
               FROM diagnosis_reports dr
               JOIN users u ON dr.patient_id = u.id
               LEFT JOIN final_reports fr ON dr.id = fr.report_id
               WHERE dr.doctor_id = ?
               ORDER BY dr.created_at DESC""",
            (doctor_id,),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


# ── Chat message helpers ───────────────────────────────────────────────────


async def save_chat_message(
    report_id: int, role: str, content: str, attachment_url: str | None = None
) -> int:
    """Save a single chat message (patient or assistant)."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "INSERT INTO chat_messages (report_id, role, content, attachment_url) VALUES (?, ?, ?, ?)",
            (report_id, role, content, attachment_url),
        )
        await db.commit()
        return cursor.lastrowid
    finally:
        await db.close()


async def get_chat_history(report_id: int) -> list[dict]:
    """Get all chat messages for a diagnosis report, ordered chronologically."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, role, content, attachment_url, created_at FROM chat_messages "
            "WHERE report_id = ? ORDER BY created_at ASC, id ASC",
            (report_id,),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


# ── Doctor-patient message helpers ─────────────────────────────────────────


async def save_doctor_patient_message(
    report_id: int,
    sender_role: str,
    message: str,
    message_local: str | None = None,
    attachment_url: str | None = None,
) -> int:
    """Save a doctor-patient feedback message."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "INSERT INTO doctor_patient_messages (report_id, sender_role, message, message_local, attachment_url) "
            "VALUES (?, ?, ?, ?, ?)",
            (report_id, sender_role, message, message_local, attachment_url),
        )
        await db.commit()
        return cursor.lastrowid
    finally:
        await db.close()


async def get_doctor_patient_messages(report_id: int) -> list[dict]:
    """Get all doctor-patient feedback messages for a report."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, sender_role, message, message_local, attachment_url, created_at "
            "FROM doctor_patient_messages "
            "WHERE report_id = ? ORDER BY created_at ASC, id ASC",
            (report_id,),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def delete_report(report_id: int) -> None:
    """Delete a diagnosis report and all associated data (chat messages, feedback, final report)."""
    db = await get_db()
    try:
        # Delete in order: chat messages, doctor-patient messages, final report, then the report itself
        await db.execute("DELETE FROM chat_messages WHERE report_id = ?", (report_id,))
        await db.execute(
            "DELETE FROM doctor_patient_messages WHERE report_id = ?", (report_id,)
        )
        await db.execute("DELETE FROM final_reports WHERE report_id = ?", (report_id,))
        await db.execute("DELETE FROM diagnosis_reports WHERE id = ?", (report_id,))
        await db.commit()
    finally:
        await db.close()


async def create_doctor_notification(doctor_id: int, message: str) -> None:
    """Insert a notification for a doctor."""
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO doctor_notifications (doctor_id, message) VALUES (?, ?)",
            (doctor_id, message),
        )
        await db.commit()
    finally:
        await db.close()


async def get_unread_doctor_notifications(doctor_id: int) -> list[dict]:
    """Return all unread notifications for a doctor."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, message, created_at FROM doctor_notifications "
            "WHERE doctor_id = ? AND is_read = 0 ORDER BY created_at DESC",
            (doctor_id,),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def mark_doctor_notifications_read(doctor_id: int) -> None:
    """Mark all notifications for a doctor as read."""
    db = await get_db()
    try:
        await db.execute(
            "UPDATE doctor_notifications SET is_read = 1 WHERE doctor_id = ?",
            (doctor_id,),
        )
        await db.commit()
    finally:
        await db.close()
