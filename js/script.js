const CONFIG = {
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxDAMR_FixqdBtCTsahEDnYcES7e0luNaM8WWihaoOQltthoS7bJbpb2pU_nBFlACNd/exec'
};

let isMemberMode = false;

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
        // Anmeldeschluss: 06.12.2026, 10:00 Uhr (1 Std. vor Start)
        const DEADLINE = new Date('2026-12-06T09:00:00Z');
        if (new Date() >= DEADLINE) {
            const section = document.getElementById('anmeldung');
            if (section) {
                section.innerHTML = `
                    <div style="text-align:center; padding: 60px 20px; max-width: 520px; margin: 0 auto;">
                        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#1a5f7a" stroke-width="1.5" style="margin-bottom:20px;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        <h2 style="color:var(--primary-color);margin-bottom:12px;">Anmeldung geschlossen</h2>
                        <p style="color:#555;font-size:1.05rem;line-height:1.7;">Der Anmeldeschluss war am 6. Dezember 2026 um 10:00 Uhr.<br>Eine Nachmeldung ist nicht mehr möglich.</p>
                        <p style="color:#888;margin-top:16px;">Wir freuen uns, euch beim nächsten Nikolauslauf wieder begrüßen zu dürfen!</p>
                    </div>`;
            }
        } else {
        form.addEventListener('submit', handleFormSubmit);
        checkUrlParams();
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('mitglied') === '1') {
            isMemberMode = true;
            activateMemberMode();
        }
        } // end else (registration open)
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
            if (navTeilnehmer) navTeilnehmer.classList.add('hidden');
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
// START-TYP (Team / Einzelstarter)
// ============================================
const TEAM_PRICE_EUR = 25;
const SOLO_PRICE_EUR = 20;

function onStartTypeChange() {
    const type = document.querySelector('input[name="startType"]:checked').value;

    document.querySelectorAll('.start-type-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.type === type);
    });

    const p2 = document.querySelector('.participant-card[data-index="1"]');
    const p2Inputs = p2 ? p2.querySelectorAll('input') : [];
    if (type === 'solo') {
        if (p2) p2.style.display = 'none';
        p2Inputs.forEach(i => i.required = false);
        document.getElementById('p0-label').textContent = 'Deine Daten';
    } else {
        if (p2) p2.style.display = '';
        p2Inputs.forEach(i => i.required = true);
        document.getElementById('p0-label').textContent = 'Person 1';
    }

    updateTotalPrice();
}

// ============================================
// MITGLIEDS-MODUS
// ============================================
function activateMemberMode() {
    const banner = document.getElementById('member-banner');
    if (banner) banner.style.display = 'block';

    const donationBlock = document.getElementById('spomio-donation-block');
    if (donationBlock) donationBlock.style.display = 'none';

    const priceInfo = document.querySelector('.price-info');
    if (priceInfo) priceInfo.style.display = 'none';

    const paymentNote = document.querySelector('.payment-note');
    if (paymentNote) paymentNote.textContent = 'Deine Anmeldung wird direkt bestätigt – keine Zahlung erforderlich.';

    updateTotalPrice();
}

function getDonationCents() {
    const custom = document.getElementById('donation-custom');
    if (custom && custom.value) {
        const val = parseFloat(custom.value);
        if (!isNaN(val) && val >= 1) return Math.round(val * 100);
    }
    const checked = document.querySelector('input[name="donation"]:checked');
    return checked ? parseInt(checked.value) : 0;
}

function onDonationRadioChange() {
    const custom = document.getElementById('donation-custom');
    if (custom) custom.value = '';
    updateTotalPrice();
}

function onDonationCustomInput() {
    document.querySelectorAll('input[name="donation"]').forEach(r => r.checked = false);
    updateTotalPrice();
}

function updateTotalPrice() {
    const btn = document.getElementById('submit-btn');
    if (isMemberMode) {
        if (btn) btn.textContent = 'Kostenlos anmelden (TSV-Mitglied)';
        return;
    }
    const type = document.querySelector('input[name="startType"]:checked').value;
    const total = type === 'solo' ? SOLO_PRICE_EUR : TEAM_PRICE_EUR;
    const donationEur = getDonationCents() / 100;
    const donationLabel = donationEur > 0 ? ` + ${donationEur} EUR Spende` : '';
    if (btn) btn.textContent = `Weiter zur Zahlung (${total} EUR${donationLabel})`;
}

