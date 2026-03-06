/* ══════════════════════════════════════════════════════════════════════════
   Auth Pages — Login & Register
   ══════════════════════════════════════════════════════════════════════════ */

// ── Login ─────────────────────────────────────────────────────────────────

registerRoute('/login', async (app) => {
    app.innerHTML = `
    <div class="auth-container">
        <div class="card auth-card">
            <div class="auth-logo">🏥</div>
            <h1 class="auth-title">AI Healthcare</h1>
            <p class="auth-subtitle">Rural Diagnosis System — Sign in to continue</p>

            <form id="login-form">
                <div class="form-group">
                    <label class="form-label">Email</label>
                    <input type="email" class="form-input" id="login-email"
                           placeholder="you@example.com" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Password</label>
                    <input type="password" class="form-input" id="login-password"
                           placeholder="Enter your password" required>
                </div>
                <button type="submit" class="btn btn-primary btn-lg" style="width:100%" id="login-btn">
                    Sign In
                </button>
            </form>

            <div class="auth-footer">
                Don't have an account? <a href="#/register">Register here</a>
            </div>
        </div>
    </div>`;

    const loginEmailInput = document.getElementById('login-email');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    loginEmailInput.addEventListener('input', () => {
        loginEmailInput.classList.toggle('input-error',
            loginEmailInput.value.trim().length > 0 && !emailRegex.test(loginEmailInput.value.trim()));
    });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('login-btn');

        const emailVal = loginEmailInput.value.trim();
        if (!emailRegex.test(emailVal)) {
            loginEmailInput.classList.add('input-error');
            showToast('Please enter a valid email address (e.g. you@example.com)', 'error');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Signing in...';

        try {
            const data = await apiFetch('/api/login', {
                method: 'POST',
                body: JSON.stringify({
                    email: document.getElementById('login-email').value,
                    password: document.getElementById('login-password').value,
                }),
            });

            setToken(data.access_token);
            setUser({ user_id: data.user_id, name: data.name, role: data.role });
            showToast(`Welcome back, ${data.name}!`, 'success');
            if (data.role === 'doctor') navigate('/doctor');
            else if (data.role === 'asha_worker') navigate('/asha');
            else navigate('/patient');
        } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Sign In';
        }
    });
});

// ── Register ──────────────────────────────────────────────────────────────

