/**
 * Event details shown in the page header and browser title.
 * The date is the night of ONE·26 (26 January 2027). The venue, hall and gate time are still PLACEHOLDERS —
 * the organizer must edit them before launch.
 */
export const EVENT = {
  name: "Rekindle",
  date: "Tuesday 26 January 2027",
  venue: "Venue Hall, City",
  /** Short forms used on the seat map and the digital ticket. Keep in step with `date`. */
  weekdayDate: "Tue · 26 Jan 2027",
  shortDate: "26 Jan",
  longDate: "26 January 2027",
  hall: "Main hall",
  gatesOpen: "6:00 pm",
} as const;
