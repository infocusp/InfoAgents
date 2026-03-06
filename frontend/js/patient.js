/* ══════════════════════════════════════════════════════════════════════════
   Patient Pages — Dashboard, AI Chatbot, Feedback Response, Prescription
   ══════════════════════════════════════════════════════════════════════════ */

// ── Language constants (shared across diagnosis chat + understand route) ───

const PATIENT_LANGUAGES = [
    { name: 'English',   code: 'en-IN', native: 'English',   abbr: 'EN' },
    { name: 'Hindi',     code: 'hi-IN', native: 'हिंदी',     abbr: 'हि' },
    { name: 'Bengali',   code: 'bn-IN', native: 'বাংলা',     abbr: 'বা' },
    { name: 'Telugu',    code: 'te-IN', native: 'తెలుగు',    abbr: 'తె' },
    { name: 'Marathi',   code: 'mr-IN', native: 'मराठी',     abbr: 'म' },
    { name: 'Tamil',     code: 'ta-IN', native: 'தமிழ்',     abbr: 'த' },
    { name: 'Gujarati',  code: 'gu-IN', native: 'ગુજરાતી',  abbr: 'ગ' },
    { name: 'Kannada',   code: 'kn-IN', native: 'ಕನ್ನಡ',    abbr: 'ಕ' },
    { name: 'Malayalam', code: 'ml-IN', native: 'മലയാളം',   abbr: 'മ' },
    { name: 'Punjabi',   code: 'pa-IN', native: 'ਪੰਜਾਬੀ',  abbr: 'ਪ' },
    { name: 'Odia',      code: 'or-IN', native: 'ଓଡ଼ିଆ',    abbr: 'ଓ' },
];
const LANG_BY_NAME = Object.fromEntries(PATIENT_LANGUAGES.map(l => [l.name, l]));

// ── Helper: upload a file ─────────────────────────────────────────────────

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    const token = getToken();
    const res = await fetch(`${window.API_BASE}/api/upload`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(err.detail);
    }
    return res.json();
}

function renderAttachment(url) {
    if (!url) return '';
    const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(url);
    if (isImage) {
        return `<div class="attachment-preview"><img src="${url}" alt="attachment" class="chat-image" onclick="window.open('${url}','_blank')"></div>`;
    }
    const filename = url.split('/').pop();
    return `<div class="attachment-preview"><a href="${url}" target="_blank" class="attachment-link">📎 ${filename}</a></div>`;
}

// ── Patient Dashboard ─────────────────────────────────────────────────────

let _patientDashReports = [];

window.applyPatientFilter = function(filter) {
    document.querySelectorAll('#patient-filter-pills .filter-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.filter === filter);
    });

    let filtered;
    if (filter === 'completed') {
        filtered = _patientDashReports.filter(r => r.status === 'completed');
    } else if (filter === 'in_review') {
        filtered = _patientDashReports.filter(r =>
            (r.status === 'pending_review' && r.doctor_id) ||
            r.status === 'under_review' ||
            r.status === 'feedback_requested'
        );
    } else if (filter === 'waiting') {
        filtered = _patientDashReports.filter(r => r.status === 'pending_review' && !r.doctor_id);
    } else {
        filtered = _patientDashReports;
    }

    const grid = document.getElementById('patient-reports-grid');
    if (!grid) return;
    if (filtered.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:2rem">
            <div class="empty-state-icon">🔍</div>
            <p class="empty-state-text">No reports in this category</p>
        </div>`;
    } else {
        grid.innerHTML = filtered.map(r => renderReportCard(r)).join('');
    }
};

registerRoute('/patient', async (app) => {
    const user = getUser();
    if (!user || user.role !== 'patient') { navigate('/login'); return; }

    app.innerHTML = renderNavbar('patient') + `
    <div class="page-container">
        <div class="page-header">
            <div>
                <h1 class="page-title">Your Health Dashboard</h1>
                <p class="page-subtitle">View your diagnosis history and start new consultations</p>
            </div>
            <button class="btn btn-teal btn-lg" onclick="navigate('/patient/chat')">
                💬 Start New Diagnosis
            </button>
        </div>
        <div id="reports-area">
            <div class="empty-state">
                <div class="spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto"></div>
                <p style="margin-top:1rem;color:var(--text-muted)">Loading your reports...</p>
            </div>
        </div>
    </div>`;

    try {
        const data = await apiFetch('/api/patient/reports');
        // Exclude abandoned chat sessions — they have no diagnosis and are cleaned
        // up automatically the next time the patient starts a new chat.
        data.reports = (data.reports || []).filter(r => r.status !== 'chatting');
        const area = document.getElementById('reports-area');

        if (!data.reports || data.reports.length === 0) {
            area.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🩺</div>
                    <p class="empty-state-text">No diagnoses yet</p>
                    <p style="color:var(--text-muted);margin-bottom:1.5rem">
                        Start a conversation with our AI assistant to get a preliminary diagnosis.
                    </p>
                    <button class="btn btn-teal" onclick="navigate('/patient/chat')">
                        Start Your First Diagnosis
                    </button>
                </div>`;
            return;
        }

        _patientDashReports = data.reports;

        const total = data.reports.length;
        const completed = data.reports.filter(r => r.status === 'completed').length;
        const feedback = data.reports.filter(r => r.status === 'feedback_requested').length;
        const pending = data.reports.filter(r => r.status === 'pending_review').length;
        const inReview = data.reports.filter(r =>
            (r.status === 'pending_review' && r.doctor_id) ||
            r.status === 'under_review' ||
            r.status === 'feedback_requested'
        ).length;
        const waiting = data.reports.filter(r => r.status === 'pending_review' && !r.doctor_id).length;

        area.innerHTML = `
            <div class="stats-row">
                <div class="card stat-card">
                    <div class="stat-value">${total}</div>
                    <div class="stat-label">Total Reports</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-value">${completed}</div>
                    <div class="stat-label">Doctor Reviewed</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-value">${pending}</div>
                    <div class="stat-label">Awaiting Review</div>
                </div>
                ${feedback > 0 ? `
                <div class="card stat-card" style="border-color:rgba(245,158,11,0.4)">
                    <div class="stat-value" style="background:linear-gradient(135deg,var(--accent-amber),var(--accent-rose));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${feedback}</div>
                    <div class="stat-label">Needs Your Response</div>
                </div>` : ''}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
                <h2 style="font-size:1.2rem;margin:0">Your Reports</h2>
                <div style="display:flex;gap:1rem;font-size:0.85rem;color:var(--text-muted)">
                    <span>✅ ${completed} Completed</span>
                    ${inReview > 0 ? `<span>👨‍⚕️ ${inReview} In Review</span>` : ''}
                    ${waiting > 0 ? `<span>⏰ ${waiting} Waiting</span>` : ''}
                </div>
            </div>
            <div class="filter-pills" id="patient-filter-pills">
                <button class="filter-pill active" data-filter="all" onclick="applyPatientFilter('all')">All</button>
                <button class="filter-pill" data-filter="completed" onclick="applyPatientFilter('completed')">✅ Completed</button>
                <button class="filter-pill" data-filter="in_review" onclick="applyPatientFilter('in_review')">👨‍⚕️ In Review</button>
                <button class="filter-pill" data-filter="waiting" onclick="applyPatientFilter('waiting')">⏰ Waiting for a Doctor</button>
            </div>
            <div class="card-grid" id="patient-reports-grid">
                ${data.reports.map(r => renderReportCard(r)).join('')}
            </div>`;

        // Auto-apply filter if navigated from profile page
        if (window._patientFilterOnLoad) {
            const f = window._patientFilterOnLoad;
            window._patientFilterOnLoad = null;
            applyPatientFilter(f);
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
});

