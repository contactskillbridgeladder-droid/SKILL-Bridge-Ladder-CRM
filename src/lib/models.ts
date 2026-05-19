export type UserRole = "admin" | "head_editor" | "editor";

export interface User {
  uid: string;
  role: UserRole;
  sourced_by?: string;
  manager_id?: string; // References users.uid
}

export type ParentVideoStatus = "processing" | "tasks_created" | "completed";

export interface ParentVideo {
  id: string;
  source_url: string; // YouTube URL or Master Google Drive URL
  status: ParentVideoStatus;
  client_name: string;
  zoho_logged: boolean;
}

export type TaskStage = "editing" | "review_head" | "review_admin" | "client_correction" | "approved";

export interface ShortsTask {
  id: string;
  parent_video_id: string; // References parent_videos.id
  assigned_head_id: string; // References users.uid
  assigned_editor_id: string; // References users.uid
  stage: TaskStage;
  editor_drive_link?: string; // Destination for completed edits
  timestamp_range?: string;
}

export type FeedbackTag = "Head Correction" | "Admin Correction" | "Client Correction";

// Sub-collection under shorts_tasks
export interface FeedbackLog {
  id: string;
  timestamp_note: string;
  comment: string;
  tag: FeedbackTag;
}
