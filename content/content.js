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

    // UPDATED Selectors to favor data-view-name
    const postSelectors = [
      '[data-view-name="feed-full-update"]',
      'div.feed-shared-update-v2',
      'li.reusable-search__result-container'
    ];

    const elements = document.querySelectorAll(postSelectors.join(', '));
    console.log(`LLE DEBUG: Found ${elements.length} elements using selectors:`, postSelectors);

    elements.forEach((element) => {
      totalScanned++;
      try {
        // --- 1. POST URL (Robust via Tracking Scope) ---
        let postUrl = '';

        // Try parsing data-view-tracking-scope
        // It often looks like: [{"... updateUrn":"urn:li:activity:742... " ...}]
        const trackingDiv = element.closest('[data-view-tracking-scope]') || element.querySelector('[data-view-tracking-scope]');
        if (trackingDiv) {
          const trackingAttr = trackingDiv.getAttribute('data-view-tracking-scope');
          if (trackingAttr) {
            try {
              // Sometimes it is URI encoded, but usually just JSON string
              // We look for the pattern "updateUrn":"urn:li:activity:..."
              const match = trackingAttr.match(/urn:li:activity:(\d+)/);
              if (match && match[1]) {
                postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${match[1]}/`;
              }
            } catch (e) {
              // ignore parse error
            }
          }
        }

        // Fallback strategies for Post URL
        if (!postUrl) {
          const link = element.querySelector('a[href*="/feed/update/"], a[href*="/posts/"]');
          if (link) postUrl = link.href.split('?')[0];
        }

        // --- 2. ACTOR DETAILS (Name, Title, Profile URL) ---
        let name = '';
        let title = '';
        let profileUrl = '';

        // Locate the actor image container, which is usually a stable anchor
        const actorImageLink = element.querySelector('a[data-view-name="feed-actor-image"]');

        if (actorImageLink) {
          profileUrl = actorImageLink.href.split('?')[0];

          // The actor text details are usually in the NEXT sibling or close by
          // Structure:
          // <a data-view-name="feed-actor-image">...</a>
          // <div ...> 
          //    <a ...> <span ...>NAME</span> </a>
          //    <span ...>TITLE</span>
          // </div>

          // Start searching from the parent's next elements or siblings
          const container = actorImageLink.parentElement;
          // Sometimes the text is in a sibling <div>
          const textContainer = container.querySelector('[data-view-name="feed-actor-name"]')
            || element.querySelector('.update-components-actor__meta')
            || element.querySelector('.feed-shared-actor__meta');

          if (textContainer || (actorImageLink.nextElementSibling)) {
            const targetDiv = textContainer || actorImageLink.nextElementSibling;

            // Name is usually the first strong text
            const nameEl = targetDiv.querySelector('span[aria-hidden="true"]');
            if (nameEl) name = nameEl.textContent.trim();

            // Title is usually in the secondary text
            const titleEl = targetDiv.querySelector('.update-components-actor__description span[aria-hidden="true"], .feed-shared-actor__description span[aria-hidden="true"]');
            if (titleEl) title = titleEl.textContent.trim();

            // Fallback: iterate p tags if specific classes fail (common in search results)
            if (!name) {
              const pTags = targetDiv.querySelectorAll('p, span[dir="ltr"]');
              if (pTags.length >= 1) name = pTags[0].textContent.trim().split('•')[0].trim();
              if (pTags.length >= 2) title = pTags[1].textContent.trim();
            }
          }
        }

        // --- 3. COMPANY / JOB DETAILS ---
        let company = '';
        // If there is a job card attached
        const jobCard = element.querySelector('[data-view-name="feed-job-card-entity"], .job-card-container');
        if (jobCard) {
          // Company is usually the second line in job card
          const jobTexts = jobCard.innerText.split('\n');
          if (jobTexts.length >= 2) {
            // Often: Job Title \n Company Name \n Location
            // But we should look for the company logo alt or specific class if possible
            const companyImg = jobCard.querySelector('img');
            if (companyImg && companyImg.alt) company = companyImg.alt;
          }
        }


        // TARGET TITLE FILTER
        if (targetTitles && targetTitles.length > 0) {
          // Check both actor title and potential job title
          const titleTextToCheck = (title + ' ' + (company || '')).toLowerCase();
          if (!titleTextToCheck) return;
          const hasMatchingTitle = targetTitles.some(t => titleTextToCheck.includes(t.toLowerCase().trim()));
          if (!hasMatchingTitle) return;
        }

        // --- 4. CONTENT & EMAILS ---
        let postContent = '';
        const contentEl = element.querySelector('.feed-shared-update-v2__description-wrapper, .update-components-text, [data-view-name="feed-commentary"]');
        if (contentEl) {
          // Get full text including "see more" if expanded, though 'innerText' usually captures visible
          // We want hidden text too if logical, but 'textContent' allows that.
          postContent = contentEl.textContent.trim();
        }

        // Email Search
        const fullText = (element.innerText || '') + ' ' + postContent;
        let mailtoEmails = '';
        element.querySelectorAll('a[href^="mailto:"]').forEach(link => {
          mailtoEmails += ' ' + link.href.replace('mailto:', '').split('?')[0];
        });

        const allTextToSearch = fullText + ' ' + mailtoEmails;
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

        // --- 5. JOB/APPLY LINK ---
        let jobLink = '';
        const viewJobLink = element.querySelector('a[href*="/jobs/view/"], [data-view-name="feed-job-card-entity"] a');
        if (viewJobLink) {
          jobLink = viewJobLink.href.split('?')[0];
        } else {
          // Look for probable external job links
          const links = element.querySelectorAll('a');
          for (const link of links) {
            const href = link.href.toLowerCase();
            if (href.includes('forms.gle') || href.includes('typeform') || href.includes('lever.co') || href.includes('greenhouse.io')) {
              jobLink = link.href;
              break;
            }
          }
        }

        // --- FILTERS ---
        const searchTarget = (postContent + ' ' + title + ' ' + name + ' ' + company).toLowerCase();

        // Exclude
        if (excludeKeywords && excludeKeywords.length > 0) {
          const hasExclude = excludeKeywords.some(kw => searchTarget.includes(kw.toLowerCase().trim()));
          if (hasExclude) return;
        }

        // Positive
        if (keywords && keywords.length > 0) {
          const hasKeyword = keywords.some(kw => searchTarget.includes(kw.toLowerCase().trim()));
          if (!hasKeyword) return;
        }

        // Mandatory
        if (mandatoryKeywords && mandatoryKeywords.length > 0) {
          const hasAll = mandatoryKeywords.every(kw => searchTarget.includes(kw.toLowerCase().trim()));
          if (!hasAll) return;
        }

        // Add matched lead
        if (name || title || email || jobLink) {
          const preview = postContent.replace(/\s+/g, ' ').substring(0, 500);
          leads.push({
            name, title, company, profileUrl, postUrl, email, jobLink,
            postPreview: preview,
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
