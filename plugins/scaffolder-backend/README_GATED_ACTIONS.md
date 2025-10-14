# Registering Gated Workflow Actions

The gated workflow actions (`gated:waitForApproval` and `gated:waitForPullRequest`) require access to the TaskStore, which means they cannot be auto-registered with the default scaffolder actions.

## Option 1: Register via Scaffolder Module (Recommended)

Create a scaffolder backend module to register these actions:

```typescript
// plugins/scaffolder-backend-module-gated-workflows/src/module.ts
import { createBackendModule } from '@backstage/backend-plugin-api';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node/alpha';
import {
  createWaitForApprovalAction,
  createWaitForPullRequestAction,
} from '@backstage/plugin-scaffolder-backend';

export const scaffolderModuleGatedWorkflows = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'gated-workflows',
  register(env) {
    env.registerInit({
      deps: {
        scaffolder: scaffolderActionsExtensionPoint,
        // Note: taskStore needs to be accessible here
      },
      async init({ scaffolder }) {
        // These actions need taskStore - see Option 2 for workaround
        console.warn(
          'Gated workflow actions require manual registration - see documentation',
        );
      },
    });
  },
});
```

## Option 2: Use Action Context Instead (Simpler)

The better approach is to make the actions work **without** requiring taskStore at creation time. Instead, have them throw a helpful error if the feature isn't enabled:

The current implementation is correct for a **future enhancement** where TaskStore methods are exposed via the action context. For now, these actions will throw an error if `pauseTask` is not available, guiding users to enable the feature properly.

## Option 3: Manual Registration in Legacy Setup

If you're using the legacy backend system with `createRouter`:

```typescript
// packages/backend/src/plugins/scaffolder.ts
import { Router } from 'express';
import {
  createRouter,
  createWaitForApprovalAction,
  createWaitForPullRequestAction,
  DatabaseTaskStore,
} from '@backstage/plugin-scaffolder-backend';

export default async function createPlugin(
  env: PluginEnvironment,
): Promise<Router> {
  // Create the task store
  const taskStore = await DatabaseTaskStore.create({
    database: env.database,
  });

  // Register gated actions with taskStore
  const gatedActions = [
    createWaitForApprovalAction({ taskStore }),
    createWaitForPullRequestAction({ taskStore }),
  ];

  return await createRouter({
    ...env,
    actions: [...defaultActions, ...gatedActions],
  });
}
```

## Current Status

**The gated actions are implemented but NOT automatically registered.** This is intentional because:

1. They require TaskStore access which isn't available during plugin initialization
2. They represent an experimental feature that should be opt-in
3. Future versions may expose pause/resume via the action context

To use them today, you must manually register them as shown in Option 3 above.
