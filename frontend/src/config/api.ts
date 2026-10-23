/**
 * Backend base URL.
 *
 * Do NOT hard-code http://localhost:8000: on a phone "localhost" is the phone itself.
 * Default = same host the page was opened from, port 8000. Override with VITE_API_URL.
 */
const fromEnv = import.meta.env.VITE_API_URL as string | undefined;

export const API_BASE: string =
  (fromEnv && fromEnv.replace(/\/$/, '')) ||
  `${window.location.protocol}//${window.location.hostname}:8000`;