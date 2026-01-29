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
      handleWatchModeRun(message).catch(err => {
        console.error('Watch Mode: EXECUTE_WATCH_RUN error', err);
      });
    }
    else if (message.type === 'CONTINUE_WATCH_BATCH') {
      // Just triggering the same logic, but we can customize if needed
      handleWatchModeRun(message).catch(err => {
        console.error('Watch Mode: CONTINUE_WATCH_BATCH error', err);
      });
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
    const { keywords, mandatoryKeywords, targetTitles, excludeKeywords, scrollCount } = message;

    showOverlay('Initializing manual extraction...', 'info', 'Manual Mode');

    try {
      // Auto-scroll if requested
      if (scrollCount > 0) {
        await autoScroll(scrollCount);
      }

      showOverlay('Extracting leads...', 'info', 'Manual Mode');
      // Run extraction
      const result = extractLinkedInData(keywords, mandatoryKeywords, targetTitles, excludeKeywords);

      const count = result.leads ? result.leads.length : 0;
      if (count > 0) {
        showOverlay(`Found ${count} leads! Sending...`, 'success', 'Manual Mode');
      } else {
        showOverlay('No leads found matching criteria.', 'error', 'Manual Mode');
      }

      return result;

    } catch (error) {
      console.error('Manual Extraction Error:', error);
      const isInvalidated = error.message.includes('Extension context invalidated');
      if (isInvalidated) {
        showOverlay('Extension updated. Please REFRESH this page!', 'error', 'Manual Mode');
      } else {
        showOverlay(`Error: ${error.message}`, 'error', 'Manual Mode');
      }
      throw error; // Re-throw to send to popup
    }
  }


  async function autoScroll(count) {
    console.log(`Auto-scrolling ${count} times using custom container logic...`);

    // Helper to find the right scrollable matching user request
    function findScrollable(el) {
      while (el) {
        const style = getComputedStyle(el);
        const overflowY = style.overflowY;
        if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
          return el;
        }
        el = el.parentElement;
      }
      return document.scrollingElement || document.documentElement;
    }

    for (let i = 0; i < count; i++) {
      showOverlay(`Auto-scrolling ${i + 1}/${count}...`, 'scroll', 'Manual Mode');

      try {
        // Core Logic from User Request
        const content = document.querySelector(".scaffold-finite-scroll__content") ||
          document.querySelector("main") ||
          document.body;

        const scroller = findScrollable(content);
        const distance = 1000; // Fixed distance instead of prompt

        if (scroller) {
          scroller.scrollBy({ top: distance, behavior: 'smooth' });
          console.log(`LLE Debug: Scrolled ${distance}px on`, scroller);
        } else {
          console.warn("LLE Debug: Scrollable container not found, falling back to window");
          window.scrollBy({ top: distance, behavior: 'smooth' });
        }

        // Try to click "Show more" buttons if present
        const showMoreButtons = document.querySelectorAll('button.scaffold-finite-scroll__load-button, button[aria-label="Show more results"], .feed-shared-inline-show-more-text__button');
        showMoreButtons.forEach(btn => {
          if (btn && btn.offsetParent !== null) btn.click();
        });

      } catch (e) {
        console.error("Scroll error:", e);
      }

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
  function extractLinkedInData(keywords, mandatoryKeywords = [], targetTitles = [], excludeKeywords = []) {
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
    // UPDATED: Added data-view-name strategies which are more stable
    const postSelectors = [
      // 2025/2026 Stable Selectors (Data Attributes)
      '[data-view-name="feed-full-update"]',
      '[data-view-name="search-entity-result-universal-template"]',
      '[data-view-name="job-card"]',

      // Legacy/Fallback Classes
      '.feed-shared-update-v2',
      '.occludable-update',
      '.reusable-search__result-container',
      '.entity-result',
      '[data-chameleon-result-urn]',

      // Generic containers often used in search
      'li.reusable-search__result-container',
      'div.feed-shared-update-v2'
    ];

    const elements = document.querySelectorAll(postSelectors.join(', '));
    console.log(`LLE DEBUG: Found ${elements.length} elements using selectors:`, postSelectors);



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

        // Post URL Detection (Refined - Multiple strategies)
        let postUrl = '';

        // Strategy 1: Direct link selectors
        const postLinkSelectors = [
          'a[href*="/feed/update/"]',
          'a[href*="/posts/"]',
          '.update-components-actor__sub-description a[href*="/feed/update/"]',
          '.feed-shared-actor__sub-description a[href*="/feed/update/"]',
          'a.app-aware-link[href*="/feed/update/"]',
          'a.app-aware-link[href*="/posts/"]',
          // Time/Age links often contain post URLs
          '.update-components-actor__sub-description-link',
          '.feed-shared-actor__sub-description a',
          'a.update-components-actor__meta-link'
        ];

        for (const sel of postLinkSelectors) {
          const link = element.querySelector(sel);
          if (link?.href && (link.href.includes('/feed/update/') || link.href.includes('/posts/'))) {
            postUrl = link.href.split('?')[0];
            break;
          }
        }

        // Strategy 2: Look for any link containing urn:li:activity (LinkedIn post ID)
        if (!postUrl) {
          const allLinks = element.querySelectorAll('a');
          for (const link of allLinks) {
            const href = link.href || '';
            if (href.includes('/feed/update/urn:li:') || href.includes('/posts/')) {
              postUrl = href.split('?')[0];
              break;
            }
          }
        }

        // Strategy 3: Check data attributes for urn
        if (!postUrl) {
          const urn = element.getAttribute('data-urn') || element.getAttribute('data-id');
          if (urn && urn.includes('urn:li:activity:')) {
            postUrl = `https://www.linkedin.com/feed/update/${urn}`;
          }
        }

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

        // Job Link Search (Refined)
        let jobLink = '';
        // 1. Look for 'View job' buttons or links
        const viewJobLink = element.querySelector('a[href*="/jobs/view/"], a.feed-shared-update-v2__job-content-link');
        if (viewJobLink) {
          jobLink = viewJobLink.href.split('?')[0];
        }

        // 2. Look for external links that might be job applications
        if (!jobLink) {
          const links = element.querySelectorAll('a');
          for (const link of links) {
            const href = link.href.toLowerCase();
            const text = link.textContent?.toLowerCase() || '';

            // Skip common non-job links
            if (href.includes('mailto:') ||
              href.includes('linkedin.com/in/') ||
              href.includes('linkedin.com/company/') ||
              href.includes('hashtag') ||
              href.includes('search/results') ||
              href.includes('whatsapp.com/channel') ||
              href === '#' || href === '') continue;

            if (href.includes('job') || href.includes('apply') || href.includes('career') ||
              text.includes('apply') || text.includes('job') || text.includes('hiring') ||
              text.includes('google.com/forms') || text.includes('typeform.com')) {
              jobLink = link.href;
              break;
            }
          }
        }

        // Filtering logic - uses postContent for better accuracy
        const searchTarget = (postContent + ' ' + title + ' ' + name).toLowerCase();

        // Exclude Keywords Filter (HIGHEST PRIORITY) - EXACT TERM MATCHING
        if (excludeKeywords && excludeKeywords.length > 0) {
          const hasExcludeKeyword = excludeKeywords.some(keyword => {
            try {
              const term = keyword.trim().toLowerCase();
              if (!term || term.length === 0) return false;

              // Exact term matching - keyword must be standalone, not part of a larger word
              // e.g., "JAVA" should NOT match "JavaScript", but SHOULD match "JAVA developer"
              let pos = 0;
              while ((pos = searchTarget.indexOf(term, pos)) !== -1) {
                const charBefore = pos > 0 ? searchTarget[pos - 1] : '';
                const charAfter = pos + term.length < searchTarget.length
                  ? searchTarget[pos + term.length]
                  : '';

                // Check if term boundaries are valid
                const termStartsAlphaNum = /[a-z0-9]/i.test(term.charAt(0));
                const termEndsAlphaNum = /[a-z0-9]/i.test(term.charAt(term.length - 1));
                const beforeIsAlphaNum = charBefore ? /[a-z0-9]/i.test(charBefore) : false;
                const afterIsAlphaNum = charAfter ? /[a-z0-9]/i.test(charAfter) : false;

                // If term starts with alphanumeric, char before must NOT be alphanumeric
                // If term ends with alphanumeric, char after must NOT be alphanumeric
                const startOk = !termStartsAlphaNum || !beforeIsAlphaNum;
                const endOk = !termEndsAlphaNum || !afterIsAlphaNum;

                if (startOk && endOk) {
                  return true; // Found exact match
                }

                pos++;
              }
              return false;
            } catch (e) {
              console.error('Error checking exclude keyword:', keyword, e);
              return false;
            }
          });
          if (hasExcludeKeyword) return;
        }

        // Positive Keywords Filter (OR Logic)
        if (keywords && keywords.length > 0) {
          const hasKeyword = keywords.some(keyword => {
            return searchTarget.includes(keyword.toLowerCase().trim());
          });
          if (!hasKeyword) return;
        }

        // Mandatory Keywords Filter (AND Logic)
        if (mandatoryKeywords && mandatoryKeywords.length > 0) {
          const hasAllMandatory = mandatoryKeywords.every(keyword => {
            return searchTarget.includes(keyword.toLowerCase().trim());
          });
          if (!hasAllMandatory) return;
        }

        // Add Lead
        if (name || title || email || jobLink) {
          let preview = postContent;
          if (!preview || preview.length < 50) {
            let tempText = fullText;
            if (name && tempText.startsWith(name)) tempText = tempText.substring(name.length).trim();
            if (title && tempText.startsWith(title)) tempText = tempText.substring(title.length).trim();
            preview = tempText;
          }
          preview = preview.replace(/\s+/g, ' ').replace(/^[•·\-\s]+/, '').trim();

          leads.push({
            name, title, profileUrl, postUrl, email, jobLink,
            postPreview: preview.substring(0, 500),
            extractedAt: new Date().toISOString(),
            matchedKeywords: keywords ? keywords.filter(kw => searchTarget.includes(kw.toLowerCase().trim())) : []
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

  function showOverlay(message, type = 'info', title = 'Watch Mode') {
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
                <span style="font-weight:600;color:${color}">${title}</span>
            </div>
            <div style="line-height:1.4;opacity:0.9;">${message}</div>
        `;

    if (type === 'success' || type === 'error') {
      // Don't auto-hide "Please Refresh" errors as they are critical
      if (message.includes('Refresh')) return;

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
    const { keywords, mandatoryKeywords, targetTitles, excludeKeywords, scrollCount } = message;

    showOverlay('Initializing scan...', 'info');

    // Random start delay (human-like)
    await wait(2000);

    // Scroll (human reading)
    const scrolls = scrollCount !== undefined ? scrollCount : 3;

    for (let i = 0; i < scrolls; i++) {
      showOverlay(`Auto-scrolling page ${i + 1}/${scrolls}...`, 'scroll');

      // Attempt smooth scroll
      window.scrollBy({ top: window.innerHeight * 1.2, behavior: 'smooth' });

      // Look for "Show more results" or similar buttons (often found in search/feed)
      const showMoreButtons = document.querySelectorAll('button.scaffold-finite-scroll__load-button, button[aria-label="Show more results"], .feed-shared-inline-show-more-text__button');
      showMoreButtons.forEach(btn => {
        if (btn && btn.offsetParent !== null) { // Check if visible
          btn.click();
          console.log('Watch Mode: Clicked "Show more" button');
        }
      });

      // Special check for the "Show more results" at the bottom of search
      const bottomButton = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Show more results'));
      if (bottomButton) bottomButton.click();

      // Fallback: If page didn't move much, force it
      await wait(1500);
      window.scrollBy(0, 500);

      // Randomish wait to allow content to load
      await wait(1000 + Math.random() * 1000);
    }

    showOverlay('Analyzing and extracting leads...', 'info');
    await wait(1000);

    // Extract with error handling
    let result;
    let count = 0;

    try {
      result = extractLinkedInData(keywords, mandatoryKeywords, targetTitles || [], excludeKeywords);
      count = result.leads.length;
    } catch (extractError) {
      console.error('Watch Mode: Extraction error', extractError);

      const isInvalidated = extractError.message && extractError.message.includes('Extension context invalidated');
      if (isInvalidated) {
        showOverlay('Extension updated. Please REFRESH this page!', 'error');
        return; // Fatal error, stop everything
      }

      showOverlay('Extraction error. Retrying soon...', 'error');
      // Still notify background to continue the loop
      try {
        await chrome.runtime.sendMessage({
          type: 'WATCH_DATA_EXTRACTED',
          data: { leads: [], totalScanned: 0 },
          keywords: keywords
        });
      } catch (e) { /* ignore */ }
      return;
    }

    // ALWAYS notify background to continue the loop
    try {
      if (count > 0) {
        showOverlay(`Found ${count} leads! Sending to Sheet...`, 'info');
      }

      const response = await chrome.runtime.sendMessage({
        type: 'WATCH_DATA_EXTRACTED',
        data: result,
        keywords: keywords
      });

      if (count > 0) {
        // Check if response was successful (treat undefined/missing as success for resilience)
        if (!response || response.success !== false) {
          const newCount = response?.newLeadsCount || 0;
          if (newCount > 0) {
            showOverlay(`Successfully saved ${newCount} NEW leads!`, 'success');
          } else {
            showOverlay(`Found ${count} leads (all duplicates). Next batch in 5s...`, 'info');
          }
        } else {
          console.error('Watch Mode: Background returned error', response);
          showOverlay('Failed to save data. Check extension.', 'error');
        }
      } else {
        showOverlay('No new leads this batch. Continuing...', 'info');
      }
    } catch (e) {
      const isInvalidated = e.message && e.message.includes('Extension context invalidated');
      if (isInvalidated) {
        console.warn('Watch Mode: Context invalidated (reload detected).');
        showOverlay('Extension updated. Please REFRESH this page!', 'error');
      } else {
        console.error('Watch Mode: Connection error', e);
        showOverlay('Connection error. Retrying soon...', 'error');
      }
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
