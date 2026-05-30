/**
 * Audit log skeleton — honest loading state.
 */
export default function Loading(): React.ReactElement {
  return (
    <section aria-busy="true" aria-label="Loading audit log">
      <span
        className="adm-skel adm-skel--line"
        style={{ maxWidth: "180px" }}
      >
        loading
      </span>
      <span
        className="adm-skel adm-skel--line"
        style={{ maxWidth: "320px", height: "2em" }}
      >
        loading
      </span>
      <span
        className="adm-skel adm-skel--block"
        style={{ marginTop: "var(--sp-16)", height: "120px" }}
      >
        loading
      </span>
      <span
        className="adm-skel adm-skel--block"
        style={{ marginTop: "var(--sp-16)", height: "400px" }}
      >
        loading
      </span>
    </section>
  );
}
