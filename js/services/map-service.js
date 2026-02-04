/**
 * Static map generation service for PDF reports
 * Uses Leaflet to render maps and html-to-image for capture
 */

// Counter for unique container IDs
let mapContainerCounter = 0;

/**
 * Generate a map image using Leaflet
 * @param {number} centerLat - Center latitude
 * @param {number} centerLng - Center longitude
 * @param {Array} hotspots - Array of hotspot objects
 * @param {Object} options - Canvas options
 * @returns {Promise<string>} Data URL of the map image
 */
export async function generateCanvasMap(centerLat, centerLng, hotspots, options = {}) {
    const {
        width = 800,
        height = 400
    } = options;

    // Create hidden container for map
    const containerId = `pdf-map-container-${++mapContainerCounter}`;
    const container = document.createElement('div');
    container.id = containerId;
    container.style.cssText = `
        position: absolute;
        left: -9999px;
        top: -9999px;
        width: ${width}px;
        height: ${height}px;
        z-index: -1;
    `;
    document.body.appendChild(container);

    try {
        // Create Leaflet map
        const map = L.map(containerId, {
            zoomControl: false,
            attributionControl: false
        });

        // Add OpenStreetMap tiles
        const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(map);

        // Calculate bounds including all hotspots and center
        const bounds = L.latLngBounds([[centerLat, centerLng]]);
        hotspots.forEach(h => bounds.extend([h.lat, h.lng]));

        // Pad bounds slightly
        map.fitBounds(bounds.pad(0.1));

        // Add home marker (green)
        const homeIcon = L.divIcon({
            className: 'pdf-marker-home',
            html: `<div style="
                background: #4CAF50;
                border: 3px solid white;
                border-radius: 50%;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            ">
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="white" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                </svg>
            </div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });
        L.marker([centerLat, centerLng], { icon: homeIcon }).addTo(map);

        // Add hotspot markers (numbered, orange)
        hotspots.forEach((hotspot, index) => {
            const markerIcon = L.divIcon({
                className: 'pdf-marker-hotspot',
                html: `<div style="
                    background: #FF5722;
                    border: 2px solid white;
                    border-radius: 50%;
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-weight: bold;
                    font-size: 12px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                ">${index + 1}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });
            L.marker([hotspot.lat, hotspot.lng], { icon: markerIcon }).addTo(map);
        });

        // Add legend
        const legend = L.control({ position: 'bottomleft' });
        legend.onAdd = function() {
            const div = L.DomUtil.create('div', 'pdf-legend');
            div.style.cssText = `
                background: white;
                padding: 8px 12px;
                border-radius: 4px;
                box-shadow: 0 1px 4px rgba(0,0,0,0.2);
                font-family: Arial, sans-serif;
                font-size: 11px;
            `;
            div.innerHTML = `
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                    <div style="background: #4CAF50; border: 2px solid white; border-radius: 50%; width: 16px; height: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.2);"></div>
                    <span>Start</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <div style="background: #FF5722; border: 2px solid white; border-radius: 50%; width: 16px; height: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.2);"></div>
                    <span>Birding Hotspot</span>
                </div>
            `;
            return div;
        };
        legend.addTo(map);

        // Wait for tiles to load
        await waitForTilesToLoad(map, tileLayer);

        // Capture map as image
        const dataUrl = await captureMapImage(container);

        // Cleanup
        map.remove();
        document.body.removeChild(container);

        return dataUrl;
    } catch (error) {
        // Cleanup on error
        if (document.getElementById(containerId)) {
            document.body.removeChild(container);
        }
        throw error;
    }
}

/**
 * Generate a route map image using Leaflet
 * @param {Object} itinerary - Itinerary data with stops and geometry
 * @param {Object} options - Canvas options
 * @returns {Promise<string>} Data URL of the map image
 */
