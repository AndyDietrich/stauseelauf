// ============================================
// NIKOLAUSLAUF 2026 – WICHTIGER HINWEIS
// ============================================
// Diese Datei ist nur eine lokale Kopie. Die tatsächlich aktive Version
// liegt im Apps Script Editor, der an das unten verlinkte Google Sheet
// gebunden ist (script.google.com, Projekt am Sheet SPREADSHEET_ID).
// Änderungen hier werden NICHT automatisch live geschaltet – nach Review
// muss der Inhalt dieser Datei manuell in den Apps Script Editor kopiert
// und dort neu deployed werden (Deploy > Manage deployments > Edit > neue
// Version). Außerdem muss im Sheet "Teilnehmer" die Kopfzeile angepasst
// werden: Spalte E (bisher "Jahrgang") -> "Team", Spalte F (bisher
// "Geschlecht") -> "Typ". Spalten G/H bleiben technisch bestehen, werden
// aber nicht mehr befüllt (immer "-"). Spalten I/J/K (Status/OrderID/
// PaymentID) bleiben an Position 9/10/11 – das ist wichtig, weil die
// Stripe-Webhook-Cloud-Function (webhook-cloud-function/index.js) diese
// Spalten über feste Indizes anspricht.
// Vor dem ersten Live-Lauf außerdem: alte Stauseelauf-Zeilen aus dem
// Sheet in ein Archiv-Tab verschieben/löschen und PUBLISH_CELL (N1)
// wieder auf FALSE setzen, bis die neue Teilnehmerliste veröffentlicht
// werden soll.
// ============================================

const SPREADSHEET_ID = '1aRfbY4shiAEZWpvK6JPkQsR4rbn_rbyhLysrpwH01UM';
const SHEET_NAME = 'Teilnehmer';
const PUBLISH_CELL = 'N1';

// Stripe Configuration
const STRIPE_SECRET_KEY =
'';
const STRIPE_WEBHOOK_SECRET = ''; // Optional: Add webhook signing secret for production

// Website URLs
const SUCCESS_URL = 'https://kneipp-run.de/success';
const CANCEL_URL = 'https://kneipp-run.de/registration?error=cancelled';
const DONATE_SUCCESS_URL = 'https://kneipp-run.de/success-spende';
const DONATE_CANCEL_URL = 'https://kneipp-run.de/spende?error=cancelled';

// Prices in cents (Nikolauslauf: pauschal pro Team bzw. Einzelstarter)
const PRICE_CENTS_TEAM = 2500; // 25 EUR pro Team (2 Personen)
const PRICE_CENTS_SOLO = 2000; // 20 EUR Einzelstarter

// Teilnehmerlimit (Personen, nicht Teams)
const PARTICIPANT_LIMIT = 100;

// ============================================
// SPENDENKAMPAGNE
// ============================================
// Aktuell: Kinder- und Jugendabteilung (Geld bleibt im Verein).
// Zum Zurückwechseln auf Spomio e.V.: unteren Block auskommentieren,
// den Spomio-Block darunter einkommentieren.
const DONATION_PRODUCT_NAME = 'Spende TSV Bad Wörishofen - Kinder- und Jugendabteilung';
const DONATION_DESCRIPTION_SUFFIX = 'Trainingsausrüstung für die Kinder- und Jugendabteilung';
/* SPOMIO-VARIANTE (inaktiv):
const DONATION_PRODUCT_NAME = 'Spende Spomio e.V. Mindelheim';
const DONATION_DESCRIPTION_SUFFIX = 'Inklusionsverein für Kinder mit und ohne Behinderung';
*/

// Race Day
const RACE_DATE = new Date(2026, 11, 6); // 6. Dezember 2026 (month is 0-indexed)
const PREVIEW_SHEET_NAME = 'Ergebnis-Vorschau'; // Stausee-Altlast, aktuell ungenutzt

// ============================================
// GET REQUEST HANDLER
// ============================================

