const fs = require('fs');
const path = require('path');

// Define the remaining widgets that need placeholders
const widgets = [
    {
        name: 'recorder',
        title: 'Recorder',
        icon: '🎙️',
        description: 'This is a placeholder for the Recorder control panel.',
        features: [
            'Record multi-track audio',
            'Adjustable sample rate and bit depth',
            'Real-time monitoring',
            'Multiple file format export',
            'Time-stamped recordings',
            'Automatic backup'
        ]
    },
    {
        name: 'samples',
        title: 'Samples',
        icon: '🎵',
        description: 'This is a placeholder for the Samples control panel.',
        features: [
            'Sample browser',
            'Categorized sample library',
            'Drag and drop functionality',
            'Quick preview',
            'Sample editing tools',
            'Import/Export capabilities'
        ]
    },
    {
        name: 'monitor',
        title: 'Monitor',
        icon: '📊',
        description: 'This is a placeholder for the Monitor control panel.',
        features: [
            'Real-time spectrum analyzer',
            'Audio level monitoring',
            'Peak detection',
            'RMS metering',
            'Phase correlation',
            'Loudness measurement'
        ]
    },
    {
        name: 'settings',
        title: 'Settings',
        icon: '⚙️',
        description: 'This is a placeholder for the Settings control panel.',
        features: [
            'Interface configuration',
            'Audio device selection',
            'Buffer size adjustment',
            'User preference settings',
            'Theme customization',
            'Keyboard shortcuts'
        ]
    },
    {
        name: 'presets',
        title: 'Presets',
        icon: '💾',
        description: 'This is a placeholder for the Presets control panel.',
        features: [
            'Save and load presets',
            'Preset categories',
            'Import/Export functionality',
            'Default preset options',
            'Quick preset switching',
            'Preset tags and search'
        ]
    },
    {
        name: 'inputs',
        title: 'Inputs',
        icon: '🔌',
        description: 'This is a placeholder for the Inputs control panel.',
        features: [
            'Input channel configuration',
            'Input gain control',
            'Input source selection',
            'Phantom power toggle',
            'Input labeling',
            'Input routing'
        ]
    },
    {
        name: 'outputs',
        title: 'Outputs',
        icon: '🔊',
        description: 'This is a placeholder for the Outputs control panel.',
        features: [
            'Output channel routing',
            'Output level control',
            'Output muting',
            'Output metering',
            'Output labeling',
            'Headphone mix control'
        ]
    }
];

// HTML template function
const generateHTML = (widget) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SLT GEAR ONE - ${widget.title}</title>
    <style>
        :root {
            --primary-bg: #121212;
            --secondary-bg: #1e1e1e;
            --tertiary-bg: #2d2d2d;
            --text-color: #f0f0f0;
            --primary-color: #00b3ff;
            --primary-color-glow: #00b3ff80;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }

        body {
            background-color: var(--primary-bg);
            color: var(--text-color);
            padding: 20px;
            overflow: auto;
            height: 100vh;
        }

        .widget-container {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .widget-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .widget-title {
            font-size: 1.5rem;
            color: var(--primary-color);
        }

        .widget-content {
            display: flex;
            flex-direction: column;
            gap: 20px;
            background-color: var(--secondary-bg);
            padding: 20px;
            border-radius: 6px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        }

        .placeholder-text {
            text-align: center;
            padding: 40px;
        }

        .placeholder-icon {
            font-size: 3rem;
            color: var(--primary-color);
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="widget-container">
        <div class="widget-header">
            <h1 class="widget-title">${widget.title}</h1>
        </div>
        <div class="widget-content">
            <div class="placeholder-text">
                <div class="placeholder-icon">${widget.icon}</div>
                <h2>${widget.title} Module</h2>
                <p>${widget.description}</p>
                <p>The actual implementation would include features like:</p>
                <ul style="list-style: none; margin-top: 10px;">
                    ${widget.features.map(feature => `<li>• ${feature}</li>`).join('\n                    ')}
                </ul>
            </div>
        </div>
    </div>
</body>
</html>`;
};

// Create placeholder files
widgets.forEach(widget => {
    try {
        // Make sure the directory exists
        const dirPath = path.join(__dirname, 'widgets', widget.name);
        if (!fs.existsSync(dirPath)) {
            console.log(`Creating directory: ${dirPath}`);
            fs.mkdirSync(dirPath, { recursive: true });
        }
        
        // Write the file
        const filePath = path.join(dirPath, 'index.html');
        fs.writeFileSync(filePath, generateHTML(widget));
        console.log(`Created placeholder for ${widget.title} at ${filePath}`);
    } catch (err) {
        console.error(`Error creating placeholder for ${widget.title}:`, err);
    }
});

console.log('All placeholders created successfully!'); 