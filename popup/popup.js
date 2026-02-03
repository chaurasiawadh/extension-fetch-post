// LinkedIn Lead Extractor - Simplified Popup Script

document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const scrollCountInput = document.getElementById('scrollCount');
    const extractBtn = document.getElementById('extractBtn');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const historyCountEl = document.getElementById('historyCount');
    const statusBanner = document.getElementById('statusBanner');
    const statusIcon = document.getElementById('statusIcon');
    const statusText = document.getElementById('statusText');
    const statsPanel = document.getElementById('statsPanel');
    const totalFoundEl = document.getElementById('totalFound');
    const totalNewEl = document.getElementById('totalNew');

    // State
    let extractedEmails = new Set();
    let isExtracting = false;

    // Initialize
    extractedEmails = await loadExtractedHistory();
    updateHistoryCount();

    // Load saved scroll count
    const savedScroll = await chrome.storage.local.get(['scrollCount']);
    if (savedScroll.scrollCount) {
        scrollCountInput.value = savedScroll.scrollCount;
    }

    // Event Listeners
    extractBtn.addEventListener('click', extractAndDownload);
    clearHistoryBtn.addEventListener('click', clearHistory);

    // Save scroll count on change
    scrollCountInput.addEventListener('change', async () => {
        await chrome.storage.local.set({ scrollCount: parseInt(scrollCountInput.value) || 5 });
    });

    // ===================================
    // MAIN EXTRACTION FLOW
    // ===================================
    async function extractAndDownload() {
        if (isExtracting) return;

        const scrollCount = Math.max(0, parseInt(scrollCountInput.value) || 0);

        // UI Loading
        isExtracting = true;
        extractBtn.disabled = true;
        extractBtn.innerHTML = `<span>Extracting...</span>`;
        showStatus('loading', '⟳ Scrolling & Extracting...');

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.url?.includes('linkedin.com')) {
                showStatus('error', '✗ Please open LinkedIn first');
                resetButton();
                return;
            }

            // Send Extraction Request
            // Note: We send empty arrays for filters to maintain content.js compatibility
            const response = await chrome.tabs.sendMessage(tab.id, {
                type: 'EXTRACT',
                keywords: [],
                mandatoryKeywords: [],
                targetTitles: [],
                excludeKeywords: [],
                scrollCount
            });

            if (!response || !response.success) {
                throw new Error(response?.error || 'Extraction failed');
            }

            const { result } = response;
            processAndDownload(result);

        } catch (error) {
            // Check for connection errors first
            const isConnectionError = error.message.includes('Could not establish connection') ||
                error.message.includes('Receiving end does not exist');

            if (isConnectionError) {
                console.warn('Connection lost. User needs to refresh page.');
                showStatus('error', 'Please REFRESH the LinkedIn page and try again.');
            } else {
                console.error('Extraction error:', error);
                showStatus('error', `Error: ${error.message}`);
            }
            resetButton();
        }
    }

    async function processAndDownload(data) {
        let leads = data.leads || [];
        const totalFound = leads.length;

        // Dedup against history
        const beforeCount = leads.length;
        leads = leads.filter(lead => {
            const hasEmail = lead.email && lead.email.trim() !== '';
            const hasJobLink = lead.jobLink && lead.jobLink.trim() !== '';

            if (hasEmail) {
                return !extractedEmails.has(lead.email.toLowerCase());
            } else if (hasJobLink) {
                // If no email, deduplicate by job link
                return !extractedEmails.has(lead.jobLink.toLowerCase());
            }
            return false; // If nothing to dedup against, keep it (or maybe duplicate logic?) - keeping simplistic
        });

        const newCount = leads.length;
        const duplicates = beforeCount - newCount;

        // Update Stats
        updateStats(totalFound, newCount);

        if (newCount === 0) {
            if (duplicates > 0) {
                showStatus('error', `✗ Found ${beforeCount} leads but all were duplicates.`);
            } else {
                showStatus('error', '✗ No new leads found.');
            }
            resetButton();
            return;
        }

        // Save history
        const newHistoryItems = leads.map(l => l.email || l.jobLink).filter(item => item);
        extractedEmails = await saveExtractedHistory(newHistoryItems);
        updateHistoryCount();

        // Download CSV
        downloadLeadsCsv(leads);

        showStatus('success', `✓ Downloaded ${newCount} new leads!`);
        resetButton();
    }

    // ===================================
    // CSV EXPORT
    // ===================================
    function downloadLeadsCsv(leads) {
        if (!leads || leads.length === 0) return;

        // CSV Headers
        const headers = ['Name', 'Title', 'Profile URL', 'Email', 'Job Link', 'Post Preview', 'Extracted At'];

        // Helper to escape CSV fields
        const escapeCsv = (field) => {
            if (field === null || field === undefined) return '';
            const stringField = String(field);
            if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
                return `"${stringField.replace(/"/g, '""')}"`;
            }
            return stringField;
        };

        // Generate Rows
        const rows = leads.map(lead => [
            escapeCsv(lead.name),
            escapeCsv(lead.title),
            escapeCsv(lead.profileUrl),
            escapeCsv(lead.email),
            escapeCsv(lead.jobLink),
            escapeCsv(lead.postPreview),
            escapeCsv(lead.extractedAt)
        ]);

        // Combine Content
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        // Create Blob and Download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);

        const dateStr = new Date().toISOString().split('T')[0];
        const timeStr = new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
        link.setAttribute('download', `linkedin_leads_${dateStr}_${timeStr}.csv`);

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // ===================================
    // HISTORY & UTILS
    // ===================================
    async function loadExtractedHistory() {
        const key = `extracted_history_simple`; // New key for simplified version
        const res = await chrome.storage.local.get([key]);
        return new Set(res[key] || []);
    }

    async function saveExtractedHistory(newEmails) {
        const existing = await loadExtractedHistory();
        newEmails.forEach(e => existing.add(e.toLowerCase()));
        const arr = Array.from(existing).slice(-5000); // Keep last 5000
        await chrome.storage.local.set({ [`extracted_history_simple`]: arr });
        return new Set(arr);
    }

    function updateHistoryCount() {
        const count = extractedEmails.size;
        historyCountEl.textContent = count > 0 ? `📊 ${count} leads in history` : '';
    }

    async function clearHistory() {
        await chrome.storage.local.remove([`extracted_history_simple`]);
        extractedEmails = new Set();
        updateHistoryCount();
        updateStats(0, 0);
        showStatus('success', 'History cleared');
    }

    function showStatus(type, msg) {
        statusBanner.className = `status-banner ${type}`;
        statusIcon.textContent = type === 'success' ? '✓' : type === 'error' ? '✗' : '⟳';
        statusText.textContent = msg;
        if (type === 'success') setTimeout(() => statusBanner.classList.add('hidden'), 5000);
        else statusBanner.classList.remove('hidden');
    }

    function updateStats(found, newLeads) {
        statsPanel.classList.remove('hidden');
        totalFoundEl.textContent = found;
        totalNewEl.textContent = newLeads;
    }

    function resetButton() {
        isExtracting = false;
        extractBtn.disabled = false;
        extractBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Extract & Download CSV</span>`;
    }
});
