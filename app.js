// Configuration
const BASE_URL = '/.netlify/functions/getWeather';

// DOM Elements
const elements = {
    // Inputs & Forms
    searchForm: document.getElementById('search-form'),
    cityInput: document.getElementById('city-input'),
    locationBtn: document.getElementById('location-btn'),
    errorMsg: document.getElementById('search-error'),

    // Toggles
    unitToggle: document.getElementById('unit-toggle'),
    themeBtn: document.getElementById('theme-btn'),

    // History
    historyList: document.getElementById('history-list'),

    // Main UI
    loadingOverlay: document.getElementById('loading-overlay'),
    weatherContent: document.getElementById('weather-content'),
    currentDate: document.getElementById('current-date'),

    // Current Weather
    cityName: document.getElementById('city-name'),
    countryName: document.getElementById('country-name'),
    currentIcon: document.getElementById('current-icon'),
    currentTemp: document.getElementById('current-temp'),
    weatherDesc: document.getElementById('weather-desc'),
    feelsLike: document.getElementById('feels-like'),
    humidity: document.getElementById('humidity'),
    windSpeed: document.getElementById('wind-speed'),

    // Forecast
    forecastContainer: document.getElementById('forecast-container'),

    // Hourly Forecast
    hourlySection: document.getElementById('hourly-section'),
    hourlyTitle: document.getElementById('hourly-title'),
    hourlyChart: document.getElementById('hourly-chart'),
    hourlyDetails: document.getElementById('hourly-details')
};

// State
let state = {
    city: localStorage.getItem('lastCity') || 'London',
    isMetric: localStorage.getItem('isMetric') !== 'false', // Default true
    isDarkMode: localStorage.getItem('theme') === 'dark',
    history: JSON.parse(localStorage.getItem('weatherHistory')) || [],
    fullForecast: null,
    hourlyChartInstance: null,
    lastFetchedData: false
};

// Initialize App
function initApp() {
    setupEventListeners();
    applyTheme(state.isDarkMode);
    elements.unitToggle.checked = !state.isMetric; // Checkbox checked = Fahrenheit
    updateDate();
    renderHistory();

    // Attempt Geolocation first if no history
    if (!localStorage.getItem('lastCity')) {
        getUserLocation();
    } else {
        getWeatherData(state.city);
    }
}

// Event Listeners
function setupEventListeners() {
    // Search form
    elements.searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const city = elements.cityInput.value.trim();
        if (city) {
            getWeatherData(city);
            elements.cityInput.value = '';
            elements.cityInput.blur();
        }
    });

    // Location Button
    elements.locationBtn.addEventListener('click', getUserLocation);

    // Unit Toggle
    elements.unitToggle.addEventListener('change', (e) => {
        state.isMetric = !e.target.checked;
        localStorage.setItem('isMetric', state.isMetric);
        // Re-fetch data to get correct units
        if (state.lastFetchedData) {
            getWeatherData(state.city); // Refresh API call with new units
        }
    });

    // Theme Toggle
    elements.themeBtn.addEventListener('click', () => {
        state.isDarkMode = !state.isDarkMode;
        localStorage.setItem('theme', state.isDarkMode ? 'dark' : 'light');
        applyTheme(state.isDarkMode);
    });
}

