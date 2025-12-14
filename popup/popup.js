// LinkedIn Lead Extractor - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const webhookUrlInput = document.getElementById('webhookUrl');
    const keywordsInput = document.getElementById('keywords');
    const keywordTagsContainer = document.getElementById('keywordTags');
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

    // Load saved settings and extracted history
    await loadSettings();
    let extractedProfileUrls = await loadExtractedHistory();
    updateHistoryCount();

    // Event Listeners
    keywordsInput.addEventListener('input', updateKeywordTags);
    keywordsInput.addEventListener('blur', updateKeywordTags);
    saveSettingsBtn.addEventListener('click', saveSettings);
    extractBtn.addEventListener('click', extractLeads);
    clearHistoryBtn.addEventListener('click', clearHistory);

    // Update history count display
    function updateHistoryCount() {
        const count = extractedProfileUrls.size;
        if (count > 0) {
            historyCountEl.textContent = `📊 ${count} profiles in history (duplicates blocked)`;
        } else {
            historyCountEl.textContent = '';
        }
    }

    // Clear extraction history
    async function clearHistory() {
        try {
            await chrome.storage.local.remove(['extractedProfileUrls']);
            extractedProfileUrls = new Set();
            updateHistoryCount();
            showStatus('success', '✓ History cleared! All profiles can be extracted again.');
        } catch (error) {
            showStatus('error', '✗ Failed to clear history');
            console.error('Error clearing history:', error);
        }
    }

    // Load settings from Chrome storage
    async function loadSettings() {
        try {
            const result = await chrome.storage.local.get(['webhookUrl', 'keywords']);
            if (result.webhookUrl) {
                webhookUrlInput.value = result.webhookUrl;
            }
            if (result.keywords) {
                keywordsInput.value = result.keywords;
                updateKeywordTags();
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    // Load extracted profile URLs history to avoid duplicates
    async function loadExtractedHistory() {
        try {
            const result = await chrome.storage.local.get(['extractedProfileUrls']);
            return new Set(result.extractedProfileUrls || []);
        } catch (error) {
            console.error('Error loading history:', error);
            return new Set();
        }
    }

    // Save extracted profile URLs to history
    async function saveExtractedHistory(newUrls) {
        try {
            const existing = await loadExtractedHistory();
            newUrls.forEach(url => existing.add(url));
            // Keep only last 5000 entries to prevent storage bloat
            const urlArray = Array.from(existing).slice(-5000);
            await chrome.storage.local.set({ extractedProfileUrls: urlArray });
            return new Set(urlArray);
        } catch (error) {
            console.error('Error saving history:', error);
        }
    }

    // Save settings to Chrome storage
    async function saveSettings() {
        try {
            await chrome.storage.local.set({
                webhookUrl: webhookUrlInput.value.trim(),
                keywords: keywordsInput.value.trim()
            });
            showStatus('success', '✓ Settings saved successfully!');
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
        showStatus('loading', '⟳ Scanning LinkedIn for leads...');

        try {
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab.url?.includes('linkedin.com')) {
                showStatus('error', '✗ Please open LinkedIn first');
                resetButton();
                return;
            }

            // Execute content script to extract data
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: extractLinkedInData,
                args: [keywords]
            });

            let extractedData = results[0]?.result;

            console.log('=== EXTRACTION RESULTS ===');
            console.log('Keywords entered:', keywords);
            console.log('Total leads before filters:', extractedData?.leads?.length || 0);

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

            // Filter out already extracted profiles (duplicate detection)
            let duplicatesRemoved = 0;
            if (extractedData && extractedData.leads.length > 0) {
                const originalCount = extractedData.leads.length;
                extractedData.leads = extractedData.leads.filter(
                    lead => !lead.profileUrl || !extractedProfileUrls.has(lead.profileUrl)
                );
                duplicatesRemoved = originalCount - extractedData.leads.length;
                if (duplicatesRemoved > 0) {
                    console.log(`Filtered out ${duplicatesRemoved} duplicate profiles`);
                }
            }

            // Filter to only keep leads WITH email addresses
            let leadsWithoutEmail = 0;
            if (extractedData && extractedData.leads.length > 0) {
                const beforeFilter = extractedData.leads.length;
                extractedData.leads = extractedData.leads.filter(lead => lead.email && lead.email.trim() !== '');
                leadsWithoutEmail = beforeFilter - extractedData.leads.length;
                if (leadsWithoutEmail > 0) {
                    console.log(`Filtered out ${leadsWithoutEmail} leads without email`);
                }
            }

            console.log('Final leads count:', extractedData?.leads?.length || 0);

            if (!extractedData || extractedData.leads.length === 0) {
                if (leadsWithoutEmail > 0) {
                    showStatus('error', `✗ Found ${leadsWithoutEmail} leads but none had emails visible.`);
                } else if (duplicatesRemoved > 0) {
                    showStatus('error', `✗ All ${duplicatesRemoved} leads already extracted. Scroll for new posts.`);
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
            const response = await chrome.runtime.sendMessage({
                type: 'SEND_TO_WEBHOOK',
                webhookUrl: webhookUrl,
                data: {
                    leads: extractedData.leads,
                    meta: {
                        totalScanned: extractedData.totalScanned,
                        totalExtracted: extractedData.leads.length,
                        keywords: keywords,
                        searchUrl: tab.url,
                        timestamp: new Date().toISOString()
                    }
                }
            });

            if (response.success) {
                // Save extracted URLs to history to prevent future duplicates
                const newUrls = extractedData.leads.map(l => l.profileUrl).filter(u => u);
                extractedProfileUrls = await saveExtractedHistory(newUrls);
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
function extractLinkedInData(keywords) {
    const leads = [];
    const seenProfiles = new Set();
    let totalScanned = 0;

    // Improved email regex - more strict pattern
    // Matches: word@domain.tld where tld is 2-6 characters
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}(?=\s|$|[^a-zA-Z0-9]|\.(?:\s|$|[^a-zA-Z]))/gi;

    // Function to clean extracted email
    function cleanEmail(rawEmail) {
        if (!rawEmail) return '';

        // Remove common trailing garbage
        let email = rawEmail.trim();

        // Remove trailing punctuation except dots that are part of domain
        email = email.replace(/[,;:!?\s]+$/, '');

        // Remove trailing words that got attached (like "hashtag", "Subject", etc.)
        // Match only valid email pattern and discard the rest
        const strictEmailMatch = email.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/);
        if (strictEmailMatch) {
            email = strictEmailMatch[0];
        }

        // Final cleanup - remove any trailing dots
        email = email.replace(/\.+$/, '');

        // Validate basic email structure
        if (!email.includes('@') || !email.includes('.')) {
            return '';
        }

        // Check TLD is valid (2-6 chars, only letters)
        const parts = email.split('.');
        const tld = parts[parts.length - 1];
        if (!/^[a-zA-Z]{2,6}$/.test(tld)) {
            return '';
        }

        return email.toLowerCase();
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
            // Extract profile information
            const profileLink = element.querySelector('a[href*="/in/"]');
            const profileUrl = profileLink?.href?.split('?')[0] || '';

            // Skip duplicates
            if (profileUrl && seenProfiles.has(profileUrl)) {
                return;
            }
            if (profileUrl) {
                seenProfiles.add(profileUrl);
            }

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

            // Get post content
            const contentElement = element.querySelector(
                '.feed-shared-update-v2__description, ' +
                '.update-components-text, ' +
                '.feed-shared-text, ' +
                '.break-words'
            );
            const postContent = contentElement?.textContent?.trim() || '';

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

            // Extract email from content
            const fullText = element.textContent || '';
            const emailMatches = fullText.match(emailRegex);
            // Clean the extracted email to remove trailing garbage
            const email = emailMatches ? cleanEmail(emailMatches[0]) : '';

            // Apply keyword filter if keywords are provided
            // Search the ENTIRE post text for keywords (more accurate)
            if (keywords && keywords.length > 0) {
                const textToSearch = fullText.toLowerCase();
                const hasKeyword = keywords.some(keyword => {
                    // Check if the keyword exists as a word (not just partial match)
                    // This prevents "hiring" from matching "hairing" etc.
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
                leads.push({
                    name,
                    title,
                    profileUrl,
                    postUrl,
                    email,
                    postPreview: postContent.substring(0, 200),
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
