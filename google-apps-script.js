// ============================================
// GOOGLE APPS SCRIPT - Deploy as Web App
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
// IMPORTANT: After updating this code, you must create a NEW deployment
// (Deploy → New deployment) to apply changes. Updating existing deployment
// does not update the code!
//
// ============================================

const SPREADSHEET_ID = '1aRfbY4shiAEZWpvK6JPkQsR4rbn_rbyhLysrpwH01UM';
const SHEET_NAME = 'Tabelle1';
const PUBLISH_CELL = 'N1';

function doGet(e) {
  const action = e.parameter.action || 'data';

  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);

    if (action === 'status') {
      // Return just the publish status
      const status = sheet.getRange(PUBLISH_CELL).getValue() || 'FALSE';
      return jsonResponse({ status: status });
    }

    if (action === 'data') {
      // Return all data
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

      // Also include publish status
      const status = sheet.getRange(PUBLISH_CELL).getValue() || 'FALSE';

      return jsonResponse({
        status: status,
        data: results
      });
    }

    return jsonResponse({ error: 'Unknown action' });

  } catch (error) {
    return jsonResponse({ error: error.message });
  }
}

// Handle POST requests - for adding new participants
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);

    // Append new row with participant data
    // Columns: Timestamp, Vorname, Nachname, E-Mail, Geburtsdatum, Geschlecht, Strecke, Verein, Zahlungsstatus, Payment ID
    sheet.appendRow([
      new Date().toLocaleString('de-DE'),  // Timestamp
      data.firstName || '',                 // Vorname
      data.lastName || '',                  // Nachname
      data.email || '',                     // E-Mail
      data.birthDate || '',                 // Geburtsdatum
      data.gender || '',                    // Geschlecht
      data.distance || '',                  // Strecke
      data.club || '-',                     // Verein
      data.status || 'Bezahlt',            // Zahlungsstatus
      data.paymentId || ''                  // Payment ID
    ]);

    return jsonResponse({ success: true, message: 'Teilnehmer erfolgreich registriert' });

  } catch (error) {
    return jsonResponse({ success: false, error: error.message });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
