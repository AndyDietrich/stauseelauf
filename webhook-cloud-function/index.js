const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');

const SPREADSHEET_ID = '1aRfbY4shiAEZWpvK6JPkQsR4rbn_rbyhLysrpwH01UM';
const SHEET_NAME = 'Teilnehmer';
const DONATIONS_SHEET_NAME = 'Spenden';

exports.stripeWebhook = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const event = req.body;

    if (event.type !== 'checkout.session.completed') {
      return res.status(200).json({ received: true, skipped: true });
    }

    const session = event.data.object;
    const paymentIntent = session.payment_intent;
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Standalone donation (from /spende page)
    if (session.metadata?.type === 'spende') {
      const amountEur = ((session.amount_total || 0) / 100).toFixed(2);
      await appendDonationRow(sheets, {
        email: session.customer_email || session.metadata?.email || '',
        name: session.metadata?.name || 'Anonym',
        amountEur,
        source: 'Direkt',
        refId: session.metadata?.donationId || '',
        paymentIntent,
      });
      console.log(`Spomio-Spende (direkt): ${amountEur} EUR`);
      return res.status(200).json({ received: true, donation: true });
    }

    const orderId = session.metadata?.orderId;
    if (!orderId) {
      return res.status(200).json({ received: true, no_order: true });
    }

    // Update participant rows to "Bezahlt"
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:K`,
    });

    const rows = result.data.values || [];
    const updates = [];

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][9] === orderId && rows[i][8] === 'Ausstehend') {
        updates.push({
          range: `${SHEET_NAME}!I${i + 1}:K${i + 1}`,
          values: [['Bezahlt', rows[i][9], paymentIntent]],
        });
      }
    }

    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: 'RAW', data: updates },
      });
    }

    console.log(`Order ${orderId}: ${updates.length} row(s) updated to Bezahlt`);

    // Optional add-on donation during registration
    const donationCents = parseInt(session.metadata?.donation || '0');
    if (donationCents > 0) {
      const amountEur = (donationCents / 100).toFixed(2);
      await appendDonationRow(sheets, {
        email: session.customer_email || session.metadata?.email || '',
        name: '',
        amountEur,
        source: 'Anmeldung',
        refId: orderId,
        paymentIntent,
      });
      console.log(`Spomio-Spende (mit Anmeldung): ${amountEur} EUR, Order ${orderId}`);
    }

    return res.status(200).json({ received: true, updated: updates.length });

  } catch (err) {
    console.error('Webhook error:', err);
    // Immer 200 zurückgeben damit Stripe nicht endlos wiederholt
    return res.status(200).json({ received: true, error: err.message });
  }
};

async function appendDonationRow(sheets, { email, name, amountEur, source, refId, paymentIntent }) {
  const timestamp = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${DONATIONS_SHEET_NAME}!A:G`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[timestamp, name, email, amountEur, source, refId, paymentIntent]],
    },
  });
}
