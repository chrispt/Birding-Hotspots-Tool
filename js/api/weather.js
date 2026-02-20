/**
 * Weather API client using Open-Meteo (free, no API key required)
 */

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

/**
 * WMO Weather interpretation codes
 * https://open-meteo.com/en/docs#weathervariables
 */
const WEATHER_CODES = {
    0: { description: 'Clear sky', icon: 'sun', condition: 'clear' },
    1: { description: 'Mainly clear', icon: 'sun', condition: 'clear' },
    2: { description: 'Partly cloudy', icon: 'cloudSun', condition: 'cloudy' },
    3: { description: 'Overcast', icon: 'cloud', condition: 'cloudy' },
    45: { description: 'Fog', icon: 'fog', condition: 'fog' },
    48: { description: 'Depositing rime fog', icon: 'fog', condition: 'fog' },
    51: { description: 'Light drizzle', icon: 'drizzle', condition: 'rain' },
    53: { description: 'Moderate drizzle', icon: 'drizzle', condition: 'rain' },
    55: { description: 'Dense drizzle', icon: 'drizzle', condition: 'rain' },
    56: { description: 'Light freezing drizzle', icon: 'drizzle', condition: 'rain' },
    57: { description: 'Dense freezing drizzle', icon: 'drizzle', condition: 'rain' },
    61: { description: 'Slight rain', icon: 'rain', condition: 'rain' },
    63: { description: 'Moderate rain', icon: 'rain', condition: 'rain' },
    65: { description: 'Heavy rain', icon: 'rain', condition: 'rain' },
    66: { description: 'Light freezing rain', icon: 'rain', condition: 'rain' },
    67: { description: 'Heavy freezing rain', icon: 'rain', condition: 'rain' },
    71: { description: 'Slight snow', icon: 'snow', condition: 'snow' },
    73: { description: 'Moderate snow', icon: 'snow', condition: 'snow' },
    75: { description: 'Heavy snow', icon: 'snow', condition: 'snow' },
    77: { description: 'Snow grains', icon: 'snow', condition: 'snow' },
    80: { description: 'Slight rain showers', icon: 'rain', condition: 'rain' },
    81: { description: 'Moderate rain showers', icon: 'rain', condition: 'rain' },
    82: { description: 'Violent rain showers', icon: 'rain', condition: 'rain' },
    85: { description: 'Slight snow showers', icon: 'snow', condition: 'snow' },
    86: { description: 'Heavy snow showers', icon: 'snow', condition: 'snow' },
    95: { description: 'Thunderstorm', icon: 'thunderstorm', condition: 'storm' },
    96: { description: 'Thunderstorm with slight hail', icon: 'thunderstorm', condition: 'storm' },
    99: { description: 'Thunderstorm with heavy hail', icon: 'thunderstorm', condition: 'storm' }
};

/**
 * Get weather description from WMO code
 * @param {number} code - WMO weather code
 * @returns {Object} Weather info with description, icon, and condition
 */
export function getWeatherInfo(code) {
    return WEATHER_CODES[code] || { description: 'Unknown', icon: 'cloud', condition: 'unknown' };
}

/**
 * Convert wind direction in degrees to compass direction
 * @param {number} degrees - Wind direction in degrees
 * @returns {string} Compass direction (N, NE, E, etc.)
 */
export function getWindDirection(degrees) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
}

/**
 * Convert Celsius to Fahrenheit
 * @param {number} celsius - Temperature in Celsius
 * @returns {number} Temperature in Fahrenheit
 */
export function celsiusToFahrenheit(celsius) {
    return Math.round((celsius * 9/5) + 32);
}

/**
 * Convert km/h to mph
 * @param {number} kmh - Speed in km/h
 * @returns {number} Speed in mph
 */
export function kmhToMph(kmh) {
    return Math.round(kmh * 0.621371);
}

/**
 * Calculate birding condition score based on weather
 * @param {Object} weather - Weather data object
 * @returns {Object} Score and rating
 */
export function getBirdingConditionScore(weather) {
    if (!weather) return { score: 0, rating: 'unknown' };

    let score = 100;

    // Temperature factor (50-70°F is optimal)
    const tempF = weather.temperatureF;
    if (tempF < 32) score -= 30;
    else if (tempF < 40) score -= 20;
    else if (tempF < 50) score -= 10;
    else if (tempF > 90) score -= 25;
    else if (tempF > 80) score -= 15;
    else if (tempF > 70) score -= 5;

    // Wind factor (calm is best)
    const windMph = weather.windSpeedMph;
    if (windMph > 25) score -= 30;
    else if (windMph > 15) score -= 20;
    else if (windMph > 10) score -= 10;
    else if (windMph > 5) score -= 5;

    // Precipitation factor
    if (weather.precipitationProbability > 70) score -= 30;
    else if (weather.precipitationProbability > 50) score -= 20;
    else if (weather.precipitationProbability > 30) score -= 10;

    // Weather condition factor
    const condition = weather.condition;
    if (condition === 'storm') score -= 40;
    else if (condition === 'rain') score -= 25;
    else if (condition === 'snow') score -= 30;
    else if (condition === 'fog') score -= 15;

    score = Math.max(0, Math.min(100, score));

    let rating;
    if (score >= 80) rating = 'excellent';
    else if (score >= 60) rating = 'good';
    else if (score >= 40) rating = 'fair';
    else rating = 'poor';

    return { score, rating };
}

/**
 * Format a Date object to 12-hour time string (e.g., "6:42 AM")
 * @param {Date} date
 * @returns {string}
 */
function formatTime12h(date) {
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
}

