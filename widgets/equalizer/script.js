// Audio context and variables
let audioContext;
let analyser;
let source;
let gainNode;
let mediaStream;
let isMonitoring = false;
let isMonitoringEnabled = false;
let animationFrameId;
let devices = [];
let startTime = Date.now();
let visualizationType = 'bars'; // Default visualization type: 'bars', 'line', 'area'
let holdPeaks = true; // Whether to hold peak values
let peakValues = []; // Array to store peak values
let logScale = true; // Whether to use logarithmic scaling for frequency

// DOM Elements
const splashScreen = document.querySelector('.splash-screen');
const mainContent = document.querySelector('.main-content');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const monitorToggle = document.getElementById('monitorToggle');
const deviceSelect = document.getElementById('deviceSelect');
const inputTypeSelect = document.getElementById('inputTypeSelect');
const spectrumCanvas = document.getElementById('spectrumCanvas');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const uptimeElement = document.getElementById('uptime');
const deviceName = document.getElementById('deviceName');
const sampleRate = document.getElementById('sampleRate');
const channels = document.getElementById('channels');
const latency = document.getElementById('latency');
const frequencyBands = document.getElementById('frequencyBands');
const spectrumColor = document.getElementById('spectrumColor');
const spectrumScale = document.getElementById('spectrumScale');

// Canvas context
const spectrumCtx = spectrumCanvas.getContext('2d');

// Toggle audio monitoring
function toggleMonitoring() {
    isMonitoringEnabled = !isMonitoringEnabled;
    if (gainNode) {
        gainNode.gain.value = isMonitoringEnabled ? 1 : 0;
    }
    monitorToggle.innerHTML = `<i class="fas fa-headphones"></i> Monitor ${isMonitoringEnabled ? 'On' : 'Off'}`;
    monitorToggle.classList.toggle('btn-primary', !isMonitoringEnabled);
    monitorToggle.classList.toggle('btn-success', isMonitoringEnabled);
}

// Initialize the application
async function init() {
    try {
        // Request device permissions
        await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Get available audio devices
        await getAudioDevices();
        
        // Initialize audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        gainNode = audioContext.createGain();
        gainNode.gain.value = 0; // Start with monitoring off
        
        // Configure analyser
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        analyser.minDecibels = -90;
        analyser.maxDecibels = -10;
        
        // Set initial canvas size
        handleResize();
        
        // Create visualization type controls
        createVisualizationControls();
        
        // Hide splash screen and show main content
        setTimeout(() => {
            splashScreen.style.opacity = '0';
            setTimeout(() => {
                splashScreen.style.display = 'none';
                mainContent.style.display = 'flex';
            }, 500);
        }, 2000);
        
        // Add event listeners
        startButton.addEventListener('click', startMonitoring);
        stopButton.addEventListener('click', stopMonitoring);
        monitorToggle.addEventListener('click', toggleMonitoring);
        deviceSelect.addEventListener('change', handleDeviceChange);
        inputTypeSelect.addEventListener('change', handleInputTypeChange);
        spectrumColor.addEventListener('input', updateSpectrumColor);
        spectrumScale.addEventListener('change', updateSpectrumScale);
        
        // Initialize status
        updateStatus('ready', 'System ready');
        
        // Start uptime counter
        setInterval(updateUptime, 1000);
        
    } catch (error) {
        console.error('Initialization error:', error);
        updateStatus('error', 'Failed to initialize audio system');
    }
}

