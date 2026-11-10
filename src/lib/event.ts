/**
 * Event details shown in the page header and browser title.
 * ONE·26 is on 26 January 2027 at St. Michael's Parish Hall, Vazhakkala; gates open at 5:30 pm.
 * `venue` and `hall` are joined as "venue · hall" on the ticket, so `hall` carries the locality.
 */
export const EVENT = {
  name: "Rekindle",
  date: "Tuesday 26 January 2027",
  venue: "St. Michael's Parish Hall",
  /** Short forms used on the seat map and the digital ticket. Keep in step with `date`. */
  weekdayDate: "Tue · 26 Jan 2027",
  shortDate: "26 Jan",
  longDate: "26 January 2027",
  hall: "Vazhakkala",
  /** One-line place for pages and the footer. */
  place: "St. Michael's Parish Hall, Vazhakkala",
  /** Per-person entry fee shown in copy; the charged price comes from the Tiers admin page. */
  entryFee: "₹500",
  gatesOpen: "5:30 pm",
  /** The organizer's own Google Maps link for the venue; the "Open in Google Maps" button uses it. */
  mapLink: "https://maps.app.goo.gl/CFf6ixnCfhpKEuNt6",
  /** What the embedded map searches for. Use "lat,lng" instead to pin the exact spot. */
  mapQuery: "St. Michael's Parish Hall, Vazhakkala",
} as const;
