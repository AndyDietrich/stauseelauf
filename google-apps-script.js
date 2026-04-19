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

// Prices in cents
const PRICE_CENTS_DEFAULT = 1500; // 15 EUR
const PRICE_CENTS_KINDERLAUF = 700; // 7 EUR
const PRICE_CENTS_TEST = 50; // 0,50 EUR – nur zum Testen

// Race Day for age calculation
const RACE_DATE = new Date(2026, 7, 7); // August 7, 2026 (month is 0-indexed)
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

  if (!participants.length) {
    return jsonResponse({ error: 'no_participants' });
  }

  const email = params.email;
  const orderId = 'order_' + Date.now();

  // Pre-store all participants with status "Ausstehend"
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  participants.forEach(function(p) {
    sheet.appendRow([
      new Date().toLocaleString('de-DE'), // Timestamp
      p.firstName,                         // Vorname
      p.lastName,                          // Nachname
      email,                               // E-Mail
      p.birthYear || '',                   // Jahrgang
      p.gender || '',                      // Geschlecht
      p.distance || '',                    // Strecke
      p.club || '-',                       // Verein
      'Ausstehend',                        // Status
      orderId,                             // OrderID
      '',                                  // Stripe Payment ID
      ''                                   // Startnummer
    ]);
  });

  try {
    const checkoutUrl = createStripeCheckoutSession(participants, email, orderId);
    return jsonResponse({ checkoutUrl: checkoutUrl });
  } catch (error) {
    Logger.log('Stripe error: ' + error.message);
    return jsonResponse({ error: error.message });
  }
}

function createStripeCheckoutSession(participants, email, orderId) {
  const url = 'https://api.stripe.com/v1/checkout/sessions';

  const payload = {
    'mode': 'payment',
    'success_url': SUCCESS_URL,
    'cancel_url': CANCEL_URL,
    'customer_email': email,
    'metadata[orderId]': orderId,
    'metadata[email]': email,
    'metadata[count]': String(participants.length)
  };

  participants.forEach(function(p, i) {
    const isKinderlauf = p.distance === 'kinderlauf';
    const isTest = p.distance === 'test';
    const distanceLabel = isKinderlauf ? 'Schülerlauf (U14)' : isTest ? 'TEST' : p.distance.includes('10') ? '10,6 km' : '5,3 km';
    const priceCents = isKinderlauf ? PRICE_CENTS_KINDERLAUF : isTest ? PRICE_CENTS_TEST : PRICE_CENTS_DEFAULT;

    payload['line_items[' + i + '][price_data][currency]'] = 'eur';
    payload['line_items[' + i + '][price_data][unit_amount]'] = String(priceCents);
    payload['line_items[' + i + '][price_data][product_data][name]'] = 'Stauseelauf 2026 - ' + distanceLabel;
    payload['line_items[' + i + '][price_data][product_data][description]'] = p.firstName + ' ' + p.lastName;
    payload['line_items[' + i + '][quantity]'] = '1';
  });

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
  const distances = ['5.3km', '10.6km', 'kinderlauf'];

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
    new Date().toLocaleString('de-DE'), // Timestamp
    'Test',                              // Vorname
    'User',                              // Nachname
    'test@example.com',                  // Email
    '1990',                              // Jahrgang
    'm',                                 // Geschlecht
    '5.3km',                             // Strecke
    'Test Club',                         // Verein
    'Bezahlt',                           // Status
    'order_test_' + Date.now(),          // OrderID
    'test_payment_id',                   // Stripe Payment ID
    ''                                   // Startnummer
  ]);
}
