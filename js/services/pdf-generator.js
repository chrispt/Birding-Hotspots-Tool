/**
 * PDF Report generation service
 * Uses jsPDF library loaded via CDN
 */

import { formatDistance, formatDuration, formatDate, getGoogleMapsDirectionsUrl, getEbirdHotspotUrl } from '../utils/formatters.js';
import { generateCanvasMap, generateRouteMap } from './map-service.js';
import { generateQRCode, isQRCodeAvailable } from './qr-generator.js';
import { getSeasonalInsights, analyzeHotspotActivity } from './seasonal-insights.js';
import { CONFIG } from '../utils/constants.js';

const PDF_COLORS = {
    primary:       [46, 125, 50],    // Forest green
    textPrimary:   [33, 33, 33],     // Dark gray
    textSecondary: [117, 117, 117],  // Medium gray
    notable:       [255, 87, 34],    // Orange for rare species
    lifer:         [123, 31, 162],   // Purple, matches --lifer-text
    target:        [25, 118, 210],   // Blue, matches --target-hover
    link:          [0, 102, 204]     // Blue for links
};

/**
 * Format a one-line weather summary for a hotspot/stop, or null if no
 * weather data was fetched for it.
 * @param {Object|null} weather - Weather data object
 * @param {boolean} useFahrenheit - Whether to show °F (true) or °C (false)
 * @returns {string|null}
 */
function formatWeatherLine(weather, useFahrenheit) {
    if (!weather) return null;
    const temp = useFahrenheit ? `${weather.temperatureF}°F` : `${weather.temperatureC}°C`;
    return `Weather: ${temp}, ${weather.description}, wind ${weather.windSpeedMph} mph ${weather.windDirection}`;
}

/**
 * Format a one-line seasonal/best-time blurb for a hotspot. Falls back to
 * the always-available date-based seasonal summary; appends the
 * observation-derived best time-of-day when timestamped data allows it.
 * @param {Array} observations - Raw recent observations for the hotspot
 * @returns {string}
 */
function formatSeasonalLine(observations) {
    const insights = getSeasonalInsights();
    const activity = analyzeHotspotActivity(observations);
    return activity?.bestTime
        ? `${insights.summary} Peak activity here: ${activity.bestTime}.`
        : insights.summary;
}

/**
 * Render a two-column "Species observed" bird list with notable/lifer/target
 * markers and a matching legend. Shared by generatePDFReport() and
 * generateRoutePDFReport() since both need identical marker handling.
 * @param {jsPDF} doc - The PDF document
 * @param {Array} birds - Bird observations with comName/isNotable/isLifer/speciesCode
 * @param {Object} opts
 * @param {number} opts.yPos - Starting Y position
 * @param {number} opts.margin - Page margin
 * @param {number} opts.contentWidth - Usable content width
 * @param {Array<string>} [opts.targetCodes] - Species codes the user is targeting (route mode only)
 * @returns {number} The Y position after the bird list and legend
 */
function renderBirdListColumns(doc, birds, { yPos, margin, contentWidth, targetCodes = [] }) {
    let y = yPos;

    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.textPrimary);
    doc.text('Species observed:', margin, y);
    y += 4;

    if (!birds || birds.length === 0) {
        doc.setFontSize(8);
        doc.setTextColor(...PDF_COLORS.textSecondary);
        doc.text('No recent observations available', margin, y);
        return y;
    }

    const items = birds.map(bird => {
        const isTarget = targetCodes.includes(bird.speciesCode);
        const marker = isTarget ? '^ ' : bird.isNotable ? '* ' : bird.isLifer ? '+ ' : '';
        const color = isTarget ? PDF_COLORS.target
            : bird.isNotable ? PDF_COLORS.notable
                : bird.isLifer ? PDF_COLORS.lifer
                    : PDF_COLORS.textPrimary;
        return { text: `${marker}${bird.comName}`, color };
    });

    const colWidth = contentWidth / 2 - 5;
    const leftCol = [];
    const rightCol = [];
    items.forEach((item, idx) => (idx % 2 === 0 ? leftCol : rightCol).push(item));

    doc.setFontSize(8);

    const drawColumn = (col, x) => {
        col.forEach((item, idx) => {
            doc.setTextColor(...item.color);
            const truncated = item.text.length > 35 ? item.text.substring(0, 32) + '...' : item.text;
            doc.text(truncated, x, y + (idx * 4));
        });
    };
    drawColumn(leftCol, margin);
    drawColumn(rightCol, margin + colWidth + 10);

    y += Math.max(leftCol.length, rightCol.length) * 4;

    // Legend for whichever markers actually appeared in this bird list
    const hasTarget = targetCodes.length > 0 && birds.some(b => targetCodes.includes(b.speciesCode));
    const hasNotable = birds.some(b => b.isNotable);
    const hasLifer = birds.some(b => b.isLifer);
    const legendLines = [];
    if (hasTarget) legendLines.push({ text: '^ Target species', color: PDF_COLORS.target });
    if (hasNotable) legendLines.push({ text: '* Notable/rare species for this area', color: PDF_COLORS.notable });
    if (hasLifer) legendLines.push({ text: '+ Potential lifer (not on your life list)', color: PDF_COLORS.lifer });

    if (legendLines.length > 0) {
        y += 2;
        doc.setFontSize(7);
        legendLines.forEach(line => {
            doc.setTextColor(...line.color);
            doc.text(line.text, margin, y);
            y += 3.5;
        });
    }

    return y;
}

