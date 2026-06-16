import { UpstreamApiError } from "./errors.js";

export interface GoogleCalendarEvent {
	id: string;
	summary?: string;
	description?: string;
	htmlLink?: string;
	status?: string;
	start?: { dateTime?: string; date?: string; timeZone?: string };
	end?: { dateTime?: string; date?: string; timeZone?: string };
	extendedProperties?: {
		private?: Record<string, string>;
		shared?: Record<string, string>;
	};
}

export interface GoogleFreeBusyBlock {
	start: string;
	end: string;
}

export interface GoogleCalendarListEntry {
	id: string;
	summary: string;
	primary?: boolean;
	timeZone?: string;
}

export class GoogleCalendarClient {
	private readonly accessToken: string;
	private readonly fetcher: typeof fetch;

	constructor(accessToken: string, fetcher: typeof fetch = fetch) {
		this.accessToken = accessToken;
		this.fetcher = fetcher;
	}

	private async request<T>(
		path: string,
		options: {
			method?: "GET" | "POST" | "PATCH" | "DELETE";
			query?: Record<string, string | number | boolean | undefined>;
			body?: unknown;
		} = {},
	): Promise<T> {
		const url = new URL(`https://www.googleapis.com/calendar/v3${path}`);
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
			throw new UpstreamApiError("Google Calendar request failed", response.status, data);
		}

		return data as T;
	}

	async listCalendars(): Promise<GoogleCalendarListEntry[]> {
		const data = await this.request<{ items?: GoogleCalendarListEntry[] }>(
			"/users/me/calendarList",
		);
		return data.items ?? [];
	}

	async getPrimaryTimezone(): Promise<string | null> {
		try {
			const data = await this.request<{ value?: string }>("/users/me/settings/timezone");
			return data.value ?? null;
		} catch {
			return null;
		}
	}

	async listEvents(options: {
		calendarId?: string;
		timeMin: string;
		timeMax: string;
		maxResults?: number;
	}): Promise<GoogleCalendarEvent[]> {
		const calendarId = encodeURIComponent(options.calendarId ?? "primary");
		const data = await this.request<{ items?: GoogleCalendarEvent[] }>(
			`/calendars/${calendarId}/events`,
			{
				query: {
					timeMin: options.timeMin,
					timeMax: options.timeMax,
					singleEvents: true,
					orderBy: "startTime",
					maxResults: options.maxResults ?? 2500,
				},
			},
		);
		return data.items ?? [];
	}

	async freeBusy(options: {
		timeMin: string;
		timeMax: string;
		calendarIds?: string[];
	}): Promise<GoogleFreeBusyBlock[]> {
		const data = await this.request<{
			calendars?: Record<string, { busy?: GoogleFreeBusyBlock[] }>;
		}>("/freeBusy", {
			method: "POST",
			body: {
				timeMin: options.timeMin,
				timeMax: options.timeMax,
				items: (options.calendarIds ?? ["primary"]).map((id) => ({ id })),
			},
		});

		return Object.values(data.calendars ?? {}).flatMap((calendar) => calendar.busy ?? []);
	}

	async createEvent(options: {
		calendarId?: string;
		title: string;
		startTime: string;
		endTime: string;
		description?: string;
		extendedProperties?: Record<string, string>;
	}): Promise<GoogleCalendarEvent> {
		const calendarId = encodeURIComponent(options.calendarId ?? "primary");
		return this.request<GoogleCalendarEvent>(`/calendars/${calendarId}/events`, {
			method: "POST",
			body: {
				summary: options.title,
				description: options.description,
				start: { dateTime: options.startTime },
				end: { dateTime: options.endTime },
				extendedProperties: {
					private: options.extendedProperties,
				},
			},
		});
	}
}
