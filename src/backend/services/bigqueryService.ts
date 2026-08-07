import { BigQuery } from '@google-cloud/bigquery';

let bigqueryClient: BigQuery | null = null;

try {
  if (process.env.GCP_PROJECT) {
    bigqueryClient = new BigQuery({ projectId: process.env.GCP_PROJECT });
  }
} catch (e: any) {
  console.warn('BigQuery initialization notice:', e.message);
}

export async function insertAnalyticsEvent(
  datasetId: string,
  tableId: string,
  rows: object[]
): Promise<boolean> {
  const sanitize = (row: any) => ({
    event_type: row.eventType || row.event || 'unknown',
    category: row.category || 'general',
    amount_bucket: row.amount ? Math.floor(row.amount / 100) * 100 : 0,
    currency: row.currency || 'EGP',
    has_ai_tag: Boolean(row.aiTag),
    timestamp: new Date().toISOString(),
    anonymized_user_hash: row.userId ? 'anon_' + String(row.userId).slice(-6) : 'anonymous',
  });

  if (!bigqueryClient) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('BigQuery stream skip: client not configured in production');
      return false;
    }
    console.log(`[BigQuery Local Log] Dataset: ${datasetId}, Table: ${tableId}`, rows.length, 'rows');
    return true;
  }

  try {
    const sanitizedRows = rows.map(sanitize);
    await bigqueryClient.dataset(datasetId).table(tableId).insert(sanitizedRows);
    return true;
  } catch (err: any) {
    console.error('BigQuery Streaming Insert Error:', err.message);
    return false;
  }
}
