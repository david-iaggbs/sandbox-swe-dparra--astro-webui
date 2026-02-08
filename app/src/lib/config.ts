import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const SERVICE_NAME = process.env.SERVICE_NAME ?? 'astro-webui';
const AWS_REGION = process.env.AWS_REGION ?? 'eu-west-1';

function createSsmClient(): SSMClient {
  const endpoint = process.env.AWS_SSM_ENDPOINT;
  return new SSMClient({
    region: AWS_REGION,
    ...(endpoint && { endpoint }),
  });
}

const ssmClient = createSsmClient();

const DEFAULT_DESCRIPTION =
  'This application manages a greeting service. ' +
  'You can create new greetings, look up existing ones by ID, ' +
  'delete greetings, and browse all stored messages. ' +
  'It communicates with the Spring Cloud Service API backend.';

async function getParameter(name: string, fallback: string): Promise<string> {
  try {
    const response = await ssmClient.send(
      new GetParameterCommand({ Name: `/${SERVICE_NAME}/${name}` })
    );
    return response.Parameter?.Value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function loadDescription(): Promise<string> {
  return getParameter('app.description', DEFAULT_DESCRIPTION);
}

export async function getApiBackendUrl(): Promise<string> {
  return getParameter('api.backend.url', 'http://localhost:8080');
}

export async function getApiTimeoutMs(): Promise<number> {
  const value = await getParameter('api.timeout.ms', '5000');
  return parseInt(value, 10);
}

export async function getApiRetryCount(): Promise<number> {
  const value = await getParameter('api.retry.count', '3');
  return parseInt(value, 10);
}

export async function getLogLevel(): Promise<string> {
  return getParameter('log.level', 'info');
}

export async function getRateLimitRpm(): Promise<number> {
  const value = await getParameter('rate.limit.rpm', '60');
  return parseInt(value, 10);
}
