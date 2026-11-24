# Mobile app (PWA)

Hubarr is a **progressive web app**: install it on the home screen of a phone, tablet or computer, and it then opens full screen, without an address bar, like a native app.

## Requirements

Installing requires an **HTTPS** connection (see [Reverse proxy](./reverse-proxy.md)). On `http://192.168.x.x:7070`, the app still works in the browser but cannot be installed.

## Installing

- **Android (Chrome, Edge)**: ⋮ menu → **Install app** (or **Add to home screen**).
- **iPhone and iPad (Safari)**: Share button → **Add to Home Screen**.
- **Desktop (Chrome, Edge)**: install icon on the right of the address bar.

## What is kept offline

The service worker keeps the application **shell** (page, scripts, styles, icons) for a fast start. A new Hubarr version is picked up on the next launch.

## Instant display on reopening

The browser also keeps, for 24 hours, what you last viewed in the dashboard, Discover, the calendar, the libraries and the movie and series pages. When you reload or reopen Hubarr, these screens show this content straight away, then update it: a thin line at the top of the screen shows the update is in progress.

- Logs, settings, your profile, activity and download queues are never kept: they always come from your services.
- This copy belongs to your account and to the Hubarr version: it is cleared when you sign out, when your session ends, when another account signs in and when Hubarr is updated.
- Without a network, the app opens on this content but cannot update it.

## Mobile gestures

Mobile-specific gestures (bottom bar, long press to select, pull to refresh…) are described in [First start](./first-start.md#on-mobile).
