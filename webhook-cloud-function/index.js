const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');

const SPREADSHEET_ID = '1aRfbY4shiAEZWpvK6JPkQsR4rbn_rbyhLysrpwH01UM';
const SHEET_NAME = 'Teilnehmer';

exports.stripeWebhook = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const event = req.body;

    if (event.type !== 'checkout.session.completed') {
      return res.status(200).json({ received: true, skipped: true });
    }

    const session = event.data.object;
    const orderId = session.metadata?.orderId;
    const paymentIntent = session.payment_intent;

    if (!orderId) {
      return res.status(200).json({ received: true, no_order: true });
    }

    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

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
    return res.status(200).json({ received: true, updated: updates.length });

  } catch (err) {
    console.error('Webhook error:', err);
    // Immer 200 zurückgeben damit Stripe nicht endlos wiederholt
    return res.status(200).json({ received: true, error: err.message });
  }
};