function doGet(e) {
  const action = e.parameter.action || 'data';

  try {
    // Fetch data (for participant list / results)
    if (action === 'data') {
      return handleDataRequest();
    }

    // Fetch just the publish status
    if (action === 'status') {
      return handleStatusRequest();
    }

    // Create Stripe Checkout Session
    if (action === 'createCheckout') {
      return handleCreateCheckout(e.parameter);
    }

    // Free registration for TSV members
    if (action === 'registerMember') {
      return handleMemberRegistration(e.parameter);
    }

    // Standalone donation (Zweck: siehe DONATION_PRODUCT_NAME)
    if (action === 'createDonation') {
      return handleCreateDonation(e.parameter);
    }

    return jsonResponse({ error: 'Unknown action' });

  } catch (error) {
    Logger.log('Error in doGet: ' + error.message);
    return jsonResponse({ error: error.message });
  }
}

// ============================================
// POST REQUEST HANDLER (Stripe Webhook)
// ============================================

function doPost(e) {
  try {
    const payload = e.postData.contents;
    const event = JSON.parse(payload);

    // Handle Stripe webhook event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      // Check for duplicate using orderId
      if (isDuplicateOrder(session.metadata.orderId)) {
        Logger.log('Duplicate webhook ignored: ' + session.metadata.orderId);
        return ContentService
          .createTextOutput(JSON.stringify({ received: true, duplicate: true }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      handleCheckoutCompleted(session);
    }

    // Return plain text response to avoid redirect issues
    return ContentService
      .createTextOutput(JSON.stringify({ received: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error in doPost: ' + error.message);
    return ContentService
      .createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Check if this order has already been processed (by orderId)
function isDuplicateOrder(orderId) {
  if (!orderId) return false;

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  // Column J (index 9) = OrderID, Column I (index 8) = Status
  for (let i = 1; i < data.length; i++) {
    if (data[i][9] === orderId && data[i][8] === 'Bezahlt') {
      return true;
    }
  }
  return false;
}

// ============================================
// DATA HANDLERS
// ============================================

function handleDataRequest() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  const results = rows
    .filter(row => {
      // Only return confirmed registrations (Status = 'Bezahlt')
      const statusIdx = headers.indexOf('Status');
      return statusIdx === -1 || row[statusIdx] === 'Bezahlt';
    })
    .map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });

      // Calculate and add age group data
      const age = calculateAgeOnRaceDay(obj.Jahrgang);
      obj.Alter = age;
      obj.Altersklasse = getAgeGroup(age, obj.Geschlecht);

      // Format Zeit if it's a Date object
      if (obj.Zeit) {
        obj.Zeit = formatTime(obj.Zeit);
      }

      return obj;
    });

  const status = sheet.getRange(PUBLISH_CELL).getValue() || 'FALSE';

  return jsonResponse({
    status: status,
    data: results
  });
}

function handleStatusRequest() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  const status = sheet.getRange(PUBLISH_CELL).getValue() || 'FALSE';
  return jsonResponse({ status: status });
}

// ============================================
// MEMBER REGISTRATION (kostenfrei)
// ============================================

function handleMemberRegistration(params) {
  if (!params.email || !params.participants) {
    return jsonResponse({ error: 'missing_fields' });
  }

  let participants;
  try {
    participants = JSON.parse(params.participants);
  } catch (e) {
    return jsonResponse({ error: 'invalid_participants' });
  }

  if (!participants.length || participants.length > 2) {
    return jsonResponse({ error: 'invalid_participants' });
  }

  if (countActiveParticipants() + participants.length > PARTICIPANT_LIMIT) {
    return jsonResponse({ error: 'ausgebucht' });
  }

  const email = params.email;
  const startType = params.startType === 'solo' ? 'Einzelstarter' : 'Team';
  const teamName = params.teamName || '';
  const orderId = 'MITGLIED-' + Date.now();

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  participants.forEach(function(p) {
    sheet.appendRow([
      new Date().toLocaleString('de-DE'), // Timestamp
      p.firstName,                         // Vorname
      p.lastName,                          // Nachname
      email,                               // E-Mail
      teamName,                            // Team (ehem. Jahrgang)
      startType,                           // Typ (ehem. Geschlecht)
      '-',                                 // Strecke (ungenutzt)
      '-',                                 // Verein (ungenutzt)
      'Bezahlt',                           // Status
      orderId,                             // OrderID
      'Mitglied',                          // Payment ID
      ''                                   // Startnummer
    ]);
  });

  Logger.log('Mitglieds-Anmeldung: ' + orderId + ' (' + participants.length + ' Teilnehmer)');
  return jsonResponse({ success: true });
}

// Anzahl Personen, die bereits bezahlt haben oder gerade im Checkout sind
// (zählt "Ausstehend" mit, um Überbuchung bei gleichzeitigen Checkouts zu vermeiden)
function countActiveParticipants() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][8] === 'Bezahlt' || data[i][8] === 'Ausstehend') count++;
  }
  return count;
}

