// LinkedIn Lead Extractor - Content Script
// This script runs on LinkedIn pages, handles extraction and Watch Mode

(function () {
  'use strict';

  console.log('LinkedIn Lead Extractor content script loaded');

  // ============================================================================
  // MESSAGE LISTENER
  // ============================================================================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ status: 'ready' });
    }
    else if (message.type === 'EXTRACT') {
      handleExtractionRequest(message)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Async response
    }
    else if (message.type === 'EXECUTE_WATCH_RUN') {
      handleWatchModeRun(message);
    }
    else if (message.type === 'CONTINUE_WATCH_BATCH') {
      // Just triggering the same logic, but we can customize if needed
      handleWatchModeRun(message);
    }
  });

  // Notify background that page loaded (for Watch Mode)
  // We delay slightly to ensure page is somewhat ready
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: 'PAGE_LOADED', url: window.location.href });
  }, 2000);


  // ============================================================================
  // CORE FUNCTIONS
  // ============================================================================

  async function handleExtractionRequest(message) {
    const { keywords, targetTitles, excludeKeywords, scrollCount } = message;

    // Auto-scroll if requested
    if (scrollCount > 0) {
      await autoScroll(scrollCount);
    }

    // Run extraction
    return extractLinkedInData(keywords, targetTitles, excludeKeywords);
  }

  async function handleWatchModeRun(message) {
    const { keywords, targetTitles, excludeKeywords, scrollCount } = message;

    console.log('Watch Mode: Starting run...');

    // Random start delay (human-like)
    const startDelay = Math.random() * 5000 + 2000; // 2-7 seconds
    await wait(startDelay);

    // Scroll (human reading)
    // Use provided scrollCount if available, else default to 3
    const scrolls = scrollCount !== undefined ? scrollCount : 3;
    await autoScroll(scrolls);

    // Extract
    const result = extractLinkedInData(keywords, targetTitles, excludeKeywords);

    // Send data back to background to handle webhook
    // We include a flag 'isWatchMode: true'
    if (result && result.leads.length > 0) {
      chrome.runtime.sendMessage({
        type: 'WATCH_DATA_EXTRACTED',
        data: result,
        keywords: keywords
      });
    } else {
      console.log('Watch Mode: No leads found this run.');
    }
  }

  async function autoScroll(count) {
    for (let i = 0; i < count; i++) {
      window.scrollBy({ top: window.innerHeight * 1.5, behavior: 'smooth' });
      // Randomish wait between scrolls
      await wait(1500 + Math.random() * 1000);
    }
    // Wait for final load
    await wait(2000);
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================================
  // EXTRACTION LOGIC (Ported from popup.js)
  // ============================================================================
  function extractLinkedInData(keywords, targetTitles = [], excludeKeywords = []) {
    const leads = [];
    let totalScanned = 0;

    // Email regex
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

    // Helper Sets/Arrays
    const knownLongTLDs = new Set([
      'community', 'company', 'computer', 'common', 'cool', 'coop', 'coach',
      'network', 'organization', 'organic', 'education'
    ]);

    const garbageSuffixes = ['hashtag', 'hiring', 'looking', 'text', 'call', 'whatsapp', 'contact', 'email', 'dm', 'reach', 'interested'];

    // Clean Email Helper
    function cleanEmail(rawEmail) {
      if (!rawEmail) return null;
      let email = rawEmail.trim();
      email = email.replace(/[.,;:!?)\사랑>\]}]+$/, "");
      email = email.replace(/^[,;:!?(\[<{]+/, "");
      email = email.toLowerCase();

      const lastDotIndex = email.lastIndexOf('.');
      if (lastDotIndex > 0 && lastDotIndex < email.length - 1) {
        const tld = email.substring(lastDotIndex + 1);
        let cleanedTld = tld;
        let cutFound = false;

        for (const garbage of garbageSuffixes) {
          const idx = tld.indexOf(garbage);
          if (idx !== -1) {
            if (garbage === 'email' && tld === 'email') continue;
            cleanedTld = tld.substring(0, idx);
            cutFound = true;
            break;
          }
        }

        if (!cutFound) {
          const commonPrefixes = ['com', 'org', 'net', 'edu', 'gov', 'mil', 'in', 'uk', 'us', 'ca', 'au'];
          for (const prefix of commonPrefixes) {
            if (tld.startsWith(prefix) && tld.length > prefix.length) {
              if (!knownLongTLDs.has(tld)) {
                cleanedTld = prefix;
                cutFound = true;
                break;
              }
            }
          }
        }

        if (cutFound) {
          email = email.substring(0, lastDotIndex + 1) + cleanedTld;
        }
      }

      if (!email.includes('@') || !email.includes('.')) return null;
      const parts = email.split('@');
      if (parts.length !== 2 || !parts[1] || parts[1].indexOf('.') === -1) return null;
      if (email.endsWith('.')) return null;

      return email;
    }

    // Selectors
    const postSelectors = [
      '.feed-shared-update-v2', '.occludable-update',
      '.search-results__list .search-result', '.reusable-search__result-container',
      '.comments-comment-item', '.entity-result', '[data-chameleon-result-urn]'
    ];

    const elements = document.querySelectorAll(postSelectors.join(', '));

    elements.forEach((element) => {
      totalScanned++;
      try {
        const profileLink = element.querySelector('a[href*="/in/"], a[href*="/company/"]');
        const profileUrl = profileLink?.href?.split('?')[0] || '';

        const nameElement = element.querySelector(
          '.update-components-actor__name span[aria-hidden="true"], ' +
          '.feed-shared-actor__name span[aria-hidden="true"], ' +
          '.entity-result__title-text a span[aria-hidden="true"], ' +
          '.app-aware-link span[aria-hidden="true"], ' +
          '.update-components-actor__title span[aria-hidden="true"]'
        );
        const name = nameElement?.textContent?.trim() || '';

        const titleElement = element.querySelector(
          '.update-components-actor__description, .feed-shared-actor__description, ' +
          '.entity-result__primary-subtitle, .update-components-actor__subtitle, .subline-level-1'
        );
        const title = titleElement?.textContent?.trim() || '';

        // TARGET TITLE FILTER (New)
        if (targetTitles && targetTitles.length > 0) {
          if (!title) return; // If no title found, skip
          const titleLower = title.toLowerCase();
          const hasMatchingTitle = targetTitles.some(t => titleLower.includes(t.toLowerCase().trim()));
          if (!hasMatchingTitle) return; // Skip if title doesn't match
        }

        // Content Extraction
        let postContent = '';
        const postContentSelectors = [
          '.feed-shared-update-v2__description-wrapper', '.update-components-text__text-view',
          '.feed-shared-text__text-view', '.feed-shared-update-v2__commentary',
          '.update-components-update-v2__commentary',
          '.feed-shared-inline-show-more-text span[dir="ltr"]', '.update-components-text span[dir="ltr"]',
          '.feed-shared-text span[dir="ltr"]',
          '[data-test-id="main-feed-activity-card__commentary"]', '.feed-shared-update-v2__description'
        ];

        for (const selector of postContentSelectors) {
          const contentEl = element.querySelector(selector);
          if (contentEl) {
            const text = contentEl.textContent?.trim();
            if (text && text.length > 50) {
              postContent = text;
              break;
            }
          }
        }

        if (!postContent || postContent.length < 50) {
          const updateContainer = element.querySelector('.update-components-text, .feed-shared-update-v2__description');
          if (updateContainer) postContent = updateContainer.textContent?.trim() || '';
        }

        const postLink = element.querySelector(
          'a[href*="/feed/update/"], a[href*="/posts/"], .feed-shared-control-menu__trigger'
        );
        let postUrl = '';
        if (postLink?.href) postUrl = postLink.href.split('?')[0];

        // Email Search
        const fullText = element.textContent || '';
        const seeMoreContent = element.querySelector('.feed-shared-inline-show-more-text');
        const expandedText = seeMoreContent?.textContent || '';

        let mailtoEmails = '';
        element.querySelectorAll('a[href^="mailto:"]').forEach(link => {
          const href = link.getAttribute('href');
          if (href) mailtoEmails += ' ' + href.replace('mailto:', '').split('?')[0];
          mailtoEmails += ' ' + (link.textContent || '');
        });

        let linkEmails = '';
        element.querySelectorAll('a').forEach(link => {
          const linkText = link.textContent || '';
          if (linkText.includes('@')) linkEmails += ' ' + linkText;
        });

        const allTextToSearch = fullText + ' ' + expandedText + ' ' + postContent + ' ' + mailtoEmails + ' ' + linkEmails;
        const emailMatches = allTextToSearch.match(emailRegex);

        let email = '';
        if (emailMatches && emailMatches.length > 0) {
          for (const rawEmail of emailMatches) {
            const cleaned = cleanEmail(rawEmail);
            if (cleaned) {
              email = cleaned;
              break;
            }
          }
        }

        // Exclude Keywords Filter
        if (excludeKeywords && excludeKeywords.length > 0) {
          const hasExcludeKeyword = excludeKeywords.some(keyword => {
            const kw = keyword.trim();
            if (!kw) return false;

            // Escape special regex chars
            const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            try {
              // Word boundary check: \b matches start/end of word
              // This prevents "Java" from matching "Javascript"
              const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
              return pattern.test(fullText);
            } catch (e) {
              // Fallback to simple includes if regex fails (rare)
              return fullText.toLowerCase().includes(kw.toLowerCase());
            }
          });
          if (hasExcludeKeyword) return;
        }

        // Positive Keywords Filter
        if (keywords && keywords.length > 0) {
          const textToSearch = fullText.toLowerCase();
          const hasKeyword = keywords.some(keyword => {
            return textToSearch.includes(keyword.toLowerCase().trim());
          });
          if (!hasKeyword) return;
        }

        // Add Lead
        if (name || title || email) {
          let preview = postContent;
          if (!preview || preview.length < 50) {
            let tempText = fullText;
            if (name && tempText.startsWith(name)) tempText = tempText.substring(name.length).trim();
            if (title && tempText.startsWith(title)) tempText = tempText.substring(title.length).trim();
            preview = tempText;
          }
          preview = preview.replace(/\s+/g, ' ').replace(/^[•·\-\s]+/, '').trim();

          leads.push({
            name, title, profileUrl, postUrl, email,
            postPreview: preview.substring(0, 500),
            extractedAt: new Date().toISOString(),
            matchedKeywords: keywords ? keywords.filter(kw => fullText.toLowerCase().includes(kw.toLowerCase())) : []
          });
        }
      } catch (err) {
        console.error('Error extracting lead:', err);
      }
    });

    console.log(`Extraction complete: ${leads.length} leads found`);
    return { leads, totalScanned };
  }

  // ===================================
  // WATCH MODE & VISUAL FEEDBACK
  // ===================================

  let statusOverlay = null;

  function showOverlay(message, type = 'info') {
    if (!statusOverlay) {
      statusOverlay = document.createElement('div');
      statusOverlay.id = 'lle-watch-overlay';
      Object.assign(statusOverlay.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: '999999',
        background: '#1a1a2e',
        color: '#ffffff',
        padding: '16px',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px',
        maxWidth: '300px',
        border: '1px solid rgba(255,255,255,0.1)',
        transition: 'all 0.3s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      });
      document.body.appendChild(statusOverlay);
    }

    // Icon based on type
    let icon = '⚡';
    let color = '#00a0dc';
    if (type === 'success') { icon = '✅'; color = '#48bb78'; }
    if (type === 'error') { icon = '❌'; color = '#fc8181'; }
    if (type === 'scroll') { icon = '⬇️'; color = '#ecc94b'; }

    statusOverlay.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:8px;margin-bottom:4px;">
                <span style="font-size:18px;">${icon}</span>
                <span style="font-weight:600;color:${color}">Watch Mode</span>
            </div>
            <div style="line-height:1.4;opacity:0.9;">${message}</div>
        `;

    if (type === 'success' || type === 'error') {
      setTimeout(() => {
        if (statusOverlay) {
          statusOverlay.style.opacity = '0';
          setTimeout(() => {
            if (statusOverlay) {
              statusOverlay.remove();
              statusOverlay = null;
            }
          }, 500);
        }
      }, 5000);
    }
  }

  async function handleWatchModeRun(message) {
    const { keywords, excludeKeywords, scrollCount } = message;

    showOverlay('Initializing scan...', 'info');

    // Random start delay (human-like)
    await wait(2000);

    // Scroll (human reading)
    const scrolls = scrollCount !== undefined ? scrollCount : 3;

    for (let i = 0; i < scrolls; i++) {
      showOverlay(`Auto-scrolling page ${i + 1}/${scrolls}...`, 'scroll');
      window.scrollBy({ top: window.innerHeight * 1.5, behavior: 'smooth' });
      await wait(2000 + Math.random() * 1000);
    }

    showOverlay('Analyzing and extracting leads...', 'info');
    await wait(1000);

    // Extract
    const result = extractLinkedInData(keywords, excludeKeywords);
    const count = result.leads.length;

    if (count > 0) {
      showOverlay(`Found ${count} leads! Sending to Sheet...`, 'info');

      // Send to background and WAIT for response
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'WATCH_DATA_EXTRACTED',
          data: result,
          keywords: keywords
        });

        if (response && response.success) {
          const newCount = response.newLeadsCount;
          if (newCount > 0) {
            showOverlay(`Successfully saved ${newCount} NEW leads to Google Sheet!`, 'success');
          } else {
            showOverlay(`Found ${count} leads, but all were duplicates.`, 'error');
          }
        } else {
          showOverlay('Failed to save data. Check extension.', 'error');
        }
      } catch (e) {
        showOverlay('Connection error sending data.', 'error');
      }
    } else {
      showOverlay('No matching leads found on this page.', 'error');
    }
  }

  // Expose for visual indicator
  window.__lleShowIndicator = function (count) {
    const existing = document.getElementById('lle-indicator');
    if (existing) existing.remove();
    const indicator = document.createElement('div');
    indicator.id = 'lle-indicator';
    indicator.innerHTML = `<div class="lle-content" style="position:fixed;top:20px;right:20px;z-index:9999;background:#0a66c2;color:white;padding:12px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-family:system-ui,sans-serif;font-weight:600;display:flex;align-items:center;gap:8px;">
            <span>Extracted ${count} leads</span></div>`;
    document.body.appendChild(indicator);
    setTimeout(() => {
      indicator.style.transition = 'opacity 0.5s';
      indicator.style.opacity = '0';
      setTimeout(() => indicator.remove(), 500);
    }, 3000);
  };

})();
