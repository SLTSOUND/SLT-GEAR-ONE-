// Configuration
const CONFIG = {
    adminPassword: 'sltadmin',
    splashPassword: '108321',
    splashScreenDuration: 3000,
    updateInterval: 1000
};

const storage = (() => {
    let inMemoryStore = {};
    try {
        const testKey = '__slt_storage_test__';
        window.localStorage.setItem(testKey, '1');
        window.localStorage.removeItem(testKey);
        return window.localStorage;
    } catch (error) {
        console.warn('Local storage unavailable, falling back to in-memory store.', error);
        return {
            getItem: (key) => (key in inMemoryStore ? inMemoryStore[key] : null),
            setItem: (key, value) => {
                inMemoryStore[key] = value;
            },
            removeItem: (key) => {
                delete inMemoryStore[key];
            }
        };
    }
})();

// Widget Configuration
const widgets = [
    { name: 'mixer', title: 'Mixer', icon: '🎚️' },
    { name: 'equalizer', title: 'Equalizer', icon: '📈' },
    { name: 'effects', title: 'Effects', icon: '✨' },
    { name: 'recorder', title: 'Recorder', icon: '🎙️' },
    { name: 'samples', title: 'Samples', icon: '🎵' },
    { name: 'monitor', title: 'Monitor', icon: '📊' },
    { name: 'mediaplayer', title: 'Media Player', icon: '🎬' },
    { name: 'broadcasting', title: 'Broadcasting', icon: '📡' },
    { name: 'inputs', title: 'Inputs', icon: '🔌' },
    { name: 'outputs', title: 'Outputs', icon: '🔊' },
    { name: 'presets', title: 'Presets', icon: '💾' },
    { name: 'settings', title: 'Settings', icon: '⚙️' },
    { name: 'subfoofer', title: 'Subwoofer', icon: '🔉' }
];

// Global State
let state = {
    windows: [],
    minimizedWindows: [],
    adminLoggedIn: false,
    widgetConfig: (() => {
        try {
            return JSON.parse(storage.getItem('widgetConfig')) || {};
        } catch (error) {
            console.warn('Failed to parse widget configuration, using defaults.', error);
            return {};
        }
    })()
};

// Splash Screen
function handleSplashScreen() {
    const splashScreen = document.getElementById('splash-screen');
    const desktop = document.getElementById('desktop');
    const passwordInput = document.getElementById('splash-password');
    const submitBtn = document.getElementById('splash-submit-btn');
    const errorText = document.getElementById('splash-password-error');
    
    // Focus the password input
    passwordInput.focus();
    
    function checkPassword() {
        const enteredPassword = passwordInput.value.trim();
        if (enteredPassword === CONFIG.splashPassword) {
            splashScreen.style.display = 'none';
            desktop.style.display = 'flex';
            initializeDesktop();
        } else {
            errorText.textContent = 'Incorrect password. Please try again.';
            passwordInput.value = '';
            passwordInput.focus();
        }
    }
    
    submitBtn.addEventListener('click', checkPassword);
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            checkPassword();
        }
    });
}

// Initialize Desktop
function initializeDesktop() {
    optimizeForLocalDevice();
    loadWidgets();
    initializeSystemPanel();
    startSystemMonitoring();
    attachEventListeners();
}

// Load Widgets
function loadWidgets() {
    const widgetContainer = document.querySelector('.widget-container');
    widgetContainer.innerHTML = '';
    
    widgets.forEach(widget => {
        const widgetConfig = state.widgetConfig[widget.name] || {};
        if (widget.hidden || widgetConfig.hidden) return;
        const tile = createWidgetTile(widget);
        widgetContainer.appendChild(tile);
    });
}

// Create Widget Tile
function createWidgetTile(widget) {
    const tile = document.createElement('div');
    tile.className = 'widget-tile';
    tile.innerHTML = `
        <div class="widget-icon">${widget.icon}</div>
        <div class="widget-title">${widget.title}</div>
    `;
    
    tile.addEventListener('click', () => openWidget(widget));
    return tile;
}

