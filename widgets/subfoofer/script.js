// DOM Elements
const splashScreen = document.getElementById('splash-screen');
const app = document.getElementById('app');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeBtn = document.querySelector('.close-btn');
const saveSettingsBtn = document.getElementById('save-settings');
const cancelSettingsBtn = document.getElementById('cancel-settings');
const tabBtns = document.querySelectorAll('.tab-btn');
const startTestBtn = document.getElementById('start-test');
const stopTestBtn = document.getElementById('stop-test');
const saveResultsBtn = document.getElementById('save-results');
const amplitudeSlider = document.getElementById('amplitude');
const amplitudeValue = document.getElementById('amplitude-value');
const frequencyMin = document.getElementById('frequency-min');
const frequencyMax = document.getElementById('frequency-max');
const testType = document.getElementById('test-type');
const duration = document.getElementById('duration');

// Audio Context and Analyzer
let audioContext;
let analyzer;
let source;
let oscillator;
let gainNode;
let testRunning = false;
let testData = {
    type: '',
    startTime: null,
    endTime: null,
    results: {}
};

// Charts
let frequencyChart;
let waveformChart;
let spectrogramChart;

// Initialize application after splash screen
document.addEventListener('DOMContentLoaded', () => {
    // Simulate loading time with the splash screen
    setTimeout(() => {
        splashScreen.style.opacity = '0';
        setTimeout(() => {
            splashScreen.classList.add('hidden');
            app.classList.remove('hidden');
            initializeApp();
        }, 500);
    }, 3000); // 3 seconds for splash screen
});

// Initialize the application
function initializeApp() {
    // Initialize audio context
    try {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContext();
        
        // Create analyzer node
        analyzer = audioContext.createAnalyser();
        analyzer.fftSize = 2048;
        
        // Create gain node
        gainNode = audioContext.createGain();
        gainNode.gain.value = 0.5; // Default value
        
        // Connect the nodes
        gainNode.connect(analyzer);
        analyzer.connect(audioContext.destination);
        
        // Initialize charts
        initializeCharts();
        
    } catch (e) {
        alert('Web Audio API is not supported in this browser');
        console.error(e);
    }
    
    // Initialize UI event listeners
    initializeEventListeners();
    
    // Populate audio devices
    populateAudioDevices();
}

// Initialize event listeners
function initializeEventListeners() {
    // Settings modal
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
    });
    
    closeBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });
    
    saveSettingsBtn.addEventListener('click', () => {
        // Save settings logic would go here
        settingsModal.classList.add('hidden');
    });
    
    cancelSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });
    
    // Tab switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabId = e.target.dataset.tab;
            
            // Update active button
            tabBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            // Update active graph
            document.querySelectorAll('.graph-container').forEach(g => g.classList.remove('active-graph'));
            document.getElementById(`${tabId}-graph`).classList.add('active-graph');
        });
    });
    
    // Amplitude slider
    amplitudeSlider.addEventListener('input', (e) => {
        const value = e.target.value;
        amplitudeValue.textContent = value;
        
        if (gainNode) {
            // Convert from dB to linear scale (dB = 20 * log10(linear))
            gainNode.gain.value = Math.pow(10, value / 20);
        }
    });
    
    // Start test button
    startTestBtn.addEventListener('click', () => {
        if (!testRunning) {
            startTest();
        }
    });
    
    // Stop test button
    stopTestBtn.addEventListener('click', () => {
        if (testRunning) {
            stopTest();
        }
    });
    
    // Save results button
    saveResultsBtn.addEventListener('click', () => {
        if (!testRunning && testData.results) {
            saveTestResults();
        }
    });
    
    // Frequency input validation
    frequencyMin.addEventListener('change', validateFrequencyRange);
    frequencyMax.addEventListener('change', validateFrequencyRange);
}

// Validate frequency range
function validateFrequencyRange() {
    let min = parseInt(frequencyMin.value);
    let max = parseInt(frequencyMax.value);
    
    if (min >= max) {
        min = max - 10;
        frequencyMin.value = min;
    }
    
    if (min < 20) {
        min = 20;
        frequencyMin.value = min;
    }
    
    if (max > 200) {
        max = 200;
        frequencyMax.value = max;
    }
}

