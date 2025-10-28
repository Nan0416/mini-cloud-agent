import { APPLICATION_NAME_KEY } from '@sparrow/standard-error';
import { getenv, STAGE, stage } from '@sparrow/utilities';
import path from 'path';

export interface VariableReplacementConfig {
  readonly home: string;
  readonly projectDir: string;
  readonly stdoutDir: string;
  readonly stderrDir: string;
}

export interface StageConfig {
  readonly appName: string;
  readonly serviceBaseUrl: string;
  readonly websocketBaseUrl: string;
  readonly agentPort: number;
  readonly taskTopic: string;
  readonly agentId: string;
  readonly agentName: string;
  readonly offlineReportPath: string;
  readonly variableReplacementConfig: VariableReplacementConfig;
  readonly passiveHealthCheckToleranceBuffer: number;
}

function getStageConfig(stage: STAGE): StageConfig {
  const dirPath =  getenv('MINI_CLOUD_AGENT_DIR');
  const agentId = getenv('AGENT_ID');
  const stdErrDir = path.join(dirPath, agentId, 'stderr');
  const stdOutDir = path.join(dirPath, agentId, 'stdout');
  const offlineReportPath = path.join(dirPath, agentId, 'offline-reports.reports');

  const temp = process.env['PASSIVE_HEALTH_CHECK_TOLERANCE_BUFFER'];
  let passiveHealthCheckToleranceBuffer = 2000;
  if (typeof temp === 'string') {
    passiveHealthCheckToleranceBuffer = Number(temp);
    if (Number.isNaN(passiveHealthCheckToleranceBuffer) || Math.round(passiveHealthCheckToleranceBuffer) !== passiveHealthCheckToleranceBuffer || passiveHealthCheckToleranceBuffer < 2000) {
      throw new Error(`invalid passiveHealthCheckToleranceBuffer ${temp}`);
    }
  }

  return {
    appName: getenv(APPLICATION_NAME_KEY),
    serviceBaseUrl: 'http://localhost:3000',
    websocketBaseUrl: 'ws://localhost:3050',
    agentPort: 4000,
    taskTopic: '_task',
    agentId: agentId,
    agentName: getenv('AGENT_NAME'),
    offlineReportPath: offlineReportPath,
    passiveHealthCheckToleranceBuffer: passiveHealthCheckToleranceBuffer,
    variableReplacementConfig: {
      home: dirPath,
      projectDir: dirPath,
      stderrDir: stdErrDir,
      stdoutDir: stdOutDir,
    },
  };
}

const config = getStageConfig(stage());

export default config;
