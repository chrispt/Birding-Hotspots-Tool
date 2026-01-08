/**
 * QR Code generation service
 * Uses the QRCode.js library loaded via CDN
 */

/**
 * Generate a QR code as a data URL
 * @param {string} url - The URL to encode in the QR code
 * @param {Object} options - QR code options
 * @returns {Promise<string>} Data URL of the QR code image
 */
export function generateQRCode(url, options = {}) {
    const {
        size = 100,
        colorDark = '#000000',
        colorLight = '#FFFFFF'
    } = options;

    return new Promise((resolve, reject) => {
        // Create a temporary container
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        document.body.appendChild(container);

        try {
            // Check if QRCode is available
            if (typeof QRCode === 'undefined') {
                throw new Error('QRCode library not loaded');
            }

            // Create QR code
            const qr = new QRCode(container, {
                text: url,
                width: size,
                height: size,
                colorDark: colorDark,
                colorLight: colorLight,
                correctLevel: QRCode.CorrectLevel.M
            });

            // Wait for QR code to render
            // QRCode.js creates the image asynchronously
            setTimeout(() => {
                try {
                    const canvas = container.querySelector('canvas');
                    if (canvas) {
                        const dataUrl = canvas.toDataURL('image/png');
                        document.body.removeChild(container);
                        resolve(dataUrl);
                    } else {
                        // Fallback to img element if canvas not available
                        const img = container.querySelector('img');
                        if (img) {
                            document.body.removeChild(container);
                            resolve(img.src);
                        } else {
                            throw new Error('QR code element not found');
                        }
                    }
                } catch (err) {
                    document.body.removeChild(container);
                    reject(err);
                }
            }, 100);
        } catch (err) {
            document.body.removeChild(container);
            reject(err);
        }
    });
}

/**
 * Generate multiple QR codes for a list of URLs
 * @param {Array<string>} urls - Array of URLs to encode
 * @param {Object} options - QR code options
 * @param {Function} onProgress - Progress callback (current, total)
 * @returns {Promise<Array<string>>} Array of data URLs
 */
export async function generateQRCodes(urls, options = {}, onProgress = null) {
    const results = [];

    for (let i = 0; i < urls.length; i++) {
        try {
            const dataUrl = await generateQRCode(urls[i], options);
            results.push(dataUrl);
        } catch (err) {
            console.warn(`Failed to generate QR code for: ${urls[i]}`, err);
            results.push(null);
        }

        if (onProgress) {
            onProgress(i + 1, urls.length);
        }
    }

    return results;
}

/**
 * Check if QRCode library is available
 * @returns {boolean} True if library is loaded
 */
export function isQRCodeAvailable() {
    return typeof QRCode !== 'undefined';
}
