# DORA — Requirements Discovery Tool
## Master Product & Technical Specification
**Version:** 1.0  
**Project type:** Educational MVP  
**Organization:** Telekom AS  
**Development environment:** Claude Code  
**Deployment target:** Railway

---

## 1. Project Overview

Build a fully functional, desktop-first web application named **Requirements Discovery Tool**, featuring a simulated business requirements discovery assistant called **DORA (Discovery-Oriented Requirements Assistant)**.

The application is an educational prototype, not a production enterprise system.

DORA guides internal business stakeholders through structured conversations to clarify analytics requests, identify underlying business problems, reduce XY-problems, and generate editable Business Requirements Documents (BRDs).

### Business Context

Preliminary interviews indicate that:

- More than 70% of Data Team time is spent handling reactive Jira requests.
- Business stakeholders frequently describe desired solutions without explaining the underlying business problems.
- Approximately 40–50% of completed tasks require revisions or rework.

These figures are preliminary research context, not validated performance metrics of the application.

### Primary Objective

Demonstrate how a structured requirements discovery assistant could improve communication between business stakeholders and a telecommunications Data Team.

### Critical Constraint

**DO NOT integrate any real LLM, AI API, or external inference service.**

DORA must use a deterministic, rule-based Mock AI engine with predefined discovery scenarios, keyword recognition, contextual response templates, state tracking, and simulated response delays.

The application itself must be functional, with persistent data and real backend operations.

---

## 2. Technology Stack

Use:

- Next.js with App Router
- TypeScript in strict mode
- Tailwind CSS
- shadcn/ui
- Lucide React
- PostgreSQL hosted on Railway
- Prisma ORM
- Next.js Route Handlers for backend APIs
- Zod for input validation
- A server-side PDF generation library compatible with the deployment environment

Use stable, mutually compatible dependency versions.

Do not add unnecessary frameworks or services.

### Environment Configuration

- Read the PostgreSQL connection string from `DATABASE_URL`.
- Include `.env.example`.
- Exclude `.env` and other secret-bearing environment files from Git.
- Never hard-code database credentials.
- Support Railway's assigned `PORT`.
- Do not require API keys for AI services.

### Railway Deployment

The project must support deployment from a GitHub repository connected to Railway.

Build command:

`prisma generate && next build`

Start command:

`prisma migrate deploy && next start`

Include migration files and clear deployment instructions.

---

## 3. User Experience and Visual Design

### General Style

Create a clean, modern, professional interface combining ChatGPT-style usability with Telekom-inspired corporate aesthetics.

Use:

- Light theme only
- White and very light gray backgrounds
- Dark slate text
- Telekom-inspired magenta as the primary accent
- Subtle borders and rounded corners
- Restrained shadows
- Clear typography
- Consistent spacing

Avoid excessive gradients, animations, decorative illustrations, or dashboard clutter.

The application language and all DORA responses must be English.

### Layout

Desktop-first, optimized for laptop screens.

The application should remain usable on narrower desktop viewports without horizontal overflow. Full mobile optimization is not required.

### Sidebar

Provide:

- DORA branding
- New Discovery button
- Discovery Sessions section
- BRD Documents section
- Settings navigation

Discovery sessions must support:

- Listing saved sessions
- Opening and continuing conversations
- Renaming sessions
- Deleting sessions with confirmation

New Discovery opens an empty chat without creating a database record. Create the session only when the first user message is submitted successfully.

Generate an initial session title from the first message, with manual renaming available.

### Chat Header

Display:

- DORA name
- Current session title
- Assistant role dropdown
- Current discovery status
- Generate BRD action

The assistant role can be changed during a conversation without resetting collected requirements.

### Chat Area

Use:

- User messages aligned right
- DORA messages aligned left
- Different bubble styling
- Message timestamps
- Scrollable conversation history
- Automatic scrolling to recent messages
- "DORA is typing..." indicator

Show the typing indicator for approximately 1.5 seconds before displaying a generated response.

### Message Input

Provide:

- Multiline text input
- Send button
- Enter to send
- Shift+Enter for a newline
- Disabled send state for empty input
- Loading state while processing
- Error feedback and retry support

Only free-text answers are allowed. Do not use multiple-choice buttons as the primary discovery interaction.

