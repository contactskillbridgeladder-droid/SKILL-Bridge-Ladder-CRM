# SkillBridge CRM Architecture Rules

*   **Tech Stack:** Next.js (App Router), Tailwind CSS, Firebase (Auth, Firestore, Storage).
*   **Database Constraints:** Follow the exact NoSQL schema provided in the database diagram. Do not use relational joins; use Firestore native querying and sub-collections for `feedback_logs`.
*   **Authentication:** Firebase Auth must be configured to use the custom domain `auth.crm.skillbridgeladder.com`.
*   **Role-Based UI:** The app must render entirely different dashboards based on the `role` field in the user's Firestore profile (Admin, Head Editor, Editor). Editors must never see financial data or client names.
*   **Agent Action:** Build the `users` and `shorts_tasks` Firestore models first, then generate the Next.js layouts for each of the three roles.

## Database Schema (Firestore)

Collection: users
- uid (String, Primary Key)
- role (String: admin, head_editor, editor)
- sourced_by (String)
- manager_id (String, references users.uid)

Collection: parent_videos
- id (String, Primary Key)
- source_url (String) // Can be YouTube URL or Master Google Drive URL
- status (String: processing, tasks_created, completed)
- client_name (String)
- zoho_logged (Boolean, Default: false) // Toggled by Admin via manual check button

Collection: shorts_tasks
- id (String, Primary Key)
- parent_video_id (String, references parent_videos.id)
- assigned_head_id (String, references users.uid)
- assigned_editor_id (String, references users.uid)
- stage (String: editing, review_head, review_admin, client_correction, approved)
- editor_drive_link (String) // Paste destination for completed edits instead of uploading files
- timestamp_range (String)

Collection: feedback_logs (Sub-collection under shorts_tasks)
- id (String, Primary Key)
- timestamp_note (String)
- comment (String)
- tag (String: Head Correction, Admin Correction, Client Correction)

## Architecture Overview

Group 1: Users
- Admin (Full access, billing, final review)
- Head Editor (Manages editor teams, reviews drafts)
- Editor (Receives tasks, uploads drafts/Drive links)

Group 2: Frontend
- Next.js PWA (Hosted on Vercel)
- Custom Domain Auth (auth.crm.skillbridgeladder.com)

Group 3: Backend & Storage (Firebase)
- Firebase Auth
- Cloud Firestore (Database)
- Cloud Functions (Webhook triggers)

Group 4: External Services
- Gemini API (Video parsing & task generation)
- Make.com (Webhook listener)
- Zoho Books (Manual client accounting)
- Google Drive (Video asset storage)

Connections & Data Flow:
1. Admin inputs YouTube/Drive URL into Next.js PWA.
2. Next.js PWA sends URL transcript to Gemini API.
3. Gemini API generates 3 short tasks and writes to Cloud Firestore.
4. Next.js PWA triggers Cloud Functions webhook on task creation.
5. Cloud Functions sends payload to Make.com.
6. Make.com updates Zoho Books.
7. Head Editor assigns task to Editor via Cloud Firestore.
8. Editor pastes Drive video draft link.
9. Next.js PWA triggers 3-stage review pipeline in Cloud Firestore (Head Review -> Admin Review -> Client Correction).
