import { assert } from '../run-tests.js';
import handler from '../../api/report-error.js';

function createResponse() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
}

export async function testPublicEndpointCannotCreateGitHubIssues() {
    const originalFetch = global.fetch;
    const originalToken = process.env.GITHUB_TOKEN;
    let fetchCalls = 0;
    global.fetch = async () => {
        fetchCalls++;
        return {
            ok: true,
            json: async () => ({ items: [], number: 123, html_url: 'https://github.com/example' }),
            text: async () => ''
        };
    };
    process.env.GITHUB_TOKEN = 'test-token';

    try {
        const req = {
            method: 'POST',
            headers: {
                origin: 'https://birdinghotspotstool.com',
                'x-forwarded-for': '203.0.113.10'
            },
            body: {
                type: 'app_error',
                message: 'Create an issue',
                stack: '```\n@everyone\n```',
                metadata: { url: 'javascript:alert(1)' }
            }
        };
        const res = createResponse();

        await handler(req, res);

        assert(res.statusCode === 410, 'The unauthenticated automatic reporting endpoint must be disabled');
        assert(fetchCalls === 0, 'The disabled endpoint must never call GitHub');
    } finally {
        global.fetch = originalFetch;
        if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
        else process.env.GITHUB_TOKEN = originalToken;
    }
}
