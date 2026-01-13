# SLT GEAR ONE

SLT GEAR ONE is a web-based control interface for the SLT GEAR ONE audio hardware and software ecosystem. It provides a compact, responsive dashboard of widgets for mixing, monitoring, effects, recording, and device configuration.

## Table of Contents

- Features
- Quick Start
- File Structure<img width="1466" height="812" alt="Screenshot 2026-01-14 010731" src="https://github.com/user-attachments/assets/bf69710b-c0f5-4944-86ab-209067779ae3" />
<img width="1904" height="819" alt="Screenshot 2026-01-14 010649" src="https://github.com/user-attachments/assets/411e45fe-36fd-489a-9b6a-53e0d2232907" />
<img width="759" height="729" alt="Screenshot 2026-01-14 010620" src="https://github.com/user-attachments/assets/471fd876-4217-4878-9a2c-976fcca16423" />

- Development
- Contributing
- License

## Features

- Responsive, modern UI with movable/resizable widget windows
- Mixer, Equalizer, Effects, Recorder, Monitor, Presets, Inputs, Outputs and more
- Admin panel for configuration (default admin password present in repo; change for production)
- Works in any modern browser; no build step required for basic usage

## Quick Start

1. Open the project folder and serve it from a static server or open `index.html` directly in a modern browser.

  - To run a quick local server (Python 3):

    ```bash
    python -m http.server 8000
    # then open http://localhost:8000
    ```

2. Open the site and use the dashboard to open widgets and control audio-related features.

3. Admin functions are available via the Admin panel in the UI. (If the repository includes a default password, change it before deploying publicly.)

## File Structure (important files)

- [index.html](index.html): Main application shell
- [css/style.css](css/style.css): Core styles
- [js/app.js](js/app.js): Application logic and widget loader
- [widgets/](widgets/): Individual widget folders (each contains an `index.html`)

## Development

- Edit HTML, CSS, and JS files directly. Reload the browser to see changes.
- Use a local static server for proper module and XHR behavior (see Quick Start).
- Keep assets in their respective folders under `widgets/` and `css/`.

## Contributing

- File an issue or open a pull request with a concise description of the change.
- Follow project formatting and keep changes focused and well-documented.

## License

This project is provided under the MIT License unless another license is included in the repository. See the LICENSE file if present.

## Contact


For questions or help, open an issue in the repository.

