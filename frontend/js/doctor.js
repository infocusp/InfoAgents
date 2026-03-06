/* ══════════════════════════════════════════════════════════════════════════
   Doctor Pages — Dashboard, Review with Prescription Template & Research
   ══════════════════════════════════════════════════════════════════════════ */

// ── Doctor Dashboard ──────────────────────────────────────────────────────

let _myDoctorReports = [];

window.applyDoctorFilter = function(filter) {
    document.querySelectorAll('#doctor-filter-pills .filter-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.filter === filter);
    });

    let filtered;
    if (filter === 'completed') {
        filtered = _myDoctorReports.filter(r => r.status === 'completed');
    } else if (filter === 'in_progress') {
        filtered = _myDoctorReports.filter(r =>
            r.status === 'under_review' ||
            (r.status === 'pending_review' && r.doctor_id)
        );
    } else if (filter === 'awaiting') {
        filtered = _myDoctorReports.filter(r => r.status === 'feedback_requested');
    } else {
        filtered = _myDoctorReports;
    }

    const grid = document.getElementById('doctor-reports-grid');
    if (!grid) return;
    if (filtered.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:2rem">
            <div class="empty-state-icon">🔍</div>
            <p class="empty-state-text">No reports in this category</p>
        </div>`;
    } else {
        grid.innerHTML = filtered.map(r => renderMyReportCard(r)).join('');
    }
};

registerRoute('/doctor', async (app) => {
    const user = getUser();
    if (!user || user.role !== 'doctor') { navigate('/login'); return; }

    app.innerHTML = renderNavbar('doctor') + `
    <div class="page-container">
        <div class="page-header">
            <div>
                <h1 class="page-title">Doctor Dashboard</h1>
                <p class="page-subtitle">Review AI-generated diagnoses and provide medical validation</p>
            </div>
        </div>
        <div id="available-reports-section"></div>
        <div id="my-reports-area" style="margin-top:2.5rem"></div>
    </div>`;

    try {
        // Check for notifications (patient deleted a report under review)
        const notifData = await apiFetch('/api/doctor/notifications');
        if (notifData.notifications?.length) {
            const container = document.querySelector('.page-container');
            const banner = document.createElement('div');
            banner.style.cssText = 'background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.35);border-radius:var(--radius-md);padding:1rem 1.25rem;margin-bottom:1.5rem';
            banner.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem">
                    <div>
                        <div style="font-weight:600;color:var(--accent-amber);margin-bottom:0.4rem">🔔 ${notifData.notifications.length} notification${notifData.notifications.length > 1 ? 's' : ''}</div>
                        ${notifData.notifications.map(n => `<div style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:0.2rem">• ${n.message}</div>`).join('')}
                    </div>
                    <button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.1rem;flex-shrink:0">✕</button>
                </div>`;
            container.insertBefore(banner, container.firstChild);
        }

        // Load pending reports count for the clickable section
        const pendingData = await apiFetch('/api/doctor/pending');
        const availableSection = document.getElementById('available-reports-section');
        
        const pendingCount = pendingData.reports?.length || 0;
        const highPriorityCount = pendingData.reports?.filter(r => r.urgency === 'critical' || r.urgency === 'high').length || 0;

        // Create clickable "All Available Reports" section
        availableSection.innerHTML = `
            <div class="card" style="cursor:pointer;border:2px solid var(--accent-teal);background:linear-gradient(135deg, rgba(20,184,166,0.05), rgba(59,130,246,0.05));transition:all 0.2s"
                 onclick="navigate('/doctor/available')"
                 onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(20,184,166,0.15)'"
                 onmouseout="this.style.transform='translateY(0)';this.style.boxShadow=''">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <h2 style="font-size:1.3rem;margin-bottom:0.5rem;color:var(--accent-teal)">
                            📋 All Available Reports
                        </h2>
                        <p style="color:var(--text-secondary);font-size:0.9rem">
                            ${pendingCount === 0 ? 'No reports pending review' : 
                              `${pendingCount} report${pendingCount !== 1 ? 's' : ''} waiting for review`}
                            ${highPriorityCount > 0 ? ` • ${highPriorityCount} high priority` : ''}
                        </p>
                    </div>
                    <div style="display:flex;align-items:center;gap:1rem">
                        ${pendingCount > 0 ? `
                        <div class="stat-value" style="font-size:2.5rem;background:linear-gradient(135deg,var(--accent-teal),var(--accent-blue));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">
                            ${pendingCount}
                        </div>` : ''}
                        <span style="font-size:1.5rem">→</span>
                    </div>
                </div>
            </div>`;

        // Load doctor's own reports (cases they're working on or have completed)
        const myData = await apiFetch('/api/doctor/my-reports');
        const myArea = document.getElementById('my-reports-area');

        if (!myData.reports || myData.reports.length === 0) {
            myArea.innerHTML = `
                <h2 style="font-size:1.2rem;margin-bottom:1rem">🗂️ My Cases</h2>
                <div class="empty-state" style="padding:2rem">
                    <div class="empty-state-icon">📂</div>
                    <p class="empty-state-text">No cases yet</p>
                    <p style="color:var(--text-muted)">Start reviewing reports from the available reports section above.</p>
                </div>`;
        } else {
            _myDoctorReports = myData.reports;

            const completed = myData.reports.filter(r => r.status === 'completed').length;
            const feedback = myData.reports.filter(r => r.status === 'feedback_requested').length;
            const inProgress = myData.reports.filter(r => r.status === 'pending_review' || r.status === 'under_review').length;

            myArea.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
                    <h2 style="font-size:1.2rem;margin:0">🗂️ My Cases</h2>
                    <div style="display:flex;gap:1rem;font-size:0.85rem;color:var(--text-muted)">
                        <span>✅ ${completed} Completed</span>
                        ${feedback > 0 ? `<span>🔄 ${feedback} Awaiting Patient</span>` : ''}
                        ${inProgress > 0 ? `<span>⏳ ${inProgress} In Progress</span>` : ''}
                    </div>
                </div>
                <div class="filter-pills" id="doctor-filter-pills">
                    <button class="filter-pill active" data-filter="all" onclick="applyDoctorFilter('all')">All</button>
                    <button class="filter-pill" data-filter="completed" onclick="applyDoctorFilter('completed')">✅ Completed</button>
                    <button class="filter-pill" data-filter="in_progress" onclick="applyDoctorFilter('in_progress')">⏳ In Progress</button>
                    <button class="filter-pill" data-filter="awaiting" onclick="applyDoctorFilter('awaiting')">🔄 Awaiting Patient</button>
                </div>
                <div class="card-grid" id="doctor-reports-grid">
                    ${myData.reports.map(r => renderMyReportCard(r)).join('')}
                </div>`;

            // Auto-apply filter if navigated from profile page
            if (window._doctorFilterOnLoad) {
                const f = window._doctorFilterOnLoad;
                window._doctorFilterOnLoad = null;
                applyDoctorFilter(f);
            }
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
});

