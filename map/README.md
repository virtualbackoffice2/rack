# VBOAttendance Live Tracking Dashboard

Vanilla HTML/CSS/JS dashboard for employee live tracking with Google Maps, backed by the existing FastAPI location APIs under `/api/v1/location`.

## Files

- `index.html` - dashboard markup and layout shell
- `styles.css` - responsive UI styling, panels, markers, timeline, and toasts
- `script.js` - Google Maps integration, API polling, caching, routes, markers, and info panel logic

## Features

- Live employee list with online/offline state, last seen, last position, and today's distance
- Google Map with multiple employees shown at once
- Colored route polylines per employee
- Live markers with pulsing state for online users
- Auto-refresh controls for `5s`, `10s`, `30s`, or `Off`
- Route visibility toggle, center selected action, and clear-all action
- Bottom info panel with route stats and status timeline
- Retry logic with cache fallback via `localStorage`

## Setup

1. Serve these files from the same frontend/static location that can reach your FastAPI backend.
2. Make sure the backend exposes:
   - `GET /api/v1/location/status`
   - `GET /api/v1/location/mapdata/{employee_id}`
   - `GET /api/v1/location/locations/{employee_id}?limit=1`
   - `GET /api/v1/location/status/logs/{employee_id}`
3. Open `index.html` in Chrome, Firefox, or Edge.

## Notes

- The Google Maps API key from the project brief is already wired in `script.js`.
- The date picker is intentionally locked to today because the provided backend contract only exposes today's filtered route.
- If an API call fails, the dashboard retries up to 3 times and then falls back to cached data if available.
- Status logs and latest location parsing are defensive, so slightly different backend response wrappers can still be handled.
