import { PubSub } from '@google-cloud/pubsub';

let pubsubClient: PubSub | null = null;

try {
  if (process.env.GCP_PROJECT || process.env.PUBSUB_EMULATOR_HOST) {
    pubsubClient = new PubSub({
      projectId: process.env.GCP_PROJECT || 'mizaniya-ai-egypt-prod',
    });
  }
} catch (e: any) {
  console.warn('PubSub initialization notice:', e.message);
}

export async function publishEvent(topicName: string, data: object): Promise<string | null> {
  if (!pubsubClient) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SERVICE_UNAVAILABLE: PubSub client not configured in production');
    }
    console.log(`[PubSub Local Log] Topic: ${topicName}`, JSON.stringify(data));
    return 'local_simulated_id';
  }

  try {
    const dataBuffer = Buffer.from(JSON.stringify(data));
    const messageId = await pubsubClient.topic(topicName).publishMessage({ data: dataBuffer });
    return messageId;
  } catch (err: any) {
    console.error(`PubSub Publish Error on ${topicName}:`, err.message);
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`SERVICE_UNAVAILABLE: Failed to publish message: ${err.message}`);
    }
    return null;
  }
}
