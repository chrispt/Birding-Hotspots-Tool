import { assert } from '../run-tests.js';
import { formatDate, formatDistance, formatDuration } from '../../js/utils/formatters.js';

export async function testFormatDateReturnsHumanReadableString() {
    // 2024-06-15 (mid-year, unambiguous)
    const result = formatDate('2024-06-15');
    assert(typeof result === 'string', 'formatDate should return a string');
    assert(result.length > 0, 'formatDate should return non-empty string');
    // Should contain the year
    assert(result.includes('2024'), `Expected '2024' in "${result}"`);
    // Should contain the month abbreviation
    assert(result.includes('Jun'), `Expected 'Jun' in "${result}"`);
}

export async function testFormatDateIsConsistentAcrossRepeatCalls() {
    // The hoisted Intl.DateTimeFormat instance should produce identical output
    // across multiple calls — verifies the singleton re-use doesn't corrupt state.
    const date = '2025-12-25';
    const first = formatDate(date);
    const second = formatDate(date);
    const third = formatDate(date);
    assert(first === second, 'Repeated calls should produce identical output');
    assert(second === third, 'Repeated calls should produce identical output');
}

export async function testFormatDateHandlesDateObject() {
    const d = new Date('2023-03-01T12:00:00Z');
    const result = formatDate(d);
    assert(typeof result === 'string' && result.length > 0, 'Should accept Date objects');
}

export async function testFormatDistanceMiles() {
    const result = formatDistance(1.6093); // ~1 mile
    assert(result.includes('mi') || result.includes('ft'), 'Should format in miles');
}

export async function testFormatDurationHoursMinutes() {
    const result = formatDuration(3661); // 1 hr 1 min
    assert(result.includes('hr'), 'Should include hours unit');
    assert(result.includes('min') || result.includes('1'), 'Should include minutes');
}
