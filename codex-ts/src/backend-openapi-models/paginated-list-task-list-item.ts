import type { TaskListItem } from "./task-list-item";

/**
 * Paginated list of task list items
 * Generated from OpenAPI schema
 */
export interface PaginatedListTaskListItem {
  items: TaskListItem[];
  cursor?: string;
}