function renderPendingCard(r) {
    const date = new Date(r.created_at).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    return `
    <div class="card" style="cursor:pointer" onclick="navigate('/doctor/review/${r.id}')">
        <div class="card-header">
            <div>
                <div class="card-title">${r.patient_name || 'Patient'}</div>
                <div style="color:var(--text-muted);font-size:0.8rem;margin-top:0.25rem">Report #${r.id}</div>
            </div>
            <span class="badge badge-${r.urgency}">${r.urgency}</span>
        </div>
        <div class="diagnosis-field">
            <div class="diagnosis-field-label">AI Diagnosis</div>
            <div class="diagnosis-field-value">${r.primary_condition}</div>
        </div>
        <div style="display:flex;gap:1rem;align-items:center;margin-top:0.5rem">
            <div class="diagnosis-field" style="margin-bottom:0">
                <div class="diagnosis-field-label">Confidence</div>
                <span style="font-size:0.85rem">${Math.round(r.confidence * 100)}%</span>
            </div>
            <div style="color:var(--text-muted);font-size:0.8rem;margin-left:auto">📅 ${date}</div>
        </div>
        <button class="btn btn-primary btn-sm" style="width:100%;margin-top:1rem">
            Review Case →
        </button>
    </div>`;
}

function renderMyReportCard(r) {
    const statusMap = {
        completed: { cls: 'completed', label: '✅ Finalized' },
        feedback_requested: { cls: 'feedback', label: '🔄 Awaiting Patient' },
        pending_review: { cls: 'pending', label: '⏳ Returned' },
    };
    const s = statusMap[r.status] || { cls: 'pending', label: r.status };
    const date = new Date(r.created_at).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric'
    });

    return `
    <div class="card" style="cursor:pointer" onclick="navigate('/doctor/review/${r.id}')">
        <div class="card-header">
            <div>
                <div class="card-title">${r.patient_name || 'Patient'}</div>
                <div style="color:var(--text-muted);font-size:0.8rem;margin-top:0.25rem">Report #${r.id}</div>
            </div>
            <span class="badge badge-status-${s.cls}">${s.label}</span>
        </div>
        <div class="diagnosis-field">
            <div class="diagnosis-field-label">${r.status === 'completed' ? 'Final Diagnosis' : 'AI Diagnosis'}</div>
            <div class="diagnosis-field-value">${r.status === 'completed' && r.final_diagnosis ? r.final_diagnosis : r.primary_condition}</div>
        </div>
        <div style="color:var(--text-muted);font-size:0.8rem;margin-top:0.5rem">📅 ${date}</div>
    </div>`;
}

