export default function FormField({
  label,
  htmlFor,
  hint,
  className = "",
  children,
}) {
  return (
    <label className={`field ${className}`.trim()} htmlFor={htmlFor}>
      <span className="field__label">{label}</span>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}
