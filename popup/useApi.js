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
