import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const SERVICE_NAME = process.env.SERVICE_NAME ?? 'astro-webui';
const AWS_REGION = process.env.AWS_REGION ?? 'eu-west-1';

function createSsmClient(): SSMClient | null {
  const endpoint = process.env.AWS_SSM_ENDPOINT;
  if (!endpoint) return null;

  return new SSMClient({
    region: AWS_REGION,
    endpoint,
    ...(process.env.AWS_ACCESS_KEY_ID && {
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    }),
  });
}

const ssmClient = createSsmClient();

const DEFAULT_DESCRIPTION =
  'This application manages a greeting service. ' +
  'You can create new greetings, look up existing ones by ID, ' +
  'delete greetings, and browse all stored messages. ' +
  'It communicates with the Spring Cloud Service API backend.';

async function getParameter(name: string, fallback: string): Promise<string> {
  if (!ssmClient) return fallback;

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

export function getApiBackendUrl(): string {
  return process.env.API_BACKEND_URL ?? 'http://localhost:8080';
}
