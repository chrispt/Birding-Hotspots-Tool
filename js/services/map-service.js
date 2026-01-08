/**
 * Static map generation service
 */

/**
 * Generate a static map URL with markers for hotspots
 * Uses OpenStreetMap-based static map services
 * @param {number} centerLat - Center latitude
 * @param {number} centerLng - Center longitude
 * @param {Array} hotspots - Array of hotspot objects with lat, lng
 * @param {Object} options - Map options
 * @returns {string} Static map URL
 */
export function generateStaticMapUrl(centerLat, centerLng, hotspots, options = {}) {
    const {
        width = 800,
        height = 400,
        zoom = null
    } = options;

    // Calculate bounding box to determine zoom level
    const bounds = calculateBounds(centerLat, centerLng, hotspots);

    // Build markers string for all hotspots
    const markers = hotspots.map((h, i) => `${h.lng},${h.lat}`).join('|');
    const homeMarker = `${centerLng},${centerLat}`;

    // Use staticmapmaker.com's OpenStreetMap service (no API key required)
    // This is a simple fallback that works without any API key
    const baseUrl = 'https://staticmap.openstreetmap.de/staticmap.php';

    const params = new URLSearchParams({
        center: `${centerLat},${centerLng}`,
        zoom: zoom || calculateZoomLevel(bounds, width, height),
        size: `${width}x${height}`,
        maptype: 'mapnik'
    });

    // Add markers (home + hotspots)
    // Home marker (green)
    params.append('markers', `${centerLat},${centerLng},ol-marker-green`);

    // Hotspot markers (red)
    hotspots.forEach((h, i) => {
        params.append('markers', `${h.lat},${h.lng},ol-marker`);
    });

    return `${baseUrl}?${params.toString()}`;
}

/**
 * Generate a simple map URL that can be opened in a browser
 * @param {number} centerLat - Center latitude
 * @param {number} centerLng - Center longitude
 * @param {Array} hotspots - Array of hotspot objects
 * @returns {string} OpenStreetMap URL
 */
export function generateInteractiveMapUrl(centerLat, centerLng, hotspots) {
    // Use OpenStreetMap with a marker at center
    const bounds = calculateBounds(centerLat, centerLng, hotspots);
    const bbox = `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;

    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${centerLat},${centerLng}`;
}

/**
 * Generate a canvas-based map image
 * This creates a simple map visualization when external services aren't available
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

    // Calculate bounds
    const bounds = calculateBounds(centerLat, centerLng, hotspots);
    const padding = 0.1; // 10% padding
    const latRange = (bounds.maxLat - bounds.minLat) * (1 + padding * 2);
    const lngRange = (bounds.maxLng - bounds.minLng) * (1 + padding * 2);

    // Background
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

    // Convert lat/lng to canvas coordinates
    function toCanvas(lat, lng) {
        const x = ((lng - bounds.minLng + latRange * padding / 2) / lngRange) * width;
        const y = height - ((lat - bounds.minLat + latRange * padding / 2) / latRange) * height;
        return { x, y };
    }

    // Draw hotspot markers
    hotspots.forEach((h, i) => {
        const pos = toCanvas(h.lat, h.lng);

        // Marker circle
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

    // Draw home marker (larger, green)
    const homePos = toCanvas(centerLat, centerLng);
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

    // Legend
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(10, height - 60, 150, 50);
    ctx.strokeStyle = '#BDBDBD';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, height - 60, 150, 50);

    // Legend items
    ctx.beginPath();
    ctx.arc(30, height - 42, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#2E7D32';
    ctx.fill();

    ctx.fillStyle = '#212121';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Your Location', 45, height - 42);

    ctx.beginPath();
    ctx.arc(30, height - 22, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#FF5722';
    ctx.fill();

    ctx.fillStyle = '#212121';
    ctx.fillText('Birding Hotspot', 45, height - 22);

    return canvas.toDataURL('image/png');
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

    // Add some padding
    const latPadding = (maxLat - minLat) * 0.1 || 0.01;
    const lngPadding = (maxLng - minLng) * 0.1 || 0.01;

    return {
        minLat: minLat - latPadding,
        maxLat: maxLat + latPadding,
        minLng: minLng - lngPadding,
        maxLng: maxLng + lngPadding
    };
}

/**
 * Calculate appropriate zoom level for bounds
 * @param {Object} bounds - Bounds object
 * @param {number} width - Map width
 * @param {number} height - Map height
 * @returns {number} Zoom level (1-18)
 */
function calculateZoomLevel(bounds, width, height) {
    const latRange = bounds.maxLat - bounds.minLat;
    const lngRange = bounds.maxLng - bounds.minLng;

    // Approximate zoom calculation
    const latZoom = Math.floor(Math.log2(180 / latRange));
    const lngZoom = Math.floor(Math.log2(360 / lngRange));

    // Use the more restrictive zoom and clamp to valid range
    const zoom = Math.min(latZoom, lngZoom);
    return Math.max(1, Math.min(zoom, 15));
}