Do not implement file attachments.

### Discovery Progress

Show:

- Overall requirements completeness percentage
- Current discovery stage
- List of discovery stages
- Completed and incomplete indicators

Calculate completeness from individual required fields, not the number of exchanged messages.

---

## 4. DORA Mock AI Engine

Implement DORA as a deterministic, server-side, rule-based discovery engine.

The engine must be isolated from UI components and API route handlers.

Suggested structure:

`src/lib/mock-ai/`

Include modules for:

- Scenario classification
- Keyword and pattern recognition
- Requirements extraction
- Dialogue state management
- Question selection
- Response generation
- Progress calculation
- Role-specific behavior

### Supported Scenarios

1. Customer Churn Analysis
2. Sales Performance Dashboard
3. Network Performance / Quality
4. Generic Analytics Request

Classify the initial request using configurable keyword dictionaries and simple text patterns.

Examples:

Customer Churn:
- churn
- retention
- cancellations
- customer loss

Sales Performance:
- sales
- revenue
- conversion
- sales dashboard

Network Performance:
- network
- outage
- latency
- coverage
- dropped calls

Use the generic scenario when classification confidence is insufficient.

Avoid treating every mention of a keyword as definitive evidence of a business requirement.

### Discovery Stages

Implement six logical stages:

1. Initial Request
2. Business Problem Validation
3. Requirements Discovery
4. Requirements Clarification
5. Requirements Review
6. BRD Generation

The stages must be managed using an explicit state machine.

### Mandatory XY-Problem Validation

Every discovery session must include business problem validation, regardless of scenario.

DORA must distinguish between:

- A proposed solution
- An underlying business problem
- A business objective
- An expected business outcome

Example:

User: "I need a churn dashboard."

DORA: "What business problem are you trying to solve with this dashboard, and what decision would the information help you make?"

Do not treat the proposed dashboard as sufficient evidence of the business problem.

### Context Handling

Maintain structured requirements state for each session.

Before asking the next question:

1. Examine already collected requirements.
2. Check whether the relevant field has been populated.
3. Select the next missing or insufficiently clarified field.
4. Avoid asking questions that have already been answered.
5. Respect the mandatory discovery stages.

Use keyword rules, simple patterns, and the currently expected field to extract information.

Do not claim semantic understanding beyond the implemented rules.

### Unclear Answers

When a response is unclear:

1. Ask a clarification question.
2. Provide a short example of an acceptable answer.
3. If clarification remains unsuccessful, allow the field to be skipped.
4. Mark skipped fields as incomplete.

Prevent endless clarification loops.

### Changing Requirements

Allow the user to revise previously provided information during the conversation.

Support explicit corrections such as:

- "Actually, the KPI should be..."
- "Change the target users to..."
- "The data source is not CRM; it is..."

Update the relevant structured field when the correction can be identified reliably.

Recalculate progress.

When the correction is ambiguous, ask for clarification rather than overwriting unrelated data.

### Assistant Roles

Provide four predefined roles:

**Requirements Discovery Assistant**
- Default role
- Balanced requirements elicitation

**XY-Problem Diagnostic Agent**
- Emphasizes business problem validation
- Prioritizes questions about motivations and expected outcomes

**Data Requirements Analyst**
- Emphasizes KPIs, data sources, granularity, and data-related requirements

**BRD Generator**
- Emphasizes requirements completeness, review, and document structure

Roles modify question priorities and response templates within the same discovery engine.

Do not implement editable system prompts or prompt management.

Store the selected role per session.

### Mock AI Limitations

DORA must never:

- Claim to have called a real LLM
- Invent business facts
- Fabricate data sources
- Silently populate unknown requirements
- Pretend that keyword recognition is reliable natural-language understanding

All generated responses must originate from implemented rules and templates.

---

## 5. Requirements Data Structure

The system must track the following seven required BRD sections.

### 5.1 Business Problem
- Problem statement
- Current situation
- Business impact

### 5.2 Business Objectives
- Desired business outcome
- Expected business value

### 5.3 Stakeholders
- Requesting stakeholder or business unit
- Intended users of the analytical output

### 5.4 Functional Requirements
- Required analytical capability
- Expected output or deliverable
- Usage or reporting frequency

