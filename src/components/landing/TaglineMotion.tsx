/**
 * The opening tagline, ported from the one-tagline-on-night motion piece (in the same Poppins as the presenter
 * lines above the title): each whole line is centred and rolls up in turn — for Christ,
 * for the Nation, for the Youth — and rests on the last. Plays once, on the page clock (see .o26-tag in landing.css). Change the words here.
 */
const PHRASES = ["for Christ", "for the Nation", "for the Youth"];

export function TaglineMotion({ id }: { id?: string }) {
  return (
    <div id={id} className="o26-tag" role="img" aria-label="One for Christ, one for the Nation, one for the Youth">
      <div className="o26-tag-line o26-ff-poppins" aria-hidden="true">
        {PHRASES.map((p, i) => (
          <span key={p} className={`o26-tag-phrase o26-tag-p${i + 1}`}>One {p}</span>
        ))}
      </div>
    </div>
  );
}
