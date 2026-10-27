import Image from "next/image";

type Props = { id?: string; className?: string; src: string; width: number; height: number; alt: string };

/**
 * The logo with the ticket's glossy finish: a glow behind the art, a soft top highlight and a shine that
 * sweeps across the letters. The wrapper carries the id so an intro animation fades art and gloss together.
 */
export function LogoShine({ id, className, src, width, height, alt }: Props) {
  const mask = `url(${src}) center / contain no-repeat`;
  return (
    <span id={id} className={`o26-logo-shine${className ? ` ${className}` : ""}`}>
      <Image className="o26-logo-glow" src={src} width={width} height={height} alt={alt} />
      <span aria-hidden="true" className="o26-logo-sheen" style={{ mask, WebkitMask: mask }}>
        <span className="o26-logo-top" />
        <span className="lg-shine" />
      </span>
    </span>
  );
}
