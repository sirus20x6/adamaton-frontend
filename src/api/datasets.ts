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

export interface WorkflowStartResponse {
  workflow_id: string;
  run_id?: string;
  already_running?: boolean;
}

// Import endpoint predates the shared shape; alias for back-compat.
export type DatasetImportResponse = WorkflowStartResponse;

export interface DatasetSource {
  id: string;
  kind: "local" | "huggingface" | "kaggle" | "derived";
  ref: string;
  commit_hash: string;
  license: string;
  raw_metadata: Record<string, unknown>;
  fetched_at: string;
}

export interface DatasetFile {
  id: string;
  object_key: string;
  file_path: string;
  byte_size: number;
  sha256: string;
  row_count?: number;
  format: string;
}

export interface DatasetSplit {
  id: string;
  name: string;
  salt: string;
  ratios: number[];
  split_names: string[];
  kfold: number;
  created_at: string;
}

export interface DatasetVersion {
  id: string;
  dataset_id: string;
  version: number;
  status: DatasetVersionStatus;
  row_count?: number;
  byte_count?: number;
  format: "jsonl" | "parquet" | "csv" | "mixed";
  notes: string;
  created_at: string;
  finalized_at?: string;
  sources: DatasetSource[];
  files: DatasetFile[];
  splits: DatasetSplit[];
}

export interface DatasetDetail extends Dataset {
  tags: string[];
  versions: DatasetVersion[];
}

export interface QualityObservation {
  id: string;
  version_id: string;
  version: number;
  distill_run_id: string;
  eval_delta?: number;
  won?: boolean;
  raw_metrics: Record<string, unknown>;
  observed_at: string;
}

// Mirrors transformer.SupportedTargets in the dataset-manager.
export const DATASET_TRANSFORM_FORMATS = ["jsonl", "parquet"] as const;
export type DatasetTransformFormat = (typeof DATASET_TRANSFORM_FORMATS)[number];

export interface DatasetTransformRequest {
  dataset_id: string;
  source_version_id: string;
  target_format: DatasetTransformFormat;
  notes?: string;
}

export interface DatasetMakeSplitsRequest {
  version_id: string;
  name: string;
  salt?: string;
  ratios: number[];
  split_names: string[];
}

export interface DatasetMakeKFoldSplitsRequest {
  version_id: string;
  k: number;
  salt?: string;
  name_prefix?: string;
}

export interface DatasetQualityRequest {
  version_id: string;
  distill_run_id: string;
  eval_delta?: number;
  won?: boolean;
  raw_metrics?: Record<string, unknown>;
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

function postJSON<T>(url: string, body: unknown): Promise<T> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(jsonOrThrow<T>);
}

export const datasetsApi = {
  // Read.
  list: () => fetch(`${EVO_BASE}/datasets`).then(jsonOrThrow<Dataset[]>),
  get: (id: string) =>
    fetch(`${EVO_BASE}/datasets/${encodeURIComponent(id)}`).then(
      jsonOrThrow<DatasetDetail>,
    ),
  getVersion: (versionID: string) =>
    fetch(
      `${EVO_BASE}/datasets/versions/${encodeURIComponent(versionID)}`,
    ).then(jsonOrThrow<DatasetVersion>),
  quality: (id: string) =>
    fetch(`${EVO_BASE}/datasets/${encodeURIComponent(id)}/quality`).then(
      jsonOrThrow<QualityObservation[]>,
    ),

  // Lifecycle.
  create: (body: DatasetCreateRequest) =>
    postJSON<Dataset>(`${EVO_BASE}/datasets`, body),
  archive: (id: string) =>
    postJSON<{ id: string; status: string }>(
      `${EVO_BASE}/datasets/${encodeURIComponent(id)}/archive`,
      {},
    ),

  // Tags.
  addTag: (id: string, tag: string) =>
    postJSON<{ dataset_id: string; tag: string }>(
      `${EVO_BASE}/datasets/${encodeURIComponent(id)}/tags`,
      { tag },
    ),
  removeTag: (id: string, tag: string) =>
    fetch(
      `${EVO_BASE}/datasets/${encodeURIComponent(id)}/tags/${encodeURIComponent(tag)}`,
      { method: "DELETE" },
    ).then((res) => {
      if (!res.ok && res.status !== 204) {
        throw new Error(`HTTP ${res.status}`);
      }
    }),

  // Workflow-firing actions.
  import: (body: DatasetImportRequest) =>
    postJSON<DatasetImportResponse>(`${EVO_BASE}/datasets/import`, body),
  transform: (body: DatasetTransformRequest) =>
    postJSON<WorkflowStartResponse>(`${EVO_BASE}/datasets/transform`, body),
  makeSplits: (body: DatasetMakeSplitsRequest) =>
    postJSON<WorkflowStartResponse>(`${EVO_BASE}/datasets/splits`, body),
  makeKFoldSplits: (body: DatasetMakeKFoldSplitsRequest) =>
    postJSON<WorkflowStartResponse>(`${EVO_BASE}/datasets/splits/kfold`, body),
  recordQuality: (body: DatasetQualityRequest) =>
    postJSON<WorkflowStartResponse>(`${EVO_BASE}/datasets/quality`, body),
};

