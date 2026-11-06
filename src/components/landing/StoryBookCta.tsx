import Link from "next/link";
import { LINKS } from "@/components/landing/links";

/**
 * Floating "Book Tickets" pill pinned over the scroll story (inside the sticky #o26-stage), for anyone
 * who doesn't want to scroll through the whole animated intro to reach registration. Its fade-in/glow
 * and the scroll-driven fade-out near the end of the story both live in landing.css / StoryIntro.tsx.
 */
export function StoryBookCta() {
  return (
    <Link id="o26-bookcta" href={LINKS.register} className="o26-bookcta o26-ff-fredoka">
      <svg aria-hidden="true" width="13" height="17" viewBox="0 0 14 18" fill="#0B1020">
        <path d="M7 0C9 4 13 6 13 11a6 6 0 0 1-12 0c0-3 2-4 3-7 1 2 1 3 2 4 1-3 0-5 1-8z" />
      </svg>
      Book Tickets
    </Link>
  );
}
