# Mobile app (PWA)

Hubarr is a **progressive web app**: install it on the home screen of a phone, tablet or computer, and it then opens full screen, without an address bar, like a native app.

## Requirements

Installing requires an **HTTPS** connection (see [Reverse proxy](./reverse-proxy.md)). On `http://192.168.x.x:7070`, the app still works in the browser but cannot be installed.

## Installing

- **Android (Chrome, Edge)**: ⋮ menu → **Install app** (or **Add to home screen**).
- **iPhone and iPad (Safari)**: Share button → **Add to Home Screen**.
- **Desktop (Chrome, Edge)**: install icon on the right of the address bar.

## What is kept offline

The service worker keeps the application **shell** (page, scripts, styles, icons) for a fast start. **Data** (libraries, downloads, activity) is never cached: without a network, the app opens but cannot show anything from your services. A new Hubarr version is picked up on the next launch.

## Mobile gestures

Mobile-specific gestures (bottom bar, long press to select, pull to refresh…) are described in [First start](./first-start.md#on-mobile).
