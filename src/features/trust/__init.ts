/**
 * Barrel for the trust feature surface. Keeps imports stable for downstream
 * pages (Document table rows, DocumentDetail, AnswerPanel popovers, etc.)
 * even if the underlying file layout shifts.
 */

export {
  TrustScorecard,
  type TrustScorecardProps,
} from "./TrustScorecard";
