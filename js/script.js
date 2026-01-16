const CONFIG = {
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzlhndVGfDYRaUnUm4cr8F199jhWyzCI-8Rau6NVqH0WiJj3uLcACuRV1VZ6jfmA1K9/exec'
};

// ============================================
// INITIALISIERUNG
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    // Check publish status for navigation on all pages
    checkPublishStatus();

    // Registration form setup
    const form = document.getElementById('registration-form');
    if (form) {
        setupBirthDateInput();
        form.addEventListener('submit', handleFormSubmit);
        checkUrlParams();
    }

    // Teilnehmerliste page
    if (document.getElementById('teilnehmer-section')) {
        loadParticipants();
    }

    // Ergebnisse page
    if (document.getElementById('ergebnisse-section')) {
        loadResults();
    }
});

// ============================================
// NAVIGATION
// ============================================
function toggleNav() {
    const navMenu = document.getElementById('nav-menu');
    if (navMenu) {
        navMenu.classList.toggle('open');
    }
}

async function checkPublishStatus() {
    try {
        const response = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=data`);
        const data = await response.json();
        const status = data.status || 'FALSE';

        const navTeilnehmer = document.getElementById('nav-teilnehmer');
        const navErgebnisse = document.getElementById('nav-ergebnisse');

        if (status === 'TEILNEHMERLISTE') {
            if (navTeilnehmer) navTeilnehmer.classList.remove('hidden');
            if (navErgebnisse) navErgebnisse.classList.add('hidden');
        } else if (status === 'ERGEBNISLISTE') {
            if (navTeilnehmer) navTeilnehmer.classList.remove('hidden');
            if (navErgebnisse) navErgebnisse.classList.remove('hidden');
        } else {
            if (navTeilnehmer) navTeilnehmer.classList.add('hidden');
            if (navErgebnisse) navErgebnisse.classList.add('hidden');
        }
    } catch (e) {
        console.error('Error checking publish status:', e);
    }
}

// ============================================
// GEBURTSDATUM FORMATIERUNG
// ============================================
function setupBirthDateInput() {
    const birthDateInput = document.getElementById('birthDate');
    if (!birthDateInput) return;

    birthDateInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 2) value = value.slice(0, 2) + '.' + value.slice(2);
        if (value.length >= 5) value = value.slice(0, 5) + '.' + value.slice(5);
        if (value.length > 10) value = value.slice(0, 10);
        e.target.value = value;
    });

    birthDateInput.addEventListener('blur', function(e) {
        const value = e.target.value;
        e.target.classList.toggle('error', value && !isValidGermanDate(value));
    });
}

function isValidGermanDate(dateStr) {
    const regex = /^(\d{2})\.(\d{2})\.(\d{4})$/;
    const match = dateStr.match(regex);
    if (!match) return false;

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > new Date().getFullYear()) return false;

    const date = new Date(year, month - 1, day);
    return date.getDate() === day && date.getMonth() === month - 1 && date.getFullYear() === year;
}

// ============================================
// FORMULAR SUBMIT
// ============================================
async function handleFormSubmit(e) {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    removeError();

    const formData = {
        firstName: document.getElementById('firstName').value.trim(),
        lastName: document.getElementById('lastName').value.trim(),
        email: document.getElementById('email').value.trim(),
        birthDate: document.getElementById('birthDate').value,
        gender: document.getElementById('gender').value,
        distance: document.getElementById('distance').value,
        club: document.getElementById('club').value.trim() || '-',
    };

    try {
        // Request Stripe Checkout URL from Apps Script
        const params = new URLSearchParams({
            action: 'createCheckout',
            ...formData
        });

        const response = await fetch(CONFIG.APPS_SCRIPT_URL + '?' + params.toString());
        const result = await response.json();

        if (result.checkoutUrl) {
            // Redirect to Stripe Checkout
            window.location.href = result.checkoutUrl;
        } else if (result.error) {
            setLoading(false);
            showError('Fehler: ' + result.error);
        } else {
            setLoading(false);
            showError('Ein unbekannter Fehler ist aufgetreten.');
        }
    } catch (error) {
        setLoading(false);
        showError('Verbindungsfehler. Bitte versuche es erneut.');
        console.error('Checkout error:', error);
    }
}

// ============================================
// VALIDIERUNG
// ============================================
function validateForm() {
    let isValid = true;
    removeError();

    const requiredFields = ['firstName', 'lastName', 'email', 'birthDate', 'gender', 'distance', 'privacy'];
    requiredFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field.type === 'checkbox') {
            if (!field.checked) {
                field.parentElement.classList.add('error');
                isValid = false;
            } else {
                field.parentElement.classList.remove('error');
            }
        } else if (!field.value.trim()) {
            field.classList.add('error');
            isValid = false;
        } else {
            field.classList.remove('error');
        }
    });

    const email = document.getElementById('email');
    if (email.value && !isValidEmail(email.value)) {
        email.classList.add('error');
        isValid = false;
    }

    const birthDate = document.getElementById('birthDate');
    if (birthDate.value && !isValidGermanDate(birthDate.value)) {
        birthDate.classList.add('error');
        isValid = false;
    }

    if (!isValid && !document.querySelector('.error-message')) {
        showError('Bitte fülle alle Pflichtfelder korrekt aus.');
    }

    return isValid;
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ============================================
// UI HELPERS
// ============================================
function setLoading(loading) {
    const submitBtn = document.getElementById('submit-btn');
    if(submitBtn) {
        submitBtn.classList.toggle('loading', loading);
        submitBtn.disabled = loading;
    }
}

function showError(message) {
    removeError();
    const form = document.getElementById('registration-form');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    form.insertBefore(errorDiv, form.firstChild);
}

function removeError() {
    const existingError = document.querySelector('.error-message');
    if (existingError) existingError.remove();
}

function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error')) {
        showError('Die Zahlung wurde abgebrochen. Bitte versuche es erneut.');
    }
}

// ============================================
// TEILNEHMERLISTE
// ============================================
let allParticipants = [];
let currentDistance = '5.3km';

async function loadParticipants() {
    try {
        const response = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=data`);
        const data = await response.json();

        const status = data.status || 'FALSE';
        if (status === 'FALSE') {
            showNoDataMessage('Die Teilnehmerliste wurde noch nicht veröffentlicht.');
            return;
        }

        allParticipants = data.data || [];
        if (allParticipants.length > 0) {
            showParticipants('5.3km');
        } else {
            showNoDataMessage('Noch keine Teilnehmer angemeldet.');
        }
    } catch (e) {
        console.error('Error loading participants:', e);
        showNoDataMessage('Fehler beim Laden der Daten.');
    }
}

