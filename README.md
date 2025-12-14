# LinkedIn Lead Extractor Chrome Extension

A lightweight Chrome extension that extracts visible LinkedIn leads (name, title, email, post link) and sends them to Google Sheets via webhook for n8n-powered automated outreach.

## ✨ Features

- **One-Click Extraction**: Extract all visible leads from LinkedIn search results or feed
- **Keyword Filtering**: Only extract posts containing specific keywords (comma-separated)
- **Google Sheets Integration**: Send data directly to your spreadsheet via webhook
- **n8n Ready**: Connect with n8n for automated email outreach
- **Human-in-the-Loop**: Manual search and scroll keeps you in control
- **Modern UI**: Beautiful dark theme matching LinkedIn's aesthetic

## 🚀 Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the `linkedin-extension` folder

## 📖 Usage

### Step 1: Set Up Google Sheets Webhook

**Option A: Using n8n**
1. Create a new n8n workflow
2. Add a **Webhook** trigger node (set to POST)
3. Add a **Google Sheets** node to append rows
4. Copy the webhook URL

**Option B: Using Google Apps Script**
1. Create a new Google Sheet with columns: Name, Title, Profile URL, Post URL, Email, Post Preview, Extracted At
2. Go to Extensions > Apps Script
3. Paste this code:

```javascript
function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = JSON.parse(e.postData.contents);
  
  data.leads.forEach(lead => {
    sheet.appendRow([
      lead.name,
      lead.title,
      lead.profileUrl,
      lead.postUrl,
      lead.email,
      lead.postPreview,
      lead.extractedAt
    ]);
  });
  
  return ContentService.createTextOutput('OK');
}
```
4. Deploy as Web App (Execute as: Me, Access: Anyone)
5. Copy the deployment URL

### Step 2: Configure Extension

1. Click the extension icon in Chrome
2. Paste your webhook URL
3. (Optional) Add keyword filters like: `hiring, frontend, remote`
4. Click **Save Settings**

### Step 3: Extract Leads

1. Go to LinkedIn and search for your target (e.g., "hiring frontend developer")
2. **Scroll down** to load more results (the extension only extracts visible content)
3. Click the extension icon
4. Click **Extract & Send Leads**
5. Check your Google Sheet for the data!

## 📊 Data Schema

The extension sends this JSON structure to your webhook:

```json
{
  "leads": [
    {
      "name": "John Doe",
      "title": "Senior Frontend Developer at TechCorp",
      "profileUrl": "https://linkedin.com/in/johndoe",
      "postUrl": "https://linkedin.com/feed/update/...",
      "email": "john@techcorp.com",
      "postPreview": "We're hiring! Looking for...",
      "extractedAt": "2024-12-14T01:30:00Z"
    }
  ],
  "meta": {
    "totalScanned": 50,
    "totalExtracted": 15,
    "keywords": ["hiring", "frontend"],
    "searchUrl": "https://linkedin.com/search/...",
    "timestamp": "2024-12-14T01:30:00Z"
  }
}
```

## 🔧 Keyword Filtering

Keywords are matched with **OR** logic:
- Input: `hiring, frontend, remote`
- A post matches if it contains **ANY** of these keywords
- Filtering is case-insensitive
- Leave empty to extract all visible leads

## ⚠️ Important Notes

1. **Email Extraction**: LinkedIn rarely shows emails publicly. The extension extracts emails when visible in post content, but most leads will need email enrichment (Hunter.io, Apollo, etc.)

2. **Rate Limiting**: Only extract manually and sparingly to avoid LinkedIn detection

3. **LinkedIn ToS**: This tool is for personal productivity. Respect LinkedIn's terms of service.

## 🛠️ Development

```
linkedin-extension/
├── manifest.json         # Extension configuration
├── popup/
│   ├── popup.html       # Popup UI
│   ├── popup.css        # Styles
│   └── popup.js         # Popup logic
├── content/
│   ├── content.js       # Page extraction logic
│   └── content.css      # Visual feedback styles
├── background/
│   └── background.js    # Webhook handler
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## 📄 License

MIT License - Use responsibly!

## 🤝 Contributing

PRs welcome! Please test on LinkedIn before submitting.
