/* ══════════════════════════════════════════════════════════════════════════
   SPA Router & Shared Utilities
   ══════════════════════════════════════════════════════════════════════════ */

//window.API_BASE = 'https://cycq1wk7n3.execute-api.ap-south-1.amazonaws.com';  // same origin
//window.API_BASE = '';  // same origin
//window.API_BASE = 'http://52.66.108.187:8000';
window.API_BASE = 'https://d2df2cxhh3eeoh.cloudfront.net'
// ── State ─────────────────────────────────────────────────────────────────

function getToken() { return localStorage.getItem('token'); }
function setToken(token) { localStorage.setItem('token', token); }
function clearToken() { localStorage.removeItem('token'); localStorage.removeItem('user'); }

function getUser() {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
}
function setUser(user) { localStorage.setItem('user', JSON.stringify(user)); }  

// ── API Fetch wrapper ─────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }; 
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || 'Request failed');
    }
    return res.json();
}

// ── Toast ─────────────────────────────────────────────────────────────────

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    container.querySelectorAll(`.toast-${type}`).forEach(t => t.remove());
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ── Markdown Renderer ─────────────────────────────────────────────────────
// Lightweight markdown → HTML converter for AI assistant messages.
// HTML is escaped first to prevent XSS, then patterns are applied.

function renderMarkdown(text) {
    if (!text) return '';

    // 1. Escape HTML to prevent XSS
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    // 2. Fenced code blocks (``` ... ```)
    html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) =>
        `<pre class="md-code-block"><code>${code.trim()}</code></pre>`
    );

    // 3. Inline code
    html = html.replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>');

    // 4. Bold (**text**)
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // 5. Italic (*text*) — single asterisks only
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

    // 6. Headings — rendered as bold inline labels, not large h-tags
    html = html.replace(/^###\s+(.+)$/gm, '<span class="md-h3">$1</span>');
    html = html.replace(/^##\s+(.+)$/gm,  '<span class="md-h2">$1</span>');
    html = html.replace(/^#\s+(.+)$/gm,   '<span class="md-h1">$1</span>');

    // 7. Bullet lists (- item or * item) — group consecutive lines into <ul>
    html = html.replace(/((?:^[-*]\s.+\n?)+)/gm, block => {
        const items = block.trim().split('\n')
            .map(line => `<li>${line.replace(/^[-*]\s/, '')}</li>`)
            .join('');
        return `<ul class="md-list">${items}</ul>`;
    });

    // 8. Numbered lists (1. item) — group consecutive lines into <ol>
    html = html.replace(/((?:^\d+\.\s.+\n?)+)/gm, block => {
        const items = block.trim().split('\n')
            .map(line => `<li>${line.replace(/^\d+\.\s/, '')}</li>`)
            .join('');
        return `<ol class="md-list">${items}</ol>`;
    });

    // 9. Remaining newlines → <br> (skip lines already in block elements)
    html = html.replace(/\n(?!<(?:ul|ol|li|pre|\/ul|\/ol|\/pre))/g, '<br>');

    return html;
}

// ── Router ────────────────────────────────────────────────────────────────

const routes = {};

function registerRoute(path, handler) {
    routes[path] = handler;
}

function navigate(hash) {
    window.location.hash = hash;
}

function getRouteParams(pattern, hash) {
    // Simple pattern matching for :param segments
    const patternParts = pattern.split('/');
    const hashParts = hash.split('/');
    if (patternParts.length !== hashParts.length) return null;

    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
            params[patternParts[i].slice(1)] = hashParts[i];
        } else if (patternParts[i] !== hashParts[i]) {
            return null;
        }
    }
    return params;
}

async function handleRoute() {
    const hash = window.location.hash.slice(1) || '/login';
    const app = document.getElementById('app');

    // Check if user needs to be logged in
    const user = getUser();
    const publicRoutes = ['/login', '/register'];
    if (!user && !publicRoutes.includes(hash)) {
        navigate('/login');
        return;
    }

    // Try exact match first
    if (routes[hash]) {
        await routes[hash](app, {});
        return;
    }

    // Try pattern match
    for (const [pattern, handler] of Object.entries(routes)) {
        const params = getRouteParams(pattern, hash);
        if (params) {
            await handler(app, params);
            return;
        }
    }

    // 404
    app.innerHTML = `
        <div class="auth-container">
            <div class="card auth-card" style="text-align:center">
                <div style="font-size:4rem;margin-bottom:1rem">🔍</div>
                <h2>Page Not Found</h2>
                <p style="color:var(--text-secondary);margin:1rem 0">The page you're looking for doesn't exist.</p>
                <button class="btn btn-primary" onclick="navigate('/login')">Go Home</button>
            </div>
        </div>`;
}

// ── Navbar helper ─────────────────────────────────────────────────────────

function renderNavbar(role) {
    const user = getUser();

    let navLinks;
    if (role === 'patient') {
        navLinks = `
            <button class="btn btn-sm btn-secondary" onclick="navigate('/patient')">Dashboard</button>
            <button class="btn btn-sm btn-secondary" onclick="navigate('/patient/profile')">My Profile</button>`;
    } else if (role === 'asha') {
        navLinks = `
            <button class="btn btn-sm btn-secondary" onclick="navigate('/asha')">Dashboard</button>
            <button class="btn btn-sm btn-secondary" onclick="navigate('/asha/profile')">My Profile</button>`;
    } else {
        navLinks = `
            <button class="btn btn-sm btn-secondary" onclick="navigate('/doctor')">Dashboard</button>
            <button class="btn btn-sm btn-secondary" onclick="navigate('/doctor/profile')">My Profile</button>`;
    }

    return `
    <nav class="navbar">
        <div class="navbar-brand">
            <span class="logo-icon">🏥</span>
            <span>AI Healthcare</span>
        </div>
        <div class="navbar-actions">
            ${navLinks}
            <span class="navbar-user">👤 ${user?.name || ''}</span>
            <button class="btn btn-sm btn-secondary" onclick="logout()">Logout</button>
        </div>
    </nav>`;
}

function logout() {
    clearToken();
    navigate('/login');
    showToast('Logged out successfully', 'info');
}

// ── Init ──────────────────────────────────────────────────────────────────

window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', () => {
    // If no hash, redirect based on user role or to login
    if (!window.location.hash) {
        const user = getUser();
        if (user) {
            if (user.role === 'doctor') navigate('/doctor');
            else if (user.role === 'asha_worker') navigate('/asha');
            else navigate('/patient');
        } else {
            navigate('/login');
        }
    } else {
        handleRoute();
    }
});
