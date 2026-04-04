import Button from "./Button";

export default function ErrorCallout({
  children,
  onRetry,
  retryLabel = "Try again",
  className = "",
}) {
  return (
    <div className={`error-callout ${className}`.trim()} role="alert">
      <p className="error-callout__text">{children}</p>
      {onRetry ? (
        <Button type="button" variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