// ============================================
// STANDALONE DONATION HANDLER
// ============================================

function handleCreateDonation(params) {
  const amount = parseInt(params.amount || '0');
  if (amount < 100) {
    return jsonResponse({ error: 'invalid_amount' });
  }

  const email = params.email || '';
  const name = params.name || 'Anonym';
  const donationId = 'spende_' + Date.now();

  try {
    const url = 'https://api.stripe.com/v1/checkout/sessions';
    const amountEur = (amount / 100).toFixed(2).replace('.', ',');

    const payload = {
      'mode': 'payment',
      'success_url': DONATE_SUCCESS_URL,
      'cancel_url': DONATE_CANCEL_URL,
      'metadata[type]': 'spende',
      'metadata[donationId]': donationId,
      'metadata[name]': name,
      'metadata[email]': email,
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': String(amount),
      'line_items[0][price_data][product_data][name]': DONATION_PRODUCT_NAME,
      'line_items[0][price_data][product_data][description]': amountEur + ' EUR – ' + DONATION_DESCRIPTION_SUFFIX,
      'line_items[0][quantity]': '1'
    };

    if (email) {
      payload['customer_email'] = email;
    }

    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: payload,
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());
    if (result.error) {
      throw new Error(result.error.message);
    }

    Logger.log('Spende erstellt: ' + donationId + ' (' + amount + ' Cent)');
    return jsonResponse({ checkoutUrl: result.url });

  } catch (error) {
    Logger.log('Stripe Spende Fehler: ' + error.message);
    return jsonResponse({ error: error.message });
  }
}

// ============================================
// STRIPE CHECKOUT HANDLER
// ============================================

function handleCreateCheckout(params) {
  if (!params.email || !params.participants) {
    return jsonResponse({ error: 'missing_fields' });
  }

  let participants;
  try {
    participants = JSON.parse(params.participants);
  } catch (e) {
    return jsonResponse({ error: 'invalid_participants' });
  }

  if (!participants.length || participants.length > 2) {
    return jsonResponse({ error: 'invalid_participants' });
  }

  if (countActiveParticipants() + participants.length > PARTICIPANT_LIMIT) {
    return jsonResponse({ error: 'ausgebucht' });
  }

  const donation = parseInt(params.donation || '0');
  const email = params.email;
  const startType = params.startType === 'solo' ? 'Einzelstarter' : 'Team';
  const teamName = params.teamName || '';
  const orderId = 'order_' + Date.now();

  // Pre-store all participants with status "Ausstehend"
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  participants.forEach(function(p) {
    sheet.appendRow([
      new Date().toLocaleString('de-DE'), // Timestamp
      p.firstName,                         // Vorname
      p.lastName,                          // Nachname
      email,                               // E-Mail
      teamName,                            // Team (ehem. Jahrgang)
      startType,                           // Typ (ehem. Geschlecht)
      '-',                                 // Strecke (ungenutzt)
      '-',                                 // Verein (ungenutzt)
      'Ausstehend',                        // Status
      orderId,                             // OrderID
      '',                                  // Stripe Payment ID
      ''                                   // Startnummer
    ]);
  });

  try {
    const checkoutUrl = createStripeCheckoutSession(participants, email, orderId, donation, startType, teamName);
    return jsonResponse({ checkoutUrl: checkoutUrl });
  } catch (error) {
    Logger.log('Stripe error: ' + error.message);
    return jsonResponse({ error: error.message });
  }
}

