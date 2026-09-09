import { assert } from '../run-tests.js';

// Mock browser globals before importing the module
const storage = {};
global.localStorage = {
    getItem: (k) => storage[k] ?? null,
    setItem: (k, v) => { storage[k] = v; },
    removeItem: (k) => { delete storage[k]; }
};
global.window = global;
Object.defineProperty(global, 'navigator', {
    value: { userAgent: 'TestAgent/1.0' },
    writable: true,
    configurable: true
});
global.document = { documentElement: { getAttribute: () => 'light' } };
global.location = { href: 'http://localhost:3000/' };
Object.defineProperty(global, 'screen', {
    value: { width: 1920, height: 1080 },
    writable: true,
    configurable: true
});

// Dynamic import after globals are set up
const { errorReporter } = await import('../../js/services/error-reporter.js');

/** Reset state between tests */
function resetReporter() {
    if (errorReporter._autoReportTimer) {
        clearTimeout(errorReporter._autoReportTimer);
    }
    errorReporter._queue = [];
    errorReporter._listeners = [];
    errorReporter._initialized = false;
    errorReporter._autoReportTimer = null;
    errorReporter._autoReportsThisSession = 0;
    errorReporter._reportedFingerprints = new Set();
    delete storage['birding_error_queue'];
}

export async function testCaptureNeverAutomaticallyTransmitsErrors() {
    resetReporter();
    const originalSetTimeout = global.setTimeout;
    const originalFetch = global.fetch;
    let scheduledCallback = null;
    let fetchCalls = 0;

    global.setTimeout = (callback) => {
        scheduledCallback = callback;
        return 1;
    };
    global.fetch = async () => {
        fetchCalls++;
        return { ok: true, json: async () => ({}) };
    };

    try {
        errorReporter.capture({
            type: 'app_error',
            message: 'Failed near 40.7128,-74.0060',
            stack: 'Error: failed\n    at private-route.js:10:2',
            context: { address: '123 Private Street' }
        });

        if (scheduledCallback) scheduledCallback();

        assert(fetchCalls === 0, 'Capturing an error must not schedule an automatic network report');
    } finally {
        global.setTimeout = originalSetTimeout;
        global.fetch = originalFetch;
        resetReporter();
    }
}

export async function testManualIssueBodyContainsOnlyInertUserControlledMarkdown() {
    resetReporter();
    const originalHref = global.location.href;
    global.location.href = 'https://birdinghotspotstool.com/?start=123%20Private%20Street';

    try {
        errorReporter.capture({
            type: 'app_error @maintainers',
            message: '[open me](javascript:alert(1)) @everyone',
            stack: 'first frame\n```\n@security [unsafe](javascript:alert(2))',
            source: '` [source](javascript:alert(3)) @owners',
            line: 42
        });

        const issueUrl = new URL(errorReporter.buildIssueUrl(errorReporter.getQueue()[0]));
        const title = issueUrl.searchParams.get('title');
        const body = issueUrl.searchParams.get('body');

        assert(!title.includes('@maintainers'), 'Issue titles must not create GitHub mentions');
        assert(!body.includes('@everyone'), 'Messages must not create GitHub mentions');
        assert(!body.includes('@security'), 'Stack traces must not create GitHub mentions');
        assert(!body.includes('@owners'), 'Sources must not create GitHub mentions');
        assert(!body.includes('[open me](javascript:'), 'Messages must not create unsafe Markdown links');
        assert(!body.includes('[unsafe](javascript:'), 'Stack traces must not create unsafe Markdown links');
        assert(!body.includes('[source](javascript:'), 'Sources must not create unsafe Markdown links');
        assert(body.includes('````\nfirst frame\n```'), 'A stack containing triple backticks must use a longer code fence');
    } finally {
        global.location.href = originalHref;
        resetReporter();
    }
}

export async function testManualIssueBodyContainsOnlyInertEnvironmentMetadata() {
    resetReporter();
    const originalDocument = global.document;
    const originalHref = global.location.href;
    global.document = {
        documentElement: {
            getAttribute: () => 'dark @maintainers [unsafe](javascript:alert(1))'
        }
    };
    global.location.href = 'https://example.test/@owners/[open](javascript:alert(2))';

    try {
        errorReporter.capture({ type: 'app_error', message: 'Test error' });
        const issueUrl = new URL(errorReporter.buildIssueUrl(errorReporter.getQueue()[0]));
        const body = issueUrl.searchParams.get('body');

        assert(!body.includes('@maintainers'), 'Theme metadata must not create GitHub mentions');
        assert(!body.includes('@owners'), 'URL metadata must not create GitHub mentions');
        assert(!body.includes('[unsafe](javascript:'), 'Theme metadata must not create unsafe Markdown links');
        assert(!body.includes('[open](javascript:'), 'URL metadata must not create unsafe Markdown links');
    } finally {
        global.document = originalDocument;
        global.location.href = originalHref;
        resetReporter();
    }
}

export async function testRestoredCountCannotInjectActiveMarkdown() {
    resetReporter();
    storage['birding_error_queue'] = JSON.stringify([{
        type: 'app_error',
        message: 'Restored error',
        stack: '',
        source: '',
        line: 0,
        context: {},
        fingerprint: 'restored-error',
        count: '@maintainers [unsafe](javascript:alert(1))',
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString()
    }]);

    errorReporter._restore();
    const issueUrl = new URL(errorReporter.buildIssueUrl(errorReporter.getQueue()[0]));
    const body = issueUrl.searchParams.get('body');

    assert(!body.includes('@maintainers'), 'A restored count must not create GitHub mentions');
    assert(!body.includes('[unsafe](javascript:'), 'A restored count must not create unsafe Markdown links');
}