export const datasetKeys = {
  all: ["datasets"] as const,
  list: () => ["datasets", "list"] as const,
  detail: (id: string) => ["datasets", "detail", id] as const,
  version: (id: string) => ["datasets", "version", id] as const,
  quality: (id: string) => ["datasets", "quality", id] as const,
};

export function useDatasets() {
  return useQuery({
    queryKey: datasetKeys.list(),
    queryFn: datasetsApi.list,
    refetchInterval: 10_000,
  });
}

export function useDatasetDetail(id: string | null) {
  return useQuery({
    queryKey: id ? datasetKeys.detail(id) : ["datasets", "detail", "_disabled"],
    queryFn: () => datasetsApi.get(id as string),
    enabled: !!id,
    refetchInterval: 5_000,
  });
}

export function useDatasetVersion(versionID: string | null) {
  return useQuery({
    queryKey: versionID
      ? datasetKeys.version(versionID)
      : ["datasets", "version", "_disabled"],
    queryFn: () => datasetsApi.getVersion(versionID as string),
    enabled: !!versionID,
  });
}

export function useDatasetQuality(id: string | null) {
  return useQuery({
    queryKey: id ? datasetKeys.quality(id) : ["datasets", "quality", "_disabled"],
    queryFn: () => datasetsApi.quality(id as string),
    enabled: !!id,
  });
}

// invalidateDatasetTrees nukes every query for one dataset (list, detail,
// quality) so a mutation only has to call this once instead of remembering
// every key shape it touches.
function invalidateDatasetTrees(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: datasetKeys.list() });
  qc.invalidateQueries({ queryKey: datasetKeys.detail(id) });
  qc.invalidateQueries({ queryKey: datasetKeys.quality(id) });
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

export function useArchiveDataset() {
  const qc = useQueryClient();
  return useMutation<{ id: string; status: string }, Error, string>({
    mutationFn: datasetsApi.archive,
    onSuccess: (_, id) => invalidateDatasetTrees(qc, id),
  });
}

export function useAddDatasetTag() {
  const qc = useQueryClient();
  return useMutation<
    { dataset_id: string; tag: string },
    Error,
    { id: string; tag: string }
  >({
    mutationFn: ({ id, tag }) => datasetsApi.addTag(id, tag),
    onSuccess: (_, { id }) => invalidateDatasetTrees(qc, id),
  });
}

export function useRemoveDatasetTag() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; tag: string }>({
    mutationFn: ({ id, tag }) => datasetsApi.removeTag(id, tag),
    onSuccess: (_, { id }) => invalidateDatasetTrees(qc, id),
  });
}

export function useImportDataset() {
  const qc = useQueryClient();
  return useMutation<DatasetImportResponse, Error, DatasetImportRequest>({
    mutationFn: datasetsApi.import,
    onSuccess: (_, req) => invalidateDatasetTrees(qc, req.dataset_id),
  });
}

export function useTransformDataset() {
  const qc = useQueryClient();
  return useMutation<WorkflowStartResponse, Error, DatasetTransformRequest>({
    mutationFn: datasetsApi.transform,
    onSuccess: (_, req) => invalidateDatasetTrees(qc, req.dataset_id),
  });
}

// Splits / kfold / quality mutations need the dataset_id to invalidate the
// right trees, but the request shapes only carry version_id. Callers pass
// the parent dataset_id alongside the request.

export function useMakeSplits() {
  const qc = useQueryClient();
  return useMutation<
    WorkflowStartResponse,
    Error,
    { datasetID: string; body: DatasetMakeSplitsRequest }
  >({
    mutationFn: ({ body }) => datasetsApi.makeSplits(body),
    onSuccess: (_, { datasetID }) => invalidateDatasetTrees(qc, datasetID),
  });
}

export function useMakeKFoldSplits() {
  const qc = useQueryClient();
  return useMutation<
    WorkflowStartResponse,
    Error,
    { datasetID: string; body: DatasetMakeKFoldSplitsRequest }
  >({
    mutationFn: ({ body }) => datasetsApi.makeKFoldSplits(body),
    onSuccess: (_, { datasetID }) => invalidateDatasetTrees(qc, datasetID),
  });
}

export function useRecordQuality() {
  const qc = useQueryClient();
  return useMutation<
    WorkflowStartResponse,
    Error,
    { datasetID: string; body: DatasetQualityRequest }
  >({
    mutationFn: ({ body }) => datasetsApi.recordQuality(body),
    onSuccess: (_, { datasetID }) => invalidateDatasetTrees(qc, datasetID),
  });
}