// ── All Available Reports Page ────────────────────────────────────────────

registerRoute('/doctor/available', async (app) => {
    const user = getUser();
    if (!user || user.role !== 'doctor') { navigate('/login'); return; }

    app.innerHTML = renderNavbar('doctor') + `
    <div class="page-container">
        <button class="btn btn-secondary btn-sm" onclick="navigate('/doctor')" style="margin-bottom:1.5rem">
            ← Back to Dashboard
        </button>
        <div class="page-header">
            <div>
                <h1 class="page-title">All Available Reports</h1>
                <p class="page-subtitle">Reports waiting for doctor review</p>
            </div>
        </div>
        <div id="pending-area">
            <div class="empty-state">
                <div class="spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto"></div>
                <p style="margin-top:1rem;color:var(--text-muted)">Loading reports...</p>
            </div>
        </div>
    </div>`;

    try {
        const pendingData = await apiFetch('/api/doctor/pending');
        const area = document.getElementById('pending-area');

        if (!pendingData.reports || pendingData.reports.length === 0) {
            area.innerHTML = `
                <div class="empty-state" style="padding:2rem">
                    <div class="empty-state-icon">✅</div>
                    <p class="empty-state-text">No pending reports</p>
                    <p style="color:var(--text-muted)">All caught up! Check back later for new cases.</p>
                </div>`;
        } else {
            area.innerHTML = `
                <div class="stats-row">
                    <div class="card stat-card">
                        <div class="stat-value">${pendingData.reports.length}</div>
                        <div class="stat-label">Pending Reviews</div>
                    </div>
                    <div class="card stat-card">
                        <div class="stat-value">${pendingData.reports.filter(r => r.urgency === 'critical' || r.urgency === 'high').length}</div>
                        <div class="stat-label">High Priority</div>
                    </div>
                    <div class="card stat-card">
                        <div class="stat-value">${pendingData.reports.filter(r => r.urgency === 'medium').length}</div>
                        <div class="stat-label">Medium Priority</div>
                    </div>
                    <div class="card stat-card">
                        <div class="stat-value">${pendingData.reports.filter(r => r.urgency === 'low').length}</div>
                        <div class="stat-label">Low Priority</div>
                    </div>
                </div>
                <h2 style="font-size:1.2rem;margin-bottom:1rem">📋 Reports Awaiting Review</h2>
                <div class="card-grid">
                    ${pendingData.reports.map(r => renderPendingCard(r)).join('')}
                </div>`;
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
});


// ── Doctor Review Page ────────────────────────────────────────────────────

registerRoute('/doctor/review/:id', async (app, params) => {
    const user = getUser();
    if (!user || user.role !== 'doctor') { navigate('/login'); return; }

    app.innerHTML = renderNavbar('doctor') + `
    <div class="page-container" style="max-width:1400px">
        <button class="btn btn-secondary btn-sm" onclick="navigate('/doctor')" style="margin-bottom:1.5rem">
            ← Back to Dashboard
        </button>
        <div id="review-content">
            <div class="empty-state">
                <div class="spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto"></div>
                <p style="margin-top:1rem;color:var(--text-muted)">Loading case details...</p>
            </div>
        </div>
    </div>`;

    try {
        const r = await apiFetch(`/api/doctor/report/${params.id}`);
        const container = document.getElementById('review-content');

        container.innerHTML = `
            <h1 class="page-title" style="margin-bottom:0.25rem">Case Review — Report #${r.id}</h1>
            <p style="color:var(--text-secondary);margin-bottom:1.5rem">
                Patient: <strong>${r.patient_name}</strong>
                ${r.age ? ` • Age: ${r.age}` : ''}
                ${r.gender ? ` • ${r.gender}` : ''}
            </p>

            <div class="review-layout">
                <!-- Left column: Chat history + AI diagnosis -->
                <div class="review-panel">

                    ${r.chat_history && r.chat_history.length ? `
                    <div class="card">
                        <h3 class="card-title" style="margin-bottom:1rem">💬 Patient-AI Conversation</h3>
                        <div class="chat-history-panel">
                            ${r.chat_history.map(msg => `
                                <div class="chat-bubble ${msg.role === 'patient' ? 'patient' : 'assistant'}">
                                    <div class="bubble-label">${msg.role === 'patient' ? 'Patient' : 'AI Assistant'}</div>
                                    ${msg.content}
                                    ${msg.attachment_url ? renderAttachmentDoctor(msg.attachment_url) : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>` : ''}

                    ${r.feedback_thread && r.feedback_thread.length ? `
                    <div class="card" style="border-color:rgba(245,158,11,0.3)">
                        <h3 class="card-title" style="color:var(--accent-amber);margin-bottom:1rem">💬 Doctor-Patient Feedback Thread</h3>
                        <div class="chat-history-panel">
                            ${r.feedback_thread.map(msg => `
                                <div class="chat-bubble ${msg.sender_role === 'doctor' ? 'assistant' : 'patient'}">
                                    <div class="bubble-label">${msg.sender_role === 'doctor' ? '🩺 You' : 'Patient'}</div>
                                    ${msg.sender_role === 'patient' && msg.message_local
                                        ? `<div>${msg.message_local}</div>
                                           <div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.4rem">${msg.message}</div>`
                                        : msg.message}
                                    ${msg.attachment_url ? renderAttachmentDoctor(msg.attachment_url) : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>` : ''}

                    <div class="card diagnosis-card">
                        <h3 class="card-title" style="margin-bottom:1rem">🤖 AI Diagnosis Summary</h3>
                        <div class="diagnosis-field">
                            <div class="diagnosis-field-label">Primary Condition</div>
                            <div class="diagnosis-field-value" style="font-size:1.1rem;font-weight:600">${r.primary_condition}</div>
                        </div>
                        <div style="display:flex;gap:1.5rem;flex-wrap:wrap">
                            <div class="diagnosis-field">
                                <div class="diagnosis-field-label">Confidence</div>
                                <div class="confidence-bar" style="width:140px">
                                    <div class="confidence-bar-fill" style="width:${Math.round(r.confidence * 100)}%"></div>
                                </div>
                                <span style="font-size:0.85rem">${Math.round(r.confidence * 100)}%</span>
                            </div>
                            <div class="diagnosis-field">
                                <div class="diagnosis-field-label">Urgency</div>
                                <span class="badge badge-${r.urgency}">${r.urgency}</span>
                            </div>
                        </div>
                        <div class="diagnosis-field">
                            <div class="diagnosis-field-label">Description</div>
                            <div class="diagnosis-field-value">${r.description}</div>
                        </div>
                        <div class="diagnosis-field">
                            <div class="diagnosis-field-label">Recommended Actions</div>
                            <div class="diagnosis-field-value">${r.recommended_actions}</div>
                        </div>
                        <div class="diagnosis-field">
                            <div class="diagnosis-field-label">Differential Diagnoses</div>
                            <div class="diagnosis-field-value">${r.differential_diagnoses}</div>
                        </div>
                    </div>
                </div>

                <!-- Right column: Review form + Research assistant -->
                <div class="review-panel">
                    ${r.status !== 'completed' ? `
                    <div class="card" id="review-card">
                        <h3 class="card-title" style="margin-bottom:1rem">📝 Your Review</h3>
                        
                        <!-- Initial Clean View -->
                        <div id="initial-review-view">
                            <div class="form-group">
                                <label class="form-label">Final Diagnosis *</label>
                                <input type="text" class="form-input" id="review-diagnosis"
                                       value="${r.primary_condition}" required>
                            </div>

                            <div class="form-group">
                                <label class="form-label">Doctor's Notes / Comments</label>
                                <textarea class="form-textarea" id="review-comments" rows="4"
                                          placeholder="Add your notes, observations, or questions for the patient..."></textarea>
                            </div>

                            <div style="display:flex;gap:0.75rem;flex-direction:column">
                                <button type="button" class="btn btn-teal btn-lg" id="show-prescription-btn"
                                        onclick="showPrescriptionForm(${r.id})">
                                    ✅ Finalize & Issue Prescription
                                </button>
                                <button type="button" class="btn btn-secondary btn-lg" id="feedback-btn"
                                        onclick="requestPatientFeedback(${r.id})">
                                    🔄 Request Patient Feedback
                                </button>
                            </div>
                        </div>

                        <!-- Prescription Form (Hidden Initially) -->
                        <form id="prescription-form" style="display:none">
                            <div class="form-group">
                                <label class="form-label">Final Diagnosis *</label>
                                <input type="text" class="form-input" id="prescription-diagnosis"
                                       value="${r.primary_condition}" required>
                            </div>

                            <div style="border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:1.25rem;margin-bottom:1.25rem;background:var(--bg-glass)">
                                <h4 style="font-size:0.9rem;font-weight:600;margin-bottom:1rem;color:var(--accent-teal)">
                                    💊 Prescription Template
                                </h4>
                                <div class="form-group">
                                    <label class="form-label">Medications & Dosage</label>
                                    <div id="med-rows"></div>
                                    <button type="button" class="btn btn-secondary btn-sm"
                                            style="margin-top:0.5rem" onclick="addMedicineRow()">
                                        + Add Medicine
                                    </button>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Follow-up Date</label>
                                    <input type="text" class="form-input" id="review-followup"
                                           placeholder="e.g. After 1 week, or 2026-03-05">
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Diet & Lifestyle Recommendations</label>
                                    <textarea class="form-textarea" id="review-diet" rows="2"
                                              placeholder="e.g. Avoid spicy food, increase fluid intake..."></textarea>
                                </div>
                                <div class="form-group" style="margin-bottom:0">
                                    <label class="form-label">Additional Instructions</label>
                                    <textarea class="form-textarea" id="review-instructions" rows="2"
                                              placeholder="e.g. Get blood work done, visit ER if fever exceeds 103°F..."></textarea>
                                </div>
                            </div>

                            <div class="form-group">
                                <label class="form-label">Doctor's Notes</label>
                                <textarea class="form-textarea" id="prescription-comments" rows="3"
                                          placeholder="Additional notes or questions for the patient..."></textarea>
                            </div>

                            <div style="display:flex;gap:0.75rem;flex-direction:column">
                                <button type="submit" class="btn btn-teal btn-lg" id="finalize-btn">
                                    ✅ Confirm & Issue Prescription
                                </button>
                                <button type="button" class="btn btn-secondary btn-lg"
                                        onclick="hidePrescriptionForm()">
                                    ← Back to Review
                                </button>
                            </div>
                        </form>
                    </div>` : `
                    <div class="card" style="border-color:rgba(34,197,94,0.3)">
                        <h3 class="card-title" style="color:var(--accent-green)">✅ Already Finalized</h3>
                        <div class="diagnosis-field" style="margin-top:1rem">
                            <div class="diagnosis-field-label">Final Diagnosis</div>
                            <div class="diagnosis-field-value">${r.final_diagnosis}</div>
                        </div>
                        ${r.prescribed_medications ? `
                        <div class="diagnosis-field">
                            <div class="diagnosis-field-label">Prescribed Medications</div>
                            <div class="diagnosis-field-value">${r.prescribed_medications}</div>
                        </div>` : ''}
                        ${r.doctor_comments ? `
                        <div class="diagnosis-field">
                            <div class="diagnosis-field-label">Doctor's Notes</div>
                            <div class="diagnosis-field-value">${r.doctor_comments}</div>
                        </div>` : ''}
                        <button class="btn btn-primary" style="width:100%;margin-top:1.25rem"
                                onclick="printPrescriptionDoctor(${r.id})">
                            📥 Download Prescription
                        </button>
                    </div>`}

                    <!-- AI Research Assistant - Chat Interface -->
                    <div class="card research-panel">
                        <h3 class="card-title" style="margin-bottom:0.5rem">🔬 AI Research Assistant</h3>
                        <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:1rem">
                            Chat with AI about this case. It has full context of patient history and diagnosis.
                        </p>
                        
                        <!-- Research Chat Messages -->
                        <div class="research-chat-messages" id="research-chat-${r.id}" style="max-height:400px;overflow-y:auto;margin-bottom:1rem;padding:0.75rem;background:var(--bg-subtle);border-radius:var(--radius-md)">
                            <div class="chat-bubble assistant" style="margin-bottom:0.75rem">
                                <div class="bubble-label">AI Research Assistant</div>
                                Hi! I have full context of this patient's case. Ask me anything about diagnosis, treatment options, drug interactions, or guidelines.
                            </div>
                        </div>
                        
                        <!-- Research Chat Input -->
                        <div style="display:flex;gap:0.5rem;align-items:flex-end">
                            <div style="flex:1">
                                <input type="text" class="form-input" id="research-input-${r.id}"
                                       placeholder="Ask about this case..." style="margin-bottom:0">
                            </div>
                            <button class="btn btn-teal btn-sm" id="research-send-btn-${r.id}"
                                    onclick="sendResearchMessage(${r.id})">
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;

        // Review form finalize handler
        const form = document.getElementById('prescription-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                finalizeDiagnosis(r.id);
            });
        }

        // Research chat enter key
        const researchInput = document.getElementById(`research-input-${r.id}`);
        if (researchInput) {
            researchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') document.getElementById(`research-send-btn-${r.id}`).click();
            });
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// ── Medication Rows ───────────────────────────────────────────────────────

let _medRowCounter = 0;

window.addMedicineRow = function () {
    const id = `med-row-${_medRowCounter++}`;
    const row = document.createElement('div');
    row.className = 'med-row';
    row.id = id;
    row.innerHTML = `
        <input type="text" class="form-input med-name"
               placeholder="Medicine & strength (e.g. Paracetamol 500mg)">
        <input type="text" class="form-input med-dosage"
               placeholder="Dosage (e.g. Twice daily after meals)">
        <button type="button" class="btn-remove-med" onclick="removeMedicineRow('${id}')"
                title="Remove">×</button>`;
    document.getElementById('med-rows').appendChild(row);
};

window.removeMedicineRow = function (rowId) {
    if (document.querySelectorAll('.med-row').length <= 1) {
        showToast('At least one medication row is required', 'info');
        return;
    }
    document.getElementById(rowId)?.remove();
};

function _collectMedNames() {
    return Array.from(document.querySelectorAll('.med-row .med-name'))
        .map(i => i.value.trim()).filter(Boolean).join('; ');
}

function _collectMedDosages() {
    return Array.from(document.querySelectorAll('.med-row'))
        .map(row => {
            const name   = row.querySelector('.med-name').value.trim();
            const dosage = row.querySelector('.med-dosage').value.trim();
            if (!name) return null;
            return dosage ? `${name} — ${dosage}` : name;
        })
        .filter(Boolean).join('; ');
}

// ── Show/Hide Prescription Form ───────────────────────────────────────────

window.showPrescriptionForm = function (reportId) {
    // Copy diagnosis and comments from initial view to prescription form
    const diagnosis = document.getElementById('review-diagnosis').value;
    const comments = document.getElementById('review-comments').value;

    document.getElementById('prescription-diagnosis').value = diagnosis;
    document.getElementById('prescription-comments').value = comments;

    // Initialize medication rows with one empty row
    const medRows = document.getElementById('med-rows');
    medRows.innerHTML = '';
    _medRowCounter = 0;
    addMedicineRow();

    // Hide initial view, show prescription form
    document.getElementById('initial-review-view').style.display = 'none';
    document.getElementById('prescription-form').style.display = 'block';

    // Update card title
    document.querySelector('#review-card .card-title').textContent = '💊 Issue Prescription';
};

window.hidePrescriptionForm = function () {
    // Copy back any changes to diagnosis
    const diagnosis = document.getElementById('prescription-diagnosis').value;
    document.getElementById('review-diagnosis').value = diagnosis;
    
    // Show initial view, hide prescription form
    document.getElementById('initial-review-view').style.display = 'block';
    document.getElementById('prescription-form').style.display = 'none';
    
    // Update card title
    document.querySelector('#review-card .card-title').textContent = '📝 Your Review';
};

// ── Finalize diagnosis with prescription template ─────────────────────────

window.finalizeDiagnosis = async function (reportId) {
    const diagnosis = document.getElementById('prescription-diagnosis').value.trim();
    if (!diagnosis) { showToast('Please enter a final diagnosis', 'error'); return; }

    const btn = document.getElementById('finalize-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Finalizing...';

    try {
        await apiFetch(`/api/doctor/review/${reportId}`, {
            method: 'POST',
            body: JSON.stringify({
                final_diagnosis: diagnosis,
                doctor_comments: document.getElementById('prescription-comments').value.trim(),
                modified: diagnosis !== document.getElementById('prescription-diagnosis').defaultValue,
                is_final: true,
                prescribed_medications: _collectMedNames(),
                dosage_instructions: _collectMedDosages(),
                follow_up_date: document.getElementById('review-followup').value.trim(),
                diet_lifestyle: document.getElementById('review-diet').value.trim(),
                additional_instructions: document.getElementById('review-instructions').value.trim(),
            }),
        });
        showToast('Diagnosis finalized & prescription issued!', 'success');
        setTimeout(() => navigate('/doctor'), 1000);
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = '✅ Confirm & Issue Prescription';
    }
};

// ── Request patient feedback ──────────────────────────────────────────────

window.requestPatientFeedback = async function (reportId) {
    const comments = document.getElementById('review-comments').value.trim();
    if (!comments) {
        showToast('Please enter feedback/questions for the patient in the notes field', 'error');
        return;
    }

    const btn = document.getElementById('feedback-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending...';

    try {
        await apiFetch(`/api/doctor/review/${reportId}`, {
            method: 'POST',
            body: JSON.stringify({
                final_diagnosis: document.getElementById('review-diagnosis').value.trim(),
                doctor_comments: comments,
                modified: false,
                is_final: false,
            }),
        });
        showToast('Feedback request sent to patient!', 'success');
        setTimeout(() => navigate('/doctor'), 1000);
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = '🔄 Request Patient Feedback';
    }
};

// ── Research Assistant Chat ───────────────────────────────────────────────

window.sendResearchMessage = async function (reportId) {
    const input = document.getElementById(`research-input-${reportId}`);
    const message = input.value.trim();
    if (!message) return;

    const chatDiv = document.getElementById(`research-chat-${reportId}`);
    const sendBtn = document.getElementById(`research-send-btn-${reportId}`);

    // Add doctor's message to chat
    chatDiv.innerHTML += `
        <div class="chat-bubble patient" style="margin-bottom:0.75rem">
            <div class="bubble-label">You</div>
            ${escapeHtml(message)}
        </div>`;
    
    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    // Add typing indicator
    chatDiv.innerHTML += `
        <div class="typing-indicator" id="research-typing-${reportId}" style="margin-bottom:0.75rem">
            <span></span><span></span><span></span>
        </div>`;
    chatDiv.scrollTop = chatDiv.scrollHeight;

    try {
        const data = await apiFetch(`/api/doctor/research/${reportId}`, {
            method: 'POST',
            body: JSON.stringify({ query: message }),
        });

        // Remove typing indicator
        document.getElementById(`research-typing-${reportId}`)?.remove();

        // Add AI response
        chatDiv.innerHTML += `
            <div class="chat-bubble assistant" style="margin-bottom:0.75rem">
                <div class="bubble-label">AI Research Assistant</div>
                ${renderMarkdown(data.response)}
            </div>`;
    } catch (err) {
        document.getElementById(`research-typing-${reportId}`)?.remove();
        chatDiv.innerHTML += `
            <div class="chat-bubble assistant" style="margin-bottom:0.75rem;border-color:var(--accent-rose)">
                <div class="bubble-label">Error</div>
                ${escapeHtml(err.message)}
            </div>`;
        showToast(err.message, 'error');
    }

    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
    chatDiv.scrollTop = chatDiv.scrollHeight;
};

function renderAttachmentDoctor(url) {
    if (!url) return '';
    const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(url);
    if (isImage) {
        return `<div class="attachment-preview"><img src="${url}" alt="attachment" class="chat-image" onclick="window.open('${url}','_blank')"></div>`;
    }
    const filename = url.split('/').pop();
    return `<div class="attachment-preview"><a href="${url}" target="_blank" class="attachment-link">📎 ${filename}</a></div>`;
}

// ── Doctor Prescription Download ──────────────────────────────────────────

window.printPrescriptionDoctor = async function (reportId) {
    try {
        const r = await apiFetch(`/api/doctor/report/${reportId}`);
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
                <div class="field"><strong>Patient:</strong> ${r.patient_name || '—'}</div>
                <div class="field"><strong>Age:</strong> ${r.age || '—'}</div>
                <div class="field"><strong>Gender:</strong> ${r.gender || '—'}</div>
                <div class="field"><strong>Urgency:</strong> <span class="rx-badge ${r.urgency}">${r.urgency || '—'}</span></div>
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

// ── Doctor Profile ────────────────────────────────────────────────────────

registerRoute('/doctor/profile', async (app) => {
    const user = getUser();
    if (!user || user.role !== 'doctor') { navigate('/login'); return; }

    app.innerHTML = renderNavbar('doctor') + `
    <div class="page-container" style="max-width:600px;margin:0 auto">
        <div class="page-header">
            <div>
                <h1 class="page-title">My Profile</h1>
                <p class="page-subtitle">Your doctor account and case statistics</p>
            </div>
        </div>
        <div id="doctor-profile-area">
            <div class="empty-state">
                <div class="spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto"></div>
                <p style="margin-top:1rem;color:var(--text-muted)">Loading profile...</p>
            </div>
        </div>
    </div>`;

    try {
        const [profile, myData] = await Promise.all([
            apiFetch('/api/doctor/profile'),
            apiFetch('/api/doctor/my-reports'),
        ]);

        const reports    = myData.reports || [];
        const total      = reports.length;
        const completed  = reports.filter(r => r.status === 'completed').length;
        const inProgress = reports.filter(r =>
            r.status === 'under_review' ||
            (r.status === 'pending_review' && r.doctor_id)
        ).length;
        const awaiting   = reports.filter(r => r.status === 'feedback_requested').length;

        const initials = profile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

        let memberSince = '—';
        if (profile.created_at) {
            memberSince = new Date(profile.created_at).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'long', year: 'numeric'
            });
        }

        document.getElementById('doctor-profile-area').innerHTML = `
            <div class="card" style="padding:2rem;margin-bottom:1.5rem">
                <div style="display:flex;align-items:center;gap:1.25rem;margin-bottom:1.75rem">
                    <div style="width:64px;height:64px;border-radius:50%;background:var(--accent-teal);
                                display:flex;align-items:center;justify-content:center;
                                font-size:1.4rem;font-weight:700;color:#fff;flex-shrink:0">
                        ${initials}
                    </div>
                    <div>
                        <div style="font-size:1.25rem;font-weight:700">Dr. ${profile.name}</div>
                        <div style="color:var(--text-secondary);font-size:0.875rem">${profile.email}</div>
                        <div style="color:var(--text-muted);font-size:0.8rem;margin-top:0.2rem">Member since ${memberSince}</div>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
                    <div class="profile-detail-item" style="grid-column:1/-1">
                        <div class="profile-detail-label">Specialization</div>
                        <div class="profile-detail-value">${profile.specialization || '—'}</div>
                    </div>
                </div>
            </div>

            <h2 style="font-size:1rem;font-weight:600;margin-bottom:0.75rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em">Case Summary</h2>
            <div class="stats-row" style="margin-bottom:1.5rem">
                <div class="card stat-card" style="cursor:pointer" onclick="window._doctorFilterOnLoad='all';navigate('/doctor')" title="View all cases">
                    <div class="stat-value">${total}</div>
                    <div class="stat-label">Total Cases</div>
                </div>
                <div class="card stat-card" style="cursor:pointer" onclick="window._doctorFilterOnLoad='completed';navigate('/doctor')" title="View completed cases">
                    <div class="stat-value">${completed}</div>
                    <div class="stat-label">Completed</div>
                </div>
                <div class="card stat-card" style="cursor:pointer" onclick="window._doctorFilterOnLoad='in_progress';navigate('/doctor')" title="View in-progress cases">
                    <div class="stat-value">${inProgress}</div>
                    <div class="stat-label">In Progress</div>
                </div>
                <div class="card stat-card" style="cursor:pointer" onclick="window._doctorFilterOnLoad='awaiting';navigate('/doctor')" title="View cases awaiting patient">
                    <div class="stat-value">${awaiting}</div>
                    <div class="stat-label">Awaiting Patient</div>
                </div>
            </div>`;
    } catch (err) {
        showToast(err.message, 'error');
    }
});