### 5.5 Data Requirements
- Data sources
- Required data elements or entities
- Reporting period or time range
- Data granularity

### 5.6 KPIs and Success Metrics
- Key business metrics
- Success criteria or target outcomes

### 5.7 Acceptance Criteria
- Conditions for accepting the deliverable
- Expected validation or verification criteria

Store structured field values independently of message history.

Use explicit field states:

- Missing
- Provided
- Needs Clarification
- Skipped

Only fields containing sufficiently specific information should count toward completeness.

### Progress Calculation

Calculate completeness as:

`completedRequiredFields / totalRequiredFields * 100`

The calculation must be deterministic and centralized.

A skipped or missing field does not count as completed.

Show the percentage in the chat interface and restore it after page reloads.

---

## 6. BRD Generation and Management

Each discovery session can have exactly one BRD.

The BRD must be created from the session's structured requirements, not from an unstructured concatenation of chat messages.

### Generation

Allow two entry points:

1. DORA suggests BRD generation when the requirements are sufficiently complete.
2. The user manually selects Generate BRD at any point.

If mandatory information is missing, show a warning listing the incomplete fields.

Allow the user to continue and generate a draft.

Never invent missing values. Display missing information clearly, for example as "Not specified".

### BRD Status

Support:

- Draft
- Ready for Review

A BRD becomes Ready for Review only when all required fields are complete.

This status represents requirements completeness, not formal business approval.

### BRD Editor

Open the BRD on a dedicated page.

Provide:

- Document title
- Creation and update dates
- Document status
- Source discovery session
- Seven editable BRD sections
- Save Changes button
- Regenerate BRD button
- Export PDF button
- Back to Discovery navigation

Use separate text fields or text areas for individual requirements.

Persist changes only when Save Changes is clicked.

Show unsaved-change indicators and warn before navigating away with unsaved changes.

### Regeneration Rules

When regenerating an existing BRD:

- Preserve manually edited, nonempty fields.
- Fill only empty fields from the latest discovery requirements.
- Never silently overwrite manually edited content.
- Keep the existing BRD identity.
- Recalculate document completeness and status from the effective saved content.

The application must distinguish manual edits from generated content.

### PDF Export

Generate a real downloadable PDF containing:

- Requirements Discovery Tool title
- BRD title
- Document date
- Document status
- All seven BRD sections
- Clearly marked missing information
- Page numbers
- Professional typography and spacing

Use a clean, corporate-style layout with restrained magenta accents.

Generate the PDF from the saved BRD data, including manual edits.

Do not export screenshots of the browser interface.

---

## 7. PostgreSQL and Prisma

Use Prisma with Railway PostgreSQL.

Implement at least the following entities.

### ChatSession
- id
- title
- scenario
- assistantRole
- currentStage
- createdAt
- updatedAt

### Message
- id
- sessionId
- role
- content
- createdAt

### RequirementState
- id
- sessionId (unique)
- structured field values
- field statuses
- clarification counters
- current question / expected field
- completeness percentage
- updatedAt

Structured field values and statuses may be stored using validated JSON fields.

### BusinessRequirementsDocument
- id
- sessionId (unique)
- title
- status
- structured content
- manual edit metadata
- createdAt
- updatedAt

### AppSettings
- id
- mockResponseDelayMs
- defaultAssistantRole

Use a single shared settings record for the educational demo.

Default simulated response delay: 1500 milliseconds.

### Database Requirements

- Use real PostgreSQL persistence.
- Add foreign keys and appropriate indexes.
- Use cascading deletion where appropriate.
- Ensure deleting a session also removes its messages, requirements state, and associated BRD.
- Use Prisma migrations.
- Use transactions for multi-record updates.
- Do not store application state only in browser local storage.
- Do not create sample sessions or BRDs automatically.

---

## 8. Backend API

Implement REST-style API routes for:

### Sessions
- `GET /api/chats`
- `POST /api/chats`
- `GET /api/chats/[id]`
- `PATCH /api/chats/[id]`
- `DELETE /api/chats/[id]`

### Messages
- `POST /api/chats/[id]/messages`

### Requirements
- `GET /api/chats/[id]/requirements`

