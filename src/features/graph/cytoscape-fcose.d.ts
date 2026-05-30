/**
 * Minimal ambient type declaration for cytoscape-fcose.
 *
 * The npm package ships JavaScript-only; this stub gives TypeScript a
 * default export that satisfies `cytoscape.use()` without requiring a
 * @ts-ignore suppression comment.
 */
declare module "cytoscape-fcose" {
  import type cytoscape from "cytoscape";
  const fcose: cytoscape.Ext;
  export default fcose;
}
