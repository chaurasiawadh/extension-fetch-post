// LinkedIn Lead Extractor - Background Service Worker

// ===================================
// LISTENERS for MULTI-TAB WATCH MODE
// ===================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SEND_TO_WEBHOOK') {
        handleWebhookSend(message.webhookUrl, message.data)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    // START Watch Mode for a specific Tab
    if (message.type === 'START_WATCH_MODE') {
        startWatchMode(message)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    // STOP Watch Mode for a specific Tab
    if (message.type === 'STOP_WATCH_MODE') {
        stopWatchMode(message.tabId)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    // GET Status for a specific Tab (popup needs to know if THIS tab is active)
    if (message.type === 'GET_WATCH_STATUS') {
        getWatchStatus(message.tabId).then(status => sendResponse(status));
        return true;
    }

    // PAGE LOADED: Check if this tab is one of our watched tabs
    if (message.type === 'PAGE_LOADED') {
        checkAndTriggerWatch(sender.tab?.id, message.url);
    }

    // DATA from Watch Mode: We need to know WHICH tab sent it to use correct profile
    if (message.type === 'WATCH_DATA_EXTRACTED') {
        // sender.tab.id is reliable here
        processWatchData(sender.tab?.id, message.data)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

// Fallback Alarm Listener
chrome.alarms.onAlarm.addListener((alarm) => {
    // Alarm name format: watchModeAlarm_12345
    if (alarm.name.startsWith('watchModeAlarm_')) {
        const tabId = parseInt(alarm.name.split('_')[1]);
        if (!isNaN(tabId)) {
            executeWatchReload(tabId);
        }
    }
});

// ===================================
// MULTI-TAB SESSION STATE
// ===================================

// In-memory session store (backed by storage.local for persistence)
// Structure: { [tabId]: { active: true, profileId: '...', ... } }
let watchSessions = {};

// Load sessions on startup
chrome.storage.local.get(['watchSessions'], (result) => {
    watchSessions = result.watchSessions || {};
    console.log('Loaded Watch Sessions:', watchSessions);
});

async function startWatchMode(config) {
    console.log('Starting Watch Mode for Tab:', config.tabId);

    // Create session config
    const sessionConfig = {
        active: true,
        tabId: config.tabId,
        profileId: config.profileId,
        webhookUrl: config.webhookUrl,
        sheetName: config.sheetName,
        keywords: config.keywords,
        excludeKeywords: config.excludeKeywords,
        scrollCount: config.scrollCount || 3,
        refreshInterval: config.refreshInterval || 60,
        maxBatches: config.maxBatches || 50,
        currentBatchCount: 0,
        cycleStartTime: Date.now()
    };

    // Update local state and storage
    watchSessions[config.tabId] = sessionConfig;
    await chrome.storage.local.set({ watchSessions });

    // Update Badge for THIS tab
    updateBadge(config.tabId, true);

    // Initial Reload
    console.log(`Reloading tab ${config.tabId} to start Watch Mode`);
    chrome.tabs.reload(config.tabId);
}

async function stopWatchMode(tabId) {
    console.log('Stopping Watch Mode for Tab:', tabId);

    if (watchSessions[tabId]) {
        delete watchSessions[tabId];
        await chrome.storage.local.set({ watchSessions });
        await chrome.alarms.clear(`watchModeAlarm_${tabId}`);
        updateBadge(tabId, false);
    }
}

async function getWatchStatus(tabId) {
    // If no tabId passed (e.g. from popup start), return false
    if (!tabId) return { active: false };
    const session = watchSessions[tabId];
    return session || { active: false };
}

async function executeWatchReload(tabId) {
    const session = watchSessions[tabId];
    if (!session || !session.active) return;

    try {
        await chrome.tabs.reload(tabId);
    } catch (error) {
        console.error(`Error reloading tab ${tabId}`, error);
        await stopWatchMode(tabId);
    }
}

async function checkAndTriggerWatch(tabId, url) {
    // Check if this tab is being watched
    const session = watchSessions[tabId];
    if (!session || !session.active) return;

    if (url.includes('linkedin.com')) {
        console.log(`Watch Mode Page Loaded (Tab ${tabId}). Starting Cycle...`);

        // Reset cycle persistence
        session.cycleStartTime = Date.now();
        session.currentBatchCount = 0;

        // Save state update
        watchSessions[tabId] = session;
        await chrome.storage.local.set({ watchSessions });

        // Trigger First Batch
        chrome.tabs.sendMessage(tabId, {
            type: 'EXECUTE_WATCH_RUN',
            keywords: session.keywords,
            excludeKeywords: session.excludeKeywords,
            scrollCount: session.scrollCount
        });

        // Safety Fallback Alarm (unique per tab)
        chrome.alarms.create(`watchModeAlarm_${tabId}`, { delayInMinutes: 70 });
    }
}

async function processWatchData(senderTabId, extractionResult) {
    console.log(`Processing Watch Mode Data from Tab ${senderTabId}`);

    const session = watchSessions[senderTabId];
    if (!session || !session.active) {
        return { success: false, error: 'Watch mode inactive for this tab' };
    }

    // --- 0. UPDATE BATCH COUNT ---
    session.currentBatchCount = (session.currentBatchCount || 0) + 1;
    watchSessions[senderTabId] = session;
    await chrome.storage.local.set({ watchSessions });

    // --- 1. DEDUPLICATION & WEBHOOK ---
    const leads = extractionResult.leads || [];
    let newLeadsCount = 0;

    if (leads.length > 0) {
        // Use profile ID from specific session
        const profileId = session.profileId || 'default';
        const storageKey = `extractedEmails_${profileId}`;
        const storageData = await chrome.storage.local.get([storageKey]);
        const history = new Set(storageData[storageKey] || []);

        const newLeads = leads.filter(l => l.email && !history.has(l.email.toLowerCase()));

        if (newLeads.length > 0) {
            const payload = {
                leads: newLeads,
                meta: {
                    sheetName: session.sheetName,
                    totalScanned: extractionResult.totalScanned,
                    totalExtracted: newLeads.length,
                    keywords: session.keywords,
                    source: 'WATCH_MODE_AUTOPILOT',
                    timestamp: new Date().toISOString()
                }
            };

            const webhookResult = await handleWebhookSend(session.webhookUrl, payload);
            if (webhookResult.success) {
                newLeads.forEach(l => history.add(l.email.toLowerCase()));
                const historyArray = Array.from(history).slice(-5000);
                await chrome.storage.local.set({ [storageKey]: historyArray });

                // Show badge briefly on this tab?
                chrome.action.setBadgeText({ tabId: senderTabId, text: 'NEW' });
                chrome.action.setBadgeBackgroundColor({ tabId: senderTabId, color: '#00C853' });
                newLeadsCount = newLeads.length;
            }
        }
    }

    // --- 2. LOOP LOGIC ---
    const refreshIntervalMins = parseInt(session.refreshInterval) || 60;
    const refreshIntervalMs = refreshIntervalMins * 60 * 1000;
    const maxBatches = parseInt(session.maxBatches) || 50;

    const cycleStart = session.cycleStartTime || Date.now();
    const timeElapsed = Date.now() - cycleStart;
    const batchCount = session.currentBatchCount;

    console.log(`Tab ${senderTabId} | Batch ${batchCount}/${maxBatches} | Elapsed ${Math.round(timeElapsed / 1000)}s`);

    const shouldReload = timeElapsed >= refreshIntervalMs || batchCount >= maxBatches;

    if (shouldReload) {
        console.log(`Tab ${senderTabId}: Limits reached. RELOADING...`);
        chrome.tabs.reload(session.tabId);
    } else {
        console.log(`Tab ${senderTabId}: Continuing next batch...`);
        setTimeout(() => {
            chrome.tabs.sendMessage(session.tabId, {
                type: 'CONTINUE_WATCH_BATCH',
                scrollCount: session.scrollCount,
                keywords: session.keywords,
                excludeKeywords: session.excludeKeywords
            }).catch(() => console.log('Tab closed?'));
        }, 5000);
    }

    return { success: true, newLeadsCount };
}

function updateBadge(tabId, active) {
    if (active) {
        chrome.action.setBadgeText({ tabId, text: 'ON' });
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#FF0000' });
    } else {
        chrome.action.setBadgeText({ tabId, text: '' });
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
        chrome.storage.local.set({ profiles: {}, watchSessions: {} });
    }
});
