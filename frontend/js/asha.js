/* ══════════════════════════════════════════════════════════════════════════
   ASHA Worker Pages — Dashboard, New Case Form, Chat
   ══════════════════════════════════════════════════════════════════════════ */

// ── Language lookup (for understand route language badge) ─────────────────

const _ASHA_LANGUAGES = [
    { name: 'English',   code: 'en-IN', native: 'English'   },
    { name: 'Hindi',     code: 'hi-IN', native: 'हिंदी'     },
    { name: 'Bengali',   code: 'bn-IN', native: 'বাংলা'     },
    { name: 'Telugu',    code: 'te-IN', native: 'తెలుగు'    },
    { name: 'Marathi',   code: 'mr-IN', native: 'मराठी'     },
    { name: 'Tamil',     code: 'ta-IN', native: 'தமிழ்'     },
    { name: 'Gujarati',  code: 'gu-IN', native: 'ગુજરાતી'  },
    { name: 'Kannada',   code: 'kn-IN', native: 'ಕನ್ನಡ'    },
    { name: 'Malayalam', code: 'ml-IN', native: 'മലയാളം'   },
    { name: 'Punjabi',   code: 'pa-IN', native: 'ਪੰਜਾਬੀ'  },
    { name: 'Odia',      code: 'or-IN', native: 'ଓଡ଼ିଆ'    },
];
const ASHA_LANG_BY_NAME = Object.fromEntries(_ASHA_LANGUAGES.map(l => [l.name, l]));

// ── ASHA Dashboard ────────────────────────────────────────────────────────

let _ashaDashReports = [];

window.applyAshaFilter = function (filter) {
    document.querySelectorAll('#asha-filter-pills .filter-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.filter === filter);
    });

    let filtered;
    if (filter === 'completed') {
        filtered = _ashaDashReports.filter(r => r.status === 'completed');
    } else if (filter === 'in_review') {
        filtered = _ashaDashReports.filter(r =>
            (r.status === 'pending_review' && r.doctor_id) ||
            r.status === 'under_review' ||
            r.status === 'feedback_requested'
        );
    } else if (filter === 'waiting') {
        filtered = _ashaDashReports.filter(r => r.status === 'pending_review' && !r.doctor_id);
    } else {
        filtered = _ashaDashReports;
    }

    const grid = document.getElementById('asha-cases-grid');
    if (!grid) return;
    if (filtered.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:2rem">
            <div class="empty-state-icon">🔍</div>
            <p class="empty-state-text">No cases in this category</p>
        </div>`;
    } else {
        grid.innerHTML = filtered.map(r => renderAshaCaseCard(r)).join('');
    }
};

registerRoute('/asha', async (app) => {
    const user = getUser();
    if (!user || user.role !== 'asha_worker') { navigate('/login'); return; }

    app.innerHTML = renderNavbar('asha') + `
    <div class="page-container">
        <div class="page-header">
            <div>
                <h1 class="page-title">ASHA Worker Dashboard</h1>
                <p class="page-subtitle">Submit patient cases and track their progress</p>
            </div>
            <button class="btn btn-teal btn-lg" onclick="navigate('/asha/new-case')">
                💬 New Patient Case
            </button>
        </div>
        <div id="asha-cases-area">
            <div class="empty-state">
                <div class="spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto"></div>
                <p style="margin-top:1rem;color:var(--text-muted)">Loading cases...</p>
            </div>
        </div>
    </div>`;

    try {
        const data = await apiFetch('/api/asha/cases');
        const area = document.getElementById('asha-cases-area');
        const reports = data.reports || [];

        if (reports.length === 0) {
            area.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🌿</div>
                    <p class="empty-state-text">No cases submitted yet</p>
                    <p style="color:var(--text-muted);margin-bottom:1.5rem">
                        Start by submitting a new patient case using the button above.
                    </p>
                    <button class="btn btn-teal" onclick="navigate('/asha/new-case')">
                        Submit First Case
                    </button>
                </div>`;
            return;
        }

        _ashaDashReports = reports;

        const total     = reports.length;
        const completed = reports.filter(r => r.status === 'completed').length;
        const inReview  = reports.filter(r =>
            (r.status === 'pending_review' && r.doctor_id) ||
            r.status === 'under_review' ||
            r.status === 'feedback_requested'
        ).length;
        const waiting   = reports.filter(r => r.status === 'pending_review' && !r.doctor_id).length;

        area.innerHTML = `
            <div class="stats-row">
                <div class="card stat-card">
                    <div class="stat-value">${total}</div>
                    <div class="stat-label">Total Cases</div>
                </div>
                <div class="card stat-card" style="border-color:rgba(34,197,94,0.3)">
                    <div class="stat-value" style="background:linear-gradient(135deg,var(--accent-green),var(--accent-teal));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${completed}</div>
                    <div class="stat-label">Completed</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-value">${inReview}</div>
                    <div class="stat-label">In Review</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-value">${waiting}</div>
                    <div class="stat-label">Waiting for Doctor</div>
                </div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
                <h2 style="font-size:1.2rem;margin:0">Submitted Cases</h2>
                <div style="display:flex;gap:1rem;font-size:0.85rem;color:var(--text-muted)">
                    <span>✅ ${completed} Completed</span>
                    ${inReview > 0 ? `<span>👨‍⚕️ ${inReview} In Review</span>` : ''}
                    ${waiting > 0 ? `<span>⏰ ${waiting} Waiting</span>` : ''}
                </div>
            </div>
            <div class="filter-pills" id="asha-filter-pills">
                <button class="filter-pill active" data-filter="all" onclick="applyAshaFilter('all')">All</button>
                <button class="filter-pill" data-filter="completed" onclick="applyAshaFilter('completed')">✅ Completed</button>
                <button class="filter-pill" data-filter="in_review" onclick="applyAshaFilter('in_review')">👨‍⚕️ In Review</button>
                <button class="filter-pill" data-filter="waiting" onclick="applyAshaFilter('waiting')">⏰ Waiting for a Doctor</button>
            </div>
            <div class="card-grid" id="asha-cases-grid">
                ${reports.map(r => renderAshaCaseCard(r)).join('')}
            </div>`;

        // Auto-apply filter if navigated from profile page
        if (window._ashaFilterOnLoad) {
            const f = window._ashaFilterOnLoad;
            window._ashaFilterOnLoad = null;
            applyAshaFilter(f);
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
});