function showParticipants(distance) {
    currentDistance = distance;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.includes(distance.replace('km', '')));
    });

    const filtered = allParticipants
        .filter(r => r.Strecke === distance)
        .sort((a, b) => (a.Nachname || '').localeCompare(b.Nachname || ''));

    const countEl = document.getElementById('participant-count');
    if (countEl) {
        countEl.textContent = `${filtered.length} Teilnehmer`;
    }

    const tbody = document.getElementById('results-body');
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align: center; padding: 40px; color: #666;">Keine Teilnehmer für diese Strecke.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(r => `
        <tr>
            <td>${r.Vorname} ${r.Nachname}</td>
            <td>${r.Verein || '-'}</td>
        </tr>
    `).join('');
}

// ============================================
// ERGEBNISSE
// ============================================
let allResults = [];

async function loadResults() {
    try {
        const response = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=data`);
        const data = await response.json();

        const status = data.status || 'FALSE';
        if (status !== 'ERGEBNISLISTE') {
            showNoDataMessage('Die Ergebnisse wurden noch nicht veröffentlicht.');
            return;
        }

        allResults = (data.data || []).filter(r => r.Zeit && r.Zeit !== '');
        if (allResults.length > 0) {
            showResults('5.3km');
        } else {
            showNoDataMessage('Noch keine Ergebnisse vorhanden.');
        }
    } catch (e) {
        console.error('Error loading results:', e);
        showNoDataMessage('Fehler beim Laden der Daten.');
    }
}

