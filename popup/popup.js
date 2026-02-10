// Jobseekers for LinkedIn - Popup Script

// Import API utilities
import { registerUser, uploadResume, saveHRContacts, fetchHRContacts } from './useApi.js';

document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const scrollCountInput = document.getElementById('scrollCount');
    const extractBtn = document.getElementById('extractBtn');

    // Views
    const wrongHostView = document.getElementById('wrongHostView');
    const onboardingView = document.getElementById('onboardingView');
    const mainContent = document.querySelector('.main-content'); // We might need to hide this or just overlay covers it

    // Onboarding Elements
    const onboardingUsernameInput = document.getElementById('onboardingUsername');
    const saveUsernameBtn = document.getElementById('saveUsernameBtn');

    // Host Restriction Check
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isLinkedIn = tab?.url?.includes('linkedin.com') || tab?.url?.includes('linkedin.cn');

    if (!isLinkedIn) {
        wrongHostView.classList.remove('hidden');
        return; // Stop initialization
    }

    // User Onboarding Check (localStorage)
    const currentUsername = localStorage.getItem('linkedin_username');

    if (!currentUsername) {
        onboardingView.classList.remove('hidden');

        saveUsernameBtn.addEventListener('click', async () => {
            const username = onboardingUsernameInput.value.trim();
            if (!username) {
                alert('Please enter a username.');
                return;
            }

            // Basic validation
            if (username.length < 3) {
                alert('Please enter a valid username (min 3 chars).');
                return;
            }

            // Disable button and show loading state
            saveUsernameBtn.disabled = true;
            const originalText = saveUsernameBtn.innerHTML;
            saveUsernameBtn.innerHTML = '<span>Registering...</span>';

            try {
                // Call backend API to register user
                const result = await registerUser(username);

                if (result.success && result.user_id) {
                    // Store both username and user_id
                    localStorage.setItem('linkedin_username', username);
                    localStorage.setItem('linkedin_user_id', result.user_id);

                    // Reload to initialize with username
                    location.reload();
                } else {
                    // API failed or invalid response
                    alert(result.error || 'Registration failed. Please try again.');

                    // Reset button
                    saveUsernameBtn.disabled = false;
                    saveUsernameBtn.innerHTML = originalText;
                }
            } catch (error) {
                // Unexpected error
                alert('An unexpected error occurred. Please try again.');
                console.error('Registration error:', error);

                // Reset button
                saveUsernameBtn.disabled = false;
                saveUsernameBtn.innerHTML = originalText;
            }
        });
        return; // Stop initialization
    }

    const headerUsernameEl = document.getElementById('headerUsername');
    const changeUsernameBtn = document.getElementById('changeUsernameBtn');
    if (currentUsername && headerUsernameEl) {
        headerUsernameEl.textContent = `@${currentUsername}`;
        // Optional: Add a subtle style change to distinguish from version
        headerUsernameEl.style.fontWeight = '600';
        headerUsernameEl.style.color = 'var(--accent-secondary)';
        headerUsernameEl.title = 'Current Workspace';

        // Show the change username button
        if (changeUsernameBtn) {
            changeUsernameBtn.classList.remove('hidden');
        }
    }

    // Continue with normal initialization
    const historyCountEl = document.getElementById('historyCount');
    const statusBanner = document.getElementById('statusBanner');
    const statusIcon = document.getElementById('statusIcon');
    const statusText = document.getElementById('statusText');
    const statsPanel = document.getElementById('statsPanel');
    const totalFoundEl = document.getElementById('totalFound');
    const totalNewEl = document.getElementById('totalNew');

    // Modal Elements
    const viewDataBtn = document.getElementById('viewDataBtn');
    const dataModal = document.getElementById('dataModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const leadsTableBody = document.querySelector('#leadsTable tbody');
    const modalOverlay = document.querySelector('.modal-overlay');
    const downloadCsvBtn = document.getElementById('downloadCsvBtn');

    // Lead Details Modal Elements
    const leadDetailsModal = document.getElementById('leadDetailsModal');
    const closeDetailsBtn = document.getElementById('closeDetailsBtn');
    const aiWriteBtn = document.getElementById('aiWriteBtn');
    const sendEmailBtn = document.getElementById('sendEmailBtn');
    const emailDraft = document.getElementById('emailDraft');

    // Change Username Modal Elements
    const changeUsernameView = document.getElementById('changeUsernameView');
    const newUsernameInput = document.getElementById('newUsername');
    const confirmChangeUsernameBtn = document.getElementById('confirmChangeUsernameBtn');
    const cancelChangeUsernameBtn = document.getElementById('cancelChangeUsernameBtn');

    // Resume Upload Elements
    const uploadResumeBtn = document.getElementById('uploadResumeBtn');
    const resumeFileInput = document.getElementById('resumeFileInput');

    // Table Loader Element
    const tableLoader = document.getElementById('tableLoader');

    let currentSelectedLead = null; // Store currently selected lead

    // State
    let extractedEmails = new Set();
    let isExtracting = false;
    let currentLeads = []; // Store leads for preview
    let isLoadingData = false;

    // Sorting state
    let sortState = {
        column: null,
        direction: 'asc' // 'asc' or 'desc'
    };

    // Initialize - Fetch data from backend
    const userId = localStorage.getItem('linkedin_user_id');
    if (userId) {
        extractedEmails = await loadExtractedHistory();
        currentLeads = await loadExtractedLeadsFromBackend(); // Fetch from backend

        if (currentLeads.length > 0) {
            if (viewDataBtn) viewDataBtn.classList.remove('hidden');
            if (downloadCsvBtn) downloadCsvBtn.classList.remove('hidden');
        } else {
            if (downloadCsvBtn) downloadCsvBtn.classList.add('hidden');
        }
    }

    updateHistoryCount();

    // Load saved scroll count
    // Load saved scroll count (Scoped)
    const scrollKey = `user_${currentUsername}_scrollCount`;
    const savedScroll = await chrome.storage.local.get([scrollKey]);
    if (savedScroll[scrollKey]) {
        scrollCountInput.value = savedScroll[scrollKey];
    }

    // Event Listeners
    extractBtn.addEventListener('click', extractLeads);

    // Modal Listeners
    if (viewDataBtn) {
        viewDataBtn.addEventListener('click', () => openModal());
    }
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if (modalOverlay) modalOverlay.addEventListener('click', closeModal);
    if (downloadCsvBtn) downloadCsvBtn.addEventListener('click', () => downloadLeadsCsv(currentLeads));

    // Lead Details Modal Listeners
    if (closeDetailsBtn) closeDetailsBtn.addEventListener('click', closeLeadDetails);
    if (aiWriteBtn) aiWriteBtn.addEventListener('click', () => generateEmail(currentSelectedLead));
    if (sendEmailBtn) sendEmailBtn.addEventListener('click', () => sendEmail(currentSelectedLead));

    // Change Username Modal Listeners
    if (changeUsernameBtn) changeUsernameBtn.addEventListener('click', openChangeUsernameModal);
    if (cancelChangeUsernameBtn) cancelChangeUsernameBtn.addEventListener('click', closeChangeUsernameModal);
    if (confirmChangeUsernameBtn) confirmChangeUsernameBtn.addEventListener('click', handleUsernameChange);

    // Resume Upload Listeners
    if (uploadResumeBtn) uploadResumeBtn.addEventListener('click', () => resumeFileInput.click());
    if (resumeFileInput) resumeFileInput.addEventListener('change', handleResumeUpload);

    // Save scroll count on change (Scoped)
    scrollCountInput.addEventListener('change', async () => {
        const scrollKey = `user_${currentUsername}_scrollCount`;
        await chrome.storage.local.set({ [scrollKey]: parseInt(scrollCountInput.value) || 5 });
    });

    // ===================================
    // MAIN EXTRACTION FLOW
    // ===================================
    async function extractLeads() {
        if (isExtracting) return;

        const scrollCount = Math.max(0, parseInt(scrollCountInput.value) || 0);

        // UI Loading
        isExtracting = true;
        extractBtn.disabled = true;
        extractBtn.innerHTML = `<span>Extracting...</span>`;
        if (viewDataBtn) viewDataBtn.classList.add('hidden'); // Hide view button during new extraction
        showStatus('loading', '⟳ Scrolling & Extracting...');

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.url?.includes('linkedin.com')) {
                showStatus('error', '✗ Please open LinkedIn first');
                resetButton();
                return;
            }

            // Send Extraction Request
            // Note: We send empty arrays for filters to maintain content.js compatibility
            const response = await chrome.tabs.sendMessage(tab.id, {
                type: 'EXTRACT',
                keywords: [],
                mandatoryKeywords: [],
                targetTitles: [],
                excludeKeywords: [],
                scrollCount
            });

            if (!response || !response.success) {
                throw new Error(response?.error || 'Extraction failed');
            }

            const { result } = response;
            processLeads(result);

        } catch (error) {
            // Check for connection errors first
            const isConnectionError = error.message.includes('Could not establish connection') ||
                error.message.includes('Receiving end does not exist');

            if (isConnectionError) {
                console.warn('Connection lost. User needs to refresh page.');
                showStatus('error', 'Please REFRESH the LinkedIn page and try again.');
            } else {
                console.error('Extraction error:', error);
                showStatus('error', `Error: ${error.message}`);
            }
            resetButton();
        }
    }

    async function processLeads(data) {
        let leads = data.leads || [];
        const totalFound = leads.length;

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
            return false; // If nothing to dedup against, keep it (or maybe duplicate logic?) - keeping simplistic
        });

        const newCount = leads.length;
        const duplicates = beforeCount - newCount;

        // Update Stats & Global State
        updateStats(totalFound, newCount);

        // Append new leads to history
        currentLeads = [...currentLeads, ...leads];
        await saveExtractedLeadsToBackend(currentLeads);

        if (newCount === 0) {
            if (duplicates > 0) {
                showStatus('error', `✗ Found ${beforeCount} leads but all were duplicates.`);
            } else {
                showStatus('error', '✗ No new leads found.');
            }
            resetButton();
            return;
        }

        // Save history
        const newHistoryItems = leads.map(l => l.email || l.jobLink).filter(item => item);
        extractedEmails = await saveExtractedHistory(newHistoryItems);
        updateHistoryCount();

        // Enable "View Data" button and Download button
        if (viewDataBtn) viewDataBtn.classList.remove('hidden');
        if (downloadCsvBtn) downloadCsvBtn.classList.remove('hidden');

        showStatus('success', `✓ Extracted ${newCount} new leads!`);
        resetButton();

        // Auto-open modal to show results
        openModal();
    }

    // ===================================
    // DATA PREVIEW MODAL
    // ===================================
    async function openModal() {
        document.body.classList.add('expanded');
        dataModal.classList.remove('hidden');

        // Show loader and hide table
        if (tableLoader) tableLoader.classList.remove('hidden');
        if (leadsTableBody) leadsTableBody.style.display = 'none';

        // Fetch data from backend
        const userId = localStorage.getItem('linkedin_user_id');
        if (userId) {
            currentLeads = await loadExtractedLeadsFromBackend();
        }

        // Hide loader and show table
        if (tableLoader) tableLoader.classList.add('hidden');
        if (leadsTableBody) leadsTableBody.style.display = '';

        // Update download button visibility
        if (currentLeads.length > 0) {
            if (downloadCsvBtn) downloadCsvBtn.classList.remove('hidden');
        } else {
            if (downloadCsvBtn) downloadCsvBtn.classList.add('hidden');
        }

        renderTable(currentLeads || []);
    }

    function closeModal() {
        dataModal.classList.add('hidden');
        document.body.classList.remove('expanded');
    }

    // Sorting function
    function sortLeads(leads, column) {
        const direction = sortState.column === column && sortState.direction === 'asc' ? 'desc' : 'asc';
        sortState = { column, direction };

        const sorted = [...leads].sort((a, b) => {
            let valA = a[column] || '';
            let valB = b[column] || '';

            // Handle dates
            if (column === 'extractedAt') {
                valA = new Date(valA);
                valB = new Date(valB);
            } else {
                // Handle strings (case-insensitive)
                valA = String(valA).toLowerCase();
                valB = String(valB).toLowerCase();
            }

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });

        // Update header indicators
        updateSortIndicators();

        return sorted;
    }

    function updateSortIndicators() {
        // Remove all sort indicators
        const headers = document.querySelectorAll('#leadsTable thead th');
        headers.forEach(th => {
            th.classList.remove('sorted-asc', 'sorted-desc');
        });

        // Add indicator to current sorted column
        if (sortState.column) {
            const activeHeader = document.querySelector(`#leadsTable thead th[data-column="${sortState.column}"]`);
            if (activeHeader) {
                activeHeader.classList.add(sortState.direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
            }
        }
    }

    // Initialize table header sorting
    function initializeTableSorting() {
        const headers = document.querySelectorAll('#leadsTable thead th.sortable');
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const column = header.getAttribute('data-column');
                if (column) {
                    const sorted = sortLeads(currentLeads, column);
                    renderTable(sorted);
                }
            });
        });
    }

    // Call initialization after modal opens
    setTimeout(() => {
        initializeTableSorting();
    }, 100);

    function renderTable(leads) {
        leadsTableBody.innerHTML = '';

        if (!leads || leads.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="6" style="text-align: center; padding: 24px; color: #888;">No data extracted yet</td>`;
            leadsTableBody.appendChild(row);
            return;
        }

        leads.forEach(lead => {
            const row = document.createElement('tr');

            // 1. Name
            const nameCell = document.createElement('td');
            nameCell.textContent = lead.name || 'Unknown';
            row.appendChild(nameCell);

            // 2. Title
            const titleCell = document.createElement('td');
            titleCell.textContent = lead.title || 'N/A';
            row.appendChild(titleCell);

            // 3. Profile URL
            const profileCell = document.createElement('td');
            if (lead.profileUrl) {
                profileCell.innerHTML = `<a href="${lead.profileUrl}" target="_blank" class="lead-link">Link ↗</a>`;
            } else {
                profileCell.textContent = '-';
            }
            row.appendChild(profileCell);

            // 4. Email
            const emailCell = document.createElement('td');
            emailCell.textContent = lead.email || '-';
            row.appendChild(emailCell);

            // 5. Job Link
            const jobCell = document.createElement('td');
            if (lead.jobLink) {
                jobCell.innerHTML = `<a href="${lead.jobLink}" target="_blank" class="lead-link">Post ↗</a>`;
            } else {
                jobCell.textContent = '-';
            }
            row.appendChild(jobCell);

            // 6. Extracted At
            const timeCell = document.createElement('td');
            timeCell.textContent = formatDate(lead.extractedAt);
            row.appendChild(timeCell);

            // Make row clickable to open details
            row.addEventListener('click', (e) => {
                // Don't open details if clicking on a link
                if (e.target.tagName === 'A' || e.target.closest('a')) {
                    return;
                }
                openLeadDetails(lead);
            });

            leadsTableBody.appendChild(row);
        });
    }

    // ===================================
    // CSV EXPORT
    // ===================================
    function downloadLeadsCsv(leads) {
        if (!leads || leads.length === 0) return;

        // CSV Headers (Post Preview excluded)
        const headers = ['Name', 'Title', 'Profile URL', 'Email', 'Job Link', 'Extracted At'];

        // Helper to escape CSV fields
        const escapeCsv = (field) => {
            if (field === null || field === undefined) return '';
            const stringField = String(field);
            if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
                return `"${stringField.replace(/"/g, '""')}"`;
            }
            return stringField;
        };

        // Generate Rows (Post Preview excluded)
        const rows = leads.map(lead => [
            escapeCsv(lead.name),
            escapeCsv(lead.title),
            escapeCsv(lead.profileUrl),
            escapeCsv(lead.email),
            escapeCsv(lead.jobLink),
            escapeCsv(lead.extractedAt)
        ]);

        // Combine Content
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        // Create Blob and Download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);

        const dateStr = new Date().toISOString().split('T')[0];
        const timeStr = new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
        link.setAttribute('download', `jobseekers_leads_${dateStr}_${timeStr}.csv`);

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // ===================================
    // HISTORY & UTILS
    // ===================================
    async function loadExtractedHistory() {
        if (!currentUsername) return new Set();
        const key = `user_${currentUsername}_history`;
        const res = await chrome.storage.local.get([key]);
        return new Set(res[key] || []);
    }

    async function saveExtractedHistory(newEmails) {
        if (!currentUsername) return new Set();
        const key = `user_${currentUsername}_history`;
        const existing = await loadExtractedHistory();
        newEmails.forEach(e => existing.add(e.toLowerCase()));
        const arr = Array.from(existing).slice(-5000); // Keep last 5000
        await chrome.storage.local.set({ [key]: arr });
        return new Set(arr);
    }

    function updateHistoryCount() {
        const count = extractedEmails.size;
        historyCountEl.textContent = count > 0 ? `📊 ${count} leads in history` : '';
    }



    function showStatus(type, msg) {
        statusBanner.className = `status-banner ${type}`;
        statusIcon.textContent = type === 'success' ? '✓' : type === 'error' ? '✗' : '⟳';
        statusText.textContent = msg;
        if (type === 'success') setTimeout(() => statusBanner.classList.add('hidden'), 5000);
        else statusBanner.classList.remove('hidden');
    }

    function updateStats(found, newLeads) {
        statsPanel.classList.remove('hidden');
        totalFoundEl.textContent = found;
        totalNewEl.textContent = newLeads;
    }

    // Lead Persistence Helpers - Using Backend API
    async function loadExtractedLeadsFromBackend() {
        const userId = localStorage.getItem('linkedin_user_id');
        if (!userId) return [];

        try {
            const result = await fetchHRContacts(userId);
            if (result.success) {
                return result.data || [];
            } else {
                console.error('Failed to fetch HR contacts:', result.error);
                return [];
            }
        } catch (error) {
            console.error('Error fetching HR contacts:', error);
            return [];
        }
    }

    async function saveExtractedLeadsToBackend(leads) {
        const userId = localStorage.getItem('linkedin_user_id');
        if (!userId) {
            console.error('No user ID found');
            return;
        }

        try {
            const result = await saveHRContacts(userId, leads);
            if (!result.success) {
                console.error('Failed to save HR contacts:', result.error);
                showStatus('error', `✗ Failed to save data: ${result.error}`);
            }
        } catch (error) {
            console.error('Error saving HR contacts:', error);
            showStatus('error', '✗ Failed to save data');
        }
    }

    function resetButton() {
        isExtracting = false;
        extractBtn.disabled = false;
        extractBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Fetch Job Post</span>`;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Format date to "02 Feb, 2026 11:30AM" format
    function formatDate(dateString) {
        if (!dateString) return new Date().toLocaleString();

        const date = new Date(dateString);

        // Format: "02 Feb, 2026 11:30AM"
        const day = String(date.getDate()).padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[date.getMonth()];
        const year = date.getFullYear();

        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // 0 should be 12

        return `${day} ${month}, ${year} ${hours}:${minutes}${ampm}`;
    }

    // ===================================
    // LEAD DETAILS MODAL
    // ===================================
    function openLeadDetails(lead) {
        currentSelectedLead = lead;

        // Populate details
        document.getElementById('detailName').textContent = lead.name || 'Unknown';
        document.getElementById('detailTitle').textContent = lead.title || 'N/A';
        document.getElementById('detailEmail').textContent = lead.email || 'N/A';

        // Profile link
        const profileEl = document.getElementById('detailProfile');
        if (lead.profileUrl) {
            profileEl.innerHTML = `<a href="${lead.profileUrl}" target="_blank">View Profile ↗</a>`;
        } else {
            profileEl.textContent = 'N/A';
        }

        // Job link
        const jobEl = document.getElementById('detailJob');
        if (lead.jobLink) {
            jobEl.innerHTML = `<a href="${lead.jobLink}" target="_blank">View Post ↗</a>`;
        } else {
            jobEl.textContent = 'N/A';
        }

        document.getElementById('detailDate').textContent = formatDate(lead.extractedAt);
        document.getElementById('detailPost').textContent = lead.postPreview || 'No post description available';

        // Check if email is available
        const hasEmail = lead.email && lead.email.trim() !== '' && lead.email !== 'N/A' && lead.email !== '-';

        // Get email-related elements
        const emailSection = document.querySelector('.email-section');
        const sendEmailBtn = document.getElementById('sendEmailBtn');
        const noEmailGuidance = document.getElementById('noEmailGuidance');

        if (hasEmail) {
            // Show email sections, hide guidance
            if (emailSection) emailSection.style.display = '';
            if (sendEmailBtn) sendEmailBtn.style.display = '';
            if (noEmailGuidance) noEmailGuidance.style.display = 'none';
            // Clear email draft
            emailDraft.value = '';
        } else {
            // Hide email sections, show guidance
            if (emailSection) emailSection.style.display = 'none';
            if (sendEmailBtn) sendEmailBtn.style.display = 'none';
            if (noEmailGuidance) noEmailGuidance.style.display = '';
        }

        // Show modal
        leadDetailsModal.classList.remove('hidden');
    }

    function closeLeadDetails() {
        leadDetailsModal.classList.add('hidden');
        currentSelectedLead = null;
    }

    function generateEmail(lead) {
        if (!lead) return;

        const name = lead.name || 'Hiring Manager';
        const title = lead.title || 'your team';
        const postDescription = lead.postPreview || '';

        // Extract key requirements from post (simple keyword extraction)
        let requirements = '';
        if (postDescription) {
            const keywords = ['experience', 'skills', 'requirements', 'looking for', 'seeking'];
            const lines = postDescription.split('\n');
            const relevantLines = lines.filter(line =>
                keywords.some(keyword => line.toLowerCase().includes(keyword))
            );
            if (relevantLines.length > 0) {
                requirements = relevantLines.slice(0, 2).join(' ');
            }
        }

        // Generate professional email
        const email = `Dear ${name},

I hope this message finds you well. I came across your recent post regarding ${title}, and I am very interested in exploring this opportunity further.

${requirements ? `I noticed you mentioned: "${requirements.substring(0, 150)}..." I believe my background aligns well with these requirements.` : 'I believe my skills and experience would be a great fit for this role.'}

I would love to discuss how I can contribute to your team. I have attached my resume for your review and would be happy to schedule a call at your convenience.

Thank you for considering my application. I look forward to hearing from you.

Best regards,
[Your Name]
[Your Contact Information]`;

        emailDraft.value = email;
    }

    function sendEmail(lead) {
        if (!lead) return;

        const to = lead.email || '';
        const subject = encodeURIComponent(`Application for ${lead.title || 'Position'}`);
        const body = encodeURIComponent(emailDraft.value || 'Hello,\n\n');

        if (!to) {
            alert('No email address available for this lead.');
            return;
        }

        const mailtoLink = `mailto:${to}?subject=${subject}&body=${body}`;
        window.open(mailtoLink, '_blank');
    }

    // ===================================
    // CHANGE USERNAME FUNCTIONALITY
    // ===================================
    function openChangeUsernameModal() {
        newUsernameInput.value = '';
        changeUsernameView.classList.remove('hidden');
        newUsernameInput.focus();
    }

    function closeChangeUsernameModal() {
        changeUsernameView.classList.add('hidden');
        newUsernameInput.value = '';
    }

    async function handleUsernameChange() {
        const newUsername = newUsernameInput.value.trim();

        // Validation
        if (!newUsername) {
            alert('Please enter a username.');
            return;
        }

        if (newUsername.length < 3) {
            alert('Please enter a valid username (min 3 chars).');
            return;
        }

        if (newUsername === currentUsername) {
            alert('This is already your current username.');
            return;
        }

        // Disable button and show loading state
        confirmChangeUsernameBtn.disabled = true;
        const originalText = confirmChangeUsernameBtn.innerHTML;
        confirmChangeUsernameBtn.innerHTML = '<span>Updating...</span>';

        try {
            // Call backend API to register new username
            const result = await registerUser(newUsername);

            if (result.success && result.user_id) {
                // Get current user's data before switching
                const oldUsername = currentUsername;
                const oldLeadsKey = `user_${oldUsername}_leads`;
                const oldHistoryKey = `user_${oldUsername}_history`;
                const oldScrollKey = `user_${oldUsername}_scrollCount`;

                // Retrieve all old data
                const oldData = await chrome.storage.local.get([oldLeadsKey, oldHistoryKey, oldScrollKey]);

                // Update localStorage with new username
                localStorage.setItem('linkedin_username', newUsername);
                localStorage.setItem('linkedin_user_id', result.user_id);

                // Migrate data to new username keys
                const newLeadsKey = `user_${newUsername}_leads`;
                const newHistoryKey = `user_${newUsername}_history`;
                const newScrollKey = `user_${newUsername}_scrollCount`;

                const migratedData = {};
                if (oldData[oldLeadsKey]) migratedData[newLeadsKey] = oldData[oldLeadsKey];
                if (oldData[oldHistoryKey]) migratedData[newHistoryKey] = oldData[oldHistoryKey];
                if (oldData[oldScrollKey]) migratedData[newScrollKey] = oldData[oldScrollKey];

                // Save migrated data
                if (Object.keys(migratedData).length > 0) {
                    await chrome.storage.local.set(migratedData);
                }

                // Clean up old data
                await chrome.storage.local.remove([oldLeadsKey, oldHistoryKey, oldScrollKey]);

                // Reload to initialize with new username
                location.reload();
            } else {
                // API failed or invalid response
                alert(result.error || 'Username update failed. Please try again.');

                // Reset button
                confirmChangeUsernameBtn.disabled = false;
                confirmChangeUsernameBtn.innerHTML = originalText;
            }
        } catch (error) {
            // Unexpected error
            alert('An unexpected error occurred. Please try again.');
            console.error('Username change error:', error);

            // Reset button
            confirmChangeUsernameBtn.disabled = false;
            confirmChangeUsernameBtn.innerHTML = originalText;
        }
    }

    // ===================================
    // RESUME UPLOAD FUNCTIONALITY
    // ===================================
    async function handleResumeUpload(event) {
        const file = event.target.files[0];

        // Reset file input for future uploads
        event.target.value = '';

        // Validate file selection
        if (!file) {
            return;
        }

        // Validate file type
        if (file.type !== 'application/pdf') {
            alert('Please select a PDF file.');
            return;
        }

        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB in bytes
        if (file.size > maxSize) {
            alert('File size must be less than 10MB.');
            return;
        }

        // Get user_id from localStorage
        const userId = localStorage.getItem('linkedin_user_id');
        if (!userId) {
            alert('User ID not found. Please log in again.');
            return;
        }

        // Disable button and show loading state
        uploadResumeBtn.disabled = true;
        const originalText = uploadResumeBtn.innerHTML;
        uploadResumeBtn.innerHTML = '<span>Uploading...</span>';

        try {
            // Call API to upload resume
            const result = await uploadResume(userId, file);

            if (result.success && result.data) {
                // Success response
                const { filename, extracted_length } = result.data;
                showStatus('success', `✓ Resume uploaded successfully! (${filename}, ${extracted_length} chars extracted)`);
            } else {
                // API failed or invalid response
                showStatus('error', `✗ ${result.error || 'Upload failed. Please try again.'}`);
            }
        } catch (error) {
            // Unexpected error
            showStatus('error', '✗ An unexpected error occurred. Please try again.');
            console.error('Resume upload error:', error);
        } finally {
            // Reset button
            uploadResumeBtn.disabled = false;
            uploadResumeBtn.innerHTML = originalText;
        }
    }
});

