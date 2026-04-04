export default function LoadingScreen({ label = "Loading..." }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-screen__spinner" />
      <p>{label}</p>
    </div>
  );
}
