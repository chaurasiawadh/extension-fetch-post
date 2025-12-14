// LinkedIn Lead Extractor - Background Service Worker

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SEND_TO_WEBHOOK') {
        handleWebhookSend(message.webhookUrl, message.data)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));

        // Return true to indicate async response
        return true;
    }
});

// Send data to webhook
async function handleWebhookSend(webhookUrl, data) {
    console.log('=== WEBHOOK SEND START ===');
    console.log('URL:', webhookUrl);
    console.log('Leads count:', data.leads?.length);

    try {
        // Use no-cors mode to bypass CORS restrictions
        // We won't get a readable response, but the data will be sent
        const response = await fetch(webhookUrl, {
            method: 'POST',
            mode: 'no-cors', // This bypasses CORS but we can't read the response
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify(data),
            redirect: 'follow'
        });

        console.log('Request sent! Response type:', response.type);

        // With no-cors, response.type will be 'opaque' and we can't read it
        // But the request was sent successfully if we reach this point
        // We'll assume success since the request was made

        return {
            success: true,
            response: {
                message: `Sent ${data.leads?.length || 0} leads to webhook`,
                note: 'Data sent successfully. Check your Google Sheet to verify.'
            }
        };

    } catch (error) {
        console.error('Webhook error:', error);

        return {
            success: false,
            error: error.message || 'Failed to send data'
        };
    }
}

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('LinkedIn Lead Extractor installed!');

        // Set default settings
        chrome.storage.local.set({
            webhookUrl: '',
            keywords: ''
        });
    }
});
