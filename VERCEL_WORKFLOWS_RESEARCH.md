# Vercel Workflows Research

## Overview

**Vercel Workflow** (also known as **Workflow DevKit** or **WDK**) is a fully managed platform that enables developers to build durable, reliable, and observable applications and AI agents using TypeScript. It's built on top of the open-source Workflow Development Kit (WDK).

**Key Value Proposition:** Transform any async TypeScript function into a durable, resumable workflow that can pause for minutes or months and resume exactly where it left off.

## Core Concepts

### 1. Workflow Functions (`"use workflow"`)

Workflow functions are the entry points that orchestrate multi-step logic over time. They are marked with the `"use workflow"` directive.

**Characteristics:**
- **Stateful**: Remember their progress and can resume execution
- **Durable**: Survive deployments, crashes, and restarts
- **Resumable**: Can pause and resume from the exact point they left off
- **Deterministic**: Use event sourcing/replay to maintain consistency

**Example:**
```typescript
export async function userSignup(email: string) {
  "use workflow";
  
  const user = await createUser(email);
  await sendWelcomeEmail(email);
  
  // Pause for 7 days without consuming resources
  await sleep("7 days");
  
  await sendOneWeekCheckInEmail(email);
  
  return { userId: user.id, status: "done" };
}
```

### 2. Step Functions (`"use step"`)

Step functions perform individual units of work within a workflow. They are marked with the `"use step"` directive.

**Characteristics:**
- **Stateless**: Each execution is independent
- **Retryable**: Built-in automatic retries for transient failures
- **Idempotent**: Should be safe to retry multiple times
- **Resilient**: Handle network errors, timeouts, and crashes gracefully

**Example:**
```typescript
export async function sendWelcomeEmail(email: string) {
  "use step";
  
  const resend = new Resend('YOUR_API_KEY');
  
  const resp = await resend.emails.send({
    from: 'Acme <onboarding@resend.dev>',
    to: [email],
    subject: 'Welcome!',
    html: `Thanks for joining Acme.`,
  });
  
  if (resp.error) {
    throw new FatalError(resp.error.message);
  }
  
  return resp;
}
```

### 3. Sleep Function

Allows workflows to pause execution for a specified duration without consuming compute resources.

**Use Cases:**
- Delayed follow-up actions (e.g., send email after 7 days)
- Scheduled tasks
- Rate limiting
- Waiting periods

**Example:**
```typescript
await sleep("7 days");
await sleep("2 hours");
await sleep(5000); // milliseconds
```

### 4. Hooks

Enable workflows to wait for external events or user interactions, pausing execution until required data is received.

**Use Cases:**
- Human-in-the-loop processes
- Waiting for webhook callbacks
- User approval workflows
- External API responses

## How It Works Technically

### Architecture

1. **Event Sourcing**: Workflows use event sourcing to record every step and decision
2. **Deterministic Replay**: When resuming, workflows replay events to reconstruct state
3. **State Persistence**: Workflow state is stored persistently (managed by Vercel)
4. **Queue System**: Uses Vercel Queues for reliable task execution
5. **Function Execution**: Leverages Vercel Functions for executing workflow and step code

### The `"use workflow"` Directive

The `"use workflow"` directive is a TypeScript/JavaScript pragma that tells the Workflow DevKit compiler to:
- Transform the function into a durable workflow
- Instrument the code to track execution state
- Enable pause/resume capabilities
- Record events for deterministic replay

**Under the Hood:**
- The WDK compiler transforms workflow functions at build time
- Execution is tracked through an event log
- State is persisted between executions
- On resume, the workflow replays events to reconstruct state

### The `"use step"` Directive

The `"use step"` directive marks functions as steps that:
- Are automatically retried on failure
- Have their results cached for idempotency
- Can be individually observed and debugged
- Are treated as atomic units of work

## Key Features

### 1. Durability
- Workflows survive deployments and crashes
- State is persisted automatically
- No manual state management required

