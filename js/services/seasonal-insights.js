/**
 * Seasonal Insights Service
 * Provides seasonal analysis, migration alerts, and optimal birding times
 */

import { MIGRATION_WINDOWS, OPTIMAL_BIRDING_TIMES, MONTHLY_ACTIVITY, SEASONS } from '../data/migration-patterns.js';

/**
 * Get the current season based on date
 * @param {Date} date - Date to check (defaults to today)
 * @returns {string} Season name: 'spring', 'summer', 'fall', or 'winter'
 */
export function getCurrentSeason(date = new Date()) {
    const month = date.getMonth() + 1;
    const day = date.getDate();

    // Check each season
    if (isDateInRange(month, day, SEASONS.spring)) return 'spring';
    if (isDateInRange(month, day, SEASONS.summer)) return 'summer';
    if (isDateInRange(month, day, SEASONS.fall)) return 'fall';
    return 'winter';
}

/**
 * Check if a date falls within a range (handles year wraparound for winter)
 * @param {number} month - Month (1-12)
 * @param {number} day - Day of month
 * @param {Object} range - Range with startMonth, startDay, endMonth, endDay
 * @returns {boolean}
 */
function isDateInRange(month, day, range) {
    const { startMonth, startDay, endMonth, endDay } = range;

    // Handle winter which spans year boundary
    if (startMonth > endMonth) {
        // Date is in the later part of year (Dec) or early part (Jan-Mar)
        if (month > startMonth || (month === startMonth && day >= startDay)) return true;
        if (month < endMonth || (month === endMonth && day <= endDay)) return true;
        return false;
    }

    // Normal range within same year
    if (month > startMonth && month < endMonth) return true;
    if (month === startMonth && day >= startDay) return true;
    if (month === endMonth && day <= endDay) return true;
    return false;
}

/**
 * Check if a date falls within a migration period
 * @param {Date} date - Date to check
 * @param {Object} period - Period with start, peak, end dates
 * @returns {Object} { inPeriod: boolean, isPeak: boolean, daysUntilPeak: number }
 */