function optimizeForLocalDevice() {
    const hostname = window.location.hostname;
    const isLocalhost = ['localhost', '127.0.0.1', '::1', ''].includes(hostname);
    const isFileProtocol = window.location.protocol === 'file:';
    const userAgent = navigator.userAgent.toLowerCase();
    const isArmDevice = userAgent.includes('raspberry') || userAgent.includes('arm') || userAgent.includes('aarch64');
    
    if (isLocalhost || isFileProtocol || isArmDevice) {
        document.documentElement.classList.add('local-device');
        CONFIG.updateInterval = Math.max(CONFIG.updateInterval, 1500);
        CONFIG.splashScreenDuration = Math.min(CONFIG.splashScreenDuration, 2500);
    }
}

// Open Widget
function openWidget(widget) {
    // Check if window already exists
    const existingWindow = state.windows.find(w => w.widgetId === widget.name);
    if (existingWindow) {
        existingWindow.element.style.zIndex = 1000;
        return;
    }
    
    const template = document.getElementById('window-template');
    const windowElement = template.content.cloneNode(true);
    
    const windowDiv = windowElement.querySelector('.window');
    windowDiv.setAttribute('data-widget-id', widget.name);
    windowDiv.id = `window-${widget.name}`;
    
    const title = windowElement.querySelector('.window-title');
    title.textContent = widget.title;
    
    const iframe = windowElement.querySelector('iframe');
    iframe.src = `widgets/${widget.name}/index.html`;
    
    document.body.appendChild(windowElement);
    
    const widgetWindow = document.getElementById(`window-${widget.name}`);
    makeWindowDraggable(widgetWindow);
    makeWindowResizable(widgetWindow);
    attachWindowControls(widgetWindow, widget);
    
    // Store window reference
    state.windows.push({
        widgetId: widget.name,
        element: widgetWindow,
        minimized: false
    });
    
    // Random initial position
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const randomX = Math.max(0, Math.random() * (viewportWidth - 400));
    const randomY = Math.max(60, Math.random() * (viewportHeight - 300));
    widgetWindow.style.left = randomX + 'px';
    widgetWindow.style.top = randomY + 'px';
}

// Make Window Draggable
function makeWindowDraggable(windowElement) {
    const header = windowElement.querySelector('.window-header');
    let isDown = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    
    // Disable dragging on mobile devices (small screens)
    if (window.innerWidth <= 768) {
        return;
    }
    
    function startDrag(e) {
        isDown = true;
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        initialX = clientX - windowElement.offsetLeft;
        initialY = clientY - windowElement.offsetTop;
        windowElement.style.zIndex = 1000;
    }
    
    function drag(e) {
        if (!isDown) return;
        e.preventDefault();
        
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        currentX = clientX - initialX;
        currentY = clientY - initialY;
        
        windowElement.style.left = currentX + 'px';
        windowElement.style.top = currentY + 'px';
    }
    
    function endDrag() {
        isDown = false;
    }
    
    // Mouse events
    header.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
    
    // Touch events for mobile
    header.addEventListener('touchstart', startDrag, { passive: false });
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('touchend', endDrag);
}

// Make Window Resizable
function makeWindowResizable(windowElement) {
    const resizeHandle = windowElement.querySelector('.window-resize-handle');
    let isResizing = false;
    let startX, startY, startWidth, startHeight;
    
    // Disable resizing on mobile devices (small screens)
    if (window.innerWidth <= 768) {
        resizeHandle.style.display = 'none';
        return;
    }
    
    function startResize(e) {
        isResizing = true;
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        startX = clientX;
        startY = clientY;
        startWidth = windowElement.offsetWidth;
        startHeight = windowElement.offsetHeight;
    }
    
    function resize(e) {
        if (!isResizing) return;
        e.preventDefault();
        
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        const width = startWidth + (clientX - startX);
        const height = startHeight + (clientY - startY);
        
        if (width > 400) windowElement.style.width = width + 'px';
        if (height > 300) windowElement.style.height = height + 'px';
    }
    
    function endResize() {
        isResizing = false;
    }
    
    // Mouse events
    resizeHandle.addEventListener('mousedown', startResize);
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', endResize);
    
    // Touch events for mobile
    resizeHandle.addEventListener('touchstart', startResize, { passive: false });
    document.addEventListener('touchmove', resize, { passive: false });
    document.addEventListener('touchend', endResize);
}