export async function testCaptureAddsToQueue() {
    resetReporter();
    errorReporter.capture({ type: 'app_error', message: 'Test error' });
    assert(errorReporter.getCount() === 1, 'Queue should have 1 entry');
    assert(errorReporter.getQueue()[0].message === 'Test error', 'Message should match');
    assert(errorReporter.getQueue()[0].count === 1, 'Count should be 1');
}

export async function testDeduplicationIncreasesCount() {
    resetReporter();
    errorReporter.capture({ type: 'app_error', message: 'Same error', source: 'test.js', line: 10 });
    errorReporter.capture({ type: 'app_error', message: 'Same error', source: 'test.js', line: 10 });
    errorReporter.capture({ type: 'app_error', message: 'Same error', source: 'test.js', line: 10 });
    assert(errorReporter.getCount() === 1, 'Should deduplicate to 1 entry');
    assert(errorReporter.getQueue()[0].count === 3, 'Count should be 3');
}

export async function testDifferentErrorsAreNotDeduplicated() {
    resetReporter();
    errorReporter.capture({ type: 'app_error', message: 'Error A' });
    errorReporter.capture({ type: 'app_error', message: 'Error B' });
    assert(errorReporter.getCount() === 2, 'Different errors should create separate entries');
}

export async function testQueueCappedAtMaxSize() {
    resetReporter();
    for (let i = 0; i < 25; i++) {
        errorReporter.capture({ type: 'app_error', message: `Error ${i}` });
    }
    assert(errorReporter.getCount() === 20, 'Queue should be capped at 20');
    // Oldest entries should be dropped
    assert(errorReporter.getQueue()[0].message === 'Error 5', 'Oldest 5 entries should be dropped');
}

export async function testClearEmptiesQueue() {
    resetReporter();
    errorReporter.capture({ type: 'app_error', message: 'Will be cleared' });
    assert(errorReporter.getCount() === 1, 'Should have 1 entry before clear');
    errorReporter.clear();
    assert(errorReporter.getCount() === 0, 'Should be empty after clear');
}

export async function testRemoveByFingerprint() {
    resetReporter();
    errorReporter.capture({ type: 'app_error', message: 'Keep me' });
    errorReporter.capture({ type: 'app_error', message: 'Remove me' });
    assert(errorReporter.getCount() === 2, 'Should have 2 entries');
    const fp = errorReporter.getQueue().find(e => e.message === 'Remove me').fingerprint;
    errorReporter.remove(fp);
    assert(errorReporter.getCount() === 1, 'Should have 1 entry after remove');
    assert(errorReporter.getQueue()[0].message === 'Keep me', 'Remaining entry should be correct');
}

export async function testOnQueueChangeNotifiesListeners() {
    resetReporter();
    let notifiedCount = -1;
    errorReporter.onQueueChange((count) => { notifiedCount = count; });
    errorReporter.capture({ type: 'app_error', message: 'Trigger notify' });
    assert(notifiedCount === 1, 'Listener should be notified with count 1');
}

export async function testPersistAndRestore() {
    resetReporter();
    errorReporter.capture({ type: 'app_error', message: 'Persisted error' });
    assert(storage['birding_error_queue'], 'Should persist to localStorage');

    // Simulate fresh load
    const saved = storage['birding_error_queue'];
    errorReporter._queue = [];
    storage['birding_error_queue'] = saved;
    errorReporter._restore();
    assert(errorReporter.getCount() === 1, 'Should restore from localStorage');
    assert(errorReporter.getQueue()[0].message === 'Persisted error', 'Restored message should match');
}

export async function testExpiredEntriesDroppedOnRestore() {
    resetReporter();
    // Manually write an expired entry
    const old = [{
        type: 'app_error',
        message: 'Old error',
        fingerprint: 'old123',
        count: 1,
        firstSeen: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
        lastSeen: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    }];
    storage['birding_error_queue'] = JSON.stringify(old);
    errorReporter._restore();
    assert(errorReporter.getCount() === 0, 'Expired entries should be dropped');
}

export async function testBuildIssueUrlStaysUnderLimit() {
    resetReporter();
    // Create an error with a very long stack trace
    const longStack = Array.from({ length: 50 }, (_, i) => `    at func${i} (file.js:${i}:0)`).join('\n');
    errorReporter.capture({
        type: 'app_error',
        message: 'A'.repeat(500),
        stack: longStack
    });
    const url = errorReporter.buildIssueUrl(errorReporter.getQueue()[0]);
    assert(typeof url === 'string', 'URL should be a string');
    assert(url.startsWith('https://github.com/chrispt/Birding-Hotspots-Tool/issues/new'), 'URL should point to GitHub');
    // The raw body parameter should be within limits
    // URL-encoded body will be larger, but the raw body we control
    assert(url.length < 20000, 'URL should be within reasonable limits');
}

export async function testAbortErrorsAreIgnored() {
    resetReporter();
    errorReporter.capture({ type: 'app_error', message: 'AbortError: The user aborted a request' });
    assert(errorReporter.getCount() === 0, 'AbortError should be ignored');
}

export async function testEmptyMessageIsIgnored() {
    resetReporter();
    errorReporter.capture({ type: 'app_error', message: '' });
    errorReporter.capture({ type: 'app_error' });
    assert(errorReporter.getCount() === 0, 'Empty messages should be ignored');
}
