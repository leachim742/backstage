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

const id = 'gated:waitForApproval';

/**
 * Pauses workflow execution and waits for manual approval.
 *
 * @remarks
 *
 * This action pauses the scaffolder workflow and puts the task in a 'waiting' state
 * until it is manually resumed via the API or UI. This enables gated workflows that
 * require human intervention before proceeding.
 *
 * Use cases:
 * - Waiting for PR approval and merge
 * - Requiring manager approval before resource provisioning
 * - Manual verification steps in a deployment pipeline
 *
 * @public
 */
export function createWaitForApprovalAction(options: { taskStore: TaskStore }) {
  const { taskStore } = options;

  return createTemplateAction({
    id,
    description:
      'Pauses workflow execution and waits for manual approval before continuing.',
    examples: [
      {
        description: 'Wait for approval with a custom message',
        example: `
steps:
  - id: create-pr
    name: Create Pull Request
    action: publish:github:pull-request
    input:
      repoUrl: github.com?repo=my-repo&owner=my-org
      title: 'Add new component'

  - id: wait-for-pr-merge
    name: Wait for PR Approval and Merge
    action: gated:waitForApproval
    input:
      reason: 'Waiting for pull request to be reviewed and merged'
      approvers:
        - user:default/team-lead
        - group:default/platform-team

  - id: deploy
    name: Deploy Application
    action: kubernetes:apply
    input:
      manifest: \${{ steps['create-pr'].output.prUrl }}
`,
      },
    ],
    schema: {
      input: {
        reason: z =>
          z
            .string({
              description:
                'A human-readable reason for why the workflow is paused.',
            })
            .optional(),
        approvers: z =>
          z
            .array(z.string(), {
              description:
                'Optional list of user or group entity refs that can approve this step.',
            })
            .optional(),
        metadata: z =>
          z
            .object(
              {},
              {
                description:
                  'Optional metadata to attach to the waiting task (e.g., PR URL, resource ID).',
              },
            )
            .catchall(z.any())
            .optional(),
      },
    },
    async handler(ctx) {
      const { reason, approvers, metadata } = ctx.input;

      ctx.logger.info(
        `Pausing workflow: ${reason || 'Waiting for manual approval'}`,
      );

      if (approvers && approvers.length > 0) {
        ctx.logger.info(`Approval required from: ${approvers.join(', ')}`);
      }

      // Pause the task by calling the taskStore
      if (!taskStore.pauseTask) {
        throw new Error(
          'pauseTask is not available on taskStore. This feature requires Backstage with gated workflow support.',
        );
      }

      const pauseMetadata = {
        ...metadata,
        ...(approvers && { approvers }),
        action: id,
        ...(ctx.step?.id && { stepId: ctx.step.id }),
        ...(ctx.step?.name && { stepName: ctx.step.name }),
      };

      // Set outputs BEFORE pausing so they're available after resume
      ctx.output('waitingForApproval', true);
      ctx.output('pausedAt', new Date().toISOString());

      await taskStore.pauseTask({
        taskId: ctx.task.id,
        reason,
        metadata: pauseMetadata,
      });

      // Throw error to halt workflow execution
      throw new WorkflowPausedError(
        reason || 'Workflow paused - waiting for manual approval',
        pauseMetadata,
      );
    },
  });
}
