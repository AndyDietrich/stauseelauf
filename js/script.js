// ============================================
// KONFIGURATION
// ============================================
const CONFIG = {
    // Demo-Modus: Verwendet LocalStorage statt echtem Backend
    DEMO_MODE: true,

    // URL des Google Apps Script Web-App (für Produktion)
    APPS_SCRIPT_URL: 'HIER_GOOGLE_APPS_SCRIPT_URL_EINTRAGEN',

    // LocalStorage Keys
    STORAGE_KEYS: {
        REGISTRATIONS: 'stauseelauf_registrations',
        RESULTS_PUBLISHED: 'stauseelauf_published'
    }
};

// ============================================
// INITIALISIERUNG
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('registration-form');
    const stickyCta = document.getElementById('sticky-cta');

    // Sticky Button verstecken wenn Formular sichtbar
    setupStickyButton(stickyCta);

    // Geburtsdatum Auto-Formatierung
    setupBirthDateInput();

    // Formular Submit Handler
    form.addEventListener('submit', handleFormSubmit);

    // URL Parameter prüfen (Fehler/Erfolg)
    checkUrlParams();

    // Demo-Modus Banner anzeigen
    if (CONFIG.DEMO_MODE) {
        showDemoBanner();
    }

    // Ergebnisse laden
    loadResults();
});

// ============================================
// STICKY BUTTON
// ============================================
function setupStickyButton(stickyCta) {
    const registrationSection = document.getElementById('anmeldung');

    function checkVisibility() {
        const rect = registrationSection.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom > 0;

        if (isVisible) {
            stickyCta.classList.add('hidden');
        } else {
            stickyCta.classList.remove('hidden');
        }
    }

    window.addEventListener('scroll', checkVisibility);
    window.addEventListener('resize', checkVisibility);
    checkVisibility();
}

// ============================================
// GEBURTSDATUM FORMATIERUNG
// ============================================
function setupBirthDateInput() {
    const birthDateInput = document.getElementById('birthDate');

    birthDateInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');

        if (value.length >= 2) {
            value = value.slice(0, 2) + '.' + value.slice(2);
        }
        if (value.length >= 5) {
            value = value.slice(0, 5) + '.' + value.slice(5);
        }
        if (value.length > 10) {
            value = value.slice(0, 10);
        }

        e.target.value = value;
    });

    // Validierung beim Verlassen des Feldes
    birthDateInput.addEventListener('blur', function(e) {
        const value = e.target.value;
        if (value && !isValidGermanDate(value)) {
            e.target.classList.add('error');
        } else {
            e.target.classList.remove('error');
        }
    });
}

function isValidGermanDate(dateStr) {
    const regex = /^(\d{2})\.(\d{2})\.(\d{4})$/;
    const match = dateStr.match(regex);

    if (!match) return false;

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    if (year < 1900 || year > new Date().getFullYear()) return false;

    const date = new Date(year, month - 1, day);
    return date.getDate() === day && date.getMonth() === month - 1;
}

// ============================================
// FORMULAR SUBMIT
// ============================================
async function handleFormSubmit(e) {
    e.preventDefault();

    if (!validateForm()) {
        return;
    }

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

    if (CONFIG.DEMO_MODE) {
        // Demo-Modus: Lokaler Test-Server oder simulierte Checkout-Seite
        await handleDemoCheckout(formData);
    } else {
        // Produktiv-Modus: Google Apps Script + Stripe
        handleProductionCheckout(formData);
    }
}

// ============================================
// DEMO-MODUS (LocalStorage)
// ============================================
async function handleDemoCheckout(formData) {
    // Daten als URL-Parameter für Checkout-Seite
    const params = new URLSearchParams(formData);
    window.location.href = 'demo-checkout.html?' + params.toString();
}

function handleProductionCheckout(formData) {
    const params = new URLSearchParams({
        action: 'createCheckout',
        ...formData
    });

    window.location.href = CONFIG.APPS_SCRIPT_URL + '?' + params.toString();
}

