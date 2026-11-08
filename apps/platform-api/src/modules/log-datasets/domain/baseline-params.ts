// Param judgments of the baseline reads (#1478 D-b). A refusal is a message for the engine's params judgment (`error` outcome).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Fail = { ok: false; message: string };

export const BASELINES_PARAM_KEYS = ['datasetRevisionId'] as const;
export const BASELINE_DETAIL_PARAM_KEYS = ['baselineId'] as const;

const idParam = (params: Record<string, unknown>, key: string): { ok: true; value: string } | Fail => {
  const v = params[key];
  return typeof v === 'string' && UUID.test(v) ? { ok: true, value: v.toLowerCase() } : { ok: false, message: `${key} must be a uuid string` };
};

export const parseBaselinesParams = (params: Record<string, unknown>) => idParam(params, 'datasetRevisionId');
export const parseBaselineDetailParams = (params: Record<string, unknown>) => idParam(params, 'baselineId');
