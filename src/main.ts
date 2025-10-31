import 'source-map-support/register';
import './logger-setup';
import { enableExceptionCatpors } from '@ultrasa/dev-kit';
enableExceptionCatpors();

import { LoggerFactory } from '@ultrasa/dev-kit';
import config from './stage-config';
import { StatefulWsSubscriber, NodeSubscriberImpl } from '@ultrasa/mini-cloud-kit';
import { TaskLauncher, VariableReplacement, PassiveHealthCheckManager, PingHealthCheckManager, TaskAgentHandlerImpl, TaskClientForAgentImpl, TaskAgentHandler } from './core';
import { mkdirSync } from 'fs';
import path from 'path';
import { AxiosHttpClient } from '@ultrasa/axios-http-client';
import { AsyncHandler, TaskAgentEndpoints } from './endpoints';
import { AgentService } from './endpoints/service';
import { Server } from 'http';
import { TaskAgentRequestEvent } from '@ultrasa/mini-cloud-models';

const logger = LoggerFactory.getLogger('main-agent');

mkdirSync(config.variableReplacementConfig.stdoutDir, { recursive: true });
mkdirSync(config.variableReplacementConfig.stderrDir, { recursive: true });
mkdirSync(path.dirname(config.offlineReportPath), { recursive: true });

let httpServer: Server | undefined;
let subscriber: StatefulWsSubscriber<any> | undefined;
let taskAgentHandler: TaskAgentHandler | undefined;
process.on('SIGINT', async () => {
  logger.info('Terminating agent.');

  await subscriber?.close();
  await taskAgentHandler?.terminate();
  httpServer?.close();
  logger.info('Agent closed.');
  process.exit();
});

(async () => {
  taskAgentHandler = new TaskAgentHandlerImpl({
    agentId: config.agentId,
    agentName: config.agentName,
    client: new TaskClientForAgentImpl(new AxiosHttpClient({ baseUrl: config.serviceBaseUrl, timeout: 5000 })),
    taskLauncher: new TaskLauncher(config.agentId),
    variableReplacement: new VariableReplacement(config.variableReplacementConfig),
    passiveHealthCheckManager: new PassiveHealthCheckManager({
      toleranceBuffer: config.passiveHealthCheckToleranceBuffer,
    }),
    pingHealthCheckManager: new PingHealthCheckManager(new AxiosHttpClient({ timeout: 5000 })),
    offlineReportPath: config.offlineReportPath,
  });

  await taskAgentHandler.init();

  const asyncHandler = new AsyncHandler(config.agentId, taskAgentHandler);
  const service = new AgentService({
    taskAgentEndpoints: new TaskAgentEndpoints(taskAgentHandler),
  });

  const subscriber = new StatefulWsSubscriber(() => new NodeSubscriberImpl<TaskAgentRequestEvent>(config.websocketBaseUrl));
  await subscriber.init();
  subscriber.onEvent = (event) => asyncHandler.process(event);

  logger.info(`Initialize subscription on task topic ${config.taskTopic}`);
  await subscriber.subscribe(config.taskTopic);

  // listen to task.
  logger.info('Initialize task agent server');

  const app = service.init();
  httpServer = app.listen(config.agentPort);
  logger.info(`Agent started at port ${config.agentPort}`);
})();