/**
 * Generate the PDF report
 * @param {Object} data - Report data
 * @param {Function} onProgress - Progress callback (message, percent)
 * @returns {Promise<jsPDF>} The generated PDF document
 */
export async function generatePDFReport(data, onProgress = () => {}) {
    const {
        origin,
        hotspots,
        sortMethod,
        generatedDate,
        searchRadiusKm = CONFIG.DEFAULT_SEARCH_RADIUS,
        useFahrenheit = true
    } = data;

    // Get jsPDF from global scope (loaded via CDN)
    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    let yPos = margin;

    const { primary: primaryColor, textPrimary, textSecondary, link: linkColor } = PDF_COLORS;

    // Helper to check if we need a new page
    function checkNewPage(neededSpace) {
        if (yPos + neededSpace > pageHeight - margin) {
            doc.addPage();
            yPos = margin;
            return true;
        }
        return false;
    }

    onProgress('Creating report header...', 5);

    // ========== TITLE ==========
    doc.setFontSize(24);
    doc.setTextColor(...primaryColor);
    doc.text('Birding Hotspots Report', margin, yPos);
    yPos += 12;

    // ========== METADATA ==========
    doc.setFontSize(10);
    doc.setTextColor(...textSecondary);
    doc.text(`Generated: ${generatedDate}`, margin, yPos);
    yPos += 5;
    doc.text(`Starting Location: ${origin.address || `${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}`}`, margin, yPos);
    yPos += 5;
    const sortLabels = { species: 'Most Species', distance: 'Closest Distance', driving: 'Shortest Drive', recency: 'Freshest Sightings' };
    doc.text(`Sorted by: ${sortLabels[sortMethod] || sortMethod}`, margin, yPos);
    yPos += 5;
    const radiusMi = Math.round(searchRadiusKm * 0.621371);
    doc.text(`Showing top ${hotspots.length} hotspots within ${radiusMi} miles`, margin, yPos);
    yPos += 10;

    // ========== MAP ==========
    onProgress('Generating map...', 15);

    try {
        const mapDataUrl = await generateCanvasMap(origin.lat, origin.lng, hotspots, {
            width: 800,
            height: 400
        });

        const mapWidth = contentWidth;
        const mapHeight = mapWidth * 0.5; // Maintain aspect ratio

        checkNewPage(mapHeight + 10);

        doc.addImage(mapDataUrl, 'PNG', margin, yPos, mapWidth, mapHeight);
        yPos += mapHeight + 10;
    } catch (err) {
        console.warn('Could not generate map:', err);
        // Continue without map
    }

    // ========== PRE-GENERATE QR CODES IN PARALLEL ==========
    onProgress('Generating QR codes...', 25);

    let qrCodes = [];
    if (isQRCodeAvailable()) {
        const qrPromises = hotspots.map(hotspot => {
            const ebirdUrl = getEbirdHotspotUrl(hotspot.locId);
            return generateQRCode(ebirdUrl, { size: 150 }).catch(() => null);
        });
        qrCodes = await Promise.all(qrPromises);
    }

    // ========== HOTSPOTS ==========
    const qrSize = 20; // QR code size in mm

    for (let i = 0; i < hotspots.length; i++) {
        const hotspot = hotspots[i];
        const progress = 30 + ((i / hotspots.length) * 60);
        onProgress(`Adding hotspot ${i + 1} of ${hotspots.length}...`, progress);

        // Estimate space needed for this hotspot (base + bird columns + the
        // weather/seasonal lines and marker legend added below)
        const birdLines = Math.ceil(hotspot.birds.length / 3); // Rough estimate
        const estimatedHeight = 85 + (birdLines * 5); // +5 for the GPS coordinates line
        checkNewPage(estimatedHeight);

        // Hotspot header with number
        doc.setFontSize(14);
        doc.setTextColor(...primaryColor);
        doc.text(`${i + 1}. ${hotspot.name}`, margin, yPos);
        yPos += 7;

        // Details section
        doc.setFontSize(10);
        doc.setTextColor(...textPrimary);

        const detailsStartY = yPos;

        // Species count
        doc.text(`Species (last 30 days): ${hotspot.speciesCount}`, margin, yPos);
        yPos += 5;

        // Straight-line distance
        doc.text(`Distance: ${formatDistance(hotspot.distance)}`, margin, yPos);
        yPos += 5;

        // Driving distance (if available)
        if (hotspot.drivingDistance != null && hotspot.drivingDuration != null) {
            doc.text(`Driving: ${formatDistance(hotspot.drivingDistance)} · ${formatDuration(hotspot.drivingDuration)}`, margin, yPos);
            yPos += 5;
        }

        // Weather (if fetched for this hotspot)
        const weatherLine = formatWeatherLine(hotspot.weather, useFahrenheit);
        if (weatherLine) {
            doc.text(weatherLine, margin, yPos);
            yPos += 5;
        }

        // Seasonal / best-time insight
        const seasonalLines = doc.splitTextToSize(formatSeasonalLine(hotspot.recentObservations), contentWidth - qrSize - 10);
        doc.text(seasonalLines, margin, yPos);
        yPos += seasonalLines.length * 4 + 1;

        // Address
        const addressLines = doc.splitTextToSize(`Address: ${hotspot.address}`, contentWidth - qrSize - 10);
        doc.text(addressLines, margin, yPos);
        yPos += addressLines.length * 4 + 2;

        // GPS coordinates in plain text — many birding hotspots have no cell signal,
        // so this is what actually works: typeable into an offline maps app or a
        // dedicated GPS unit, unlike the Google Maps link right below it.
        doc.setTextColor(...textSecondary);
        doc.text(`GPS: ${hotspot.lat.toFixed(5)}, ${hotspot.lng.toFixed(5)}`, margin, yPos);
        yPos += 5;

        // Links
        doc.setTextColor(...linkColor);

        // Google Maps link
        const directionsUrl = getGoogleMapsDirectionsUrl(origin.lat, origin.lng, hotspot.lat, hotspot.lng);
        doc.textWithLink('Get Directions (Google Maps)', margin, yPos, { url: directionsUrl });
        yPos += 5;

        // eBird link
        const ebirdUrl = getEbirdHotspotUrl(hotspot.locId);
        doc.textWithLink('View on eBird', margin, yPos, { url: ebirdUrl });
        yPos += 5;

        // QR code for eBird page (positioned to the right) - use pre-generated
        if (qrCodes[i]) {
            doc.addImage(qrCodes[i], 'PNG', pageWidth - margin - qrSize, detailsStartY - 2, qrSize, qrSize);
        }

        // Bird list
        yPos += 3;
        yPos = renderBirdListColumns(doc, hotspot.birds, { yPos, margin, contentWidth });

        yPos += 12; // Space between hotspots

        // Divider line (except for last hotspot)
        if (i < hotspots.length - 1) {
            doc.setDrawColor(224, 224, 224);
            doc.setLineWidth(0.5);
            doc.line(margin, yPos - 6, pageWidth - margin, yPos - 6);
        }
    }

    // ========== FOOTER ==========
    onProgress('Finalizing report...', 95);

    // Add footer to all pages
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);

        // Footer line
        doc.setDrawColor(224, 224, 224);
        doc.setLineWidth(0.5);
        doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);

        // Footer text
        doc.setFontSize(8);
        doc.setTextColor(...textSecondary);
        doc.text(
            'Data from eBird (Cornell Lab of Ornithology) - ebird.org/terms. Generated by Birding Hotspots Finder.',
            margin,
            pageHeight - 10
        );

        // Page number
        doc.text(
            `Page ${i} of ${totalPages}`,
            pageWidth - margin,
            pageHeight - 10,
            { align: 'right' }
        );
    }

    onProgress('Report complete!', 100);

    return doc;
}