// Core API Calls
async function getWeatherData(city, lat = null, lon = null) {
    showLoading(true);
    elements.errorMsg.classList.add('hidden');

    const units = state.isMetric ? 'metric' : 'imperial';
    let queryParams = city ? `q=${city}` : `lat=${lat}&lon=${lon}`;

    try {
        // Fetch Current Weather
        const weatherRes = await fetch(`${BASE_URL}?endpoint=weather&${queryParams}&units=${units}`);
        if (!weatherRes.ok) {
            if (weatherRes.status === 401) throw new Error('Invalid API Key');
            throw new Error('City not found');
        }
        const weatherData = await weatherRes.json();

        // Fetch Forecast
        const forecastRes = await fetch(`${BASE_URL}?endpoint=forecast&${queryParams}&units=${units}`);
        const forecastData = await forecastRes.json();

        // Update successful state
        state.city = weatherData.name;
        state.lastFetchedData = true;
        state.fullForecast = forecastData.list;
        localStorage.setItem('lastCity', state.city);
        addToHistory(state.city);

        // Update UI
        updateCurrentWeather(weatherData);
        updateForecast(forecastData);

        // Show today's hourly forecast by default (next 8 3-hour blocks)
        renderHourlyForecast(forecastData.list.slice(0, 8), "Today's Overview");

        updateBackground(weatherData.weather[0].id, weatherData.sys.sunset, weatherData.dt);

        // Show content
        elements.weatherContent.classList.remove('hidden');

    } catch (error) {
        console.error("API Error:", error);
        elements.errorMsg.classList.remove('hidden');
        if (error.message === 'Invalid API Key') {
            elements.errorMsg.textContent = "Invalid API Key. Verify your Netlify environment variables.";
        } else {
            elements.errorMsg.textContent = "City not found. Please try again.";
        }
    } finally {
        showLoading(false);
    }
}

function getUserLocation() {
    if (navigator.geolocation) {
        showLoading(true);
        navigator.geolocation.getCurrentPosition(
            position => {
                getWeatherData(null, position.coords.latitude, position.coords.longitude);
            },
            error => {
                console.error("Geolocation error:", error);
                getWeatherData(state.city); // Fallback to last requested city
            }
        );
    } else {
        alert("Geolocation is not supported by your browser.");
        getWeatherData(state.city);
    }
}

// UI Updates
function updateCurrentWeather(data) {
    const unitSymbol = state.isMetric ? '°C' : '°F';
    const speedUnit = state.isMetric ? 'km/h' : 'mph';

    elements.cityName.textContent = data.name;
    elements.countryName.textContent = getCountryName(data.sys.country);
    elements.currentTemp.textContent = Math.round(data.main.temp) + '°';
    elements.weatherDesc.textContent = data.weather[0].description;

    elements.feelsLike.textContent = Math.round(data.main.feels_like) + '°';
    elements.humidity.textContent = data.main.humidity + '%';

    // Convert m/s to km/h if metric
    let windSpeedVal = state.isMetric ? (data.wind.speed * 3.6) : data.wind.speed;
    elements.windSpeed.textContent = Math.round(windSpeedVal) + ' ' + speedUnit;

    const iconCode = data.weather[0].icon;
    elements.currentIcon.src = `https://openweathermap.org/img/wn/${iconCode}@4x.png`;
}

function updateForecast(data) {
    elements.forecastContainer.innerHTML = '';

    // Filter to get one reading per day (around noon)
    const dailyData = data.list.filter(item => item.dt_txt.includes('12:00:00'));

    // If current time is past noon, today might be missed, ensure 5 days
    let forecastList = dailyData.length === 5 ? dailyData : data.list.filter((_, i) => i % 8 === 0).slice(0, 5);

    forecastList.forEach(day => {
        const date = new Date(day.dt * 1000);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const shortDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        const iconCode = day.weather[0].icon;
        const tempHigh = Math.round(day.main.temp_max);
        const tempLow = Math.round(day.main.temp_min);

        const card = document.createElement('div');
        card.className = 'forecast-card glass-panel flat';
        card.innerHTML = `
            <div>
                <div class="date-day">${dayName}</div>
                <div class="date-short">${shortDate}</div>
            </div>
            <img src="https://openweathermap.org/img/wn/${iconCode}@2x.png" alt="Weather icon">
            <div class="temps">
                <span class="temp-high">${tempHigh}°</span>
                <span class="temp-low">${tempLow}°</span>
            </div>
        `;

        // Click event to update hourly forecast
        card.addEventListener('click', () => {
            // Find all hourly data for this specific day
            const targetDateStr = day.dt_txt.split(' ')[0];
            const dayHourlyData = state.fullForecast.filter(item => item.dt_txt.startsWith(targetDateStr));

            // If we have less than 8 items for a specific day, we still show what we have
            const title = `${dayName}, ${shortDate} Overview`;
            renderHourlyForecast(dayHourlyData, title);

            // Highlight selected card
            document.querySelectorAll('.forecast-card').forEach(c => c.style.borderColor = '');
            card.style.borderColor = 'var(--accent-color)';
            card.style.background = 'rgba(255, 255, 255, 0.15)';
        });

        elements.forecastContainer.appendChild(card);
    });
}

