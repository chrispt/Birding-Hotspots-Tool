/**
 * Static map generation service for PDF reports
 * Fetches real OpenStreetMap tiles and overlays markers
 */

/**
 * Generate a map image with real OpenStreetMap tiles
 * @param {number} centerLat - Center latitude
 * @param {number} centerLng - Center longitude
 * @param {Array} hotspots - Array of hotspot objects
 * @param {Object} options - Canvas options
 * @returns {Promise<string>} Data URL of the canvas image
 */
export async function generateCanvasMap(centerLat, centerLng, hotspots, options = {}) {
    const {
        width = 800,
        height = 400
    } = options;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Calculate bounds that include all hotspots
    const bounds = calculateBounds(centerLat, centerLng, hotspots);

    // Calculate appropriate zoom level
    const zoom = calculateZoom(bounds, width, height);

    // Try to fetch and draw OSM tiles
    let tilesLoaded = false;
    try {
        await drawOSMTiles(ctx, bounds, zoom, width, height);
        tilesLoaded = true;
    } catch (e) {
        console.warn('Could not load OSM tiles, using fallback background:', e);
        drawFallbackBackground(ctx, width, height);
    }

    // Create coordinate conversion function based on bounds
    const toCanvas = createCoordinateConverter(bounds, width, height);

    // Draw markers on top of map
    drawMarkers(ctx, hotspots, centerLat, centerLng, toCanvas);

    // Draw legend
    drawLegend(ctx, width, height);

    return canvas.toDataURL('image/png');
}

/**
 * Calculate appropriate zoom level for the given bounds
 */
function calculateZoom(bounds, width, height) {
    const latDiff = bounds.maxLat - bounds.minLat;
    const lngDiff = bounds.maxLng - bounds.minLng;

    // Calculate zoom based on the larger dimension
    // Each zoom level doubles the resolution
    const latZoom = Math.log2(180 / latDiff) - Math.log2(height / 256);
    const lngZoom = Math.log2(360 / lngDiff) - Math.log2(width / 256);

    // Use the smaller zoom (to fit everything) and clamp to reasonable range
    const zoom = Math.floor(Math.min(latZoom, lngZoom));
    return Math.max(1, Math.min(zoom, 16));
}

/**
 * Convert lat/lng to tile coordinates
 */
function latLngToTile(lat, lng, zoom) {
    const n = Math.pow(2, zoom);
    const x = Math.floor((lng + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
}

/**
 * Convert tile coordinates back to lat/lng (top-left corner of tile)
 */
function tileToLatLng(x, y, zoom) {
    const n = Math.pow(2, zoom);
    const lng = x / n * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
    const lat = latRad * 180 / Math.PI;
    return { lat, lng };
}

/**
 * Fetch and draw OpenStreetMap tiles
 */
async function drawOSMTiles(ctx, bounds, zoom, width, height) {
    const tileSize = 256;

    // Get tile coordinates for bounds corners
    const topLeftTile = latLngToTile(bounds.maxLat, bounds.minLng, zoom);
    const bottomRightTile = latLngToTile(bounds.minLat, bounds.maxLng, zoom);

    // Calculate pixel offset for proper alignment
    const topLeftCoord = tileToLatLng(topLeftTile.x, topLeftTile.y, zoom);
    const bottomRightCoord = tileToLatLng(bottomRightTile.x + 1, bottomRightTile.y + 1, zoom);

    // Total size in tiles
    const tilesX = bottomRightTile.x - topLeftTile.x + 1;
    const tilesY = bottomRightTile.y - topLeftTile.y + 1;

    // Create a temporary canvas for tiles
    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = tilesX * tileSize;
    tileCanvas.height = tilesY * tileSize;
    const tileCtx = tileCanvas.getContext('2d');

    // Fill with background color in case some tiles fail
    tileCtx.fillStyle = '#E8F5E9';
    tileCtx.fillRect(0, 0, tileCanvas.width, tileCanvas.height);

    // Fetch all tiles in parallel
    const tilePromises = [];
    for (let y = topLeftTile.y; y <= bottomRightTile.y; y++) {
        for (let x = topLeftTile.x; x <= bottomRightTile.x; x++) {
            const tileX = x - topLeftTile.x;
            const tileY = y - topLeftTile.y;
            tilePromises.push(
                fetchTile(x, y, zoom)
                    .then(img => {
                        tileCtx.drawImage(img, tileX * tileSize, tileY * tileSize);
                    })
                    .catch(() => {
                        // Draw placeholder for failed tiles
                        tileCtx.fillStyle = '#D7E9D8';
                        tileCtx.fillRect(tileX * tileSize, tileY * tileSize, tileSize, tileSize);
                    })
            );
        }
    }

    await Promise.all(tilePromises);

    // Calculate which portion of the tile canvas to draw
    const totalLatRange = topLeftCoord.lat - bottomRightCoord.lat;
    const totalLngRange = bottomRightCoord.lng - topLeftCoord.lng;

    const boundsLatRange = bounds.maxLat - bounds.minLat;
    const boundsLngRange = bounds.maxLng - bounds.minLng;

    // Source rectangle (portion of tile canvas to use)
    const srcX = ((bounds.minLng - topLeftCoord.lng) / totalLngRange) * tileCanvas.width;
    const srcY = ((topLeftCoord.lat - bounds.maxLat) / totalLatRange) * tileCanvas.height;
    const srcW = (boundsLngRange / totalLngRange) * tileCanvas.width;
    const srcH = (boundsLatRange / totalLatRange) * tileCanvas.height;

    // Draw the relevant portion scaled to fit
    ctx.drawImage(tileCanvas, srcX, srcY, srcW, srcH, 0, 0, width, height);
}

/**
 * Fetch a single OSM tile
 */
function fetchTile(x, y, zoom) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        // Use multiple tile servers for better performance
        const servers = ['a', 'b', 'c'];
        const server = servers[Math.floor(Math.random() * servers.length)];
        img.src = `https://${server}.tile.openstreetmap.org/${zoom}/${x}/${y}.png`;

        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load tile'));

        // Timeout after 5 seconds
        setTimeout(() => reject(new Error('Tile load timeout')), 5000);
    });
}

