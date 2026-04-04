export default function Button({
  children,
  className = "",
  variant = "primary",
  block = false,
  loading = false,
  ...props
}) {
  const classes = [
    "button",
    `button--${variant}`,
    block ? "button--block" : "",
    loading ? "button--loading" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} disabled={loading || props.disabled} {...props}>
      {loading ? <span className="button__spinner" aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}