// Create visualization controls
function createVisualizationControls() {
    // Find the controls container
    const controlsContainer = document.querySelector('.controls');
    
    // Create visualization type control
    const visualizationTypeGroup = document.createElement('div');
    visualizationTypeGroup.className = 'input-group';
    visualizationTypeGroup.innerHTML = `
        <label><i class="fas fa-chart-line"></i> Visualization</label>
        <select id="visualizationType">
            <option value="bars">Bars</option>
            <option value="line">Line</option>
            <option value="area">Area</option>
        </select>
    `;
    controlsContainer.appendChild(visualizationTypeGroup);
    
    // Create peak hold control
    const peakHoldGroup = document.createElement('div');
    peakHoldGroup.className = 'input-group';
    peakHoldGroup.innerHTML = `
        <label><i class="fas fa-thumbtack"></i> Peak Hold</label>
        <select id="peakHold">
            <option value="true" selected>On</option>
            <option value="false">Off</option>
        </select>
    `;
    controlsContainer.appendChild(peakHoldGroup);
    
    // Create frequency scale control
    const frequencyScaleGroup = document.createElement('div');
    frequencyScaleGroup.className = 'input-group';
    frequencyScaleGroup.innerHTML = `
        <label><i class="fas fa-ruler"></i> Scale</label>
        <select id="frequencyScale">
            <option value="log" selected>Logarithmic</option>
            <option value="linear">Linear</option>
        </select>
    `;
    controlsContainer.appendChild(frequencyScaleGroup);
    
    // Add event listeners
    document.getElementById('visualizationType').addEventListener('change', (e) => {
        visualizationType = e.target.value;
    });
    
    document.getElementById('peakHold').addEventListener('change', (e) => {
        holdPeaks = e.target.value === 'true';
        if (!holdPeaks) {
            peakValues = [];
        }
    });
    
    document.getElementById('frequencyScale').addEventListener('change', (e) => {
        logScale = e.target.value === 'log';
    });
}

