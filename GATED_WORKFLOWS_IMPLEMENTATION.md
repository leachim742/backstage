# Gated Scaffolder Workflows - Implementation Summary

## Issue Reference

GitHub Issue: [#16622 - Feature: Gated Scaffolder Workflows](https://github.com/backstage/backstage/issues/16622)

## Implementation Overview

This implementation adds support for gated scaffolder workflows that can pause execution and wait for external events (PR merges, approvals, resource creation) before continuing.

## Changes Made

### 1. Type System Updates

#### Added 'waiting' Status

- **File**: `plugins/scaffolder-backend/src/schema/openapi.yaml`
- **Change**: Added `waiting` to TaskStatus enum
- **File**: `plugins/scaffolder-common/src/schema/openapi/generated/models/TaskStatus.model.ts`
- **Change**: Updated generated type with `waiting` status
- **File**: `plugins/scaffolder-node/src/tasks/types.ts`
- **Change**: Added `waiting` to TaskStatus type

### 2. Database Layer

#### DatabaseTaskStore Enhancement

- **File**: `plugins/scaffolder-backend/src/scaffolder/tasks/DatabaseTaskStore.ts`
- **New Methods**:
  - `pauseTask(options)`: Transitions task from `processing` to `waiting`
  - `resumeTask(options)`: Transitions task from `waiting` to `open`
- **Features**:
  - Transactions for state consistency
  - Event publishing for real-time updates
  - Validation of task states before transitions
  - Metadata support for pause reasons

#### TaskStore Interface

- **File**: `plugins/scaffolder-backend/src/scaffolder/tasks/types.ts`
- **Changes**: Added optional `pauseTask` and `resumeTask` methods to TaskStore interface

### 3. Scaffolder Actions

Created two new gated workflow actions:

#### gated:waitForApproval

- **File**: `plugins/scaffolder-backend/src/scaffolder/actions/builtin/gated/waitForApproval.ts`
- **Purpose**: Pause workflow until manual approval
- **Inputs**:
  - `reason`: Why workflow is paused
  - `approvers`: List of users/groups who can approve
  - `metadata`: Additional context data
- **Outputs**:
  - `waitingForApproval`: Boolean flag
  - `pausedAt`: ISO timestamp

#### gated:waitForPullRequest

- **File**: `plugins/scaffolder-backend/src/scaffolder/actions/builtin/gated/waitForPullRequest.ts`
- **Purpose**: Pause workflow until PR is merged
- **Inputs**:
  - `prUrl`: Pull request URL
  - `provider`: SCM provider (github, gitlab, etc.)
  - `pollInterval`: Optional polling interval
- **Outputs**:
  - `prUrl`: PR URL
  - `waiting`: Boolean flag
  - `pausedAt`: ISO timestamp

#### Index Export

- **File**: `plugins/scaffolder-backend/src/scaffolder/actions/builtin/gated/index.ts`
- **File**: `plugins/scaffolder-backend/src/scaffolder/actions/builtin/index.ts`
- **Change**: Export gated actions

### 4. API Endpoints

#### Resume Task Endpoint

- **File**: `plugins/scaffolder-backend/src/service/router.ts`
- **Endpoint**: `POST /v2/tasks/:taskId/resume`
- **Features**:
  - Permission checks (taskCreate + taskRead)
  - Status validation (must be in 'waiting' state)
  - Audit logging
  - Credential verification
- **Response**:
  ```json
  {
    "id": "task-id",
    "status": "resumed",
    "message": "Task resumed successfully and will continue execution"
  }
  ```

#### OpenAPI Specification

- **File**: `plugins/scaffolder-backend/src/schema/openapi.yaml`
- **Change**: Added `/v2/tasks/{taskId}/resume` endpoint definition

### 5. Examples and Documentation

#### Example Template

- **File**: `plugins/scaffolder-backend/sample-templates/gated-workflow-demo/template.yaml`
- **Demonstrates**:
  - Creating PR and waiting for merge
  - Waiting for manual approval
  - Chaining multiple gated steps
  - Using step outputs in gated workflows

#### Template Content

- **File**: `plugins/scaffolder-backend/sample-templates/gated-workflow-demo/content/catalog-info.yaml`
- **Purpose**: Example catalog-info.yaml for demo template

#### Comprehensive Documentation

- **File**: `plugins/scaffolder-backend/GATED_WORKFLOWS.md`
- **Contents**:
  - Feature overview
  - Use cases with examples
  - Architecture details
  - API documentation
  - Frontend integration guide
  - Testing instructions
  - Migration guide
  - Webhook integration examples
  - Future enhancements

#### Implementation Summary

- **File**: `GATED_WORKFLOWS_IMPLEMENTATION.md` (this file)

## Key Features

### 1. Pause/Resume Workflow

- Tasks can pause during execution
- State is persisted in database
- Workspace is serialized (uses BEP-0004 infrastructure)
- Secrets are retained for task resumption

### 2. Flexible Gating

- Manual approval gates
- PR merge gates
- Extensible for custom gates

### 3. Metadata Support

- Attach context to waiting tasks
- Store approval requirements
- Track PR URLs, resource IDs, etc.

### 4. Permission-Aware

- Resume requires proper permissions
- Follows existing scaffolder permission model

### 5. Event-Driven

- Publishes events on pause/resume
- Supports webhook integrations
- Real-time UI updates possible

## Architecture Decisions

### Leveraging Existing Infrastructure

- Uses BEP-0004 checkpoint system for workspace serialization
- Reuses existing task recovery mechanisms
- No new database tables required

### State Machine Design

```
┌─────┐     ┌────────────┐     ┌─────────┐
│open │────>│processing  │────>│waiting  │
└─────┘     └────────────┘     └─────────┘
                  │                  │
                  │                  │ resume
                  v                  v
            ┌──────────┐       ┌─────┐
            │completed │<──────│open │
            │failed    │       └─────┘
            │cancelled │
            └──────────┘
```

### Security Considerations

- Permission checks on resume endpoint
- Audit logging for all operations
- Secrets encrypted in database
- Token refresh handled by framework

### Scalability

- Minimal database impact
- Efficient status queries
- Workspace serialization uses existing patterns
- No polling required for status updates

## Integration Points

### Backend

1. **TaskStore**: New optional methods for pause/resume
2. **Router**: New resume endpoint
3. **Actions**: Two new gated actions
4. **Types**: Extended TaskStatus enum

### Frontend (Future Work)

1. Display waiting tasks with special indicator
2. Add resume button for authorized users
3. Show approval requirements
4. Display PR links

### Webhooks (Future Work)

1. GitHub PR merge webhook
2. GitLab merge request webhook
3. Generic approval webhook
4. Custom integration points

## Testing Strategy

### Manual Testing

1. Create template with gated actions
2. Execute and verify pause behavior
3. Test resume endpoint
4. Verify workflow continuation
5. Test permission enforcement

### Integration Testing (Recommended)

```typescript
describe('Gated Workflows', () => {
  it('should pause task on waitForApproval action', async () => {
    // Test pause functionality
  });

  it('should resume task successfully', async () => {
    // Test resume functionality
  });

  it('should enforce permissions on resume', async () => {
    // Test security
  });
});
```

## Migration Path

### Phase 1: Core Implementation ✅

- Type system updates
- Database layer changes
- Basic actions
- API endpoints

### Phase 2: UI Integration (Future)

- Task list indicators
- Resume button
- Approval workflow UI
- Status badges

### Phase 3: Automation (Future)

- Webhook handlers
- Automatic resume triggers
- Notification integrations
- Timeout configurations

## Benefits

### For Template Authors

- Create more sophisticated workflows
- Handle real-world approval processes
- Integrate with existing tools
- Better error recovery

### For Users

- Clear workflow states
- Transparent approval requirements
- Better visibility into long-running processes
- Ability to intervene when needed

### For Organizations

- Enforce governance policies
- Integrate with existing approval processes
- Audit trail of approvals
- Compliance-friendly

## Known Limitations

1. **Long-Running Tasks**: No automatic timeout for waiting tasks
2. **Token Expiration**: Very long waits may face credential issues
3. **Workspace Size**: Large workspaces impact serialization performance
4. **No UI Yet**: Requires manual API calls or custom UI

## Future Enhancements

### Short Term

1. Add timeout configuration for waiting tasks
2. Notification integration when approval needed
3. Frontend components for waiting tasks

### Medium Term

1. Webhook registry for common providers
2. Conditional resume logic
3. Approval workflow builder

### Long Term

1. Visual workflow designer with gates
2. Complex approval chains
3. SLA tracking for gated steps

## Compatibility

- **Breaking Changes**: None
- **Backward Compatible**: Yes
- **Requires Migration**: No
- **Database Changes**: No schema changes, only new enum value

## References

- GitHub Issue: [#16622](https://github.com/backstage/backstage/issues/16622)
- Related BEP: [BEP-0004 Scaffolder Task Idempotency](../../beps/0004-scaffolder-task-idempotency/README.md)
- Related BEP: [BEP-0006 Scaffolder Action Rollback](../../beps/0006-scaffolder-action-rollback/README.md)

## Important: Action Registration

**⚠️ The gated actions are implemented but NOT automatically registered in the default scaffolder setup.**

This is intentional because they require TaskStore access. See `README_GATED_ACTIONS.md` for registration instructions.

## Contributors

This implementation addresses the requirements outlined in issue #16622 and provides the foundation for long-running gated workflows in Backstage scaffolder.

## Next Steps

To complete this feature:

1. **Testing**: Add comprehensive unit and integration tests
2. **Frontend**: Implement UI components for waiting tasks
3. **Documentation**: Update main Backstage docs
4. **Examples**: Add more real-world template examples
5. **Webhooks**: Implement common webhook handlers
6. **Monitoring**: Add metrics for gated workflows

## Questions & Support

For questions about this implementation:

- Review `GATED_WORKFLOWS.md` for detailed documentation
- Check example template in `sample-templates/gated-workflow-demo/`
- Open GitHub issues with label `area:scaffolder`