function renderAshaCaseCard(r) {
    const statusMap = {
        pending_review:     { cls: 'waiting',      label: '⏰ Waiting for Doctor' },
        under_review:       { cls: 'under-review',  label: '👨‍⚕️ Doctor Reviewing' },
        feedback_requested: { cls: 'feedback',      label: '🔄 Needs More Info' },
        completed:          { cls: 'completed',     label: '✅ Completed' },
    };
    const status = statusMap[r.status] || { cls: 'pending', label: r.status };
    const date = new Date(r.created_at).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric'
    });

    return `
    <div class="card" style="cursor:pointer" onclick="navigate('/asha/case/${r.id}')">
        <div class="card-header">
            <div>
                <div class="card-title">${r.patient_name_text || 'Patient'}</div>
                <div style="color:var(--text-muted);font-size:0.8rem;margin-top:0.2rem">
                    ${r.patient_age_text ? r.patient_age_text + ' yrs' : ''}
                    ${r.patient_gender_text ? '· ' + r.patient_gender_text : ''}
                </div>
            </div>
            ${r.urgency ? `<span class="badge badge-${r.urgency}">${r.urgency}</span>` : ''}
        </div>
        <span class="badge badge-status-${status.cls}" style="margin-bottom:0.75rem">${status.label}</span>
        ${r.primary_condition ? `
        <div class="diagnosis-field">
            <div class="diagnosis-field-label">AI Diagnosis</div>
            <div class="diagnosis-field-value">${r.primary_condition}</div>
        </div>` : `
        <div style="color:var(--text-muted);font-size:0.85rem">Awaiting diagnosis</div>`}
        <div style="color:var(--text-muted);font-size:0.8rem;margin-top:0.75rem">📅 ${date}</div>
        ${r.status === 'completed' ? `
        <button class="btn btn-understand btn-sm" style="width:100%;margin-top:0.75rem"
                onclick="event.stopPropagation();navigate('/asha/understand/${r.id}')">
            💡 Understand My Diagnosis
        </button>` : ''}
    </div>`;
}

// ── New Case Form ─────────────────────────────────────────────────────────