function checkMigrationPeriod(date, period) {
    const month = date.getMonth() + 1;
    const day = date.getDate();

    const startDate = new Date(date.getFullYear(), period.start.month - 1, period.start.day);
    const peakDate = new Date(date.getFullYear(), period.peak.month - 1, period.peak.day);
    const endDate = new Date(date.getFullYear(), period.end.month - 1, period.end.day);

    // Adjust for year boundary if needed
    if (endDate < startDate) {
        endDate.setFullYear(endDate.getFullYear() + 1);
    }

    const checkDate = new Date(date.getFullYear(), month - 1, day);

    const inPeriod = checkDate >= startDate && checkDate <= endDate;

    // Consider "peak" to be +/- 7 days from peak date
    const peakStart = new Date(peakDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const peakEnd = new Date(peakDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const isPeak = checkDate >= peakStart && checkDate <= peakEnd;

    // Calculate days until peak
    const daysUntilPeak = Math.round((peakDate - checkDate) / (24 * 60 * 60 * 1000));

    return { inPeriod, isPeak, daysUntilPeak };
}

/**
 * Get active migration alerts for today
 * @param {Date} date - Date to check (defaults to today)
 * @returns {Array} Array of active migration alerts
 */
export function getActiveMigrationAlerts(date = new Date()) {
    const alerts = [];

    for (const [key, migration] of Object.entries(MIGRATION_WINDOWS)) {
        // Check spring migration
        const springCheck = checkMigrationPeriod(date, migration.spring);
        if (springCheck.inPeriod) {
            alerts.push({
                group: migration.name,
                type: 'spring',
                isPeak: springCheck.isPeak,
                daysUntilPeak: springCheck.daysUntilPeak,
                message: springCheck.isPeak
                    ? `Peak ${migration.name.toLowerCase()} migration!`
                    : `${migration.name} spring migration underway`
            });
        }

        // Check fall migration
        const fallCheck = checkMigrationPeriod(date, migration.fall);
        if (fallCheck.inPeriod) {
            alerts.push({
                group: migration.name,
                type: 'fall',
                isPeak: fallCheck.isPeak,
                daysUntilPeak: fallCheck.daysUntilPeak,
                message: fallCheck.isPeak
                    ? `Peak ${migration.name.toLowerCase()} migration!`
                    : `${migration.name} fall migration underway`
            });
        }
    }

    // Sort by peak status (peak alerts first) then by days until peak
    alerts.sort((a, b) => {
        if (a.isPeak !== b.isPeak) return b.isPeak - a.isPeak;
        return Math.abs(a.daysUntilPeak) - Math.abs(b.daysUntilPeak);
    });

    return alerts;
}

/**
 * Get optimal birding times for current season
 * @param {Date} date - Date to check (defaults to today)
 * @returns {Object} Optimal times with activity levels
 */
export function getOptimalBirdingTimes(date = new Date()) {
    const season = getCurrentSeason(date);
    return OPTIMAL_BIRDING_TIMES[season];
}

/**
 * Get monthly activity data for sparkline visualization
 * @returns {Array} Array of 12 monthly activity values (1-10)
 */
export function getMonthlyActivityData() {
    return Object.values(MONTHLY_ACTIVITY);
}

/**
 * Get activity level for current month
 * @param {Date} date - Date to check (defaults to today)
 * @returns {Object} { level: number, description: string }
 */
export function getCurrentMonthActivity(date = new Date()) {
    const month = date.getMonth() + 1;
    const level = MONTHLY_ACTIVITY[month];

    let description;
    if (level >= 9) description = 'Excellent';
    else if (level >= 7) description = 'Very Good';
    else if (level >= 5) description = 'Good';
    else description = 'Moderate';

    return { level, description };
}

/**
 * Generate seasonal insights summary for display
 * @param {Date} date - Date to check (defaults to today)
 * @returns {Object} Complete seasonal insights data
 */
export function getSeasonalInsights(date = new Date()) {
    const season = getCurrentSeason(date);
    const migrationAlerts = getActiveMigrationAlerts(date);
    const optimalTimes = getOptimalBirdingTimes(date);
    const monthlyActivity = getMonthlyActivityData();
    const currentActivity = getCurrentMonthActivity(date);

    // Format season name
    const seasonName = season.charAt(0).toUpperCase() + season.slice(1);

    // Get best time recommendation - collect all high-activity periods
    const times = optimalTimes;
    const highActivityPeriods = [];

    if (times.morning.activity === 'high') {
        highActivityPeriods.push(`${times.morning.start}AM - ${times.morning.end}AM`);
    }
    if (times.midday.activity === 'high') {
        highActivityPeriods.push(`${times.midday.start}AM - ${times.midday.end > 12 ? times.midday.end - 12 : times.midday.end}PM`);
    }
    if (times.evening.activity === 'high') {
        highActivityPeriods.push(`${times.evening.start > 12 ? times.evening.start - 12 : times.evening.start}PM - ${times.evening.end > 12 ? times.evening.end - 12 : times.evening.end}PM`);
    }

    let bestTimeRecommendation;
    if (highActivityPeriods.length > 0) {
        bestTimeRecommendation = `Best time: ${highActivityPeriods.join(' or ')}`;
    } else {
        // Fallback to midday if no high activity periods (shouldn't happen with current data)
        bestTimeRecommendation = `Best time: ${times.midday.start}AM - ${times.midday.end > 12 ? times.midday.end - 12 : times.midday.end}PM`;
    }

    return {
        season: seasonName,
        currentActivity,
        migrationAlerts,
        optimalTimes,
        monthlyActivity,
        bestTimeRecommendation,
        // Summary message
        summary: migrationAlerts.length > 0 && migrationAlerts[0].isPeak
            ? `${migrationAlerts[0].message} ${bestTimeRecommendation}`
            : `${seasonName} birding conditions: ${currentActivity.description}. ${bestTimeRecommendation}`
    };
}

/**
 * Analyze observation timestamps to determine hotspot-specific activity patterns
 * @param {Array} observations - Array of observation objects with obsDt timestamps
 * @returns {Object} Activity breakdown by time of day
 */
export function analyzeHotspotActivity(observations) {
    if (!observations || observations.length === 0) {
        return null;
    }

    const timeSlots = {
        earlyMorning: { count: 0, label: '5-8 AM' },
        morning: { count: 0, label: '8-11 AM' },
        midday: { count: 0, label: '11 AM-2 PM' },
        afternoon: { count: 0, label: '2-5 PM' },
        evening: { count: 0, label: '5-8 PM' }
    };

    let hasTimeData = false;

    for (const obs of observations) {
        if (!obs.obsDt) continue;

        // eBird dates may or may not include time
        const dateStr = obs.obsDt;

        // Check if time is included (format: "2024-01-15 08:30")
        if (dateStr.includes(' ')) {
            hasTimeData = true;
            const timePart = dateStr.split(' ')[1];
            const hour = parseInt(timePart.split(':')[0], 10);

            if (hour >= 5 && hour < 8) timeSlots.earlyMorning.count++;
            else if (hour >= 8 && hour < 11) timeSlots.morning.count++;
            else if (hour >= 11 && hour < 14) timeSlots.midday.count++;
            else if (hour >= 14 && hour < 17) timeSlots.afternoon.count++;
            else if (hour >= 17 && hour < 20) timeSlots.evening.count++;
        }
    }

    if (!hasTimeData) {
        return null;
    }

    // Calculate total and percentages
    const total = Object.values(timeSlots).reduce((sum, slot) => sum + slot.count, 0);

    if (total === 0) return null;

    const result = {};
    for (const [key, slot] of Object.entries(timeSlots)) {
        result[key] = {
            ...slot,
            percentage: Math.round((slot.count / total) * 100)
        };
    }

    // Find best time
    const bestSlot = Object.entries(result).reduce((best, [key, slot]) =>
        slot.percentage > best.percentage ? { key, ...slot } : best
    , { percentage: 0 });

    result.bestTime = bestSlot.label;
    result.total = total;

    return result;
}