// Attach Window Controls
function attachWindowControls(windowElement, widget) {
    const minimizeBtn = windowElement.querySelector('.window-minimize');
    const maximizeBtn = windowElement.querySelector('.window-maximize');
    const closeBtn = windowElement.querySelector('.window-close');
    
    minimizeBtn.addEventListener('click', () => minimizeWindow(windowElement, widget));
    maximizeBtn.addEventListener('click', () => maximizeWindow(windowElement));
    closeBtn.addEventListener('click', () => closeWindow(windowElement, widget));
}

// Minimize Window
function minimizeWindow(windowElement, widget) {
    windowElement.classList.add('minimizing');
    setTimeout(() => {
        windowElement.style.display = 'none';
        state.minimizedWindows.push({ widgetId: widget.name, element: windowElement });
        addToMinimizedBar(widget);
    }, 400);
}

// Maximize Window
function maximizeWindow(windowElement) {
    if (windowElement.dataset.maximized === 'true') {
        // Restore
        windowElement.style.left = windowElement.dataset.prevLeft + 'px';
        windowElement.style.top = windowElement.dataset.prevTop + 'px';
        windowElement.style.width = windowElement.dataset.prevWidth + 'px';
        windowElement.style.height = windowElement.dataset.prevHeight + 'px';
        windowElement.dataset.maximized = 'false';
    } else {
        // Maximize
        windowElement.dataset.prevLeft = windowElement.offsetLeft;
        windowElement.dataset.prevTop = windowElement.offsetTop;
        windowElement.dataset.prevWidth = windowElement.offsetWidth;
        windowElement.dataset.prevHeight = windowElement.offsetHeight;
        
        windowElement.style.left = '0';
        windowElement.style.top = '60px';
        windowElement.style.width = 'calc(100% - 20px)';
        windowElement.style.height = 'calc(100% - 90px)';
        windowElement.dataset.maximized = 'true';
    }
}

// Close Window
function closeWindow(windowElement, widget) {
    windowElement.remove();
    state.windows = state.windows.filter(w => w.widgetId !== widget.name);
    removeFromMinimizedBar(widget);
}

// Add to Minimized Bar
function addToMinimizedBar(widget) {
    const minimizedBar = document.getElementById('minimized-bar');
    const item = document.createElement('div');
    item.className = 'minimized-window';
    item.id = `minimized-${widget.name}`;
    item.textContent = widget.title;
    
    item.addEventListener('click', () => restoreWindow(widget));
    minimizedBar.appendChild(item);
}

// Remove from Minimized Bar
function removeFromMinimizedBar(widget) {
    const item = document.getElementById(`minimized-${widget.name}`);
    if (item) item.remove();
}

// Restore Window
function restoreWindow(widget) {
    const windowEntry = state.minimizedWindows.find(w => w.widgetId === widget.name);
    if (windowEntry) {
        windowEntry.element.style.display = 'flex';
        state.minimizedWindows = state.minimizedWindows.filter(w => w.widgetId !== widget.name);
        removeFromMinimizedBar(widget);
    }
}

// Initialize System Panel
function initializeSystemPanel() {
    const toggle = document.querySelector('.system-panel-toggle');
    const content = document.querySelector('.system-panel-content');
    
    toggle.addEventListener('click', () => {
        content.style.display = content.style.display === 'none' ? 'block' : 'none';
        toggle.style.transform = content.style.display === 'none' ? 'rotate(0deg)' : 'rotate(180deg)';
    });
}

