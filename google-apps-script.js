const SPREADSHEET_ID = '1aRfbY4shiAEZWpvK6JPkQsR4rbn_rbyhLysrpwH01UM';
const SHEET_NAME = 'Tabelle1';
const PUBLISH_CELL = 'N1';

// Stripe Configuration
const STRIPE_SECRET_KEY =
'';
const STRIPE_WEBHOOK_SECRET = ''; // Optional: Add webhook signing secret for production

// Website URLs
const SUCCESS_URL = 'https://andydietrich.github.io/stauseelauf/success.html';
const CANCEL_URL = 'https://andydietrich.github.io/stauseelauf/registration.html?error=cancelled';

// Price in cents (13 EUR = 1300 cents)
const PRICE_CENTS = 1300;

// Race Day for age calculation
const RACE_DATE = new Date(2025, 7, 8); // August 8, 2025 (month is 0-indexed)
const PREVIEW_SHEET_NAME = 'Ergebnis-Vorschau';

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

      // Check for duplicate using payment_intent ID
      if (isDuplicatePayment(session.payment_intent)) {
        Logger.log('Duplicate webhook ignored: ' + session.payment_intent);
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

// Check if this payment has already been processed
function isDuplicatePayment(paymentIntentId) {
  if (!paymentIntentId) return false;

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  // Column J (index 9) contains the Stripe Payment ID
  for (let i = 1; i < data.length; i++) {
    if (data[i][9] === paymentIntentId) {
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

  const results = rows.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });

    // Calculate and add age group data
    const age = calculateAgeOnRaceDay(obj.Geburtsdatum);
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
// STRIPE CHECKOUT HANDLER
// ============================================

function handleCreateCheckout(params) {
  // Validate required fields
  if (!params.firstName || !params.lastName || !params.email) {
    return jsonResponse({ error: 'missing_fields' });
  }

  const participant = {
    firstName: params.firstName,
    lastName: params.lastName,
    email: params.email,
    birthDate: params.birthDate || '',
    gender: params.gender || '',
    distance: params.distance || '',
    club: params.club || '-'
  };

  try {
    const checkoutUrl = createStripeCheckoutSession(participant);
    return jsonResponse({ checkoutUrl: checkoutUrl });
  } catch (error) {
    Logger.log('Stripe error: ' + error.message);
    return jsonResponse({ error: error.message });
  }
}

function createStripeCheckoutSession(participant) {
  const url = 'https://api.stripe.com/v1/checkout/sessions';

  const distanceLabel = participant.distance.includes('10') ? '10,6 km' : '5,3 km';

  const payload = {
    'payment_method_types[]': 'card',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(PRICE_CENTS),
    'line_items[0][price_data][product_data][name]': 'Stauseelauf 2025 - ' + distanceLabel,
    'line_items[0][price_data][product_data][description]': participant.firstName + ' ' + participant.lastName,
    'line_items[0][quantity]': '1',
    'mode': 'payment',
    'success_url': SUCCESS_URL,
    'cancel_url': CANCEL_URL,
    'customer_email': participant.email,
    'metadata[firstName]': participant.firstName,
    'metadata[lastName]': participant.lastName,
    'metadata[email]': participant.email,
    'metadata[birthDate]': participant.birthDate,
    'metadata[gender]': participant.gender,
    'metadata[distance]': participant.distance,
    'metadata[club]': participant.club
  };

  const options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    payload: payload,
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
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
  const metadata = session.metadata;

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);

  if (!sheet) {
    Logger.log('Sheet not found: ' + SHEET_NAME);
    return;
  }

  // Append new row with participant data
  sheet.appendRow([
    new Date().toLocaleString('de-DE'),  // Timestamp
    metadata.firstName,                   // Vorname
    metadata.lastName,                    // Nachname
    metadata.email,                       // E-Mail
    metadata.birthDate,                   // Geburtsdatum
    metadata.gender,                      // Geschlecht
    metadata.distance,                    // Strecke
    metadata.club,                        // Verein
    'Bezahlt',                           // Zahlungsstatus
    session.payment_intent,              // Stripe Payment ID
    ''                                    // Startnummer (manual entry)
  ]);

  Logger.log('Registration saved: ' + metadata.firstName + ' ' + metadata.lastName);
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
 * Parse German date format (DD.MM.YYYY) to Date object
 * Also handles Date objects from Google Sheets
 */
function parseGermanDate(dateValue) {
  if (!dateValue) return null;

  // If it's already a Date object (from Google Sheets)
  if (dateValue instanceof Date) {
    return dateValue;
  }

  // If it's a string in DD.MM.YYYY format
  const str = String(dateValue);
  const parts = str.split('.');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return new Date(year, month - 1, day);
}

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
 * Calculate age on race day
 */
function calculateAgeOnRaceDay(birthDateStr) {
  const birthDate = parseGermanDate(birthDateStr);
  if (!birthDate) return null;

  let age = RACE_DATE.getFullYear() - birthDate.getFullYear();
  const monthDiff = RACE_DATE.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && RACE_DATE.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
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
    geburtsdatum: headers.indexOf('Geburtsdatum'),
    geschlecht: headers.indexOf('Geschlecht'),
    strecke: headers.indexOf('Strecke'),
    zeit: headers.indexOf('Zeit')
  };

  // Check if Zeit column exists
  if (colIndex.zeit === -1) {
    previewSheet.getRange(1, 1).setValue('Hinweis: Spalte "Zeit" fehlt in ' + SHEET_NAME);
    return;
  }

  // Process participants with times
  const participants = rows
    .filter(row => row[colIndex.zeit] && String(row[colIndex.zeit]).trim() !== '')
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
  sheet.appendRow([
    new Date().toLocaleString('de-DE'),
    'Test',
    'User',
    'test@example.com',
    '01.01.1990',
    'm',
    '5.3km',
    'Test Club',
    'Test',
    'test_payment_id',
    ''
  ]);
}
