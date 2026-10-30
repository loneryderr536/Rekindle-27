/** Turns an error code from `POST /api/holds` (or "NETWORK" for a failed request) into a message for the attendee. */
export function holdErrorMessage(code: string, serverMessage: string): string {
  switch (code) {
    case "SEATS_TAKEN":
      return "Some seats were just taken — please pick again";
    case "ACTIVE_HOLD_EXISTS":
      return "You already have a booking in progress. Finish it or wait 10 minutes.";
    case "SIGN_IN_REQUIRED":
      return "Please sign in again to book your seats.";
    case "RATE_LIMITED":
      return "Too many attempts from your connection. Wait a few minutes, then try again.";
    case "TURNSTILE_FAILED":
      return "We couldn't confirm you're human. Complete the check again, then retry.";
    case "PAYMENT_UNAVAILABLE":
      return "Payments are unavailable right now, so your seats were released. Try again in a minute.";
    case "INVALID_SEATS":
      return "Some of the selected seats can't be booked. Pick your seats again.";
    case "INVALID_DISCOUNT":
      return "That discount code isn't valid. Check it or remove it, then try again.";
    case "VALIDATION":
      return serverMessage;
    case "NETWORK":
      return "Couldn't reach the box office. Check your connection and try again.";
    default:
      return "Something went wrong on our side. Try again in a moment.";
  }
}