// Initialize charts
function initializeCharts() {
    // Frequency Response Chart
    const freqCtx = document.getElementById('frequency-canvas').getContext('2d');
    frequencyChart = new Chart(freqCtx, {
        type: 'line',
        data: {
            labels: [...Array(100).keys()].map(i => (i * 2) + 20), // 20Hz to 200Hz
            datasets: [{
                label: 'Frequency Response',
                data: Array(100).fill(0),
                borderColor: 'rgba(0, 200, 255, 1)',
                backgroundColor: 'rgba(0, 200, 255, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(30, 30, 30, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#00c8ff'
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        display: false
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        display: false
                    },
                    min: -20,
                    max: 6
                }
            },
            animation: {
                duration: 0
            }
        }
    });
    
    // Waveform Chart
    const waveCtx = document.getElementById('waveform-canvas').getContext('2d');
    waveformChart = new Chart(waveCtx, {
        type: 'line',
        data: {
            labels: [...Array(100).keys()],
            datasets: [{
                label: 'Waveform',
                data: Array(100).fill(0),
                borderColor: 'rgba(98, 0, 234, 1)',
                backgroundColor: 'transparent',
                borderWidth: 2,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        display: false
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        display: false
                    },
                    min: -1,
                    max: 1
                }
            },
            animation: {
                duration: 0
            }
        }
    });
    
    // Spectrogram (simulated with another line chart for simplicity)
    const spectroCtx = document.getElementById('spectrogram-canvas').getContext('2d');
    spectrogramChart = new Chart(spectroCtx, {
        type: 'line',
        data: {
            labels: [...Array(100).keys()],
            datasets: [{
                label: 'Spectrogram',
                data: Array(100).fill(0).map(() => Math.random() * 20 - 10),
                borderColor: 'rgba(0, 229, 160, 1)',
                backgroundColor: 'rgba(0, 229, 160, 0.1)',
                borderWidth: 2,
                tension: 0.2,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        display: false
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        display: false
                    },
                    min: -20,
                    max: 20
                }
            },
            animation: {
                duration: 0
            }
        }
    });
}

// Populate audio devices
async function populateAudioDevices() {
    try {
        const inputSelect = document.getElementById('input-device');
        const outputSelect = document.getElementById('output-device');
        
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            const devices = await navigator.mediaDevices.enumerateDevices();
            
            // Clear existing options
            inputSelect.innerHTML = '';
            outputSelect.innerHTML = '';
            
            // Add input devices
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            audioInputs.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Microphone ${inputSelect.length + 1}`;
                inputSelect.appendChild(option);
            });
            
            // Add output devices
            const audioOutputs = devices.filter(device => device.kind === 'audiooutput');
            audioOutputs.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Speaker ${outputSelect.length + 1}`;
                outputSelect.appendChild(option);
            });
        }
    } catch (err) {
        console.error('Error enumerating audio devices:', err);
    }
}

// Start the test
function startTest() {
    // Request microphone access if needed
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            testRunning = true;
            testData = {
                type: testType.value,
                startTime: new Date(),
                endTime: null,
                results: {}
            };
            
            startTestBtn.disabled = true;
            stopTestBtn.disabled = false;
            saveResultsBtn.disabled = true;
            
            // Update UI status
            document.querySelector('.status-text').textContent = 'TEST RUNNING';
            
            // Create and configure oscillator based on test type
            oscillator = audioContext.createOscillator();
            
            const minFreq = parseInt(frequencyMin.value);
            const maxFreq = parseInt(frequencyMax.value);
            const testDuration = parseInt(duration.value) * 1000;
            
            switch(testType.value) {
                case 'sweep':
                    oscillator.type = 'sine';
                    oscillator.frequency.setValueAtTime(minFreq, audioContext.currentTime);
                    oscillator.frequency.linearRampToValueAtTime(maxFreq, audioContext.currentTime + testDuration / 1000);
                    break;
                case 'sine':
                    oscillator.type = 'sine';
                    oscillator.frequency.value = (minFreq + maxFreq) / 2;
                    break;
                case 'noise':
                    // Pink noise approximation using multiple oscillators
                    oscillator.type = 'sawtooth';
                    oscillator.frequency.value = 100;
                    break;
                case 'pulse':
                    oscillator.type = 'square';
                    oscillator.frequency.value = 50;
                    break;
            }
            
            // Connect oscillator to gain node
            oscillator.connect(gainNode);
            oscillator.start();
            
            // Set up the analyzer
            analyzer.smoothingTimeConstant = 0.85;
            const bufferLength = analyzer.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            
            // Start visualization
            const updateVisualization = () => {
                if (!testRunning) return;
                
                requestAnimationFrame(updateVisualization);
                
                // Update frequency data
                analyzer.getByteFrequencyData(dataArray);
                
                // Update charts with new data
                updateCharts(dataArray);
                
                // Update metrics
                updateMetrics(dataArray);
            };
            
            updateVisualization();
            
            // Stop test after specified duration
            setTimeout(() => {
                if (testRunning) {
                    stopTest();
                }
            }, testDuration);
        })
        .catch(err => {
            console.error('Error accessing microphone:', err);
            alert('Unable to access microphone. Please check your permissions.');
        });
}

