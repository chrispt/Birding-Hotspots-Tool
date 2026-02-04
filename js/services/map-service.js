/**
 * Static map generation service for PDF reports
 * Fetches OpenStreetMap tiles (flat top-down style) and overlays markers
 */

/**
 * Generate a map image with OpenStreetMap tiles
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

    // Use 2x resolution for sharper output in PDFs
    const scale = 2;
    const canvasWidth = width * scale;
    const canvasHeight = height * scale;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    // Scale context for higher resolution
    ctx.scale(scale, scale);

    // Calculate bounds that include all hotspots
    const bounds = calculateBounds(centerLat, centerLng, hotspots);

    // Calculate appropriate zoom level (use scaled dimensions for more tiles)
    const zoom = calculateZoom(bounds, canvasWidth, canvasHeight);

    // Try to fetch and draw OSM tiles
    let tilesLoaded = false;
    try {
        await drawOSMTiles(ctx, bounds, zoom, width, height, scale);
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
    // Formula: zoom = log2(360 / lngDiff) for longitude
    // We want enough tiles to cover the canvas at good resolution
    const TILE_SIZE = 256;

    // Calculate zoom needed for each dimension
    const latZoom = Math.log2((360 / latDiff) * (height / TILE_SIZE));
    const lngZoom = Math.log2((360 / lngDiff) * (width / TILE_SIZE));

    // Use the smaller zoom (to fit everything) but add 1 for better resolution
    // Then clamp to reasonable range (8-14 for regional maps)
    const zoom = Math.floor(Math.min(latZoom, lngZoom));
    return Math.max(8, Math.min(zoom, 14));
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
async function drawOSMTiles(ctx, bounds, zoom, width, height, scale = 1) {
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
 * Fetch a single map tile (OpenStreetMap - flat top-down style)
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

/**
 * Calculate bounds that include route geometry and all stops
 * @param {Object} itinerary - Itinerary with stops and geometry
 * @returns {Object} Bounds object with min/max lat/lng
 */
