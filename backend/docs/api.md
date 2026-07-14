# AI Meeting Operator API

This app uses TanStack Start server functions as its backend API surface. Each function below is exposed through the app's RPC layer and uses the official Supabase SDK plus direct OpenAI REST calls where needed.

## Auth / Workspace

| Function | Method | Purpose |
| --- | --- | --- |
| `getCurrentWorkspace` | `GET` | Returns the authenticated user's current workspace and role. |
| `listMembers` | `GET` | Lists members for the authenticated user's workspace. |

## Projects

| Function | Method | Purpose |
| --- | --- | --- |
| `listProjects` | `GET` | Lists projects in the authenticated workspace. |
| `createProject` | `POST` | Creates a new project in the authenticated workspace. |
| `deleteProject` | `POST` | Deletes a project. |

## Meetings

| Function | Method | Purpose |
| --- | --- | --- |
| `listMeetings` | `GET` | Lists meetings in the authenticated workspace. |
| `getMeeting` | `GET` | Returns one meeting with transcript, extracted items, risks, and signed audio URL. |
| `createMeeting` | `POST` | Creates a meeting shell before upload / transcription. |
| `deleteMeeting` | `POST` | Deletes a meeting and its stored audio if present. |
| `setMeetingAudio` | `POST` | Stores the uploaded audio path and duration for a meeting. |

## Tasks / Decisions / Risks / Dashboard

| Function | Method | Purpose |
| --- | --- | --- |
| `listTasks` | `GET` | Lists action items for the workspace. |
| `createTask` | `POST` | Creates a new task. |
| `updateTask` | `POST` | Updates task fields and status. |
| `deleteTask` | `POST` | Deletes a task. |
| `listRisks` | `GET` | Lists risks for the workspace. |
| `listDecisions` | `GET` | Lists decisions for the workspace. |
| `dashboardStats` | `GET` | Returns dashboard counts and recent decisions. |

## AI / Analysis

| Function | Method | Purpose |
| --- | --- | --- |
| `transcribeMeeting` | `POST` | Downloads meeting audio from Supabase Storage and sends it to OpenAI transcription. |
| `analyzeMeeting` | `POST` | Runs meeting analysis and writes action items, decisions, and risks to Supabase. |
| `searchDecisions` | `POST` | Embeds the query with OpenAI and performs semantic search in Supabase. |

## Notes

- Authentication is handled directly through `@supabase/supabase-js`.
- No Lovable SDKs or Lovable-managed APIs remain in the application.
- Set `OPENAI_API_KEY` in the environment before using transcription, analysis, or semantic search.