function renderHourlyForecast(hourlyData, title) {
    if (!hourlyData || hourlyData.length === 0) return;

    elements.hourlySection.classList.remove('hidden');
    elements.hourlyTitle.textContent = title;

    const times = [];
    const temps = [];
    const icons = [];
    const winds = [];

    const unitSymbol = state.isMetric ? '°C' : '°F';
    const speedUnit = state.isMetric ? 'km/h' : 'mph';

    hourlyData.forEach(item => {
        const date = new Date(item.dt * 1000);
        times.push(date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
        temps.push(Math.round(item.main.temp));
        icons.push(item.weather[0].icon);
        let windSpeedVal = state.isMetric ? (item.wind.speed * 3.6) : item.wind.speed;
        winds.push(Math.round(windSpeedVal));
    });

    // Render Chart
    const ctx = elements.hourlyChart.getContext('2d');

    if (state.hourlyChartInstance) {
        state.hourlyChartInstance.destroy();
    }

    // Chart styles based on theme
    const textColor = state.isDarkMode ? '#94a3b8' : '#64748b';
    const gridColor = state.isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    const accentColor = state.isDarkMode ? '#60a5fa' : '#3b82f6';

    // Register DataLabels Plugin
    Chart.register(ChartDataLabels);

    state.hourlyChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: times,
            datasets: [{
                label: 'Temperature',
                data: temps,
                borderColor: '#fbbf24', // Sun/warm accent color
                backgroundColor: 'rgba(251, 191, 36, 0.1)',
                borderWidth: 3,
                pointBackgroundColor: '#fbbf24',
                pointBorderColor: state.isDarkMode ? '#1e293b' : '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4 // Smooth curves
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 25,
                    bottom: 10,
                    left: 10,
                    right: 15
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                },
                datalabels: {
                    color: state.isDarkMode ? '#f8fafc' : '#1e293b',
                    anchor: 'end',
                    align: 'top',
                    offset: 4,
                    font: {
                        family: 'Inter',
                        weight: 'bold',
                        size: 13
                    },
                    formatter: function (value) {
                        return value + '°';
                    }
                }
            },
            scales: {
                x: {
                    display: false, // Hide x-axis labels inside chart, we'll draw them below
                    grid: {
                        display: false
                    }
                },
                y: {
                    display: false,
                    min: Math.min(...temps) - 2,
                    max: Math.max(...temps) + 3,
                    grid: {
                        display: false
                    }
                }
            }
        }
    });

    // Render Details (Icons, Wind, Time) below graph
    elements.hourlyDetails.innerHTML = '';

    for (let i = 0; i < hourlyData.length; i++) {
        const detailDiv = document.createElement('div');
        detailDiv.className = 'hourly-item';
        detailDiv.innerHTML = `
            <img src="https://openweathermap.org/img/wn/${icons[i]}@2x.png" alt="icon" title="${hourlyData[i].weather[0].description}">
            <div class="hourly-wind" title="Wind Speed">
                <i class="fa-solid fa-wind"></i> ${winds[i]}
            </div>
            <div class="hourly-time">${times[i]}</div>
        `;
        elements.hourlyDetails.appendChild(detailDiv);
    }
}