function renderReportCard(r) {
    // Determine status with better labels
    let statusInfo;
    if (r.status === 'completed') {
        statusInfo = { cls: 'completed', label: '✅ Doctor Reviewed', priority: 1 };
    } else if (r.status === 'feedback_requested') {
        statusInfo = { cls: 'feedback', label: '🔄 Doctor Needs More Info', priority: 2 };
    } else if (r.status === 'pending_review' && r.doctor_id) {
        statusInfo = { cls: 'under-review', label: '👨‍⚕️ Doctor Reviewing', priority: 3 };
    } else if (r.status === 'pending_review' && !r.doctor_id) {
        statusInfo = { cls: 'waiting', label: '⏰ Waiting for a Doctor', priority: 4 };
    } else if (r.status === 'chatting') {
        statusInfo = { cls: 'chatting', label: '💬 Chat in Progress', priority: 5 };
    } else {
        statusInfo = { cls: 'pending', label: '⏳ ' + r.status, priority: 6 };
    }
    
    const date = new Date(r.created_at).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric'
    });

    return `
    <div class="card" style="position:relative">
        <button class="btn btn-secondary btn-sm" 
                style="position:absolute;top:0.75rem;right:0.75rem;padding:0.25rem 0.5rem;font-size:0.75rem"
                onclick="event.stopPropagation();deleteReport(${r.id},'${r.status}',${r.doctor_id ? 1 : 0})"
                title="Delete this report">
            🗑️
        </button>        <div onclick="navigate('/patient/report/${r.id}')" style="cursor:pointer">
            <div class="card-header">
                <div class="card-title">${r.primary_condition || 'Chat Session'}</div>
                <span class="badge badge-${r.urgency || 'medium'}">${r.urgency || '—'}</span>
            </div>
            <span class="badge badge-status-${statusInfo.cls}" style="margin-bottom:0.75rem">${statusInfo.label}</span>
            ${r.doctor_name && r.status !== 'completed' ? `
            <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem">
                👨‍⚕️ Assigned to Dr. ${r.doctor_name}
            </div>` : ''}
            ${r.confidence ? `
            <div class="diagnosis-field" style="margin-top:0.5rem">
                <div class="diagnosis-field-label">AI Confidence</div>
                <div class="confidence-bar">
                    <div class="confidence-bar-fill" style="width:${Math.round(r.confidence * 100)}%"></div>
                </div>
                <span style="font-size:0.8rem;color:var(--text-muted)">${Math.round(r.confidence * 100)}%</span>
            </div>` : ''}
            ${r.status === 'completed' && r.final_diagnosis ? `
            <div class="diagnosis-field">
                <div class="diagnosis-field-label">Doctor's Diagnosis</div>
                <div class="diagnosis-field-value">${r.final_diagnosis}</div>
            </div>` : ''}
            <div style="color:var(--text-muted);font-size:0.8rem;margin-top:0.5rem">📅 ${date}</div>
        </div>
        ${r.status === 'completed' && r.final_diagnosis ? `
        <button class="btn btn-understand btn-sm" style="width:100%;margin-top:0.75rem"
                onclick="navigate('/patient/understand/${r.id}')">
            💡 Understand My Diagnosis
        </button>` : ''}
    </div>`;
}

// ── Patient Report Detail ─────────────────────────────────────────────────

