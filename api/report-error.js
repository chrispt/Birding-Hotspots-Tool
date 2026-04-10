/**
 * Vercel Serverless Function: POST /api/report-error
 *
 * Receives error data from the client and creates (or updates) a GitHub issue.
 * The GitHub PAT is stored as a Vercel environment variable (GITHUB_TOKEN),
 * never exposed to the browser.
 *
 * Deduplication: searches for an existing open issue with the same title.
 * If found, adds a comment with the new occurrence instead of creating a duplicate.
 *
 * Rate limiting: client-side cooldown prevents spamming; server-side validates
 * payload size and rejects malformed requests.
 */

const REPO_OWNER = 'chrispt';
const REPO_NAME = 'Birding-Hotspots-Tool';
const GITHUB_API = 'https://api.github.com';
const MAX_BODY_SIZE = 10000; // bytes

export default async function handler(req, res) {
    // Only accept POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Validate GitHub token is configured
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        console.error('GITHUB_TOKEN environment variable is not set');
        return res.status(500).json({ error: 'Error reporting is not configured' });
    }

    // Parse and validate payload
    let payload;
    try {
        payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON' });
    }

    if (!payload || !payload.type || !payload.message) {
        return res.status(400).json({ error: 'Missing required fields: type, message' });
    }

    // Reject oversized payloads
    if (JSON.stringify(payload).length > MAX_BODY_SIZE) {
        return res.status(413).json({ error: 'Payload too large' });
    }

    // Sanitize inputs (strip control characters, limit lengths)
    const type = String(payload.type).replace(/[\x00-\x1f]/g, '').substring(0, 50);
    const message = String(payload.message).replace(/[\x00-\x1f]/g, '').substring(0, 500);
    const stack = payload.stack ? String(payload.stack).substring(0, 2000) : '';
    const source = payload.source ? String(payload.source).substring(0, 200) : '';
    const line = Number(payload.line) || 0;
    const count = Math.min(Number(payload.count) || 1, 9999);
    const metadata = payload.metadata || {};

    const issueTitle = `[Auto] ${type}: ${message.substring(0, 80)}`;

    try {
        // Search for existing open issue with the same title
        const existingIssue = await findExistingIssue(token, issueTitle);

        if (existingIssue) {
            // Add a comment to the existing issue instead of creating a duplicate
            await addCommentToIssue(token, existingIssue.number, {
                type, message, stack, source, line, count, metadata
            });
            return res.status(200).json({
                action: 'commented',
                issueNumber: existingIssue.number,
                issueUrl: existingIssue.html_url
            });
        }

        // Create a new issue
        const newIssue = await createIssue(token, issueTitle, {
            type, message, stack, source, line, count, metadata
        });
        return res.status(201).json({
            action: 'created',
            issueNumber: newIssue.number,
            issueUrl: newIssue.html_url
        });

    } catch (error) {
        console.error('GitHub API error:', error.message);
        return res.status(502).json({ error: 'Failed to create GitHub issue' });
    }
}

/**
 * Search for an existing open issue with a matching title.
 */
async function findExistingIssue(token, title) {
    // Use the first 80 chars of the title for search (GitHub search has limits)
    const searchQuery = `repo:${REPO_OWNER}/${REPO_NAME} is:issue is:open in:title "${title.substring(0, 80)}"`;
    const url = `${GITHUB_API}/search/issues?q=${encodeURIComponent(searchQuery)}&per_page=1`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'BirdingHotspotsTool-ErrorReporter'
        }
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.items && data.items.length > 0) {
        // Verify exact title match (search is fuzzy)
        const match = data.items.find(item => item.title === title);
        return match || null;
    }
    return null;
}

/**
 * Create a new GitHub issue.
 */
async function createIssue(token, title, { type, message, stack, source, line, count, metadata }) {
    const body = formatIssueBody({ type, message, stack, source, line, count, metadata });

    const response = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'BirdingHotspotsTool-ErrorReporter',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title,
            body,
            labels: ['bug', 'auto-reported']
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub API ${response.status}: ${errorText}`);
    }

    return response.json();
}

/**
 * Add a comment to an existing issue with updated occurrence info.
 */
async function addCommentToIssue(token, issueNumber, { type, message, stack, source, line, count, metadata }) {
    const comment = `### Additional occurrence\n\n` +
        `- **Occurrences in this session:** ${count}\n` +
        `- **Reported:** ${metadata.timestamp || new Date().toISOString()}\n` +
        `- **Browser:** ${metadata.browser || 'Unknown'} / ${metadata.os || 'Unknown'}\n` +
        (stack ? `\n<details><summary>Stack trace</summary>\n\n\`\`\`\n${stack}\n\`\`\`\n</details>\n` : '');

    const response = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNumber}/comments`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'BirdingHotspotsTool-ErrorReporter',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ body: comment })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub API ${response.status}: ${errorText}`);
    }

    return response.json();
}

/**
 * Format the issue body as markdown.
 */
function formatIssueBody({ type, message, stack, source, line, count, metadata }) {
    let body = `## Error\n`;
    body += `- **Type:** \`${type}\`\n`;
    body += `- **Message:** ${message}\n`;
    if (count > 1) body += `- **Occurrences:** ${count}\n`;
    if (source) body += `- **Source:** \`${source}:${line}\`\n`;

    if (stack) {
        body += `\n## Stack trace\n\`\`\`\n${stack}\n\`\`\`\n`;
    }

    body += `\n## Environment\n`;
    body += `- **Browser:** ${metadata.browser || 'Unknown'} / ${metadata.os || 'Unknown'}\n`;
    body += `- **Screen:** ${metadata.screenSize || 'Unknown'}\n`;
    body += `- **Theme:** ${metadata.theme || 'Unknown'}\n`;
    body += `- **URL:** ${metadata.url || 'Unknown'}\n`;
    body += `- **Reported:** ${metadata.timestamp || new Date().toISOString()}\n`;

    body += `\n---\n*Automatically reported by Birding Hotspots Finder error reporter*`;

    return body;
}
