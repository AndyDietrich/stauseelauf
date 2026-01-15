const CONFIG = {
    API_KEY: 'AIzaSyB-HTifZC8FyydU06OPxsdKEsea-k7SgIY',
    SPREADSHEET_ID: '1aRfbY4shiAEZWpvK6JPkQsR4rbn_rbyhLysrpwH01UM',
    SHEET_NAME: 'Tabelle1',
    PUBLISH_CELL: 'N1' // Cell to check for publish status (e.g., contains "TRUE")
};

// ============================================
// INITIALISIERUNG
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('registration-form');
    if (form) {
        const stickyCta = document.getElementById('sticky-cta');
        setupStickyButton(stickyCta);
        setupBirthDateInput();
        form.addEventListener('submit', handleFormSubmit);
        checkUrlParams();
    }

    if (document.getElementById('ergebnisse-section')) {
        loadResults();
    }
});

// ============================================
// STICKY BUTTON
// ============================================
function setupStickyButton(stickyCta) {
    const registrationSection = document.getElementById('anmeldung');
    if (!stickyCta || !registrationSection) return;

    function checkVisibility() {
        const rect = registrationSection.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
        stickyCta.classList.toggle('hidden', isVisible);
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

    const params = new URLSearchParams(formData);
    window.location.href = 'demo-checkout.html?' + params.toString();
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
// ERGEBNISSE
// ============================================
let allResults = [];
let currentDistance = '5.3km';

async function getPublishMode() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.SHEET_NAME}!${CONFIG.PUBLISH_CELL}?key=${CONFIG.API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        const value = data.values && data.values[0] && data.values[0][0];
        return value || 'FALSE';
    } catch (e) {
        console.error('Error checking publish status:', e);
        return 'FALSE';
    }
}

let currentMode = 'FALSE';

async function loadResults() {
    currentMode = await getPublishMode();
    if (currentMode === 'FALSE') {
        console.log('Nothing published.');
        return;
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.SHEET_NAME}?key=${CONFIG.API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        const headers = data.values[0];
        const resultsData = data.values.slice(1);

        allResults = resultsData.map(row => {
            const result = {};
            headers.forEach((header, index) => {
                result[header] = row[index];
            });
            return result;
        });

        // Filter based on mode
        if (currentMode === 'ERGEBNISLISTE') {
            allResults = allResults.filter(r => r.Zeit && r.Zeit !== '');
        }

        if (allResults.length > 0) {
            const section = document.getElementById('ergebnisse-section');
            const heading = document.getElementById('ergebnisse-heading');

            section.style.display = 'block';

            if (currentMode === 'TEILNEHMERLISTE') {
                heading.textContent = 'Teilnehmerliste';
                updateTableHeaders(false);
                showParticipants('5.3km');
            } else {
                heading.textContent = 'Ergebnisse';
                updateTableHeaders(true);
                showResults('5.3km');
            }
        }
    } catch (e) {
        console.error('Error loading data:', e);
    }
}

function updateTableHeaders(showResults) {
    const thead = document.querySelector('#results-table thead tr');
    if (showResults) {
        thead.innerHTML = '<th>Platz</th><th>Name</th><th>Verein</th><th>Zeit</th><th>Urkunde</th>';
    } else {
        thead.innerHTML = '<th>Name</th><th>Verein</th>';
    }
}

function switchDistance(distance) {
    if (currentMode === 'TEILNEHMERLISTE') {
        showParticipants(distance);
    } else {
        showResults(distance);
    }
}

function showParticipants(distance) {
    currentDistance = distance;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.includes(distance.replace('km', '')));
    });

    const filtered = allResults
        .filter(r => r.Strecke === distance)
        .sort((a, b) => (a.Nachname || '').localeCompare(b.Nachname || ''));

    const tbody = document.getElementById('results-body');
    tbody.innerHTML = filtered.map(r => `
        <tr>
            <td>${r.Vorname} ${r.Nachname}</td>
            <td>${r.Verein || '-'}</td>
        </tr>
    `).join('');
}

function showResults(distance) {
    currentDistance = distance;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.includes(distance.replace('km', '')));
    });

    const filtered = allResults
        .filter(r => r.Strecke === distance)
        .sort((a, b) => (a.Zeit || '99:99:99').localeCompare(b.Zeit || '99:99:99'));

    const tbody = document.getElementById('results-body');
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

// ============================================
// URKUNDEN PDF GENERIERUNG
// ============================================
function generateCertificate(platz, vorname, nachname, zeit, strecke, verein) {
    // ... (rest of the function is unchanged)
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