function updateBackground(weatherId, sunset, currentDt) {
    // Remove old background classes
    document.body.classList.remove('bg-default', 'bg-clear', 'bg-clouds', 'bg-rain', 'bg-snow', 'bg-thunder');

    // Clear animated elements
    const bgContainer = document.getElementById('animated-bg');
    bgContainer.innerHTML = '';

    const isNight = currentDt > sunset;

    if (weatherId >= 200 && weatherId < 300) {
        document.body.classList.add('bg-thunder');
        // Add lightning and rain
        bgContainer.innerHTML += '<div class="lightning"></div>';
        createParticles(bgContainer, 'raindrop', 40);
    } else if (weatherId >= 300 && weatherId < 600) {
        document.body.classList.add('bg-rain');
        // Add rain and clouds
        createParticles(bgContainer, 'cloud', 3);
        createParticles(bgContainer, 'raindrop', 60);
    } else if (weatherId >= 600 && weatherId < 700) {
        document.body.classList.add('bg-snow');
        // Add snow
        createParticles(bgContainer, 'snowflake', 100);
    } else if (weatherId >= 700 && weatherId < 800) {
        document.body.classList.add('bg-clouds');
        createParticles(bgContainer, 'cloud', 5);
    } else if (weatherId === 800) {
        document.body.classList.add(isNight ? 'bg-default' : 'bg-clear');
        if (isNight) {
            bgContainer.innerHTML += '<div class="moon"></div>';
        } else {
            bgContainer.innerHTML += '<div class="sun"></div>';
        }
    } else if (weatherId > 800) {
        document.body.classList.add('bg-clouds');
        createParticles(bgContainer, 'cloud', 6);
        if (weatherId === 801 || weatherId === 802) {
            // Partially cloudy, show sun/moon slightly behind
            if (isNight) {
                bgContainer.innerHTML += '<div class="moon" style="opacity: 0.5;"></div>';
            } else {
                bgContainer.innerHTML += '<div class="sun" style="opacity: 0.5;"></div>';
            }
        }
    } else {
        document.body.classList.add('bg-default');
    }
}

// Helper for generating multiple animated particles
function createParticles(container, className, count) {
    for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.className = className;

        // Randomize positions and animation delays
        if (className === 'cloud') {
            el.style.top = `${Math.random() * 40}%`;
            el.style.left = `-${Math.random() * 20}%`;
            el.style.transform = `scale(${0.5 + Math.random()})`;
            el.style.animationDuration = `${20 + Math.random() * 30}s`;
            el.style.animationDelay = `-${Math.random() * 20}s`;
        } else if (className === 'raindrop' || className === 'snowflake') {
            el.style.left = `${Math.random() * 100}%`;
            el.style.animationDuration = `${0.5 + Math.random()}s`;
            el.style.animationDelay = `${Math.random()}s`;

            if (className === 'snowflake') {
                el.style.animationDuration = `${3 + Math.random() * 5}s`;
                el.style.opacity = Math.random();
            }
        }

        container.appendChild(el);
    }
}

// Utility Functions
function showLoading(show) {
    if (show) {
        elements.loadingOverlay.classList.remove('hidden');
    } else {
        elements.loadingOverlay.classList.add('hidden');
    }
}

function updateDate() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    elements.currentDate.textContent = new Date().toLocaleDateString('en-US', options);
}

function applyTheme(isDark) {
    if (isDark) {
        document.body.classList.add('dark-mode');
        elements.themeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
    } else {
        document.body.classList.remove('dark-mode');
        elements.themeBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
}

function getCountryName(countryCode) {
    try {
        const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
        return regionNames.of(countryCode);
    } catch {
        return countryCode;
    }
}

// History Management
function addToHistory(city) {
    // Prevent duplicates
    state.history = state.history.filter(item => item.toLowerCase() !== city.toLowerCase());

    // Add to front
    state.history.unshift(city);

    // Keep only last 5
    if (state.history.length > 5) state.history.pop();

    localStorage.setItem('weatherHistory', JSON.stringify(state.history));
    renderHistory();
}

function renderHistory() {
    elements.historyList.innerHTML = '';

    if (state.history.length === 0) {
        elements.historyList.innerHTML = '<li style="color:var(--text-secondary);font-size:0.85rem;padding-left:1rem;">No recent searches</li>';
        return;
    }

    state.history.forEach(city => {
        const li = document.createElement('li');
        li.className = 'history-item';
        li.innerHTML = `
            <i class="fa-solid fa-clock-rotate-left"></i>
            <span>${city}</span>
        `;
        li.addEventListener('click', () => {
            elements.cityInput.value = city;
            getWeatherData(city);
        });
        elements.historyList.appendChild(li);
    });
}

// Run app
document.addEventListener('DOMContentLoaded', initApp);
