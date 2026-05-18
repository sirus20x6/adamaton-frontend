// API surface for the Datasets page. Lands on platform/dashboard/apiserver
// through Caddy's /evo-api/* proxy.
//
// Backend handlers live in
// adamaton-platform/dashboard/apiserver/datasets_endpoints.go.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const EVO_BASE = "/evo-api/api/v1";

// Mirrors evo_datasets.datasets.task_type CHECK constraint.
export const DATASET_TASK_TYPES = [
  "dpo",
  "sft",
  "eval",
  "kernel-bench",
  "pretrain",
  "other",
] as const;
export type DatasetTaskType = (typeof DATASET_TASK_TYPES)[number];

// Mirrors evo_datasets.dataset_versions.status CHECK constraint.
export const DATASET_VERSION_STATUSES = [
  "pending",
  "importing",
  "transforming",
  "ready",
  "failed",
  "deleted",
] as const;
export type DatasetVersionStatus = (typeof DATASET_VERSION_STATUSES)[number];

// Importer source kinds accepted by POST /datasets/import. "derived" exists
// in the schema for transform-output provenance but is not user-selectable.
export const DATASET_SOURCE_KINDS = ["local", "huggingface", "kaggle"] as const;
export type DatasetSourceKind = (typeof DATASET_SOURCE_KINDS)[number];

export interface DatasetVersionBrief {
  version: number;
  status: DatasetVersionStatus;
  row_count?: number;
  byte_count?: number;
  format: "jsonl" | "parquet" | "csv" | "mixed";
  created_at: string;
  finalized_at?: string;
}

export interface Dataset {
  id: string;
  display_name: string;
  description: string;
  task_type: DatasetTaskType;
  created_at: string;
  archived_at?: string;
  latest_version?: DatasetVersionBrief;
}

export interface DatasetCreateRequest {
  id: string;
  display_name?: string;
  description?: string;
  task_type: DatasetTaskType;
}

export interface DatasetImportRequest {
  dataset_id: string;
  source_kind: DatasetSourceKind;
  source_ref: string;
  notes?: string;
}

export interface DatasetImportResponse {
  workflow_id: string;
  run_id?: string;
  already_running?: boolean;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg =
      (parsed as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return parsed as T;
}

export const datasetsApi = {
  list: () => fetch(`${EVO_BASE}/datasets`).then(jsonOrThrow<Dataset[]>),

  create: (body: DatasetCreateRequest) =>
    fetch(`${EVO_BASE}/datasets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(jsonOrThrow<Dataset>),

  import: (body: DatasetImportRequest) =>
    fetch(`${EVO_BASE}/datasets/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(jsonOrThrow<DatasetImportResponse>),
};

export const datasetKeys = {
  all: ["datasets"] as const,
  list: () => ["datasets", "list"] as const,
};

export function useDatasets() {
  return useQuery({
    queryKey: datasetKeys.list(),
    queryFn: datasetsApi.list,
    refetchInterval: 10_000,
  });
}

export function useCreateDataset() {
  const qc = useQueryClient();
  return useMutation<Dataset, Error, DatasetCreateRequest>({
    mutationFn: datasetsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: datasetKeys.list() });
    },
  });
}

export function useImportDataset() {
  const qc = useQueryClient();
  return useMutation<DatasetImportResponse, Error, DatasetImportRequest>({
    mutationFn: datasetsApi.import,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: datasetKeys.list() });
    },
  });
}
