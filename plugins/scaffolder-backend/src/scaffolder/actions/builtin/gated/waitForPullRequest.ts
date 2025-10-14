/*
 * Copyright 2025 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import { TaskStore } from '../../../tasks/types';
import { WorkflowPausedError } from '../../../errors';

const id = 'gated:waitForPullRequest';

/**
 * Pauses workflow execution and waits for a pull request to be merged.
 *
 * @remarks
 *
 * This action pauses the scaffolder workflow and puts the task in a 'waiting' state
 * until the specified pull request is merged. The workflow can be resumed manually
 * or automatically via webhooks.
 *
 * @public
 */
export function createWaitForPullRequestAction(options: {
  taskStore: TaskStore;
}) {
  const { taskStore } = options;

  return createTemplateAction({
    id,
    description:
      'Pauses workflow execution and waits for a pull request to be merged.',
    examples: [
      {
        description: 'Wait for a GitHub PR to be merged',
        example: `
steps:
  - id: create-pr
    name: Create Pull Request
    action: publish:github:pull-request
    input:
      repoUrl: github.com?repo=my-repo&owner=my-org
      title: 'Add TechDocs configuration'
      description: 'This PR adds TechDocs support'

  - id: wait-for-merge
    name: Wait for PR Merge
    action: gated:waitForPullRequest
    input:
      prUrl: \${{ steps['create-pr'].output.remoteUrl }}
      provider: github

  - id: verify-docs
    name: Verify TechDocs
    action: catalog:fetch
    input:
      entityRef: \${{ parameters.componentName }}
`,
      },
    ],
    schema: {
      input: {
        prUrl: z =>
          z.string({
            description: 'The URL of the pull request to wait for.',
          }),
        provider: z =>
          z
            .enum(['github', 'gitlab', 'bitbucket', 'azure'], {
              description:
                'The SCM provider (github, gitlab, bitbucket, azure).',
            })
            .optional(),
        pollInterval: z =>
          z
            .number({
              description:
                'Interval in seconds to check PR status (for manual polling).',
            })
            .optional(),
      },
    },
    async handler(ctx) {
      const { prUrl, provider } = ctx.input;

      ctx.logger.info(`Waiting for pull request to be merged: ${prUrl}`);
      ctx.logger.info(
        'This workflow will resume automatically when the PR is merged, or you can resume it manually.',
      );

      // Pause the task
      if (!taskStore.pauseTask) {
        throw new Error(
          'pauseTask is not available on taskStore. This feature requires Backstage with gated workflow support.',
        );
      }

      await taskStore.pauseTask({
        taskId: ctx.task.id,
        reason: `Waiting for pull request to be merged: ${prUrl}`,
        metadata: {
          action: id,
          ...(ctx.step?.id && { stepId: ctx.step.id }),
          ...(ctx.step?.name && { stepName: ctx.step.name }),
          prUrl,
          provider: provider || 'unknown',
        },
      });

      // Set outputs before pausing
      ctx.output('prUrl', prUrl);
      ctx.output('waiting', true);
      ctx.output('pausedAt', new Date().toISOString());

      // Throw error to halt workflow execution
      throw new WorkflowPausedError(
        `Workflow paused - waiting for pull request to be merged: ${prUrl}`,
        {
          action: id,
          ...(ctx.step?.id && { stepId: ctx.step.id }),
          ...(ctx.step?.name && { stepName: ctx.step.name }),
          prUrl,
          provider: provider || 'unknown',
        },
      );
    },
  });
}
