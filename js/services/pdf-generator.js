/**
 * PDF Report generation service
 * Uses jsPDF library loaded via CDN
 */

import { formatDistance, formatDate, getGoogleMapsDirectionsUrl, getEbirdHotspotUrl } from '../utils/formatters.js';
import { generateCanvasMap } from './map-service.js';
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
    doc.text(`Sorted by: ${sortMethod === 'species' ? 'Most Species' : 'Closest Distance'}`, margin, yPos);
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

        // Distance
        doc.text(`Distance: ${formatDistance(hotspot.distance)}`, margin, yPos);
        yPos += 5;

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
 * @param {string} prefix - Filename prefix
 */
export function downloadPDF(doc, prefix = 'birding-hotspots') {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${prefix}-${timestamp}.pdf`;
    doc.save(filename);
}