export async function generateRouteMap(itinerary, options = {}) {
    const {
        width = 800,
        height = 400
    } = options;

    // Create hidden container for map
    const containerId = `pdf-route-map-container-${++mapContainerCounter}`;
    const container = document.createElement('div');
    container.id = containerId;
    container.style.cssText = `
        position: absolute;
        left: -9999px;
        top: -9999px;
        width: ${width}px;
        height: ${height}px;
        z-index: -1;
    `;
    document.body.appendChild(container);

    try {
        // Create Leaflet map
        const map = L.map(containerId, {
            zoomControl: false,
            attributionControl: false
        });

        // Add OpenStreetMap tiles
        const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(map);

        // Calculate bounds from all stops
        const bounds = L.latLngBounds(itinerary.stops.map(s => [s.lat, s.lng]));
        map.fitBounds(bounds.pad(0.1));

        // Draw route line if geometry available
        if (itinerary.geometry && itinerary.geometry.coordinates && itinerary.geometry.coordinates.length > 0) {
            const routeCoords = itinerary.geometry.coordinates.map(c => [c[1], c[0]]);
            L.polyline(routeCoords, {
                color: '#1565C0',
                weight: 4,
                opacity: 0.8
            }).addTo(map);
        }

        // Add markers for each stop
        let hotspotNumber = 1;
        itinerary.stops.forEach((stop) => {
            let markerIcon;

            if (stop.type === 'start') {
                markerIcon = L.divIcon({
                    className: 'pdf-marker-start',
                    html: `<div style="
                        background: #4CAF50;
                        border: 3px solid white;
                        border-radius: 50%;
                        width: 30px;
                        height: 30px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: bold;
                        font-size: 14px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    ">S</div>`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                });
            } else if (stop.type === 'end') {
                markerIcon = L.divIcon({
                    className: 'pdf-marker-end',
                    html: `<div style="
                        background: #E53935;
                        border: 3px solid white;
                        border-radius: 50%;
                        width: 30px;
                        height: 30px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: bold;
                        font-size: 14px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    ">E</div>`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                });
            } else {
                // Hotspot
                markerIcon = L.divIcon({
                    className: 'pdf-marker-hotspot',
                    html: `<div style="
                        background: #FF5722;
                        border: 2px solid white;
                        border-radius: 50%;
                        width: 28px;
                        height: 28px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: bold;
                        font-size: 12px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    ">${hotspotNumber++}</div>`,
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                });
            }

            L.marker([stop.lat, stop.lng], { icon: markerIcon }).addTo(map);
        });

        // Add legend
        const hasEnd = itinerary.stops.some(s => s.type === 'end');
        const legend = L.control({ position: 'bottomleft' });
        legend.onAdd = function() {
            const div = L.DomUtil.create('div', 'pdf-legend');
            div.style.cssText = `
                background: white;
                padding: 8px 12px;
                border-radius: 4px;
                box-shadow: 0 1px 4px rgba(0,0,0,0.2);
                font-family: Arial, sans-serif;
                font-size: 11px;
            `;
            let html = `
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                    <div style="background: #4CAF50; border: 2px solid white; border-radius: 50%; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: bold; box-shadow: 0 1px 2px rgba(0,0,0,0.2);">S</div>
                    <span>Start</span>
                </div>
            `;
            if (hasEnd) {
                html += `
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                        <div style="background: #E53935; border: 2px solid white; border-radius: 50%; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: bold; box-shadow: 0 1px 2px rgba(0,0,0,0.2);">E</div>
                        <span>End</span>
                    </div>
                `;
            }
            html += `
                <div style="display: flex; align-items: center; gap: 6px;">
                    <div style="background: #FF5722; border: 2px solid white; border-radius: 50%; width: 16px; height: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.2);"></div>
                    <span>Birding Hotspot</span>
                </div>
            `;
            div.innerHTML = html;
            return div;
        };
        legend.addTo(map);

        // Wait for tiles to load
        await waitForTilesToLoad(map, tileLayer);

        // Capture map as image
        const dataUrl = await captureMapImage(container);

        // Cleanup
        map.remove();
        document.body.removeChild(container);

        return dataUrl;
    } catch (error) {
        // Cleanup on error
        if (document.getElementById(containerId)) {
            document.body.removeChild(container);
        }
        throw error;
    }
}

/**
 * Wait for all map tiles to load
 * @param {L.Map} map - Leaflet map instance
 * @param {L.TileLayer} tileLayer - Tile layer to wait for
 * @returns {Promise<void>}
 */
function waitForTilesToLoad(map, tileLayer) {
    return new Promise((resolve) => {
        // Give the map time to initialize and start loading tiles
        setTimeout(() => {
            // Check if tiles are still loading
            const checkTilesLoaded = () => {
                const tiles = document.querySelectorAll('.leaflet-tile');
                const loadingTiles = Array.from(tiles).filter(tile => !tile.complete);

                if (loadingTiles.length === 0) {
                    // All tiles loaded, wait a bit more for rendering
                    setTimeout(resolve, 200);
                } else {
                    // Still loading, check again
                    setTimeout(checkTilesLoaded, 100);
                }
            };

            // Start checking after initial delay
            checkTilesLoaded();
        }, 500);

        // Timeout fallback - resolve after max 5 seconds
        setTimeout(resolve, 5000);
    });
}

/**
 * Capture map container as image using html-to-image
 * @param {HTMLElement} container - Container element
 * @returns {Promise<string>} Data URL of the image
 */
async function captureMapImage(container) {
    // Check if html-to-image is available
    if (typeof htmlToImage === 'undefined') {
        throw new Error('html-to-image library not loaded');
    }

    // Use toPng for best quality
    const dataUrl = await htmlToImage.toPng(container, {
        quality: 1,
        pixelRatio: 2, // Higher resolution for PDF
        backgroundColor: '#ffffff',
        style: {
            // Ensure the container is visible for capture
            position: 'relative',
            left: '0',
            top: '0'
        }
    });

    return dataUrl;
}