// Stop the test
function stopTest() {
    if (oscillator) {
        oscillator.stop();
        oscillator.disconnect();
        oscillator = null;
    }
    
    testRunning = false;
    testData.endTime = new Date();
    
    startTestBtn.disabled = false;
    stopTestBtn.disabled = true;
    saveResultsBtn.disabled = false;
    
    // Update UI status
    document.querySelector('.status-text').textContent = 'TEST COMPLETED';
    
    // Generate test analysis
    generateAnalysis();
}

// Update charts with new data
function updateCharts(dataArray) {
    // Update frequency response chart (only use the lower portion of the spectrum for subwoofer)
    const frequencyData = Array.from(dataArray.slice(0, 100))
        .map(value => (value / 255) * 26 - 20); // Map to dB range (-20 to +6)
    
    frequencyChart.data.datasets[0].data = frequencyData;
    frequencyChart.update();
    
    // Update waveform chart (using time domain data)
    const waveformData = new Uint8Array(analyzer.fftSize);
    analyzer.getByteTimeDomainData(waveformData);
    
    const waveformNormalized = Array.from(waveformData.slice(0, 100))
        .map(value => (value / 128) - 1); // Map to range -1 to 1
    
    waveformChart.data.datasets[0].data = waveformNormalized;
    waveformChart.update();
    
    // Update spectrogram chart (simulated for this demo)
    const spectrogramData = Array.from({ length: 100 }, () => {
        return Math.random() * 40 - 20;
    });
    
    spectrogramChart.data.datasets[0].data = spectrogramData;
    spectrogramChart.update();
}

// Update metrics
function updateMetrics(dataArray) {
    // Calculate peak SPL (simulated for this demo)
    const peakIndex = dataArray.indexOf(Math.max(...dataArray));
    const peakValue = (dataArray[peakIndex] / 255) * 26 - 20 + Math.random() * 2;
    document.getElementById('peak-spl').textContent = `${peakValue.toFixed(1)} dB`;
    
    // Calculate resonant frequency (simulated for this demo)
    const resonantFreq = 20 + (peakIndex * 1.8);
    document.getElementById('resonant-freq').textContent = `${resonantFreq.toFixed(1)} Hz`;
    
    // Calculate power (simulated for this demo)
    const power = 20 + Math.random() * 60;
    document.getElementById('power-reading').textContent = `${power.toFixed(1)} W`;
    
    // Calculate distortion (simulated for this demo)
    const distortion = 0.1 + Math.random() * 2;
    document.getElementById('distortion').textContent = `${distortion.toFixed(2)} %`;
    
    // Store results for analysis
    testData.results = {
        peakSPL: peakValue.toFixed(1),
        resonantFreq: resonantFreq.toFixed(1),
        power: power.toFixed(1),
        distortion: distortion.toFixed(2)
    };
}

// Generate analysis
function generateAnalysis() {
    const analysisResults = document.getElementById('analysis-results');
    
    // Create analysis text based on test results
    const resonantFreq = parseFloat(testData.results.resonantFreq);
    const distortion = parseFloat(testData.results.distortion);
    
    let analysisText = '';
    
    if (resonantFreq < 30) {
        analysisText += 'Subwoofer exhibits excellent low-frequency extension. ';
    } else if (resonantFreq < 40) {
        analysisText += 'Subwoofer shows good low-frequency performance. ';
    } else {
        analysisText += 'Subwoofer has limited low-frequency extension. ';
    }
    
    if (distortion < 1.0) {
        analysisText += 'Distortion levels are exceptionally low, indicating high quality driver and enclosure design. ';
    } else if (distortion < 2.0) {
        analysisText += 'Distortion levels are within acceptable range. ';
    } else {
        analysisText += 'Distortion levels are higher than optimal, suggesting potential issues with driver or enclosure. ';
    }
    
    analysisText += `Test was performed using ${testData.type} test signal over ${duration.value} seconds.`;
    
    analysisResults.innerHTML = `<p>${analysisText}</p>`;
}

// Save test results
function saveTestResults() {
    // In a real application, this would save to a file or database
    // For this demo, we'll just log to console
    console.log('Test Results:', testData);
    
    // Create a simulated download
    const resultsString = JSON.stringify(testData, null, 2);
    const blob = new Blob([resultsString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `subwoofer_test_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('Test results saved successfully!');
} 