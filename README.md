# Linkdln Jobseekers

Linkdln Jobseekers is a productivity-focused Chrome extension designed to help job seekers save time and apply smarter.

The extension allows users to extract hiring posts and recruiter details from LinkedIn Jobs and Posts, view and manage extracted leads in an interactive table, and generate personalized job application emails using AI based on the HR’s post content.

Users can review lead details, open recruiter profiles, access job links, and generate ready-to-send email drafts, all from a clean and intuitive interface.

The extension supports data persistence, CSV export, and Gmail prefilled email sending to ensure full user control and privacy.

Linkdln Jobseekers is ideal for developers, freshers, and professionals who want to streamline their job search and outreach process.

## ✨ Features

- **Lead Extraction**: Extract hiring posts and recruiter details from LinkedIn Jobs and Posts
- **Lead Management**: View and manage extracted leads in an interactive table
- **AI Email Generation**: Generate personalized job application emails using AI based on post content
- **Actionable Insights**: Review lead details, open recruiter profiles, and access job links
- **Privacy Focused**: Data persistence, CSV export, and Gmail prefilled email sending
- **Clean Interface**: Intuitive design for a streamlined job search experience

## 🚀 Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the `linkedin-extension` folder

## 📖 Usage

### Step 1: Extract Leads

1. Go to LinkedIn and search for your target
2. **Scroll down** to load more results
3. Click the extension icon
4. Use the interface to extract leads from visible posts

### Step 2: Manage & Apply

1. View extracted leads in the extension dashboard
2. Use the **AI Email** feature to generate personalized outreach
3. Export data to CSV or send emails via Gmail

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
│   └── background.js    # Background worker
├── icons/
│   ├── icon.svg         # Source icon
│   └── generate-icons.html # Helper to generate PNGs
└── README.md
```

## 📄 License

MIT License - Use responsibly!

## 🤝 Contributing

PRs welcome! Please test on LinkedIn before submitting.