/**
 * Draw fallback background when tiles can't be loaded
 */
function drawFallbackBackground(ctx, width, height) {
    // Light green background
    ctx.fillStyle = '#E8F5E9';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = '#C8E6C9';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
        const x = (i / 10) * width;
        const y = (i / 10) * height;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
}

/**
 * Create a function to convert lat/lng to canvas coordinates
 */
function createCoordinateConverter(bounds, width, height) {
    return function(lat, lng) {
        const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * width;
        const y = height - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * height;
        return { x, y };
    };
}

/**
 * Draw markers for hotspots and home location
 */
function drawMarkers(ctx, hotspots, centerLat, centerLng, toCanvas) {
    // Draw hotspot markers
    hotspots.forEach((h, i) => {
        const pos = toCanvas(h.lat, h.lng);

        // Marker circle with shadow
        ctx.beginPath();
        ctx.arc(pos.x + 2, pos.y + 2, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#FF5722';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Number label
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((i + 1).toString(), pos.x, pos.y);
    });

    // Draw home marker (larger, green) with shadow
    const homePos = toCanvas(centerLat, centerLng);

    ctx.beginPath();
    ctx.arc(homePos.x + 2, homePos.y + 2, 15, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(homePos.x, homePos.y, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#2E7D32';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Home icon (simple house shape)
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(homePos.x, homePos.y - 6);
    ctx.lineTo(homePos.x - 6, homePos.y);
    ctx.lineTo(homePos.x - 4, homePos.y);
    ctx.lineTo(homePos.x - 4, homePos.y + 5);
    ctx.lineTo(homePos.x + 4, homePos.y + 5);
    ctx.lineTo(homePos.x + 4, homePos.y);
    ctx.lineTo(homePos.x + 6, homePos.y);
    ctx.closePath();
    ctx.fill();
}

/**
 * Draw legend in bottom-left corner
 */
function drawLegend(ctx, width, height) {
    // Legend background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(10, height - 60, 150, 50);
    ctx.strokeStyle = '#BDBDBD';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, height - 60, 150, 50);

    // Your Location item
    ctx.beginPath();
    ctx.arc(30, height - 42, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#2E7D32';
    ctx.fill();

    ctx.fillStyle = '#212121';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Your Location', 45, height - 42);

    // Birding Hotspot item
    ctx.beginPath();
    ctx.arc(30, height - 22, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#FF5722';
    ctx.fill();

    ctx.fillStyle = '#212121';
    ctx.fillText('Birding Hotspot', 45, height - 22);
}

/**
 * Calculate bounds that include center and all hotspots
 * @param {number} centerLat - Center latitude
 * @param {number} centerLng - Center longitude
 * @param {Array} hotspots - Array of hotspot objects
 * @returns {Object} Bounds object with min/max lat/lng
 */
function calculateBounds(centerLat, centerLng, hotspots) {
    let minLat = centerLat;
    let maxLat = centerLat;
    let minLng = centerLng;
    let maxLng = centerLng;

    for (const h of hotspots) {
        minLat = Math.min(minLat, h.lat);
        maxLat = Math.max(maxLat, h.lat);
        minLng = Math.min(minLng, h.lng);
        maxLng = Math.max(maxLng, h.lng);
    }

    // Add some padding (15%)
    const latPadding = (maxLat - minLat) * 0.15 || 0.02;
    const lngPadding = (maxLng - minLng) * 0.15 || 0.02;

    return {
        minLat: minLat - latPadding,
        maxLat: maxLat + latPadding,
        minLng: minLng - lngPadding,
        maxLng: maxLng + lngPadding
    };
}