registerRoute('/patient/report/:id', async (app, params) => {
    const user = getUser();
    if (!user || user.role !== 'patient') { navigate('/login'); return; }

    app.innerHTML = renderNavbar('patient') + `
    <div class="page-container" style="max-width:900px">
        <div id="report-detail">
            <div class="empty-state">
                <div class="spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto"></div>
                <p style="margin-top:1rem;color:var(--text-muted)">Loading report...</p>
            </div>
        </div>
    </div>`;

    try {
        const r = await apiFetch(`/api/patient/report/${params.id}`);
        const container = document.getElementById('report-detail');
        
        // Determine status with better labels
        let statusLabel, statusClass;
        if (r.status === 'completed') {
            statusLabel = '✅ Doctor Reviewed';
            statusClass = 'completed';
        } else if (r.status === 'feedback_requested') {
            statusLabel = '🔄 Doctor Needs More Info';
            statusClass = 'feedback';
        } else if (r.status === 'pending_review' && r.doctor_id) {
            statusLabel = '👨‍⚕️ Doctor Reviewing';
            statusClass = 'under-review';
        } else if (r.status === 'pending_review' && !r.doctor_id) {
            statusLabel = '⏰ Waiting for a Doctor';
            statusClass = 'waiting';
        } else if (r.status === 'chatting') {
            statusLabel = '💬 Chat in Progress';
            statusClass = 'chatting';
        } else {
            statusLabel = r.status;
            statusClass = 'pending';
        }

        container.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
                <button class="btn btn-secondary btn-sm" onclick="navigate('/patient')">
                    ← Back to Dashboard
                </button>
                <button class="btn btn-secondary btn-sm" onclick="deleteReport(${r.id},'${r.status}',${r.doctor_id ? 1 : 0})"
                        style="color:var(--accent-rose)" title="Delete this report">
                    🗑️ Delete Report
                </button>
            </div>

            <h1 class="page-title">Diagnosis Report #${r.id}</h1>
            <span class="badge badge-status-${statusClass}"
                  style="margin:0.75rem 0;display:inline-flex">${statusLabel}</span>
            ${r.doctor_name && r.status !== 'completed' ? `
            <div style="font-size:0.9rem;color:var(--text-secondary);margin-top:0.5rem">
                👨‍⚕️ Assigned to Dr. ${r.doctor_name}
            </div>` : ''}

            ${r.chat_history && r.chat_history.length ? `
            <div class="card" style="margin-top:1.5rem">
                <h3 class="card-title" style="margin-bottom:1rem">💬 Chat Conversation</h3>
                <div class="chat-history-panel">
                    ${r.chat_history.map(msg => `
                        <div class="chat-bubble ${msg.role === 'patient' ? 'patient' : 'assistant'}">
                            <div class="bubble-label">${msg.role === 'patient' ? 'You' : 'AI Assistant'}</div>
                            ${escapeHtml(msg.content)}
                            ${renderAttachment(msg.attachment_url)}
                        </div>
                    `).join('')}
                </div>
            </div>` : ''}

            ${r.primary_condition && r.status !== 'chatting' ? `
            <div class="card" style="margin-top:1.5rem;border-color:rgba(59,130,246,0.3);box-shadow:0 0 20px rgba(59,130,246,0.07)">
                <h3 class="card-title" style="color:var(--accent-blue);margin-bottom:1rem">🩺 AI Preliminary Diagnosis</h3>
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Primary Condition</div>
                    <div class="diagnosis-field-value">
                        ${r.primary_condition_local
                            ? `<div style="font-size:1.05rem;font-weight:600">${r.primary_condition_local}</div>
                               <div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.2rem">${r.primary_condition}</div>`
                            : `<div style="font-size:1.05rem;font-weight:600">${r.primary_condition}</div>`}
                    </div>
                </div>
                <div style="display:flex;gap:1.5rem;flex-wrap:wrap">
                    <div class="diagnosis-field">
                        <div class="diagnosis-field-label">Confidence</div>
                        <div class="confidence-bar" style="width:120px">
                            <div class="confidence-bar-fill" style="width:${Math.round((r.confidence || 0) * 100)}%"></div>
                        </div>
                        <span style="font-size:0.85rem">${Math.round((r.confidence || 0) * 100)}%</span>
                    </div>
                    <div class="diagnosis-field">
                        <div class="diagnosis-field-label">Urgency</div>
                        <span class="badge badge-${r.urgency}">${r.urgency}</span>
                    </div>
                </div>
                ${r.description ? `
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Description</div>
                    <div class="diagnosis-field-value">
                        ${r.description_local
                            ? `<div>${r.description_local}</div>
                               <div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.4rem">${r.description}</div>`
                            : `<div>${r.description}</div>`}
                    </div>
                </div>` : ''}
                ${r.recommended_actions ? `
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Recommended Actions</div>
                    <div class="diagnosis-field-value">
                        ${r.recommended_actions_local
                            ? `<div>${r.recommended_actions_local}</div>
                               <div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.3rem">${r.recommended_actions}</div>`
                            : `<div>${r.recommended_actions}</div>`}
                    </div>
                </div>` : ''}
                ${r.differential_diagnoses ? `
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Other Possible Conditions</div>
                    <div class="diagnosis-field-value">
                        ${r.differential_diagnoses_local
                            ? `<div>${r.differential_diagnoses_local}</div>
                               <div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.3rem">${r.differential_diagnoses}</div>`
                            : `<div>${r.differential_diagnoses}</div>`}
                    </div>
                </div>` : ''}
                <p style="color:var(--text-muted);font-size:0.8rem;margin-top:1rem">
                    ⚠️ This is a preliminary AI diagnosis pending doctor review.
                </p>
            </div>` : ''}

            ${r.feedback_thread && r.feedback_thread.length ? `
            <div class="card" style="margin-top:1.5rem;border-color:rgba(245,158,11,0.3)">
                <h3 class="card-title" style="color:var(--accent-amber);margin-bottom:1rem">💬 Doctor-Patient Conversation</h3>
                <div class="chat-history-panel">
                    ${r.feedback_thread.map(msg => `
                        <div class="chat-bubble ${msg.sender_role === 'patient' ? 'patient' : 'assistant'}">
                            <div class="bubble-label">${msg.sender_role === 'patient' ? 'You' : '🩺 Doctor'}</div>
                            ${msg.sender_role === 'doctor' && msg.message_local
                                ? `<div>${escapeHtml(msg.message_local)}</div>
                                   <div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.4rem">${escapeHtml(msg.message)}</div>`
                                : escapeHtml(msg.message)}
                            ${renderAttachment(msg.attachment_url)}
                        </div>
                    `).join('')}
                </div>
            </div>` : ''}

            ${r.status === 'feedback_requested' ? `
            <div id="feedback-response-card" class="card" style="margin-top:1.5rem;border-color:rgba(245,158,11,0.4);box-shadow:0 0 20px rgba(245,158,11,0.1)">
                <h3 class="card-title" style="color:var(--accent-amber);margin-bottom:1rem">📝 Respond to Doctor</h3>
                <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:1rem">
                    The doctor has requested additional information. Please provide your response below.
                </p>
                <div class="form-group">
                    <textarea class="form-textarea" id="patient-response" rows="4"
                              placeholder="Type your response..."></textarea>
                </div>
                <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap">
                    <label class="btn btn-secondary btn-sm" style="cursor:pointer">
                        📎 Attach Image
                        <input type="file" id="feedback-file"
                               accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx"
                               style="display:none" onchange="handleFeedbackFileSelect(this)">
                    </label>
                    <button class="btn-mic" id="feedback-mic-btn" title="Record your response by voice"
                            onclick="toggleFeedbackMic('${r.preferred_language || 'English'}')">🎤</button>
                    <span id="feedback-file-name" style="font-size:0.8rem;color:var(--text-muted)"></span>
                    <button class="btn btn-teal" style="margin-left:auto" id="send-response-btn"
                            onclick="sendPatientResponse(${r.id})">
                        Send Response
                    </button>
                </div>
            </div>` : ''}

            ${r.status === 'completed' && r.final_diagnosis ? `
            <div class="card" style="margin-top:1.5rem;border-color:rgba(34,197,94,0.3);box-shadow:0 0 20px rgba(34,197,94,0.1)">
                <h3 class="card-title" style="color:var(--accent-green);margin-bottom:1rem">
                    ✅ Doctor's Final Prescription
                </h3>
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Final Diagnosis</div>
                    <div class="diagnosis-field-value">
                        ${r.final_diagnosis_local
                            ? `<div style="font-size:1.1rem;font-weight:600">${r.final_diagnosis_local}</div>
                               <div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.2rem">${r.final_diagnosis}</div>`
                            : `<div style="font-size:1.1rem;font-weight:600">${r.final_diagnosis}</div>`}
                    </div>
                </div>
                ${r.prescribed_medications ? `
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Prescribed Medications</div>
                    <div class="diagnosis-field-value">
                        ${r.prescribed_medications_local
                            ? `<div>${r.prescribed_medications_local}</div>
                               <div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.3rem">${r.prescribed_medications}</div>`
                            : r.prescribed_medications}
                    </div>
                </div>` : ''}
                ${r.dosage_instructions ? `
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Dosage Instructions</div>
                    <div class="diagnosis-field-value">
                        ${r.dosage_instructions_local
                            ? `<div>${r.dosage_instructions_local}</div>
                               <div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.3rem">${r.dosage_instructions}</div>`
                            : r.dosage_instructions}
                    </div>
                </div>` : ''}
                ${r.follow_up_date ? `
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Follow-up Date</div>
                    <div class="diagnosis-field-value">${r.follow_up_date}</div>
                </div>` : ''}
                ${r.diet_lifestyle ? `
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Diet & Lifestyle</div>
                    <div class="diagnosis-field-value">
                        ${r.diet_lifestyle_local
                            ? `<div>${r.diet_lifestyle_local}</div>
                               <div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.3rem">${r.diet_lifestyle}</div>`
                            : r.diet_lifestyle}
                    </div>
                </div>` : ''}
                ${r.additional_instructions ? `
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Additional Instructions</div>
                    <div class="diagnosis-field-value">
                        ${r.additional_instructions_local
                            ? `<div>${r.additional_instructions_local}</div>
                               <div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.3rem">${r.additional_instructions}</div>`
                            : r.additional_instructions}
                    </div>
                </div>` : ''}
                ${r.doctor_comments ? `
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Doctor's Notes</div>
                    <div class="diagnosis-field-value">
                        ${r.doctor_comments_local
                            ? `<div>${r.doctor_comments_local}</div>
                               <div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.3rem">${r.doctor_comments}</div>`
                            : r.doctor_comments}
                    </div>
                </div>` : ''}
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Reviewed By</div>
                    <div class="diagnosis-field-value">Dr. ${r.doctor_name || 'Unknown'}</div>
                </div>
                ${r.was_modified ? '<span class="badge badge-medium" style="margin-top:0.5rem">Modified from AI diagnosis</span>' : ''}
                <button class="btn btn-primary btn-lg" style="width:100%;margin-top:1.5rem" onclick="printPrescription(${r.id})">
                    📥 Download Prescription
                </button>
                <button class="btn btn-understand" style="width:100%;margin-top:0.75rem"
                        onclick="navigate('/patient/understand/${r.id}')">
                    💡 Understand your report in simple language
                </button>
            </div>` : ''}
        `;
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// ── Feedback response ─────────────────────────────────────────────────────

let feedbackFileToUpload = null;

let _feedbackMicRecognition = null;

window.toggleFeedbackMic = function (preferredLangName) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast('Voice input not supported in this browser. Please use Chrome or Edge.', 'error');
        return;
    }
    const micBtn = document.getElementById('feedback-mic-btn');
    if (_feedbackMicRecognition) {
        _feedbackMicRecognition.stop();
        return;
    }
    const langInfo = LANG_BY_NAME[preferredLangName];
    const langCode = langInfo ? langInfo.code : 'en-IN';

    _feedbackMicRecognition = new SpeechRecognition();
    _feedbackMicRecognition.lang = langCode;
    _feedbackMicRecognition.continuous = false;
    _feedbackMicRecognition.interimResults = false;

    _feedbackMicRecognition.onstart = () => {
        micBtn.classList.add('btn-mic--recording');
        micBtn.title = 'Click to stop recording';
        showToast('Listening… click mic to stop', 'info');
    };
    _feedbackMicRecognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim();
        const textarea = document.getElementById('patient-response');
        if (textarea && transcript) {
            const existing = textarea.value.trim();
            textarea.value = existing ? existing + ' ' + transcript : transcript;
            textarea.focus();
            showToast('Voice converted to text ✓', 'success');
        }
    };
    _feedbackMicRecognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
            showToast('Microphone permission denied.', 'error');
        } else if (event.error === 'no-speech') {
            showToast('No speech detected. Please try again.', 'info');
        } else {
            showToast('Voice input error: ' + event.error, 'error');
        }
    };
    _feedbackMicRecognition.onend = () => {
        _feedbackMicRecognition = null;
        if (micBtn) { micBtn.classList.remove('btn-mic--recording'); micBtn.title = 'Record your response by voice'; }
    };
    _feedbackMicRecognition.start();
};

window.handleFeedbackFileSelect = function (input) {
    const file = input.files[0] || null;
    if (file && !_validateFileExt(file)) {
        showToast(`Unsupported file type. Allowed: jpg, png, gif, webp, pdf, doc, docx`, 'error');
        input.value = '';
        feedbackFileToUpload = null;
        document.getElementById('feedback-file-name').textContent = '';
        return;
    }
    feedbackFileToUpload = file;
    document.getElementById('feedback-file-name').textContent = file ? file.name : '';
};

window.sendPatientResponse = async function (reportId) {
    const message = document.getElementById('patient-response').value.trim();
    if (!message) { showToast('Please type a response', 'error'); return; }

    const btn = document.getElementById('send-response-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending...';

    try {
        let attachmentUrl = null;
        if (feedbackFileToUpload) {
            const uploaded = await uploadFile(feedbackFileToUpload);
            attachmentUrl = uploaded.url;
            feedbackFileToUpload = null;
        }
        await apiFetch(`/api/patient/respond/${reportId}`, {
            method: 'POST',
            body: JSON.stringify({ message, attachment_url: attachmentUrl }),
        });

        const card = document.getElementById('feedback-response-card');
        if (card) {
            card.style.borderColor = 'rgba(34,197,94,0.4)';
            card.style.boxShadow = '0 0 20px rgba(34,197,94,0.1)';
            card.innerHTML = `
                <div style="text-align:center;padding:1.5rem 1rem">
                    <div style="font-size:2.5rem;margin-bottom:0.75rem">✅</div>
                    <h3 style="font-size:1.1rem;font-weight:600;color:var(--accent-green);margin-bottom:0.5rem">Response Sent!</h3>
                    <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:1.5rem">
                        Your response has been sent to the doctor. They'll review it and get back to you.
                    </p>
                    ${attachmentUrl ? `<p style="color:var(--text-muted);font-size:0.8rem;margin-bottom:1.25rem">📎 Attachment included</p>` : ''}
                    <button class="btn btn-secondary" onclick="navigate('/patient')">← Back to Dashboard</button>
                </div>`;
        }
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Send Response';
    }
};

// ── Prescription PDF (uses doctor-filled template data) ───────────────────

window.printPrescription = async function (reportId) {
    try {
        const r = await apiFetch(`/api/patient/report/${reportId}`);
        const date = new Date(r.review_date || r.created_at).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'long', year: 'numeric'
        });

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Prescription — Report #${r.id}</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Inter', sans-serif; padding: 40px; color: #1a1a2e; line-height: 1.6; }
                .rx-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #3b82f6; padding-bottom: 16px; margin-bottom: 24px; }
                .rx-header h1 { font-size: 22px; color: #3b82f6; }
                .rx-header .meta { text-align: right; font-size: 13px; color: #666; }
                .rx-patient { background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
                .rx-patient .field { font-size: 14px; }
                .rx-patient .field strong { color: #333; }
                .rx-section { margin-bottom: 20px; }
                .rx-section h3 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #3b82f6; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
                .rx-section p { font-size: 14px; color: #334155; }
                .rx-diagnosis { font-size: 20px; font-weight: 700; color: #1a1a2e; margin: 8px 0; }
                .rx-meds { background: #eff6ff; border-radius: 8px; padding: 16px; margin-top: 8px; }
                .rx-meds li { margin-bottom: 4px; font-size: 14px; }
                .rx-footer { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #e2e8f0; padding-top: 16px; }
                .rx-footer .signature { text-align: right; }
                .rx-footer .signature .line { border-top: 1px solid #333; width: 200px; margin-bottom: 4px; }
                .rx-badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
                .rx-badge.high, .rx-badge.critical { background: #fef2f2; color: #dc2626; }
                .rx-badge.medium { background: #fffbeb; color: #d97706; }
                .rx-badge.low { background: #f0fdf4; color: #16a34a; }
                @media print { body { padding: 20px; } }
            </style>
        </head>
        <body>
            <div class="rx-header">
                <div>
                    <h1>🏥 AI Healthcare</h1>
                    <div style="font-size:12px;color:#94a3b8">Medical Prescription</div>
                </div>
                <div class="meta">
                    <div>Report #${r.id}</div>
                    <div>${date}</div>
                </div>
            </div>

            <div class="rx-patient">
                <div class="field"><strong>Patient:</strong> ${r.patient_name}</div>
                <div class="field"><strong>Age:</strong> ${r.age || '—'}</div>
                <div class="field"><strong>Gender:</strong> ${r.gender || '—'}</div>
                <div class="field"><strong>Urgency:</strong> <span class="rx-badge ${r.urgency}">${r.urgency}</span></div>
            </div>

            <div class="rx-section">
                <h3>Final Diagnosis</h3>
                <div class="rx-diagnosis">${r.final_diagnosis}</div>
                ${r.final_diagnosis_local ? `<div style="font-size:16px;color:#475569;margin-top:4px">${r.final_diagnosis_local}</div>` : ''}
            </div>

            ${r.prescribed_medications ? `
            <div class="rx-section">
                <h3>Prescribed Medications</h3>
                <div class="rx-meds">
                    <ul>
                        ${r.prescribed_medications.split(/[,;\n]/).filter(Boolean).map(m => `<li>${m.trim()}</li>`).join('')}
                    </ul>
                </div>
                ${r.prescribed_medications_local ? `<p style="font-size:13px;color:#475569;margin-top:8px">${r.prescribed_medications_local}</p>` : ''}
            </div>` : ''}

            ${r.dosage_instructions ? `
            <div class="rx-section">
                <h3>Dosage Instructions</h3>
                <p>${r.dosage_instructions}</p>
                ${r.dosage_instructions_local ? `<p style="font-size:13px;color:#475569;margin-top:4px">${r.dosage_instructions_local}</p>` : ''}
            </div>` : ''}

            ${r.diet_lifestyle ? `
            <div class="rx-section">
                <h3>Diet & Lifestyle Recommendations</h3>
                <p>${r.diet_lifestyle}</p>
                ${r.diet_lifestyle_local ? `<p style="font-size:13px;color:#475569;margin-top:4px">${r.diet_lifestyle_local}</p>` : ''}
            </div>` : ''}

            ${r.additional_instructions ? `
            <div class="rx-section">
                <h3>Additional Instructions</h3>
                <p>${r.additional_instructions}</p>
                ${r.additional_instructions_local ? `<p style="font-size:13px;color:#475569;margin-top:4px">${r.additional_instructions_local}</p>` : ''}
            </div>` : ''}

            ${r.follow_up_date ? `
            <div class="rx-section">
                <h3>Follow-up</h3>
                <p><strong>${r.follow_up_date}</strong></p>
            </div>` : ''}

            ${r.doctor_comments ? `
            <div class="rx-section">
                <h3>Doctor's Notes</h3>
                <p>${r.doctor_comments}</p>
                ${r.doctor_comments_local ? `<p style="font-size:13px;color:#475569;margin-top:4px">${r.doctor_comments_local}</p>` : ''}
            </div>` : ''}

            <div class="rx-footer">
                <div style="font-size:12px;color:#94a3b8">
                    <p>⚠️ This prescription is generated through AI-assisted diagnosis.</p>
                    <p>Consult your healthcare provider for definitive treatment.</p>
                </div>
                <div class="signature">
                    <div class="line"></div>
                    <div style="font-size:13px;font-weight:600">Dr. ${r.doctor_name || '—'}</div>
                    <div style="font-size:11px;color:#94a3b8">Reviewing Physician</div>
                </div>
            </div>
        </body>
        </html>`);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
    } catch (err) {
        showToast('Failed to generate prescription: ' + err.message, 'error');
    }
};

