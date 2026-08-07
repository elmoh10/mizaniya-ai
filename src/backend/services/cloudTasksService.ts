import { CloudTasksClient } from '@google-cloud/tasks';

let tasksClient: CloudTasksClient | null = null;

try {
  if (process.env.GCP_PROJECT) {
    tasksClient = new CloudTasksClient();
  }
} catch (e: any) {
  console.warn('Cloud Tasks initialization notice:', e.message);
}

export async function createDelayedTask(
  queueName: string,
  url: string,
  payload: object,
  delayInSeconds = 0
): Promise<string | null> {
  if (!tasksClient || !process.env.GCP_PROJECT || !process.env.GCP_LOCATION) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SERVICE_UNAVAILABLE: Cloud Tasks client not configured in production');
    }
    console.log(`[CloudTasks Local Log] Queue: ${queueName}, Delay: ${delayInSeconds}s`, JSON.stringify(payload));
    return 'local_task_simulated';
  }

  try {
    const parent = tasksClient.queuePath(process.env.GCP_PROJECT, process.env.GCP_LOCATION, queueName);
    const task: any = {
      httpRequest: {
        httpMethod: 'POST',
        url,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      },
    };

    if (delayInSeconds > 0) {
      task.scheduleTime = {
        seconds: delayInSeconds + Math.floor(Date.now() / 1000),
      };
    }

    const [response] = await tasksClient.createTask({ parent, task });
    return response.name || null;
  } catch (err: any) {
    console.error('Cloud Tasks Error:', err.message);
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`SERVICE_UNAVAILABLE: Cloud Tasks execution failed: ${err.message}`);
    }
    return null;
  }
}
