# Calendar

The calendar (`/calendrier`) merges movie releases (cinema, digital, physical) from every Radarr instance and episodes from every Sonarr instance, 90 days back and ahead. A movie tracked by two instances (1080p and 4K, say) appears once.

## Views and filters

- **Month**, **Week** and **Day** (detailed agenda); the browser remembers your choice. A URL such as `/calendrier?view=day&date=2026-11-25` opens a day directly.
- In the month, click a day to list its releases below the grid (the calendar stays on the month view). **On mobile**, the month shows one coloured dot per release. The week is shown as a list, one block per day.
- Filters by **type** (cinema, digital, physical, episodes) and **status** (monitored, not monitored, available).
- Clicking an event opens its quick look.

When an instance does not respond, a banner says so without hiding the others. A service you do not use (no enabled instance) never shows a banner.

## iCal subscription

The **iCal** button gives the feed address: `https://your-hubarr/calendrier.ics`. Add it as a subscribed calendar in your app. The feed covers 30 days back and 180 days ahead; each event keeps the same identifier across instances, so your app updates it instead of duplicating it.

::: warning Session required
The feed requires a Hubarr session: it works in a logged-in browser, not yet in apps that do not send the session cookie.
:::
