/**
 * Google Apps Script für Stauseelauf 2025
 *
 * SETUP-ANLEITUNG:
 * 1. Gehe zu Google Sheets und erstelle ein neues Spreadsheet
 * 2. Benenne das erste Tabellenblatt "Anmeldungen"
 * 3. Füge in Zeile 1 folgende Spaltenüberschriften ein:
 *    A: Timestamp | B: Vorname | C: Nachname | D: E-Mail | E: Geburtsdatum |
 *    F: Geschlecht | G: Strecke | H: Verein | I: Zahlungsstatus | J: Stripe Payment ID | K: Startnummer
 * 4. Gehe zu Erweiterungen → Apps Script
 * 5. Lösche den Standardcode und füge diesen Code ein
 * 6. Ersetze die KONFIGURATION-Werte unten
 * 7. Speichere und gehe zu "Bereitstellen" → "Neue Bereitstellung"
 * 8. Wähle "Web-App", Zugriff: "Jeder", und klicke "Bereitstellen"
 * 9. Kopiere die Web-App-URL
 * 10. Trage die URL in script.js (CONFIG.APPS_SCRIPT_URL) ein
 * 11. Trage die URL auch in Stripe Dashboard → Webhooks ein
 */

// ============================================
// KONFIGURATION - HIER ANPASSEN!
// ============================================

const CONFIG = {
  // Stripe Secret Key (aus Stripe Dashboard → Developers → API Keys)
  // WICHTIG: Nutze zunächst den TEST Key (sk_test_...), später den LIVE Key (sk_live_...)
  STRIPE_SECRET_KEY: 'sk_test_DEIN_STRIPE_SECRET_KEY_HIER',

  // Stripe Webhook Secret (aus Stripe Dashboard → Webhooks → Signing secret)
  STRIPE_WEBHOOK_SECRET: 'whsec_DEIN_WEBHOOK_SECRET_HIER',

  // URLs deiner Website
  SUCCESS_URL: 'https://deine-domain.de/success.html',
  CANCEL_URL: 'https://deine-domain.de/cancel.html',

  // Preis in Cent (13 EUR = 1300 Cent)
  PRICE_CENTS: 1300,

  // Name des Tabellenblatts im Google Sheet
  SHEET_NAME: 'Anmeldungen'
};

// ============================================
// HAUPTFUNKTIONEN
// ============================================

/**
 * Verarbeitet GET-Anfragen vom Anmeldeformular
 * Erstellt eine Stripe Checkout Session und leitet weiter
 */
function doGet(e) {
  try {
    const params = e.parameter;

    // Prüfen ob alle Parameter vorhanden sind
    if (params.action !== 'createCheckout') {
      return HtmlService.createHtmlOutput('Ungültige Anfrage');
    }

    // Teilnehmerdaten aus URL-Parametern
    const participant = {
      firstName: params.firstName || '',
      lastName: params.lastName || '',
      email: params.email || '',
      birthDate: params.birthDate || '',
      gender: params.gender || '',
      distance: params.distance || '',
      club: params.club || '-'
    };

    // Validierung
    if (!participant.firstName || !participant.lastName || !participant.email) {
      return redirectWithError('Pflichtfelder fehlen');
    }

    // Stripe Checkout Session erstellen
    const checkoutUrl = createStripeCheckoutSession(participant);

    // Weiterleitung zu Stripe
    return HtmlService.createHtmlOutput(
      '<script>window.location.href = "' + checkoutUrl + '";</script>'
    );

  } catch (error) {
    Logger.log('Fehler in doGet: ' + error.message);
    return redirectWithError('Ein Fehler ist aufgetreten');
  }
}

/**
 * Verarbeitet POST-Anfragen (Stripe Webhook)
 */
function doPost(e) {
  try {
    const payload = e.postData.contents;
    const event = JSON.parse(payload);

    // Webhook-Event verarbeiten
    if (event.type === 'checkout.session.completed') {
      handleCheckoutCompleted(event.data.object);
    }

    return ContentService.createTextOutput(JSON.stringify({ received: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Fehler in doPost: ' + error.message);
    return ContentService.createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// STRIPE FUNKTIONEN
// ============================================

/**
 * Erstellt eine Stripe Checkout Session
 */
function createStripeCheckoutSession(participant) {
  const url = 'https://api.stripe.com/v1/checkout/sessions';

  // Metadata für die Session (wird im Webhook zurückgegeben)
  const metadata = {
    firstName: participant.firstName,
    lastName: participant.lastName,
    email: participant.email,
    birthDate: participant.birthDate,
    gender: participant.gender,
    distance: participant.distance,
    club: participant.club
  };

  const payload = {
    'payment_method_types[]': 'card',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': CONFIG.PRICE_CENTS,
    'line_items[0][price_data][product_data][name]': 'Stauseelauf 2025 - ' + participant.distance,
    'line_items[0][price_data][product_data][description]': participant.firstName + ' ' + participant.lastName,
    'line_items[0][quantity]': 1,
    'mode': 'payment',
    'success_url': CONFIG.SUCCESS_URL,
    'cancel_url': CONFIG.CANCEL_URL,
    'customer_email': participant.email,
    'metadata[firstName]': metadata.firstName,
    'metadata[lastName]': metadata.lastName,
    'metadata[email]': metadata.email,
    'metadata[birthDate]': metadata.birthDate,
    'metadata[gender]': metadata.gender,
    'metadata[distance]': metadata.distance,
    'metadata[club]': metadata.club
  };

  const options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + CONFIG.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    payload: payload,
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const result = JSON.parse(response.getContentText());

  if (result.error) {
    Logger.log('Stripe Fehler: ' + JSON.stringify(result.error));
    throw new Error(result.error.message);
  }

  return result.url;
}

/**
 * Verarbeitet erfolgreiche Checkout-Sessions
 */
function handleCheckoutCompleted(session) {
  const metadata = session.metadata;

  // Daten ins Google Sheet schreiben
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    Logger.log('Sheet nicht gefunden: ' + CONFIG.SHEET_NAME);
    return;
  }

  // Neue Zeile hinzufügen
  sheet.appendRow([
    new Date().toLocaleString('de-DE'),  // Timestamp
    metadata.firstName,                    // Vorname
    metadata.lastName,                     // Nachname
    metadata.email,                        // E-Mail
    metadata.birthDate,                    // Geburtsdatum
    metadata.gender,                       // Geschlecht
    metadata.distance,                     // Strecke
    metadata.club,                         // Verein
    'Bezahlt',                            // Zahlungsstatus
    session.payment_intent,               // Stripe Payment ID
    ''                                     // Startnummer (manuell eintragen)
  ]);

  Logger.log('Anmeldung gespeichert: ' + metadata.firstName + ' ' + metadata.lastName);
}

// ============================================
// HILFSFUNKTIONEN
// ============================================

/**
 * Leitet mit Fehlermeldung zurück zum Formular
 */
function redirectWithError(message) {
  const url = CONFIG.CANCEL_URL + '?error=' + encodeURIComponent(message);
  return HtmlService.createHtmlOutput(
    '<script>window.location.href = "' + url + '";</script>'
  );
}

/**
 * Test-Funktion zum manuellen Testen
 */
function testAddRow() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  sheet.appendRow([
    new Date().toLocaleString('de-DE'),
    'Test',
    'Teilnehmer',
    'test@example.com',
    '1990-01-01',
    'm',
    '5.3km',
    'Testverein',
    'Test',
    'test_payment_id',
    ''
  ]);
}
