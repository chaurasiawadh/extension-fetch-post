// LinkedIn Lead Extractor - Background Service Worker

// ===================================
// LISTENERS
// ===================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SEND_TO_WEBHOOK') {
        handleWebhookSend(message.webhookUrl, message.data)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    // WATCH MODE HANDLERS
    if (message.type === 'START_WATCH_MODE') {
        startWatchMode(message)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (message.type === 'STOP_WATCH_MODE') {
        stopWatchMode()
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (message.type === 'GET_WATCH_STATUS') {
        getWatchStatus().then(status => sendResponse(status));
        return true;
    }

    if (message.type === 'PAGE_LOADED') {
        checkAndTriggerWatch(sender.tab?.id, message.url);
    }

    if (message.type === 'WATCH_DATA_EXTRACTED') {
        processWatchData(message.data)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

// We keep alarm listener for safety fallback (if execution hangs)
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'watchModeAlarm') {
        executeWatchReload();
    }
});

// ===================================
// WATCH MODE LOGIC
// ===================================

async function startWatchMode(config) {
    console.log('Starting Watch Mode', config);

    const watchConfig = {
        active: true,
        tabId: config.tabId,
        profileId: config.profileId,
        webhookUrl: config.webhookUrl,
        sheetName: config.sheetName,
        keywords: config.keywords,
        excludeKeywords: config.excludeKeywords,
        scrollCount: config.scrollCount || 3,
        refreshInterval: config.refreshInterval || 60,
        cycleStartTime: Date.now()
    };

    await chrome.storage.local.set({ watchConfig });
    updateBadge(true);

    // Initial Reload
    console.log('Reloading tab to start Watch Mode');
    chrome.tabs.reload(watchConfig.tabId);
}

async function stopWatchMode() {
    console.log('Stopping Watch Mode');
    await chrome.storage.local.remove(['watchConfig']);
    await chrome.alarms.clear('watchModeAlarm');
    updateBadge(false);
}

async function getWatchStatus() {
    const { watchConfig } = await chrome.storage.local.get(['watchConfig']);
    return watchConfig || { active: false };
}

async function executeWatchReload() {
    const { watchConfig } = await chrome.storage.local.get(['watchConfig']);
    if (!watchConfig || !watchConfig.active) return;
    try {
        await chrome.tabs.reload(watchConfig.tabId);
    } catch (error) {
        console.error('Error reloading tab', error);
        await stopWatchMode();
    }
}

async function checkAndTriggerWatch(tabId, url) {
    const { watchConfig } = await chrome.storage.local.get(['watchConfig']);

    if (!watchConfig || !watchConfig.active) return;

    if (tabId === watchConfig.tabId && url.includes('linkedin.com')) {
        console.log('Watch Mode Page Loaded. Starting Cycle...');

        // Reset cycle start time on page load
        watchConfig.cycleStartTime = Date.now();
        watchConfig.currentBatchCount = 0; // Reset batch count on fresh reload
        await chrome.storage.local.set({ watchConfig });

        // Trigger First Batch
        chrome.tabs.sendMessage(tabId, {
            type: 'EXECUTE_WATCH_RUN',
            keywords: watchConfig.keywords,
            excludeKeywords: watchConfig.excludeKeywords,
            scrollCount: watchConfig.scrollCount
        });

        // Safety Fallback Alarm (e.g. reload in 70 mins if script dies)
        chrome.alarms.create('watchModeAlarm', { delayInMinutes: 70 });
    }
}

async function processWatchData(extractionResult) {
    console.log('Processing Watch Mode Data:', extractionResult);
    const { watchConfig } = await chrome.storage.local.get(['watchConfig']);

    if (!watchConfig || !watchConfig.active) return { success: false, error: 'Watch mode inactive' };

    // --- 0. UPDATE BATCH COUNT ---
    watchConfig.currentBatchCount = (watchConfig.currentBatchCount || 0) + 1;
    await chrome.storage.local.set({ watchConfig });

    // --- 1. DEDUPLICATION & WEBHOOK ---
    const leads = extractionResult.leads || [];
    let newLeadsCount = 0;

    // Process leads regardless of count (to update history/badge)
    if (leads.length > 0) {
        const profileId = watchConfig.profileId || 'default';
        const storageKey = `extractedEmails_${profileId}`;
        const storageData = await chrome.storage.local.get([storageKey]);
        const history = new Set(storageData[storageKey] || []);

        const newLeads = leads.filter(l => l.email && !history.has(l.email.toLowerCase()));

        if (newLeads.length > 0) {
            const payload = {
                leads: newLeads,
                meta: {
                    sheetName: watchConfig.sheetName,
                    totalScanned: extractionResult.totalScanned,
                    totalExtracted: newLeads.length,
                    keywords: watchConfig.keywords,
                    source: 'WATCH_MODE_AUTOPILOT',
                    timestamp: new Date().toISOString()
                }
            };

            const webhookResult = await handleWebhookSend(watchConfig.webhookUrl, payload);
            if (webhookResult.success) {
                newLeads.forEach(l => history.add(l.email.toLowerCase()));
                const historyArray = Array.from(history).slice(-5000);
                await chrome.storage.local.set({ [storageKey]: historyArray });
                chrome.action.setBadgeText({ text: 'NEW' });
                chrome.action.setBadgeBackgroundColor({ color: '#00C853' });
                newLeadsCount = newLeads.length;
            }
        }
    }

    // --- 2. LOOP LOGIC (Continue vs Reload) ---
    const refreshIntervalMins = parseInt(watchConfig.refreshInterval) || 60;
    const refreshIntervalMs = refreshIntervalMins * 60 * 1000;
    const maxBatches = parseInt(watchConfig.maxBatches) || 50;

    const cycleStart = watchConfig.cycleStartTime || Date.now();
    const timeElapsed = Date.now() - cycleStart;
    const batchCount = watchConfig.currentBatchCount;

    console.log(`Watch Mode: Batch ${batchCount}/${maxBatches} | Elapsed ${Math.round(timeElapsed / 1000)}s / Limit ${refreshIntervalMins * 60}s`);

    const shouldReload = timeElapsed >= refreshIntervalMs || batchCount >= maxBatches;

    if (shouldReload) {
        console.log('Watch Mode: Limits reached. RELOADING page...');
        chrome.tabs.reload(watchConfig.tabId);
    } else {
        console.log('Watch Mode: Continuing next batch...');
        // Send CONTINUE command with safety delay
        setTimeout(() => {
            chrome.tabs.sendMessage(watchConfig.tabId, {
                type: 'CONTINUE_WATCH_BATCH',
                scrollCount: watchConfig.scrollCount,
                keywords: watchConfig.keywords,
                excludeKeywords: watchConfig.excludeKeywords
            }).catch(() => console.log('Tab closed?'));
        }, 5000);
    }

    return { success: true, newLeadsCount };
}

function updateBadge(active) {
    if (active) {
        chrome.action.setBadgeText({ text: 'ON' });
        chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
    } else {
        chrome.action.setBadgeText({ text: '' });
    }
}

// ===================================
// WEBHOOK UTILS
// ===================================

async function handleWebhookSend(webhookUrl, data) {
    try {
        await fetch(webhookUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(data)
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.storage.local.set({ profiles: {} });
    }
});
