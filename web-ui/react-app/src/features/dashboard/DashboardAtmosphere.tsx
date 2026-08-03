/**
 * Low-risk TV backdrop: slow aurora + faint grid.
 * CSS-only animation; disabled under prefers-reduced-motion.
 * No particles, trails, or marketing noise.
 */
export function DashboardAtmosphere() {
  return (
    <div
      className="dashboard-atmosphere"
      data-testid="dashboard-atmosphere"
      aria-hidden
    >
      <div className="dashboard-atmosphere-aurora" />
      <div className="dashboard-atmosphere-grid" />
      <div className="dashboard-atmosphere-vignette" />
    </div>
  );
}