### BRDs
- `GET /api/brds`
- `POST /api/chats/[id]/brd`
- `GET /api/brds/[id]`
- `PATCH /api/brds/[id]`
- `POST /api/brds/[id]/regenerate`
- `GET /api/brds/[id]/pdf`

### Settings
- `GET /api/settings`
- `PATCH /api/settings`

Use Zod validation, meaningful HTTP status codes, and consistent JSON error responses.

The first message flow must create a session and persist the initial user message without creating an empty session beforehand.

For subsequent messages:

1. Validate the request.
2. Load the session and requirements state.
3. Process the message using the Mock AI engine.
4. Persist the user message, updated requirements state, and assistant response.
5. Return the updated state and response.

The 1.5-second simulated delay should not hold a database transaction open.

Prevent duplicate message submission and overlapping processing requests.

Handle database errors gracefully.

---

## 9. Settings

Provide a simple Settings page.

Allow configuration of:

- Default DORA role
- Simulated response delay

Provide a reasonable delay range, with 1500 ms as the default.

Do not implement Temperature, Top-P, model selection, API keys, or editable system prompts.

The selected assistant role for an existing session must remain independent of changes to the default role.

---

## 10. Quality and Testing

The application must have working backend and frontend functionality.

Implement automated tests for:

- Scenario classification
- XY-problem validation
- Requirements field extraction
- Missing-field detection
- Clarification and skip behavior
- Progress calculation
- Explicit requirement corrections
- Assistant role switching
- BRD draft generation
- Preservation of manual edits during regeneration
- Session and BRD persistence

Include integration tests for critical API routes where practical.

### Critical Acceptance Scenarios

**Scenario A — New Session**
- Open New Discovery.
- Verify no database session exists yet.
- Send the first message.
- Verify a session is created and both messages are persisted.

**Scenario B — XY-Problem**
- Enter "I need a customer churn dashboard."
- Verify DORA asks about the underlying business problem.
- Verify it does not immediately assume the dashboard is the business objective.

**Scenario C — Persistence**
- Complete several discovery questions.
- Reload the browser.
- Verify messages, requirements, stage, role, and progress are restored.

**Scenario D — Draft BRD**
- Generate a BRD with incomplete requirements.
- Verify missing fields are clearly indicated.
- Verify status is Draft.

**Scenario E — Manual Editing**
- Edit a BRD field and save.
- Regenerate the BRD.
- Verify the manual edit is preserved.

**Scenario F — PDF**
- Export a BRD.
- Verify the downloaded PDF is valid and contains the saved document content.

**Scenario G — Deletion**
- Delete a discovery session.
- Verify its messages, requirements, and BRD are removed.

**Scenario H — Role Switching**
- Change DORA's role during a session.
- Verify previously collected requirements remain intact.

---

## 11. Development and Delivery Requirements

Use maintainable, modular TypeScript.

Separate:

- UI components
- API handlers
- Database access
- Mock AI rules
- Requirements state management
- BRD generation
- PDF generation

Do not implement business logic exclusively in React components.

Do not create placeholder buttons or fake persistence.

Do not introduce real AI integrations.

Provide:

- Complete application source code
- Prisma schema
- Database migrations
- `.env.example`
- README with local setup instructions
- Railway deployment instructions
- Test instructions
- Clear explanation of the Mock AI architecture

### Definition of Done

The MVP is complete when:

1. The application builds successfully.
2. Database migrations run successfully.
3. Users can create and resume discovery sessions.
4. DORA produces contextual rule-based responses.
5. Requirements progress persists across reloads.
6. BRDs can be generated and edited.
7. Manual BRD edits survive regeneration.
8. PDF export works.
9. Session deletion removes associated data.
10. The application runs on Railway with PostgreSQL.

Do not claim completion unless these behaviors have been implemented and verified.

---

## 12. Explicitly Out of Scope

- Real LLM or AI APIs
- Authentication and user accounts
- Jira integration
- File uploads
- Prompt editing
- Temperature and Top-P
- Full mobile optimization
- Multi-user collaboration
- Enterprise access controls
- Production compliance certification
- Automated business approval workflows

This is an educational prototype. Use fictional demonstration data and do not expose it as a production Telekom AS service.