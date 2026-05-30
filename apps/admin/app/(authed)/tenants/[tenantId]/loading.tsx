/**
 * Tenant drill-down skeleton.
 *
 * Honest about loading — no spinners, no fake numbers. Shape-only blocks
 * so the layout doesn't jump when the data arrives.
 */
export default function Loading(): React.ReactElement {
  return (
    <section aria-busy="true" aria-label="Loading tenant detail">
      <span
        className="adm-skel adm-skel--line"
        style={{ maxWidth: "240px" }}
      >
        loading
      </span>
      <span
        className="adm-skel adm-skel--line"
        style={{ maxWidth: "360px", height: "2em" }}
      >
        loading
      </span>
      <span className="adm-skel adm-skel--block">loading</span>
      <div className="adm-grid" style={{ marginTop: "var(--sp-16)" }}>
        <span className="adm-skel adm-skel--block">loading</span>
        <span className="adm-skel adm-skel--block">loading</span>
        <span className="adm-skel adm-skel--block">loading</span>
        <span className="adm-skel adm-skel--block">loading</span>
        <span className="adm-skel adm-skel--block">loading</span>
      </div>
      <span
        className="adm-skel adm-skel--block"
        style={{ marginTop: "var(--sp-24)", height: "220px" }}
      >
        loading
      </span>
    </section>
  );
}
