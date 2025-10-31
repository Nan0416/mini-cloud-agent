import { spawn, SpawnOptions } from 'child_process';
import { LoggerFactory, Metrics, MetricsContext } from '@ultrasa/dev-kit';
import { createWriteStream } from 'fs';
import { Stream } from 'stream';
import { mkdir } from 'fs/promises';
import path from 'path';
import { InternalLaunchTaskInstanceRequest } from '@ultrasa/mini-cloud-models';

const ENV_ALLOWLIST = ['SHELL', 'PATH', 'USER', 'HOME', 'PWD', 'PYTHONPATH'];

const INHERIT_ENV_VARIABLES: any = {};
for (let key of ENV_ALLOWLIST) {
  if (typeof process.env[key] === 'string') {
    INHERIT_ENV_VARIABLES[key] = process.env[key];
  }
}

const LAUNCH_TASK_INSTANCE = 'LaunchTaskInstance';
const LAUNCH_FAILURE_COUNT = 'LaunchFailure.Count';
const logger = LoggerFactory.getLogger('TaskLauncher');

export interface LaunchLocalContext {
  readonly passiveHealthCheckDuration?: number;
  readonly offlineReportPath: string;
}

export class TaskLauncher {
  private readonly metrics: Metrics;
  private readonly agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
    this.metrics = MetricsContext.getMetrics();
  }

  async launch(request: InternalLaunchTaskInstanceRequest, context: LaunchLocalContext): Promise<void> {
    logger.info(
      `launch task ${request.taskId} version ${request.version} assigned instance id ${request.taskInstanceId}` +
        ` cmd ${request.cmd} cwd ${request.cwd} stdout ${request.stdout} stderr ${request.stderr}` +
        ` arguments ${request.arguments?.join(' ')} env ${JSON.stringify(request.env)}` +
        ` passiveHealthCheckDuration ${context.passiveHealthCheckDuration}`,
    );

    const stdoutStream = await this.buildStdio(request.stdout);
    const stderrStream = await this.buildStdio(request.stderr);

    const env: { [key: string]: string } = {
      // it's necessary to supply some environment for a program to run,
      ...INHERIT_ENV_VARIABLES,
      ...request.env,
      TASK_INSTANCE_ID: request.taskInstanceId, // required by task reporter
      TASK_ID: request.taskId,
      TASK_VERSION: request.version.toString(),
      AGENT_ID: this.agentId,
      OFFLINE_REPORT_PATH: context.offlineReportPath,
    };

    if (typeof context.passiveHealthCheckDuration === 'number') {
      env['PASSIVE_HEALTH_CHECK_DURATION'] = context.passiveHealthCheckDuration.toString();
    }

    await this.metrics.asyncCall(async () => {
      const options: SpawnOptions = {
        cwd: request.cwd, // the child process working directory.
        shell: true, // shell environment can provide environment variables.

        // https://nodejs.org/api/child_process.html#child_process_options_detached
        // set stdio to ignore and detached to true for a long run process.
        // calling .unref() will let the parent process not wait for the child process.
        // stdio: ignore opens /dev/null and attach it to the child's fd
        stdio: ['ignore', stdoutStream, stderrStream],
        detached: true,
        env: env,
      };

      const childProcess = spawn(request.cmd, request.arguments ?? [], options);

      childProcess.unref();
      childProcess.on('error', (err) => {
        logger.error(`Failed to launch task task ${request.taskId} version ${request.version}.`, err);
        this.metrics.incrementCounter(LAUNCH_FAILURE_COUNT);
      });

      // the pid may not be the task pid.
      logger.info(`launched task task ${request.taskId} version ${request.version} instance id ${request.taskInstanceId} pid ${childProcess.pid}`);
    }, LAUNCH_TASK_INSTANCE);
  }

  private async buildStdio(path_?: string): Promise<'ignore' | Stream> {
    if (typeof path_ === 'string') {
      await mkdir(path.dirname(path_), { recursive: true });
      const out = createWriteStream(path_, { flags: 'a' });
      await new Promise((resolve, reject) => {
        out.on('open', () => resolve(undefined));
        out.on('error', (err) => reject(err));
      });
      return out;
    } else {
      return 'ignore';
    }
  }
}