// Get available audio devices
async function getAudioDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioDevices = devices.filter(device => device.kind === 'audioinput');
        
        // Clear existing options
        deviceSelect.innerHTML = '';
        
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = 'default';
        defaultOption.textContent = 'Default Input';
        deviceSelect.appendChild(defaultOption);
        
        // Add available devices
        audioDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Microphone ${device.deviceId.slice(0, 5)}`;
            deviceSelect.appendChild(option);
        });
        
    } catch (error) {
        console.error('Error getting audio devices:', error);
        updateStatus('error', 'Failed to get audio devices');
    }
}

// Handle device change
async function handleDeviceChange() {
    if (isMonitoring) {
        await stopMonitoring();
    }
    await startMonitoring();
}

// Handle input type change
async function handleInputTypeChange() {
    if (isMonitoring) {
        await stopMonitoring();
    }
    await startMonitoring();
}

// Start audio monitoring
async function startMonitoring() {
    try {
        const constraints = {
            audio: {
                deviceId: deviceSelect.value === 'default' ? undefined : { exact: deviceSelect.value },
                echoCancellation: inputTypeSelect.value === 'line',
                noiseSuppression: inputTypeSelect.value === 'line',
                autoGainControl: inputTypeSelect.value === 'line'
            }
        };
        
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        source = audioContext.createMediaStreamSource(mediaStream);
        
        // Create a splitter to send audio to both analyzer and monitor paths
        const splitter = audioContext.createChannelSplitter(2);
        source.connect(splitter);
        
        // Connect one path to the analyzer for visualization
        splitter.connect(analyser);
        
        // Connect another path through the gain node for monitoring
        splitter.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Update device info
        const track = mediaStream.getAudioTracks()[0];
        const settings = track.getSettings();
        deviceName.textContent = settings.label || 'Unknown Device';
        sampleRate.textContent = `${settings.sampleRate} Hz`;
        channels.textContent = settings.channelCount || '1';
        latency.textContent = `${Math.round(settings.latency * 1000)} ms`;
        
        isMonitoring = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        deviceSelect.disabled = true;
        inputTypeSelect.disabled = true;
        
        updateStatus('success', 'Monitoring active');
        
        // Ensure canvas is properly sized before starting animation
        handleResize();
        
        // Reset peak values array
        if (holdPeaks) {
            peakValues = new Array(analyser.frequencyBinCount).fill(0);
        }
        
        animate();
        
    } catch (error) {
        console.error('Error starting monitoring:', error);
        updateStatus('error', 'Failed to start monitoring');
    }
}

// Stop audio monitoring
async function stopMonitoring() {
    try {
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
        }
        
        if (source) {
            source.disconnect();
        }
        
        isMonitoring = false;
        startButton.disabled = false;
        stopButton.disabled = true;
        deviceSelect.disabled = false;
        inputTypeSelect.disabled = false;
        
        // Clear canvas
        const width = spectrumCanvas.width;
        const height = spectrumCanvas.height;
        spectrumCtx.fillStyle = 'rgba(0, 0, 0, 1)';
        spectrumCtx.fillRect(0, 0, width, height);
        
        // Draw frequency labels
        drawFrequencyLabels(width, height);
        
        updateStatus('warning', 'Monitoring stopped');
        
    } catch (error) {
        console.error('Error stopping monitoring:', error);
        updateStatus('error', 'Failed to stop monitoring');
    }
}

// Update status indicator
function updateStatus(type, message) {
    statusIndicator.className = type;
    statusText.textContent = message;
}

// Update uptime counter
function updateUptime() {
    const elapsed = Date.now() - startTime;
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    uptimeElement.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Update spectrum color
function updateSpectrumColor() {
    // Color will be used in the drawSpectrum function
}

// Update spectrum scale
function updateSpectrumScale() {
    // Scale will be used in the drawSpectrum function
}

// Animation loop
function animate() {
    if (!isMonitoring) return;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Get frequency data
    analyser.getByteFrequencyData(dataArray);
    
    // Update visualizations
    drawSpectrum(dataArray);
    updateFrequencyBands(dataArray);
    
    animationFrameId = requestAnimationFrame(animate);
}

// Draw frequency labels
function drawFrequencyLabels(width, height) {
    const padding = 40; // Padding for labels
    const labelHeight = height - padding * 2;
    
    // Draw background for labels
    spectrumCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    spectrumCtx.fillRect(0, padding, 50, labelHeight);
    spectrumCtx.fillRect(width - 50, padding, 50, labelHeight);
    
    // Draw frequency labels on both sides
    spectrumCtx.fillStyle = '#ffffff';
    spectrumCtx.font = '12px sans-serif';
    spectrumCtx.textAlign = 'right';
    
    const frequencies = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    const nyquist = audioContext ? audioContext.sampleRate / 2 : 22050;
    
    frequencies.forEach(freq => {
        if (freq <= nyquist) {
            // Calculate position for logarithmic scale
            let yPos;
            if (logScale) {
                // Log scale (more natural for audio)
                yPos = height - padding - (Math.log10(freq / 20) / Math.log10(nyquist / 20)) * labelHeight;
            } else {
                // Linear scale
                yPos = height - padding - (freq / nyquist) * labelHeight;
            }
            
            // Format frequency label
            let freqLabel = freq < 1000 ? `${freq} Hz` : `${freq / 1000} kHz`;
            
            // Draw left side label
            spectrumCtx.textAlign = 'right';
            spectrumCtx.fillText(freqLabel, 45, yPos + 4);
            
            // Draw right side label
            spectrumCtx.textAlign = 'left';
            spectrumCtx.fillText(freqLabel, width - 45, yPos + 4);
            
            // Draw tick marks
            spectrumCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            spectrumCtx.beginPath();
            spectrumCtx.moveTo(50, yPos);
            spectrumCtx.lineTo(width - 50, yPos);
            spectrumCtx.stroke();
        }
    });
}

// Draw spectrum
function drawSpectrum(data) {
    const width = spectrumCanvas.width;
    const height = spectrumCanvas.height;
    const scale = parseFloat(spectrumScale.value);
    const padding = 40; // Padding for frequency labels
    
    // Clear canvas with black
    spectrumCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    spectrumCtx.fillRect(0, 0, width, height);
    
    // Draw frequency labels
    drawFrequencyLabels(width, height);
    
    // Calculate drawing area
    const drawArea = {
        x: 50, // Left padding for labels
        y: padding,
        width: width - 100, // Subtract padding for both sides
        height: height - padding * 2
    };
    
    // Choose drawing method based on visualization type
    switch (visualizationType) {
        case 'bars':
            drawBars(data, drawArea, scale);
            break;
        case 'line':
            drawLine(data, drawArea, scale);
            break;
        case 'area':
            drawArea(data, drawArea, scale);
            break;
        default:
            drawBars(data, drawArea, scale);
    }
    
    // Update peak values if peak hold is enabled
    if (holdPeaks && peakValues.length === data.length) {
        for (let i = 0; i < data.length; i++) {
            peakValues[i] = Math.max(peakValues[i], data[i]);
        }
    }
}

// Draw bar visualization
function drawBars(data, area, scale) {
    const barWidth = area.width / (data.length / 4); // Only display lower frequencies
    let x = area.x;
    
    for (let i = 0; i < data.length / 4; i++) {
        // Calculate bar position and height
        let barHeight;
        let normalizedIndex = i / (data.length / 4);
        
        // Apply logarithmic or linear scaling for frequency domain
        let dataIndex;
        if (logScale) {
            // Logarithmic scale gives more space to lower frequencies (more natural for audio)
            dataIndex = Math.floor(Math.pow(normalizedIndex, 2) * (data.length / 4));
        } else {
            // Linear scale
            dataIndex = i;
        }
        
        // Get the frequency value and scale it
        barHeight = (data[dataIndex] / 255) * area.height * scale;
        
        // Create gradient for the bar
        const gradient = spectrumCtx.createLinearGradient(x, area.y + area.height, x, area.y + area.height - barHeight);
        gradient.addColorStop(0, spectrumColor.value);
        gradient.addColorStop(1, adjustColor(spectrumColor.value, -20));
        
        // Draw the bar
        spectrumCtx.fillStyle = gradient;
        spectrumCtx.fillRect(x, area.y + area.height - barHeight, barWidth - 1, barHeight);
        
        // Draw peak if enabled
        if (holdPeaks && peakValues.length > dataIndex) {
            const peakHeight = (peakValues[dataIndex] / 255) * area.height * scale;
            spectrumCtx.fillStyle = adjustColor(spectrumColor.value, 30);
            spectrumCtx.fillRect(x, area.y + area.height - peakHeight, barWidth - 1, 2);
        }
        
        x += barWidth;
    }
}

// Draw line visualization
function drawLine(data, area, scale) {
    spectrumCtx.strokeStyle = spectrumColor.value;
    spectrumCtx.lineWidth = 2;
    spectrumCtx.beginPath();
    
    let x = area.x;
    
    for (let i = 0; i < data.length / 4; i++) {
        // Calculate point position
        let normalizedIndex = i / (data.length / 4);
        
        // Apply logarithmic or linear scaling for frequency domain
        let dataIndex;
        if (logScale) {
            // Logarithmic scale
            dataIndex = Math.floor(Math.pow(normalizedIndex, 2) * (data.length / 4));
        } else {
            // Linear scale
            dataIndex = i;
        }
        
        // Calculate height
        const pointHeight = (data[dataIndex] / 255) * area.height * scale;
        const y = area.y + area.height - pointHeight;
        
        if (i === 0) {
            spectrumCtx.moveTo(x, y);
        } else {
            spectrumCtx.lineTo(x, y);
        }
        
        x += area.width / (data.length / 4);
    }
    
    spectrumCtx.stroke();
    
    // Draw peak line if enabled
    if (holdPeaks && peakValues.length > 0) {
        spectrumCtx.strokeStyle = adjustColor(spectrumColor.value, 30);
        spectrumCtx.beginPath();
        
        x = area.x;
        
        for (let i = 0; i < data.length / 4; i++) {
            // Calculate point position
            let normalizedIndex = i / (data.length / 4);
            
            // Apply logarithmic or linear scaling
            let dataIndex;
            if (logScale) {
                dataIndex = Math.floor(Math.pow(normalizedIndex, 2) * (data.length / 4));
            } else {
                dataIndex = i;
            }
            
            // Calculate peak height
            const peakHeight = (peakValues[dataIndex] / 255) * area.height * scale;
            const y = area.y + area.height - peakHeight;
            
            if (i === 0) {
                spectrumCtx.moveTo(x, y);
            } else {
                spectrumCtx.lineTo(x, y);
            }
            
            x += area.width / (data.length / 4);
        }
        
        spectrumCtx.stroke();
    }
}

// Draw area visualization
function drawArea(data, area, scale) {
    // Start the path at the bottom left
    spectrumCtx.beginPath();
    spectrumCtx.moveTo(area.x, area.y + area.height);
    
    let x = area.x;
    
    // Draw the upper part of the area (the frequency data)
    for (let i = 0; i < data.length / 4; i++) {
        // Calculate point position
        let normalizedIndex = i / (data.length / 4);
        
        // Apply logarithmic or linear scaling for frequency domain
        let dataIndex;
        if (logScale) {
            // Logarithmic scale
            dataIndex = Math.floor(Math.pow(normalizedIndex, 2) * (data.length / 4));
        } else {
            // Linear scale
            dataIndex = i;
        }
        
        // Calculate height
        const pointHeight = (data[dataIndex] / 255) * area.height * scale;
        const y = area.y + area.height - pointHeight;
        
        spectrumCtx.lineTo(x, y);
        
        x += area.width / (data.length / 4);
    }
    
    // Close the path back to the starting point
    spectrumCtx.lineTo(area.x + area.width, area.y + area.height);
    spectrumCtx.closePath();
    
    // Create gradient fill
    const gradient = spectrumCtx.createLinearGradient(0, area.y, 0, area.y + area.height);
    gradient.addColorStop(0, adjustColor(spectrumColor.value, 20));
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    
    // Fill the area
    spectrumCtx.fillStyle = gradient;
    spectrumCtx.fill();
    
    // Draw outline
    spectrumCtx.strokeStyle = spectrumColor.value;
    spectrumCtx.lineWidth = 2;
    spectrumCtx.stroke();
    
    // Draw peak line if enabled
    if (holdPeaks && peakValues.length > 0) {
        spectrumCtx.strokeStyle = adjustColor(spectrumColor.value, 30);
        spectrumCtx.beginPath();
        
        x = area.x;
        
        for (let i = 0; i < data.length / 4; i++) {
            // Calculate point position
            let normalizedIndex = i / (data.length / 4);
            
            // Apply logarithmic or linear scaling
            let dataIndex;
            if (logScale) {
                dataIndex = Math.floor(Math.pow(normalizedIndex, 2) * (data.length / 4));
            } else {
                dataIndex = i;
            }
            
            // Calculate peak height
            const peakHeight = (peakValues[dataIndex] / 255) * area.height * scale;
            const y = area.y + area.height - peakHeight;
            
            if (i === 0) {
                spectrumCtx.moveTo(x, y);
            } else {
                spectrumCtx.lineTo(x, y);
            }
            
            x += area.width / (data.length / 4);
        }
        
        spectrumCtx.stroke();
    }
}

// Update frequency bands
function updateFrequencyBands(data) {
    const bands = [
        { name: '60Hz', range: [0, 2] },
        { name: '170Hz', range: [2, 5] },
        { name: '310Hz', range: [5, 10] },
        { name: '600Hz', range: [10, 20] },
        { name: '1kHz', range: [20, 40] },
        { name: '3kHz', range: [40, 80] },
        { name: '6kHz', range: [80, 160] },
        { name: '12kHz', range: [160, 320] },
        { name: '14kHz', range: [320, 511] }
    ];
    
    frequencyBands.innerHTML = '';
    
    bands.forEach(band => {
        let sum = 0;
        let count = 0;
        
        for (let i = band.range[0]; i < band.range[1]; i++) {
            sum += data[i];
            count++;
        }
        
        const average = sum / count;
        const level = Math.min(100, (average / 128) * 100);
        
        const bandElement = document.createElement('div');
        bandElement.className = 'band';
        bandElement.innerHTML = `
            <div>${band.name}</div>
            <div class="meter-bar" style="width: ${level}%"></div>
        `;
        
        frequencyBands.appendChild(bandElement);
    });
}

// Helper function to adjust color brightness
function adjustColor(color, amount) {
    const hex = color.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.substr(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.substr(2, 2), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.substr(4, 2), 16) + amount));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Handle window resize
function handleResize() {
    const container = spectrumCanvas.parentElement;
    const rect = container.getBoundingClientRect();
    
    // Get device pixel ratio for high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    
    // Set canvas size to match container size with proper scaling
    spectrumCanvas.width = rect.width * dpr;
    spectrumCanvas.height = rect.height * dpr;
    
    // Scale the canvas for high-DPI displays
    spectrumCtx.scale(dpr, dpr);
    
    // Set the display size (CSS)
    spectrumCanvas.style.width = `${rect.width}px`;
    spectrumCanvas.style.height = `${rect.height}px`;
    
    // Draw frequency labels
    drawFrequencyLabels(rect.width, rect.height);
    
    // Debug logging
    console.log('Canvas resized:', {
        width: spectrumCanvas.width,
        height: spectrumCanvas.height,
        cssWidth: rect.width,
        cssHeight: rect.height,
        dpr: dpr
    });
}

window.addEventListener('resize', handleResize);
window.addEventListener('load', init); 