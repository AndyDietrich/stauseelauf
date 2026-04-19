const CONFIG = {
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxDAMR_FixqdBtCTsahEDnYcES7e0luNaM8WWihaoOQltthoS7bJbpb2pU_nBFlACNd/exec'
};

// Urkundenhintergrund als Blob laden (vermeidet Canvas-Tainting / CORS-Probleme)
const certificateBg = new Image();
fetch('images/Muster_Urkunde2026.jpg')
    .then(r => r.blob())
    .then(blob => { certificateBg.src = URL.createObjectURL(blob); })
    .catch(() => { certificateBg.src = 'images/Muster_Urkunde2026.jpg'; });

// ============================================
// INITIALISIERUNG
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    // Check publish status for navigation on all pages
    checkPublishStatus();

    // Registration form setup
    const form = document.getElementById('registration-form');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
        checkUrlParams();
        // Setup divers hint for the first (static) participant card
        const firstCard = document.querySelector('.participant-card');
        if (firstCard) {
            const genderSel = firstCard.querySelector('[name="gender"]');
            if (genderSel) genderSel.setAttribute('onchange', 'updateDiversHint(this)');
        }
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
        const response = await fetch('data/data.json', { cache: 'no-cache' });
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
// MULTI-TEILNEHMER
// ============================================
function updateDiversHint(select) {
    const hint = select.closest('.form-group').querySelector('.divers-hint');
    if (hint) hint.style.display = select.value === 'd' ? 'block' : 'none';
}

function addParticipant() {
    const container = document.getElementById('participants-container');
    const index = container.querySelectorAll('.participant-card').length;

    const card = document.createElement('div');
    card.className = 'participant-card';
    card.dataset.index = index;
    card.innerHTML = `
        <div class="participant-card-header">
            <button type="button" class="remove-participant-btn" onclick="removeParticipant(this)">Entfernen</button>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Vorname *</label>
                <input type="text" name="firstName" required>
            </div>
            <div class="form-group">
                <label>Nachname *</label>
                <input type="text" name="lastName" required>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Jahrgang *</label>
                <input type="number" name="birthYear" min="1920" max="2024" placeholder="z.B. 1990" required>
            </div>
            <div class="form-group">
                <label>Geschlecht *</label>
                <select name="gender" required onchange="updateDiversHint(this)">
                    <option value="">Bitte wählen</option>
                    <option value="m">Männlich</option>
                    <option value="w">Weiblich</option>
                    <option value="d">Divers</option>
                </select>
                <p class="divers-hint" style="display:none; margin: 4px 0 0; font-size: 0.85rem; color: #666;">Nach DLV-Standard wird in der Männer-Altersklasse gewertet.</p>
            </div>
        </div>
        <div class="form-group">
            <label>Strecke *</label>
            <select name="distance" required onchange="updateTotalPrice()">
                <option value="">Bitte wählen</option>
                <option value="5.3km">5,3 km (1x um den See) – 15 EUR</option>
                <option value="10.6km">10,6 km (2x um den See) – 15 EUR</option>
                <option value="kinderlauf">Schülerlauf bis U14, Start 17:30 Uhr – 7 EUR</option>
            </select>
        </div>
        <div class="form-group">
            <label>Verein / Team (optional)</label>
            <input type="text" name="club">
        </div>
    `;
    container.appendChild(card);
    renumberCards();
}

function removeParticipant(btn) {
    btn.closest('.participant-card').remove();
    renumberCards();
    updateTotalPrice();
}

function renumberCards() {
    document.querySelectorAll('.participant-card').forEach((card, i) => {
        card.dataset.index = i;
    });
}

function updateTotalPrice() {
    const selects = document.querySelectorAll('#participants-container select[name="distance"]');
    let total = 0;
    selects.forEach(sel => {
        if (sel.value === 'kinderlauf') total += 7;
        else if (sel.value) total += 15;
    });
    const btn = document.getElementById('submit-btn');
    if (btn) btn.textContent = `Weiter zur Zahlung (${total} EUR)`;
}

function getParticipants() {
    const cards = document.querySelectorAll('.participant-card');
    return Array.from(cards).map(card => ({
        firstName: card.querySelector('[name="firstName"]').value.trim(),
        lastName:  card.querySelector('[name="lastName"]').value.trim(),
        birthYear: card.querySelector('[name="birthYear"]').value,
        gender:    card.querySelector('[name="gender"]').value,
        distance:  card.querySelector('[name="distance"]').value,
        club:      card.querySelector('[name="club"]').value.trim() || '-',
    }));
}

