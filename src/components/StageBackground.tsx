/** The site-wide stage: navy gradient, three slowly drifting glows and a faint sheen, fixed behind every page. */
export function StageBackground() {
  return (
    <div aria-hidden="true" data-testid="stage-background" className="o26-stage">
      <div className="o26-glow o26-glow-flame" />
      <div className="o26-glow o26-glow-teal" />
      <div className="o26-glow o26-glow-amber" />
      <div className="o26-sheen" />
    </div>
  );
}
