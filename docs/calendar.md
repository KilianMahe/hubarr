# Calendar

The calendar (`/calendrier`, the **Calendar** tab of [**Home**](./first-start.md#home)) merges movie releases (cinema, digital, physical) from every Radarr instance and episodes from every Sonarr instance, 90 days back and ahead. A movie tracked by two instances (1080p and 4K, say) appears once.

## Views and filters

- **Month**, **Week** and **Day** (detailed agenda); the browser remembers your choice. A URL such as `/calendrier?view=day&date=2026-11-25` opens a day directly.
- In the month, click a day to list its releases below the grid (the calendar stays on the month view); the selected day is framed, and today's number is shown in the accent colour; the titles shown in a day are only a preview, and releases open from the list. **On mobile**, the month shows one coloured dot per release. The week is shown as a list, one block per day.
- Filters by **type** (cinema, digital, physical, episodes, each with its icon) and by **download status**.
- Clicking an event opens its quick look.

When an instance does not respond, a banner says so without hiding the others. A service you do not use (no enabled instance) never shows a banner.

## Colours

Each release is coloured by its **download status**; the status filters double as the legend:

| Colour | Status        | Meaning                                                                                                                                                                                                                              |
| ------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Green  | Downloaded    | The file is there.                                                                                                                                                                                                                   |
| Orange | Downloading   | The movie or episode is in the instance queue.                                                                                                                                                                                       |
| Red    | Missing       | Released (or aired) and monitored, without a file. For a movie, "released" follows its minimum availability in Radarr: announced, in cinemas, or released (digital or physical release, otherwise 90 days after the cinema release). |
| Blue   | Upcoming      | Monitored, not released yet.                                                                                                                                                                                                         |
| Grey   | Not monitored | Not monitored and without a file.                                                                                                                                                                                                    |

The release type (cinema, digital, physical, episode) is shown by its icon and its label.

## iCal subscription

The **iCal** button gives the feed address: `https://your-hubarr/calendrier.ics`. Add it as a subscribed calendar in your app. The feed covers 30 days back and 180 days ahead; each event keeps the same identifier across instances, so your app updates it instead of duplicating it.

::: warning Session required
The feed requires a Hubarr session: it works in a logged-in browser, not yet in apps that do not send the session cookie.
:::
