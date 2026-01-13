class AudioMixer {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.masterAnalyser = null;
        this.channels = [];
        this.channelCount = 0;
        this.audioBufferCache = new Map(); // Cache for loaded audio buffers
        this._modalKeydownInitialized = false; // prevent multiple global keydown listeners
        this.midiAccess = null;
        this.midiInputs = new Map();
        this.midiMappings = {};
        this.pendingMidiLearn = null;
        this.midiStatusEl = null;
        this.midiDeviceSelect = null;
        this.selectedMidiDeviceId = localStorage.getItem('mixerSelectedMidiDevice') || 'all';
        
        // Initialize the mixer
        this.initializeMixer();
    }
    
    async initializeMixer() {
        try {
            // Create audio context with optimized settings for low latency
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const audioContextOptions = {
                latencyHint: 'interactive', // Optimize for low latency
                sampleRate: 48000 // Professional audio sample rate
            };
            this.audioContext = new AudioContext(audioContextOptions);
            
            // Log audio context details for debugging
            console.log(`Audio context state: ${this.audioContext.state}`);
            console.log(`Base latency: ${this.audioContext.baseLatency || 'Not supported'}`);
            console.log(`Sample rate: ${this.audioContext.sampleRate}`);
            
            // Check if context is in suspended state (autoplay policy)
            if (this.audioContext.state === 'suspended') {
                const resumeAudio = async () => {
                    await this.audioContext.resume();
                    console.log('AudioContext resumed successfully');
                    
                    // Remove event listeners once resumed
                    document.removeEventListener('click', resumeAudio);
                    document.removeEventListener('touchstart', resumeAudio);
                    document.removeEventListener('keydown', resumeAudio);
                };
                
                // Add event listeners for user gestures
                document.addEventListener('click', resumeAudio);
                document.addEventListener('touchstart', resumeAudio);
                document.addEventListener('keydown', resumeAudio);
                
                this.showPermissionBanner('Click anywhere to enable audio', 'info');
            }
            
            // Create master gain and analyzer
            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);
            this.masterGain.gain.value = 0.8;
            
    this.masterAnalyser = this.audioContext.createAnalyser();
    this.masterAnalyser.fftSize = 1024; // larger buffer for accurate RMS calculations
        this.masterGain.connect(this.masterAnalyser);
        
            // Start VU meter updates
            this.startVUMeterUpdates();
            
            // Set up event listeners
        this.setupEventListeners();
            
            // Initialize toggle-all button state
            this.updateToggleAllButtonState();
            
            // Cache MIDI UI elements and initialize MIDI
            this.midiStatusEl = document.getElementById('midi-status');
            this.midiDeviceSelect = document.getElementById('midi-device-select');
            if (this.midiDeviceSelect) {
                this.midiDeviceSelect.value = this.selectedMidiDeviceId;
                this.midiDeviceSelect.addEventListener('change', (event) => {
                    this.selectedMidiDeviceId = event.target.value || 'all';
                    localStorage.setItem('mixerSelectedMidiDevice', this.selectedMidiDeviceId);
                    if (this.midiAccess) {
                        this.announceActiveMidiDevice();
                    } else {
                        this.updateMidiStatus('MIDI: Not connected', 'offline');
                    }
                });
            }
            this.initializeMIDI();
            
            // Show success message
            this.showPermissionBanner('Audio mixer initialized successfully', 'success');
        } catch (err) {
            console.error('Error initializing audio context:', err);
            this.showPermissionBanner('Failed to initialize audio system. Please reload the page or try a different browser.', 'error');
        }
    }
    
    showPermissionBanner(message, type = 'info') {
        const banner = document.getElementById('permission-banner');
        
        // Create banner content with close button
        banner.innerHTML = `
            <span>${message}</span>
            <button class="notice-close" aria-label="Close notification">×</button>
        `;
        
        banner.className = `permission-notice ${type}`;
        banner.style.display = 'block';
        
        // Add close button event listener
        const closeBtn = banner.querySelector('.notice-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                banner.style.display = 'none';
            });
        }
        
        if (type === 'success') {
            setTimeout(() => {
                banner.style.display = 'none';
            }, 3000);
        }
    }
    
    setupEventListeners() {
        document.getElementById('add-channel').addEventListener('click', () => this.addChannel());
        document.getElementById('add-usb-input').addEventListener('click', () => this.showDeviceSelectionModal('usb'));
        document.getElementById('save-config').addEventListener('click', () => this.saveConfiguration());
        document.getElementById('load-config').addEventListener('click', () => this.loadConfiguration());
        
        document.getElementById('master-volume').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.masterGain.gain.value = value;
            document.querySelector('.master-volume-display').textContent = value.toFixed(2);
        });

        document.getElementById('add-mic-input').addEventListener('click', () => this.showDeviceSelectionModal('mic'));

        document.getElementById('connect-device').addEventListener('click', async () => {
            const deviceId = document.getElementById('device-select').value;
            const modal = document.getElementById('device-modal');
            const connectButton = document.getElementById('connect-device');
            const buttonContent = connectButton.querySelector('.button-content');
            
            try {
                // Show loading state
                buttonContent.innerHTML = '<div class="loading-spinner"></div>Connecting...';
                connectButton.disabled = true;
                
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { deviceId: { exact: deviceId } }
                });
                
                // Add the stream to mixer
                this.addChannelWithStream(stream);
                modal.style.display = 'none';
                this.showPermissionBanner('Device connected successfully', 'success');
            } catch (err) {
                this.handleAudioError('connecting to selected device', err);
            } finally {
                // Reset button state
                buttonContent.textContent = 'Connect';
                connectButton.disabled = false;
            }
        });
        
        document.getElementById('cancel-device').addEventListener('click', () => {
            document.getElementById('device-modal').style.display = 'none';
        });

        document.getElementById('toggle-all-channels').addEventListener('click', () => {
            try {
                // Check if any channel is currently playing
                const anyPlaying = this.channels.some(channel => channel.isPlaying);
                
                // Process each channel
                this.channels.forEach(channel => {
                    const playPauseBtn = document.getElementById(`${channel.id}-play`);
                    const inputTypeSelect = document.getElementById(`${channel.id}-input-type`);
                    const inputType = inputTypeSelect?.value || 'file';
                    
                    if (anyPlaying) {
                        // Stop all channels
                        if (channel.isPlaying) {
                            if (channel.source) {
                                if (channel.source.stop) {
                                    try {
                                        channel.source.stop();
                                        // Calculate the elapsed time for possible future resuming
                                        if (channel.startTime) {
                                            channel.pauseTime = (this.audioContext.currentTime - channel.startTime);
                                            if (channel.pauseTime > channel.audioDuration) {
                                                channel.pauseTime = 0;
                                            }
                                        }
                                    } catch (err) {
                                        console.log('Error stopping source:', err);
                                    }
                                }
                            }
                            if (playPauseBtn) {
                                playPauseBtn.classList.remove('playing');
                            }
                            channel.isPlaying = false;
                        }
                    } else {
                        // Start all channels that have audio sources
                        if (!channel.isPlaying) {
                            if (inputType === 'file') {
                                // Handle file input channels
                                const sourceInput = document.getElementById(`${channel.id}-source`);
                                if (sourceInput && sourceInput.files && sourceInput.files[0]) {
                                    // Load and play the audio file
                                    this.loadAudioFile(sourceInput.files[0], channel, true);
                                    if (playPauseBtn) {
                                        playPauseBtn.classList.add('playing');
                                    }
                                    channel.isPlaying = true;
                                }
                            } else if (inputType === 'mic' || inputType === 'usb') {
                                // For mic/usb inputs, they're always on when connected
                                // We can't "play" them, but we can mark them as active
                                if (channel.source) {
                                    channel.isPlaying = true;
                                    if (playPauseBtn) {
                                        playPauseBtn.classList.add('playing');
                                    }
                                }
                            }
                        }
                    }
                });
                
                // Update button text and state
                this.updateToggleAllButtonState();
            } catch (error) {
                console.error('Error toggling channels:', error);
                this.handleAudioError('controlling all channels', error);
            }
        });
    }
    
    addChannel(config = {}) {
        this.channelCount++;
        const channelId = `channel-${this.channelCount}`;
        
        // Create channel DOM element
        const channelEl = document.createElement('div');
        channelEl.className = 'channel';
        channelEl.id = channelId;
        
        channelEl.innerHTML = `
            <div class="channel-header">
                <div class="channel-name">Ch ${this.channelCount}</div>
                <button class="delete-channel" data-channel="${channelId}">×</button>
            </div>
            
            <div class="channel-content">
                <div class="vu-meter-container">
                    <div class="vu-meter">
                        <div class="vu-meter-fill" id="${channelId}-vu"></div>
                    </div>
                </div>
                
                <div class="channel-controls">
                    <div class="playback-controls">
                        <button class="control-btn play-pause" id="${channelId}-play">
                            <svg class="play-icon" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z"/>
                            </svg>
                            <svg class="pause-icon" viewBox="0 0 24 24">
                                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                            </svg>
                        </button>
                        <div class="timer-display" id="${channelId}-timer">00:00 / 00:00</div>
                    </div>

                    <div class="input-section">
                        <select class="input-type-select" id="${channelId}-input-type">
                            <option value="file">Audio File</option>
                            <option value="mic">Microphone</option>
                            <option value="usb">USB Input</option>
                        </select>
                        <input type="file" accept="audio/*" class="input-source" id="${channelId}-source">
                    </div>
                    
                    <div class="button-section">
                        <button class="modal-open-btn" data-modal="${channelId}-eq-modal">
                            <span>Equalizer</span>
                        </button>
                        <button class="modal-open-btn" data-modal="${channelId}-fx-modal">
                            <span>Effects</span>
                        </button>
                    </div>
                    
                    <div class="volume-section">
                        <div class="section-header">
                            <span>Output</span>
                        </div>
                        <div class="volume-control">
                            <label>Pan</label>
                            <input type="range" id="${channelId}-pan" min="-1" max="1" value="${config.pan || 0}" step="0.1">
                            <div class="value-display">${config.pan || 0}</div>
                        </div>
                        <div class="volume-control">
                            <label>Volume</label>
                            <input type="range" id="${channelId}-volume" min="0" max="1" value="${config.volume || 0.75}" step="0.01">
                            <div class="volume-display">${config.volume || 0.75}</div>
                        </div>
                    <div class="midi-learn-controls">
                        <button class="midi-learn-btn" data-channel="${channelId}" data-target="volume">
                            <span>🎛 MIDI Learn</span>
                        </button>
                        <div class="midi-mapping-status" id="${channelId}-midi-status">Not mapped</div>
                    </div>
                    </div>
                </div>
            </div>
            
            <!-- EQ Modal -->
            <div id="${channelId}-eq-modal" class="channel-modal">
                <div class="channel-modal-content">
                    <div class="modal-header">
                        <h3>Equalizer</h3>
                        <button class="close-modal" data-modal="${channelId}-eq-modal">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="eq-control">
                            <label>High</label>
                            <input type="range" id="${channelId}-eq-high" min="-15" max="15" value="${config.eqHigh || 0}" step="1">
                            <div class="value-display">${config.eqHigh || 0} dB</div>
                        </div>
                        <div class="eq-control">
                            <label>Mid</label>
                            <input type="range" id="${channelId}-eq-mid" min="-15" max="15" value="${config.eqMid || 0}" step="1">
                            <div class="value-display">${config.eqMid || 0} dB</div>
                        </div>
                        <div class="eq-control">
                            <label>Low</label>
                            <input type="range" id="${channelId}-eq-low" min="-15" max="15" value="${config.eqLow || 0}" step="1">
                            <div class="value-display">${config.eqLow || 0} dB</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Effects Modal -->
            <div id="${channelId}-fx-modal" class="channel-modal">
                <div class="channel-modal-content">
                    <div class="modal-header">
                        <h3>Effects</h3>
                        <button class="close-modal" data-modal="${channelId}-fx-modal">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="effect-control">
                            <label>Reverb</label>
                            <input type="range" id="${channelId}-reverb" min="0" max="1" value="${config.reverb || 0}" step="0.01">
                            <div class="value-display">${config.reverb || 0}</div>
                        </div>
                        <div class="effect-control">
                            <label>Delay</label>
                            <input type="range" id="${channelId}-delay" min="0" max="1" value="${config.delay || 0}" step="0.01">
                            <div class="value-display">${config.delay || 0}</div>
                        </div>
                        <div class="effect-control">
                            <label>Chorus</label>
                            <input type="range" id="${channelId}-chorus" min="0" max="1" value="${config.chorus || 0}" step="0.01">
                            <div class="value-display">${config.chorus || 0}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('channels-container').appendChild(channelEl);
        
        // Initialize toggle sections
        this.setupModalHandlers(channelId);
        
        // Set up audio nodes for this channel
        const channel = {
            id: channelId,
            source: null,
            gainNode: this.audioContext.createGain(),
            panNode: this.audioContext.createStereoPanner(),
            lowEQ: this.createEQBand(200, 'lowshelf'),
            midEQ: this.createEQBand(1000, 'peaking'),
            highEQ: this.createEQBand(5000, 'highshelf'),
            analyser: this.audioContext.createAnalyser(),
            isPlaying: false
        };
        
        // Create effects
        channel.reverbNode = this.createReverb();
        channel.delayNode = this.createDelay();
        channel.chorusNode = this.createChorus();
        
        // Connect the EQ chain
        channel.lowEQ.connect(channel.midEQ);
        channel.midEQ.connect(channel.highEQ);
        
        // Connect to effects chain
        channel.highEQ.connect(channel.reverbNode.input);
        channel.reverbNode.connect(channel.delayNode.input);
        channel.delayNode.connect(channel.chorusNode.input);
        channel.chorusNode.connect(channel.panNode);
        
        // Connect to output chain
        channel.panNode.connect(channel.gainNode);
        channel.gainNode.connect(this.masterGain);
        channel.gainNode.connect(channel.analyser);
        
        // Configure analyzer
    channel.analyser.fftSize = 1024; // higher resolution for more accurate RMS meter
        
        // Set up event listeners for this channel
        this.setupChannelEventListeners(channel);
        
        // Add channel to list
        this.channels.push(channel);
        
        // Apply configuration if provided
        if (config.eqHigh !== undefined) channel.highEQ.gain.value = config.eqHigh;
        if (config.eqMid !== undefined) channel.midEQ.gain.value = config.eqMid;
        if (config.eqLow !== undefined) channel.lowEQ.gain.value = config.eqLow;
        if (config.pan !== undefined) channel.panNode.pan.value = config.pan;
        if (config.volume !== undefined) channel.gainNode.gain.value = config.volume;
        if (config.reverb !== undefined) channel.reverbNode.wet.value = config.reverb;
        if (config.delay !== undefined) channel.delayNode.wet.value = config.delay;
        if (config.chorus !== undefined) channel.chorusNode.wet.value = config.chorus;
        
        return channel;
    }
    
    createEQBand(frequency, type) {
        const filter = this.audioContext.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = frequency;
        filter.gain.value = 0;
        return filter;
    }
    
    setupChannelEventListeners(channel) {
        const sourceInput = document.getElementById(`${channel.id}-source`);
        const inputTypeSelect = document.getElementById(`${channel.id}-input-type`);
        const playPauseBtn = document.getElementById(`${channel.id}-play`);
        
        // Input type change handler
        inputTypeSelect.addEventListener('change', async (e) => {
            const inputType = e.target.value;
            
            // Stop current playback if any
            if (channel.source) {
                if (channel.source.stop) {
                    try {
                        channel.source.stop();
                    } catch (err) {
                        console.log('Error stopping source:', err);
                    }
                }
                channel.source.disconnect();
                channel.isPlaying = false;
                playPauseBtn.style.display = 'block';
            }
            
            // Show/hide file input based on type
            if (inputType === 'file') {
                sourceInput.style.display = 'block';
                playPauseBtn.style.display = 'block';
            } else {
                sourceInput.style.display = 'none';
                playPauseBtn.style.display = 'none';
                
                try {
                    // Request device access for microphone with optimized latency settings
                    const constraints = {
                        audio: inputType === 'usb' ? 
                            { 
                                deviceId: { ideal: ['USB', 'External'] },
                                autoGainControl: false,
                                echoCancellation: false,
                                noiseSuppression: false,
                                latency: 0.01
                            } : 
                            { 
                                echoCancellation: { ideal: true },
                                noiseSuppression: { ideal: true },
                                autoGainControl: { ideal: true },
                                latency: 0.01
                            }
                    };
                    
                    const stream = await navigator.mediaDevices.getUserMedia(constraints);
                    const source = this.audioContext.createMediaStreamSource(stream);
                    channel.source = source;
                    
                    // Connect to channel processing chain
                    source.connect(channel.lowEQ);
                    
                    // Update channel name
                    const channelNameEl = document.querySelector(`#${channel.id} .channel-name`);
                    channelNameEl.textContent = stream.getAudioTracks()[0].label || 
                        `${inputType === 'mic' ? 'Mic' : 'USB'} ${this.channelCount}`;
                    
                    this.showPermissionBanner(`${inputType === 'mic' ? 'Microphone' : 'USB device'} connected successfully`, 'success');
                } catch (err) {
                    this.handleAudioError(`accessing ${inputType === 'mic' ? 'microphone' : 'USB device'}`, err);
                    inputTypeSelect.value = 'file';
                    sourceInput.style.display = 'block';
                    playPauseBtn.style.display = 'block';
                }
            }
        });
        
        // EQ controls with value display updates
        document.getElementById(`${channel.id}-eq-high`).addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            channel.highEQ.gain.value = value;
            e.target.nextElementSibling.textContent = `${value} dB`;
        });
        
        document.getElementById(`${channel.id}-eq-mid`).addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            channel.midEQ.gain.value = value;
            e.target.nextElementSibling.textContent = `${value} dB`;
        });
        
        document.getElementById(`${channel.id}-eq-low`).addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            channel.lowEQ.gain.value = value;
            e.target.nextElementSibling.textContent = `${value} dB`;
        });
        
        // Effect controls with value display updates
        document.getElementById(`${channel.id}-reverb`).addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            channel.reverbNode.wet.value = value;
            e.target.nextElementSibling.textContent = value.toFixed(2);
        });
        
        document.getElementById(`${channel.id}-delay`).addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            channel.delayNode.wet.value = value;
            e.target.nextElementSibling.textContent = value.toFixed(2);
        });
        
        document.getElementById(`${channel.id}-chorus`).addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            channel.chorusNode.wet.value = value;
            e.target.nextElementSibling.textContent = value.toFixed(2);
        });
        
        // Pan control with value display update
        document.getElementById(`${channel.id}-pan`).addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            channel.panNode.pan.value = value;
            e.target.nextElementSibling.textContent = value.toFixed(1);
        });
        
        // Volume control
        document.getElementById(`${channel.id}-volume`).addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            channel.gainNode.gain.value = value;
            const display = e.target.nextElementSibling;
            display.textContent = value.toFixed(2);
        });

        const midiLearnBtn = document.querySelector(`#${channel.id} .midi-learn-btn`);
        if (midiLearnBtn) {
            midiLearnBtn.addEventListener('click', () => this.startMidiLearn(channel.id));
        }
        this.updateChannelMidiStatus(channel.id);
        
        // File input handler
        sourceInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.loadAudioFile(file, channel, false);
                playPauseBtn.classList.remove('playing');
                channel.isPlaying = false;
            }
        });
        
        // Play/Pause handler
        playPauseBtn.addEventListener('click', () => {
            if (!sourceInput.files[0] && !channel.source) return;
            
            if (channel.isPlaying) {
                // Pause playback
                if (channel.source && channel.source.stop) {
                    try {
                        channel.source.stop();
                        // Calculate the elapsed time
                        channel.pauseTime = (this.audioContext.currentTime - channel.startTime);
                        if (channel.pauseTime > channel.audioDuration) {
                            channel.pauseTime = 0;
                        }
                    } catch (err) {
                        console.log('Error stopping source:', err);
                        // Reset state in case of error
                        channel.pauseTime = 0;
                    }
                }
                
                playPauseBtn.classList.remove('playing');
                channel.isPlaying = false;
            } else {
                // Start/resume playback
                if (sourceInput.files[0]) {
                    if (channel.source && channel.source.buffer && channel.pauseTime > 0) {
                        // Resume playback from paused position - create new source
                        const newSource = this.audioContext.createBufferSource();
                        newSource.buffer = channel.source.buffer;
                        
                        // Connect to the audio graph
                        newSource.connect(channel.lowEQ);
                        
                        // Configure playback settings
                        newSource.loop = true;
                        
                        // Start from the pause position
                        newSource.start(0, channel.pauseTime);
                        
                        // Update channel state
                        channel.source = newSource;
                        channel.startTime = this.audioContext.currentTime - channel.pauseTime;
                        
                        // Add ended event
                        channel.source.onended = () => {
                            channel.isPlaying = false;
                            channel.pauseTime = 0;
                            playPauseBtn.classList.remove('playing');
                            const timerDisplay = document.getElementById(`${channel.id}-timer`);
                            const totalTime = this.formatTime(channel.audioDuration);
                            timerDisplay.textContent = `00:00 / ${totalTime}`;
                            
                            // Update toggle-all button state when playback ends
                            this.updateToggleAllButtonState();
                        };
                    } else {
                        // Start new playback
                        this.loadAudioFile(sourceInput.files[0], channel, true);
                    }
                    
                    playPauseBtn.classList.add('playing');
                    channel.isPlaying = true;
                }
            }
            
            // Update the toggle-all button state
            this.updateToggleAllButtonState();
        });
        
        // Delete channel handler
        document.querySelector(`button[data-channel="${channel.id}"]`).addEventListener('click', () => {
            this.removeChannel(channel);
        });
    }
    
    loadAudioFile(file, channel, autoPlay = false) {
        if (!file) return;
        
        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => {
                console.log('AudioContext resumed successfully');
            });
        }
        
        // Generate a cache key for this file
        const cacheKey = file.name + '_' + file.size + '_' + file.lastModified;
        
        // Check if we already have this file cached
        if (this.audioBufferCache.has(cacheKey)) {
            console.log('Using cached audio buffer');
            const buffer = this.audioBufferCache.get(cacheKey);
            this.setupChannelWithBuffer(buffer, channel, autoPlay);
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = (e) => {
            this.audioContext.decodeAudioData(e.target.result)
                .then(buffer => {
                    // Cache the decoded buffer
                    this.audioBufferCache.set(cacheKey, buffer);
                    
                    // Set up the channel with the buffer
                    this.setupChannelWithBuffer(buffer, channel, autoPlay);
                    
                    this.showPermissionBanner('Audio loaded', 'success');
                })
                .catch(err => {
                    console.error('Error decoding audio data:', err);
                    this.showPermissionBanner('Error loading audio file', 'error');
                });
        };
        
        reader.readAsArrayBuffer(file);
    }
    
    // Helper method to set up a channel with an audio buffer
    setupChannelWithBuffer(buffer, channel, autoPlay) {
        // Stop current playback if any
        if (channel.source) {
            if (channel.source.stop) {
                try {
                    channel.source.stop();
                } catch (err) {
                    console.log('Error stopping source:', err);
                }
            }
            channel.source.disconnect();
        }
        
        // Create new source
        channel.source = this.audioContext.createBufferSource();
        channel.source.buffer = buffer;
        
        // Store buffer duration for the timer
        channel.audioDuration = buffer.duration;
        
        // Update the timer display with total duration
        const timerDisplay = document.getElementById(`${channel.id}-timer`);
        const totalTime = this.formatTime(channel.audioDuration);
        timerDisplay.textContent = `00:00 / ${totalTime}`;
        
        // Connect source to channel processing chain
        channel.source.connect(channel.lowEQ);
        
        // Initialize playback tracking
        channel.startTime = null;
        channel.pauseTime = 0;
        channel.isPlaying = false;
        
        // Add ended event
        channel.source.onended = () => {
            channel.isPlaying = false;
            channel.pauseTime = 0;
            const playPauseBtn = document.getElementById(`${channel.id}-play`);
            playPauseBtn.classList.remove('playing');
            timerDisplay.textContent = `00:00 / ${totalTime}`;
        };
        
        // Start playback only if autoPlay is true
        if (autoPlay) {
            channel.source.loop = true;
            channel.source.start(0, channel.pauseTime);
            channel.startTime = this.audioContext.currentTime - channel.pauseTime;
            channel.isPlaying = true;
            const playPauseBtn = document.getElementById(`${channel.id}-play`);
            playPauseBtn.classList.add('playing');
        }
    }
    
    async addUSBInput() {
        try {
            // Request access to audio input devices
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Create a new channel
            const channel = this.addChannel();
            
            // Create media source from stream
            const source = this.audioContext.createMediaStreamSource(stream);
            channel.source = source;
            
            // Connect source to channel processing chain
            source.connect(channel.lowEQ);
            
            // Update channel label
            const channelNameEl = document.querySelector(`#${channel.id} .channel-name`);
            channelNameEl.textContent = `USB In ${this.channelCount}`;
            
        } catch (err) {
            console.error('Error accessing USB audio input:', err);
            alert('Could not access USB audio input. Make sure your device is connected and permissions are granted.');
        }
    }
    
    removeChannel(channel) {
        // Stop audio source if playing
        if (channel.source) {
            if (channel.source.stop) {
                channel.source.stop();
            }
            channel.source.disconnect();
        }
        
    // Disconnect all nodes
    try { channel.gainNode.disconnect(); } catch (e) {}
    try { channel.panNode.disconnect(); } catch (e) {}
    try { channel.lowEQ.disconnect(); } catch (e) {}
    try { channel.midEQ.disconnect(); } catch (e) {}
    try { channel.highEQ.disconnect(); } catch (e) {}
    // Disconnect and stop effects if present
    try { if (channel.reverbNode && channel.reverbNode.disconnect) channel.reverbNode.disconnect(); } catch (e) {}
    try { if (channel.delayNode && channel.delayNode.disconnect) channel.delayNode.disconnect(); } catch (e) {}
    try { if (channel.chorusNode && channel.chorusNode.disconnect) channel.chorusNode.disconnect(); } catch (e) {}
        
        // Remove from DOM
        const channelEl = document.getElementById(channel.id);
        channelEl.remove();
        
        // Remove from channels array
        this.channels = this.channels.filter(ch => ch.id !== channel.id);
        delete this.midiMappings[channel.id];
        if (this.pendingMidiLearn && this.pendingMidiLearn.channelId === channel.id) {
            this.pendingMidiLearn = null;
        }
    }
    
    startVUMeterUpdates() {
        // Get the master meter elements
        const masterMeterLeft = document.getElementById('master-vu-left').querySelector('.vu-meter-fill');
        const masterMeterRight = document.getElementById('master-vu-right').querySelector('.vu-meter-fill');
        
        // Use time-domain RMS for more responsive level meters
        const lastVolumeLevels = new Map();

        // Pre-allocate arrays
        const masterTimeData = new Float32Array(this.masterAnalyser.fftSize);
        const channelTimeDataMap = new Map();
        this.channels.forEach(channel => {
            if (channel.analyser) channelTimeDataMap.set(channel.id, new Float32Array(channel.analyser.fftSize));
        });

        const updateMeters = () => {
            try {
                // Master RMS (mono mix approximation): use getFloatTimeDomainData
                if (this.masterAnalyser) {
                    // Prefer float time domain data; fall back to byte if unavailable
                    let masterArrayAvailable = true;
                    try {
                        if (typeof this.masterAnalyser.getFloatTimeDomainData === 'function') {
                            this.masterAnalyser.getFloatTimeDomainData(masterTimeData);
                        } else {
                            masterArrayAvailable = false;
                        }
                    } catch (e) {
                        masterArrayAvailable = false;
                    }

                    let sum = 0;
                    if (masterArrayAvailable) {
                        for (let i = 0; i < masterTimeData.length; i++) {
                            const v = masterTimeData[i];
                            sum += v * v;
                        }
                    } else {
                        // Fallback to byte data and convert from [0..255] to [-1..1]
                        const byteBuf = new Uint8Array(this.masterAnalyser.fftSize);
                        this.masterAnalyser.getByteTimeDomainData(byteBuf);
                        for (let i = 0; i < byteBuf.length; i++) {
                            const v = (byteBuf[i] - 128) / 128;
                            sum += v * v;
                        }
                    }
                    let rms = Math.sqrt(sum / masterTimeData.length);
                    // Apply slight companding to match perceived loudness
                    rms = Math.pow(rms, 0.6);

                    // Smooth attack/release separately
                    const prev = lastVolumeLevels.get('master') || 0;
                    const attack = 0.6;
                    const release = 0.2;
                    const smoothed = rms > prev ? prev + (rms - prev) * attack : prev + (rms - prev) * release;
                    lastVolumeLevels.set('master', smoothed);

                    masterMeterLeft.style.height = (smoothed * 100) + '%';
                    masterMeterRight.style.height = (smoothed * 100) + '%';
                    masterMeterLeft.classList.toggle('active', smoothed > 0.03);
                    masterMeterRight.classList.toggle('active', smoothed > 0.03);
                }

                // Channel meters
                this.channels.forEach(channel => {
                    if (!channel.analyser) return;
                    const meterEl = document.getElementById(`${channel.id}-vu`);
                    if (!meterEl) return;

                    let arr = channelTimeDataMap.get(channel.id);
                    if (!arr) {
                        arr = new Float32Array(channel.analyser.fftSize);
                        channelTimeDataMap.set(channel.id, arr);
                    }

                    // Use time domain RMS for channel (with fallback)
                    let channelFloatAvailable = true;
                    try {
                        if (typeof channel.analyser.getFloatTimeDomainData === 'function') {
                            channel.analyser.getFloatTimeDomainData(arr);
                        } else {
                            channelFloatAvailable = false;
                        }
                    } catch (e) {
                        channelFloatAvailable = false;
                    }

                    let sum = 0;
                    if (channelFloatAvailable) {
                        for (let i = 0; i < arr.length; i++) {
                            const v = arr[i];
                            sum += v * v;
                        }
                    } else {
                        const byteBuf = new Uint8Array(channel.analyser.fftSize);
                        channel.analyser.getByteTimeDomainData(byteBuf);
                        for (let i = 0; i < byteBuf.length; i++) {
                            const v = (byteBuf[i] - 128) / 128;
                            sum += v * v;
                        }
                    }
                    let rms = Math.sqrt(sum / arr.length);
                    rms = Math.pow(rms, 0.6);

                    const key = `ch-${channel.id}`;
                    const prev = lastVolumeLevels.get(key) || 0;
                    const attack = 0.7; // fast attack
                    const release = 0.25; // slightly slower release
                    const smoothed = rms > prev ? prev + (rms - prev) * attack : prev + (rms - prev) * release;
                    lastVolumeLevels.set(key, smoothed);

                    meterEl.style.height = Math.min(100, (smoothed * 120)) + '%'; // scale to give headroom
                    meterEl.classList.toggle('active', smoothed > 0.03);

                    // Update timer if channel is playing
                    if (channel.isPlaying && channel.source && channel.startTime !== null) {
                        const timerEl = document.getElementById(`${channel.id}-timer`);
                        if (timerEl) {
                            const currentTime = this.audioContext.currentTime - channel.startTime;
                            const formattedCurrentTime = this.formatTime(currentTime);
                            const formattedTotalTime = this.formatTime(channel.audioDuration);
                            timerEl.textContent = `${formattedCurrentTime} / ${formattedTotalTime}`;
                        }
                    }
                });
            } catch (err) {
                console.error('Error updating VU meters (RMS):', err);
            }

            requestAnimationFrame(updateMeters);
        };

        requestAnimationFrame(updateMeters);
    }
    
    calculateAverage(dataArray, start = 0, end = dataArray.length) {
        let sum = 0;
        for (let i = start; i < end; i++) {
            sum += dataArray[i];
        }
        // Return value between 0 and 1 for smoother display
        return sum / (end - start);
    }

    async initializeMIDI() {
        if (!navigator.requestMIDIAccess) {
            this.updateMidiStatus('MIDI: Not supported in this browser', 'offline');
            if (this.midiDeviceSelect) this.midiDeviceSelect.disabled = true;
            return;
        }

        try {
            this.updateMidiStatus('MIDI: Connecting…', 'learning');
            this.midiAccess = await navigator.requestMIDIAccess();
            if (this.midiDeviceSelect) this.midiDeviceSelect.disabled = false;
            this.populateMidiDeviceOptions();
            this.announceActiveMidiDevice();

            const setupInputs = () => {
                this.midiInputs.forEach(input => input.onmidimessage = null);
                this.midiInputs.clear();
                this.midiAccess.inputs.forEach((input) => {
                    this.registerMidiInput(input);
                });
                this.populateMidiDeviceOptions();
            };

            setupInputs();

            this.midiAccess.onstatechange = (event) => {
                if (event.port.type === 'input') {
                    setupInputs();
                    this.announceActiveMidiDevice();
                }
            };
        } catch (error) {
            console.error('Failed to initialize MIDI:', error);
            this.updateMidiStatus('MIDI: Access denied', 'offline');
            if (this.midiDeviceSelect) this.midiDeviceSelect.disabled = true;
            this.showPermissionBanner('Unable to access MIDI devices. Please grant permission or ensure your controller is connected.', 'error');
        }
    }

    registerMidiInput(input) {
        if (!input) return;
        if (this.midiInputs.has(input.id)) {
            this.midiInputs.get(input.id).onmidimessage = null;
        }
        input.onmidimessage = (event) => this.handleMIDIMessage(event, input.id);
        this.midiInputs.set(input.id, input);
    }

    getMidiDeviceName(deviceId) {
        if (!this.midiAccess || deviceId === 'all') return null;
        const device = Array.from(this.midiAccess.inputs.values()).find(input => input.id === deviceId);
        return device ? (device.name || device.manufacturer || `Device ${deviceId}`) : null;
    }

    populateMidiDeviceOptions() {
        if (!this.midiDeviceSelect || !this.midiAccess) return;
        const previousSelection = this.selectedMidiDeviceId;
        this.midiDeviceSelect.innerHTML = '<option value="all">All devices</option>';

        let hasMatch = false;
        this.midiAccess.inputs.forEach((input) => {
            const option = document.createElement('option');
            option.value = input.id;
            option.textContent = input.name || input.manufacturer || `Device ${this.midiDeviceSelect.length}`;
            this.midiDeviceSelect.appendChild(option);
            if (input.id === previousSelection) {
                hasMatch = true;
            }
        });

        if (!hasMatch) {
            this.selectedMidiDeviceId = 'all';
            localStorage.setItem('mixerSelectedMidiDevice', this.selectedMidiDeviceId);
        }

        this.midiDeviceSelect.value = this.selectedMidiDeviceId;
    }

    handleMIDIMessage(event, inputId) {
        if (this.selectedMidiDeviceId !== 'all' && inputId !== this.selectedMidiDeviceId) {
            return;
        }
        const [status, data1, data2] = event.data;
        const command = status & 0xf0;
        const midiChannel = status & 0x0f;

        if (command === 0xB0) { // Control Change
            const normalizedValue = data2 / 127;
            if (this.pendingMidiLearn) {
                this.assignMidiMapping(this.pendingMidiLearn.channelId, data1, midiChannel);
                this.applyMidiValueToChannel(this.pendingMidiLearn.channelId, normalizedValue);
                this.pendingMidiLearn = null;
                this.updateMidiStatus('MIDI: Mapping saved', 'online');
                document.querySelectorAll('.midi-learn-btn.learning').forEach(btn => btn.classList.remove('learning'));
                return;
            }

            Object.entries(this.midiMappings).forEach(([channelId, mapping]) => {
                if (
                    mapping &&
                    mapping.type === 'cc' &&
                    mapping.controller === data1 &&
                    (mapping.midiChannel === midiChannel || mapping.midiChannel === 'any')
                ) {
                    this.applyMidiValueToChannel(channelId, normalizedValue);
                }
            });
        }
    }

    applyMidiValueToChannel(channelId, value) {
        const channel = this.channels.find(ch => ch.id === channelId);
        if (!channel) return;
        const slider = document.getElementById(`${channelId}-volume`);
        if (!slider) return;
        const clamped = Math.min(1, Math.max(0, value));
        slider.value = clamped;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
    }

    startMidiLearn(channelId) {
        if (!this.midiAccess) {
            this.showPermissionBanner('MIDI is not available yet. Please allow access or connect a controller.', 'error');
            this.updateMidiStatus('MIDI: Not ready', 'offline');
            return;
        }

        if (this.pendingMidiLearn && this.pendingMidiLearn.channelId === channelId) {
            this.pendingMidiLearn = null;
            document.querySelectorAll('.midi-learn-btn.learning').forEach(btn => btn.classList.remove('learning'));
            this.updateMidiStatus('MIDI: Ready', 'online');
            return;
        }

        this.pendingMidiLearn = { channelId };
        document.querySelectorAll('.midi-learn-btn.learning').forEach(btn => btn.classList.remove('learning'));
        const btn = document.querySelector(`#${channelId} .midi-learn-btn`);
        if (btn) btn.classList.add('learning');
        this.updateMidiStatus(`MIDI: Move the fader you want to map to ${channelId}`, 'learning');
    }

    assignMidiMapping(channelId, controller, midiChannel) {
        this.midiMappings[channelId] = {
            controller,
            midiChannel,
            type: 'cc'
        };
        this.updateChannelMidiStatus(channelId);
    }

    updateChannelMidiStatus(channelId) {
        const statusEl = document.getElementById(`${channelId}-midi-status`);
        const mapping = this.midiMappings[channelId];
        if (!statusEl) return;
        if (mapping) {
            statusEl.textContent = `CC ${mapping.controller} · Ch ${mapping.midiChannel + 1}`;
            statusEl.classList.add('mapped');
        } else {
            statusEl.textContent = 'Not mapped';
            statusEl.classList.remove('mapped');
        }
    }

    updateMidiStatus(message, state = 'offline') {
        if (!this.midiStatusEl) return;
        this.midiStatusEl.classList.remove('offline', 'online', 'learning');
        this.midiStatusEl.classList.add(state);
        const dotClass = state === 'learning' ? 'status-dot pulse' : 'status-dot';
        this.midiStatusEl.innerHTML = `<span class="${dotClass}"></span>${message}`;
    }

    announceActiveMidiDevice() {
        if (!this.midiAccess) return;
        const name = this.getMidiDeviceName(this.selectedMidiDeviceId);
        const message = this.selectedMidiDeviceId === 'all'
            ? 'MIDI: Monitoring all devices'
            : `MIDI: Listening to ${name || 'selected device'}`;
        this.updateMidiStatus(message, 'online');
    }
    
    saveConfiguration() {
        const config = {
            masterVolume: this.masterGain.gain.value,
            channels: this.channels.map(channel => ({
                eqLow: channel.lowEQ.gain.value,
                eqMid: channel.midEQ.gain.value,
                eqHigh: channel.highEQ.gain.value,
                pan: channel.panNode.pan.value,
                volume: channel.gainNode.gain.value,
                midiMapping: this.midiMappings[channel.id] || null
            }))
        };
        
        localStorage.setItem('audioMixerConfig', JSON.stringify(config));
        alert('Configuration saved!');
    }
    
    loadConfiguration() {
        const configJson = localStorage.getItem('audioMixerConfig');
        if (!configJson) {
            alert('No saved configuration found.');
            return;
        }
        
        try {
            const config = JSON.parse(configJson);
            
            // Set master volume
            this.masterGain.gain.value = config.masterVolume;
            document.getElementById('master-volume').value = config.masterVolume;
            document.querySelector('.master-volume-display').textContent = config.masterVolume.toFixed(2);
            
            // Remove all existing channels
            [...this.channels].forEach(channel => this.removeChannel(channel));
            
            // Add channels from config
            config.channels.forEach(channelConfig => {
                const channel = this.addChannel(channelConfig);
                if (channelConfig.midiMapping) {
                    this.midiMappings[channel.id] = channelConfig.midiMapping;
                    this.updateChannelMidiStatus(channel.id);
                }
            });
            
            alert('Configuration loaded!');
        } catch (err) {
            console.error('Error loading configuration:', err);
            alert('Error loading configuration.');
        }
    }

    async showDeviceSelectionModal(type) {
        const modal = document.getElementById('device-modal');
        const deviceSelect = document.getElementById('device-select');
        const statusDiv = document.getElementById('device-list-status');
        
        modal.style.display = 'block';
        deviceSelect.innerHTML = '';
        statusDiv.innerHTML = '<div class="loading-spinner"></div>Loading available devices...';
        
        try {
            // Request permission to access audio devices
            await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Get list of audio devices
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioDevices = devices.filter(device => device.kind === 'audioinput');
            
            if (audioDevices.length === 0) {
                statusDiv.innerHTML = 'No audio input devices found';
                statusDiv.className = 'permission-notice error';
                return;
            }
            
            // Populate device select
            audioDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Audio Input ${deviceSelect.options.length + 1}`;
                deviceSelect.appendChild(option);
            });
            
            statusDiv.innerHTML = 'Select an audio device to connect';
            statusDiv.className = 'permission-notice success';
        } catch (err) {
            console.error('Error accessing audio devices:', err);
            statusDiv.innerHTML = 'Unable to access audio devices. Please check permissions.';
            statusDiv.className = 'permission-notice error';
        }
    }

    addChannelWithStream(stream) {
        const channel = this.addChannel();
        
        try {
            // Create media source from stream
            const source = this.audioContext.createMediaStreamSource(stream);
            channel.source = source;
            
            // Connect source to channel processing chain
            source.connect(channel.lowEQ);
            
            // Update channel label
            const channelNameEl = document.querySelector(`#${channel.id} .channel-name`);
            channelNameEl.textContent = stream.getAudioTracks()[0].label || `Input ${this.channelCount}`;
            
            return channel;
        } catch (err) {
            console.error('Error creating channel with stream:', err);
            this.showPermissionBanner('Error creating channel with audio input', 'error');
            this.removeChannel(channel);
            return null;
        }
    }

    createReverb() {
        const ctx = this.audioContext;
        const input = ctx.createGain();
        const output = ctx.createGain();
        const dry = ctx.createGain();
        const wet = ctx.createGain();
        const convolver = ctx.createConvolver();
        
        // Create impulse response
        const sampleRate = ctx.sampleRate;
        const length = sampleRate * 2; // 2 seconds
        const impulse = ctx.createBuffer(2, length, sampleRate);
        
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                channelData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.5));
            }
        }
        
        convolver.buffer = impulse;
        
        // Set initial values
        wet.gain.value = 0;
        dry.gain.value = 1;
        
        // Connect internal nodes
        input.connect(dry);
        input.connect(convolver);
        convolver.connect(wet);
        dry.connect(output);
        wet.connect(output);
        
        return {
            input: input,
            output: output,
            wet: wet.gain,
            dry: dry.gain,
            convolver: convolver,
            connect(node) {
                this.output.connect(typeof node.input !== 'undefined' ? node.input : node);
            },
            disconnect() {
                this.output.disconnect();
            }
        };
    }
    
    createDelay() {
        const ctx = this.audioContext;
        const input = ctx.createGain();
        const output = ctx.createGain();
        const dry = ctx.createGain();
        const wet = ctx.createGain();
        const delay = ctx.createDelay(1.0);
        const feedback = ctx.createGain();
        
        // Set initial values
        delay.delayTime.value = 0.3;
        feedback.gain.value = 0.4;
        wet.gain.value = 0;
        dry.gain.value = 1;
        
        // Connect internal nodes
        input.connect(dry);
        input.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wet);
        dry.connect(output);
        wet.connect(output);
        
        return {
            input: input,
            output: output,
            wet: wet.gain,
            dry: dry.gain,
            delay: delay,
            feedback: feedback.gain,
            time: delay.delayTime,
            connect(node) {
                this.output.connect(typeof node.input !== 'undefined' ? node.input : node);
            },
            disconnect() {
                this.output.disconnect();
            }
        };
    }
    
    createChorus() {
        const ctx = this.audioContext;
        const input = ctx.createGain();
        const output = ctx.createGain();
        const dry = ctx.createGain();
        const wet = ctx.createGain();
        const delay = ctx.createDelay();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        
        // Set initial values
        delay.delayTime.value = 0.03;
        lfo.frequency.value = 0.1;
        lfoGain.gain.value = 0.005;
        wet.gain.value = 0;
        dry.gain.value = 1;
        
        // Connect internal nodes
        input.connect(dry);
        input.connect(delay);
        lfo.connect(lfoGain);
        lfoGain.connect(delay.delayTime);
        delay.connect(wet);
        dry.connect(output);
        wet.connect(output);
        lfo.start(0);
        
        return {
            input: input,
            output: output,
            wet: wet.gain,
            dry: dry.gain,
            delay: delay,
            rate: lfo.frequency,
            depth: lfoGain.gain,
            connect(node) {
                this.output.connect(typeof node.input !== 'undefined' ? node.input : node);
            },
            disconnect() {
                this.output.disconnect();
            }
        };
    }

    // Initialize modal handlers for a channel
    setupModalHandlers(channelId) {
        // Get all modal open buttons for this channel
        const modalOpenButtons = document.querySelectorAll(`#${channelId} .modal-open-btn, #${channelId} button[data-modal]`);
        const closeModalButtons = document.querySelectorAll(`#${channelId} .close-modal`);
        
        // Add click event listeners to modal open buttons
        modalOpenButtons.forEach(button => {
            const modalId = button.getAttribute('data-modal');
            const modal = document.getElementById(modalId);
            
            button.addEventListener('click', () => {
                if (modal) {
                    modal.style.display = 'block';
                    
                    // Close when clicking outside the modal
                    modal.addEventListener('click', (e) => {
                        if (e.target === modal) {
                            modal.style.display = 'none';
                        }
                    });
                }
            });
        });
        
        // Add click event listeners to close buttons
        closeModalButtons.forEach(button => {
            const modalId = button.getAttribute('data-modal');
            const modal = document.getElementById(modalId);
            
            button.addEventListener('click', () => {
                if (modal) {
                    modal.style.display = 'none';
                }
            });
        });
        
        // Close modal with Escape key (initialize once globally)
        if (!this._modalKeydownInitialized) {
            this._modalKeydownInitialized = true;
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    const openModals = document.querySelectorAll(`.channel-modal[style*="display: block"]`);
                    openModals.forEach(modal => {
                        modal.style.display = 'none';
                    });
                }
            });
        }
    }

    // Format time in seconds to MM:SS format
    formatTime(seconds) {
        seconds = Math.round(seconds);
        const minutes = Math.floor(seconds / 60);
        seconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Enhanced error handler for audio operations
    handleAudioError(operation, error) {
        console.error(`Error during ${operation}:`, error);
        
        // Show user-friendly error message based on error type
        let errorMessage = `An error occurred during ${operation}.`;
        
        if (error.name === 'NotSupportedError') {
            errorMessage = 'This audio feature is not supported by your browser.';
        } else if (error.name === 'NotAllowedError') {
            errorMessage = 'Please grant permission to access audio devices.';
        } else if (error.name === 'AbortError') {
            errorMessage = 'The audio operation was aborted.';
        } else if (error.name === 'NotFoundError') {
            errorMessage = 'No audio device was found or the requested device is disconnected.';
        }
        
        this.showPermissionBanner(errorMessage, 'error');
        
        // Return false to indicate error handling
        return false;
    }

    // Initialize toggle-all button state
    updateToggleAllButtonState() {
        // Check if any channel is currently playing
        const anyPlaying = this.channels.some(channel => channel.isPlaying);
        
        // Update button text and state
        const toggleButton = document.getElementById('toggle-all-channels');
        if (!toggleButton) return; // Guard against element not found

        const buttonContent = toggleButton.querySelector('.button-content');
        if (!buttonContent) return;

        // Text should be "Stop All" if any channel is playing, otherwise "Play All"
        buttonContent.textContent = anyPlaying ? 'Stop All' : 'Play All';

        // Update visual state - should have data-state="playing" when any channel is playing
        toggleButton.setAttribute('data-state', anyPlaying ? 'playing' : '');
    }
}

// Initialize the mixer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const mixer = new AudioMixer();
    
    // Add a default channel
    mixer.addChannel();
});