### 2. Observability
- Built-in logs, metrics, and tracing
- View workflow execution in Vercel dashboard
- Time-travel debugging
- Step-by-step inspection

### 3. Reliability
- Automatic retries for transient failures
- Error handling and recovery
- Idempotency guarantees
- No lost work

### 4. Zero Configuration
- No queues to wire up
- No schedulers to tune
- No YAML configuration
- Works out of the box

## Integration with Next.js

Vercel Workflows integrates seamlessly with Next.js:

1. **Installation:**
   ```bash
   npm install workflow
   ```

2. **Create Workflows in API Routes:**
   ```typescript
   // app/api/workflows/user-signup/route.ts
   import { userSignup } from '@/workflows/user-signup';
   
   export async function POST(request: Request) {
     const { email } = await request.json();
     const result = await userSignup(email);
     return Response.json(result);
   }
   ```

3. **Deploy to Vercel:**
   - Workflows are automatically detected and managed
   - No additional configuration needed
   - Works with Vercel's serverless functions

## Use Cases

1. **AI Agents**: Build reliable, long-running AI agents that can pause and resume
2. **Email Campaigns**: Multi-day email sequences with delays
3. **Background Jobs**: Long-running background processing
4. **CI/CD Pipelines**: Durable build and deployment workflows
5. **Human-in-the-Loop**: Workflows that wait for user input
6. **Data Processing**: Multi-step data transformation pipelines
7. **Scheduled Tasks**: Tasks that need to run at specific times

## Benefits Over Traditional Approaches

### Without Workflows:
- Manual queue management (Redis, RabbitMQ, etc.)
- Custom retry logic
- State persistence code
- Complex error handling
- Difficult debugging
- YAML configuration files

### With Workflows:
- Simple async/await code
- Automatic retries
- Built-in state persistence
- Built-in observability
- Zero configuration
- TypeScript-first

## Pricing

During Beta:
- **Observability**: Free for all plans
- **Steps**: Billed based on usage (with included allotment per plan)
- **Storage**: Billed based on usage (with included allotment per plan)

## Resources

- **Documentation**: https://useworkflow.dev/
- **Vercel Docs**: https://vercel.com/docs/workflow
- **Video Tutorial**: [Vercel Just Made Workflows Easy](https://www.youtube.com/watch?v=sa13Pmm8aL4)

## Example: Complete Workflow

```typescript
import { sleep } from "workflow";
import { FatalError } from "workflow";

// Step: Create user
export async function createUser(email: string) {
  "use step";
  
  // Database operation with automatic retry
  const user = await db.users.create({ email });
  return user;
}

// Step: Send email
export async function sendWelcomeEmail(email: string) {
  "use step";
  
  const resend = new Resend(process.env.RESEND_API_KEY);
  const resp = await resend.emails.send({
    from: 'Acme <onboarding@resend.dev>',
    to: [email],
    subject: 'Welcome!',
    html: `Thanks for joining Acme.`,
  });
  
  if (resp.error) {
    throw new FatalError(resp.error.message);
  }
  
  return resp;
}

// Workflow: Orchestrates the steps
export async function userSignup(email: string) {
  "use workflow";
  
  // Step 1: Create user (with retry)
  const user = await createUser(email);
  
  // Step 2: Send welcome email (with retry)
  await sendWelcomeEmail(email);
  
  // Step 3: Pause for 7 days (no resources consumed)
  await sleep("7 days");
  
  // Step 4: Send follow-up email
  await sendOneWeekCheckInEmail(email);
  
  return { userId: user.id, status: "done" };
}
```

## Key Takeaways

1. **Simple API**: Just add `"use workflow"` or `"use step"` directives
2. **Automatic Durability**: No manual state management needed
3. **Built-in Observability**: Debug and monitor workflows easily
4. **Framework Agnostic**: Works with Next.js, Vite, Astro, Express, etc.
5. **Open Source**: Based on open-source WDK, portable across platforms
6. **Production Ready**: Handles failures, retries, and state persistence automatically

