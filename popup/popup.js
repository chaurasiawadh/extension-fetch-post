// LinkedIn Lead Extractor - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const webhookUrlInput = document.getElementById('webhookUrl');
    const sheetNameInput = document.getElementById('sheetName');
    const keywordsInput = document.getElementById('keywords');
    const keywordTagsContainer = document.getElementById('keywordTags');
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

    // Profile Management DOM Elements
    const profileSelect = document.getElementById('profileSelect');
    const addProfileBtn = document.getElementById('addProfileBtn');
    const deleteProfileBtn = document.getElementById('deleteProfileBtn');
    const addProfileModal = document.getElementById('addProfileModal');
    const newProfileNameInput = document.getElementById('newProfileName');
    const cancelProfileBtn = document.getElementById('cancelProfileBtn');
    const confirmProfileBtn = document.getElementById('confirmProfileBtn');

    // Profile state
    let profiles = {};
    let currentProfileId = 'default';

    // Initialize profiles
    await loadProfiles();
    await migrateOldSettings(); // Migrate old settings to profile system
    await loadCurrentProfile();
    let extractedEmails = await loadExtractedHistory();
    updateHistoryCount();
    updateDeleteButton();

    // Profile Event Listeners
    profileSelect.addEventListener('change', handleProfileChange);
    addProfileBtn.addEventListener('click', openAddProfileModal);
    deleteProfileBtn.addEventListener('click', deleteCurrentProfile);
    cancelProfileBtn.addEventListener('click', closeAddProfileModal);
    confirmProfileBtn.addEventListener('click', createNewProfile);
    newProfileNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') createNewProfile();
    });

    // Close modal when clicking outside
    addProfileModal.addEventListener('click', (e) => {
        if (e.target === addProfileModal) closeAddProfileModal();
    });

    // Event Listeners
    keywordsInput.addEventListener('input', updateKeywordTags);
    keywordsInput.addEventListener('blur', updateKeywordTags);
    excludeKeywordsInput.addEventListener('input', updateExcludeKeywordTags);
    excludeKeywordsInput.addEventListener('blur', updateExcludeKeywordTags);
    saveSettingsBtn.addEventListener('click', saveSettings);
    extractBtn.addEventListener('click', extractLeads);
    clearHistoryBtn.addEventListener('click', clearHistory);

    // ============== PROFILE MANAGEMENT FUNCTIONS ==============

    // Load all profiles from storage
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
                    excludeKeywords: '',
                    scrollCount: 5
                }
            };
            currentProfileId = result.currentProfileId || 'default';

            // Populate profile dropdown
            populateProfileDropdown();
        } catch (error) {
            console.error('Error loading profiles:', error);
        }
    }

    // Populate the profile dropdown
    function populateProfileDropdown() {
        profileSelect.innerHTML = '';
        Object.values(profiles).forEach(profile => {
            const option = document.createElement('option');
            option.value = profile.id;
            option.textContent = profile.name;
            if (profile.id === currentProfileId) {
                option.selected = true;
            }
            profileSelect.appendChild(option);
        });
    }

    // Load current profile settings into UI
    async function loadCurrentProfile() {
        const profile = profiles[currentProfileId];
        if (profile) {
            webhookUrlInput.value = profile.webhookUrl || '';
            sheetNameInput.value = profile.sheetName || '';
            keywordsInput.value = profile.keywords || '';
            excludeKeywordsInput.value = profile.excludeKeywords || '';
            scrollCountInput.value = profile.scrollCount !== undefined ? profile.scrollCount : 5;
            updateKeywordTags();
            updateExcludeKeywordTags();
        }
    }

    // Handle profile change
    async function handleProfileChange() {
        // Save current profile first
        await saveCurrentProfileData();

        // Switch to new profile
        currentProfileId = profileSelect.value;
        await chrome.storage.local.set({ currentProfileId });

        // Load new profile settings
        await loadCurrentProfile();
        extractedEmails = await loadExtractedHistory();
        updateHistoryCount();
        updateDeleteButton();

        showStatus('success', `✓ Switched to "${profiles[currentProfileId].name}"`);
    }

    // Save current profile data (without showing message)
    async function saveCurrentProfileData() {
        profiles[currentProfileId] = {
            ...profiles[currentProfileId],
            webhookUrl: webhookUrlInput.value.trim(),
            sheetName: sheetNameInput.value.trim(),
            keywords: keywordsInput.value.trim(),
            excludeKeywords: excludeKeywordsInput.value.trim(),
            scrollCount: parseInt(scrollCountInput.value) || 5
        };
        await chrome.storage.local.set({ profiles });
    }

    // Open add profile modal
    function openAddProfileModal() {
        newProfileNameInput.value = '';
        addProfileModal.classList.remove('hidden');
        newProfileNameInput.focus();
    }

    // Close add profile modal
    function closeAddProfileModal() {
        addProfileModal.classList.add('hidden');
        newProfileNameInput.value = '';
    }

    // Create new profile
    async function createNewProfile() {
        const name = newProfileNameInput.value.trim();
        if (!name) {
            showStatus('error', '✗ Please enter a profile name');
            return;
        }

        // Check for duplicate names
        const existingNames = Object.values(profiles).map(p => p.name.toLowerCase());
        if (existingNames.includes(name.toLowerCase())) {
            showStatus('error', '✗ A profile with this name already exists');
            return;
        }

        // Generate unique ID
        const id = 'profile_' + Date.now();

        // Create new profile
        profiles[id] = {
            id,
            name,
            webhookUrl: webhookUrlInput.value.trim(), // Copy current webhook URL
            sheetName: '',
            keywords: '',
            excludeKeywords: '',
            scrollCount: 5
        };

        // Save and switch to new profile
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

    // Delete current profile
    async function deleteCurrentProfile() {
        if (currentProfileId === 'default') {
            showStatus('error', '✗ Cannot delete the default profile');
            return;
        }

        const profileName = profiles[currentProfileId].name;

        // Remove profile and its history
        delete profiles[currentProfileId];
        await chrome.storage.local.remove([`extractedEmails_${currentProfileId}`]);

        // Switch to default profile
        currentProfileId = 'default';
        await chrome.storage.local.set({ profiles, currentProfileId });

        populateProfileDropdown();
        await loadCurrentProfile();
        extractedEmails = await loadExtractedHistory();
        updateHistoryCount();
        updateDeleteButton();

        showStatus('success', `✓ Deleted profile "${profileName}"`);
    }

    // Update delete button state
    function updateDeleteButton() {
        deleteProfileBtn.disabled = currentProfileId === 'default';
    }

    // ============== END PROFILE MANAGEMENT ==============

    // Update history count display
    function updateHistoryCount() {
        const count = extractedEmails.size;
        if (count > 0) {
            historyCountEl.textContent = `📊 ${count} emails in history (duplicates blocked)`;
        } else {
            historyCountEl.textContent = '';
        }
    }

    // Clear extraction history for current profile
    async function clearHistory() {
        try {
            const storageKey = `extractedEmails_${currentProfileId}`;
            await chrome.storage.local.remove([storageKey]);
            extractedEmails = new Set();
            updateHistoryCount();
            showStatus('success', `✓ History cleared for "${profiles[currentProfileId].name}"!`);
        } catch (error) {
            showStatus('error', '✗ Failed to clear history');
            console.error('Error clearing history:', error);
        }
    }

    // Load settings from Chrome storage - legacy migration
    async function migrateOldSettings() {
        try {
            // Check if there are old-style settings to migrate
            const result = await chrome.storage.local.get(['webhookUrl', 'keywords', 'scrollCount', 'extractedEmails']);
            if (result.webhookUrl && !profiles['default'].webhookUrl) {
                // Migrate old settings to default profile
                profiles['default'] = {
                    ...profiles['default'],
                    webhookUrl: result.webhookUrl,
                    keywords: result.keywords || '',
                    scrollCount: result.scrollCount || 5
                };
                await chrome.storage.local.set({ profiles });

                // Migrate old extracted emails to default profile
                if (result.extractedEmails && result.extractedEmails.length > 0) {
                    await chrome.storage.local.set({ 'extractedEmails_default': result.extractedEmails });
                }

                // Clean up old keys
                await chrome.storage.local.remove(['webhookUrl', 'keywords', 'scrollCount', 'extractedEmails']);
                console.log('Migrated old settings to default profile');
            }
        } catch (error) {
            console.error('Error migrating settings:', error);
        }
    }

    // Load extracted emails history for current profile
    async function loadExtractedHistory() {
        try {
            const storageKey = `extractedEmails_${currentProfileId}`;
            const result = await chrome.storage.local.get([storageKey]);
            return new Set(result[storageKey] || []);
        } catch (error) {
            console.error('Error loading history:', error);
            return new Set();
        }
    }

    // Save extracted emails to history for current profile
    async function saveExtractedHistory(newEmails) {
        try {
            const existing = await loadExtractedHistory();
            newEmails.forEach(email => existing.add(email.toLowerCase()));
            // Keep only last 5000 entries to prevent storage bloat
            const emailArray = Array.from(existing).slice(-5000);
            const storageKey = `extractedEmails_${currentProfileId}`;
            await chrome.storage.local.set({ [storageKey]: emailArray });
            return new Set(emailArray);
        } catch (error) {
            console.error('Error saving history:', error);
        }
    }

    // Save settings to current profile
    async function saveSettings() {
        try {
            await saveCurrentProfileData();
            showStatus('success', `✓ Settings saved for "${profiles[currentProfileId].name}"!`);
        } catch (error) {
            showStatus('error', '✗ Failed to save settings');
            console.error('Error saving settings:', error);
        }
    }

    // Update keyword tags display
    function updateKeywordTags() {
        const keywords = keywordsInput.value
            .split(',')
            .map(k => k.trim())
            .filter(k => k.length > 0);

        keywordTagsContainer.innerHTML = keywords
            .map(keyword => `<span class="keyword-tag">${escapeHtml(keyword)}</span>`)
            .join('');
    }

    // Update exclude keyword tags display
    function updateExcludeKeywordTags() {
        const excludeKeywords = excludeKeywordsInput.value
            .split(',')
            .map(k => k.trim())
            .filter(k => k.length > 0);

        excludeKeywordTagsContainer.innerHTML = excludeKeywords
            .map(keyword => `<span class="keyword-tag">${escapeHtml(keyword)}</span>`)
            .join('');
    }


    // Show status banner
    function showStatus(type, message) {
        statusBanner.className = `status-banner ${type}`;
        statusIcon.textContent = type === 'success' ? '✓' : type === 'error' ? '✗' : '⟳';
        statusText.textContent = message;

        // Auto-hide after 5 seconds for success messages
        if (type === 'success') {
            setTimeout(() => {
                statusBanner.classList.add('hidden');
            }, 5000);
        }
    }

    // Update stats display
    function updateStats(found, filtered, sent) {
        statsPanel.classList.remove('hidden');
        totalFoundEl.textContent = found;
        totalFilteredEl.textContent = filtered;
        totalSentEl.textContent = sent;
    }

    // Main extraction function
    async function extractLeads() {
        const webhookUrl = webhookUrlInput.value.trim();

        // Validate webhook URL
        if (!webhookUrl) {
            showStatus('error', '✗ Please enter a webhook URL');
            return;
        }

        if (!isValidUrl(webhookUrl)) {
            showStatus('error', '✗ Please enter a valid URL');
            return;
        }

        // Get keywords
        const keywords = keywordsInput.value
            .split(',')
            .map(k => k.trim().toLowerCase())
            .filter(k => k.length > 0);

        // Get exclude keywords
        const excludeKeywords = excludeKeywordsInput.value
            .split(',')
            .map(k => k.trim().toLowerCase())
            .filter(k => k.length > 0);

        // Get scroll count (no upper limit)
        const scrollCount = Math.max(0, parseInt(scrollCountInput.value) || 0);

        // Show loading state
        extractBtn.disabled = true;
        extractBtn.innerHTML = `
      <svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="20">
          <animate attributeName="stroke-dashoffset" from="60" to="0" dur="1s" repeatCount="indefinite"/>
        </circle>
      </svg>
      <span>Extracting...</span>
    `;
        showStatus('loading', scrollCount > 0 ? `⟳ Auto-scrolling (0/${scrollCount})...` : '⟳ Scanning LinkedIn for leads...');

        try {
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab.url?.includes('linkedin.com')) {
                showStatus('error', '✗ Please open LinkedIn first');
                resetButton();
                return;
            }

            // Auto-scroll if scroll count > 0
            if (scrollCount > 0) {
                showStatus('loading', `⟳ Auto-scrolling LinkedIn (0/${scrollCount})...`);

                for (let i = 0; i < scrollCount; i++) {
                    // Update progress
                    showStatus('loading', `⟳ Scrolling... (${i + 1}/${scrollCount})`);

                    // Execute scroll on the page
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: () => {
                            window.scrollBy({ top: window.innerHeight * 2, behavior: 'smooth' });
                        }
                    });

                    // Wait for content to load (1.5 seconds between scrolls)
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }

                // Stay at current position (don't scroll back to top)
                // Wait a bit for final content to load
                await new Promise(resolve => setTimeout(resolve, 500));
                showStatus('loading', '⟳ Extracting leads...');
            }

            // Execute content script to extract data
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: extractLinkedInData,
                args: [keywords, excludeKeywords]
            });

            let extractedData = results[0]?.result;

            console.log('=== EXTRACTION RESULTS ===');
            console.log('Keywords entered:', keywords);
            console.log('Exclude keywords entered:', excludeKeywords);
            console.log('Total leads before filters:', extractedData?.leads?.length || 0);

            // EXCLUDE KEYWORD FILTER (Applied first - takes priority over positive filters)
            let excludeFiltered = 0;
            if (extractedData && extractedData.leads.length > 0 && excludeKeywords.length > 0) {
                const beforeExcludeFilter = extractedData.leads.length;
                extractedData.leads = extractedData.leads.filter(lead => {
                    const textToCheck = (lead.postPreview + ' ' + lead.title + ' ' + lead.name).toLowerCase();
                    const hasExcludeKeyword = excludeKeywords.some(kw => textToCheck.includes(kw.toLowerCase()));
                    if (hasExcludeKeyword) {
                        console.log(`EXCLUDE FILTER: Removing "${lead.name}" - matches exclude keyword`);
                    }
                    return !hasExcludeKeyword; // Return false if exclude keyword found (remove lead)
                });
                excludeFiltered = beforeExcludeFilter - extractedData.leads.length;
                console.log(`Exclude filter removed: ${excludeFiltered} leads`);
            }

            // SECONDARY KEYWORD FILTER (Safety check - applies after extraction)
            // This ensures keywords are definitely applied
            let keywordFiltered = 0;
            if (extractedData && extractedData.leads.length > 0 && keywords.length > 0) {
                const beforeFilter = extractedData.leads.length;
                extractedData.leads = extractedData.leads.filter(lead => {
                    // Check if ANY keyword is in the post preview or title
                    const textToCheck = (lead.postPreview + ' ' + lead.title + ' ' + lead.name).toLowerCase();
                    const hasKeyword = keywords.some(kw => textToCheck.includes(kw.toLowerCase()));
                    if (!hasKeyword) {
                        console.log(`KEYWORD FILTER: Removing "${lead.name}" - no match for keywords: ${keywords.join(', ')}`);
                    }
                    return hasKeyword;
                });
                keywordFiltered = beforeFilter - extractedData.leads.length;
                console.log(`Keyword filter removed: ${keywordFiltered} leads`);
            }

            // STEP 1: Filter to only keep leads WITH email addresses (must happen first)
            let leadsWithoutEmail = 0;
            if (extractedData && extractedData.leads.length > 0) {
                const beforeFilter = extractedData.leads.length;
                extractedData.leads = extractedData.leads.filter(lead => lead.email && lead.email.trim() !== '');
                leadsWithoutEmail = beforeFilter - extractedData.leads.length;
                if (leadsWithoutEmail > 0) {
                    console.log(`Filtered out ${leadsWithoutEmail} leads without email`);
                }
            }

            // STEP 2: Deduplicate within this extraction (same email appearing in multiple posts)
            let internalDuplicates = 0;
            if (extractedData && extractedData.leads.length > 0) {
                const seenEmailsThisRun = new Set();
                const beforeCount = extractedData.leads.length;
                extractedData.leads = extractedData.leads.filter(lead => {
                    const emailLower = lead.email.toLowerCase();
                    if (seenEmailsThisRun.has(emailLower)) {
                        return false; // Skip duplicate within same extraction
                    }
                    seenEmailsThisRun.add(emailLower);
                    return true;
                });
                internalDuplicates = beforeCount - extractedData.leads.length;
                if (internalDuplicates > 0) {
                    console.log(`Removed ${internalDuplicates} duplicate emails within this extraction`);
                }
            }

            // STEP 3: Filter out emails already sent in previous extractions
            let duplicatesRemoved = 0;
            if (extractedData && extractedData.leads.length > 0) {
                const originalCount = extractedData.leads.length;
                console.log('Checking against history. History size:', extractedEmails.size);
                console.log('History emails:', Array.from(extractedEmails).slice(0, 10)); // Show first 10

                extractedData.leads = extractedData.leads.filter(lead => {
                    const emailLower = lead.email.toLowerCase();
                    const isDuplicate = extractedEmails.has(emailLower);
                    if (isDuplicate) {
                        console.log(`DUPLICATE: ${emailLower} already in history`);
                    }
                    return !isDuplicate;
                });
                duplicatesRemoved = originalCount - extractedData.leads.length;
                if (duplicatesRemoved > 0) {
                    console.log(`Filtered out ${duplicatesRemoved} previously sent emails`);
                }
            }

            console.log('Final leads count:', extractedData?.leads?.length || 0);

            if (!extractedData || extractedData.leads.length === 0) {
                if (leadsWithoutEmail > 0) {
                    showStatus('error', `✗ Found ${leadsWithoutEmail} leads but none had emails visible.`);
                } else if (duplicatesRemoved > 0) {
                    showStatus('error', `✗ All ${duplicatesRemoved} emails already sent. Scroll for new posts.`);
                } else {
                    showStatus('error', '✗ No leads found. Try scrolling more or check keywords.');
                }
                updateStats(extractedData?.totalScanned || 0, 0, 0);
                resetButton();
                return;
            }

            // Update stats
            updateStats(
                extractedData.totalScanned,
                extractedData.leads.length,
                0
            );

            showStatus('loading', `⟳ Sending ${extractedData.leads.length} leads to webhook...`);

            // Send to webhook via background script
            const sheetName = sheetNameInput.value.trim() || 'Linkedin Hr Outreach';
            const response = await chrome.runtime.sendMessage({
                type: 'SEND_TO_WEBHOOK',
                webhookUrl: webhookUrl,
                data: {
                    leads: extractedData.leads,
                    meta: {
                        sheetName: sheetName,
                        totalScanned: extractedData.totalScanned,
                        totalExtracted: extractedData.leads.length,
                        keywords: keywords,
                        searchUrl: tab.url,
                        timestamp: new Date().toISOString()
                    }
                }
            });

            if (response.success) {
                // Save extracted emails to history to prevent future duplicates
                const newEmails = extractedData.leads.map(l => l.email).filter(e => e);
                extractedEmails = await saveExtractedHistory(newEmails);
                updateHistoryCount();

                updateStats(
                    extractedData.totalScanned,
                    extractedData.leads.length,
                    extractedData.leads.length
                );
                showStatus('success', `✓ Successfully sent ${extractedData.leads.length} new leads!`);
            } else {
                showStatus('error', `✗ Webhook error: ${response.error || 'Unknown error'}`);
            }

        } catch (error) {
            console.error('Extraction error:', error);
            showStatus('error', `✗ Error: ${error.message}`);
        }

        resetButton();
    }

    // Reset button to default state
    function resetButton() {
        extractBtn.disabled = false;
        extractBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span>Extract & Send Leads</span>
    `;
    }

    // Validate URL
    function isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});

// This function runs in the context of the LinkedIn page
function extractLinkedInData(keywords, excludeKeywords = []) {
    const leads = [];
    const seenProfiles = new Set();
    let totalScanned = 0;

    // Email regex - matches email patterns
    // Permissive: allows any length TLD, assumes whitespace/boundary will catch most issues
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

    // Known valid long TLDs that start with common short TLD prefixes
    // This helps us distinguish between "gmail.community" (valid) and "gmail.comhashtag" (invalid)
    const knownLongTLDs = new Set([
        'community', 'company', 'computer', 'common', 'cool', 'coop', 'coach',
        'network',
        'organization', 'organic',
        'education'
    ]);

    // Common garbage words that appear glued to emails
    const garbageSuffixes = ['hashtag', 'hiring', 'looking', 'text', 'call', 'whatsapp', 'contact', 'email', 'dm', 'reach', 'interested'];

    // Function to clean extracted email - handles extra text after TLD
    function cleanEmail(rawEmail) {
        if (!rawEmail) return null;

        let email = rawEmail.trim();

        // 1. Remove trailing punctuation (periods, commas, etc)
        email = email.replace(/[.,;:!?)\사랑>\]}]+$/, "");

        // 2. Remove leading punctuation
        email = email.replace(/^[,;:!?(\[<{]+/, "");

        // 3. Lowercase now to make checking easier
        email = email.toLowerCase();

        // 4. Handle "Glued" text (Aggressive TLD cleanup)
        const lastDotIndex = email.lastIndexOf('.');
        if (lastDotIndex > 0 && lastDotIndex < email.length - 1) {
            const tld = email.substring(lastDotIndex + 1);
            let cleanedTld = tld;
            let cutFound = false;

            // Strategy A: Check for specific garbage words inside the TLD
            for (const garbage of garbageSuffixes) {
                const idx = tld.indexOf(garbage);
                // Only cut if found AND it's not the whole TLD (unlikely e.g. .email is valid)
                // But if it's "comhashtag", idx will be > 0
                if (idx !== -1) {
                    // special case: .email IS a valid TLD. if tld === 'email', keep it. 
                    // if tld is 'gmail.comemail', cut.
                    if (garbage === 'email' && tld === 'email') continue;

                    cleanedTld = tld.substring(0, idx);
                    cutFound = true;
                    break;
                }
            }

            // Strategy B: Check for known TLD boundaries (com, net, org, etc)
            // If we didn't already cut it based on garbage words
            if (!cutFound) {
                const commonPrefixes = ['com', 'org', 'net', 'edu', 'gov', 'mil', 'in', 'uk', 'us', 'ca', 'au'];

                for (const prefix of commonPrefixes) {
                    if (tld.startsWith(prefix) && tld.length > prefix.length) {
                        // It starts with a common TLD but has more chars.
                        // Is the whole thing a known valid long TLD? (e.g. .community)
                        if (!knownLongTLDs.has(tld)) {
                            // It's likely garbage. e.g. "comthanks" -> "com"
                            cleanedTld = prefix;
                            cutFound = true;
                            break;
                        }
                    }
                }
            }

            // Strategy C: CamelCase boundary (fallback)
            // e.g. "gmail.comThanks" -> "mT" transition was detected by previous regex pass?
            // Since we lowercased everything at step 3, we can't detect CamelCase here anymore. 
            // relying on steps A and B is safer for the user's specific "hashtag" issue.

            if (cutFound) {
                email = email.substring(0, lastDotIndex + 1) + cleanedTld;
            }
        }

        // 5. Basic validation
        if (!email.includes('@') || !email.includes('.')) {
            return null;
        }

        // Ensure domain has at least one dot
        const parts = email.split('@');
        if (parts.length !== 2 || !parts[1] || parts[1].indexOf('.') === -1) {
            return null;
        }

        // Final sanity check: TLD shouldn't be empty
        if (email.endsWith('.')) {
            return null;
        }

        return email;
    }

    // Selectors for different LinkedIn page types
    const postSelectors = [
        // Feed posts
        '.feed-shared-update-v2',
        '.occludable-update',
        // Search results
        '.search-results__list .search-result',
        '.reusable-search__result-container',
        // Comments
        '.comments-comment-item',
        // People search results
        '.entity-result',
        '[data-chameleon-result-urn]'
    ];

    // Find all post/result elements
    const elements = document.querySelectorAll(postSelectors.join(', '));

    elements.forEach((element) => {
        totalScanned++;

        try {
            // Extract profile information - Support both people (/in/) and companies (/company/)
            const profileLink = element.querySelector('a[href*="/in/"], a[href*="/company/"]');
            const profileUrl = profileLink?.href?.split('?')[0] || '';

            // Removed seenProfiles check here to allow multiple posts from the same author
            // We want to capture ALL emails, even if the same person posts multiple times


            // Get name
            const nameElement = element.querySelector(
                '.update-components-actor__name span[aria-hidden="true"], ' +
                '.feed-shared-actor__name span[aria-hidden="true"], ' +
                '.entity-result__title-text a span[aria-hidden="true"], ' +
                '.app-aware-link span[aria-hidden="true"], ' +
                '.update-components-actor__title span[aria-hidden="true"]'
            );
            const name = nameElement?.textContent?.trim() || '';

            // Get title/headline
            const titleElement = element.querySelector(
                '.update-components-actor__description, ' +
                '.feed-shared-actor__description, ' +
                '.entity-result__primary-subtitle, ' +
                '.update-components-actor__subtitle, ' +
                '.subline-level-1'
            );
            const title = titleElement?.textContent?.trim() || '';

            // Get post content - use SPECIFIC selectors to capture actual post text (not author names)
            // Priority order: most specific first
            let postContent = '';

            // Try multiple approaches to get the actual post content
            const postContentSelectors = [
                // Main post body text containers
                '.feed-shared-update-v2__description-wrapper',
                '.update-components-text__text-view',
                '.feed-shared-text__text-view',
                '.feed-shared-update-v2__commentary',
                '.update-components-update-v2__commentary',
                // Fallback selectors for post text
                '.feed-shared-inline-show-more-text span[dir="ltr"]',
                '.update-components-text span[dir="ltr"]',
                '.feed-shared-text span[dir="ltr"]',
                // More specific content containers
                '[data-test-id="main-feed-activity-card__commentary"]',
                '.feed-shared-update-v2__description'
            ];

            for (const selector of postContentSelectors) {
                const contentEl = element.querySelector(selector);
                if (contentEl) {
                    const text = contentEl.textContent?.trim();
                    // Make sure we get actual content, not just a name (should have multiple words)
                    if (text && text.length > 50) {
                        postContent = text;
                        break;
                    }
                }
            }

            // If no content found with specific selectors, try to get text from the post container
            // but exclude the actor/author section
            if (!postContent || postContent.length < 50) {
                const updateContainer = element.querySelector('.update-components-text, .feed-shared-update-v2__description');
                if (updateContainer) {
                    postContent = updateContainer.textContent?.trim() || '';
                }
            }

            // Get post URL
            const postLink = element.querySelector(
                'a[href*="/feed/update/"], ' +
                'a[href*="/posts/"], ' +
                '.feed-shared-control-menu__trigger'
            );
            let postUrl = '';
            if (postLink?.href) {
                postUrl = postLink.href.split('?')[0];
            }

            // Extract email from ALL text in the element (fullText) and specifically from post content
            const fullText = element.textContent || '';

            // Also try to get text from "see more" expanded content
            const seeMoreContent = element.querySelector('.feed-shared-inline-show-more-text');
            const expandedText = seeMoreContent?.textContent || '';

            // IMPORTANT: Also extract emails from mailto: links (LinkedIn often renders emails as links)
            let mailtoEmails = '';
            const mailtoLinks = element.querySelectorAll('a[href^="mailto:"]');
            mailtoLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (href) {
                    const emailFromHref = href.replace('mailto:', '').split('?')[0];
                    mailtoEmails += ' ' + emailFromHref;
                }
                // Also get the link text which might contain email
                mailtoEmails += ' ' + (link.textContent || '');
            });

            // Also look for any link that might contain email text
            const allLinks = element.querySelectorAll('a');
            let linkEmails = '';
            allLinks.forEach(link => {
                const linkText = link.textContent || '';
                if (linkText.includes('@')) {
                    linkEmails += ' ' + linkText;
                }
            });

            // Combine all text sources for email search
            // We add spaces between sources to avoid accidental concatenation
            const allTextToSearch = fullText + ' ' + expandedText + ' ' + postContent + ' ' + mailtoEmails + ' ' + linkEmails;

            // Debug: Log text sample
            console.log('EMAIL DEBUG: Searching in text length:', allTextToSearch.length);

            // Find all email matches
            const emailMatches = allTextToSearch.match(emailRegex);

            // Try to clean each match until we find a valid one
            let email = '';
            if (emailMatches && emailMatches.length > 0) {
                console.log('EMAIL DEBUG: Found raw matches:', emailMatches);
                for (const rawEmail of emailMatches) {
                    const cleaned = cleanEmail(rawEmail);
                    if (cleaned) {
                        console.log(`EMAIL DEBUG: Cleaning "${rawEmail}" -> "${cleaned}"`);
                        email = cleaned;
                        break; // Found a valid email, stop
                    }
                }
            }

            // Apply exclude keyword filter FIRST (takes priority)
            // If post contains any exclude keyword, skip it entirely
            if (excludeKeywords && excludeKeywords.length > 0) {
                const hasExcludeKeyword = excludeKeywords.some(keyword => {
                    // Normalize keyword
                    const kw = keyword.trim();
                    if (!kw) return false;

                    // Escape special regex chars
                    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                    // Use Lookbehind/Lookahead to ensure "Whole Word" matching
                    // Checks that the keyword is NOT surrounded by alphanumeric characters
                    // e.g. "Java" matches "Java", "JAVA" but NOT "Javascript"
                    // e.g. "C++" matches "C++" (space after) but NOT "C++IsCool"
                    try {
                        const pattern = new RegExp(`(?<![a-zA-Z0-9])` + escaped + `(?![a-zA-Z0-9])`, 'i');
                        return pattern.test(fullText);
                    } catch (e) {
                        // Fallback for very old browsers if lookbehind not supported
                        return fullText.toLowerCase().includes(kw.toLowerCase());
                    }
                });

                if (hasExcludeKeyword) {
                    console.log(`Excluding post - matches exclude keyword. Exclude keywords: ${excludeKeywords.join(', ')}`);
                    return; // Skip this result
                }
            }

            // Apply keyword filter if keywords are provided
            // Search the ENTIRE post text for keywords (more accurate)
            if (keywords && keywords.length > 0) {
                const textToSearch = fullText.toLowerCase();
                const hasKeyword = keywords.some(keyword => {
                    // Check if the keyword exists as a word (not just partial match)
                    const keywordLower = keyword.toLowerCase().trim();
                    return textToSearch.includes(keywordLower);
                });
                if (!hasKeyword) {
                    console.log(`Skipping post - no keyword match. Keywords: ${keywords.join(', ')}`);
                    return; // Skip this result
                }
            }

            // Only add if we have meaningful data
            if (name || title || email) {
                // Create better post preview - use postContent, but fallback to fullText if needed
                let preview = postContent;

                // If postContent is too short, use the full element text but try to exclude actor info
                if (!preview || preview.length < 50) {
                    // Get full text and try to remove the author section
                    let tempText = fullText;
                    // Remove author name from beginning if present
                    if (name && tempText.startsWith(name)) {
                        tempText = tempText.substring(name.length).trim();
                    }
                    // Remove title from beginning if present
                    if (title && tempText.startsWith(title)) {
                        tempText = tempText.substring(title.length).trim();
                    }
                    preview = tempText;
                }

                // Clean up the preview text
                preview = preview
                    .replace(/\s+/g, ' ')  // Replace multiple spaces/newlines with single space
                    .replace(/^[•·\-\s]+/, '')  // Remove leading bullets/dashes
                    .trim();

                leads.push({
                    name,
                    title,
                    profileUrl,
                    postUrl,
                    email,
                    postPreview: preview.substring(0, 500),
                    extractedAt: new Date().toISOString(),
                    matchedKeywords: keywords ? keywords.filter(kw => fullText.toLowerCase().includes(kw.toLowerCase())) : []
                });
            }

        } catch (err) {
            console.error('Error extracting lead:', err);
        }
    });

    console.log(`Extraction complete: ${leads.length} leads from ${totalScanned} posts scanned`);

    return {
        leads,
        totalScanned
    };
}