function createStripeCheckoutSession(participants, email, orderId, donation, startType, teamName) {
  const url = 'https://api.stripe.com/v1/checkout/sessions';
  donation = donation || 0;

  const payload = {
    'mode': 'payment',
    'success_url': SUCCESS_URL,
    'cancel_url': CANCEL_URL,
    'customer_email': email,
    'metadata[orderId]': orderId,
    'metadata[email]': email,
    'metadata[count]': String(participants.length),
    'metadata[startType]': startType,
    'metadata[teamName]': teamName,
    'metadata[donation]': String(donation)
  };

  const isSolo = startType === 'Einzelstarter';
  const priceCents = isSolo ? PRICE_CENTS_SOLO : PRICE_CENTS_TEAM;
  const names = participants.map(function(p) { return p.firstName + ' ' + p.lastName; }).join(' & ');
  const productName = 'Nikolauslauf 2026 - ' + (isSolo ? 'Einzelstarter' : 'Team' + (teamName ? ' "' + teamName + '"' : ''));

  payload['line_items[0][price_data][currency]'] = 'eur';
  payload['line_items[0][price_data][unit_amount]'] = String(priceCents);
  payload['line_items[0][price_data][product_data][name]'] = productName;
  payload['line_items[0][price_data][product_data][description]'] = names;
  payload['line_items[0][quantity]'] = '1';

  participants.forEach(function(p, i) {
    payload['metadata[p' + i + '_firstName]'] = p.firstName;
    payload['metadata[p' + i + '_lastName]'] = p.lastName;
  });

  // Optional donation as extra line item (siehe DONATION_PRODUCT_NAME oben)
  if (donation > 0) {
    const donationEur = (donation / 100).toFixed(2).replace('.', ',');
    payload['line_items[1][price_data][currency]'] = 'eur';
    payload['line_items[1][price_data][unit_amount]'] = String(donation);
    payload['line_items[1][price_data][product_data][name]'] = DONATION_PRODUCT_NAME;
    payload['line_items[1][price_data][product_data][description]'] = donationEur + ' EUR – ' + DONATION_DESCRIPTION_SUFFIX;
    payload['line_items[1][quantity]'] = '1';
  }

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    payload: payload,
    muteHttpExceptions: true
  });

  const result = JSON.parse(response.getContentText());

  if (result.error) {
    Logger.log('Stripe API Error: ' + JSON.stringify(result.error));
    throw new Error(result.error.message);
  }

  return result.url;
}

// ============================================
// STRIPE WEBHOOK HANDLER
// ============================================

function handleCheckoutCompleted(session) {
  const orderId = session.metadata.orderId;

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) {
    Logger.log('Sheet not found: ' + SHEET_NAME);
    return;
  }

  const data = sheet.getDataRange().getValues();
  let updated = 0;

  // Find all "Ausstehend" rows with this orderId and mark as "Bezahlt"
  for (let i = 1; i < data.length; i++) {
    if (data[i][9] === orderId && data[i][8] === 'Ausstehend') {
      sheet.getRange(i + 1, 9).setValue('Bezahlt');              // Status (col I)
      sheet.getRange(i + 1, 11).setValue(session.payment_intent); // Stripe Payment ID (col K)
      updated++;
    }
  }

  Logger.log('Order ' + orderId + ': ' + updated + ' Teilnehmer auf Bezahlt gesetzt.');
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function redirectTo(url) {
  return HtmlService.createHtmlOutput(
    '<script>window.top.location.href = "' + url + '";</script>'
  );
}

