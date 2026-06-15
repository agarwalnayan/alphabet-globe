// In dev, leave empty so CRA's package.json proxy handles /api and /models.
// In production, point at the deployed backend (override via REACT_APP_API_URL).
const API_URL = process.env.REACT_APP_API_URL || (
  process.env.NODE_ENV === 'production' ? 'https://alphabet-globe.onrender.com' : ''
);

export function apiUrl(path) {
  return `${API_URL}${path}`;
}

/** Upgrade http model URLs and resolve relative paths for cross-origin deploys. */
export function normalizeModelUrl(url) {
  if (!url) return url;
  if (url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  if (url.startsWith('/')) {
    return `${API_URL}${url}`;
  }
  return url;
}

export { API_URL };
