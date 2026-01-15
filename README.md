# Stauseelauf 2025 - Anmeldeseite

Landingpage mit Online-Anmeldung für den Stauseelauf des TSV Bad Wörishofen.

## Deployment auf GitHub Pages

### 1. Repository auf GitHub erstellen

```bash
# Im Projektordner
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/DEIN-USERNAME/stauseelauf.git
git push -u origin main
```

### 2. GitHub Pages aktivieren

1. Gehe zu deinem Repository auf GitHub
2. Settings → Pages
3. Source: "Deploy from a branch"
4. Branch: `main` / `/ (root)`
5. Save

Die Seite ist dann unter `https://DEIN-USERNAME.github.io/stauseelauf/` erreichbar.

### 3. Google Apps Script einrichten (für Anmeldungen)

Siehe `SETUP-ANLEITUNG.md` für die vollständige Anleitung.

**Kurzversion:**
1. Google Spreadsheet erstellen
2. Apps Script Code aus `google-apps-script/webhook.gs` einfügen
3. Web-App deployen
4. URL in `js/script.js` bei `APPS_SCRIPT_URL` eintragen
5. Änderung committen und pushen

### 4. Stripe einrichten

1. Stripe Account erstellen auf stripe.com
2. API Keys in Google Apps Script eintragen
3. Webhook einrichten (siehe SETUP-ANLEITUNG.md)

## Nach dem Lauf: Ergebnisse veröffentlichen

1. Öffne `results.json`
2. Trage die Ergebnisse ein:

```json
{
  "published": true,
  "results": [
    {
      "vorname": "Max",
      "nachname": "Mustermann",
      "zeit": "00:25:30",
      "strecke": "5.3km",
      "verein": "TSV Musterstadt",
      "geschlecht": "m",
      "startnummer": "1"
    }
  ]
}
```

3. Commit und Push:
```bash
git add results.json
git commit -m "Ergebnisse veröffentlicht"
git push
```

## Lokale Entwicklung

Für lokale Tests mit Demo-Modus:

1. In `js/script.js`: `DEMO_MODE: true` setzen
2. Server starten: `node server.js`
3. Öffnen: http://localhost:3000

## Dateien

```
├── index.html          # Hauptseite
├── success.html        # Erfolgsseite nach Zahlung
├── cancel.html         # Abbruchseite
├── results.json        # Ergebnisse (nach dem Lauf befüllen)
├── css/styles.css      # Styling
├── js/script.js        # Frontend-Logik
└── google-apps-script/
    └── webhook.gs      # Backend für Google Sheets + Stripe
```

## Kosten

- GitHub Pages: Kostenlos
- Google Sheets/Apps Script: Kostenlos
- Stripe: 1,4% + 0,25€ pro Transaktion
