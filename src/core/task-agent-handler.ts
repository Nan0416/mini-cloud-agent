import { TaskAgentClient, TaskReporterClient } from '@ultrasa/mini-cloud-models';

/**
 * Implemented by task agent, and run in task agent.
 *
 * The handler receives
 * * requests from local task instances.
 * * requests from remote task service through websocket
 */
export interface TaskAgentHandler extends TaskAgentClient, TaskReporterClient {
  init(): Promise<void>;

  terminate(): Promise<void>;
}