function getParticipants() {
    const type = document.querySelector('input[name="startType"]:checked').value;
    const cards = document.querySelectorAll('.participant-card');
    const list = Array.from(cards).map(card => ({
        firstName: card.querySelector('[name="firstName"]').value.trim(),
        lastName:  card.querySelector('[name="lastName"]').value.trim(),
    }));
    return type === 'solo' ? [list[0]] : list;
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
    const startType = document.querySelector('input[name="startType"]:checked').value;
    const teamName = document.getElementById('teamName').value.trim();
    const participants = getParticipants();

    if (isMemberMode) {
        await handleMemberSubmit(email, startType, teamName, participants);
        return;
    }

    try {
        const params = new URLSearchParams({
            action: 'createCheckout',
            email: email,
            startType: startType,
            teamName: teamName,
            participants: JSON.stringify(participants),
            donation: String(getDonationCents())
        });

        const response = await fetch(CONFIG.APPS_SCRIPT_URL + '?' + params.toString());
        const result = await response.json();

        if (result.checkoutUrl) {
            // Daten für Success-Seite zwischenspeichern
            sessionStorage.setItem('registrationData', JSON.stringify({
                email: email,
                startType: startType,
                teamName: teamName,
                participants: participants
            }));
            window.location.href = result.checkoutUrl;
        } else if (result.error === 'ausgebucht') {
            setLoading(false);
            showError('Leider sind bereits alle 100 Plätze vergeben.');
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

async function handleMemberSubmit(email, startType, teamName, participants) {
    try {
        const params = new URLSearchParams({
            action: 'registerMember',
            email: email,
            startType: startType,
            teamName: teamName,
            participants: JSON.stringify(participants)
        });

        const response = await fetch(CONFIG.APPS_SCRIPT_URL + '?' + params.toString());
        const result = await response.json();

        if (result.success) {
            sessionStorage.setItem('registrationData', JSON.stringify({ email, startType, teamName, participants }));
            window.location.href = '/success';
        } else if (result.error === 'ausgebucht') {
            setLoading(false);
            showError('Leider sind bereits alle 100 Plätze vergeben.');
        } else {
            setLoading(false);
            showError('Fehler: ' + (result.error || 'Unbekannter Fehler'));
        }
    } catch (error) {
        setLoading(false);
        showError('Verbindungsfehler. Bitte versuche es erneut.');
        console.error('Member registration error:', error);
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

    // Teilnehmer-Cards (nur sichtbare, d.h. bei Einzelstartern nur Person 1)
    document.querySelectorAll('.participant-card').forEach(card => {
        if (card.style.display === 'none') return;
        ['firstName', 'lastName'].forEach(name => {
            const field = card.querySelector(`[name="${name}"]`);
            if (!field.value.trim()) { field.classList.add('error'); isValid = false; }
            else field.classList.remove('error');
        });
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
            showParticipants();
        } else {
            showNoDataMessage('Noch keine Teilnehmer angemeldet.');
        }
    } catch (e) {
        console.error('Error loading participants:', e);
        showNoDataMessage('Fehler beim Laden der Daten.');
    }
}

function showParticipants() {
    // Pro Anmeldung (OrderID) ein Team/Einzelstarter-Eintrag, sortiert nach Teamname
    const groups = {};
    allParticipants.forEach(r => {
        const key = r.OrderID || (r.Vorname + r.Nachname);
        if (!groups[key]) {
            groups[key] = { team: r.Team || '', typ: r.Typ || 'Team', members: [] };
        }
        groups[key].members.push(`${r.Vorname} ${r.Nachname}`.trim());
    });

    const filtered = Object.values(groups)
        .sort((a, b) => (a.team || a.members[0] || '').localeCompare(b.team || b.members[0] || ''));

    const personCount = allParticipants.length;
    const countEl = document.getElementById('participant-count');
    if (countEl) {
        countEl.textContent = `${filtered.length} Anmeldungen (${personCount} Personen)`;
    }

    const tbody = document.getElementById('results-body');
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align: center; padding: 40px; color: #666;">Noch keine Teilnehmer angemeldet.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(g => `
        <tr>
            <td>${g.typ === 'Einzelstarter' ? 'Einzelstarter' : (g.team || 'Team')}</td>
            <td>${g.members.join(' &amp; ')}</td>
        </tr>
    `).join('');
}

// ============================================
// ERGEBNISSE
// ============================================
let allResults = [];
let currentDistance = '5.3km';
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

    // Calculate gender-specific rankings
    const genderRankings = { M: 0, W: 0 };
    filtered.forEach(r => {
        const g = (r.Altersklasse && r.Altersklasse.startsWith('W')) ? 'W' : 'M';
        genderRankings[g]++;
        r.platzGeschlecht = genderRankings[g];
        r.geschlecht = g;
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

    tbody.innerHTML = filtered.map(r => {
        const displayRank = currentAgeGroup === 'Gesamt' ? r.platzGesamt
            : (currentAgeGroup === 'M' || currentAgeGroup === 'W') ? r.platzGeschlecht
            : r.platzAK;
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
                <td><button class="urkunde-btn" onclick="generateCertificate(${r.platzGeschlecht}, '${escapedVorname}', '${escapedNachname}', '${r.Zeit}', '${r.Strecke}', '${escapedVerein}', '${akDisplay}', ${r.platzAK}, '${r.geschlecht}')"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button></td>
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
function drawCertificateCanvas(platz, vorname, nachname, zeit, strecke, verein, altersklasse, platzAK, geschlecht) {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = Math.round(800 * (certificateBg.naturalHeight / certificateBg.naturalWidth));
    const ctx = canvas.getContext('2d');

    ctx.drawImage(certificateBg, 0, 0, canvas.width, canvas.height);

    const font = 'Calibri, Candara, "Segoe UI", Arial, sans-serif';
    const cx = canvas.width * 0.50;
    const colorDark = '#04368b';
    const colorMid  = '#444444';
    const streckeText = strecke === 'test' ? 'Testlauf' : strecke.includes('10') ? '10,5 km' : '3,5 km';

    const hasVerein = !!(verein && verein !== '-');
    const hasAK     = !!(altersklasse && altersklasse !== '-' && platzAK);

    // Gap = visual_whitespace + current_descender(fs*0.25) + next_ascender(fs*0.75)
    // Within group (tight, ~8.5px WS): Name↔Verein, Platz↔AK
    // Between groups (loose, ~18.5px WS): Verein→Platz, AK→Strecke
    // Strecke→Zeit (~12px WS): medium, accounts for size jump 24→36px
    const lines = [];
    lines.push({ text: `${vorname} ${nachname}`, font: `bold 40px ${font}`, color: colorDark, gap: hasVerein ? 35 : 55 });
    if (hasVerein)
        lines.push({ text: verein, font: `22px ${font}`, color: colorMid, gap: 51 });
    const genderLabel = geschlecht === 'W' ? 'Frauen' : 'Männer';
    lines.push({ text: `${platz}. Platz ${genderLabel}`, font: `bold 36px ${font}`, color: colorDark, gap: hasAK ? 34 : 45 });
    if (hasAK)
        lines.push({ text: `${platzAK}. Platz in ${altersklasse}`, font: `22px ${font}`, color: colorMid, gap: 42 });
    lines.push({ text: `Strecke: ${streckeText}`, font: `24px ${font}`, color: colorMid, gap: 45 });
    lines.push({ text: `Zeit: ${zeit}`, font: `bold 36px ${font}`, color: colorDark, gap: 0 });

    // White content area: brightness scan shows clear zone from 40%–85% of canvas height
    const AREA_TOP    = Math.round(canvas.height * (509 / 1132));
    const AREA_BOTTOM = Math.round(canvas.height * (958 / 1132));
    const areaCenter  = Math.round((AREA_TOP + AREA_BOTTOM) / 2);
    // Exact vertical centering: cy = areaCenter - sumGaps/2 + (firstFs*0.75 - lastFs*0.25)/2
    // = areaCenter - sumGaps/2 + (40*0.75 - 36*0.25)/2 = areaCenter - sumGaps/2 + 10
    const sumGaps = lines.slice(0, -1).reduce((sum, l) => sum + l.gap, 0);
    let cy = Math.round(areaCenter - sumGaps / 2 + 10);

    ctx.textAlign = 'center';
    lines.forEach(line => {
        ctx.font = line.font;
        ctx.fillStyle = line.color;
        ctx.fillText(line.text, cx, cy);
        cy += line.gap;
    });

    return canvas;
}

function generateCertificate(platz, vorname, nachname, zeit, strecke, verein, altersklasse, platzAK, geschlecht) {
    if (!certificateBg.complete || !certificateBg.naturalWidth) {
        alert('Hintergrundbild wird noch geladen, bitte kurz warten und erneut versuchen.');
        return;
    }

    const canvas = drawCertificateCanvas(platz, vorname, nachname, zeit, strecke, verein, altersklasse, platzAK, geschlecht);

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
