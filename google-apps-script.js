// ============================================
// GOOGLE APPS SCRIPT - Stauseelauf 2025
// With Stripe Checkout Integration
// ============================================
//
// SETUP INSTRUCTIONS:
// 1. Go to https://script.google.com and create a new project
// 2. Paste this entire code
// 3. Click Deploy → New deployment
// 4. Select "Web app" as type
// 5. Set "Execute as" to "Me"
// 6. Set "Who has access" to "Anyone"
// 7. Click Deploy and copy the Web App URL
// 8. Update CONFIG.APPS_SCRIPT_URL in js/script.js with this URL
//
// FOR STRIPE WEBHOOKS:
// 1. Go to Stripe Dashboard → Developers → Webhooks
// 2. Add endpoint with your Apps Script URL
// 3. Select event: checkout.session.completed
// 4. Copy the Signing Secret to STRIPE_WEBHOOK_SECRET below
//
// IMPORTANT: After updating this code, you must create a NEW deployment
// (Deploy → New deployment) to apply changes!
//
// ============================================

// ============================================
// CONFIGURATION
// ============================================

const SPREADSHEET_ID = '1aRfbY4shiAEZWpvK6JPkQsR4rbn_rbyhLysrpwH01UM';
const SHEET_NAME = 'Tabelle1';
const PUBLISH_CELL = 'N1';

// Stripe Configuration
// IMPORTANT: Replace with your actual Stripe Secret Key when deploying to Google Apps Script
const STRIPE_SECRET_KEY = 'sk_test_YOUR_STRIPE_SECRET_KEY_HERE';
const STRIPE_WEBHOOK_SECRET = ''; // Optional: Add webhook signing secret for production

// Website URLs
const SUCCESS_URL = 'https://andydietrich.github.io/stauseelauf/success.html';
const CANCEL_URL = 'https://andydietrich.github.io/stauseelauf/registration.html?error=cancelled';

// Price in cents (13 EUR = 1300 cents)
const PRICE_CENTS = 1300;

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
      handleCheckoutCompleted(event.data.object);
    }

    return jsonResponse({ received: true });

  } catch (error) {
    Logger.log('Error in doPost: ' + error.message);
    return jsonResponse({ error: error.message });
  }
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
    return redirectTo(CANCEL_URL + '&error=missing_fields');
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
    return redirectTo(checkoutUrl);
  } catch (error) {
    Logger.log('Stripe error: ' + error.message);
    return redirectTo(CANCEL_URL + '&error=stripe_error');
  }
}

function createStripeCheckoutSession(participant) {
  const url = 'https://api.stripe.com/v1/checkout/sessions';

  const distanceLabel = participant.distance.includes('10') ? '10,6 km' : '5,3 km';

  const payload = {
    'payment_method_types[]': 'card',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': PRICE_CENTS,
    'line_items[0][price_data][product_data][name]': 'Stauseelauf 2025 - ' + distanceLabel,
    'line_items[0][price_data][product_data][description]': participant.firstName + ' ' + participant.lastName,
    'line_items[0][quantity]': 1,
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