// ── Patient Chat (AI Diagnosis) ───────────────────────────────────────────

registerRoute('/patient/chat', async (app) => {
    const user = getUser();
    if (!user || user.role !== 'patient') { navigate('/login'); return; }

    let selectedLang = PATIENT_LANGUAGES[0]; // default English

    app.innerHTML = renderNavbar('patient') + `
    <div class="page-container" style="max-width:600px">
        <div class="card">
            <h2 class="card-title" style="margin-bottom:0.5rem">📋 Before We Start</h2>
            <p style="color:var(--text-secondary);margin-bottom:1.5rem;font-size:0.9rem">
                Please provide some basic information. All fields are optional.
            </p>
            <form id="start-chat-form">
                <div class="form-group">
                    <label class="form-label">Medical History</label>
                    <textarea class="form-textarea" id="chat-history"
                              placeholder="Any past illnesses, surgeries, chronic conditions..."></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">Current Medications</label>
                    <input type="text" class="form-input" id="chat-meds"
                           placeholder="e.g. Paracetamol, Metformin">
                </div>
                <div class="form-group">
                    <label class="form-label">Preferred Language for this Consultation</label>
                    <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.75rem">
                        The AI doctor will respond in your chosen language throughout the session.
                    </p>
                    <div class="lang-picker-grid" id="lang-selector">
                        ${PATIENT_LANGUAGES.map(l => `
                            <button type="button" class="lang-btn${l.name === 'English' ? ' selected' : ''}"
                                    data-name="${l.name}" data-code="${l.code}">
                                <span class="lang-btn-native">${l.native}</span>
                                <span class="lang-btn-english">${l.name}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
                <button type="submit" class="btn btn-teal btn-lg" style="width:100%" id="start-btn">
                    💬 Start Chat with AI Doctor
                </button>
            </form>
        </div>
    </div>`;

    document.querySelectorAll('#lang-selector .lang-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#lang-selector .lang-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedLang = { name: btn.dataset.name, code: btn.dataset.code };
        });
    });

    document.getElementById('start-chat-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('start-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Starting...';
        try {
            const data = await apiFetch('/api/patient/start-chat', {
                method: 'POST',
                body: JSON.stringify({
                    medical_history: document.getElementById('chat-history').value || '',
                    current_medications: document.getElementById('chat-meds').value || '',
                    preferred_language: selectedLang.name,
                }),
            });
            // Store language for the chatroom mic
            sessionStorage.setItem('chatLangName', selectedLang.name);
            sessionStorage.setItem('chatLangCode', selectedLang.code);
            sessionStorage.setItem('chatLangAbbr', selectedLang.abbr || selectedLang.name.slice(0, 2).toUpperCase());
            navigate(`/patient/chatroom/${data.report_id}`);
        } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = '💬 Start Chat with AI Doctor';
        }
    });
});

// ── Patient Chatroom ──────────────────────────────────────────────────────

registerRoute('/patient/chatroom/:id', async (app, params) => {
    const user = getUser();
    if (!user || user.role !== 'patient') { navigate('/login'); return; }

    const reportId = params.id;

    app.innerHTML = renderNavbar('patient') + `
    <div class="chat-container">
        <div class="chat-messages" id="chat-messages">
            <div class="chat-bubble assistant">
                <div class="bubble-label">AI Assistant</div>
                Hello! I'm your AI health assistant. Please describe your symptoms and
                I'll help gather information for a doctor to review. What brings you here today?
            </div>
        </div>
        <div id="voice-preview-bar" style="display:none;padding:0.5rem 1rem;background:var(--bg-card);border-top:1px solid var(--border-subtle);align-items:center;gap:0.75rem">
            <span style="font-size:1rem;flex-shrink:0">🎙</span>
            <audio id="voice-preview-audio" controls style="height:32px;flex:1;min-width:0;max-width:260px"></audio>
            <button onclick="discardVoiceRecording()" title="Discard recording"
                    style="background:none;border:none;cursor:pointer;font-size:1.2rem;color:var(--text-muted);padding:0.25rem 0.4rem;line-height:1;flex-shrink:0"
                    onmouseover="this.style.color='#f43f5e'" onmouseout="this.style.color='var(--text-muted)'">✕</button>
        </div>
        <div class="chat-input-area" id="chat-input-area">
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;flex-shrink:0">
                📎
                <input type="file" id="chat-file"
                       accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx"
                       style="display:none" onchange="handleChatFileSelect(this)">
            </label>
            <button class="btn-lang" id="lang-btn" onclick="toggleMicLang()" title="Switch language: English / हिंदी">EN</button>
            <button class="btn-mic" id="mic-btn" title="Click to record voice" onclick="toggleMicRecording()">
                🎤
            </button>
            <input type="text" class="form-input" id="chat-input"
                   placeholder="Describe your symptoms..." autocomplete="off">
            <button class="btn btn-primary" id="send-btn" onclick="sendChatMessage(${reportId})">
                Send
            </button>
        </div>
        <div class="chat-actions" id="chat-actions">
            <button class="btn btn-teal" id="diagnose-btn" onclick="requestDiagnosis(${reportId})">
                🩺 Generate Diagnosis Report
            </button>
            <button class="btn btn-secondary btn-sm" onclick="cancelChat(${reportId})">Cancel</button>
        </div>
    </div>`;

    document.getElementById('chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('send-btn').click();
        }
    });
    document.getElementById('chat-input').focus();

    // Initialise mic language from the session's preferred language
    _chatPrefLangCode = sessionStorage.getItem('chatLangCode') || 'en-IN';
    _chatPrefLangName = sessionStorage.getItem('chatLangName') || 'English';
    _chatPrefLangAbbr = sessionStorage.getItem('chatLangAbbr') || 'EN';
    _micLang = _chatPrefLangCode;
    const langToggleBtn = document.getElementById('lang-btn');
    if (langToggleBtn) {
        langToggleBtn.textContent = _chatPrefLangAbbr;
        // Hide lang toggle when English is selected (no point toggling EN ↔ EN)
        langToggleBtn.style.display = _chatPrefLangCode === 'en-IN' ? 'none' : '';
    }
});

let chatFileToUpload = null;

// ── Speech-to-Text + Audio Recording (Web Speech API + MediaRecorder) ────
let _micLang = 'en-IN';
let _chatPrefLangCode = 'en-IN'; // preferred lang for current diagnosis session
let _chatPrefLangName = 'English';
let _chatPrefLangAbbr = 'EN';
let _recognition = null;
// Audio recording (for playback in patient bubble)
let _mediaRecorder = null;
let _audioChunks = [];
let _lastAudioBlob = null;
// TTS (text-to-speech) text store — indexed by button onclick
const _speakableTexts = [];

// ── Text-to-Speech (Web Speech API) ──────────────────────────────────────
function _resetSpeakButtons() {
    document.querySelectorAll('.btn-speak.speaking').forEach(b => {
        b.classList.remove('speaking');
        b.textContent = '🔊';
        b.title = 'Read aloud';
    });
}

window.speakText = function (text, langCode, btn) {
    if (!window.speechSynthesis) {
        showToast('Text-to-speech is not supported in your browser.', 'error');
        return;
    }
    // If currently speaking → stop (toggle off) and reset all buttons
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        _resetSpeakButtons();
        return;
    }
    // Strip markdown/HTML tags for cleaner speech
    const plain = text.replace(/[*_`#>~\[\]]/g, '').replace(/<[^>]*>/g, '').trim();
    const u = new SpeechSynthesisUtterance(plain);
    u.lang = langCode || 'en-IN';
    u.rate = 0.9;
    u.pitch = 1;
    // Mark the clicked button as active
    if (btn) {
        btn.classList.add('speaking');
        btn.textContent = '⏹';
        btn.title = 'Click to stop';
    }
    // Reset button state when speech ends or errors
    u.onend = _resetSpeakButtons;
    u.onerror = _resetSpeakButtons;
    window.speechSynthesis.speak(u);
};

window.toggleMicLang = function () {
    const langBtn = document.getElementById('lang-btn');
    // Toggle between preferred language and English
    if (_micLang === _chatPrefLangCode && _chatPrefLangCode !== 'en-IN') {
        _micLang = 'en-IN';
        if (langBtn) langBtn.textContent = 'EN';
        showToast('Switched to English', 'info');
    } else {
        _micLang = _chatPrefLangCode;
        if (langBtn) langBtn.textContent = _chatPrefLangAbbr;
        showToast(`Switched to ${_chatPrefLangName}`, 'info');
    }
};

window.toggleMicRecording = function () {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast('Voice input not supported in this browser. Please use Chrome or Edge.', 'error');
        return;
    }

    const micBtn = document.getElementById('mic-btn');

    // If already listening — stop both recognition and recorder
    if (_recognition) {
        _recognition.stop();
        if (_mediaRecorder && _mediaRecorder.state !== 'inactive') _mediaRecorder.stop();
        return;
    }

    // Try to co-start MediaRecorder for audio playback (best-effort — falls back gracefully)
    _audioChunks = [];
    _lastAudioBlob = null;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        _mediaRecorder = new MediaRecorder(stream);
        _mediaRecorder.ondataavailable = e => { if (e.data.size > 0) _audioChunks.push(e.data); };
        _mediaRecorder.onstop = () => {
            if (_audioChunks.length > 0) {
                _lastAudioBlob = new Blob(_audioChunks, { type: _mediaRecorder.mimeType || 'audio/webm' });
                // Show WhatsApp-style preview bar so patient can listen before sending
                const bar = document.getElementById('voice-preview-bar');
                const previewAudio = document.getElementById('voice-preview-audio');
                if (bar && previewAudio) {
                    previewAudio.src = URL.createObjectURL(_lastAudioBlob);
                    bar.style.display = 'flex';
                }
            }
            stream.getTracks().forEach(t => t.stop());
            _mediaRecorder = null;
        };
        _mediaRecorder.start();
    }).catch(() => {
        // getUserMedia denied or unavailable — speech recognition still works, just no audio blob
    });

    _recognition = new SpeechRecognition();
    _recognition.lang = _micLang;
    _recognition.continuous = false;
    _recognition.interimResults = false;

    _recognition.onstart = () => {
        micBtn.classList.add('btn-mic--recording');
        micBtn.title = 'Click to stop';
        showToast(_micLang === 'hi-IN' ? 'सुन रहा है… रोकने के लिए फिर क्लिक करें' : 'Listening… click mic to stop', 'info');
    };

    _recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim();
        const input = document.getElementById('chat-input');
        if (transcript) {
            const existing = input.value.trim();
            input.value = existing ? existing + ' ' + transcript : transcript;
            input.focus();
            showToast('Voice converted to text ✓', 'success');
        }
        // Stop recorder so the blob is finalised before Send is clicked
        if (_mediaRecorder && _mediaRecorder.state !== 'inactive') _mediaRecorder.stop();
    };

    _recognition.onerror = (event) => {
        if (_mediaRecorder && _mediaRecorder.state !== 'inactive') _mediaRecorder.stop();
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            showToast('Microphone permission denied. Please allow mic access in browser settings.', 'error');
        } else if (event.error === 'no-speech') {
            showToast('No speech detected. Please try again.', 'info');
        } else if (event.error === 'network') {
            showToast('Network error during voice recognition. Check your connection.', 'error');
        } else {
            showToast('Voice input error: ' + event.error, 'error');
        }
    };

    _recognition.onend = () => {
        micBtn.classList.remove('btn-mic--recording');
        micBtn.title = 'Click to record voice';
        _recognition = null;
        if (_mediaRecorder && _mediaRecorder.state !== 'inactive') _mediaRecorder.stop();
    };

    _recognition.start();
};

