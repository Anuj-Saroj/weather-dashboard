exports.handler = async function (event, context) {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { endpoint, q, lat, lon, units } = event.queryStringParameters;

    if (endpoint !== 'weather' && endpoint !== 'forecast') {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid endpoint' }) };
    }

    const API_KEY = process.env.OPENWEATHER_API_KEY;

    if (!API_KEY) {
        console.error('API key not found in environment variables.');
        return { statusCode: 500, body: JSON.stringify({ error: 'Missing API Key configuration' }) };
    }

    const BASE_URL = 'https://api.openweathermap.org/data/2.5';
    let query = q ? `q=${q}` : `lat=${lat}&lon=${lon}`;

    try {
        const response = await fetch(`${BASE_URL}/${endpoint}?${query}&units=${units}&appid=${API_KEY}`);

        if (!response.ok) {
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: `API request failed: ${response.statusText}` })
            };
        }

        const data = await response.json();

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error('Error fetching weather data:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server Error connecting to OpenWeather' })
        };
    }
};