/**
 * Download the PDF with a generated filename
 * @param {jsPDF} doc - The PDF document
 * @param {string} sortMethod - The sort method used ('species' or 'distance')
 */
export function downloadPDF(doc, sortMethod = 'species') {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timestamp = `${month}-${day}-${year}_${hours}${minutes}`;
    const sortLabels = { species: 'most-species', distance: 'closest', driving: 'shortest-drive', recency: 'freshest-sightings' };
    const sortLabel = sortLabels[sortMethod] || 'most-species';
    const filename = `birding-hotspots-${sortLabel}-${timestamp}.pdf`;
    doc.save(filename);
}

/**
 * Generate PDF report for a route itinerary
 * @param {Object} data - Route data
 * @param {Object} data.start - Start location {address, lat, lng}
 * @param {Object} data.end - End location {address, lat, lng}
 * @param {Object} data.itinerary - Full itinerary object with stops, legs, geometry, summary
 * @param {string} data.generatedDate - Report generation date
 * @param {Function} onProgress - Progress callback (message, percent)
 * @returns {Promise<jsPDF>} The generated PDF document
 */
export async function generateRoutePDFReport(data, onProgress = () => {}) {
    const {
        start,
        end,
        itinerary,
        generatedDate,
        useFahrenheit = true,
        targetSpeciesCodes = []
    } = data;

    // Get jsPDF from global scope (loaded via CDN)
    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    let yPos = margin;

    const { primary: primaryColor, textPrimary, textSecondary, link: linkColor } = PDF_COLORS;

    // Helper to check if we need a new page
    function checkNewPage(neededSpace) {
        if (yPos + neededSpace > pageHeight - margin) {
            doc.addPage();
            yPos = margin;
            return true;
        }
        return false;
    }

    onProgress('Creating route report header...', 5);

    // ========== TITLE ==========
    doc.setFontSize(24);
    doc.setTextColor(...primaryColor);
    doc.text('Birding Route Report', margin, yPos);
    yPos += 12;

    // ========== METADATA ==========
    doc.setFontSize(10);
    doc.setTextColor(...textSecondary);
    doc.text(`Generated: ${generatedDate}`, margin, yPos);
    yPos += 5;

    // Route info
    const startLabel = start.address || `${start.lat.toFixed(4)}, ${start.lng.toFixed(4)}`;
    const endLabel = end.address || `${end.lat.toFixed(4)}, ${end.lng.toFixed(4)}`;
    const routeText = doc.splitTextToSize(`Route: ${startLabel} to ${endLabel}`, contentWidth);
    // Print each line separately to avoid character spacing issues
    routeText.forEach(line => {
        doc.text(line, margin, yPos);
        yPos += 4;
    });
    yPos += 1;

    // Summary stats
    const hotspotStops = itinerary.stops.filter(s => s.type === 'hotspot');
    doc.text(`Total Distance: ${formatDistance(itinerary.summary.totalDistance)}`, margin, yPos);
    yPos += 5;
    doc.text(`Driving Time: ${formatDuration(itinerary.summary.totalTravelTime * 60)}`, margin, yPos);
    yPos += 5;
    doc.text(`Birding Stops: ${hotspotStops.length}`, margin, yPos);
    yPos += 10;

    // ========== ROUTE MAP ==========
    onProgress('Generating route map...', 15);

    try {
        const mapDataUrl = await generateRouteMap(itinerary, {
            width: 800,
            height: 400
        });

        const mapWidth = contentWidth;
        const mapHeight = mapWidth * 0.5; // Maintain aspect ratio

        checkNewPage(mapHeight + 10);

        doc.addImage(mapDataUrl, 'PNG', margin, yPos, mapWidth, mapHeight);
        yPos += mapHeight + 10;
    } catch (err) {
        console.warn('Could not generate route map:', err);
        // Continue without map
    }

    // ========== PRE-GENERATE QR CODES IN PARALLEL ==========
    onProgress('Generating QR codes...', 25);

    let qrCodes = [];
    if (isQRCodeAvailable()) {
        const qrPromises = hotspotStops.map(stop => {
            const ebirdUrl = getEbirdHotspotUrl(stop.locId);
            return generateQRCode(ebirdUrl, { size: 150 }).catch(() => null);
        });
        qrCodes = await Promise.all(qrPromises);
    }

    // ========== HOTSPOT DETAILS ==========
    const qrSize = 20; // QR code size in mm

    for (let i = 0; i < hotspotStops.length; i++) {
        const stop = hotspotStops[i];
        const progress = 30 + ((i / hotspotStops.length) * 60);
        onProgress(`Adding stop ${i + 1} of ${hotspotStops.length}...`, progress);

        // Estimate space needed for this hotspot (base + bird columns + the
        // weather/seasonal lines and marker legend added below)
        const birds = stop.birds || [];
        const birdLines = Math.ceil(birds.length / 3);
        const estimatedHeight = 90 + (birdLines * 5); // +5 for the GPS coordinates line
        checkNewPage(estimatedHeight);

        // Stop header with number
        doc.setFontSize(14);
        doc.setTextColor(...primaryColor);
        doc.text(`Stop ${i + 1}: ${stop.name}`, margin, yPos);
        yPos += 7;

        // Details section
        doc.setFontSize(10);
        doc.setTextColor(...textPrimary);

        const detailsStartY = yPos;

        // Species count
        doc.text(`Species (last 30 days): ${stop.speciesCount || 0}`, margin, yPos);
        yPos += 5;

        // Driving info from previous stop
        const stopIndex = itinerary.stops.indexOf(stop);
        if (stopIndex > 0) {
            const prevStop = itinerary.stops[stopIndex - 1];
            if (prevStop.legToNext) {
                const fromLabel = prevStop.type === 'start' ? 'start' : `Stop ${i}`;
                doc.text(`Drive from ${fromLabel}: ${formatDistance(prevStop.legToNext.distance)} · ${formatDuration(prevStop.legToNext.duration)}`, margin, yPos);
                yPos += 5;
            }
        }

        // Suggested visit time
        if (stop.suggestedVisitTime) {
            doc.text(`Suggested visit: ${stop.suggestedVisitTime} min`, margin, yPos);
            yPos += 5;
        }

        // Weather (if fetched for this stop)
        const stopWeatherLine = formatWeatherLine(stop.weather, useFahrenheit);
        if (stopWeatherLine) {
            doc.text(stopWeatherLine, margin, yPos);
            yPos += 5;
        }

        // Seasonal / best-time insight
        const stopSeasonalLines = doc.splitTextToSize(formatSeasonalLine(stop.recentObservations), contentWidth - qrSize - 10);
        doc.text(stopSeasonalLines, margin, yPos);
        yPos += stopSeasonalLines.length * 4 + 1;

        // Address
        if (stop.address) {
            const addressLines = doc.splitTextToSize(`Address: ${stop.address}`, contentWidth - qrSize - 10);
            // Print each line separately to avoid character spacing issues
            addressLines.forEach(line => {
                doc.text(line, margin, yPos);
                yPos += 4;
            });
            yPos += 2;
        }

        // GPS coordinates in plain text — works with no cell signal, unlike the
        // Google Maps link right below it.
        doc.setTextColor(...textSecondary);
        doc.text(`GPS: ${stop.lat.toFixed(5)}, ${stop.lng.toFixed(5)}`, margin, yPos);
        yPos += 5;

        // Links
        doc.setTextColor(...linkColor);

        // Google Maps link (from start to this stop)
        const directionsUrl = getGoogleMapsDirectionsUrl(start.lat, start.lng, stop.lat, stop.lng);
        doc.textWithLink('Get Directions (Google Maps)', margin, yPos, { url: directionsUrl });
        yPos += 5;

        // eBird link
        if (stop.locId) {
            const ebirdUrl = getEbirdHotspotUrl(stop.locId);
            doc.textWithLink('View on eBird', margin, yPos, { url: ebirdUrl });
            yPos += 5;

            // QR code for eBird page (positioned to the right)
            if (qrCodes[i]) {
                doc.addImage(qrCodes[i], 'PNG', pageWidth - margin - qrSize, detailsStartY - 2, qrSize, qrSize);
            }
        }

        // Bird list
        yPos += 3;
        yPos = renderBirdListColumns(doc, birds, { yPos, margin, contentWidth, targetCodes: targetSpeciesCodes });

        yPos += 12; // Space between stops

        // Divider line (except for last stop)
        if (i < hotspotStops.length - 1) {
            doc.setDrawColor(224, 224, 224);
            doc.setLineWidth(0.5);
            doc.line(margin, yPos - 6, pageWidth - margin, yPos - 6);
        }
    }

    // ========== FOOTER ==========
    onProgress('Finalizing report...', 95);

    // Add footer to all pages
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);

        // Footer line
        doc.setDrawColor(224, 224, 224);
        doc.setLineWidth(0.5);
        doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);

        // Footer text
        doc.setFontSize(8);
        doc.setTextColor(...textSecondary);
        doc.text(
            'Data from eBird (Cornell Lab of Ornithology) - ebird.org/terms. Generated by Birding Hotspots Finder.',
            margin,
            pageHeight - 10
        );

        // Page number
        doc.text(
            `Page ${i} of ${totalPages}`,
            pageWidth - margin,
            pageHeight - 10,
            { align: 'right' }
        );
    }

    onProgress('Route report complete!', 100);

    return doc;
}

/**
 * Download route PDF with generated filename
 * @param {jsPDF} doc - The PDF document
 */
export function downloadRoutePDF(doc) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timestamp = `${month}-${day}-${year}_${hours}${minutes}`;
    const filename = `birding-route-${timestamp}.pdf`;
    doc.save(filename);
}