// ============================================
// FORMULAR SUBMIT
// ============================================
async function handleFormSubmit(e) {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    removeError();

    const email = document.getElementById('email').value.trim();
    const participants = getParticipants();

    try {
        const params = new URLSearchParams({
            action: 'createCheckout',
            email: email,
            participants: JSON.stringify(participants)
        });

        const response = await fetch(CONFIG.APPS_SCRIPT_URL + '?' + params.toString());
        const result = await response.json();

        if (result.checkoutUrl) {
            // Daten für Success-Seite zwischenspeichern
            sessionStorage.setItem('registrationData', JSON.stringify({
                email: email,
                participants: participants
            }));
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

    // E-Mail
    const email = document.getElementById('email');
    if (!email.value.trim()) {
        email.classList.add('error');
        isValid = false;
    } else if (!isValidEmail(email.value)) {
        email.classList.add('error');
        isValid = false;
    } else {
        email.classList.remove('error');
    }

    // Alle Teilnehmer-Cards
    document.querySelectorAll('.participant-card').forEach(card => {
        ['firstName', 'lastName', 'gender', 'distance'].forEach(name => {
            const field = card.querySelector(`[name="${name}"]`);
            if (!field.value.trim()) { field.classList.add('error'); isValid = false; }
            else field.classList.remove('error');
        });

        const by = card.querySelector('[name="birthYear"]');
        const year = parseInt(by.value);
        if (!by.value || isNaN(year) || year < 1920 || year > new Date().getFullYear()) {
            by.classList.add('error'); isValid = false;
        } else {
            by.classList.remove('error');
            const distance = card.querySelector('[name="distance"]').value;
            if (distance === 'kinderlauf' && year < 2012) {
                by.classList.add('error');
                showError('Der Schülerlauf ist für Teilnehmer bis U14 (Jahrgang 2012 oder jünger).');
                isValid = false;
            }
        }
    });

    // Checkboxen
    ['imageRights', 'liability'].forEach(id => {
        const cb = document.getElementById(id);
        if (!cb.checked) { cb.parentElement.classList.add('error'); isValid = false; }
        else cb.parentElement.classList.remove('error');
    });

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
        const response = await fetch('data/data.json', { cache: 'no-cache' });
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
        btn.classList.toggle('active', btn.dataset.distance === distance);
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
let currentAgeGroup = 'Gesamt';

// Age group options for dropdown (including M/W for all men/women)
const AGE_GROUP_OPTIONS = [
    { value: 'Gesamt', label: 'Gesamt (alle)' },
    { value: 'M', label: 'Männer (alle)' },
    { value: 'W', label: 'Frauen (alle)' },
    { value: 'MU20', label: 'M U20' },
    { value: 'MU23', label: 'M U23' },
    { value: 'MHK', label: 'M Hauptklasse' },
    { value: 'M30', label: 'M30' },
    { value: 'M35', label: 'M35' },
    { value: 'M40', label: 'M40' },
    { value: 'M45', label: 'M45' },
    { value: 'M50', label: 'M50' },
    { value: 'M55', label: 'M55' },
    { value: 'M60', label: 'M60' },
    { value: 'M65', label: 'M65' },
    { value: 'M70', label: 'M70' },
    { value: 'M75', label: 'M75' },
    { value: 'M80', label: 'M80+' },
    { value: 'WU20', label: 'W U20' },
    { value: 'WU23', label: 'W U23' },
    { value: 'WHK', label: 'W Hauptklasse' },
    { value: 'W30', label: 'W30' },
    { value: 'W35', label: 'W35' },
    { value: 'W40', label: 'W40' },
    { value: 'W45', label: 'W45' },
    { value: 'W50', label: 'W50' },
    { value: 'W55', label: 'W55' },
    { value: 'W60', label: 'W60' },
    { value: 'W65', label: 'W65' },
    { value: 'W70', label: 'W70' },
    { value: 'W75', label: 'W75' },
    { value: 'W80', label: 'W80+' }
];

async function loadResults() {
    try {
        const response = await fetch('data/data.json', { cache: 'no-cache' });
        const data = await response.json();

        const status = data.status || 'FALSE';
        if (status !== 'ERGEBNISLISTE') {
            showNoDataMessage('Die Ergebnisse wurden noch nicht veröffentlicht.');
            return;
        }

        allResults = (data.data || []).filter(r => r.Zeit && r.Zeit !== '');
        if (allResults.length > 0) {
            populateAgeGroupDropdown();
            showResults('5.3km');
        } else {
            showNoDataMessage('Noch keine Ergebnisse vorhanden.');
        }
    } catch (e) {
        console.error('Error loading results:', e);
        showNoDataMessage('Fehler beim Laden der Daten.');
    }
}

/**
 * Populate age group dropdown with available categories
 */
function populateAgeGroupDropdown() {
    const dropdown = document.getElementById('agegroup-select');
    if (!dropdown) return;

    // Get unique age groups from current results
    const availableGroups = new Set();
    let hasMale = false;
    let hasFemale = false;

    allResults.forEach(r => {
        if (r.Altersklasse) {
            availableGroups.add(r.Altersklasse);
            if (r.Altersklasse.startsWith('M')) hasMale = true;
            if (r.Altersklasse.startsWith('W')) hasFemale = true;
        }
    });

    // Clear and rebuild options
    dropdown.innerHTML = '<option value="Gesamt">Gesamt (alle)</option>';

    // Add M/W options if applicable
    if (hasMale) {
        dropdown.innerHTML += '<option value="M">Männer (alle)</option>';
    }
    if (hasFemale) {
        dropdown.innerHTML += '<option value="W">Frauen (alle)</option>';
    }

    // Add specific age group categories
    AGE_GROUP_OPTIONS.forEach(opt => {
        if (opt.value !== 'Gesamt' && opt.value !== 'M' && opt.value !== 'W' && availableGroups.has(opt.value)) {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            dropdown.appendChild(option);
        }
    });
}

/**
 * Handle age group dropdown change
 */
function filterByAgeGroup(ageGroup) {
    currentAgeGroup = ageGroup;
    showResults(currentDistance, ageGroup);
}

function showResults(distance, ageGroup = null) {
    currentDistance = distance;
    if (ageGroup !== null) {
        currentAgeGroup = ageGroup;
    }

    // Update distance tab styles
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.distance === distance);
    });

    // Filter by distance first
    let filtered = allResults.filter(r => r.Strecke === distance);

    // Sort by time
    filtered.sort((a, b) => (a.Zeit || '99:99:99').localeCompare(b.Zeit || '99:99:99'));

    // Calculate overall ranking (before age group filter)
    filtered.forEach((r, i) => {
        r.platzGesamt = i + 1;
    });

    // Calculate age group rankings
    const akRankings = {};
    filtered.forEach(r => {
        const ak = r.Altersklasse || 'Unbekannt';
        if (!akRankings[ak]) {
            akRankings[ak] = 0;
        }
        akRankings[ak]++;
        r.platzAK = akRankings[ak];
    });

    // Apply age group filter if not "Gesamt"
    if (currentAgeGroup !== 'Gesamt') {
        if (currentAgeGroup === 'M') {
            // All men
            filtered = filtered.filter(r => r.Altersklasse && r.Altersklasse.startsWith('M'));
        } else if (currentAgeGroup === 'W') {
            // All women
            filtered = filtered.filter(r => r.Altersklasse && r.Altersklasse.startsWith('W'));
        } else {
            // Specific age group
            filtered = filtered.filter(r => r.Altersklasse === currentAgeGroup);
        }
    }

    // Update count display
    const countEl = document.getElementById('participant-count');
    if (countEl) {
        let label = 'Ergebnisse';
        if (currentAgeGroup === 'M') {
            label = 'Ergebnisse (Männer)';
        } else if (currentAgeGroup === 'W') {
            label = 'Ergebnisse (Frauen)';
        } else if (currentAgeGroup !== 'Gesamt') {
            label = `Ergebnisse (${currentAgeGroup})`;
        }
        countEl.textContent = `${filtered.length} ${label}`;
    }

    const tbody = document.getElementById('results-body');
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #666;">Keine Ergebnisse für diese Auswahl.</td></tr>';
        return;
    }

    // Determine which rank to show based on filter
    const showAKRank = currentAgeGroup !== 'Gesamt' && currentAgeGroup !== 'M' && currentAgeGroup !== 'W';

    tbody.innerHTML = filtered.map(r => {
        const displayRank = showAKRank ? r.platzAK : r.platzGesamt;
        const akDisplay = r.Altersklasse || '-';
        const escapedVerein = (r.Verein || '-').replace(/'/g, "\\'");
        const escapedVorname = (r.Vorname || '').replace(/'/g, "\\'");
        const escapedNachname = (r.Nachname || '').replace(/'/g, "\\'");

        return `
            <tr>
                <td>${displayRank}</td>
                <td>${r.Vorname} ${r.Nachname}</td>
                <td>${r.Verein || '-'}</td>
                <td>${akDisplay}</td>
                <td>${r.Zeit}</td>
                <td><button class="urkunde-btn" onclick="generateCertificate(${r.platzGesamt}, '${escapedVorname}', '${escapedNachname}', '${r.Zeit}', '${r.Strecke}', '${escapedVerein}', '${akDisplay}', ${r.platzAK})"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button></td>
            </tr>
        `;
    }).join('');
}

function switchDistance(distance) {
    // Check which page we're on
    if (document.getElementById('teilnehmer-section')) {
        showParticipants(distance);
    } else if (document.getElementById('ergebnisse-section')) {
        showResults(distance, currentAgeGroup);
    }
}

function showNoDataMessage(message) {
    const tbody = document.getElementById('results-body');
    if (tbody) {
        const colspan = document.getElementById('ergebnisse-section') ? 6 : 2;
        tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center; padding: 40px; color: #666;">${message}</td></tr>`;
    }
}

// ============================================
// URKUNDEN PDF GENERIERUNG
// ============================================
function drawCertificateCanvas(platz, vorname, nachname, zeit, strecke, verein, altersklasse, platzAK) {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = Math.round(800 * (certificateBg.naturalHeight / certificateBg.naturalWidth));
    const ctx = canvas.getContext('2d');

    ctx.drawImage(certificateBg, 0, 0, canvas.width, canvas.height);

    const font = 'Calibri, Candara, "Segoe UI", Arial, sans-serif';
    const cx = canvas.width * 0.70;
    const colorDark = '#04368b';
    const colorMid  = '#444444';
    const streckeText = strecke === 'kinderlauf' ? 'Schülerlauf (U14)' : strecke.includes('10') ? '10,6 km' : '5,3 km';

    // Zeilen mit individuellem Abstand
    const lines = [];
    lines.push({ text: `${vorname} ${nachname}`, font: `bold 40px ${font}`, color: colorDark, gap: 56 });
    if (verein && verein !== '-')
        lines.push({ text: verein, font: `22px ${font}`, color: colorMid, gap: 46 });
    lines.push({ text: `${platz}. Platz`, font: `bold 36px ${font}`, color: colorDark, gap: 46 });
    if (altersklasse && altersklasse !== '-' && platzAK)
        lines.push({ text: `${platzAK}. Platz in ${altersklasse}`, font: `22px ${font}`, color: colorMid, gap: 46 });
    lines.push({ text: `Strecke: ${streckeText}`, font: `26px ${font}`, color: colorMid, gap: 46 });
    lines.push({ text: `Zeit: ${zeit}`, font: `bold 36px ${font}`, color: colorDark, gap: 0 });

    // Freies Textfeld: Bild y=795–1685 → Canvas y=450–954
    const AREA_TOP    = Math.round(canvas.height * (450 / 1132));
    const AREA_BOTTOM = Math.round(canvas.height * (954 / 1132));
    const areaCenter  = Math.round((AREA_TOP + AREA_BOTTOM) / 2);
    const totalH = lines.slice(0, -1).reduce((sum, l) => sum + l.gap, 0) + 36;
    let cy = areaCenter - Math.round(totalH / 2);

    ctx.textAlign = 'center';
    lines.forEach(line => {
        ctx.font = line.font;
        ctx.fillStyle = line.color;
        ctx.fillText(line.text, cx, cy);
        cy += line.gap;
    });

    return canvas;
}

function generateCertificate(platz, vorname, nachname, zeit, strecke, verein, altersklasse, platzAK) {
    if (!certificateBg.complete || !certificateBg.naturalWidth) {
        alert('Hintergrundbild wird noch geladen, bitte kurz warten und erneut versuchen.');
        return;
    }

    const canvas = drawCertificateCanvas(platz, vorname, nachname, zeit, strecke, verein, altersklasse, platzAK);

    try {
        const link = document.createElement('a');
        link.download = `Urkunde_${vorname}_${nachname}_Stauseelauf2026.png`;
        link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        console.error('Urkunde Download Fehler:', err);
        alert('Download fehlgeschlagen: ' + err.message);
    }
}