function showResults(distance) {
    currentDistance = distance;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.includes(distance.replace('km', '')));
    });

    const filtered = allResults
        .filter(r => r.Strecke === distance)
        .sort((a, b) => (a.Zeit || '99:99:99').localeCompare(b.Zeit || '99:99:99'));

    const countEl = document.getElementById('participant-count');
    if (countEl) {
        countEl.textContent = `${filtered.length} Ergebnisse`;
    }

    const tbody = document.getElementById('results-body');
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #666;">Keine Ergebnisse für diese Strecke.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map((r, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${r.Vorname} ${r.Nachname}</td>
            <td>${r.Verein || '-'}</td>
            <td>${r.Zeit}</td>
            <td><button class="urkunde-btn" onclick="generateCertificate(${i + 1}, '${r.Vorname}', '${r.Nachname}', '${r.Zeit}', '${r.Strecke}', '${r.Verein || '-'}')">PDF</button></td>
        </tr>
    `).join('');
}

function switchDistance(distance) {
    // Check which page we're on
    if (document.getElementById('teilnehmer-section')) {
        showParticipants(distance);
    } else if (document.getElementById('ergebnisse-section')) {
        showResults(distance);
    }
}

function showNoDataMessage(message) {
    const tbody = document.getElementById('results-body');
    if (tbody) {
        const colspan = document.getElementById('ergebnisse-section') ? 5 : 2;
        tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center; padding: 40px; color: #666;">${message}</td></tr>`;
    }
}

// ============================================
// URKUNDEN PDF GENERIERUNG
// ============================================
function generateCertificate(platz, vorname, nachname, zeit, strecke, verein) {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1131; // A4 Verhältnis
    const ctx = canvas.getContext('2d');

    // Hintergrund
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Rahmen
    ctx.strokeStyle = '#1a5f7a';
    ctx.lineWidth = 10;
    ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

    // Innerer Rahmen
    ctx.strokeStyle = '#57c5b6';
    ctx.lineWidth = 2;
    ctx.strokeRect(50, 50, canvas.width - 100, canvas.height - 100);

    // Titel
    ctx.fillStyle = '#1a5f7a';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('URKUNDE', canvas.width / 2, 150);

    // Event
    ctx.font = '32px Arial';
    ctx.fillStyle = '#333';
    ctx.fillText('Stauseelauf 2025', canvas.width / 2, 220);

    ctx.font = '20px Arial';
    ctx.fillStyle = '#666';
    ctx.fillText('TSV Bad Wörishofen - Leichtathletik', canvas.width / 2, 260);
    ctx.fillText('08. August 2025', canvas.width / 2, 290);

    // Name
    ctx.font = 'bold 44px Arial';
    ctx.fillStyle = '#1a5f7a';
    ctx.fillText(`${vorname} ${nachname}`, canvas.width / 2, 420);

    // Verein
    if (verein && verein !== '-') {
        ctx.font = '24px Arial';
        ctx.fillStyle = '#666';
        ctx.fillText(verein, canvas.width / 2, 470);
    }

    // Platzierung
    ctx.font = 'bold 72px Arial';
    ctx.fillStyle = '#1a5f7a';
    ctx.fillText(`${platz}. Platz`, canvas.width / 2, 600);

    // Strecke
    const streckeText = strecke.includes('10') ? '10,6 km' : '5,3 km';
    ctx.font = '28px Arial';
    ctx.fillStyle = '#333';
    ctx.fillText(`Strecke: ${streckeText}`, canvas.width / 2, 680);

    // Zeit
    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = '#1a5f7a';
    ctx.fillText(`Zeit: ${zeit}`, canvas.width / 2, 750);

    // Ort
    ctx.font = '18px Arial';
    ctx.fillStyle = '#666';
    ctx.fillText('Stausee Bad Wörishofen / Wiedergeltingen', canvas.width / 2, 900);

    // Download
    const link = document.createElement('a');
    link.download = `Urkunde_${vorname}_${nachname}_Stauseelauf2025.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}
