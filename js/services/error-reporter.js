/**
 * Error Reporter Service
 * Captures runtime errors, queues them client-side, and automatically
 * reports them to GitHub via a serverless API endpoint (/api/report-error).
 *
 * Auto-reporting is debounced: after the last error, waits 5 seconds of
 * quiet before sending. This batches cascading failures into fewer API calls.
 * Falls back to manual reporting via pre-filled GitHub issue URLs if the
 * API is unavailable.
 */

import { CONFIG, ErrorTypes } from '../utils/constants.js';

const REPO_URL = 'https://github.com/chrispt/Birding-Hotspots-Tool';
const API_ENDPOINT = '/api/report-error';
const MAX_QUEUE_SIZE = 20;
const MAX_URL_BODY_CHARS = 6000;
const MAX_STACK_LINES = 10;
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const AUTO_REPORT_DELAY_MS = 5000; // Debounce: wait 5s of quiet before auto-reporting
const MAX_AUTO_REPORTS_PER_SESSION = 10; // Prevent runaway reporting

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
        this._autoReportTimer = null;
        this._autoReportsThisSession = 0;
        this._reportedFingerprints = new Set(); // Track what's already been sent to API
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
            this._scheduleAutoReport();
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
        this._scheduleAutoReport();
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
     * Schedule an auto-report after a debounce period.
     * Resets the timer on each new error so cascading failures batch together.
     */
    _scheduleAutoReport() {
        if (this._autoReportTimer) {
            clearTimeout(this._autoReportTimer);
        }

        // Don't auto-report if we've hit the session limit
        if (this._autoReportsThisSession >= MAX_AUTO_REPORTS_PER_SESSION) return;

        this._autoReportTimer = setTimeout(() => {
            this._autoReportTimer = null;
            this._autoReport();
        }, AUTO_REPORT_DELAY_MS);
    }

    /**
     * Automatically report unreported errors to the serverless API.
     * Each error is sent individually so the server can deduplicate by title.
     */
    async _autoReport() {
        const unreported = this._queue.filter(e => !this._reportedFingerprints.has(e.fingerprint));
        if (unreported.length === 0) return;

        const metadata = collectMetadata();

        for (const error of unreported) {
            if (this._autoReportsThisSession >= MAX_AUTO_REPORTS_PER_SESSION) break;

            try {
                const response = await fetch(API_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: error.type,
                        message: error.message,
                        stack: error.stack,
                        source: error.source,
                        line: error.line,
                        count: error.count,
                        metadata
                    })
                });

                if (response.ok) {
                    this._reportedFingerprints.add(error.fingerprint);
                    this._autoReportsThisSession++;
                    const result = await response.json();
                    console.info(`[ErrorReporter] Auto-reported to GitHub: ${result.action} #${result.issueNumber}`);
                } else {
                    // API not available (e.g., no GITHUB_TOKEN configured, or running locally)
                    // Silently fall back to manual reporting via badge
                    console.info('[ErrorReporter] Auto-report API unavailable, manual reporting available via badge');
                    break; // Don't retry other errors if the API is down
                }
            } catch (e) {
                // Network error or running on a non-Vercel host — fall back silently
                console.info('[ErrorReporter] Auto-report failed (likely running locally), manual reporting available');
                break;
            }
        }
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
