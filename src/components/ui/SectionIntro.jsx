export default function SectionIntro({ eyebrow, title, description, actions = null }) {
  return (
    <div className="section-head section-head--aligned">
      <div>
        {eyebrow ? <p className="section-head__eyebrow">{eyebrow}</p> : null}
        <h2 className="section-head__title">{title}</h2>
        {description ? <p className="section-head__copy">{description}</p> : null}
      </div>
      {actions ? <div className="section-head__actions">{actions}</div> : null}
    </div>
  );
}
