/**
 * Error Reporter Service
 * Captures runtime errors, queues them client-side, and lets the user
 * report them to GitHub via pre-filled issue URLs.
 *
 * No authentication or backend required — opens GitHub's /issues/new
 * endpoint with query parameters for title, body, and labels.
 */

import { CONFIG, ErrorTypes } from '../utils/constants.js';

const REPO_URL = 'https://github.com/chrispt/Birding-Hotspots-Tool';
const MAX_QUEUE_SIZE = 20;
const MAX_URL_BODY_CHARS = 6000;
const MAX_STACK_LINES = 10;
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Normalize an error message for fingerprinting by stripping variable data
 * (timestamps, coordinates, UUIDs, numbers after colons like port/status codes).
 */
function normalizeMessage(msg) {
    if (!msg) return '';
    return msg
        .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\dZ]*/g, '<timestamp>')
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
        .replace(/-?\d+\.\d+/g, '<num>')
        .substring(0, 200);
}

/**
 * Simple string hash for fingerprinting (FNV-1a 32-bit).
 */
function hashString(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(36);
}

/**
 * Truncate a stack trace to a maximum number of lines.
 */
function truncateStack(stack, maxLines = MAX_STACK_LINES) {
    if (!stack) return '';
    const lines = stack.split('\n');
    if (lines.length <= maxLines) return stack;
    return lines.slice(0, maxLines).join('\n') + `\n    ... (${lines.length - maxLines} more frames)`;
}

/**
 * Collect environment metadata from the browser.
 */
function collectMetadata() {
    const ua = navigator.userAgent || '';
    // Extract browser name and version
    let browser = 'Unknown';
    const chromeMatch = ua.match(/Chrome\/([\d.]+)/);
    const firefoxMatch = ua.match(/Firefox\/([\d.]+)/);
    const safariMatch = ua.match(/Version\/([\d.]+).*Safari/);
    const edgeMatch = ua.match(/Edg\/([\d.]+)/);
    if (edgeMatch) browser = `Edge ${edgeMatch[1]}`;
    else if (chromeMatch) browser = `Chrome ${chromeMatch[1]}`;
    else if (firefoxMatch) browser = `Firefox ${firefoxMatch[1]}`;
    else if (safariMatch) browser = `Safari ${safariMatch[1]}`;

    // Extract OS
    let os = 'Unknown';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac OS')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    return {
        browser,
        os,
        screenSize: `${window.screen?.width || '?'}x${window.screen?.height || '?'}`,
        theme: document.documentElement.getAttribute('data-theme') || 'light',
        url: window.location.href,
        timestamp: new Date().toISOString()
    };
}

class ErrorReporter {
    constructor() {
        this._queue = [];
        this._listeners = [];
        this._initialized = false;
    }

    /**
     * Initialize global error handlers.
     * Call once at app startup, before DOMContentLoaded.
     */
    init() {
        if (this._initialized) return;
        this._initialized = true;

        this._restore();

        window.onerror = (message, source, lineno, colno, error) => {
            this.capture({
                type: ErrorTypes.UNCAUGHT_EXCEPTION,
                message: message || 'Unknown error',
                stack: error?.stack || '',
                source: source || '',
                line: lineno || 0
            });
        };

        window.onunhandledrejection = (event) => {
            const reason = event.reason;
            const message = reason?.message || String(reason) || 'Unhandled promise rejection';
            // Skip AbortError — user-cancelled searches
            if (reason?.name === 'AbortError') return;

            this.capture({
                type: ErrorTypes.UNHANDLED_REJECTION,
                message,
                stack: reason?.stack || ''
            });
        };
    }

    /**
     * Capture an error into the queue.
     * Deduplicates by fingerprint — same error increments count.
     */
    capture({ type, message, stack, source, line, context }) {
        if (!message) return;

        // Skip AbortError from any source
        if (message.includes('AbortError') || message.includes('The user aborted')) return;

        const fingerprint = this._fingerprint(type, message, source, line);

        // Check for existing entry with same fingerprint
        const existing = this._queue.find(e => e.fingerprint === fingerprint);
        if (existing) {
            existing.count++;
            existing.lastSeen = new Date().toISOString();
            this._persist();
            this._notifyListeners();
            return;
        }

        // Add new entry
        const entry = {
            type: type || 'unknown',
            message: String(message).substring(0, 500),
            stack: stack ? truncateStack(String(stack)) : '',
            source: source || '',
            line: line || 0,
            context: context || {},
            fingerprint,
            count: 1,
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString()
        };

        this._queue.push(entry);

        // Cap queue size — drop oldest entries
        while (this._queue.length > MAX_QUEUE_SIZE) {
            this._queue.shift();
        }

        this._persist();
        this._notifyListeners();
    }

