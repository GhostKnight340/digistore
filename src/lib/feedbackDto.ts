/**
 * Serializable DTOs for the admin Feedback area. Pure types (no DB/server-only)
 * shared by server loaders and client components. Sensitive fields (raw IP, auth
 * data) are never included.
 */

import type { FeedbackStatus, FeedbackPriority } from "./feedback";

export type FeedbackListSort = "newest" | "oldest" | "priority" | "updated";

export interface FeedbackListFilters {
  query?: string;
  type?: string;
  status?: string;
  priority?: string;
  audience?: "customer" | "guest" | "";
  attachment?: "has" | "";
  assignment?: "assigned" | "unassigned" | "";
  from?: string;
  to?: string;
  sort?: FeedbackListSort;
  page?: number;
}

export interface FeedbackListItemDTO {
  id: string;
  reference: string;
  type: string;
  subject: string;
  senderLabel: string;
  isGuest: boolean;
  relatedRoute: string | null;
  createdAt: string;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  hasAttachment: boolean;
  assignedAdminName: string | null;
}

export interface FeedbackListResult {
  items: FeedbackListItemDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FeedbackAttachmentDTO {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

export interface FeedbackNoteDTO {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface FeedbackActivityDTO {
  id: string;
  actorName: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface FeedbackDetailDTO {
  id: string;
  reference: string;
  type: string;
  subject: string;
  message: string;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  isGuest: boolean;
  customerId: string | null;
  senderName: string;
  senderEmail: string;
  contactAllowed: boolean;
  relatedUrl: string | null;
  relatedRoute: string | null;
  pageTitle: string | null;
  deviceType: string | null;
  viewport: string | null;
  browserSummary: string | null;
  deploymentVersion: string | null;
  assignedAdminId: string | null;
  assignedAdminName: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  attachments: FeedbackAttachmentDTO[];
  notes: FeedbackNoteDTO[];
  activity: FeedbackActivityDTO[];
}