registerRoute('/register', async (app) => {
    let selectedRole = 'patient';

    const SPECIALIZATIONS = [
        'General Medicine', 'Internal Medicine', 'Pediatrics', 'Cardiology',
        'Neurology', 'Orthopedics', 'Gynecology & Obstetrics', 'Dermatology',
        'Ophthalmology', 'ENT (Ear, Nose & Throat)', 'Psychiatry', 'Radiology',
        'Anesthesiology', 'General Surgery', 'Urology', 'Nephrology',
        'Gastroenterology', 'Pulmonology', 'Oncology', 'Endocrinology',
        'Emergency Medicine',
    ];

    const MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

    const currentYear = new Date().getFullYear();

    function buildDayOptions() {
        return '<option value="">Day</option>' +
            Array.from({length: 31}, (_, i) =>
                `<option value="${i+1}">${i+1}</option>`).join('');
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

    app.innerHTML = `
    <div class="auth-container">
        <div class="card auth-card">
            <div class="auth-logo">🏥</div>
            <h1 class="auth-title">Create Account</h1>
            <p class="auth-subtitle">Join the AI Healthcare platform</p>

            <div class="auth-tabs">
                <button class="auth-tab active" data-role="patient" id="tab-patient">🧑 Patient</button>
                <button class="auth-tab" data-role="doctor" id="tab-doctor">🩺 Doctor</button>
                <button class="auth-tab" data-role="asha_worker" id="tab-asha">🌿 ASHA Worker</button>
            </div>

            <form id="register-form" novalidate>
                <div class="form-group">
                    <label class="form-label">Full Name <span class="required-mark">*</span></label>
                    <input type="text" class="form-input" id="reg-name"
                           placeholder="Enter your full name" autocomplete="name">
                </div>
                <div class="form-group">
                    <label class="form-label">Email <span class="required-mark">*</span></label>
                    <input type="email" class="form-input" id="reg-email"
                           placeholder="you@example.com" autocomplete="email">
                </div>
                <div class="form-group">
                    <label class="form-label">Password <span class="required-mark">*</span></label>
                    <input type="password" class="form-input" id="reg-password"
                           placeholder="Create a password (min 4 characters)" autocomplete="new-password">
                </div>

                <div class="form-group" id="registration-number-group" style="display:none">
                    <label class="form-label">Registration Number <span class="required-mark">*</span></label>
                    <input type="text" class="form-input" id="reg-registration-number"
                           placeholder="Enter your official registration number">
                </div>

                <div class="form-group" id="specialization-group" style="display:none">
                    <label class="form-label">Specialization</label>
                    <select class="form-select" id="reg-specialization-select">
                        <option value="">Select specialization...</option>
                        ${SPECIALIZATIONS.map(s => `<option value="${s}">${s}</option>`).join('')}
                        <option value="other">Other (specify below)</option>
                    </select>
                    <input type="text" class="form-input" id="reg-specialization-other"
                           placeholder="Describe your specialization"
                           style="display:none; margin-top:0.5rem">
                </div>

                <div id="patient-profile-group">
                    <div class="form-group">
                        <label class="form-label">Date of Birth <span class="required-mark">*</span></label>
                        <div class="dob-picker">
                            <select class="form-select" id="reg-dob-day">${buildDayOptions()}</select>
                            <select class="form-select" id="reg-dob-month">${buildMonthOptions()}</select>
                            <select class="form-select" id="reg-dob-year">${buildYearOptions()}</select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Gender</label>
                        <select class="form-select" id="reg-gender">
                            <option value="">Prefer not to say</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                </div>

                <button type="submit" class="btn btn-primary btn-lg" style="width:100%" id="reg-btn">
                    Create Account
                </button>
            </form>

            <div class="auth-footer">
                Already have an account? <a href="#/login">Sign in</a>
            </div>
        </div>
    </div>`;

    // ── Helpers ────────────────────────────────────────────────────────────
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    function clearForm() {
        ['reg-name', 'reg-email', 'reg-password', 'reg-registration-number'].forEach(id => {
            const el = document.getElementById(id);
            el.value = '';
            el.classList.remove('input-error');
        });
        document.getElementById('reg-specialization-select').value = '';
        document.getElementById('reg-specialization-other').value = '';
        document.getElementById('reg-specialization-other').style.display = 'none';
        document.getElementById('reg-dob-day').value = '';
        document.getElementById('reg-dob-month').value = '';
        document.getElementById('reg-dob-year').value = '';
        document.getElementById('reg-gender').value = '';
    }

    // ── Tab switching ──────────────────────────────────────────────────────
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            selectedRole = tab.dataset.role;
            clearForm();
            document.getElementById('registration-number-group').style.display =
                (selectedRole === 'doctor' || selectedRole === 'asha_worker') ? 'block' : 'none';
            document.getElementById('specialization-group').style.display =
                selectedRole === 'doctor' ? 'block' : 'none';
            document.getElementById('patient-profile-group').style.display =
                selectedRole === 'patient' ? 'block' : 'none';
        });
    });

    // ── Real-time email validation ─────────────────────────────────────────
    const regEmailInput = document.getElementById('reg-email');
    regEmailInput.addEventListener('input', () => {
        regEmailInput.classList.toggle('input-error',
            regEmailInput.value.trim().length > 0 && !emailRegex.test(regEmailInput.value.trim()));
    });

    // ── Name: show error on blur if invalid ───────────────────────────────
    const nameInput = document.getElementById('reg-name');
    nameInput.addEventListener('blur', () => {
        const v = nameInput.value.trim();
        nameInput.classList.toggle('input-error', v.length > 0 && v.length < 2);
    });
    nameInput.addEventListener('input', () => {
        if (nameInput.classList.contains('input-error') && nameInput.value.trim().length >= 2)
            nameInput.classList.remove('input-error');
    });

    // ── Password: show error on blur if too short ──────────────────────────
    const passInput = document.getElementById('reg-password');
    passInput.addEventListener('blur', () => {
        passInput.classList.toggle('input-error',
            passInput.value.length > 0 && passInput.value.length < 4);
    });
    passInput.addEventListener('input', () => {
        if (passInput.classList.contains('input-error') && passInput.value.length >= 4)
            passInput.classList.remove('input-error');
    });

    // ── Specialization: dropdown → show/hide Other text field ─────────────
    const specSelect = document.getElementById('reg-specialization-select');
    const specOther  = document.getElementById('reg-specialization-other');
    specSelect.addEventListener('change', () => {
        const isOther = specSelect.value === 'other';
        specOther.style.display = isOther ? 'block' : 'none';
        if (!isOther) specOther.value = '';
    });

    // Block digits and special characters in the Other specialization field
    specOther.addEventListener('keypress', (e) => {
        if (!/[a-zA-Z\s\-'.&]/.test(e.key)) e.preventDefault();
    });
    specOther.addEventListener('paste', (e) => {
        const pasted = (e.clipboardData || window.clipboardData).getData('text');
        if (/[^a-zA-Z\s\-'.&]/.test(pasted)) e.preventDefault();
    });

    // ── DOB: update day count when month/year changes ─────────────────────
    function updateDays() {
        const dayEl   = document.getElementById('reg-dob-day');
        const month   = parseInt(document.getElementById('reg-dob-month').value);
        const year    = parseInt(document.getElementById('reg-dob-year').value);
        const prevDay = parseInt(dayEl.value);
        const count   = (month && year) ? new Date(year, month, 0).getDate()
                      : month            ? new Date(2000, month, 0).getDate()
                      : 31;
        dayEl.innerHTML = '<option value="">Day</option>' +
            Array.from({length: count}, (_, i) =>
                `<option value="${i+1}"${prevDay === i+1 ? ' selected' : ''}>${i+1}</option>`
            ).join('');
    }
    document.getElementById('reg-dob-month').addEventListener('change', updateDays);
    document.getElementById('reg-dob-year').addEventListener('change', updateDays);

    // ── Submit ─────────────────────────────────────────────────────────────
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('reg-btn');

        const nameVal = nameInput.value.trim();
        if (!nameVal || nameVal.length < 2) {
            nameInput.classList.add('input-error');
            showToast('Please enter your full name (at least 2 characters)', 'error');
            return;
        }

        const emailVal = regEmailInput.value.trim();
        if (!emailRegex.test(emailVal)) {
            regEmailInput.classList.add('input-error');
            showToast('Please enter a valid email address (e.g. you@example.com)', 'error');
            return;
        }

        if (passInput.value.length < 4) {
            passInput.classList.add('input-error');
            showToast('Password must be at least 4 characters', 'error');
            return;
        }

        if (selectedRole === 'patient') {
            const day   = document.getElementById('reg-dob-day').value;
            const month = document.getElementById('reg-dob-month').value;
            const year  = document.getElementById('reg-dob-year').value;
            if (!day || !month || !year) {
                showToast('Date of birth is required', 'error');
                return;
            }
        }

        if (selectedRole === 'doctor' || selectedRole === 'asha_worker') {
            const regNum = document.getElementById('reg-registration-number').value.trim();
            if (!regNum) {
                document.getElementById('reg-registration-number').classList.add('input-error');
                showToast('Registration number is required', 'error');
                return;
            }
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Creating account...';

        try {
            const body = {
                name:     nameVal,
                email:    emailVal,
                password: passInput.value,
                role:     selectedRole,
            };

            if (selectedRole === 'doctor' || selectedRole === 'asha_worker') {
                body.registration_number = document.getElementById('reg-registration-number').value.trim();
            }

            if (selectedRole === 'doctor') {
                const specVal = specSelect.value;
                body.specialization = specVal === 'other'
                    ? (specOther.value.trim() || null)
                    : (specVal || null);
            }

            if (selectedRole === 'patient') {
                const day   = parseInt(document.getElementById('reg-dob-day').value);
                const month = parseInt(document.getElementById('reg-dob-month').value);
                const year  = parseInt(document.getElementById('reg-dob-year').value);
                const birth = new Date(year, month - 1, day);
                const today = new Date();
                let age = today.getFullYear() - birth.getFullYear();
                const notYetHadBirthday =
                    today.getMonth() < birth.getMonth() ||
                    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
                if (notYetHadBirthday) age--;
                body.age    = age;
                body.gender = document.getElementById('reg-gender').value || null;
            }

            const data = await apiFetch('/api/register', {
                method: 'POST',
                body:   JSON.stringify(body),
            });

            setToken(data.access_token);
            setUser({ user_id: data.user_id, name: data.name, role: data.role });
            showToast(`Welcome, ${data.name}! Account created.`, 'success');
            if (data.role === 'doctor') navigate('/doctor');
            else if (data.role === 'asha_worker') navigate('/asha');
            else navigate('/patient');
        } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Create Account';
        }
    });
});