function calculateRouteBounds(itinerary) {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    // Include all stops
    for (const stop of itinerary.stops) {
        minLat = Math.min(minLat, stop.lat);
        maxLat = Math.max(maxLat, stop.lat);
        minLng = Math.min(minLng, stop.lng);
        maxLng = Math.max(maxLng, stop.lng);
    }

    // Include route geometry if available
    if (itinerary.geometry && itinerary.geometry.coordinates) {
        for (const coord of itinerary.geometry.coordinates) {
            const lng = coord[0];
            const lat = coord[1];
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
        }
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

/**
 * Draw a route line on canvas from GeoJSON coordinates
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array} coordinates - GeoJSON coordinates [[lng, lat], ...]
 * @param {Function} toCanvas - Coordinate converter function
 */
function drawRouteLine(ctx, coordinates, toCanvas) {
    if (!coordinates || coordinates.length < 2) return;

    ctx.beginPath();
    ctx.strokeStyle = '#2563eb'; // Blue color matching Leaflet map
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const firstPoint = toCanvas(coordinates[0][1], coordinates[0][0]);
    ctx.moveTo(firstPoint.x, firstPoint.y);

    for (let i = 1; i < coordinates.length; i++) {
        const point = toCanvas(coordinates[i][1], coordinates[i][0]);
        ctx.lineTo(point.x, point.y);
    }

    ctx.stroke();
}

/**
 * Draw route markers for start, end, and hotspots
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array} stops - Itinerary stops
 * @param {Function} toCanvas - Coordinate converter function
 */
function drawRouteMarkers(ctx, stops, toCanvas) {
    // Draw hotspot markers first (so they appear under start/end if overlapping)
    let hotspotNumber = 1;
    stops.forEach(stop => {
        if (stop.type === 'hotspot') {
            const pos = toCanvas(stop.lat, stop.lng);

            // Shadow
            ctx.beginPath();
            ctx.arc(pos.x + 2, pos.y + 2, 12, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fill();

            // Orange circle
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
            ctx.fillText(hotspotNumber.toString(), pos.x, pos.y);
            hotspotNumber++;
        }
    });

    // Draw start marker (green)
    const startStop = stops.find(s => s.type === 'start');
    if (startStop) {
        const pos = toCanvas(startStop.lat, startStop.lng);

        // Shadow
        ctx.beginPath();
        ctx.arc(pos.x + 2, pos.y + 2, 14, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fill();

        // Green circle
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = '#22c55e';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.stroke();

        // "S" label
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('S', pos.x, pos.y);
    }

    // Draw end marker (red) - only if different from start
    const endStop = stops.find(s => s.type === 'end');
    if (endStop) {
        const pos = toCanvas(endStop.lat, endStop.lng);

        // Shadow
        ctx.beginPath();
        ctx.arc(pos.x + 2, pos.y + 2, 14, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fill();

        // Red circle
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.stroke();

        // "E" label
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('E', pos.x, pos.y);
    }
}

/**
 * Draw route legend in bottom-left corner
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {boolean} hasEnd - Whether there's a separate end point
 */
function drawRouteLegend(ctx, width, height, hasEnd) {
    const legendHeight = hasEnd ? 75 : 55;
    const legendWidth = 150;

    // Legend background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(10, height - legendHeight - 10, legendWidth, legendHeight);
    ctx.strokeStyle = '#BDBDBD';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, height - legendHeight - 10, legendWidth, legendHeight);

    let yOffset = height - legendHeight;

    // Start marker
    ctx.beginPath();
    ctx.arc(30, yOffset + 12, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#22c55e';
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 8px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S', 30, yOffset + 12);

    ctx.fillStyle = '#212121';
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Start', 45, yOffset + 12);

    yOffset += 20;

    // End marker (if present)
    if (hasEnd) {
        ctx.beginPath();
        ctx.arc(30, yOffset + 12, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 8px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('E', 30, yOffset + 12);

        ctx.fillStyle = '#212121';
        ctx.font = '11px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('End', 45, yOffset + 12);

        yOffset += 20;
    }

    // Hotspot marker
    ctx.beginPath();
    ctx.arc(30, yOffset + 12, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#FF5722';
    ctx.fill();

    ctx.fillStyle = '#212121';
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Birding Hotspot', 45, yOffset + 12);
}

/**
 * Generate a route map image with driving path and markers
 * @param {Object} itinerary - Itinerary with stops, legs, and geometry
 * @param {Object} options - Canvas options
 * @returns {Promise<string>} Data URL of the canvas image
 */
export async function generateRouteMap(itinerary, options = {}) {
    const {
        width = 800,
        height = 400
    } = options;

    // Use 2x resolution for sharper output in PDFs
    const scale = 2;
    const canvasWidth = width * scale;
    const canvasHeight = height * scale;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    // Scale context for higher resolution
    ctx.scale(scale, scale);

    // Calculate bounds that include route and all stops
    const bounds = calculateRouteBounds(itinerary);

    // Calculate appropriate zoom level
    const zoom = calculateZoom(bounds, canvasWidth, canvasHeight);

    // Try to fetch and draw OSM tiles
    try {
        await drawOSMTiles(ctx, bounds, zoom, width, height, scale);
    } catch (e) {
        console.warn('Could not load OSM tiles, using fallback background:', e);
        drawFallbackBackground(ctx, width, height);
    }

    // Create coordinate conversion function based on bounds
    const toCanvas = createCoordinateConverter(bounds, width, height);

    // Draw route line first (so markers appear on top)
    if (itinerary.geometry && itinerary.geometry.coordinates) {
        drawRouteLine(ctx, itinerary.geometry.coordinates, toCanvas);
    }

    // Draw markers
    drawRouteMarkers(ctx, itinerary.stops, toCanvas);

    // Draw legend
    const hasEnd = itinerary.stops.some(s => s.type === 'end');
    drawRouteLegend(ctx, width, height, hasEnd);

    return canvas.toDataURL('image/png');
}