// System Monitoring
function startSystemMonitoring() {
    setInterval(() => {
        updateCPUUsage();
        updateMemoryUsage();
    }, CONFIG.updateInterval);
}

// Update CPU Usage
function updateCPUUsage() {
    const cpuUsage = Math.floor(Math.random() * 100);
    const cpuElement = document.getElementById('cpu-usage');
    if (cpuElement) cpuElement.textContent = `CPU: ${cpuUsage}%`;
}

// Update Memory Usage
function updateMemoryUsage() {
    const memoryUsage = Math.floor(Math.random() * 800 + 200);
    const memElement = document.getElementById('memory-usage');
    if (memElement) memElement.textContent = `MEM: ${memoryUsage}MB`;
}

// Admin Panel
function attachEventListeners() {
    const adminBtn = document.getElementById('admin-btn');
    const adminModal = document.getElementById('admin-modal');
    const modalClose = document.querySelector('.modal-close');
    const adminLoginBtn = document.getElementById('admin-login-btn');
    const adminPassword = document.getElementById('admin-password');
    
    adminBtn.addEventListener('click', () => {
        adminModal.classList.add('active');
        state.adminLoggedIn = false;
        document.getElementById('admin-login').style.display = 'block';
        document.getElementById('admin-panel-content').style.display = 'none';
        adminPassword.value = '';
    });
    
    modalClose.addEventListener('click', () => {
        adminModal.classList.remove('active');
    });
    
    adminLoginBtn.addEventListener('click', () => {
        const password = adminPassword.value;
        
        if (password === CONFIG.adminPassword) {
            state.adminLoggedIn = true;
            document.getElementById('admin-login').style.display = 'none';
            document.getElementById('admin-panel-content').style.display = 'block';
            loadAdminPanel();
        } else {
            document.getElementById('admin-login-error').textContent = 'Invalid password';
            adminPassword.value = '';
        }
    });
    
    adminPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            adminLoginBtn.click();
        }
    });
    
    const saveConfigBtn = document.getElementById('save-config-btn');
    if (saveConfigBtn) {
        saveConfigBtn.addEventListener('click', () => {
            storage.setItem('widgetConfig', JSON.stringify(state.widgetConfig));
            alert('Configuration saved!');
        });
    }
}

// Load Admin Panel
function loadAdminPanel() {
    const container = document.querySelector('.widget-config-container');
    container.innerHTML = '';
    
    widgets.forEach((widget, index) => {
        const widgetConfig = state.widgetConfig[widget.name] || {};
        const isHidden = widgetConfig.hidden || widget.hidden;
        const item = document.createElement('div');
        item.className = 'widget-config-item';
        item.innerHTML = `
            <div class="widget-config-item-name">${widget.title}</div>
            <div class="widget-config-buttons">
                <button onclick="moveWidgetUp(${index})">↑</button>
                <button onclick="moveWidgetDown(${index})">↓</button>
                <button onclick="toggleWidget(${index})">${isHidden ? 'Enable' : 'Disable'}</button>
            </div>
        `;
        container.appendChild(item);
    });
}

// Move Widget Up
function moveWidgetUp(index) {
    if (index > 0) {
        [widgets[index - 1], widgets[index]] = [widgets[index], widgets[index - 1]];
        loadAdminPanel();
    }
}

// Move Widget Down
function moveWidgetDown(index) {
    if (index < widgets.length - 1) {
        [widgets[index], widgets[index + 1]] = [widgets[index + 1], widgets[index]];
        loadAdminPanel();
    }
}

// Toggle Widget
function toggleWidget(index) {
    const widget = widgets[index];
    const widgetConfig = state.widgetConfig[widget.name] || {};
    const isHidden = widgetConfig.hidden || widget.hidden || false;
    state.widgetConfig[widget.name] = {
        ...widgetConfig,
        hidden: !isHidden
    };
    loadWidgets();
    loadAdminPanel();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    handleSplashScreen();
});