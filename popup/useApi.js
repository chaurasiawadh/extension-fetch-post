// API Utility Hook
// Reusable function for making API calls with proper error handling

import { API_BASE_URL } from './config.js';

/**
 * Generic API call function
 * @param {string} endpoint - API endpoint (e.g., '/register')
 * @param {Object} options - Fetch options (method, body, headers, etc.)
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function callApi(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    const defaultOptions = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
        ...options,
    };

    try {
        const response = await fetch(url, defaultOptions);

        // Check if response is ok (status 200-299)
        if (!response.ok) {
            let errorMessage = response.statusText;

            try {
                // Try to parse as JSON to get structured error
                const errorData = await response.json();
                // Use the message field if available
                if (errorData && errorData.message) {
                    errorMessage = errorData.message;
                } else if (typeof errorData === 'string') {
                    errorMessage = errorData;
                }
            } catch (parseError) {
                // If JSON parsing fails, try to read as text
                try {
                    const errorText = await response.text();
                    if (errorText) errorMessage = errorText;
                } catch (textError) {
                    // Keep default statusText
                }
            }

            return {
                success: false,
                error: errorMessage,
                statusCode: response.status
            };
        }

        // Parse JSON response
        const data = await response.json();

        return {
            success: true,
            data: data
        };

    } catch (error) {
        // Handle network errors, parsing errors, etc.
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            return {
                success: false,
                error: 'Network error: Unable to connect to server. Please check your internet connection.'
            };
        }

        return {
            success: false,
            error: `Request failed: ${error.message}`
        };
    }
}

/**
 * Register user with backend
 * @param {string} username - LinkedIn username
 * @returns {Promise<{success: boolean, user_id?: string, error?: string}>}
 */
export async function registerUser(username) {
    const result = await callApi('/register', {
        method: 'POST',
        body: JSON.stringify({ username })
    });

    if (!result.success) {
        return result;
    }

    // Validate that user_id exists in response
    if (!result.data || !result.data.user_id) {
        return {
            success: false,
            error: 'Invalid response: user_id not found in server response'
        };
    }

    return {
        success: true,
        user_id: result.data.user_id
    };
}

/**
 * Upload resume for a user
 * @param {string} userId - User ID from localStorage
 * @param {File} file - PDF resume file
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function uploadResume(userId, file) {
    const url = `${API_BASE_URL}/upload-resume`;

    // Create FormData for file upload
    const formData = new FormData();
    formData.append('user_id', userId);
    formData.append('file', file);

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData
            // Don't set Content-Type header - browser will set it with boundary for multipart/form-data
        });

        // Check if response is ok (status 200-299)
        if (!response.ok) {
            let errorMessage = response.statusText;

            try {
                const errorData = await response.json();
                if (errorData && errorData.message) {
                    errorMessage = errorData.message;
                } else if (typeof errorData === 'string') {
                    errorMessage = errorData;
                }
            } catch (parseError) {
                try {
                    const errorText = await response.text();
                    if (errorText) errorMessage = errorText;
                } catch (textError) {
                    // Keep default statusText
                }
            }

            return {
                success: false,
                error: errorMessage,
                statusCode: response.status
            };
        }

        // Parse JSON response
        const data = await response.json();

        // Validate response using message field
        if (data.message !== 'success') {
            return {
                success: false,
                error: 'Upload failed: Invalid server response'
            };
        }

        return {
            success: true,
            data: data
        };

    } catch (error) {
        // Handle network errors
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            return {
                success: false,
                error: 'Network error: Unable to connect to server. Please check your internet connection.'
            };
        }

        return {
            success: false,
            error: `Request failed: ${error.message}`
        };
    }
}

/**
 * Save HR contacts to backend
 * @param {string} userId - User ID from localStorage
 * @param {Array} hrContacts - Array of HR contact objects
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function saveHRContacts(userId, hrContacts) {
    const result = await callApi('/hr-contacts', {
        method: 'POST',
        body: JSON.stringify({
            user_id: userId,
            hr_contacts: hrContacts
        })
    });

    if (!result.success) {
        return result;
    }

    // Validate response
    if (!result.data || result.data.message !== 'success') {
        return {
            success: false,
            error: 'Invalid response: Could not save HR contacts'
        };
    }

    return {
        success: true,
        data: result.data
    };
}

/**
 * Fetch HR contacts from backend
 * @param {string} userId - User ID from localStorage
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export async function fetchHRContacts(userId) {
    const result = await callApi(`/hr-contacts?user_id=${userId}&limit=100`, {
        method: 'GET'
    });

    if (!result.success) {
        return result;
    }

    // Validate response data exists
    if (!result.data) {
        return {
            success: true,
            data: []
        };
    }

    // Return the contacts array from response (API returns 'contacts', not 'hr_contacts')
    const contacts = result.data.contacts;

    // Ensure we return an array even if contacts is undefined, null, or not an array
    return {
        success: true,
        data: Array.isArray(contacts) ? contacts : []
    };
}
