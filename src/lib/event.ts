/**
 * Event details shown in the page header and browser title.
 * ONE·26 is on 26 January 2027 at St. Michaels Parish Hall, Vazhakkala; gates open at 5:00 pm.
 * `venue` and `hall` are joined as "venue · hall" on the ticket, so `hall` carries the locality.
 */
export const EVENT = {
  name: "Rekindle",
  date: "Tuesday 26 January 2027",
  venue: "St. Michaels Parish Hall",
  /** Short forms used on the seat map and the digital ticket. Keep in step with `date`. */
  weekdayDate: "Tue · 26 Jan 2027",
  shortDate: "26 Jan",
  longDate: "26 January 2027",
  hall: "Vazhakkala",
  gatesOpen: "5:00 pm",
} as const;
