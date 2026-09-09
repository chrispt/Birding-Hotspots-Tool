/**
 * Automatic error reporting is intentionally disabled.
 *
 * A public static app cannot authenticate browser-generated error reports
 * strongly enough to allow anonymous callers to create GitHub issues with a
 * repository token. Runtime errors stay in the browser unless the user opens
 * and submits a pre-filled GitHub issue through the application's Report UI.
 */
export default function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    return res.status(410).json({
        error: 'Automatic error reporting is disabled. Use the in-app Report action.'
    });
}
