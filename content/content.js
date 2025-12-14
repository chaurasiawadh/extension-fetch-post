// LinkedIn Lead Extractor - Content Script
// This script runs on LinkedIn pages and provides visual feedback

(function () {
    'use strict';

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'PING') {
            sendResponse({ status: 'ready' });
        }
        return true;
    });

    // Add visual indicator when extension is active
    function showExtractionIndicator(count) {
        // Remove existing indicator
        const existing = document.getElementById('lle-indicator');
        if (existing) existing.remove();

        const indicator = document.createElement('div');
        indicator.id = 'lle-indicator';
        indicator.innerHTML = `
      <div class="lle-content">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>Extracted ${count} leads</span>
      </div>
    `;
        document.body.appendChild(indicator);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            indicator.classList.add('lle-fade-out');
            setTimeout(() => indicator.remove(), 300);
        }, 3000);
    }

    // Expose function globally for popup to call
    window.__lleShowIndicator = showExtractionIndicator;

    console.log('LinkedIn Lead Extractor content script loaded');
})();
