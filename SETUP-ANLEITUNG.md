# Stauseelauf 2025 - Setup-Anleitung

## Übersicht der Dateien

```
kneipp-run/
├── index.html              # Landingpage mit Anmeldeformular
├── success.html            # Erfolgsseite nach Zahlung
├── cancel.html             # Seite bei Zahlungsabbruch
├── css/
│   └── styles.css          # Styling
├── js/
│   └── script.js           # Frontend-Logik
└── google-apps-script/
    └── webhook.gs          # Backend-Code (für Google Apps Script)
```

## Schritt 1: Stripe Account einrichten

1. Gehe zu [stripe.com](https://stripe.com) und erstelle einen Account
2. Verifiziere deinen Account (für Live-Zahlungen)
3. Gehe zu **Developers → API Keys**
4. Notiere den **Publishable Key** (pk_test_...) und **Secret Key** (sk_test_...)

> Nutze zunächst die **Test-Keys** zum Testen!

## Schritt 2: Google Spreadsheet erstellen

1. Gehe zu [sheets.google.com](https://sheets.google.com)
2. Erstelle ein neues Spreadsheet mit dem Namen "Stauseelauf 2025 Anmeldungen"
3. Benenne das erste Tabellenblatt um zu **"Anmeldungen"**
4. Füge in **Zeile 1** folgende Spaltenüberschriften ein:

| A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|
| Timestamp | Vorname | Nachname | E-Mail | Geburtsdatum | Geschlecht | Strecke | Verein | Zahlungsstatus | Stripe Payment ID | Startnummer |

## Schritt 3: Google Apps Script einrichten

1. Im Google Spreadsheet: **Erweiterungen → Apps Script**
2. Lösche den Standard-Code
3. Kopiere den gesamten Inhalt von `google-apps-script/webhook.gs` und füge ihn ein
4. **Wichtig:** Passe die Konfiguration im Code an:

```javascript
const CONFIG = {
  STRIPE_SECRET_KEY: 'sk_test_DEIN_KEY',           // Dein Stripe Secret Key
  STRIPE_WEBHOOK_SECRET: 'whsec_...',              // Später hinzufügen
  SUCCESS_URL: 'https://deine-domain.de/success.html',
  CANCEL_URL: 'https://deine-domain.de/cancel.html',
  PRICE_CENTS: 1300,
  SHEET_NAME: 'Anmeldungen'
};
```

5. Speichere das Projekt (Strg+S)
6. Klicke auf **Bereitstellen → Neue Bereitstellung**
7. Klicke auf das Zahnrad-Symbol und wähle **"Web-App"**
8. Einstellungen:
   - Beschreibung: "Stauseelauf Anmeldung"
   - Ausführen als: "Ich"
   - Zugriff: **"Jeder"**
9. Klicke **"Bereitstellen"**
10. Autorisiere den Zugriff wenn nötig
11. **Kopiere die Web-App-URL** (sieht aus wie: `https://script.google.com/macros/s/.../exec`)

## Schritt 4: Stripe Webhook einrichten

1. Gehe zu [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Klicke **"Add endpoint"**
3. Endpoint-URL: **Die Google Apps Script Web-App-URL von Schritt 3**
4. Events: Wähle `checkout.session.completed`
5. Klicke **"Add endpoint"**
6. Kopiere das **Signing Secret** (whsec_...)
7. Trage es im Apps Script unter `STRIPE_WEBHOOK_SECRET` ein
8. Speichere und stelle die Web-App erneut bereit

## Schritt 5: Frontend konfigurieren

1. Öffne `js/script.js`
2. Trage die Google Apps Script URL ein:

```javascript
const CONFIG = {
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/.../exec',
};
```

## Schritt 6: Dateien hochladen

Lade alle Dateien (außer `google-apps-script/` und diese Anleitung) auf deinen Webserver:

- index.html
- success.html
- cancel.html
- css/styles.css
- js/script.js

## Schritt 7: Testen

### Im Testmodus (mit Test-Keys):

1. Öffne die Seite im Browser
2. Fülle das Formular aus
3. Nutze die **Stripe Test-Kreditkarte**: `4242 4242 4242 4242`
   - Ablaufdatum: Beliebiges Datum in der Zukunft
   - CVC: Beliebige 3 Ziffern
4. Prüfe ob die Daten im Google Sheet erscheinen

### Checkliste:
- [ ] Formular-Validierung funktioniert
- [ ] Weiterleitung zu Stripe funktioniert
- [ ] Zahlung wird verarbeitet
- [ ] Erfolgsseite wird angezeigt
- [ ] Daten erscheinen im Google Sheet

## Schritt 8: Live schalten

1. In Stripe: Wechsle zu **Live-Modus** (Toggle oben rechts)
2. Kopiere die **Live API Keys** (sk_live_... und pk_live_...)
3. Aktualisiere den `STRIPE_SECRET_KEY` im Apps Script
4. Erstelle einen **neuen Webhook** mit dem Live-Endpoint
5. Aktualisiere das `STRIPE_WEBHOOK_SECRET`
6. Stelle das Apps Script **erneut bereit**
7. Teste mit einer echten Zahlung (z.B. 1 EUR Test-Produkt)

## Kosten-Übersicht

| Service | Kosten |
|---------|--------|
| Google Sheets | Kostenlos |
| Google Apps Script | Kostenlos |
| Stripe | 1,4% + 0,25 EUR pro Transaktion |
| **Bei 13 EUR Anmeldung** | **~0,43 EUR pro Anmeldung** |

## Troubleshooting

### Webhook funktioniert nicht
- Prüfe die Apps Script Logs: **Ausführungen → Protokolle**
- Stelle sicher, dass die Web-App-URL korrekt ist
- Prüfe ob "Jeder" Zugriff hat

### Zahlung schlägt fehl
- Prüfe den Stripe Secret Key
- Schaue in die Stripe Dashboard Logs

### Daten erscheinen nicht im Sheet
- Prüfe ob das Tabellenblatt "Anmeldungen" heißt
- Schaue in die Apps Script Logs

## Support

Bei Fragen: leichtathletik@tsv-bw.de
