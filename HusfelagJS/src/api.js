/**
 * Authenticated fetch wrapper.
 * Reads the JWT from localStorage and adds Authorization: Bearer <token>
 * on every request.  Drop-in replacement for fetch() across all controllers.
 *
 * Usage:
 *   import { apiFetch } from '../api';
 *   const resp = await apiFetch(`${API_URL}/Resource/${user.id}`);
 *   const resp = await apiFetch(`${API_URL}/Resource`, { method: 'POST', body: JSON.stringify(data) });
 */
export function apiFetch(url, options = {}) {
    const saved = localStorage.getItem('user');
    const token = saved ? JSON.parse(saved).token : null;

    const headers = { ...(options.headers || {}) };

    // Only inject localStorage token if the caller didn't supply one explicitly
    if (token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // Don't set Content-Type for FormData — browser sets it with the correct boundary.
    if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    return fetch(url, { ...options, headers });
}
