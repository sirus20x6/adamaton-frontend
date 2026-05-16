/**
 * Typed wrappers around the platform/settings HTTP endpoints.
 */

import { api } from "@/api/client";

export type ProviderUrls = Record<string, string>;
export type ModelTiers = {
  fast?: string;
  mid?: string;
  intelligent?: string;
};
export type TrustWeights = {
  source_weight?: number;
  recency_decay?: number;
  arxiv_source_tier?: number;
  citation_count_log?: number;
  journal_quality?: number;
};

export type RuntimeSettings = {
  provider_urls: ProviderUrls;
  model_tiers: ModelTiers;
  trust_weights: TrustWeights;
  masked_secrets?: Record<string, string>;
  config_path?: string;
};

export type UpdateSettingsInput = {
  provider_urls?: ProviderUrls;
  model_tiers?: ModelTiers;
  trust_weights?: TrustWeights;
};

export async function getSettings(): Promise<RuntimeSettings> {
  return api.get<RuntimeSettings>("/platform/settings/");
}

export async function updateSettings(
  input: UpdateSettingsInput,
): Promise<RuntimeSettings> {
  return api.put<RuntimeSettings>("/platform/settings/", input);
}