registerRoute('/asha/new-case', async (app) => {
    const user = getUser();
    if (!user || user.role !== 'asha_worker') { navigate('/login'); return; }

    const LANGUAGES = [
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

    const MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    const currentYear = new Date().getFullYear();

    function buildDayOptions() {
        return '<option value="">Day</option>' +
            Array.from({length: 31}, (_, i) => `<option value="${i+1}">${i+1}</option>`).join('');
    }
    function buildMonthOptions() {
        return '<option value="">Month</option>' +
            MONTHS.map((m, i) => `<option value="${i+1}">${m}</option>`).join('');
    }
    function buildYearOptions() {
        let opts = '<option value="">Year</option>';
        for (let y = currentYear; y >= 1900; y--)
            opts += `<option value="${y}">${y}</option>`;
        return opts;
    }

    let selectedLang = LANGUAGES[0];

    app.innerHTML = renderNavbar('asha') + `
    <div class="page-container" style="max-width:560px;margin:0 auto">
        <div class="page-header">
            <div>
                <h1 class="page-title">New Patient Case</h1>
                <p class="page-subtitle">Enter patient details before starting the AI chat</p>
            </div>
        </div>
        <div class="card" style="padding:2rem">
            <form id="new-case-form" novalidate>
                <div class="form-group">
                    <label class="form-label">Patient Name <span class="required-mark">*</span></label>
                    <input type="text" class="form-input" id="case-patient-name"
                           placeholder="Enter patient's full name">
                </div>

                <div class="form-group">
                    <label class="form-label">Date of Birth <span class="required-mark">*</span></label>
                    <div class="dob-picker">
                        <select class="form-select" id="case-dob-day">${buildDayOptions()}</select>
                        <select class="form-select" id="case-dob-month">${buildMonthOptions()}</select>
                        <select class="form-select" id="case-dob-year">${buildYearOptions()}</select>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Gender</label>
                    <select class="form-select" id="case-patient-gender">
                        <option value="">Prefer not to say</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">Medical History</label>
                    <textarea class="form-textarea" id="case-medical-history" rows="2"
                              placeholder="Any known conditions, past illnesses..."></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">Current Medications</label>
                    <textarea class="form-textarea" id="case-medications" rows="2"
                              placeholder="Any medications the patient is taking..."></textarea>
                </div>

                <div class="form-group">
                    <label class="form-label">Preferred Language for this Consultation</label>
                    <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.75rem">
                        The AI doctor will respond in your chosen language throughout the session.
                    </p>
                    <div class="lang-picker-grid" id="asha-lang-selector">
                        ${LANGUAGES.map(l => `
                            <button type="button" class="lang-btn${l.name === 'English' ? ' selected' : ''}"
                                    data-name="${l.name}" data-code="${l.code}" data-abbr="${l.abbr}">
                                <span class="lang-btn-native">${l.native}</span>
                                <span class="lang-btn-english">${l.name}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>

                <button type="submit" class="btn btn-teal btn-lg" style="width:100%;margin-top:0.5rem" id="start-case-btn">
                    💬 Start Chat with AI Doctor
                </button>
                <button type="button" class="btn btn-secondary" style="width:100%;margin-top:0.75rem" onclick="navigate('/asha')">
                    Cancel
                </button>
            </form>
        </div>
    </div>`;

    // DOB dynamic day count
    function updateDays() {
        const dayEl   = document.getElementById('case-dob-day');
        const month   = parseInt(document.getElementById('case-dob-month').value);
        const year    = parseInt(document.getElementById('case-dob-year').value);
        const prevDay = parseInt(dayEl.value);
        const count   = (month && year) ? new Date(year, month, 0).getDate()
                      : month            ? new Date(2000, month, 0).getDate()
                      : 31;
        dayEl.innerHTML = '<option value="">Day</option>' +
            Array.from({length: count}, (_, i) =>
                `<option value="${i+1}"${prevDay === i+1 ? ' selected' : ''}>${i+1}</option>`
            ).join('');
    }
    document.getElementById('case-dob-month').addEventListener('change', updateDays);
    document.getElementById('case-dob-year').addEventListener('change', updateDays);

    // Language picker
    document.querySelectorAll('#asha-lang-selector .lang-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#asha-lang-selector .lang-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedLang = { name: btn.dataset.name, code: btn.dataset.code, abbr: btn.dataset.abbr };
        });
    });

    // Name validation
    const nameInput = document.getElementById('case-patient-name');
    nameInput.addEventListener('blur', () => {
        nameInput.classList.toggle('input-error', nameInput.value.trim().length > 0 && nameInput.value.trim().length < 2);
    });
    nameInput.addEventListener('input', () => {
        if (nameInput.classList.contains('input-error') && nameInput.value.trim().length >= 2)
            nameInput.classList.remove('input-error');
    });

    document.getElementById('new-case-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = nameInput.value.trim();
        if (!name || name.length < 2) {
            nameInput.classList.add('input-error');
            showToast('Patient name is required (at least 2 characters)', 'error');
            return;
        }

        const day   = document.getElementById('case-dob-day').value;
        const month = document.getElementById('case-dob-month').value;
        const year  = document.getElementById('case-dob-year').value;
        if (!day || !month || !year) {
            showToast('Date of birth is required', 'error');
            return;
        }

        // Calculate age from DOB
        const birth = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const notYetBirthday = today.getMonth() < birth.getMonth() ||
            (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
        if (notYetBirthday) age--;

        const btn = document.getElementById('start-case-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Starting...';

        try {
            const data = await apiFetch('/api/asha/start-case', {
                method: 'POST',
                body: JSON.stringify({
                    patient_name:        name,
                    patient_age:         age,
                    patient_gender:      document.getElementById('case-patient-gender').value || null,
                    medical_history:     document.getElementById('case-medical-history').value.trim(),
                    current_medications: document.getElementById('case-medications').value.trim(),
                    preferred_language:  selectedLang.name,
                }),
            });
            sessionStorage.setItem('ashaChatLangName', selectedLang.name);
            sessionStorage.setItem('ashaChatLangCode', selectedLang.code);
            sessionStorage.setItem('ashaChatLangAbbr', selectedLang.abbr || selectedLang.name.slice(0,2).toUpperCase());
            navigate(`/asha/chatroom/${data.report_id}`);
        } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
            btn.innerHTML = '💬 Start Chat with AI Doctor';
        }
    });
});

// ── ASHA Chatroom ─────────────────────────────────────────────────────────

let _ashaFileToUpload = null;

registerRoute('/asha/chatroom/:id', async (app, params) => {
    const user = getUser();
    if (!user || user.role !== 'asha_worker') { navigate('/login'); return; }

    const reportId = params.id;

    // Load patient name from cases list for the header
    let patientName = 'Patient';
    try {
        const data = await apiFetch('/api/asha/cases');
        const r = (data.reports || []).find(x => String(x.id) === String(reportId));
        if (r) patientName = r.patient_name_text || 'Patient';
    } catch (_) {}

    app.innerHTML = renderNavbar('asha') + `
    <div class="chat-container">
        <div class="chat-messages" id="chat-messages">
            <div class="chat-bubble assistant">
                <div class="bubble-label">AI Assistant</div>
                Hello! I'm the AI health assistant. Please describe ${patientName}'s symptoms and
                I'll help gather information for a doctor to review. What brings them here today?
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
                       style="display:none" onchange="ashaHandleChatFileSelect(this)">
            </label>
            <button class="btn-lang" id="lang-btn" onclick="toggleMicLang()" title="Switch language">EN</button>
            <button class="btn-mic" id="mic-btn" title="Click to record voice" onclick="toggleMicRecording()">
                🎤
            </button>
            <input type="text" class="form-input" id="chat-input"
                   placeholder="Describe the patient's symptoms..." autocomplete="off">
            <button class="btn btn-primary" id="send-btn" onclick="ashaSendChatMessage(${reportId})">
                Send
            </button>
        </div>
        <div class="chat-actions" id="chat-actions">
            <button class="btn btn-teal" id="diagnose-btn" onclick="ashaRequestDiagnosis(${reportId})">
                🩺 Generate Diagnosis Report
            </button>
            <button class="btn btn-secondary btn-sm" onclick="navigate('/asha')">Cancel</button>
        </div>
    </div>`;

    document.getElementById('chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('send-btn').click();
        }
    });
    document.getElementById('chat-input').focus();

    // Initialise mic language from the session's preferred language (shared globals from patient.js)
    _chatPrefLangCode = sessionStorage.getItem('ashaChatLangCode') || 'en-IN';
    _chatPrefLangName = sessionStorage.getItem('ashaChatLangName') || 'English';
    _chatPrefLangAbbr = sessionStorage.getItem('ashaChatLangAbbr') || 'EN';
    _micLang = _chatPrefLangCode;
    const langToggleBtn = document.getElementById('lang-btn');
    if (langToggleBtn) {
        langToggleBtn.textContent = _chatPrefLangAbbr;
        langToggleBtn.style.display = _chatPrefLangCode === 'en-IN' ? 'none' : '';
    }
});

window.ashaHandleChatFileSelect = function (input) {
    const file = input.files[0] || null;
    if (file && !_validateFileExt(file)) {
        showToast('Unsupported file type. Allowed: jpg, png, gif, webp, pdf, doc, docx', 'error');
        input.value = '';
        _ashaFileToUpload = null;
        return;
    }
    _ashaFileToUpload = file;
    if (_ashaFileToUpload) showToast(`📎 ${_ashaFileToUpload.name} attached`, 'info');
};

window.ashaSendChatMessage = async function (reportId) {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message && !_ashaFileToUpload) return;

    const messagesDiv = document.getElementById('chat-messages');
    const sendBtn = document.getElementById('send-btn');

    let attachmentUrl = null;
    let attachmentHtml = '';
    if (_ashaFileToUpload) {
        try {
            const uploaded = await uploadFile(_ashaFileToUpload);
            attachmentUrl = uploaded.url;
            attachmentHtml = renderAttachment(uploaded.url);
        } catch (err) {
            showToast('File upload failed: ' + err.message, 'error');
        }
        _ashaFileToUpload = null;
    }

    // Consume audio blob for inline playback (voice recording)
    let audioHtml = '';
    if (_lastAudioBlob) {
        const audioUrl = URL.createObjectURL(_lastAudioBlob);
        audioHtml = `<audio controls src="${audioUrl}"
            style="display:block;margin-top:0.4rem;height:36px;width:190px;opacity:0.85"></audio>`;
        _lastAudioBlob = null;
        const previewAudio = document.getElementById('voice-preview-audio');
        const bar = document.getElementById('voice-preview-bar');
        if (previewAudio) { previewAudio.pause(); previewAudio.src = ''; }
        if (bar) bar.style.display = 'none';
    }

    messagesDiv.innerHTML += `
        <div class="chat-bubble patient">
            <div class="bubble-label">You (ASHA)</div>
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
        const data = await apiFetch(`/api/asha/chat/${reportId}`, {
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

window.ashaRequestDiagnosis = async function (reportId) {
    const btn = document.getElementById('diagnose-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Generating diagnosis...';

    try {
        const data = await apiFetch(`/api/asha/diagnose/${reportId}`, { method: 'POST' });
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
                    ⚠️ A qualified doctor will review this case.
                </p>
            </div>`;
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        document.getElementById('chat-input-area').style.display = 'none';
        document.getElementById('chat-actions').innerHTML = `
            <p style="color:var(--accent-green);font-weight:500">✅ Case submitted for doctor review</p>
            <button class="btn btn-primary" onclick="navigate('/asha')">Back to Dashboard</button>`;
        showToast('Diagnosis report generated!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = '🩺 Generate Diagnosis Report';
    }
};

// ── ASHA Case Detail ──────────────────────────────────────────────────────

let _ashaFeedbackFileToUpload = null;

registerRoute('/asha/case/:id', async (app, params) => {
    const user = getUser();
    if (!user || user.role !== 'asha_worker') { navigate('/login'); return; }

    app.innerHTML = renderNavbar('asha') + `
    <div class="page-container" style="max-width:900px">
        <div id="asha-case-detail">
            <div class="empty-state">
                <div class="spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto"></div>
                <p style="margin-top:1rem;color:var(--text-muted)">Loading case...</p>
            </div>
        </div>
    </div>`;

    try {
        const r = await apiFetch(`/api/asha/case/${params.id}`);
        const container = document.getElementById('asha-case-detail');

        let statusLabel, statusClass;
        if (r.status === 'completed') {
            statusLabel = '✅ Doctor Reviewed'; statusClass = 'completed';
        } else if (r.status === 'feedback_requested') {
            statusLabel = '🔄 Doctor Needs More Info'; statusClass = 'feedback';
        } else if (r.status === 'pending_review' && r.doctor_id) {
            statusLabel = '👨‍⚕️ Doctor Reviewing'; statusClass = 'under-review';
        } else if (r.status === 'under_review') {
            statusLabel = '👨‍⚕️ Doctor Reviewing'; statusClass = 'under-review';
        } else {
            statusLabel = '⏰ Waiting for a Doctor'; statusClass = 'waiting';
        }

        container.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
                <button class="btn btn-secondary btn-sm" onclick="navigate('/asha')">← Back to Dashboard</button>
            </div>

            <h1 class="page-title">Case: ${r.patient_name_text || 'Patient'}</h1>
            <div style="display:flex;gap:0.75rem;align-items:center;margin:0.75rem 0 0.5rem;flex-wrap:wrap">
                <span class="badge badge-status-${statusClass}" style="display:inline-flex">${statusLabel}</span>
                ${r.urgency && r.primary_condition ? `<span class="badge badge-${r.urgency}">${r.urgency}</span>` : ''}
            </div>
            ${r.doctor_name && r.status !== 'completed' ? `
            <div style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:1rem">
                👨‍⚕️ Assigned to Dr. ${r.doctor_name}
            </div>` : ''}

            <div class="card" style="margin-top:1rem;margin-bottom:0">
                <h3 class="card-title" style="margin-bottom:0.75rem">👤 Patient Details</h3>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
                    <div class="diagnosis-field" style="margin-bottom:0">
                        <div class="diagnosis-field-label">Age</div>
                        <div class="diagnosis-field-value">${r.patient_age_text != null ? r.patient_age_text + ' years' : '—'}</div>
                    </div>
                    <div class="diagnosis-field" style="margin-bottom:0">
                        <div class="diagnosis-field-label">Gender</div>
                        <div class="diagnosis-field-value">${r.patient_gender_text || '—'}</div>
                    </div>
                </div>
            </div>

            ${r.chat_history && r.chat_history.length ? `
            <div class="card" style="margin-top:1.5rem">
                <h3 class="card-title" style="margin-bottom:1rem">💬 Chat with AI Doctor</h3>
                <div class="chat-history-panel">
                    ${r.chat_history.map(msg => `
                        <div class="chat-bubble ${msg.role === 'patient' ? 'patient' : 'assistant'}">
                            <div class="bubble-label">${msg.role === 'patient' ? 'ASHA Worker' : 'AI Assistant'}</div>
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
                            <div class="bubble-label">${msg.sender_role === 'patient' ? 'ASHA Worker (on behalf of patient)' : '🩺 Doctor'}</div>
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
            <div id="asha-feedback-card" class="card" style="margin-top:1.5rem;border-color:rgba(245,158,11,0.4);box-shadow:0 0 20px rgba(245,158,11,0.1)">
                <h3 class="card-title" style="color:var(--accent-amber);margin-bottom:1rem">📝 Respond to Doctor</h3>
                <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:1rem">
                    The doctor needs more information about this patient. Please provide your response below.
                </p>
                <div class="form-group">
                    <textarea class="form-textarea" id="asha-response-text" rows="4"
                              placeholder="Type your response on behalf of the patient..."></textarea>
                </div>
                <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap">
                    <label class="btn btn-secondary btn-sm" style="cursor:pointer">
                        📎 Attach Image
                        <input type="file" id="asha-feedback-file"
                               accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx"
                               style="display:none" onchange="ashaHandleFeedbackFileSelect(this)">
                    </label>
                    <span id="asha-feedback-file-name" style="font-size:0.8rem;color:var(--text-muted)"></span>
                    <button class="btn btn-teal" style="margin-left:auto" id="asha-send-response-btn"
                            onclick="ashaRespondToFeedback(${r.id})">
                        Send Response
                    </button>
                </div>
            </div>` : ''}

            ${r.status === 'completed' && r.final_diagnosis ? `
            <div class="card" style="margin-top:1.5rem;border-color:rgba(34,197,94,0.3);box-shadow:0 0 20px rgba(34,197,94,0.1)">
                <h3 class="card-title" style="color:var(--accent-green);margin-bottom:1rem">✅ Doctor's Final Prescription</h3>
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
                <button class="btn btn-primary btn-lg" style="width:100%;margin-top:1.5rem" onclick="ashaPrintPrescription(${r.id})">
                    📥 Download Prescription
                </button>
                <button class="btn btn-understand" style="width:100%;margin-top:0.75rem"
                        onclick="navigate('/asha/understand/${r.id}')">
                    💡 Understand your report in simple language
                </button>
            </div>` : ''}
        `;
    } catch (err) {
        showToast(err.message, 'error');
        navigate('/asha');
    }
});

window.ashaHandleFeedbackFileSelect = function (input) {
    const file = input.files[0] || null;
    if (file && !_validateFileExt(file)) {
        showToast('Unsupported file type. Allowed: jpg, png, gif, webp, pdf, doc, docx', 'error');
        input.value = '';
        _ashaFeedbackFileToUpload = null;
        document.getElementById('asha-feedback-file-name').textContent = '';
        return;
    }
    _ashaFeedbackFileToUpload = file;
    document.getElementById('asha-feedback-file-name').textContent = file ? file.name : '';
};

window.ashaRespondToFeedback = async function (reportId) {
    const message = document.getElementById('asha-response-text').value.trim();
    if (!message) { showToast('Please type a response', 'error'); return; }

    const btn = document.getElementById('asha-send-response-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending...';

    try {
        let attachmentUrl = null;
        if (_ashaFeedbackFileToUpload) {
            const uploaded = await uploadFile(_ashaFeedbackFileToUpload);
            attachmentUrl = uploaded.url;
            _ashaFeedbackFileToUpload = null;
        }
        await apiFetch(`/api/asha/respond/${reportId}`, {
            method: 'POST',
            body: JSON.stringify({ message, attachment_url: attachmentUrl }),
        });

        const card = document.getElementById('asha-feedback-card');
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
                    <button class="btn btn-secondary" onclick="navigate('/asha')">← Back to Dashboard</button>
                </div>`;
        }
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Send Response';
    }
};

window.ashaPrintPrescription = async function (reportId) {
    try {
        const r = await apiFetch(`/api/asha/case/${reportId}`);
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
                .rx-asha-note { background: #f5f3ff; border-radius: 8px; padding: 10px 14px; margin-bottom: 20px; font-size: 12px; color: #6d28d9; }
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

            <div class="rx-asha-note">🌿 Case submitted by ASHA worker on behalf of patient</div>

            <div class="rx-patient">
                <div class="field"><strong>Patient:</strong> ${r.patient_name_text || '—'}</div>
                <div class="field"><strong>Age:</strong> ${r.patient_age_text != null ? r.patient_age_text + ' yrs' : '—'}</div>
                <div class="field"><strong>Gender:</strong> ${r.patient_gender_text || '—'}</div>
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

// ── ASHA Profile ──────────────────────────────────────────────────────────

registerRoute('/asha/profile', async (app) => {
    const user = getUser();
    if (!user || user.role !== 'asha_worker') { navigate('/login'); return; }

    app.innerHTML = renderNavbar('asha') + `
    <div class="page-container" style="max-width:600px;margin:0 auto">
        <div class="page-header">
            <div>
                <h1 class="page-title">My Profile</h1>
                <p class="page-subtitle">Your ASHA worker account and case statistics</p>
            </div>
        </div>
        <div id="asha-profile-area">
            <div class="empty-state">
                <div class="spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto"></div>
            </div>
        </div>
    </div>`;

    try {
        const profile = await apiFetch('/api/asha/profile');
        const initials = profile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        let memberSince = '—';
        if (profile.created_at) {
            memberSince = new Date(profile.created_at).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'long', year: 'numeric'
            });
        }

        document.getElementById('asha-profile-area').innerHTML = `
            <div class="card" style="padding:2rem;margin-bottom:1.5rem">
                <div style="display:flex;align-items:center;gap:1.25rem;margin-bottom:1.75rem">
                    <div style="width:64px;height:64px;border-radius:50%;background:var(--accent-purple);
                                display:flex;align-items:center;justify-content:center;
                                font-size:1.4rem;font-weight:700;color:#fff;flex-shrink:0">
                        ${initials}
                    </div>
                    <div>
                        <div style="font-size:1.25rem;font-weight:700">${profile.name}</div>
                        <div style="color:var(--text-secondary);font-size:0.875rem">${profile.email}</div>
                        <div style="color:var(--text-muted);font-size:0.8rem;margin-top:0.2rem">ASHA Worker · Member since ${memberSince}</div>
                    </div>
                </div>
            </div>

            <h2 style="font-size:1rem;font-weight:600;margin-bottom:0.75rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em">Case Summary</h2>
            <div class="stats-row" style="margin-bottom:1.5rem">
                <div class="card stat-card" style="cursor:pointer" onclick="window._ashaFilterOnLoad='all';navigate('/asha')">
                    <div class="stat-value">${profile.total_cases}</div>
                    <div class="stat-label">Total Cases</div>
                </div>
                <div class="card stat-card" style="border-color:rgba(34,197,94,0.3);cursor:pointer" onclick="window._ashaFilterOnLoad='completed';navigate('/asha')">
                    <div class="stat-value" style="background:linear-gradient(135deg,var(--accent-green),var(--accent-teal));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${profile.completed_cases}</div>
                    <div class="stat-label">Completed</div>
                </div>
                <div class="card stat-card" style="cursor:pointer" onclick="window._ashaFilterOnLoad='in_review';navigate('/asha')">
                    <div class="stat-value">${profile.in_review_cases}</div>
                    <div class="stat-label">In Review</div>
                </div>
                <div class="card stat-card" style="cursor:pointer" onclick="window._ashaFilterOnLoad='waiting';navigate('/asha')">
                    <div class="stat-value">${profile.waiting_cases}</div>
                    <div class="stat-label">Waiting for Doctor</div>
                </div>
            </div>

            <div class="card" style="background:rgba(139,92,246,0.06);border-color:rgba(139,92,246,0.2);text-align:center;padding:1.5rem">
                <div style="font-size:2rem;margin-bottom:0.5rem">🌿</div>
                <div style="font-weight:600;margin-bottom:0.25rem">Incentive Tracker</div>
                <div style="color:var(--text-secondary);font-size:0.875rem">
                    You have <strong>${profile.completed_cases}</strong> completed case${profile.completed_cases !== 1 ? 's' : ''} eligible for incentives.
                </div>
            </div>`;
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// ── ASHA Understand Diagnosis ─────────────────────────────────────────────

registerRoute('/asha/understand/:id', async (app, params) => {
    const user = getUser();
    if (!user || user.role !== 'asha_worker') { navigate('/login'); return; }

    const reportId = params.id;
    let understandHistory = [];
    let micRecognition = null;
    let prefLangCode = 'en-IN';

    app.innerHTML = renderNavbar('asha') + `
    <div class="chat-container">
        <div class="understand-chat-header">
            <button class="btn btn-secondary btn-sm" onclick="navigate('/asha/case/${reportId}')">
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
                    onclick="toggleAshaUnderstandMic()">🎤</button>
            <button class="btn btn-understand" id="understand-send-btn"
                    onclick="sendAshaUnderstandMessage(${reportId})">Send</button>
        </div>
    </div>`;

    document.getElementById('understand-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('understand-send-btn').click();
        }
    });

    window.toggleAshaUnderstandMic = function () {
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
        micRecognition.lang = prefLangCode;
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

    // Auto-load initial explanation
    try {
        const data = await apiFetch(`/api/asha/understand-case/${reportId}`, {
            method: 'POST',
            body: JSON.stringify({ message: null, chat_history: [] }),
        });
        if (data.preferred_language) {
            const langInfo = ASHA_LANG_BY_NAME[data.preferred_language];
            prefLangCode = langInfo ? langInfo.code : 'en-IN';
            const badge = document.getElementById('understand-lang-badge');
            if (badge) badge.textContent = langInfo ? langInfo.native : data.preferred_language;
        }
        document.getElementById('initial-message')?.remove();
        understandHistory.push({ role: 'assistant', content: data.response });
        const messagesDiv = document.getElementById('understand-messages');
        messagesDiv.innerHTML += `
            <div class="chat-bubble assistant">
                <div class="bubble-label">Health Assistant</div>
                ${renderMarkdown(data.response)}
            </div>`;
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        document.getElementById('understand-input')?.focus();
    } catch (err) {
        document.getElementById('initial-message')?.remove();
        showToast('Could not load explanation: ' + err.message, 'error');
    }

    window.sendAshaUnderstandMessage = async function (rId) {
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
            const data = await apiFetch(`/api/asha/understand-case/${rId}`, {
                method: 'POST',
                body: JSON.stringify({ message, chat_history: historyBeforeSend }),
            });
            document.getElementById('understand-typing')?.remove();
            understandHistory.push({ role: 'assistant', content: data.response });
            messagesDiv.innerHTML += `
                <div class="chat-bubble assistant">
                    <div class="bubble-label">Health Assistant</div>
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