window.discardVoiceRecording = function () {
    _lastAudioBlob = null;
    const bar = document.getElementById('voice-preview-bar');
    const previewAudio = document.getElementById('voice-preview-audio');
    if (previewAudio) { previewAudio.pause(); previewAudio.src = ''; }
    if (bar) bar.style.display = 'none';
    const input = document.getElementById('chat-input');
    if (input) { input.value = ''; input.focus(); }
};

const _ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx']);

function _validateFileExt(file) {
    if (!file) return true;
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    return _ALLOWED_EXTS.has(ext);
}

window.handleChatFileSelect = function (input) {
    const file = input.files[0] || null;
    if (file && !_validateFileExt(file)) {
        showToast(`Unsupported file type. Allowed: jpg, png, gif, webp, pdf, doc, docx`, 'error');
        input.value = '';
        chatFileToUpload = null;
        return;
    }
    chatFileToUpload = file;
    if (chatFileToUpload) showToast(`📎 ${chatFileToUpload.name} attached`, 'info');
};

window.sendChatMessage = async function (reportId) {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message && !chatFileToUpload) return;

    const messagesDiv = document.getElementById('chat-messages');
    const sendBtn = document.getElementById('send-btn');

    let attachmentUrl = null;
    let attachmentHtml = '';
    if (chatFileToUpload) {
        try {
            const uploaded = await uploadFile(chatFileToUpload);
            attachmentUrl = uploaded.url;
            attachmentHtml = renderAttachment(uploaded.url);
        } catch (err) {
            showToast('File upload failed: ' + err.message, 'error');
        }
        chatFileToUpload = null;
    }

    // Consume the audio blob (if a voice recording was made) for inline playback
    let audioHtml = '';
    if (_lastAudioBlob) {
        const audioUrl = URL.createObjectURL(_lastAudioBlob);
        audioHtml = `<audio controls src="${audioUrl}"
            style="display:block;margin-top:0.4rem;height:36px;width:190px;opacity:0.85"></audio>`;
        _lastAudioBlob = null;
        // Hide the preview bar
        const previewAudio = document.getElementById('voice-preview-audio');
        const bar = document.getElementById('voice-preview-bar');
        if (previewAudio) { previewAudio.pause(); previewAudio.src = ''; }
        if (bar) bar.style.display = 'none';
    }

    messagesDiv.innerHTML += `
        <div class="chat-bubble patient">
            <div class="bubble-label">You</div>
            ${message ? escapeHtml(message) : ''}
            ${attachmentHtml}
            ${audioHtml}
        </div>`;
    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    messagesDiv.innerHTML += `
        <div class="typing-indicator" id="typing">
            <span></span><span></span><span></span>
        </div>`;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    try {
        const data = await apiFetch(`/api/patient/chat/${reportId}`, {
            method: 'POST',
            body: JSON.stringify({
                message: message || '[Image attached]',
                attachment_url: attachmentUrl,
            }),
        });
        document.getElementById('typing')?.remove();
        const speakIdx = _speakableTexts.length;
        _speakableTexts.push(data.reply);
        messagesDiv.innerHTML += `
            <div class="chat-bubble assistant">
                <div class="bubble-label">AI Assistant
                    <button class="btn-speak" title="Read aloud"
                            onclick="speakText(_speakableTexts[${speakIdx}], '${_chatPrefLangCode}', this)">🔊</button>
                </div>
                ${renderMarkdown(data.reply)}
            </div>`;
    } catch (err) {
        document.getElementById('typing')?.remove();
        showToast(err.message, 'error');
    }

    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
};