    /**
     * Generate a fingerprint for deduplication.
     */
    _fingerprint(type, message, source, line) {
        const normalized = normalizeMessage(message);
        const key = `${type || ''}:${normalized}:${source || ''}:${line || 0}`;
        return hashString(key);
    }

    /**
     * Build a GitHub new-issue URL with pre-filled title, body, and labels.
     * @param {Object} error - A single error entry from the queue
     * @returns {string} GitHub URL
     */
    buildIssueUrl(error) {
        const meta = collectMetadata();
        const title = `[Auto] ${error.type}: ${error.message.substring(0, 80)}`;

        let body = `## Error\n`;
        body += `- **Type:** \`${error.type}\`\n`;
        body += `- **Message:** ${error.message}\n`;
        body += `- **Occurrences:** ${error.count}\n`;
        if (error.source) body += `- **Source:** \`${error.source}:${error.line}\`\n`;
        body += `- **First seen:** ${error.firstSeen}\n`;
        if (error.count > 1) body += `- **Last seen:** ${error.lastSeen}\n`;

        if (error.stack) {
            body += `\n## Stack trace\n\`\`\`\n${error.stack}\n\`\`\`\n`;
        }

        body += `\n## Environment\n`;
        body += `- **Browser:** ${meta.browser} / ${meta.os}\n`;
        body += `- **Screen:** ${meta.screenSize}\n`;
        body += `- **Theme:** ${meta.theme}\n`;
        body += `- **URL:** ${meta.url}\n`;
        body += `- **Reported:** ${meta.timestamp}\n`;

        // Truncate body if needed to stay within URL limits
        if (body.length > MAX_URL_BODY_CHARS) {
            body = body.substring(0, MAX_URL_BODY_CHARS) + '\n\n*(truncated)*';
        }

        const params = new URLSearchParams({
            title,
            body,
            labels: 'bug,auto-reported'
        });

        return `${REPO_URL}/issues/new?${params.toString()}`;
    }

    /**
     * Open GitHub issue creation in a new tab.
     */
    reportToGitHub(error) {
        const url = this.buildIssueUrl(error);
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    /**
     * Get a copy of the current error queue.
     */
    getQueue() {
        return [...this._queue];
    }

    /**
     * Get the number of errors in the queue.
     */
    getCount() {
        return this._queue.length;
    }

    /**
     * Clear the entire queue.
     */
    clear() {
        this._queue = [];
        this._persist();
        this._notifyListeners();
    }

    /**
     * Remove a single error from the queue by fingerprint.
     */
    remove(fingerprint) {
        this._queue = this._queue.filter(e => e.fingerprint !== fingerprint);
        this._persist();
        this._notifyListeners();
    }

    /**
     * Register a callback for queue changes.
     * @param {Function} callback - Called with (queueLength)
     */
    onQueueChange(callback) {
        if (typeof callback === 'function') {
            this._listeners.push(callback);
        }
    }

    /**
     * Notify all listeners of a queue change.
     */
    _notifyListeners() {
        const count = this._queue.length;
        this._listeners.forEach(fn => {
            try { fn(count); } catch (e) { /* ignore listener errors */ }
        });
    }

    /**
     * Persist queue to localStorage.
     */
    _persist() {
        try {
            localStorage.setItem(
                CONFIG.STORAGE_KEYS.ERROR_QUEUE,
                JSON.stringify(this._queue)
            );
        } catch (e) {
            // localStorage full or unavailable — silently ignore
        }
    }

    /**
     * Restore queue from localStorage, expiring old entries.
     */
    _restore() {
        try {
            const stored = localStorage.getItem(CONFIG.STORAGE_KEYS.ERROR_QUEUE);
            if (!stored) return;

            const parsed = JSON.parse(stored);
            if (!Array.isArray(parsed)) return;

            const now = Date.now();
            // Filter out entries older than 24 hours
            this._queue = parsed.filter(entry => {
                const lastSeen = new Date(entry.lastSeen).getTime();
                return (now - lastSeen) < EXPIRY_MS;
            });

            // Re-persist if we dropped expired entries
            if (this._queue.length !== parsed.length) {
                this._persist();
            }
        } catch (e) {
            // Corrupt data — start fresh
            this._queue = [];
        }
    }
}

// Export singleton
export const errorReporter = new ErrorReporter();