// ============================================
// AGE GROUP CALCULATION
// ============================================

/**
 * Format time value for display (handles Date objects from Sheets)
 */
function formatTime(timeValue) {
  if (!timeValue) return '';

  // If it's a Date object, extract time
  if (timeValue instanceof Date) {
    const hours = String(timeValue.getHours()).padStart(2, '0');
    const minutes = String(timeValue.getMinutes()).padStart(2, '0');
    const seconds = String(timeValue.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  // If it's already a string, return as-is
  return String(timeValue);
}

/**
 * Calculate age on race day based on birth year
 */
function calculateAgeOnRaceDay(birthYear) {
  if (!birthYear) return null;
  const year = parseInt(birthYear);
  if (isNaN(year)) return null;
  return RACE_DATE.getFullYear() - year;
}

/**
 * Determine age group category based on age and gender
 * Returns format like "M40", "WU20", "MHK"
 */
function getAgeGroup(age, gender) {
  if (age === null) return '';

  const prefix = (gender === 'w' || gender === 'W') ? 'W' : 'M';

  if (age < 20) return prefix + 'U20';
  if (age < 23) return prefix + 'U23';
  if (age < 30) return prefix + 'HK';
  if (age < 35) return prefix + '30';
  if (age < 40) return prefix + '35';
  if (age < 45) return prefix + '40';
  if (age < 50) return prefix + '45';
  if (age < 55) return prefix + '50';
  if (age < 60) return prefix + '55';
  if (age < 65) return prefix + '60';
  if (age < 70) return prefix + '65';
  if (age < 75) return prefix + '70';
  if (age < 80) return prefix + '75';
  return prefix + '80';
}

// ============================================
// PREVIEW SHEET FUNCTIONS
// ============================================

/**
 * Create or update the Ergebnis-Vorschau sheet
 * Call this manually or set up a trigger
 */
function updatePreviewSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sourceSheet = ss.getSheetByName(SHEET_NAME);

  // Get or create preview sheet
  let previewSheet = ss.getSheetByName(PREVIEW_SHEET_NAME);
  if (!previewSheet) {
    previewSheet = ss.insertSheet(PREVIEW_SHEET_NAME);
  }

  // Clear existing content
  previewSheet.clear();

  // Get source data
  const data = sourceSheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  // Find column indices
  const colIndex = {
    vorname: headers.indexOf('Vorname'),
    nachname: headers.indexOf('Nachname'),
    verein: headers.indexOf('Verein'),
    geburtsdatum: headers.indexOf('Jahrgang'),
    geschlecht: headers.indexOf('Geschlecht'),
    strecke: headers.indexOf('Strecke'),
    zeit: headers.indexOf('Zeit'),
    status: headers.indexOf('Status')
  };

  // Check if Zeit column exists
  if (colIndex.zeit === -1) {
    previewSheet.getRange(1, 1).setValue('Hinweis: Spalte "Zeit" fehlt in ' + SHEET_NAME);
    return;
  }

  // Process only confirmed participants with times
  const participants = rows
    .filter(row => (colIndex.status === -1 || row[colIndex.status] === 'Bezahlt') &&
                   row[colIndex.zeit] && String(row[colIndex.zeit]).trim() !== '')
    .map(row => {
      const age = calculateAgeOnRaceDay(row[colIndex.geburtsdatum]);
      const zeitFormatted = formatTime(row[colIndex.zeit]);
      return {
        vorname: row[colIndex.vorname] || '',
        nachname: row[colIndex.nachname] || '',
        verein: row[colIndex.verein] || '-',
        geschlecht: row[colIndex.geschlecht] || '',
        altersklasse: getAgeGroup(age, row[colIndex.geschlecht]),
        zeit: zeitFormatted,
        zeitRaw: row[colIndex.zeit], // Keep raw for sorting
        strecke: row[colIndex.strecke] || ''
      };
    });

  // Sort by distance, then by time (use zeitRaw for proper sorting)
  participants.sort((a, b) => {
    if (a.strecke !== b.strecke) {
      return String(a.strecke).localeCompare(String(b.strecke));
    }
    // Compare raw time values (works for both Date objects and strings)
    const timeA = a.zeitRaw instanceof Date ? a.zeitRaw.getTime() : String(a.zeit);
    const timeB = b.zeitRaw instanceof Date ? b.zeitRaw.getTime() : String(b.zeit);
    if (typeof timeA === 'number' && typeof timeB === 'number') {
      return timeA - timeB;
    }
    return String(a.zeit || '99:99:99').localeCompare(String(b.zeit || '99:99:99'));
  });

  // Calculate rankings
  const results = [];
  const distances = ['5.3km', '10.6km'];

  distances.forEach(distance => {
    const distanceParticipants = participants.filter(p => p.strecke === distance);
    const akRankings = {};

    distanceParticipants.forEach((p, index) => {
      const ak = p.altersklasse || 'Unbekannt';
      if (!akRankings[ak]) {
        akRankings[ak] = 0;
      }
      akRankings[ak]++;

      results.push({
        ...p,
        platzGesamt: index + 1,
        platzAK: akRankings[ak]
      });
    });
  });

  // Write headers
  previewSheet.getRange(1, 1, 1, 7).setValues([[
    'Platz', 'Platz AK', 'Name', 'Verein', 'Altersklasse', 'Zeit', 'Strecke'
  ]]);

  // Style headers
  const headerRange = previewSheet.getRange(1, 1, 1, 7);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#e0e0e0');

  // Write data
  if (results.length > 0) {
    const outputData = results.map(r => [
      r.platzGesamt,
      r.platzAK,
      r.vorname + ' ' + r.nachname,
      r.verein,
      r.altersklasse,
      r.zeit,
      r.strecke
    ]);
    previewSheet.getRange(2, 1, outputData.length, 7).setValues(outputData);
  }

  // Auto-resize columns
  for (let i = 1; i <= 7; i++) {
    previewSheet.autoResizeColumn(i);
  }

  Logger.log('Preview sheet updated with ' + results.length + ' results');
}

/**
 * Trigger function: Auto-update preview when main sheet is edited
 * Set up via: Edit > Current project's triggers > Add trigger
 * Choose: onSheetEdit, From spreadsheet, On edit
 */
function onSheetEdit(e) {
  try {
    const sheet = e.source.getActiveSheet();
    if (sheet.getName() === SHEET_NAME) {
      updatePreviewSheet();
    }
  } catch (error) {
    Logger.log('Error in onSheetEdit: ' + error.message);
  }
}

// ============================================
// TEST FUNCTION
// ============================================

function testAddRow() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  const orderId = 'order_test_' + Date.now();
  sheet.appendRow([
    new Date().toLocaleString('de-DE'), // Timestamp
    'Test',                              // Vorname
    'User',                              // Nachname
    'test@example.com',                  // Email
    'Die Testläufer',                    // Team
    'Team',                              // Typ
    '-',                                 // Strecke (ungenutzt)
    '-',                                 // Verein (ungenutzt)
    'Bezahlt',                           // Status
    orderId,                             // OrderID
    'test_payment_id',                   // Stripe Payment ID
    ''                                   // Startnummer
  ]);
  sheet.appendRow([
    new Date().toLocaleString('de-DE'),
    'Test',
    'Partner',
    'test@example.com',
    'Die Testläufer',
    'Team',
    '-',
    '-',
    'Bezahlt',
    orderId,
    'test_payment_id',
    ''
  ]);
}