window.requestDiagnosis = async function (reportId) {
    const btn = document.getElementById('diagnose-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Generating diagnosis...';

    try {
        const data = await apiFetch(`/api/patient/diagnose/${reportId}`, { method: 'POST' });
        const conditionDisplay = data.primary_condition_local
            ? `<div style="font-size:1.1rem;font-weight:600">${data.primary_condition_local}</div>
               <div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.2rem">${data.primary_condition}</div>`
            : `<div style="font-size:1.1rem;font-weight:600">${data.primary_condition}</div>`;
        const descDisplay = data.description_local
            ? `<div>${data.description_local}</div>
               <div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.4rem">${data.description}</div>`
            : `<div>${data.description}</div>`;
        const messagesDiv = document.getElementById('chat-messages');
        messagesDiv.innerHTML += `
            <div class="card diagnosis-card" style="margin:0.5rem;max-width:95%">
                <h3 style="margin-bottom:1rem;color:var(--accent-blue)">🩺 Preliminary Diagnosis</h3>
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Primary Condition</div>
                    <div class="diagnosis-field-value">${conditionDisplay}</div>
                </div>
                <div style="display:flex;gap:1.5rem;flex-wrap:wrap">
                    <div class="diagnosis-field">
                        <div class="diagnosis-field-label">Confidence</div>
                        <div class="confidence-bar" style="width:120px">
                            <div class="confidence-bar-fill" style="width:${Math.round(data.confidence * 100)}%"></div>
                        </div>
                        <span style="font-size:0.85rem">${Math.round(data.confidence * 100)}%</span>
                    </div>
                    <div class="diagnosis-field">
                        <div class="diagnosis-field-label">Urgency</div>
                        <span class="badge badge-${data.urgency}">${data.urgency}</span>
                    </div>
                </div>
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Description</div>
                    <div class="diagnosis-field-value">${descDisplay}</div>
                </div>
                <p style="color:var(--text-muted);font-size:0.8rem;margin-top:1rem">
                    ⚠️ A qualified doctor will review your case.
                </p>
            </div>`;
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        document.getElementById('chat-input-area').style.display = 'none';
        document.getElementById('chat-actions').innerHTML = `
            <p style="color:var(--accent-green);font-weight:500">✅ Report submitted for doctor review</p>
            <button class="btn btn-primary" onclick="navigate('/patient')">Back to Dashboard</button>`;
        showToast('Diagnosis report generated!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = '🩺 Generate Diagnosis Report';
    }
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ── Delete Report ─────────────────────────────────────────────────────────

window.deleteReport = async function (reportId, status = '', hasDoctorId = 0) {
    const isInReview = hasDoctorId ||
        status === 'under_review' ||
        status === 'feedback_requested';
    const isCompleted = status === 'completed';

    let confirmMsg;
    if (isCompleted) {
        confirmMsg = 'This report has already been reviewed by the doctor and a prescription is available.\n\nAre you sure you want to permanently delete it?';
    } else if (isInReview) {
        confirmMsg = 'This report is currently being reviewed by a doctor.\n\nDeleting it will remove all data and the doctor will be notified. Are you sure?';
    } else {
        confirmMsg = 'Are you sure you want to delete this report? This action cannot be undone.';
    }

    if (!confirm(confirmMsg)) return;

    try {
        await apiFetch(`/api/patient/report/${reportId}`, { method: 'DELETE' });
        showToast('Report deleted successfully', 'success');
        // If already on the dashboard the hash won't change so hashchange won't fire;
        // call handleRoute() directly to force a re-fetch and re-render.
        if (document.getElementById('patient-reports-grid')) {
            handleRoute();
        } else {
            navigate('/patient');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
};

// ── Cancel Chat Without Saving ────────────────────────────────────────────

window.cancelChat = async function (reportId) {
    if (!confirm('Are you sure you want to cancel? Your chat will not be saved.')) {
        return;
    }

    try {
        // Delete the report (which is still in 'chatting' status)
        await apiFetch(`/api/patient/report/${reportId}`, { method: 'DELETE' });
        showToast('Chat cancelled', 'info');
        navigate('/patient');
    } catch (err) {
        showToast(err.message, 'error');
    }
};

// ── Understand Diagnosis Chat ─────────────────────────────────────────────

registerRoute('/patient/understand/:id', async (app, params) => {
    const user = getUser();
    if (!user || user.role !== 'patient') { navigate('/login'); return; }

    const reportId = params.id;
    let understandHistory = [];
    let micRecognition = null;
    // Language is read from the report (via API response) — starts unknown
    let prefLangCode = 'en-IN';

    app.innerHTML = renderNavbar('patient') + `
    <div class="chat-container">
        <div class="understand-chat-header">
            <button class="btn btn-secondary btn-sm" onclick="navigate('/patient/report/${reportId}')">
                ← Back to Report
            </button>
            <div class="understand-chat-title">
                <span>💡</span>
                <span>Understand Your Diagnosis</span>
            </div>
            <span class="lang-active-badge" id="understand-lang-badge" title="Conversation language">…</span>
        </div>
        <div class="chat-messages" id="understand-messages">
            <div class="chat-bubble assistant" id="initial-message">
                <div class="bubble-label">Health Assistant</div>
                <span style="opacity:0.75">
                    📋 Reading your report and preparing a simple explanation just for you...
                </span>
                <div class="typing-indicator" id="initial-typing" style="margin-top:0.5rem">
                    <span></span><span></span><span></span>
                </div>
            </div>
        </div>
        <div class="chat-input-area">
            <input type="text" class="form-input" id="understand-input"
                   placeholder="Ask a question about your report..." autocomplete="off">
            <button class="btn btn-mic" id="mic-btn" title="Speak your question"
                    onclick="toggleUnderstandMic()">🎤</button>
            <button class="btn btn-understand" id="understand-send-btn"
                    onclick="sendUnderstandMessage(${reportId})">Send</button>
        </div>
    </div>`;

    document.getElementById('understand-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('understand-send-btn').click();
        }
    });

    window.toggleUnderstandMic = function () {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            showToast('Speech recognition is not supported in your browser', 'error');
            return;
        }
        const micBtn = document.getElementById('mic-btn');
        if (micRecognition) {
            micRecognition.stop();
            micRecognition = null;
            micBtn.classList.remove('active');
            micBtn.textContent = '🎤';
            return;
        }
        micRecognition = new SpeechRecognition();
        micRecognition.lang = prefLangCode;  // closure — updated after first API call
        micRecognition.continuous = false;
        micRecognition.interimResults = false;
        micBtn.classList.add('active');
        micBtn.textContent = '⏹';
        micRecognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            const input = document.getElementById('understand-input');
            if (input) input.value = transcript;
            micRecognition = null;
            micBtn.classList.remove('active');
            micBtn.textContent = '🎤';
        };
        micRecognition.onerror = () => {
            micRecognition = null;
            if (micBtn) { micBtn.classList.remove('active'); micBtn.textContent = '🎤'; }
            showToast('Could not capture audio — please try again.', 'error');
        };
        micRecognition.onend = () => {
            micRecognition = null;
            if (micBtn) { micBtn.classList.remove('active'); micBtn.textContent = '🎤'; }
        };
        micRecognition.start();
    };

    // Auto-load initial explanation — backend reads preferred_language from the report
    try {
        const data = await apiFetch(`/api/patient/understand-report/${reportId}`, {
            method: 'POST',
            body: JSON.stringify({ message: null, chat_history: [] }),
        });
        // Update language badge and mic language from the report's stored preferred_language
        if (data.preferred_language) {
            const langInfo = LANG_BY_NAME[data.preferred_language];
            prefLangCode = langInfo ? langInfo.code : 'en-IN';
            const badge = document.getElementById('understand-lang-badge');
            if (badge) badge.textContent = langInfo ? langInfo.native : data.preferred_language;
        }
        document.getElementById('initial-message')?.remove();
        understandHistory.push({ role: 'assistant', content: data.response });
        const messagesDiv = document.getElementById('understand-messages');
        const initSpeakIdx = _speakableTexts.length;
        _speakableTexts.push(data.response);
        messagesDiv.innerHTML += `
            <div class="chat-bubble assistant">
                <div class="bubble-label">Health Assistant
                    <button class="btn-speak" title="Read aloud"
                            onclick="speakText(_speakableTexts[${initSpeakIdx}], '${prefLangCode}', this)">🔊</button>
                </div>
                ${renderMarkdown(data.response)}
            </div>`;
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        document.getElementById('understand-input')?.focus();
    } catch (err) {
        document.getElementById('initial-message')?.remove();
        showToast('Could not load explanation: ' + err.message, 'error');
    }

    window.sendUnderstandMessage = async function (rId) {
        const input = document.getElementById('understand-input');
        const message = input.value.trim();
        if (!message) return;

        const messagesDiv = document.getElementById('understand-messages');
        const sendBtn = document.getElementById('understand-send-btn');
        const historyBeforeSend = [...understandHistory];

        understandHistory.push({ role: 'user', content: message });
        messagesDiv.innerHTML += `
            <div class="chat-bubble patient">
                <div class="bubble-label">You</div>
                ${escapeHtml(message)}
            </div>`;
        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;
        messagesDiv.innerHTML += `<div class="typing-indicator" id="understand-typing"><span></span><span></span><span></span></div>`;
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        try {
            const data = await apiFetch(`/api/patient/understand-report/${rId}`, {
                method: 'POST',
                body: JSON.stringify({ message, chat_history: historyBeforeSend }),
            });
            document.getElementById('understand-typing')?.remove();
            understandHistory.push({ role: 'assistant', content: data.response });
            const uSpeakIdx = _speakableTexts.length;
            _speakableTexts.push(data.response);
            messagesDiv.innerHTML += `
                <div class="chat-bubble assistant">
                    <div class="bubble-label">Health Assistant
                        <button class="btn-speak" title="Read aloud"
                                onclick="speakText(_speakableTexts[${uSpeakIdx}], '${prefLangCode}', this)">🔊</button>
                    </div>
                    ${renderMarkdown(data.response)}
                </div>`;
        } catch (err) {
            document.getElementById('understand-typing')?.remove();
            understandHistory.pop();
            showToast(err.message, 'error');
        }

        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    };
});

// ── Patient Profile ────────────────────────────────────────────────────────

registerRoute('/patient/profile', async (app) => {
    const user = getUser();
    if (!user || user.role !== 'patient') { navigate('/login'); return; }

    app.innerHTML = renderNavbar('patient') + `
    <div class="page-container" style="max-width:600px;margin:0 auto">
        <div class="page-header">
            <div>
                <h1 class="page-title">My Profile</h1>
                <p class="page-subtitle">Your personal health account details</p>
            </div>
        </div>
        <div id="profile-area">
            <div class="empty-state">
                <div class="spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto"></div>
                <p style="margin-top:1rem;color:var(--text-muted)">Loading profile...</p>
            </div>
        </div>
    </div>`;

    try {
        const [profile, reportsData] = await Promise.all([
            apiFetch('/api/patient/profile'),
            apiFetch('/api/patient/reports'),
        ]);

        const reports   = reportsData.reports || [];
        const total     = reports.length;
        const completed = reports.filter(r => r.status === 'completed').length;
        const inReview  = reports.filter(r =>
            (r.status === 'pending_review' && r.doctor_id) ||
            r.status === 'under_review' ||
            r.status === 'feedback_requested'
        ).length;
        const waiting   = reports.filter(r => r.status === 'pending_review' && !r.doctor_id).length;

        const initials = profile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

        const genderLabel = { male: 'Male', female: 'Female', other: 'Other' }[profile.gender] || '—';

        let memberSince = '—';
        if (profile.created_at) {
            const d = new Date(profile.created_at);
            memberSince = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        }

        document.getElementById('profile-area').innerHTML = `
            <div class="card" style="padding:2rem;margin-bottom:1.5rem">
                <div style="display:flex;align-items:center;gap:1.25rem;margin-bottom:1.75rem">
                    <div style="width:64px;height:64px;border-radius:50%;background:var(--accent-blue);
                                display:flex;align-items:center;justify-content:center;
                                font-size:1.4rem;font-weight:700;color:#fff;flex-shrink:0">
                        ${initials}
                    </div>
                    <div>
                        <div style="font-size:1.25rem;font-weight:700">${profile.name}</div>
                        <div style="color:var(--text-secondary);font-size:0.875rem">${profile.email}</div>
                        <div style="color:var(--text-muted);font-size:0.8rem;margin-top:0.2rem">Member since ${memberSince}</div>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
                    <div class="profile-detail-item">
                        <div class="profile-detail-label">Age</div>
                        <div class="profile-detail-value">${profile.age != null ? profile.age + ' years' : '—'}</div>
                    </div>
                    <div class="profile-detail-item">
                        <div class="profile-detail-label">Gender</div>
                        <div class="profile-detail-value">${genderLabel}</div>
                    </div>
                </div>
            </div>

            <h2 style="font-size:1rem;font-weight:600;margin-bottom:0.75rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em">Health Summary</h2>
            <div class="stats-row" style="margin-bottom:1.5rem">
                <div class="card stat-card" style="cursor:pointer" onclick="window._patientFilterOnLoad='all';navigate('/patient')" title="View all reports">
                    <div class="stat-value">${total}</div>
                    <div class="stat-label">Total Reports</div>
                </div>
                <div class="card stat-card" style="cursor:pointer" onclick="window._patientFilterOnLoad='completed';navigate('/patient')" title="View completed reports">
                    <div class="stat-value">${completed}</div>
                    <div class="stat-label">Completed</div>
                </div>
                <div class="card stat-card" style="cursor:pointer" onclick="window._patientFilterOnLoad='in_review';navigate('/patient')" title="View reports in review">
                    <div class="stat-value">${inReview}</div>
                    <div class="stat-label">In Review</div>
                </div>
                <div class="card stat-card" style="cursor:pointer" onclick="window._patientFilterOnLoad='waiting';navigate('/patient')" title="View reports waiting for a doctor">
                    <div class="stat-value">${waiting}</div>
                    <div class="stat-label">Waiting for Doctor</div>
                </div>
            </div>

            <button class="btn btn-teal btn-lg" style="width:100%" onclick="navigate('/patient/chat')">
                💬 Start New Diagnosis
            </button>`;
    } catch (err) {
        showToast(err.message, 'error');
    }
});