/**
 * Parse sunrise/sunset from Open-Meteo daily data and compute golden hours
 * @param {Object} daily - data.daily from Open-Meteo response
 * @returns {Object} Sun time fields
 */
function parseSunTimes(daily) {
    if (!daily?.sunrise?.[0] || !daily?.sunset?.[0]) {
        return {};
    }

    const sunriseDate = new Date(daily.sunrise[0]);
    const sunsetDate = new Date(daily.sunset[0]);

    const daylightMs = sunsetDate - sunriseDate;
    const daylightHours = Math.round((daylightMs / 3600000) * 10) / 10;

    // Golden hour: first hour after sunrise, last hour before sunset
    const goldenMorningEnd = new Date(sunriseDate.getTime() + 3600000);
    const goldenEveningStart = new Date(sunsetDate.getTime() - 3600000);

    return {
        sunrise: formatTime12h(sunriseDate),
        sunset: formatTime12h(sunsetDate),
        sunriseDate,
        sunsetDate,
        daylightHours,
        goldenHourMorning: { start: formatTime12h(sunriseDate), end: formatTime12h(goldenMorningEnd) },
        goldenHourEvening: { start: formatTime12h(goldenEveningStart), end: formatTime12h(sunsetDate) }
    };
}

/**
 * Check if the current time falls within a golden hour window
 * @param {Object} weather - Weather data with sunriseDate/sunsetDate
 * @returns {string|null} 'morning' or 'evening' if in golden hour, null otherwise
 */
export function getGoldenHourStatus(weather) {
    if (!weather?.sunriseDate || !weather?.sunsetDate) return null;

    const now = new Date();
    const morningEnd = new Date(weather.sunriseDate.getTime() + 3600000);
    const eveningStart = new Date(weather.sunsetDate.getTime() - 3600000);

    if (now >= weather.sunriseDate && now <= morningEnd) return 'morning';
    if (now >= eveningStart && now <= weather.sunsetDate) return 'evening';
    return null;
}

/**
 * Fetch weather data for a single location
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Object>} Weather data
 */
export async function getWeatherForLocation(lat, lng) {
    const params = new URLSearchParams({
        latitude: lat.toFixed(4),
        longitude: lng.toFixed(4),
        current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
        daily: 'sunrise,sunset',
        hourly: 'precipitation_probability',
        temperature_unit: 'celsius',
        wind_speed_unit: 'kmh',
        timezone: 'auto',
        forecast_days: 1
    });

    try {
        const response = await fetch(`${OPEN_METEO_BASE}?${params}`);

        if (!response.ok) {
            throw new Error(`Weather API error: ${response.status}`);
        }

        const data = await response.json();

        // Get current hour's precipitation probability
        const currentHour = new Date().getHours();
        const precipProb = data.hourly?.precipitation_probability?.[currentHour] || 0;

        const weatherInfo = getWeatherInfo(data.current.weather_code);

        // Parse sunrise/sunset from daily data
        const sunData = parseSunTimes(data.daily);

        return {
            temperatureC: Math.round(data.current.temperature_2m),
            temperatureF: celsiusToFahrenheit(data.current.temperature_2m),
            humidity: Math.round(data.current.relative_humidity_2m),
            precipitation: data.current.precipitation,
            precipitationProbability: precipProb,
            weatherCode: data.current.weather_code,
            description: weatherInfo.description,
            icon: weatherInfo.icon,
            condition: weatherInfo.condition,
            windSpeedKmh: Math.round(data.current.wind_speed_10m),
            windSpeedMph: kmhToMph(data.current.wind_speed_10m),
            windDirection: getWindDirection(data.current.wind_direction_10m),
            windDirectionDegrees: data.current.wind_direction_10m,
            ...sunData
        };
    } catch (error) {
        console.warn(`Weather fetch failed for ${lat}, ${lng}:`, error);
        return null;
    }
}

/**
 * Fetch weather data for multiple locations in parallel
 * @param {Array<{lat: number, lng: number}>} locations - Array of locations
 * @param {Function} onProgress - Progress callback (current, total)
 * @returns {Promise<Array>} Array of weather data (or null for failed requests)
 */
export async function getWeatherForLocations(locations, onProgress = null) {
    // Process in batches to avoid overwhelming the API
    const batchSize = 10;
    const results = [];

    for (let i = 0; i < locations.length; i += batchSize) {
        const batch = locations.slice(i, i + batchSize);
        const batchPromises = batch.map(loc => getWeatherForLocation(loc.lat, loc.lng));
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        if (onProgress) {
            onProgress(Math.min(i + batchSize, locations.length), locations.length);
        }

        // Small delay between batches to be respectful to the API
        if (i + batchSize < locations.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    return results;
}

/**
 * Get overall birding conditions summary for a set of weather data
 * @param {Array} weatherDataArray - Array of weather data objects
 * @returns {Object} Summary with average conditions and recommendation
 */
export function getOverallBirdingConditions(weatherDataArray) {
    const validData = weatherDataArray.filter(w => w !== null);

    if (validData.length === 0) {
        return { rating: 'unknown', message: 'Weather data unavailable' };
    }

    // Calculate average score
    const scores = validData.map(w => getBirdingConditionScore(w).score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    let rating, message;
    if (avgScore >= 80) {
        rating = 'excellent';
        message = 'Excellent birding conditions today';
    } else if (avgScore >= 60) {
        rating = 'good';
        message = 'Good birding conditions today';
    } else if (avgScore >= 40) {
        rating = 'fair';
        message = 'Fair birding conditions - some weather factors to consider';
    } else {
        rating = 'poor';
        message = 'Challenging birding conditions today';
    }

    return { rating, message, score: Math.round(avgScore) };
}
