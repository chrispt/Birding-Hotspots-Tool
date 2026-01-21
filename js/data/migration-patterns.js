/**
 * Migration Patterns Data
 * Static migration window data for major bird groups
 * Note: These are approximate dates for North America (temperate regions)
 */

/**
 * Migration windows for major bird groups
 * Each entry has spring and fall migration periods with peak dates
 */
export const MIGRATION_WINDOWS = {
    warblers: {
        name: 'Warblers',
        spring: {
            start: { month: 4, day: 15 },  // April 15
            peak: { month: 5, day: 5 },     // May 5
            end: { month: 5, day: 25 }      // May 25
        },
        fall: {
            start: { month: 8, day: 15 },   // August 15
            peak: { month: 9, day: 15 },    // September 15
            end: { month: 10, day: 15 }     // October 15
        }
    },
    shorebirds: {
        name: 'Shorebirds',
        spring: {
            start: { month: 4, day: 1 },    // April 1
            peak: { month: 5, day: 15 },    // May 15
            end: { month: 6, day: 1 }       // June 1
        },
        fall: {
            start: { month: 7, day: 15 },   // July 15
            peak: { month: 8, day: 25 },    // August 25
            end: { month: 10, day: 31 }     // October 31
        }
    },
    raptors: {
        name: 'Raptors',
        spring: {
            start: { month: 3, day: 1 },    // March 1
            peak: { month: 4, day: 15 },    // April 15
            end: { month: 5, day: 15 }      // May 15
        },
        fall: {
            start: { month: 9, day: 1 },    // September 1
            peak: { month: 10, day: 1 },    // October 1
            end: { month: 11, day: 15 }     // November 15
        }
    },
    waterfowl: {
        name: 'Waterfowl',
        spring: {
            start: { month: 2, day: 15 },   // February 15
            peak: { month: 3, day: 20 },    // March 20
            end: { month: 4, day: 30 }      // April 30
        },
        fall: {
            start: { month: 10, day: 1 },   // October 1
            peak: { month: 11, day: 15 },   // November 15
            end: { month: 12, day: 31 }     // December 31
        }
    },
    sparrows: {
        name: 'Sparrows',
        spring: {
            start: { month: 4, day: 1 },    // April 1
            peak: { month: 4, day: 25 },    // April 25
            end: { month: 5, day: 15 }      // May 15
        },
        fall: {
            start: { month: 9, day: 15 },   // September 15
            peak: { month: 10, day: 10 },   // October 10
            end: { month: 11, day: 15 }     // November 15
        }
    },
    hummingbirds: {
        name: 'Hummingbirds',
        spring: {
            start: { month: 3, day: 15 },   // March 15
            peak: { month: 4, day: 20 },    // April 20
            end: { month: 5, day: 15 }      // May 15
        },
        fall: {
            start: { month: 8, day: 1 },    // August 1
            peak: { month: 9, day: 1 },     // September 1
            end: { month: 10, day: 15 }     // October 15
        }
    }
};

/**
 * Optimal birding times by season
 * Based on general birding best practices
 */
export const OPTIMAL_BIRDING_TIMES = {
    spring: {
        morning: { start: 6, end: 10, activity: 'high' },
        midday: { start: 10, end: 15, activity: 'medium' },
        evening: { start: 15, end: 19, activity: 'high' }
    },
    summer: {
        morning: { start: 5, end: 9, activity: 'high' },
        midday: { start: 9, end: 17, activity: 'low' },
        evening: { start: 17, end: 20, activity: 'medium' }
    },
    fall: {
        morning: { start: 6, end: 10, activity: 'high' },
        midday: { start: 10, end: 15, activity: 'medium' },
        evening: { start: 15, end: 18, activity: 'high' }
    },
    winter: {
        morning: { start: 7, end: 11, activity: 'medium' },
        midday: { start: 11, end: 15, activity: 'high' },
        evening: { start: 15, end: 17, activity: 'medium' }
    }
};

/**
 * Monthly activity levels (general patterns)
 * Scale: 1-10 (10 = highest activity)
 */
export const MONTHLY_ACTIVITY = {
    1: 4,   // January - winter resident activity
    2: 5,   // February - early waterfowl movement
    3: 6,   // March - spring migration begins
    4: 8,   // April - spring migration peaks
    5: 10,  // May - peak spring migration
    6: 7,   // June - breeding season
    7: 6,   // July - early fall migration begins
    8: 7,   // August - shorebird migration
    9: 9,   // September - fall migration peaks
    10: 8,  // October - fall migration continues
    11: 5,  // November - late fall migration
    12: 4   // December - winter residents
};

/**
 * Seasonal date ranges (Northern Hemisphere)
 */
export const SEASONS = {
    spring: { startMonth: 3, startDay: 20, endMonth: 6, endDay: 20 },
    summer: { startMonth: 6, startDay: 21, endMonth: 9, endDay: 21 },
    fall: { startMonth: 9, startDay: 22, endMonth: 12, endDay: 20 },
    winter: { startMonth: 12, startDay: 21, endMonth: 3, endDay: 19 }
};