// ============================================
// VALIDIERUNG
// ============================================
function validateForm() {
    let isValid = true;
    removeError();

    const requiredFields = ['firstName', 'lastName', 'email', 'birthDate', 'gender', 'distance'];

    requiredFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (!field.value.trim()) {
            field.classList.add('error');
            isValid = false;
        } else {
            field.classList.remove('error');
        }
    });

    // E-Mail Format
    const email = document.getElementById('email');
    if (email.value && !isValidEmail(email.value)) {
        email.classList.add('error');
        isValid = false;
    }

    // Geburtsdatum Format
    const birthDate = document.getElementById('birthDate');
    if (birthDate.value && !isValidGermanDate(birthDate.value)) {
        birthDate.classList.add('error');
        isValid = false;
    }

    // Datenschutz
    const privacy = document.getElementById('privacy');
    if (!privacy.checked) {
        showError('Bitte akzeptiere die Datenschutzerklärung.');
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
    submitBtn.classList.toggle('loading', loading);
    submitBtn.disabled = loading;
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

function showDemoBanner() {
    const banner = document.createElement('div');
    banner.className = 'demo-banner';
    banner.innerHTML = 'DEMO-MODUS - Keine echten Zahlungen';
    document.body.insertBefore(banner, document.body.firstChild);

    const style = document.createElement('style');
    style.textContent = `
        .demo-banner {
            background: #ff9800;
            color: white;
            text-align: center;
            padding: 10px;
            font-weight: bold;
            position: sticky;
            top: 0;
            z-index: 9999;
        }
    `;
    document.head.appendChild(style);
}

// ============================================
// ERGEBNISSE
// ============================================
let allResults = [];
let currentDistance = '5.3km';

async function loadResults() {
    try {
        if (CONFIG.DEMO_MODE) {
            // Demo: Von LocalStorage laden
            const published = localStorage.getItem(CONFIG.STORAGE_KEYS.RESULTS_PUBLISHED) === 'true';
            const registrations = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.REGISTRATIONS) || '[]');

            if (published) {
                // Nur Einträge mit Zeit anzeigen
                allResults = registrations
                    .filter(r => r.zeit && r.zeit !== '')
                    .map(r => ({
                        vorname: r.vorname || r.firstName,
                        nachname: r.nachname || r.lastName,
                        zeit: r.zeit,
                        strecke: r.strecke || r.distance,
                        verein: r.verein || r.club || '-'
                    }));

                if (allResults.length > 0) {
                    document.getElementById('ergebnisse-section').style.display = 'block';
                    showResults('5.3km');
                }
            }
        } else {
            // Produktion: Von Google Apps Script laden (TODO)
        }
    } catch (e) {
        console.log('Ergebnisse nicht verfügbar');
    }
}

function showResults(distance) {
    currentDistance = distance;

    // Tabs aktualisieren
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.includes(distance.includes('10') ? '10' : '5'));
    });

    // Ergebnisse filtern und sortieren
    const filtered = allResults
        .filter(r => (r.strecke || '').includes(distance.includes('10') ? '10' : '5.3'))
        .sort((a, b) => (a.zeit || '99:99').localeCompare(b.zeit || '99:99'));

    const tbody = document.getElementById('results-body');
    tbody.innerHTML = filtered.map((r, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${r.vorname} ${r.nachname}</td>
            <td>${r.verein || '-'}</td>
            <td>${r.zeit}</td>
            <td><button class="urkunde-btn" onclick="generateCertificate(${i + 1}, '${r.vorname}', '${r.nachname}', '${r.zeit}', '${r.strecke}', '${r.verein || '-'}')">PDF</button></td>
        </tr>
    `).join('');
}

// ============================================
// URKUNDEN PDF GENERIERUNG
// ============================================
function generateCertificate(platz, vorname, nachname, zeit, strecke, verein) {
    // Einfache PDF-Generierung mit Canvas
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
