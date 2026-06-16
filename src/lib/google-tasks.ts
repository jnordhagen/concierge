import { UpstreamApiError } from "./errors.js";

export interface GoogleTaskList {
	id: string;
	title: string;
}

export interface GoogleTask {
	id: string;
	title: string;
	notes?: string;
	status?: "needsAction" | "completed";
	due?: string;
	completed?: string;
	updated?: string;
	selfLink?: string;
}

export class GoogleTasksClient {
	private readonly accessToken: string;
	private readonly fetcher: typeof fetch;

	constructor(accessToken: string, fetcher: typeof fetch = fetch) {
		this.accessToken = accessToken;
		this.fetcher = fetcher;
	}

	private async request<T>(
		path: string,
		options: {
			method?: "GET" | "POST" | "PATCH";
			query?: Record<string, string | number | boolean | undefined>;
			body?: unknown;
		} = {},
	): Promise<T> {
		const url = new URL(`https://tasks.googleapis.com/tasks/v1${path}`);
		for (const [key, value] of Object.entries(options.query ?? {})) {
			if (value !== undefined) {
				url.searchParams.set(key, String(value));
			}
		}

		const response = await this.fetcher(url.toString(), {
			method: options.method ?? "GET",
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
				"Content-Type": "application/json",
			},
			body: options.body ? JSON.stringify(options.body) : undefined,
		});
		const data = response.headers
			.get("Content-Type")
			?.includes("application/json")
			? await response.json()
			: await response.text();

		if (!response.ok) {
			throw new UpstreamApiError("Google Tasks request failed", response.status, data);
		}

		return data as T;
	}

	async listTaskLists(): Promise<GoogleTaskList[]> {
		const data = await this.request<{ items?: GoogleTaskList[] }>("/users/@me/lists");
		return data.items ?? [];
	}

	async listTasks(options: {
		taskListId: string;
		dueMin?: string;
		dueMax?: string;
		showCompleted?: boolean;
	}): Promise<GoogleTask[]> {
		const taskListId = encodeURIComponent(options.taskListId);
		const data = await this.request<{ items?: GoogleTask[] }>(
			`/lists/${taskListId}/tasks`,
			{
				query: {
					dueMin: options.dueMin,
					dueMax: options.dueMax,
					showCompleted: options.showCompleted ?? true,
					showHidden: false,
					maxResults: 100,
				},
			},
		);
		return data.items ?? [];
	}

	async createTask(options: {
		taskListId: string;
		title: string;
		notes?: string;
		due?: string;
	}): Promise<GoogleTask> {
		const taskListId = encodeURIComponent(options.taskListId);
		return this.request<GoogleTask>(`/lists/${taskListId}/tasks`, {
			method: "POST",
			body: {
				title: options.title,
				notes: options.notes,
				due: options.due,
			},
		});
	}

	async completeTask(options: {
		taskListId: string;
		taskId: string;
	}): Promise<GoogleTask> {
		const taskListId = encodeURIComponent(options.taskListId);
		const taskId = encodeURIComponent(options.taskId);
		return this.request<GoogleTask>(`/lists/${taskListId}/tasks/${taskId}`, {
			method: "PATCH",
			body: {
				status: "completed",
				completed: new Date().toISOString(),
			},
		});
	}
}
