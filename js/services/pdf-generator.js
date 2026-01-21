/**
 * PDF Report generation service
 * Uses jsPDF library loaded via CDN
 */

import { formatDistance, formatDuration, formatDate, getGoogleMapsDirectionsUrl, getEbirdHotspotUrl } from '../utils/formatters.js';
import { generateCanvasMap, generateRouteMap } from './map-service.js';
import { generateQRCode, isQRCodeAvailable } from './qr-generator.js';

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
        generatedDate
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

    // Colors
    const primaryColor = [46, 125, 50];     // Forest green
    const textPrimary = [33, 33, 33];       // Dark gray
    const textSecondary = [117, 117, 117];  // Medium gray
    const notableColor = [255, 87, 34];     // Orange for rare species
    const linkColor = [0, 102, 204];        // Blue for links

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
    const sortLabels = { species: 'Most Species', distance: 'Closest Distance', driving: 'Shortest Drive' };
    doc.text(`Sorted by: ${sortLabels[sortMethod] || sortMethod}`, margin, yPos);
    yPos += 5;
    doc.text(`Showing top ${hotspots.length} hotspots within 31 miles`, margin, yPos);
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

        // Estimate space needed for this hotspot
        const birdLines = Math.ceil(hotspot.birds.length / 3); // Rough estimate
        const estimatedHeight = 60 + (birdLines * 5);
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

        // Address
        const addressLines = doc.splitTextToSize(`Address: ${hotspot.address}`, contentWidth - qrSize - 10);
        doc.text(addressLines, margin, yPos);
        yPos += addressLines.length * 4 + 2;

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
        doc.setFontSize(9);
        doc.setTextColor(...textPrimary);
        doc.text('Species observed:', margin, yPos);
        yPos += 4;

        // Format bird list in columns
        if (hotspot.birds && hotspot.birds.length > 0) {
            const hasNotable = hotspot.birds.some(b => b.isNotable);

            // Create bird list text
            const birdItems = hotspot.birds.map(bird => {
                const marker = bird.isNotable ? '* ' : '';
                return `${marker}${bird.comName}`;
            });

            // Split into multiple columns for better use of space
            const colWidth = contentWidth / 2 - 5;
            const leftCol = [];
            const rightCol = [];

            birdItems.forEach((item, idx) => {
                if (idx % 2 === 0) {
                    leftCol.push(item);
                } else {
                    rightCol.push(item);
                }
            });

            doc.setFontSize(8);

            // Left column
            leftCol.forEach((item, idx) => {
                const isNotable = item.startsWith('*');
                if (isNotable) {
                    doc.setTextColor(...notableColor);
                } else {
                    doc.setTextColor(...textPrimary);
                }

                const truncated = item.length > 35 ? item.substring(0, 32) + '...' : item;
                doc.text(truncated, margin, yPos + (idx * 4));
            });

            // Right column
            rightCol.forEach((item, idx) => {
                const isNotable = item.startsWith('*');
                if (isNotable) {
                    doc.setTextColor(...notableColor);
                } else {
                    doc.setTextColor(...textPrimary);
                }

                const truncated = item.length > 35 ? item.substring(0, 32) + '...' : item;
                doc.text(truncated, margin + colWidth + 10, yPos + (idx * 4));
            });

            yPos += Math.max(leftCol.length, rightCol.length) * 4;

            // Notable species legend
            if (hasNotable) {
                yPos += 2;
                doc.setFontSize(7);
                doc.setTextColor(...notableColor);
                doc.text('* Notable/rare species for this area', margin, yPos);
            }
        } else {
            doc.setFontSize(8);
            doc.setTextColor(...textSecondary);
            doc.text('No recent observations available', margin, yPos);
        }

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
            'Data from eBird (Cornell Lab of Ornithology). Generated by Birding Hotspots Finder.',
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
    const sortLabels = { species: 'most-species', distance: 'closest', driving: 'shortest-drive' };
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
        generatedDate
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

    // Colors
    const primaryColor = [46, 125, 50];     // Forest green
    const textPrimary = [33, 33, 33];       // Dark gray
    const textSecondary = [117, 117, 117];  // Medium gray
    const notableColor = [255, 87, 34];     // Orange for rare species
    const linkColor = [0, 102, 204];        // Blue for links

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
    const routeText = doc.splitTextToSize(`Route: ${startLabel} → ${endLabel}`, contentWidth);
    doc.text(routeText, margin, yPos);
    yPos += routeText.length * 4 + 1;

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

        // Estimate space needed for this hotspot
        const birds = stop.birds || [];
        const birdLines = Math.ceil(birds.length / 3);
        const estimatedHeight = 65 + (birdLines * 5);
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

        // Address
        if (stop.address) {
            const addressLines = doc.splitTextToSize(`Address: ${stop.address}`, contentWidth - qrSize - 10);
            doc.text(addressLines, margin, yPos);
            yPos += addressLines.length * 4 + 2;
        }

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
        if (birds.length > 0) {
            yPos += 3;
            doc.setFontSize(9);
            doc.setTextColor(...textPrimary);
            doc.text('Species observed:', margin, yPos);
            yPos += 4;

            const hasNotable = birds.some(b => b.isNotable);

            // Create bird list text
            const birdItems = birds.map(bird => {
                const marker = bird.isNotable ? '* ' : '';
                return `${marker}${bird.comName}`;
            });

            // Split into multiple columns for better use of space
            const colWidth = contentWidth / 2 - 5;
            const leftCol = [];
            const rightCol = [];

            birdItems.forEach((item, idx) => {
                if (idx % 2 === 0) {
                    leftCol.push(item);
                } else {
                    rightCol.push(item);
                }
            });

            doc.setFontSize(8);

            // Left column
            leftCol.forEach((item, idx) => {
                const isNotable = item.startsWith('*');
                if (isNotable) {
                    doc.setTextColor(...notableColor);
                } else {
                    doc.setTextColor(...textPrimary);
                }

                const truncated = item.length > 35 ? item.substring(0, 32) + '...' : item;
                doc.text(truncated, margin, yPos + (idx * 4));
            });

            // Right column
            rightCol.forEach((item, idx) => {
                const isNotable = item.startsWith('*');
                if (isNotable) {
                    doc.setTextColor(...notableColor);
                } else {
                    doc.setTextColor(...textPrimary);
                }

                const truncated = item.length > 35 ? item.substring(0, 32) + '...' : item;
                doc.text(truncated, margin + colWidth + 10, yPos + (idx * 4));
            });

            yPos += Math.max(leftCol.length, rightCol.length) * 4;

            // Notable species legend
            if (hasNotable) {
                yPos += 2;
                doc.setFontSize(7);
                doc.setTextColor(...notableColor);
                doc.text('* Notable/rare species for this area', margin, yPos);
            }
        } else {
            doc.setFontSize(8);
            doc.setTextColor(...textSecondary);
            doc.text('No recent observations available', margin, yPos);
        }

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
            'Data from eBird (Cornell Lab of Ornithology). Generated by Birding Hotspots Finder.',
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
