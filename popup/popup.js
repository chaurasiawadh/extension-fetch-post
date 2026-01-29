// LinkedIn Lead Extractor - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const webhookUrlInput = document.getElementById('webhookUrl');
    const sheetNameInput = document.getElementById('sheetName');
    const keywordsInput = document.getElementById('keywords');
    const keywordTagsContainer = document.getElementById('keywordTags');
    const mandatoryKeywordsInput = document.getElementById('mandatoryKeywords');
    const mandatoryKeywordTagsContainer = document.getElementById('mandatoryKeywordTags');
    const targetTitlesInput = document.getElementById('targetTitles');
    const targetTitleTagsContainer = document.getElementById('targetTitleTags');
    const excludeKeywordsInput = document.getElementById('excludeKeywords');
    const excludeKeywordTagsContainer = document.getElementById('excludeKeywordTags');
    const scrollCountInput = document.getElementById('scrollCount');
    const extractBtn = document.getElementById('extractBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const historyCountEl = document.getElementById('historyCount');
    const statusBanner = document.getElementById('statusBanner');
    const statusIcon = document.getElementById('statusIcon');
    const statusText = document.getElementById('statusText');
    const statsPanel = document.getElementById('statsPanel');
    const totalFoundEl = document.getElementById('totalFound');
    const totalFilteredEl = document.getElementById('totalFiltered');
    const totalSentEl = document.getElementById('totalSent');

    // Watch Mode Elements
    const toggleWatchBtn = document.getElementById('toggleWatchBtn');
    const watchStatusBadge = document.getElementById('watchStatusBadge');

    // Profile Management DOM Elements
    const profileSelect = document.getElementById('profileSelect');
    const addProfileBtn = document.getElementById('addProfileBtn');
    const deleteProfileBtn = document.getElementById('deleteProfileBtn');
    const addProfileModal = document.getElementById('addProfileModal');
    const newProfileNameInput = document.getElementById('newProfileName');
    const cancelProfileBtn = document.getElementById('cancelProfileBtn');
    const confirmProfileBtn = document.getElementById('confirmProfileBtn');

    // State
    let profiles = {};
    let currentProfileId = 'default';
    let extractedEmails = new Set();
    let isWatchModeActive = false;

    // Initialize
    await loadProfiles();
    await loadCurrentProfile();
    extractedEmails = await loadExtractedHistory();
    updateHistoryCount();
    updateDeleteButton();
    await checkWatchStatus();

    // Event Listeners
    profileSelect.addEventListener('change', handleProfileChange);
    addProfileBtn.addEventListener('click', openAddProfileModal);
    deleteProfileBtn.addEventListener('click', deleteCurrentProfile);
    cancelProfileBtn.addEventListener('click', closeAddProfileModal);
    confirmProfileBtn.addEventListener('click', createNewProfile);
    newProfileNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') createNewProfile();
    });

    addProfileModal.addEventListener('click', (e) => {
        if (e.target === addProfileModal) closeAddProfileModal();
    });

    keywordsInput.addEventListener('input', updateKeywordTags);
    keywordsInput.addEventListener('blur', updateKeywordTags);
    mandatoryKeywordsInput.addEventListener('input', updateMandatoryKeywordTags);
    mandatoryKeywordsInput.addEventListener('blur', updateMandatoryKeywordTags);
    if (targetTitlesInput) {
        targetTitlesInput.addEventListener('input', updateTargetTitleTags);
        targetTitlesInput.addEventListener('blur', updateTargetTitleTags);
    }
    excludeKeywordsInput.addEventListener('input', updateExcludeKeywordTags);
    excludeKeywordsInput.addEventListener('blur', updateExcludeKeywordTags);
    saveSettingsBtn.addEventListener('click', saveSettings);
    // Manual Extraction
    extractBtn.addEventListener('click', extractLeads);
    clearHistoryBtn.addEventListener('click', clearHistory);
    // Watch Mode
    toggleWatchBtn.addEventListener('click', toggleWatchMode);

    // ===================================
    // WATCH MODE FUNCTIONS
    // ===================================
    async function checkWatchStatus() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;

            const { active } = await chrome.runtime.sendMessage({
                type: 'GET_WATCH_STATUS',
                tabId: tab.id
            });
            updateWatchUI(active);
        } catch (e) {
            console.error('Failed to get watch status', e);
        }
    }

    async function toggleWatchMode() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url.includes('linkedin.com')) {
            showStatus('error', 'Please open LinkedIn first');
            return;
        }

        if (isWatchModeActive) {
            // STOP for this specific tab
            try {
                await chrome.runtime.sendMessage({
                    type: 'STOP_WATCH_MODE',
                    tabId: tab.id
                });
                updateWatchUI(false);
                showStatus('success', 'Watch Mode Stopped (for this tab)');
            } catch (e) {
                showStatus('error', 'Failed to stop Watch Mode');
            }
        } else {
            // START
            // Validate inputs first
            const webhookUrl = webhookUrlInput.value.trim();
            if (!webhookUrl || !isValidUrl(webhookUrl)) {
                showStatus('error', 'Please enter a valid Webhook URL first');
                return;
            }

            try {
                const refreshIntervalInput = document.getElementById('refreshInterval');
                const maxBatchesInput = document.getElementById('maxBatches');

                const config = {
                    type: 'START_WATCH_MODE',
                    tabId: tab.id,
                    inputUrl: tab.url,
                    profileId: currentProfileId,
                    webhookUrl: webhookUrl,
                    sheetName: sheetNameInput.value.trim(),
                    keywords: getKeywordsArray(keywordsInput.value),
                    mandatoryKeywords: getKeywordsArray(mandatoryKeywordsInput.value),
                    targetTitles: getKeywordsArray(targetTitlesInput.value),
                    excludeKeywords: getKeywordsArray(excludeKeywordsInput.value),
                    scrollCount: Math.max(0, parseInt(scrollCountInput.value) || 0),
                    refreshInterval: Math.max(1, parseInt(refreshIntervalInput.value) || 60),
                    maxBatches: Math.max(1, parseInt(maxBatchesInput.value) || 50)
                };

                await chrome.runtime.sendMessage(config);
                updateWatchUI(true);
                showStatus('success', 'Watch Mode Started! Keep this tab open.');
            } catch (e) {
                console.error(e);
                showStatus('error', 'Failed to start Watch Mode');
            }
        }
    }

    function updateWatchUI(active) {
        isWatchModeActive = active;
        if (active) {
            watchStatusBadge.textContent = 'ON';
            watchStatusBadge.className = 'badge-on'; // Add CSS for this
            toggleWatchBtn.textContent = 'Stop Watch Mode';
            toggleWatchBtn.className = 'btn-watch-stop'; // Add CSS
            // Disable manual inputs while watching to avoid confusion? 
            // Maybe not, just let them act as "overrides" or "next run settings" if saved.
        } else {
            watchStatusBadge.textContent = 'OFF';
            watchStatusBadge.className = 'badge-off';
            toggleWatchBtn.textContent = 'Start Watch Mode';
            toggleWatchBtn.className = 'btn-watch-start';
        }
    }


    // ===================================
    // MANUAL EXTRACTION
    // ===================================
    async function extractLeads() {
        const webhookUrl = webhookUrlInput.value.trim();
        if (!webhookUrl || !isValidUrl(webhookUrl)) {
            showStatus('error', '✗ Please enter a valid URL');
            return;
        }

        const keywords = getKeywordsArray(keywordsInput.value);
        const mandatoryKeywords = getKeywordsArray(mandatoryKeywordsInput.value);
        const targetTitles = getKeywordsArray(targetTitlesInput.value);
        const excludeKeywords = getKeywordsArray(excludeKeywordsInput.value);
        const scrollCount = Math.max(0, parseInt(scrollCountInput.value) || 0);

        // UI Loading
        extractBtn.disabled = true;
        extractBtn.innerHTML = `<span>Running...</span>`;
        showStatus('loading', '⟳ Extracting...');

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.url?.includes('linkedin.com')) {
                showStatus('error', '✗ Please open LinkedIn first');
                resetButton();
                return;
            }

            const response = await chrome.tabs.sendMessage(tab.id, {
                type: 'EXTRACT',
                keywords,
                mandatoryKeywords,
                targetTitles,
                excludeKeywords,
                scrollCount
            });

            if (!response || !response.success) {
                throw new Error(response?.error || 'Extraction failed');
            }

            const { result } = response;
            processExtractedData(result, webhookUrl, keywords, tab.url);

        } catch (error) {
            console.error('Extraction error:', error);
            const isConnectionError = error.message.includes('Could not establish connection') || error.message.includes('Receiving end does not exist');
            const msg = isConnectionError ? 'Please REFRESH the LinkedIn page and try again.' : `Error: ${error.message}`;
            showStatus('error', msg);
            resetButton();
        }
    }

    async function processExtractedData(data, webhookUrl, keywords, searchUrl) {
        let leads = data.leads || [];
        const totalScanned = data.totalScanned || 0;

        // DEBUG: Log deduplication details for comparison with Watch Mode
        console.log('=== MANUAL EXTRACTION DEDUPLICATION DEBUG ===');
        console.log('Profile ID:', currentProfileId);
        console.log('History Size:', extractedEmails.size);
        console.log('First 10 history items:', Array.from(extractedEmails).slice(0, 10));
        console.log('Leads to check:', leads.length);

        // Log first 5 leads and their dedup status
        leads.slice(0, 5).forEach((lead, i) => {
            const email = lead.email?.toLowerCase();
            const jobLink = lead.jobLink?.toLowerCase();
            const inHistory = email ? extractedEmails.has(email) : (jobLink ? extractedEmails.has(jobLink) : 'N/A');
            console.log(`Lead ${i + 1}: email="${email || 'NONE'}", jobLink="${jobLink?.substring(0, 50) || 'NONE'}", inHistory=${inHistory}`);
        });

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
            return false;
        });

        console.log('New leads after dedup:', leads.length);
        console.log('=== END DEBUG ===');

        const filteredCount = leads.length;
        const duplicates = beforeCount - filteredCount;

        if (leads.length === 0) {
            if (duplicates > 0) {
                showStatus('error', `✗ Found ${beforeCount} leads but all were duplicates.`);
            } else {
                showStatus('error', '✗ No new leads found.');
            }
            updateStats(totalScanned, 0, 0);
            resetButton();
            return;
        }

        // Apply profile sheet name
        const sheetName = sheetNameInput.value.trim() || 'Linkedin Hr Outreach';

        // Send to Webhook (via Background)
        showStatus('loading', `Sending ${leads.length} leads...`);

        const response = await chrome.runtime.sendMessage({
            type: 'SEND_TO_WEBHOOK',
            webhookUrl,
            data: {
                leads,
                meta: {
                    sheetName,
                    totalScanned,
                    totalExtracted: leads.length,
                    keywords, // Post Content Keywords (OR)
                    mandatoryKeywords: getKeywordsArray(mandatoryKeywordsInput.value),
                    targetTitles: getKeywordsArray(targetTitlesInput.value),
                    searchUrl,
                    timestamp: new Date().toISOString()
                }
            }
        });

        if (response.success) {
            // Save history
            const newHistoryItems = leads.map(l => l.email || l.jobLink).filter(item => item);
            extractedEmails = await saveExtractedHistory(newHistoryItems);
            updateHistoryCount();
            updateStats(totalScanned, filteredCount, leads.length);
            showStatus('success', `✓ Sent ${leads.length} new leads!`);
        } else {
            showStatus('error', `✗ Webhook error: ${response.error}`);
        }

        resetButton();
    }

    // ===================================
    // PROFILE MANAGEMENT (Legacy + Updates)
    // ===================================
    async function loadProfiles() {
        try {
            const result = await chrome.storage.local.get(['profiles', 'currentProfileId']);
            profiles = result.profiles || {
                'default': {
                    id: 'default',
                    name: 'Default Profile',
                    webhookUrl: '',
                    sheetName: 'Linkedin Hr Outreach',
                    keywords: '',
                    mandatoryKeywords: '',
                    targetTitles: '',
                    excludeKeywords: '',
                    scrollCount: 5
                }
            };
            currentProfileId = result.currentProfileId || 'default';
            populateProfileDropdown();
        } catch (error) {
            console.error('Error loading profiles:', error);
        }
    }

    function populateProfileDropdown() {
        profileSelect.innerHTML = '';
        Object.values(profiles).forEach(profile => {
            const option = document.createElement('option');
            option.value = profile.id;
            option.textContent = profile.name;
            if (profile.id === currentProfileId) option.selected = true;
            profileSelect.appendChild(option);
        });
    }

    async function loadCurrentProfile() {
        const profile = profiles[currentProfileId];
        if (profile) {
            webhookUrlInput.value = profile.webhookUrl || '';
            sheetNameInput.value = profile.sheetName || '';
            keywordsInput.value = profile.keywords || '';
            mandatoryKeywordsInput.value = profile.mandatoryKeywords || '';
            targetTitlesInput.value = profile.targetTitles || '';
            excludeKeywordsInput.value = profile.excludeKeywords || '';
            scrollCountInput.value = profile.scrollCount !== undefined ? profile.scrollCount : 5;
            updateKeywordTags();
            updateMandatoryKeywordTags();
            updateTargetTitleTags();
            updateExcludeKeywordTags();
        }
    }

    async function handleProfileChange() {
        await saveCurrentProfileData();
        currentProfileId = profileSelect.value;
        await chrome.storage.local.set({ currentProfileId });
        await loadCurrentProfile();
        extractedEmails = await loadExtractedHistory();
        updateHistoryCount();
        updateDeleteButton();
        showStatus('success', `✓ Switched to "${profiles[currentProfileId].name}"`);
    }

    async function saveCurrentProfileData() {
        profiles[currentProfileId] = {
            ...profiles[currentProfileId],
            webhookUrl: webhookUrlInput.value.trim(),
            sheetName: sheetNameInput.value.trim(),
            keywords: keywordsInput.value.trim(),
            mandatoryKeywords: mandatoryKeywordsInput.value.trim(),
            targetTitles: targetTitlesInput.value.trim(),
            excludeKeywords: excludeKeywordsInput.value.trim(),
            scrollCount: parseInt(scrollCountInput.value) || 5
        };
        await chrome.storage.local.set({ profiles });
    }

    function openAddProfileModal() {
        newProfileNameInput.value = '';
        addProfileModal.classList.remove('hidden');
        newProfileNameInput.focus();
    }

    function closeAddProfileModal() {
        addProfileModal.classList.add('hidden');
        newProfileNameInput.value = '';
    }

    async function createNewProfile() {
        const name = newProfileNameInput.value.trim();
        if (!name) return;
        const id = 'profile_' + Date.now();
        profiles[id] = {
            id, name,
            webhookUrl: webhookUrlInput.value.trim(),
            sheetName: '', keywords: '', mandatoryKeywords: '', targetTitles: '', excludeKeywords: '', scrollCount: 5
        };
        currentProfileId = id;
        await chrome.storage.local.set({ profiles, currentProfileId });
        populateProfileDropdown();
        await loadCurrentProfile();
        extractedEmails = await loadExtractedHistory();
        updateHistoryCount();
        updateDeleteButton();
        closeAddProfileModal();
        showStatus('success', `✓ Created profile "${name}"`);
    }

    async function deleteCurrentProfile() {
        if (currentProfileId === 'default') return;
        delete profiles[currentProfileId];
        await chrome.storage.local.remove([`extractedEmails_${currentProfileId}`]);
        currentProfileId = 'default';
        await chrome.storage.local.set({ profiles, currentProfileId });
        populateProfileDropdown();
        await loadCurrentProfile();
        extractedEmails = await loadExtractedHistory();
        updateHistoryCount();
        updateDeleteButton();
        showStatus('success', '✓ Profile deleted');
    }

    function updateDeleteButton() {
        deleteProfileBtn.disabled = currentProfileId === 'default';
    }

    // ===================================
    // HISTORY & UTILS
    // ===================================
    async function loadExtractedHistory() {
        const key = `extractedEmails_${currentProfileId}`;
        const res = await chrome.storage.local.get([key]);
        return new Set(res[key] || []);
    }

    async function saveExtractedHistory(newEmails) {
        const existing = await loadExtractedHistory();
        newEmails.forEach(e => existing.add(e.toLowerCase()));
        const arr = Array.from(existing).slice(-5000);
        await chrome.storage.local.set({ [`extractedEmails_${currentProfileId}`]: arr });
        return new Set(arr);
    }

    function updateHistoryCount() {
        const count = extractedEmails.size;
        historyCountEl.textContent = count > 0 ? `📊 ${count} leads in history` : '';
    }

    async function clearHistory() {
        await chrome.storage.local.remove([`extractedEmails_${currentProfileId}`]);
        extractedEmails = new Set();
        updateHistoryCount();
        updateStats(0, 0, 0); // Reset stats visual
        showStatus('success', 'History cleared');
    }

    async function saveSettings() {
        await saveCurrentProfileData();
        showStatus('success', 'Settings saved');
    }

    function updateKeywordTags() {
        const kws = getKeywordsArray(keywordsInput.value);
        keywordTagsContainer.innerHTML = kws.map(k => `<span class="keyword-tag">${escapeHtml(k)}</span>`).join('');
    }

    function updateMandatoryKeywordTags() {
        const kws = getKeywordsArray(mandatoryKeywordsInput.value);
        mandatoryKeywordTagsContainer.innerHTML = kws.map(k => `<span class="keyword-tag">${escapeHtml(k)}</span>`).join('');
    }

    function updateTargetTitleTags() {
        const kws = getKeywordsArray(targetTitlesInput.value);
        targetTitleTagsContainer.innerHTML = kws.map(k => `<span class="keyword-tag">${escapeHtml(k)}</span>`).join('');
    }

    function updateExcludeKeywordTags() {
        const kws = getKeywordsArray(excludeKeywordsInput.value);
        excludeKeywordTagsContainer.innerHTML = kws.map(k => `<span class="keyword-tag">${escapeHtml(k)}</span>`).join('');
    }

    function getKeywordsArray(val) {
        return val ? val.split(',').map(k => k.trim()).filter(k => k.length > 0) : [];
    }

    function showStatus(type, msg) {
        statusBanner.className = `status-banner ${type}`;
        statusIcon.textContent = type === 'success' ? '✓' : type === 'error' ? '✗' : '⟳';
        statusText.textContent = msg;
        if (type === 'success') setTimeout(() => statusBanner.classList.add('hidden'), 5000);
    }

    function updateStats(found, filtered, sent) {
        statsPanel.classList.remove('hidden');
        totalFoundEl.textContent = found;
        totalFilteredEl.textContent = filtered;
        totalSentEl.textContent = sent;
    }

    function resetButton() {
        extractBtn.disabled = false;
        extractBtn.innerHTML = `<span>Extract & Send Leads</span>`;
    }

    function isValidUrl(s) {
        try { new URL(s); return true; } catch (_) { return false; }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});
