# Gated Scaffolder Workflows

## Overview

Gated Scaffolder Workflows enable templates to pause execution and wait for external events before continuing. This resolves GitHub issue [#16622](https://github.com/backstage/backstage/issues/16622).

## Features

This implementation provides:

1. **New Task Status**: `waiting` - Tasks can now be in a waiting state
2. **Pause/Resume API**: Tasks can be paused and resumed programmatically
3. **Gated Actions**: Built-in actions for common gating scenarios
4. **Checkpoint Support**: Leverages existing BEP-0004 infrastructure

## Use Cases

### Wait for Pull Request Merge

Create a PR and pause the workflow until it's merged:

```yaml
steps:
  - id: create-pr
    name: Create Pull Request
    action: publish:github:pull-request
    input:
      repoUrl: github.com?repo=my-repo&owner=my-org
      title: 'Add new component'

  - id: wait-for-merge
    name: Wait for PR Merge
    action: gated:waitForPullRequest
    input:
      prUrl: ${{ steps['create-pr'].output.remoteUrl }}
      provider: github

  - id: post-merge
    name: Post-Merge Actions
    action: catalog:register
    input:
      repoContentsUrl: ${{ steps['create-pr'].output.repoContentsUrl }}
```

### Wait for Manual Approval

Require approval before proceeding with critical operations:

```yaml
steps:
  - id: provision-resources
    name: Provision Resources
    action: terraform:apply
    input:
      workspace: production

  - id: wait-approval
    name: Wait for Production Deployment Approval
    action: gated:waitForApproval
    input:
      reason: 'Approval required for production deployment'
      approvers:
        - group:default/platform-team
        - user:default/manager

  - id: deploy
    name: Deploy to Production
    action: kubernetes:apply
    input:
      namespace: production
```

## Architecture

### Task States

The scaffolder now supports an additional task state:

```
open → processing → waiting → open → processing → (completed|failed|cancelled)
```

- **open**: Task is ready to be claimed by a worker
- **processing**: Task is currently executing
- **waiting**: Task is paused, waiting for external event
- **completed**: Task finished successfully
- **failed**: Task encountered an error
- **cancelled**: Task was cancelled

### Database Changes

The existing `tasks` table supports the new `waiting` status without schema changes:

```sql
-- Status column already supports string values
-- New value: 'waiting' is added to the enum
```

### API Endpoints

#### Resume a Waiting Task

```
POST /api/scaffolder/v2/tasks/{taskId}/resume
```

**Response:**

```json
{
  "id": "task-id",
  "status": "resumed",
  "message": "Task resumed successfully and will continue execution"
}
```

**Permissions Required:**

- `scaffolder.task.create`
- `scaffolder.task.read`

## New Actions

### `gated:waitForApproval`

Pauses workflow execution until manual approval is given.

**Inputs:**

- `reason` (string, optional): Human-readable reason for the pause
- `approvers` (array, optional): List of user/group entity refs that can approve
- `metadata` (object, optional): Additional metadata to attach

**Outputs:**

- `waitingForApproval` (boolean): Always true
- `pausedAt` (string): ISO timestamp when paused

### `gated:waitForPullRequest`

Pauses workflow execution until a PR is merged.

**Inputs:**

- `prUrl` (string, required): URL of the pull request
- `provider` (enum, optional): SCM provider (github, gitlab, bitbucket, azure)
- `pollInterval` (number, optional): Polling interval in seconds

**Outputs:**

- `prUrl` (string): The PR URL
- `waiting` (boolean): Always true
- `pausedAt` (string): ISO timestamp when paused

## Frontend Integration

### Task List View

Waiting tasks should be displayed with special indicators:

```typescript
if (task.status === 'waiting') {
  return <WaitingTaskIndicator task={task} />;
}
```

### Resume Button

Add a resume button for waiting tasks:

```typescript
const handleResume = async (taskId: string) => {
  await scaffolderApi.resumeTask(taskId);
};
```

## Implementation Details

### DatabaseTaskStore

Two new methods added:

```typescript
interface TaskStore {
  // ... existing methods

  pauseTask?(options: {
    taskId: string;
    reason?: string;
    metadata?: JsonObject;
  }): Promise<void>;

  resumeTask?(options: { taskId: string }): Promise<void>;
}
```

### WorkflowRunner

The `NunjucksWorkflowRunner` handles task pausing within action handlers. When an action calls `pauseTask`, the task status is updated to `waiting` and the workspace is serialized for later resumption.

### Task Recovery

Waiting tasks are excluded from the stale task janitor. They remain in waiting state indefinitely until:

1. Manually resumed via API
2. Resumed by webhook/automation
3. Manually cancelled

## Testing

### Manual Testing

1. Create a template with gated actions
2. Execute the template
3. Observe task enters `waiting` state
4. Call the resume endpoint
5. Verify task continues execution

### Example cURL Commands

```bash
# Resume a waiting task
curl -X POST http://localhost:7007/api/scaffolder/v2/tasks/{taskId}/resume \
  -H "Authorization: Bearer $TOKEN"

# Check task status
curl http://localhost:7007/api/scaffolder/v2/tasks/{taskId} \
  -H "Authorization: Bearer $TOKEN"
```

## Migration Guide

### For Template Authors

1. Update your templates to use the new gated actions
2. No breaking changes - existing templates continue to work

### For Plugin Developers

1. Update to the latest scaffolder packages
2. Regenerate OpenAPI types if using scaffolder-common
3. Update UI to handle `waiting` status

### For Instance Operators

1. No configuration changes required
2. Feature works out of the box
3. Optionally configure webhook integrations for automatic resume

## Webhooks and Automation

### GitHub Webhook Example

Set up a webhook to automatically resume tasks when PRs are merged:

```typescript
// Example webhook handler
app.post('/webhooks/github', async (req, res) => {
  const event = req.body;

  if (event.action === 'closed' && event.pull_request.merged) {
    const prUrl = event.pull_request.html_url;

    // Find waiting tasks for this PR
    const tasks = await taskStore.list({
      filters: { status: ['waiting'] },
    });

    for (const task of tasks.tasks) {
      const metadata = await taskStore.getTaskState({ taskId: task.id });
      if (metadata?.state?.metadata?.prUrl === prUrl) {
        await taskStore.resumeTask({ taskId: task.id });
      }
    }
  }

  res.sendStatus(200);
});
```

## Limitations

1. **Workspace Size**: Large workspaces may impact performance as they're serialized
2. **Secret Expiration**: Long-running tasks may face token expiration
3. **Database Growth**: Waiting tasks remain in database until completed

## Future Enhancements

1. **Automatic Timeout**: Configure max wait time for gated workflows
2. **Notification Integration**: Send notifications when approval is needed
3. **Conditional Resume**: Resume only if certain conditions are met
4. **Webhook Registry**: Built-in webhook handlers for common SCM providers

## Related

- BEP-0004: Scaffolder Task Idempotency
- BEP-0006: Scaffolder Action Rollback
- GitHub Issue [#16622](https://github.com/backstage/backstage/issues/16622)

## Contributing

This feature is experimental and feedback is welcome. Please:

1. Test with your use cases
2. Report issues on GitHub
3. Suggest improvements
4. Share your gated workflow templates

## Support

For questions or issues:

- Discord: #scaffolder channel
- GitHub Discussions: backstage/backstage
- GitHub Issues: Use label `area:scaffolder`
